const express = require('express');
const router = express.Router();
const c = require('../controllers/clienteController');
const { requireRol } = require('../middleware/auth');

router.use(requireRol('CLIENTE'));
router.get('/perfil', c.perfil);
router.put('/perfil', c.actualizarPerfil);
router.put('/password', c.cambiarPassword);
router.get('/movimientos', c.movimientos);
router.post('/transferencias', c.crearTransferencia);

module.exports = router;
