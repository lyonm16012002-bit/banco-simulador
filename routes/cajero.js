const express = require('express');
const router = express.Router();
const c = require('../controllers/cajeroController');
const { requireCajero } = require('../middleware/auth');

router.post('/login', c.login);
router.post('/logout', c.logout);
router.get('/saldo', requireCajero, c.saldo);
router.get('/movimientos', requireCajero, c.movimientos);
router.post('/retiro', requireCajero, c.retiro);

module.exports = router;
