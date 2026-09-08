const express = require('express');
const contractController = require('../controllers/contractController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authMiddleware, contractController.getAll);
router.get('/:id/print', authMiddleware, contractController.getPrintData);
router.get('/:id', authMiddleware, contractController.getById);
router.post('/from-anketa/:anketaId', authMiddleware, contractController.createFromAnketa);
router.put('/:id', authMiddleware, contractController.update);
router.patch('/:id/sign', authMiddleware, contractController.sign);
router.delete('/:id', authMiddleware, adminOnly, contractController.remove);

module.exports = router;
