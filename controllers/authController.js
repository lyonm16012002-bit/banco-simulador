const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// POST /api/auth/login
async function login(req, res) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    // Validación en el backend
    if (!email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios' });
    }
    const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formatoEmail.test(email)) {
      return res.status(400).json({ ok: false, mensaje: 'El correo no tiene un formato válido' });
    }

    const [filas] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    const usuario = filas[0];

    // Mismo mensaje para correo o contraseña incorrectos (no revela cuál falló)
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos' });
    }

    if (usuario.estado !== 'ACTIVO') {
      return res.status(403).json({
        ok: false,
        mensaje: `Tu usuario está ${usuario.estado.toLowerCase()}. Comunícate con el banco.`
      });
    }

    // Guardamos en la sesión solo lo necesario (nunca el hash)
    req.session.usuario = {
      id: usuario.id,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      rol: usuario.rol
    };

    const destino = usuario.rol === 'ADMIN' ? '/html/admin.html' : '/html/cliente.html';
    res.json({ ok: true, mensaje: 'Bienvenido', destino });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

// POST /api/auth/logout
// Solo cierra la sesión web; la sesión del cajero es independiente
function logout(req, res) {
  delete req.session.usuario;
  res.json({ ok: true, mensaje: 'Sesión cerrada' });
}

// GET /api/auth/me  -> datos del usuario en sesión
function me(req, res) {
  res.json({ ok: true, usuario: req.session.usuario });
}

module.exports = { login, logout, me };
