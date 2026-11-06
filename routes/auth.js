const express = require('express');
const router = express.Router();
const { login, logout, me } = require('../controllers/authController');
const { requireLogin } = require('../middleware/auth');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireLogin, me);

module.exports = router;
