const express = require('express');
const optionListController = require('../controllers/optionListController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authMiddleware, optionListController.listAll);
router.get('/:key', authMiddleware, optionListController.getOne);
router.put('/:key', authMiddleware, adminOnly, optionListController.replace);
router.post('/:key', authMiddleware, adminOnly, optionListController.add);
router.patch('/:key', authMiddleware, adminOnly, optionListController.update);
router.delete('/:key', authMiddleware, adminOnly, optionListController.remove);
router.post('/:key/reset', authMiddleware, adminOnly, optionListController.reset);

module.exports = router;
