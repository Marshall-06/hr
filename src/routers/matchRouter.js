const express = require('express');
const matchController = require('../controllers/matchController');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

router.get('/recommend', authMiddleware, matchController.recommend);
router.get('/vacancy/:vacancyId', authMiddleware, matchController.forVacancy);
router.get('/anketa/:anketaId', authMiddleware, matchController.forAnketa);

module.exports = router;
