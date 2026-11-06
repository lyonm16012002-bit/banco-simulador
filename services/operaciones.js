// Lógica financiera central. Todas las operaciones que mueven dinero pasan por aquí,
// dentro de una transacción y con bloqueo de filas (SELECT ... FOR UPDATE), para que
// el saldo y el movimiento nunca queden inconsistentes aunque dos operaciones coincidan.
const pool = require('../config/db');

const MONTO_MAXIMO = 999999999999; // límite razonable para DECIMAL(15,2)

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// Responde con el error adecuado (de negocio o interno)
function manejarError(res, error) {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ ok: false, mensaje: error.message });
  }
  console.error(error);
  return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
}

// Valida un valor monetario: número, mayor que cero, máximo 2 decimales
function validarMonto(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new ErrorNegocio('El valor es obligatorio');
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ErrorNegocio('El valor debe ser un número válido');
  if (n <= 0) throw new ErrorNegocio('El valor debe ser mayor que cero');
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    throw new ErrorNegocio('El valor no puede tener más de dos decimales');
  }
  if (n > MONTO_MAXIMO) throw new ErrorNegocio('El valor supera el máximo permitido');
  return Math.round(n * 100) / 100;
}

const redondear = (n) => Math.round(n * 100) / 100;

async function conTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Bloquea una cuenta (y lee el estado de su titular) hasta terminar la transacción
async function bloquearCuentaPorId(conn, id) {
  const [filas] = await conn.query(
    `SELECT c.*, u.estado AS estado_usuario
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = ? FOR UPDATE`,
    [id]
  );
  return filas[0];
}

function verificarActiva(cuenta, etiqueta) {
  const nombre = etiqueta ? `La cuenta ${etiqueta}` : 'La cuenta';
  if (!cuenta) throw new ErrorNegocio(`${nombre} no existe`, 404);
  if (cuenta.estado !== 'ACTIVO' || cuenta.estado_usuario !== 'ACTIVO') {
    throw new ErrorNegocio(`${nombre} no está activa, no puede realizar operaciones`, 403);
  }
}

async function registrarMovimiento(conn, { cuentaId, tipo, descripcion, valor, saldoResultante, transferenciaId = null }) {
  await conn.query(
    `INSERT INTO movimientos (cuenta_id, tipo, descripcion, valor, saldo_resultante, transferencia_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cuentaId, tipo, descripcion, valor, saldoResultante, transferenciaId]
  );
}

// ---------- CONSIGNACIÓN (la hace el administrador) ----------
async function consignar({ numeroCuenta, valor, descripcion }) {
  const monto = validarMonto(valor);
  if (!/^\d{6,20}$/.test(String(numeroCuenta || ''))) {
    throw new ErrorNegocio('Número de cuenta inválido');
  }
  return conTransaccion(async (conn) => {
    const [ids] = await conn.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numeroCuenta]);
    if (!ids[0]) throw new ErrorNegocio('La cuenta no existe', 404);
    const cuenta = await bloquearCuentaPorId(conn, ids[0].id);
    verificarActiva(cuenta, 'destino');

    const nuevoSaldo = redondear(cuenta.saldo + monto);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [nuevoSaldo, cuenta.id]);
    const nota = (descripcion || '').toString().trim().slice(0, 80);
    await registrarMovimiento(conn, {
      cuentaId: cuenta.id,
      tipo: 'CONSIGNACION',
      descripcion: nota ? `Consignación - ${nota}` : 'Consignación en oficina',
      valor: monto,
      saldoResultante: nuevoSaldo
    });
    return { nuevoSaldo, numeroCuenta: cuenta.numero_cuenta };
  });
}

// ---------- RETIRO (cajero automático) ----------
async function retirar({ cuentaId, valor }) {
  const monto = validarMonto(valor);
  return conTransaccion(async (conn) => {
    const cuenta = await bloquearCuentaPorId(conn, cuentaId);
    verificarActiva(cuenta, '');
    if (cuenta.saldo < monto) throw new ErrorNegocio('Saldo insuficiente para realizar el retiro');

    const nuevoSaldo = redondear(cuenta.saldo - monto);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [nuevoSaldo, cuenta.id]);
    await registrarMovimiento(conn, {
      cuentaId: cuenta.id,
      tipo: 'RETIRO_CAJERO',
      descripcion: 'Retiro cajero',
      valor: -monto,
      saldoResultante: nuevoSaldo
    });
    return { nuevoSaldo, valorRetirado: monto };
  });
}

// ---------- TRANSFERENCIA (banca virtual del cliente) ----------
async function transferir({ usuarioId, cuentaOrigenId, numeroDestino, monto: valor, descripcion }) {
  const monto = validarMonto(valor);
  if (!/^\d{6,20}$/.test(String(numeroDestino || ''))) {
    throw new ErrorNegocio('El número de cuenta destino no es válido');
  }
  return conTransaccion(async (conn) => {
    // La cuenta origen debe pertenecer al usuario de la sesión
    const [origenes] = await conn.query(
      'SELECT id FROM cuentas WHERE id = ? AND usuario_id = ?',
      [cuentaOrigenId, usuarioId]
    );
    if (!origenes[0]) throw new ErrorNegocio('La cuenta de origen no existe o no te pertenece', 404);

    const [destinos] = await conn.query('SELECT id FROM cuentas WHERE numero_cuenta = ?', [numeroDestino]);
    if (!destinos[0]) throw new ErrorNegocio('La cuenta destino no existe', 404);
    if (destinos[0].id === origenes[0].id) {
      throw new ErrorNegocio('No puedes transferir a la misma cuenta');
    }

    // Se bloquean siempre en el mismo orden (id menor primero) para evitar bloqueos mutuos
    const [idA, idB] = [origenes[0].id, destinos[0].id].sort((a, b) => a - b);
    const cuentaA = await bloquearCuentaPorId(conn, idA);
    const cuentaB = await bloquearCuentaPorId(conn, idB);
    const origen = cuentaA.id === origenes[0].id ? cuentaA : cuentaB;
    const destino = cuentaA.id === origenes[0].id ? cuentaB : cuentaA;

    verificarActiva(origen, 'origen');
    verificarActiva(destino, 'destino');
    if (origen.saldo < monto) throw new ErrorNegocio('Saldo insuficiente para realizar la transferencia');

    const saldoOrigen = redondear(origen.saldo - monto);
    const saldoDestino = redondear(destino.saldo + monto);
    const nota = (descripcion || '').toString().trim().slice(0, 60);

    const [t] = await conn.query(
      'INSERT INTO transferencias (cuenta_origen_id, cuenta_destino_id, monto, descripcion) VALUES (?, ?, ?, ?)',
      [origen.id, destino.id, monto, nota || null]
    );
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoOrigen, origen.id]);
    await conn.query('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoDestino, destino.id]);

    await registrarMovimiento(conn, {
      cuentaId: origen.id,
      tipo: 'TRANSFERENCIA_ENVIADA',
      descripcion: `Transferencia a cuenta ${destino.numero_cuenta}${nota ? ' - ' + nota : ''}`,
      valor: -monto,
      saldoResultante: saldoOrigen,
      transferenciaId: t.insertId
    });
    await registrarMovimiento(conn, {
      cuentaId: destino.id,
      tipo: 'TRANSFERENCIA_RECIBIDA',
      descripcion: `Transferencia de cuenta ${origen.numero_cuenta}${nota ? ' - ' + nota : ''}`,
      valor: monto,
      saldoResultante: saldoDestino,
      transferenciaId: t.insertId
    });
    return { nuevoSaldo: saldoOrigen, transferenciaId: t.insertId };
  });
}

module.exports = {
  ErrorNegocio, manejarError, validarMonto, conTransaccion,
  consignar, retirar, transferir
};
