const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { manejarError, transferir, ErrorNegocio } = require('../services/operaciones');

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_TELEFONO = /^[0-9+\s-]{7,20}$/;

// GET /api/cliente/perfil  -> datos personales y cuentas (solo las del usuario en sesión)
async function perfil(req, res) {
  try {
    const id = req.session.usuario.id;
    const [usuarios] = await pool.query(
      `SELECT id, documento, nombres, apellidos, email, telefono, direccion, estado, creado_en
         FROM usuarios WHERE id = ?`, [id]);
    const [cuentas] = await pool.query(
      `SELECT id, numero_cuenta, tipo, saldo, estado FROM cuentas WHERE usuario_id = ? ORDER BY id`, [id]);
    res.json({ ok: true, usuario: usuarios[0], cuentas });
  } catch (e) { manejarError(res, e); }
}

// GET /api/cliente/movimientos?cuenta_id=
async function movimientos(req, res) {
  try {
    const usuarioId = req.session.usuario.id;
    let cuentaId = parseInt(req.query.cuenta_id, 10);
    if (!cuentaId) {
      const [primera] = await pool.query('SELECT id FROM cuentas WHERE usuario_id = ? ORDER BY id LIMIT 1', [usuarioId]);
      if (!primera[0]) return res.json({ ok: true, movimientos: [] });
      cuentaId = primera[0].id;
    }
    // Un cliente solo puede ver movimientos de sus propias cuentas
    const [propia] = await pool.query('SELECT id FROM cuentas WHERE id = ? AND usuario_id = ?', [cuentaId, usuarioId]);
    if (!propia[0]) throw new ErrorNegocio('La cuenta no existe o no te pertenece', 404);

    const [filas] = await pool.query(
      `SELECT id, fecha, tipo, descripcion, valor, saldo_resultante
         FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC, id DESC LIMIT 200`, [cuentaId]);
    res.json({ ok: true, movimientos: filas });
  } catch (e) { manejarError(res, e); }
}

// PUT /api/cliente/perfil  -> solo correo, teléfono y dirección (nunca saldo, rol ni estado)
async function actualizarPerfil(req, res) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const telefono = (req.body.telefono || '').trim();
    const direccion = (req.body.direccion || '').trim();

    if (!FORMATO_EMAIL.test(email) || email.length > 120) throw new ErrorNegocio('El correo no tiene un formato válido');
    if (telefono && !FORMATO_TELEFONO.test(telefono)) throw new ErrorNegocio('El teléfono no es válido (7 a 20 dígitos)');
    if (direccion.length > 150) throw new ErrorNegocio('La dirección no puede superar 150 caracteres');

    try {
      await pool.query(
        'UPDATE usuarios SET email = ?, telefono = ?, direccion = ? WHERE id = ?',
        [email, telefono || null, direccion || null, req.session.usuario.id]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new ErrorNegocio('Ese correo ya está registrado por otro usuario', 409);
      throw error;
    }
    res.json({ ok: true, mensaje: 'Perfil actualizado correctamente' });
  } catch (e) { manejarError(res, e); }
}

// PUT /api/cliente/password
async function cambiarPassword(req, res) {
  try {
    const { actual = '', nueva = '', confirmacion = '' } = req.body;
    if (!actual || !nueva || !confirmacion) throw new ErrorNegocio('Todos los campos son obligatorios');
    if (nueva.length < 8 || nueva.length > 72) throw new ErrorNegocio('La nueva contraseña debe tener entre 8 y 72 caracteres');
    if (!/[A-Za-z]/.test(nueva) || !/[0-9]/.test(nueva)) throw new ErrorNegocio('La nueva contraseña debe incluir letras y números');
    if (nueva !== confirmacion) throw new ErrorNegocio('La confirmación no coincide con la nueva contraseña');
    if (nueva === actual) throw new ErrorNegocio('La nueva contraseña debe ser diferente a la actual');

    const [filas] = await pool.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    if (!filas[0] || !(await bcrypt.compare(actual, filas[0].password_hash))) {
      throw new ErrorNegocio('La contraseña actual es incorrecta', 400);
    }
    const hash = await bcrypt.hash(nueva, 10);
    await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.session.usuario.id]);
    res.json({ ok: true, mensaje: 'Contraseña cambiada correctamente' });
  } catch (e) { manejarError(res, e); }
}

// POST /api/cliente/transferencias
async function crearTransferencia(req, res) {
  try {
    const r = await transferir({
      usuarioId: req.session.usuario.id,
      cuentaOrigenId: parseInt(req.body.cuenta_origen_id, 10),
      numeroDestino: (req.body.numero_destino || '').toString().trim(),
      monto: req.body.monto,
      descripcion: req.body.descripcion
    });
    res.json({ ok: true, mensaje: 'Transferencia realizada con éxito', nuevoSaldo: r.nuevoSaldo });
  } catch (e) { manejarError(res, e); }
}

module.exports = { perfil, movimientos, actualizarPerfil, cambiarPassword, crearTransferencia };
