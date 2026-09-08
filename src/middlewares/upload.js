const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadDir = path.join(__dirname, '../../public/uploads');

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

try {
  ensureUploadDir();
} catch (e) {
  console.warn('uploads papka:', e.message);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureUploadDir();
        cb(null, uploadDir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ext) {
        if (file.mimetype === 'image/png') ext = '.png';
        else if (file.mimetype === 'image/webp') ext = '.webp';
        else if (file.mimetype === 'image/gif') ext = '.gif';
        else ext = '.jpg';
      }
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = /image\/(jpeg|jpg|png|gif|webp|pjpeg|x-png)/;
    const allowedExt = /jpeg|jpg|png|gif|webp/;
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const mime = String(file.mimetype || '').toLowerCase();
    const mimeOk = allowedMime.test(mime);
    const extOk = allowedExt.test(ext);
    if (mimeOk || extOk) cb(null, true);
    else cb(new Error('Diňe surat faýllary kabul edilýär'));
  },
});

module.exports = upload;
