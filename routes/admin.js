const express = require('express');
const router = express.Router();
const a = require('../controllers/adminController');
const { requireRol } = require('../middleware/auth');

router.use(requireRol('ADMIN'));
router.get('/dashboard', a.dashboard);
router.get('/clientes', a.listarClientes);
router.post('/clientes', a.crearCliente);
router.get('/clientes/:id', a.detalleCliente);
router.put('/clientes/:id', a.editarCliente);
router.patch('/clientes/:id/estado', a.cambiarEstado);
router.get('/cuentas', a.listarCuentas);
router.post('/consignaciones', a.crearConsignacion);
router.get('/movimientos', a.listarMovimientos);

module.exports = router;
