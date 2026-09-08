const anketaService = require('../services/anketaService');
const path = require('path');
const { asyncHandler, successResponse } = require('../utils/response');
const portraitFolder = require('../services/anketaPortraitFolderService');

const getAll = asyncHandler(async (req, res) => {
  const result = await anketaService.getAll(req.query);
  successResponse(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const anketa = await anketaService.getById(req.params.id);
  successResponse(res, await anketaService.toPublic(anketa));
});

const getPrint = asyncHandler(async (req, res) => {
  const anketa = await anketaService.getById(req.params.id);
  successResponse(res, anketa);
});

const parseJsonFields = (data) => {
  const jsonFields = ['educationDetails', 'workExperience', 'languages', 'computerSkills', 'extraData'];
  const parsed = { ...data };
  jsonFields.forEach((field) => {
    if (typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field]); } catch { /* ignore */ }
    }
  });
  if (parsed.birthYear) parsed.birthYear = parseInt(parsed.birthYear, 10);
  return parsed;
};

/** Multer → uploads; soň anketa_kici_suratlar (№.jpg). Köne /uploads hem okalýar. */
const listMulterPhotoFiles = (req) => {
  const files = [];
  if (Array.isArray(req.files?.photos)) files.push(...req.files.photos);
  if (Array.isArray(req.files?.photo)) files.push(...req.files.photo);
  if (req.file) files.push(req.file);
  return files;
};

/** Multer → kici №.jpg + uploads/{№}.jpg rezerv. Esasy URL: /kici-suratlar/… */
const collectUploadedPhotos = (req, anketaNumber, anketaId) => {
  const files = listMulterPhotoFiles(req);
  if (!files.length) return [];

  try {
    portraitFolder.ensureFolder();
  } catch (e) {
    console.warn('kici papka:', e.message);
  }
  const urls = [];
  files.forEach((f, idx) => {
    const abs = f.path || path.join(portraitFolder.UPLOAD_DIR, f.filename);
    if (!abs) return;
    try {
      const saved = portraitFolder.adoptUploadToPortrait(abs, anketaNumber, {
        anketaId,
        unique: idx > 0,
        removeUpload: true, // uuid öçür; №.jpg uploads-da rezerv galýar
      });
      if (saved?.url) urls.push(saved.url);
      else if (f.filename) urls.push(`/uploads/${f.filename}`);
    } catch (e) {
      console.warn('surat ýazylmady:', e.message);
      if (f.filename) urls.push(`/uploads/${f.filename}`);
    }
  });
  return [...new Set(urls)].slice(0, 4);
};

const create = asyncHandler(async (req, res) => {
  const data = parseJsonFields({ ...req.body });
  // Ilki № bilen anketa döret, soň 3×4 → anketa_kici_suratlar
  let anketa = await anketaService.create(data);
  const photos = collectUploadedPhotos(req, anketa.anketaNumber, anketa.id);
  if (photos.length) {
    anketa = await anketaService.update(anketa.id, {
      photoUrl: photos[0],
      extraData: { ...(anketa.extraData || {}), photos },
    });
  }
  successResponse(res, anketa, 'Anketa üstünlikli döredildi', 201);
});

const update = asyncHandler(async (req, res) => {
  const existing = await anketaService.getById(req.params.id);
  const data = parseJsonFields({ ...req.body });
  const photos = collectUploadedPhotos(
    req,
    data.anketaNumber || existing.anketaNumber,
    existing.id,
  );
  if (photos.length) {
    data.photoUrl = photos[0];
    data.extraData = { ...(existing.extraData || {}), ...(data.extraData || {}), photos };
  } else if (String(req.body?.clearPhotos || '') === '1' || String(req.body?.clearPhotos || '') === 'true') {
    data.photoUrl = null;
    data.extraData = {
      ...(existing.extraData || {}),
      ...(data.extraData && typeof data.extraData === 'object' ? data.extraData : {}),
      photos: [],
    };
  } else if (data.extraData && typeof data.extraData === 'object') {
    const keepPhotos = existing.extraData?.photos
      || (existing.photoUrl ? [existing.photoUrl] : []);
    data.extraData = {
      ...(existing.extraData || {}),
      ...data.extraData,
      photos: keepPhotos,
    };
  }
  const anketa = await anketaService.update(req.params.id, data);
  successResponse(res, anketa, 'Anketa täzelendi');
});

const remove = asyncHandler(async (req, res) => {
  const result = await anketaService.remove(req.params.id);
  successResponse(res, result);
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await anketaService.getStats();
  successResponse(res, stats);
});

const getClosedReasons = asyncHandler(async (req, res) => {
  const reasons = await anketaService.getClosedReasons();
  successResponse(res, reasons);
});

const sendEmail = asyncHandler(async (req, res) => {
  const candidateMailService = require('../services/candidateMailService');
  const result = await candidateMailService.sendAnketaToContact(
    req.params.id,
    {
      to: req.body.to || req.body.email,
      note: req.body.note || req.body.message,
      vacancyId: req.body.vacancyId,
    },
    req.user,
  );
  successResponse(res, result, 'Anketa e-poçta ugradyldy');
});

module.exports = {
  getAll, getById, getPrint, create, update, remove, getStats, getClosedReasons, sendEmail,
};
