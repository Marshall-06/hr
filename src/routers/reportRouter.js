const express = require('express');
const reportController = require('../controllers/reportController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

router.get('/overview', authMiddleware, adminOnly, reportController.overview);
router.get('/latest-anchor', authMiddleware, adminOnly, reportController.latestAnchor);
router.get('/anketas', authMiddleware, adminOnly, reportController.anketas);
router.get('/anketas-by-status', authMiddleware, adminOnly, reportController.anketasByStatus);
router.get('/vacancies', authMiddleware, adminOnly, reportController.vacancies);
router.get('/employed', authMiddleware, adminOnly, reportController.employed);
router.get('/contracts', authMiddleware, adminOnly, reportController.contracts);
router.get('/by-position', authMiddleware, adminOnly, reportController.byPosition);
router.get('/by-position/details', authMiddleware, adminOnly, reportController.byPositionDetails);
router.get('/analytics', authMiddleware, adminOnly, reportController.analytics);

module.exports = router;
