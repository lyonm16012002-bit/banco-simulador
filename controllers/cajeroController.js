const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { manejarError, retirar, ErrorNegocio } = require('../services/operaciones');

const MAX_INTENTOS_PIN = 3;

// Lee la cuenta de la sesión del cajero y comprueba que siga activa
async function cuentaActiva(req) {
  const [filas] = await pool.query(
    `SELECT c.id, c.numero_cuenta, c.tipo, c.saldo, c.estado, u.estado AS estado_usuario
       FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?`,
    [req.session.cajero.cuentaId]);
  const c = filas[0];
  if (!c) throw new ErrorNegocio('La cuenta no existe', 404);
  if (c.estado !== 'ACTIVO' || c.estado_usuario !== 'ACTIVO') {
    delete req.session.cajero;
    throw new ErrorNegocio('La cuenta no está activa, no puede realizar operaciones', 403);
  }
  return c;
}

// POST /api/cajero/login   { numero_cuenta, pin }
async function login(req, res) {
  try {
    const numero = (req.body.numero_cuenta || '').toString().trim();
    const pin = (req.body.pin || '').toString();
    if (!/^\d{6,20}$/.test(numero)) throw new ErrorNegocio('Ingresa un número de cuenta válido');
    if (!/^\d{4}$/.test(pin)) throw new ErrorNegocio('El PIN debe tener 4 dígitos');

    const [filas] = await pool.query(
      `SELECT c.id, c.numero_cuenta, c.pin_hash, c.estado, c.intentos_pin,
              u.estado AS estado_usuario, u.nombres, u.apellidos
         FROM cuentas c JOIN usuarios u ON u.id = c.usuario_id WHERE c.numero_cuenta = ?`, [numero]);
    const c = filas[0];
    if (!c) throw new ErrorNegocio('Número de cuenta o PIN incorrectos', 401);
    if (c.estado !== 'ACTIVO' || c.estado_usuario !== 'ACTIVO') {
      throw new ErrorNegocio('Esta cuenta no está activa. Comunícate con el banco.', 403);
    }

    if (!(await bcrypt.compare(pin, c.pin_hash))) {
      const intentos = c.intentos_pin + 1;
      if (intentos >= MAX_INTENTOS_PIN) {
        await pool.query("UPDATE cuentas SET intentos_pin = ?, estado = 'BLOQUEADO' WHERE id = ?", [intentos, c.id]);
        throw new ErrorNegocio('PIN incorrecto. La cuenta fue bloqueada por exceder los intentos permitidos.', 403);
      }
      await pool.query('UPDATE cuentas SET intentos_pin = ? WHERE id = ?', [intentos, c.id]);
      throw new ErrorNegocio(`Número de cuenta o PIN incorrectos. Intentos restantes: ${MAX_INTENTOS_PIN - intentos}`, 401);
    }

    await pool.query('UPDATE cuentas SET intentos_pin = 0 WHERE id = ?', [c.id]);
    req.session.cajero = { cuentaId: c.id, ultimaActividad: Date.now() };
    res.json({ ok: true, mensaje: 'Bienvenido', titular: `${c.nombres} ${c.apellidos}`, numeroCuenta: c.numero_cuenta });
  } catch (e) { manejarError(res, e); }
}

// GET /api/cajero/saldo
async function saldo(req, res) {
  try {
    const c = await cuentaActiva(req);
    res.json({ ok: true, saldo: c.saldo, numeroCuenta: c.numero_cuenta, tipo: c.tipo });
  } catch (e) { manejarError(res, e); }
}

// GET /api/cajero/movimientos  -> últimos 10
async function movimientos(req, res) {
  try {
    const c = await cuentaActiva(req);
    const [filas] = await pool.query(
      `SELECT id, fecha, tipo, descripcion, valor, saldo_resultante
         FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC, id DESC LIMIT 10`, [c.id]);
    res.json({ ok: true, movimientos: filas });
  } catch (e) { manejarError(res, e); }
}

// POST /api/cajero/retiro   { valor }
async function retiro(req, res) {
  try {
    const r = await retirar({ cuentaId: req.session.cajero.cuentaId, valor: req.body.valor });
    res.json({ ok: true, mensaje: 'Retiro realizado con éxito', nuevoSaldo: r.nuevoSaldo, valorRetirado: r.valorRetirado });
  } catch (e) {
    if (e instanceof ErrorNegocio && e.status === 403) delete req.session.cajero;
    manejarError(res, e);
  }
}

// POST /api/cajero/logout
function logout(req, res) {
  delete req.session.cajero;
  res.json({ ok: true, mensaje: 'Operación finalizada. Retira tu tarjeta.' });
}

module.exports = { login, saldo, movimientos, retiro, logout };
