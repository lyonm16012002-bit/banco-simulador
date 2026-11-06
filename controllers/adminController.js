const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { manejarError, consignar, conTransaccion, validarMonto, ErrorNegocio } = require('../services/operaciones');

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_TELEFONO = /^[0-9+\s-]{7,20}$/;
const ESTADOS = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'];

// Valida y normaliza los datos personales de un cliente (crear / editar)
function validarDatosCliente(b) {
  const d = {
    nombres: (b.nombres || '').trim(),
    apellidos: (b.apellidos || '').trim(),
    email: (b.email || '').trim().toLowerCase(),
    telefono: (b.telefono || '').trim(),
    direccion: (b.direccion || '').trim()
  };
  if (!d.nombres || d.nombres.length > 80) throw new ErrorNegocio('Los nombres son obligatorios (máx. 80 caracteres)');
  if (!d.apellidos || d.apellidos.length > 80) throw new ErrorNegocio('Los apellidos son obligatorios (máx. 80 caracteres)');
  if (!FORMATO_EMAIL.test(d.email) || d.email.length > 120) throw new ErrorNegocio('El correo no tiene un formato válido');
  if (d.telefono && !FORMATO_TELEFONO.test(d.telefono)) throw new ErrorNegocio('El teléfono no es válido (7 a 20 dígitos)');
  if (d.direccion.length > 150) throw new ErrorNegocio('La dirección no puede superar 150 caracteres');
  return d;
}

function errorDuplicado(error) {
  if (error.code !== 'ER_DUP_ENTRY') return null;
  if (/documento/.test(error.message)) return new ErrorNegocio('Ya existe un usuario con ese documento', 409);
  if (/email/.test(error.message)) return new ErrorNegocio('Ya existe un usuario con ese correo', 409);
  return new ErrorNegocio('El registro ya existe', 409);
}

// GET /api/admin/dashboard
async function dashboard(req, res) {
  try {
    const [[c]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(estado = 'ACTIVO'), 0)    AS activos,
              COALESCE(SUM(estado = 'INACTIVO'), 0)  AS inactivos,
              COALESCE(SUM(estado = 'BLOQUEADO'), 0) AS bloqueados
         FROM usuarios WHERE rol = 'CLIENTE'`);
    const [[k]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(estado = 'ACTIVO'), 0) AS activas,
              COALESCE(SUM(saldo), 0) AS saldo_total
         FROM cuentas`);
    res.json({
      ok: true,
      clientes: { total: Number(c.total), activos: Number(c.activos), inactivos: Number(c.inactivos), bloqueados: Number(c.bloqueados) },
      cuentas: { total: Number(k.total), activas: Number(k.activas) },
      saldoTotal: Number(k.saldo_total)
    });
  } catch (e) { manejarError(res, e); }
}

// GET /api/admin/clientes?q=
async function listarClientes(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const like = `%${q}%`;
    const [filas] = await pool.query(
      `SELECT u.id, u.documento, u.nombres, u.apellidos, u.email, u.telefono, u.estado,
              COUNT(c.id) AS cuentas, COALESCE(SUM(c.saldo), 0) AS saldo_total
         FROM usuarios u LEFT JOIN cuentas c ON c.usuario_id = u.id
        WHERE u.rol = 'CLIENTE'
          AND (? = '' OR u.documento LIKE ? OR u.nombres LIKE ? OR u.apellidos LIKE ?
               OR u.email LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?
               OR EXISTS (SELECT 1 FROM cuentas x WHERE x.usuario_id = u.id AND x.numero_cuenta LIKE ?))
        GROUP BY u.id ORDER BY u.id DESC`,
      [q, like, like, like, like, like, like]);
    res.json({ ok: true, clientes: filas });
  } catch (e) { manejarError(res, e); }
}

// GET /api/admin/clientes/:id
async function detalleCliente(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const [u] = await pool.query(
      `SELECT id, documento, nombres, apellidos, email, telefono, direccion, estado, creado_en
         FROM usuarios WHERE id = ? AND rol = 'CLIENTE'`, [id]);
    if (!u[0]) throw new ErrorNegocio('Cliente no encontrado', 404);
    const [cuentas] = await pool.query(
      'SELECT id, numero_cuenta, tipo, saldo, estado, creado_en FROM cuentas WHERE usuario_id = ? ORDER BY id', [id]);
    res.json({ ok: true, cliente: u[0], cuentas });
  } catch (e) { manejarError(res, e); }
}

// POST /api/admin/clientes  -> crea el usuario y su cuenta (con PIN para el cajero)
async function crearCliente(req, res) {
  try {
    const d = validarDatosCliente(req.body);
    const documento = (req.body.documento || '').trim();
    const password = req.body.password || '';
    const pin = (req.body.pin || '').toString();
    const tipo = req.body.tipo_cuenta === 'CORRIENTE' ? 'CORRIENTE' : 'AHORROS';
    const saldoInicial = req.body.saldo_inicial === undefined || String(req.body.saldo_inicial).trim() === ''
      ? 0 : Number(req.body.saldo_inicial);

    if (!/^\d{5,20}$/.test(documento)) throw new ErrorNegocio('El documento debe tener entre 5 y 20 dígitos');
    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new ErrorNegocio('La contraseña debe tener mínimo 8 caracteres con letras y números');
    }
    if (!/^\d{4}$/.test(pin)) throw new ErrorNegocio('El PIN debe tener exactamente 4 dígitos');
    if (!Number.isFinite(saldoInicial) || saldoInicial < 0) throw new ErrorNegocio('El saldo inicial no es válido');
    if (saldoInicial > 0) validarMonto(saldoInicial);

    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = await bcrypt.hash(pin, 10);

    const resultado = await conTransaccion(async (conn) => {
      const [u] = await conn.query(
        `INSERT INTO usuarios (documento, nombres, apellidos, email, telefono, direccion, password_hash, rol)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CLIENTE')`,
        [documento, d.nombres, d.apellidos, d.email, d.telefono || null, d.direccion || null, passwordHash]);

      const [[ult]] = await conn.query(
        "SELECT COALESCE(MAX(CAST(numero_cuenta AS UNSIGNED)), 1001000000) AS ultimo FROM cuentas");
      const numeroCuenta = String(Number(ult.ultimo) + 1);

      const [c] = await conn.query(
        'INSERT INTO cuentas (numero_cuenta, usuario_id, tipo, saldo, pin_hash) VALUES (?, ?, ?, ?, ?)',
        [numeroCuenta, u.insertId, tipo, saldoInicial, pinHash]);
      if (saldoInicial > 0) {
        await conn.query(
          `INSERT INTO movimientos (cuenta_id, tipo, descripcion, valor, saldo_resultante)
           VALUES (?, 'CONSIGNACION', 'Consignación inicial', ?, ?)`,
          [c.insertId, saldoInicial, saldoInicial]);
      }
      return { id: u.insertId, numeroCuenta };
    });
    res.status(201).json({ ok: true, mensaje: 'Cliente creado correctamente', ...resultado });
  } catch (e) { manejarError(res, errorDuplicado(e) || e); }
}

// PUT /api/admin/clientes/:id  -> datos personales (el documento no se edita)
async function editarCliente(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const d = validarDatosCliente(req.body);
    const [r] = await pool.query(
      `UPDATE usuarios SET nombres = ?, apellidos = ?, email = ?, telefono = ?, direccion = ?
        WHERE id = ? AND rol = 'CLIENTE'`,
      [d.nombres, d.apellidos, d.email, d.telefono || null, d.direccion || null, id]);
    if (!r.affectedRows) throw new ErrorNegocio('Cliente no encontrado', 404);
    res.json({ ok: true, mensaje: 'Cliente actualizado correctamente' });
  } catch (e) { manejarError(res, errorDuplicado(e) || e); }
}

// PATCH /api/admin/clientes/:id/estado  -> habilita / bloquea / inactiva (usuario y sus cuentas)
async function cambiarEstado(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const estado = req.body.estado;
    if (!ESTADOS.includes(estado)) throw new ErrorNegocio('Estado inválido');
    await conTransaccion(async (conn) => {
      const [r] = await conn.query("UPDATE usuarios SET estado = ? WHERE id = ? AND rol = 'CLIENTE'", [estado, id]);
      if (!r.affectedRows) throw new ErrorNegocio('Cliente no encontrado', 404);
      await conn.query('UPDATE cuentas SET estado = ?, intentos_pin = 0 WHERE usuario_id = ?', [estado, id]);
    });
    res.json({ ok: true, mensaje: `Cliente ${estado.toLowerCase()} correctamente` });
  } catch (e) { manejarError(res, e); }
}

// GET /api/admin/cuentas?q=
async function listarCuentas(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const like = `%${q}%`;
    const [filas] = await pool.query(
      `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado,
              u.id AS usuario_id, u.nombres, u.apellidos, u.documento
         FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id
        WHERE ? = '' OR c.numero_cuenta LIKE ? OR u.documento LIKE ?
              OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?
        ORDER BY c.id`, [q, like, like, like]);
    res.json({ ok: true, cuentas: filas });
  } catch (e) { manejarError(res, e); }
}

// POST /api/admin/consignaciones
async function crearConsignacion(req, res) {
  try {
    const r = await consignar({
      numeroCuenta: (req.body.numero_cuenta || '').toString().trim(),
      valor: req.body.valor,
      descripcion: req.body.descripcion
    });
    res.json({ ok: true, mensaje: 'Consignación realizada con éxito', nuevoSaldo: r.nuevoSaldo, numeroCuenta: r.numeroCuenta });
  } catch (e) { manejarError(res, e); }
}

// GET /api/admin/movimientos?q=&tipo=
async function listarMovimientos(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const like = `%${q}%`;
    const tipo = (req.query.tipo || '').trim();
    const [filas] = await pool.query(
      `SELECT m.id, m.fecha, m.tipo, m.descripcion, m.valor, m.saldo_resultante,
              c.numero_cuenta, CONCAT(u.nombres, ' ', u.apellidos) AS titular
         FROM movimientos m
         JOIN cuentas c ON c.id = m.cuenta_id
         JOIN usuarios u ON u.id = c.usuario_id
        WHERE (? = '' OR c.numero_cuenta LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ? OR m.descripcion LIKE ?)
          AND (? = '' OR m.tipo = ?)
        ORDER BY m.fecha DESC, m.id DESC LIMIT 300`,
      [q, like, like, like, tipo, tipo]);
    res.json({ ok: true, movimientos: filas });
  } catch (e) { manejarError(res, e); }
}

module.exports = {
  dashboard, listarClientes, detalleCliente, crearCliente, editarCliente,
  cambiarEstado, listarCuentas, crearConsignacion, listarMovimientos
};
