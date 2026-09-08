const express = require('express');
const vacancyController = require('../controllers/vacancyController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

function longMailTimeout(req, res, next) {
  req.setTimeout(15 * 60 * 1000);
  res.setTimeout(15 * 60 * 1000);
  next();
}

router.get('/public', vacancyController.getPublic);
router.get('/stats', authMiddleware, vacancyController.getStats);
router.get('/by-operator', authMiddleware, adminOnly, vacancyController.getByOperator);
router.get('/close-reasons', authMiddleware, vacancyController.getCloseReasons);
router.post('/close-reasons', authMiddleware, adminOnly, vacancyController.addCloseReason);
router.get('/mail-status', authMiddleware, vacancyController.mailStatus);
router.post('/mail-login', authMiddleware, vacancyController.mailLogin);
router.post('/mail-logout', authMiddleware, vacancyController.mailLogout);
router.get('/assignments', authMiddleware, vacancyController.listAllAssignments);
router.get('/assignments/anketa-counts', authMiddleware, vacancyController.getAnketaAssignmentCounts);
router.get('/assignments/by-anketa/:anketaId', authMiddleware, vacancyController.listAssignmentsByAnketa);
router.get('/assignments/:assignmentId/dil-haty.docx', authMiddleware, vacancyController.getDilHatyDocx);
router.get('/assignments/:assignmentId/dil-haty', authMiddleware, vacancyController.getDilHatyPrintData);
router.get('/', authMiddleware, vacancyController.getAll);
router.get('/:id/assignments', authMiddleware, vacancyController.listAssignments);
router.post('/:id/send-candidates', authMiddleware, longMailTimeout, vacancyController.sendCandidatesEmail);
router.post('/:id/gmail-compose', authMiddleware, vacancyController.prepareGmailCompose);
router.get('/:id/compose-file/:anketaId', authMiddleware, vacancyController.downloadComposeAttachment);
router.get('/:id', vacancyController.getById);
router.post('/', authMiddleware, vacancyController.create);
router.put('/:id', authMiddleware, vacancyController.update);
router.patch('/:id/assign', authMiddleware, vacancyController.assignCandidate);
router.patch('/:id/assignment-status', authMiddleware, vacancyController.updateAssignmentStatus);
router.patch('/assignments/:assignmentId', authMiddleware, vacancyController.updateAssignmentById);
router.delete('/assignments/:assignmentId', authMiddleware, vacancyController.removeAssignment);
router.delete('/:id/assign', authMiddleware, vacancyController.clearAssignment);
router.delete('/:id', authMiddleware, adminOnly, vacancyController.remove);

module.exports = router;
