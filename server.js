require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./config/db');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesiones (la cookie guarda solo un identificador; los datos quedan en el servidor)
app.use(session({
  secret: process.env.SESSION_SECRET || 'secreto_de_desarrollo',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 30 } // 30 minutos
}));

app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cliente', require('./routes/cliente'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/cajero', require('./routes/cajero'));

// Prueba de conexión
app.get('/api/salud', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS usuarios FROM usuarios');
    res.json({ ok: true, mensaje: 'Servidor y base de datos funcionando', usuarios: rows[0].usuarios });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: 'Error conectando con la base de datos' });
  }
});

// La raíz lleva al login
app.get('/', (req, res) => res.redirect('/html/login.html'));

// Rutas de API inexistentes y errores generales (por ejemplo, JSON mal formado)
app.use('/api', (req, res) => res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, mensaje: 'La solicitud no tiene un formato válido' });
  }
  console.error(error);
  res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
