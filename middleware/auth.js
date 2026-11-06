// Middlewares de autenticación y roles
const pool = require('../config/db');

const INACTIVIDAD_CAJERO_MS = 2 * 60 * 1000; // el cajero se cierra tras 2 min sin uso

// Exige sesión y comprueba en la base de datos que el usuario siga ACTIVO:
// si el administrador bloquea a alguien que ya tiene sesión, pierde el acceso de inmediato.
async function requireLogin(req, res, next) {
  const sesion = req.session.usuario;
  if (!sesion) {
    return res.status(401).json({ ok: false, sesion: false, mensaje: 'Debes iniciar sesión' });
  }
  try {
    const [filas] = await pool.query('SELECT estado, rol FROM usuarios WHERE id = ?', [sesion.id]);
    if (!filas[0] || filas[0].estado !== 'ACTIVO') {
      delete req.session.usuario;
      return res.status(403).json({ ok: false, sesion: false, mensaje: 'Tu usuario no está activo. Comunícate con el banco.' });
    }
    sesion.rol = filas[0].rol;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

function requireRol(rol) {
  return (req, res, next) =>
    requireLogin(req, res, () => {
      if (req.session.usuario.rol !== rol) {
        return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para esta acción' });
      }
      next();
    });
}

// Sesión del cajero automático (independiente de la banca virtual)
function requireCajero(req, res, next) {
  const cajero = req.session.cajero;
  if (!cajero) {
    return res.status(401).json({ ok: false, mensaje: 'Debes identificarte en el cajero' });
  }
  if (Date.now() - cajero.ultimaActividad > INACTIVIDAD_CAJERO_MS) {
    delete req.session.cajero;
    return res.status(401).json({ ok: false, mensaje: 'La sesión del cajero expiró por inactividad' });
  }
  cajero.ultimaActividad = Date.now();
  next();
}

module.exports = { requireLogin, requireRol, requireCajero };
