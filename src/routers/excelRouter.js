const express = require('express');
const multer = require('multer');
const excelController = require('../controllers/excelController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) cb(null, true);
    else cb(new Error('Diňe Excel (.xlsx) faýl kabul edilýär'));
  },
});

const uploadAnketaPack = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.zip')) cb(null, true);
    else cb(new Error('Diňe Excel (.xlsx) ýa-da suratly ZIP kabul edilýär'));
  },
});

const router = express.Router();

router.post('/import/anketas', authMiddleware, adminOnly, uploadAnketaPack.single('file'), excelController.importAnketas);
router.post('/import/vacancies', authMiddleware, adminOnly, uploadExcel.single('file'), excelController.importVacancies);
router.post('/import/fees', authMiddleware, adminOnly, uploadExcel.single('file'), excelController.importFees);
router.get('/export-periods', authMiddleware, adminOnly, excelController.listExportPeriods);
router.get('/export/anketas', authMiddleware, adminOnly, excelController.exportAnketas);
router.get('/export/vacancies', authMiddleware, adminOnly, excelController.exportVacancies);
router.get('/export/fees', authMiddleware, adminOnly, excelController.exportFees);

module.exports = router;
