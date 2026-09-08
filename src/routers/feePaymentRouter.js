const express = require('express');
const feePaymentController = require('../controllers/feePaymentController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authMiddleware, adminOnly, feePaymentController.list);
router.get('/anketa/:anketaId', authMiddleware, adminOnly, feePaymentController.getByAnketa);
router.post('/anketa/:anketaId', authMiddleware, adminOnly, feePaymentController.addPayment);
router.delete('/:id', authMiddleware, adminOnly, feePaymentController.removePayment);

module.exports = router;
