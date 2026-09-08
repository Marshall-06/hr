const express = require('express');
const commentController = require('../controllers/commentController');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authMiddleware, commentController.list);
router.post('/', authMiddleware, commentController.create);
router.delete('/:id', authMiddleware, commentController.remove);

module.exports = router;
