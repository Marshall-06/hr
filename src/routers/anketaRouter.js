const express = require('express');
const anketaController = require('../controllers/anketaController');
const { authMiddleware, canDeleteAnketa } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const router = express.Router();

function longMailTimeout(req, res, next) {
  req.setTimeout(15 * 60 * 1000);
  res.setTimeout(15 * 60 * 1000);
  next();
}

router.get('/stats', authMiddleware, anketaController.getStats);
router.get('/closed-reasons', authMiddleware, anketaController.getClosedReasons);
router.get('/print/:id', anketaController.getPrint);
router.get('/', authMiddleware, anketaController.getAll);
router.post('/:id/send-email', authMiddleware, longMailTimeout, anketaController.sendEmail);
router.get('/:id', authMiddleware, anketaController.getById);
router.post('/', upload.fields([
  { name: 'photos', maxCount: 4 },
  { name: 'photo', maxCount: 1 },
]), anketaController.create);
router.put('/:id', authMiddleware, upload.fields([
  { name: 'photos', maxCount: 4 },
  { name: 'photo', maxCount: 1 },
]), anketaController.update);
router.delete('/:id', authMiddleware, canDeleteAnketa, anketaController.remove);

module.exports = router;
