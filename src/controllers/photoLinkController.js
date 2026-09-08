const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { asyncHandler, successResponse } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const Anketa = require('../models/Anketa');
const {
  linkPhotosFromFolder,
  linkPhotosFromEntries,
  pickFolderWindows,
} = require('../services/linkAnketaPhotosService');
const scanFolder = require('../services/anketaScanFolderService');

const TEMP_DIR = path.join(__dirname, '../../public/uploads/_photo_link_tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const uploadPhotos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => {
      const safe = String(file.originalname || 'foto.jpg')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 180);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 100 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|jpg|png|gif|webp|bmp)/i.test(file.mimetype || '')
      || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Diňe surat faýllary'));
  },
});

const cleanupFiles = (files) => {
  (files || []).forEach((f) => {
    try { if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ignore */ }
  });
};

const longTimeout = (req, res, next) => {
  req.setTimeout(15 * 60 * 1000);
  res.setTimeout(15 * 60 * 1000);
  next();
};

const truthy = (v) => v === true || v === '1' || v === 'true';

const matchFilenames = asyncHandler(async (req, res) => {
  let names = req.body?.filenames || req.body?.names || [];
  if (typeof names === 'string') {
    try { names = JSON.parse(names); } catch { names = names.split(/[\n,;]+/); }
  }
  if (!Array.isArray(names) || !names.length) {
    return successResponse(res, {
      filesTotal: 0, linked: 0, unmatched: 0, ambiguous: 0, errors: 0,
      samples: { linked: [], unmatched: [], ambiguous: [], errors: [] },
    }, 'Faýl saýlanmady');
  }
  const overwrite = truthy(req.body?.overwrite);
  const entries = names.map((n) => ({ name: String(n || '').trim() })).filter((e) => e.name);
  const result = await linkPhotosFromEntries(entries, {
    dryRun: true,
    overwrite,
    sourceLabel: `Saýlanan faýllar (${entries.length})`,
  });
  successResponse(res, result, `Synag: ${result.linked} gabat`);
});

const linkFromUploads = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const overwrite = truthy(req.body?.overwrite);
  const crop3x4 = truthy(req.body?.crop3x4);
  const extractFromScan = req.body?.extractFromScan !== undefined
    ? truthy(req.body.extractFromScan)
    : crop3x4;
  try {
    if (!files.length) {
      return successResponse(res, {
        filesTotal: 0, linked: 0, unmatched: 0, ambiguous: 0, errors: 0,
        samples: { linked: [], unmatched: [], ambiguous: [], errors: [] },
      }, 'Surat ýüklenmedi');
    }
    const entries = files.map((f) => ({
      name: path.basename(String(f.originalname || f.filename || f.path || 'foto.jpg')),
      filePath: f.path,
    }));
    const result = await linkPhotosFromEntries(entries, {
      dryRun: false,
      overwrite,
      crop3x4: extractFromScan,
      extractFromScan,
      sourceLabel: `Ýüklenen suratlar (${entries.length})`,
    });
    successResponse(res, result, `${result.linked} surat berkidildi`);
  } finally {
    cleanupFiles(files);
  }
});

const pickFolder = asyncHandler(async (req, res) => {
  const kind = String(req.body?.kind || req.query?.kind || 'scan').toLowerCase();
  const title = kind === 'kici'
    ? 'Kerwen — 3x4 kici suratlar papkasyny saylan'
    : 'Kerwen — skan anketalar papkasyny saylan';
  const folderPath = pickFolderWindows({ title });
  successResponse(res, { folderPath, kind }, 'Papka saýlandy');
});

/** View üçin skan papkasy (ýükleme ýok) */
const getScanFolderConfig = asyncHandler(async (req, res) => {
  const folderPath = scanFolder.getScanRoot();
  const exists = fs.existsSync(folderPath);
  const { index } = scanFolder.getIndex();
  successResponse(res, {
    folderPath,
    exists,
    fileCount: index.size,
    rule: '2026 awgustyň öňi → JPG skan; awgustdan → programma formaty',
  }, 'Skan papkasy');
});

const setScanFolder = asyncHandler(async (req, res) => {
  const raw = String(req.body?.folderPath || req.body?.path || '').trim();
  if (!raw) throw new ApiError(400, 'Papka ýoly boş');
  const folderPath = path.resolve(raw);
  if (!fs.existsSync(folderPath)) throw new ApiError(400, `Papka tapylmady: ${folderPath}`);
  if (!fs.statSync(folderPath).isDirectory()) throw new ApiError(400, `Bu ýol papka däl: ${folderPath}`);
  const saved = scanFolder.writeConfig(folderPath);
  const { index } = scanFolder.getIndex();
  successResponse(res, { folderPath: saved, fileCount: index.size }, 'Skan papkasy saklandy');
});

const defaultScanDir = asyncHandler(async (req, res) => {
  const folderPath = scanFolder.DEFAULT_DIR;
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  const saved = scanFolder.writeConfig(folderPath);
  const { index } = scanFolder.getIndex();
  successResponse(res, { folderPath: saved, exists: true, fileCount: index.size }, 'suratlar/ papkasy');
});

/** Desktop/Kerwen suratlar — programma daşynda */
const ensureDesktopScanDir = asyncHandler(async (req, res) => {
  const saved = scanFolder.ensureDesktopPhotoFolder();
  const { index } = scanFolder.getIndex();
  successResponse(res, {
    folderPath: saved,
    exists: true,
    fileCount: index.size,
    desktop: scanFolder.getDesktopDir(),
  }, 'Desktop papkasy taýýar');
});

const getKiciFolder = asyncHandler(async (req, res) => {
  const portrait = require('../services/anketaPortraitFolderService');
  const folderPath = portrait.ensureFolder();
  portrait.harvestIntoLocalFolder(folderPath);
  successResponse(res, {
    folderPath,
    exists: true,
    fileCount: portrait.fileCount(),
  }, '3×4 papkasy');
});

const autoLinkKici = asyncHandler(async (req, res) => {
  const portrait = require('../services/anketaPortraitFolderService');
  const result = await portrait.autoLinkFromKiciFolder({ relinkIfMissing: true });
  successResponse(
    res,
    result,
    `${result.linked || 0} surat anketa № boýunça baglandy`,
  );
});

const setKiciFolder = asyncHandler(async (req, res) => {
  const portrait = require('../services/anketaPortraitFolderService');
  const raw = String(req.body?.folderPath || req.body?.path || '').trim();
  if (!raw) throw new ApiError(400, 'Papka ýoly boş');
  const folderPath = path.resolve(raw);
  if (!fs.existsSync(folderPath)) {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch (e) {
      throw new ApiError(400, `Papka döredilmedi: ${folderPath} (${e.message})`);
    }
  }
  if (!fs.statSync(folderPath).isDirectory()) throw new ApiError(400, `Bu ýol papka däl: ${folderPath}`);
  const saved = portrait.writeConfig(folderPath);
  // Saýlanan papkadan №.jpg-leri awto bagla
  let linked = null;
  try {
    linked = await portrait.autoLinkFromKiciFolder({
      relinkIfMissing: true,
      scanPc: false,
      overwrite: false,
    });
  } catch (e) {
    console.warn('kici baglama:', e.message);
  }
  successResponse(res, {
    folderPath: saved,
    exists: true,
    fileCount: portrait.fileCount(),
    linked: linked?.linked || 0,
    numberedCopied: linked?.numberedCopied || 0,
  }, '3×4 papkasy saklandy');
});

const resolveFolderPath = asyncHandler(async (req, res) => {
  const raw = String(req.body?.folderPath || req.body?.path || '').trim();
  if (!raw) throw new ApiError(400, 'Papka ýoly boş');
  const folderPath = path.resolve(raw);
  if (!fs.existsSync(folderPath)) throw new ApiError(400, `Papka tapylmady: ${folderPath}`);
  if (!fs.statSync(folderPath).isDirectory()) throw new ApiError(400, `Bu ýol papka däl: ${folderPath}`);
  successResponse(res, { folderPath }, 'Papka tapyldy');
});

const linkFromFolder = asyncHandler(async (req, res) => {
  const folderPath = String(req.body?.folderPath || req.body?.path || '').trim();
  const dryRun = truthy(req.body?.dryRun);
  const overwrite = truthy(req.body?.overwrite);
  const crop3x4 = truthy(req.body?.crop3x4);
  const extractFromScan = req.body?.extractFromScan !== undefined
    ? truthy(req.body.extractFromScan)
    : crop3x4;

  const result = await linkPhotosFromFolder({
    folderPath,
    dryRun,
    overwrite,
    crop3x4: extractFromScan,
    extractFromScan,
  });
  const msg = dryRun
    ? `Synag: ${result.linked} gabat geldi (ýazylmady)`
    : `${result.linked} surat berkidildi`;
  successResponse(res, result, msg);
});

/** Anketa view: skan JPG barmy? */
const scanMetaForAnketa = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw new ApiError(400, 'Anketa ID ýok');
  const a = await Anketa.findByPk(id, {
    attributes: ['id', 'anketaNumber', 'formDate', 'extraData', 'photoUrl'],
    raw: true,
  });
  if (!a) throw new ApiError(404, 'Anketa tapylmady');

  const preferScan = scanFolder.prefersFolderScanView(a);
  const resolved = scanFolder.resolveScanForAnketa(a);
  const filePath = resolved?.path || null;
  const found = Boolean(filePath);
  // Papkada faýl bar bolsa skan görkeziş (daşarky / başga papka)
  successResponse(res, {
    anketaId: a.id,
    anketaNumber: a.anketaNumber,
    preferScan: found || preferScan,
    found,
    source: resolved?.source || null,
    fileName: filePath ? path.basename(filePath) : null,
    scanUrl: filePath ? `/api/photos/scan-file/${a.id}` : null,
    folderPath: scanFolder.getScanRoot(),
    hasPortrait: Boolean(a.photoUrl),
  }, filePath ? 'Skan tapyldy' : (preferScan ? 'Skan faýl tapylmady' : 'Programma formaty'));
});

/** Skan JPG akymy (auth bilen) */
const streamScanForAnketa = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw new ApiError(400, 'Anketa ID ýok');
  const a = await Anketa.findByPk(id, {
    attributes: ['id', 'anketaNumber', 'formDate', 'extraData', 'photoUrl'],
    raw: true,
  });
  if (!a) throw new ApiError(404, 'Anketa tapylmady');

  const resolved = scanFolder.resolveScanForAnketa(a);
  const filePath = resolved?.path;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new ApiError(404, 'Skan surat tapylmady');
  }
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', scanFolder.mimeForExt(ext));
  res.setHeader('Cache-Control', 'private, max-age=120');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = {
  matchFilenames,
  linkFromUploads,
  pickFolder,
  linkFromFolder,
  defaultScanDir,
  ensureDesktopScanDir,
  getKiciFolder,
  setKiciFolder,
  autoLinkKici,
  resolveFolderPath,
  getScanFolderConfig,
  setScanFolder,
  scanMetaForAnketa,
  streamScanForAnketa,
  uploadPhotos,
  longTimeout,
};
