const express = require('express');
const mailController = require('../controllers/mailController');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

/** /api/mail/* — vacancies/:id bilen garyşmaz (operator IP / HTTPS üçin durnukly) */
router.get('/status', authMiddleware, mailController.status);
router.post('/login', authMiddleware, mailController.login);
router.post('/logout', authMiddleware, mailController.logout);
router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'mail API OK', routes: ['/status', '/login', '/logout'] });
});

module.exports = router;
