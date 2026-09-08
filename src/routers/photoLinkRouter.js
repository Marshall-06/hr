const express = require('express');
const photoLinkController = require('../controllers/photoLinkController');
const { authMiddleware, adminOnly } = require('../middlewares/auth');

const router = express.Router();

router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Photos API işleýär',
    routes: [
      'GET /api/photos/scan-folder',
      'POST /api/photos/scan-folder',
      'GET /api/photos/kici-folder',
      'POST /api/photos/kici-folder',
      'GET /api/photos/scan-meta/:id',
      'GET /api/photos/scan-file/:id',
      'POST /api/photos/match-filenames',
      'POST /api/photos/link-from-uploads',
      'POST /api/photos/link-from-folder',
    ],
  });
});

router.use(photoLinkController.longTimeout);

/** View: skan papkasy (ýükleme ýok) */
router.get('/scan-folder', authMiddleware, photoLinkController.getScanFolderConfig);
router.post('/scan-folder', authMiddleware, adminOnly, photoLinkController.setScanFolder);
router.get('/scan-meta/:id', authMiddleware, photoLinkController.scanMetaForAnketa);
router.get('/scan-file/:id', authMiddleware, photoLinkController.streamScanForAnketa);

router.get('/default-scan-dir', authMiddleware, adminOnly, photoLinkController.defaultScanDir);
router.post('/desktop-scan-dir', authMiddleware, adminOnly, photoLinkController.ensureDesktopScanDir);
router.get('/kici-folder', authMiddleware, adminOnly, photoLinkController.getKiciFolder);
router.post('/kici-folder', authMiddleware, adminOnly, photoLinkController.setKiciFolder);
router.post('/auto-link-kici', authMiddleware, adminOnly, photoLinkController.autoLinkKici);
router.post('/resolve-folder', authMiddleware, adminOnly, photoLinkController.resolveFolderPath);
router.post('/pick-folder', authMiddleware, adminOnly, photoLinkController.pickFolder);

router.post('/match-filenames', authMiddleware, adminOnly, photoLinkController.matchFilenames);
router.post(
  '/link-from-uploads',
  authMiddleware,
  adminOnly,
  photoLinkController.uploadPhotos.array('photos', 80),
  photoLinkController.linkFromUploads,
);
router.post('/link-from-folder', authMiddleware, adminOnly, photoLinkController.linkFromFolder);

module.exports = router;
