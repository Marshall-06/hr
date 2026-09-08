const fs = require('fs');
const os = require('os');
const path = require('path');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Anketa, Vacancy, User } = require('../models');
const feePaymentService = require('./feePaymentService');
const scanFolder = require('./anketaScanFolderService');
const { parseAnketaNumberParts, linkPhotosFromEntries, savePhotoFromFile } = require('./linkAnketaPhotosService');
const ApiError = require('../utils/ApiError');
const { createAnketaNumberAllocator, needsAutoAnketaNumber, getNextVacancyNumber } = require('../utils/helpers');
const {
  PLACED_BY_US_REASON,
  SELF_PLACED_REASON,
  isPlacedByUsReason,
  isSelfPlacedReason,
  placementMarkFromReason,
} = require('../utils/placedByUs');
const {
  excelSerialToDate,
  getCell,
  getCellExact,
  getCellsAll,
  buildKeyIndex,
  normalizeKey,
  normalizeAnketaStatus,
  normalizeVacancyStatus,
  normalizeGender,
  readSheetRows,
  buildWorkbookBuffer,
  readAnketaSheetRowsWithColors,
  buildWorkbookBufferMulti,
} = require('../utils/excel');
const {
  splitDesiredPositionList,
  uniqueDesiredPositions,
  buildOrderedKeyIndex,
  collectDesiredPositionsOrdered,
  extractOrderedPositions,
  isWorkExperienceWezipeKey,
} = require('../utils/desiredPositions');

/** public/ kök — /uploads/... suratlar üçin */
const UPLOAD_ROOT = path.resolve(__dirname, '../../public');

/** Circular require bolmaz ýaly — wagtynda ýükle */
function getVacancyService() {
  return require('./vacancyService');
}

/** Excel / baza № bir görnüş: 26/05/117 → 26/5/117 */
function normalizeAnketaNumberKey(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  s = s.replace(/\u00a0/g, ' ').replace(/\s+/g, '');
  s = s.replace(/[\\.\-]+/g, '/');
  const m = s.match(/^(\d{2,4})\/(\d{1,2})\/(\d+)$/);
  if (!m) return s;
  const yy = m[1].length === 4 ? m[1].slice(-2) : m[1];
  return `${Number(yy)}/${Number(m[2])}/${Number(m[3])}`;
}

function anketaNumberVariants(raw) {
  const key = normalizeAnketaNumberKey(raw);
  const set = new Set([String(raw == null ? '' : raw).trim(), key].filter(Boolean));
  const m = String(key).match(/^(\d+)\/(\d+)\/(\d+)$/);
  if (m) {
    const yy = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    const n = m[3];
    set.add(`${yy}/${mm}/${n}`);
    set.add(`${yy}/${Number(m[2])}/${n}`);
    set.add(`${Number(m[1])}/${mm}/${n}`);
    set.add(`${Number(m[1])}/${Number(m[2])}/${n}`);
  }
  return [...set];
}

function mergeDesiredPositionPayload(prev = {}, next = {}) {
  const excelList = extractOrderedPositions(next);
  const fromExcelImport = next.extraData?.imported === true && excelList.length > 0;

  const nextList = excelList.length
    ? excelList
    : uniqueDesiredPositions([
      ...splitDesiredPositionList(next.desiredPosition),
      ...(Array.isArray(next.extraData?.desiredPositions) ? next.extraData.desiredPositions : []),
    ]);
  const prevList = uniqueDesiredPositions([
    ...(Array.isArray(prev.extraData?.desiredPositions) ? prev.extraData.desiredPositions : []),
    ...splitDesiredPositionList(prev.desiredPosition),
  ]);

  // Bir anketa birnäçe setirde / sütünlerde: 1-nji wezipeden ählisini sakla (soňky setir basmaz)
  let merged;
  if (fromExcelImport && nextList.length >= 2) {
    merged = nextList.slice(0, 8);
  } else if (fromExcelImport) {
    merged = uniqueDesiredPositions([...prevList, ...nextList]).slice(0, 8);
  } else {
    merged = uniqueDesiredPositions([...nextList, ...prevList]).slice(0, 8);
  }
  const extra = {
    ...(prev.extraData && typeof prev.extraData === 'object' ? prev.extraData : {}),
    ...(next.extraData && typeof next.extraData === 'object' ? next.extraData : {}),
  };
  if (merged.length) extra.desiredPositions = merged;
  if (fromExcelImport) extra.positionOrderV = 2;

  // Ýaşyl (biziň) > gyzyl (özi) — bir № birnäçe setirde bolsa
  const reasonRank = (r) => {
    const s = String(r || '');
    if (s.includes('Biziň ýerleşdiren')) return 2;
    if (s.includes('Özi işe ýerleş')) return 1;
    return 0;
  };
  const preferNextReason = reasonRank(next.closedReason) >= reasonRank(prev.closedReason);
  const closedReason = preferNextReason
    ? (next.closedReason || prev.closedReason || null)
    : (prev.closedReason || next.closedReason || null);
  const status = closedReason
    ? 'Isleyar'
    : (next.status || prev.status || null);
  const employmentDate = next.employmentDate || prev.employmentDate || null;

  // Boş Excel setiri öňki iş tejribesini / okuwy pozmasyn
  const pickJsonList = (a, b) => {
    const aa = parseJsonList(a);
    const bb = parseJsonList(b);
    if (aa.length) return aa;
    if (bb.length) return bb;
    return Array.isArray(a) ? a : (Array.isArray(b) ? b : []);
  };

  return {
    ...prev,
    ...next,
    extraData: extra,
    desiredPosition: merged.length ? merged.join(' / ') : (next.desiredPosition || prev.desiredPosition || null),
    closedReason,
    status: status || next.status || prev.status,
    employmentDate,
    workExperience: pickJsonList(next.workExperience, prev.workExperience),
    educationDetails: pickJsonList(next.educationDetails, prev.educationDetails),
  };
}

/** JSONB / string / null → massiw */
function parseJsonList(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x != null);
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => x != null) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function expPosition(e) {
  if (!e || typeof e !== 'object') return '';
  return e.position || e.wezipe || e.job || e.title || e['iş wezipesi'] || '';
}

function expCompany(e) {
  if (!e || typeof e !== 'object') return '';
  return e.company || e.karhana || e.workplace || e['işlän ýeri'] || '';
}

function expYears(e) {
  if (!e || typeof e !== 'object') return '';
  return e.years || e.period || e.sene || e.year || '';
}

function expDirection(e) {
  if (!e || typeof e !== 'object') return '';
  return e.direction || e.ugry || e.ugur || '';
}

/** Excel export döwür: 2023 → şu ýyl (mysal 2026). Köne / geljek ýyllar ýok. */
const EXPORT_YEAR_MIN = 2023;

const normalizeYearPart = (raw) => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const nowY = new Date().getFullYear();
  const minY = EXPORT_YEAR_MIN;
  const maxY = nowY;
  let y = null;
  if (n >= 2000 && n <= maxY + 1) y = n;
  else if (n >= 15 && n <= 99) y = 2000 + n;
  if (y == null || y < minY || y > maxY) return null;
  return y;
};

const normalizeMonthPart = (raw) => {
  const n = parseInt(raw, 10);
  return n >= 1 && n <= 12 ? n : null;
};

const addPeriod = (map, year, month) => {
  const y = normalizeYearPart(year);
  const m = normalizeMonthPart(month);
  if (!y || !m) return;
  if (!map.has(y)) map.set(y, new Set());
  map.get(y).add(m);
};

const resolveUploadAbs = (url) => {
  if (!url) return null;
  try {
    const portrait = require('./anketaPortraitFolderService');
    const abs = portrait.resolvePhotoAbs(url);
    if (abs) return abs;
  } catch { /* ignore */ }
  if (!url) return null;
  let rel = String(url).trim().replace(/^https?:\/\/[^/]+/i, '');
  if (!rel) return null;
  if (/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('\\\\')) {
    return fs.existsSync(rel) ? rel : null;
  }
  if (!rel.startsWith('/')) rel = `/${rel}`;
  if (rel.startsWith('/uploads/') || rel === '/uploads') {
    const abs = path.resolve(UPLOAD_ROOT, rel.replace(/^\//, ''));
    return fs.existsSync(abs) ? abs : null;
  }
  const base = path.basename(rel);
  if (base && /\.(jpe?g|png|webp|gif|bmp)$/i.test(base)) {
    const abs = path.join(UPLOAD_ROOT, 'uploads', base);
    return fs.existsSync(abs) ? abs : null;
  }
  return null;
};

const ZIP_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const anketaDiskStem = (anketaOrNumber) => {
  const anketa = anketaOrNumber && typeof anketaOrNumber === 'object'
    ? anketaOrNumber
    : { anketaNumber: anketaOrNumber };
  const parts = parseAnketaNumberParts(anketa.anketaNumber);
  if (parts) return `${parts.y}.${parts.m}.${parts.n}`;
  const id = Number(anketa.id);
  if (id > 0) return `id.${id}`;
  return '';
};

const parseAnketaExtra = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};

/** Surat export: diňe anketa № — çeşme faýl ady /uploads/xxx ulanylmaz */
const collectAnketaPhotoFiles = (anketaIn) => {
  const anketa = anketaIn && typeof anketaIn.toJSON === 'function'
    ? anketaIn.toJSON()
    : (anketaIn || {});
  const files = [];
  const seen = new Set();
  const stem = anketaDiskStem(anketa);
  if (!stem) return files;

  const push = (abs) => {
    if (!abs || seen.has(abs) || !fs.existsSync(abs)) return;
    try {
      if (!fs.statSync(abs).isFile()) return;
    } catch {
      return;
    }
    seen.add(abs);
    files.push({ abs });
  };

  try {
    const scan = scanFolder.resolveScanForAnketa(anketa);
    if (scan?.path) push(scan.path);
  } catch { /* ignore */ }

  try {
    const portrait = require('./anketaPortraitFolderService');
    const hit = portrait.resolvePortraitForAnketa(anketa);
    if (hit?.path) push(hit.path);
  } catch { /* ignore */ }

  const xd = parseAnketaExtra(anketa.extraData || anketa.extra_data);
  const urls = [];
  if (anketa.photoUrl || anketa.photo_url) urls.push(anketa.photoUrl || anketa.photo_url);
  if (Array.isArray(xd.photos)) urls.push(...xd.photos);
  if (xd.scanUrl) urls.push(xd.scanUrl);
  urls.forEach((url) => {
    try { push(resolveUploadAbs(url)); } catch { /* ignore */ }
  });

  return files.map((f, idx) => {
    let ext = path.extname(f.abs).toLowerCase();
    if (!ZIP_IMAGE_EXT.has(ext)) ext = '.jpg';
    if (ext === '.jpeg') ext = '.jpg';
    const zipName = idx === 0
      ? `suratlar/${stem}${ext}`
      : `suratlar/${stem}_${idx + 1}${ext}`;
    return { abs: f.abs, zipName, stem, ext };
  });
};

/** Suratlar programmadan daşarky papka (mysal Desktop) — №.jpg */
function copyAnketaPhotosToFolder(items, folderPath, { portraitsOnly = false } = {}) {
  const root = path.resolve(String(folderPath || '').trim());
  if (!root) return { copied: 0, folderPath: '', errors: [] };
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  let copied = 0;
  const errors = [];
  const used = new Set();
  for (const raw of items) {
    const a = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
    let files = [];
    if (portraitsOnly) {
      try {
        const portrait = require('./anketaPortraitFolderService');
        const hit = portrait.resolvePortraitForAnketa(a);
        if (hit?.path) {
          const stem = anketaDiskStem(a) || `id.${a.id}`;
          let ext = path.extname(hit.path).toLowerCase() || '.jpg';
          if (ext === '.jpeg') ext = '.jpg';
          files = [{ abs: hit.path, stem, ext }];
        }
      } catch { /* ignore */ }
    } else {
      files = collectAnketaPhotoFiles(a).map((f) => ({
        abs: f.abs,
        stem: f.stem,
        ext: f.ext,
      }));
    }
    for (const f of files) {
      let name = `${f.stem}${f.ext}`;
      if (used.has(name)) {
        let i = 2;
        while (used.has(`${f.stem}_${i}${f.ext}`)) i += 1;
        name = `${f.stem}_${i}${f.ext}`;
      }
      used.add(name);
      const dest = path.join(root, name);
      try {
        // Özüniň üstüne göçürme
        if (path.resolve(f.abs) === path.resolve(dest)) {
          copied += 1;
          continue;
        }
        fs.copyFileSync(f.abs, dest);
        copied += 1;
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
    }
  }
  return { copied, folderPath: root, errors: errors.slice(0, 20) };
}

function isZipBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4
    && buf[0] === 0x50 && buf[1] === 0x4b
    && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

function zipPhotoRank(zipPath) {
  const n = String(zipPath || '').replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)fotolar\//.test(n)) return 0;
  if (/(^|\/)suratlar\//.test(n)) return 1;
  return 2;
}

/** Excel (.xlsx) ýa-da export ZIP (Excel + suratlar/) */
async function unpackAnketaImportArchive(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!isZipBuffer(buf)) {
    return { xlsxBuffer: buf, zip: null };
  }
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const hasWorkbook = names.some((n) => /(?:^|\/)xl\/workbook\.xml$/i.test(n));
  const xlsxNames = names.filter((n) => /\.xlsx$/i.test(n));
  if (hasWorkbook && !xlsxNames.length) {
    return { xlsxBuffer: buf, zip: null };
  }
  if (!xlsxNames.length) {
    throw new ApiError(400, 'ZIP içinde Excel (.xlsx) tapylmady. Ilki «Surat bilen (ZIP)» bilen çykaryň.');
  }
  xlsxNames.sort((a, b) => {
    const score = (n) => (/anketa/i.test(n) ? 0 : 1);
    return score(a) - score(b) || a.length - b.length;
  });
  const xlsxBuffer = Buffer.from(await zip.file(xlsxNames[0]).async('nodebuffer'));
  return { xlsxBuffer, zip };
}

async function attachPhotosFromImportZip(zip) {
  if (!zip) {
    return { filesTotal: 0, linked: 0, skippedHasPhoto: 0, unmatched: 0, errors: 0 };
  }
  const names = Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .filter((n) => ZIP_IMAGE_EXT.has(path.posix.extname(n.replace(/\\/g, '/')).toLowerCase()))
    .sort((a, b) => zipPhotoRank(a) - zipPhotoRank(b) || a.localeCompare(b));

  if (!names.length) {
    return { filesTotal: 0, linked: 0, skippedHasPhoto: 0, unmatched: 0, errors: 0 };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kerwen-zip-photos-'));
  const entries = [];
  const byId = [];
  try {
    for (let i = 0; i < names.length; i += 1) {
      const zipPath = names[i];
      const base = path.posix.basename(zipPath.replace(/\\/g, '/'));
      if (!base) continue;
      const dest = path.join(tmpRoot, `${String(i).padStart(4, '0')}_${base}`);
      fs.writeFileSync(dest, await zip.file(zipPath).async('nodebuffer'));

      const idMatch = String(base).match(/^id[._-](\d+)/i);
      if (idMatch) {
        byId.push({ id: Number(idMatch[1]), name: base, filePath: dest });
        continue;
      }
      if (!parseAnketaNumberParts(base)) continue;
      entries.push({ name: base, filePath: dest });
    }

    const summary = entries.length
      ? await linkPhotosFromEntries(entries, {
          // ZIP = arhiw gaýtarmak: № boýunça suratlar täzelensin
          overwrite: true,
          extractFromScan: false,
          sourceLabel: 'ZIP import (№)',
        })
      : { filesTotal: 0, linked: 0, skippedHasPhoto: 0, unmatched: 0, errors: 0, samples: { errors: [] } };

    // № ýok — diňe id.123.jpg
    for (const item of byId) {
      if (!item.id) {
        summary.unmatched = (summary.unmatched || 0) + 1;
        continue;
      }
      try {
        const a = await Anketa.findByPk(item.id, { attributes: ['id', 'photoUrl', 'extraData'] });
        if (!a) {
          summary.unmatched = (summary.unmatched || 0) + 1;
          continue;
        }
        const url = savePhotoFromFile(item.filePath, { extractFromScan: false });
        const prev = a.extraData && typeof a.extraData === 'object' ? a.extraData : {};
        const photos = Array.isArray(prev.photos) ? [...prev.photos] : [];
        if (!photos.includes(url)) photos.unshift(url);
        await Anketa.update(
          { photoUrl: url, extraData: { ...prev, photos: photos.slice(0, 8) } },
          { where: { id: a.id } },
        );
        summary.linked = (summary.linked || 0) + 1;
      } catch (e) {
        summary.errors = (summary.errors || 0) + 1;
      }
    }

    summary.filesTotal = names.length;
    return summary;
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Export: ýyl / aý / aralyk — formDate ýa-da vacancyDate boýunça */
const buildDateRangeFilter = (fieldName, filters = {}) => {
  const year = filters.year ? Number(filters.year) : null;
  const month = filters.month ? Number(filters.month) : null;
  let dateFrom = filters.dateFrom ? String(filters.dateFrom).slice(0, 10) : null;
  let dateTo = filters.dateTo ? String(filters.dateTo).slice(0, 10) : null;

  if (year >= 2000 && year <= 2100) {
    if (month >= 1 && month <= 12) {
      const m = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      dateFrom = `${year}-${m}-01`;
      dateTo = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (!dateFrom && !dateTo) {
      dateFrom = `${year}-01-01`;
      dateTo = `${year}-12-31`;
    }
  }

  if (!dateFrom && !dateTo) return null;

  const range = {};
  if (dateFrom) range[Op.gte] = dateFrom;
  if (dateTo) range[Op.lte] = dateTo;
  return { [fieldName]: range };
};

/** Anketa export: № formaty ÝYL/AÝ/TERTIP (25/8/78) — diňe saýlanan aý */
const buildAnketaExportWhere = (filters = {}) => {
  if (filters.anketaId) return { id: Number(filters.anketaId) };
  if (filters.anketaNumber) return { anketaNumber: String(filters.anketaNumber).trim() };

  const year = filters.year ? Number(filters.year) : null;
  const month = filters.month ? Number(filters.month) : null;

  if (year >= 2000 && year <= 2100) {
    const yy = String(year).slice(-2);
    if (month >= 1 && month <= 12) {
      const likes = [{ anketaNumber: { [Op.iLike]: `${yy}/${month}/%` } }];
      if (month < 10) {
        likes.push({ anketaNumber: { [Op.iLike]: `${yy}/0${month}/%` } });
      }
      return likes.length === 1 ? likes[0] : { [Op.or]: likes };
    }
    return {
      anketaNumber: {
        [Op.iLike]: `${yy}/%`,
      },
    };
  }

  if (month >= 1 && month <= 12) {
    return sequelize.where(
      sequelize.cast(
        sequelize.fn('split_part', sequelize.col('anketa_number'), '/', 2),
        'integer',
      ),
      month,
    );
  }

  return buildDateRangeFilter('formDate', filters) || {};
};

const normText = (v) => String(v || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/** Import dublikat açary: operator + Excel № ýa-da firma+wezipe+sene */
const vacancyImportKey = (row) => {
  const op = row.acceptedByUserId || 0;
  const excelNo = row._excelVacancyNumber;
  if (op && excelNo != null && excelNo !== '') {
    return `e:${op}:${excelNo}`;
  }
  const date = row.vacancyDate ? String(row.vacancyDate).slice(0, 10) : '';
  return `f:${op}:${normText(row.companyName)}|${normText(row.position)}|${date}|${normText(row.salary)}|${normText(row.location)}`;
};

async function findExistingImportedVacancy(row) {
  const opId = row.acceptedByUserId;
  if (!opId) return null;
  const excelNo = row._excelVacancyNumber;

  if (excelNo != null && excelNo !== '') {
    const byExcel = await Vacancy.findOne({
      where: {
        acceptedByUserId: opId,
        [Op.and]: [
          sequelize.where(
            sequelize.literal(`(extra_data->>'excelVacancyNumber')`),
            String(excelNo),
          ),
        ],
      },
      order: [['id', 'ASC']],
    });
    if (byExcel) return byExcel;
  }

  const where = {
    acceptedByUserId: opId,
  };
  if (row.companyName) where.companyName = { [Op.iLike]: String(row.companyName).trim() };
  if (row.position) where.position = { [Op.iLike]: String(row.position).trim() };
  if (row.vacancyDate) where.vacancyDate = row.vacancyDate;
  if (row.salary) where.salary = { [Op.iLike]: String(row.salary).trim() };
  if (row.location) where.location = { [Op.iLike]: String(row.location).trim() };

  return Vacancy.findOne({
    where,
    order: [['id', 'ASC']],
  });
}

const LANG_ALIASES = [
  ['Türkmen', ['Turkmen', 'TÜRKMEN', 'Türkmen']],
  ['Rus', ['Rus', 'RUS']],
  ['Iňlis', ['Inlis', 'IŇLIS', 'Iňlis', 'English']],
  ['Türk', ['Turk', 'TÜRK', 'Türk']],
  ['Pars', ['Pars', 'PARS']],
  ['Özbek', ['Ozbek', 'Özbek']],
  ['Nemes', ['Nemes', 'NEMES']],
  ['Fransuz', ['Fransuz', 'FRANSUZ']],
  ['Hytaý', ['Hytay', 'HYTAÝ', 'Hytaý']],
];

const PROGRAM_COLS = [
  'MS WORD', 'EXCEL', 'INTERNET', 'ORG. TEHNIKA', 'LOGO', '1С БУХГАЛ.', 'PHOTOSHOP',
  'PAGE MAKER', 'COREL DRAW', 'AUTO CAD', '3D MAX', 'ARCHI CAD', 'SQL', 'ILLUSTRATOR',
  'POWER POINT', 'ACCES', '1 C KADR', 'MOVAVI', 'Powerpoint', 'CorelDraw', 'AutoCad',
];

const parseBirthYear = (birthRaw) => {
  if (birthRaw == null || birthRaw === '') return null;
  if (typeof birthRaw === 'number' && birthRaw > 1900 && birthRaw < 2100) return Math.round(birthRaw);
  if (birthRaw instanceof Date && !Number.isNaN(birthRaw.getTime())) return birthRaw.getFullYear();
  if (typeof birthRaw === 'number') {
    const d = excelSerialToDate(birthRaw);
    if (d) return Number(d.slice(0, 4));
  }
  const s = String(birthRaw);
  const m = s.match(/(19|20)\d{2}/);
  if (m) return Number(m[0]);
  return null;
};

const toStr = (value, max = 200) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    if (value instanceof Date) return excelSerialToDate(value);
    if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(', ').slice(0, max) || null;
    return JSON.stringify(value).slice(0, max);
  }
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
};

const mapAnketaRow = (row, index) => {
  const keys = buildKeyIndex(row);
  const familyName = toStr(getCell(row, ['FAMILIÝASY', 'FAMILIYASY', 'Familiyasy', 'familyName'], keys), 100);
  const firstName = toStr(getCell(row, ['ADY', 'Ady', 'firstName'], keys), 100);
  if (!familyName && !firstName) return null;

  const languages = [];
  LANG_ALIASES.forEach(([name, aliases]) => {
    const level = toStr(getCell(row, aliases, keys), 50);
    if (level && !['yok', 'ýok', '-'].includes(level.toLowerCase())) {
      languages.push({ name, level });
    }
  });

  const computerSkills = [];
  PROGRAM_COLS.forEach((col) => {
    const val = toStr(getCell(row, [col], keys), 50);
    if (val && !['yok', 'ýok', '-'].includes(val.toLowerCase())) {
      computerSkills.push(col.replace(/\s+/g, ' ').trim());
    }
  });

  const anketaNumber = toStr(
    getCell(row, ['ANKETA №', 'ANKETA', 'anketaNumber', 'Anketa №', 'Anketa nomeri'], keys),
    50,
  );

  let positionParts = collectDesiredPositionsOrdered(row, buildOrderedKeyIndex(row));
  // Köne Excel: birnäçe WEZIPESI sütüni — hemmesini 1-nji → soňky tertipde al
  const fromAllWezipeCols = getCellsAll(row, [
    'WEZIPESI',
    'WEZIPE',
    'DALAŞGÄR WEZIPESI',
    'DALASGAR WEZIPESI',
    'desiredPosition',
  ], keys)
    .filter((x) => !isWorkExperienceWezipeKey(normalizeKey(x.orig || x.key)))
    .map((x) => toStr(x.value, 200))
    .filter(Boolean)
    .flatMap((s) => splitDesiredPositionList(s));
  if (fromAllWezipeCols.length > positionParts.length) {
    positionParts = uniqueDesiredPositions(fromAllWezipeCols);
  }
  const desiredPosition = positionParts.length ? positionParts.join(' / ').slice(0, 500) : null;

  return {
    anketaNumber: normalizeAnketaNumberKey(anketaNumber) || anketaNumber || null,
    formDate: excelSerialToDate(getCell(row, ['SENE', 'Sene', 'formDate'], keys)),
    desiredPosition,
    status: normalizeAnketaStatus(
      getCell(row, ['HÄZIRKI ÝAGDAÝY', 'HAZIRKI YAGDAYY', 'YAGDAYY', 'status', 'Işleýär'], keys),
    ),
    employmentDate: excelSerialToDate(getCell(row, ['IŞLEÝÄN SENESI', 'ISLEYAN SENESI', 'employmentDate'], keys)),
    closedReason: toStr(getCell(row, ['ÝAPYLANLYGYNYŇ SEBÄBI', 'YAPYLANLYGYNYN SEBABI', 'closedReason'], keys), 200),
    familyName,
    firstName,
    patronymic: toStr(getCell(row, ['ATASYNYŇ ADY', 'ATASYNYN ADY', 'patronymic'], keys), 100),
    birthYear: parseBirthYear(getCell(row, ['DOGLAN ÝYLY', 'DOGLAN YYLY', 'birthYear'], keys)),
    gender: normalizeGender(getCell(row, ['JYNSY', 'Jynsy', 'gender'], keys)),
    phone: toStr(getCell(row, ['TELEFONY', 'Telefon', 'phone'], keys), 50),
    email: toStr(getCell(row, ['E-MAIL', 'EMAIL', 'Email', 'email'], keys), 150),
    registrationCity: toStr(getCell(row, ['Ýazgyda duran şäheri', 'Yazgyda duran saheri', 'registrationCity'], keys), 150),
    registrationAddress: toStr(getCell(row, ['ÝAZGYDA DURAN ÝERI', 'YAZGYDA DURAN YERI', 'registrationAddress'], keys), 2000),
    currentAddress: toStr(getCell(row, ['HÄZIRKI ÝAŞAÝAN ÝERI', 'HAZIRKI YASAYAN YERI', 'currentAddress'], keys), 2000),
    currentSalary: toStr(getCell(row, ['ISLEÝÄN AÝLYK HAKY', 'ISLEYAN AYLYK HAKY', 'currentSalary'], keys), 100),
    drivingLicense: toStr(getCell(row, ['SÜRÜJILIK Ş-NAMA', 'SURUJILIK S-NAMA', 'drivingLicense'], keys), 50),
    hasCar: toStr(getCell(row, ['ŞAHSY AWTOULAGY', 'SAHSY AWTOULAGY', 'hasCar'], keys), 100),
    willingToRelocate: toStr(getCell(row, ['BAŞGA ŞÄHERE GIDIP IŞLEMEK', 'BASGA SAHERE GIDIP ISLEMEK', 'willingToRelocate'], keys), 20),
    partTimeWork: toStr(getCell(row, ['WAHTALA-ÝYN IŞLEMEK', 'WAHTALA-YYN ISLEMEK', 'partTimeWork'], keys), 20),
    workSchedule: toStr(getCell(row, ['IŞ GRAFIGI', 'IS GRAFIGI', 'workSchedule'], keys), 100),
    birthPlace: toStr(getCell(row, ['DOGLAN ÝERI', 'DOGLAN YERI', 'birthPlace'], keys), 2000),
    nationality: toStr(getCell(row, ['MILLETI', 'Milleti', 'nationality'], keys), 100),
    maritalStatus: toStr(getCell(row, ['MAŞGALA ÝAGDAÝY', 'MASGALA YAGDAYY', 'maritalStatus'], keys), 100),
    militaryService: toStr(getCell(row, ['HARBY BILET', 'Harby bilet', 'militaryService'], keys), 50),
    educationLevel: toStr(getCell(row, ['BILIMI', 'Bilimi', 'educationLevel'], keys), 100),
    passportNumber: toStr(getCell(row, ['PASPORT №', 'PASPORT', 'passportNumber'], keys), 100),
    passportIssued: toStr(getCell(row, ['PASPORT BERLEN', 'passportIssued'], keys), 300),
    notes: toStr(getCell(row, ['BELLIK', 'Teswir', 'notes'], keys), 5000),
    languages,
    computerSkills,
    educationDetails: (() => {
      const rows = [];
      for (let i = 1; i <= 5; i += 1) {
        const years = toStr(getCell(row, [`OKUW ÝYLY ${i}`, `OKUW YYLY ${i}`, `Okan ýyllary ${i}`], keys), 100);
        const school = toStr(getCell(row, [`OKUW JAÝY ${i}`, `OKUW JAYY ${i}`, `Okuw jaýy ${i}`], keys), 300);
        const specialty = toStr(getCell(row, [`HÜNÄRI ${i}`, `HUNARI ${i}`, `Hünäri ${i}`], keys), 300);
        if (years || school || specialty) rows.push({ years, school, specialty });
      }
      return rows;
    })(),
    workExperience: (() => {
      const rows = [];
      for (let i = 1; i <= 6; i += 1) {
        const years = toStr(getCell(row, [
          `IŞ SENE ${i}`, `IS SENE ${i}`, `Işlän sene ${i}`, `Iş tejribesi sene ${i}`, `Öňki sene ${i}`,
        ], keys), 100);
        const company = toStr(getCell(row, [
          `IŞLÄN ÝERI ${i}`, `ISLAN YERI ${i}`, `Kärhana ${i}`, `Işlän ýeri ${i}`, `Öňki kärhana ${i}`,
        ], keys), 300);
        const direction = toStr(getCell(row, [
          `IŞ UGRY ${i}`, `IS UGRY ${i}`, `Kärhana ugry ${i}`, `Ugry ${i}`,
        ], keys), 200);
        const position = toStr(getCell(row, [
          `IŞ WEZIPESI ${i}`, `IS WEZIPESI ${i}`, `Işlän wezipe ${i}`, `Işlän wezipesi ${i}`,
          `Öňki wezipe ${i}`, `Önki wezipe ${i}`, `Öňki wezipesi ${i}`, `Wezipe tejribe ${i}`,
        ], keys), 200);
        if (years || company || direction || position) {
          rows.push({ years, company, direction, position });
        }
      }
      return rows;
    })(),
    extraData: {
      imported: true,
      ...(desiredPosition ? { desiredPositions: positionParts.slice(0, 8) } : {}),
      hasChildren: toStr(getCell(row, ['ÇAGALAR', 'CAGALAR', 'Cagalar'], keys), 100),
      criminalRecord: toStr(getCell(row, ['SUDA ÇEKILEN ÝAGDAÝY', 'SUDA CEKILEN YAGDAYY'], keys), 100),
      birthDate: toStr(getCell(row, ['DOGLAN SENESI', 'Doglan senesi', 'birthDate'], keys), 40),
      workFrom: toStr(getCell(row, ['IŞ WAGTY BAŞY', 'IS WAGTY BASY', 'workFrom'], keys), 20),
      workTo: toStr(getCell(row, ['IŞ WAGTY SOŇY', 'IS WAGTY SONY', 'workTo'], keys), 20),
    },
  };
};

const mapVacancyRow = (row) => {
  const keys = buildKeyIndex(row);
  // Takyk header — fuzzy bilen "Gerekli işgär sany" / salgy / ugry garyşmaz
  const position = getCellExact(row, [
    'Gerekli işgäri',
    'Gerekli isgari',
    'Gerekli işgär',
    'Wezipe',
    'position',
  ], keys) || getCell(row, ['Wezipe', 'position'], keys);
  const companyName = getCellExact(row, [
    'Kärhananyň ady',
    'Karhananyn ady',
    'companyName',
  ], keys) || getCellExact(row, ['Kärhana', 'Karhana'], keys);
  if (!position && !companyName) return null;

  const numRaw = getCellExact(row, ['Iş №', 'Is №', 'vacancyNumber', '№'], keys)
    || getCell(row, ['Iş №', 'Is №', 'vacancyNumber'], keys);
  let vacancyNumber = parseInt(numRaw, 10);
  if (Number.isNaN(vacancyNumber)) vacancyNumber = null;

  const candidate = getCell(row, ['FAMILÝASY A.A', 'FAMILIYASY A.A', 'Dalaşgär', 'Namzat', 'assignedCandidateName'], keys);
  const assignResult = getCell(row, ['GÜRRÜŇDEŞLIGIŇ NETIJESI', 'GURRUNDESLIGIN NETIJESI', 'Ugradys yagdayy', 'assignmentStatus'], keys);

  return {
    vacancyNumber,
    vacancyDate: excelSerialToDate(getCell(row, ['Sene', 'vacancyDate'], keys)),
    status: normalizeVacancyStatus(
      getCell(row, ['Wakansiýanyň ýagdaýy', 'Wakansiyanyn yagdayy', 'status', 'Yagday'], keys),
    ),
    closeReason: getCell(row, [
      'Wakansiýanyň ýapylmagynyň sebäbi',
      'Wakansiyanyn yapylmagynyn sebabi',
      'closeReason',
    ], keys) || null,
    companyName: companyName ? String(companyName).slice(0, 300) : null,
    position: position ? String(position).slice(0, 200) : null,
    salary: (() => {
      const s = getCell(row, ['Aýlyk haky', 'Aylyk haky', 'salary'], keys);
      return s != null ? String(s).slice(0, 100) : null;
    })(),
    jobDescription: getCell(row, ['Gerekli işgäriň etmeli işi', 'Gerekli isgarin etmeli isi', 'jobDescription'], keys) || null,
    location: getCell(row, ['Kärhananyň ýerleşýän salgysy', 'Karhananyn yerlesyan salgysy', 'location'], keys) || null,
    experience: getCell(row, ['Iş tejribesi', 'Is tejribesi', 'experience'], keys) || null,
    education: getCell(row, ['Bilimi', 'education'], keys) || null,
    languages: getCell(row, ['Bilmeli dilleri', 'languages'], keys) || null,
    computerPrograms: getCell(row, ['Kompýuterde bilmeli programmasy', 'Kompyuterde bilmeli programmasy', 'computerPrograms'], keys) || null,
    ageRange: (() => {
      const a = getCell(row, ['Gerekli ýaşy', 'Gerekli yasy', 'ageRange'], keys);
      return a != null ? String(a).slice(0, 50) : null;
    })(),
    registration: getCell(row, ['Propiskasy', 'registration'], keys) || null,
    gender: getCell(row, ['Jynsy', 'gender'], keys) || null,
    workHours: getCell(row, ['Iş wagty', 'Is wagty', 'workHours'], keys) || null,
    dayOff: getCell(row, ['Dynç güni', 'Dync guni', 'dayOff'], keys) || null,
    services: getCell(row, ['Serwis', 'services'], keys) || null,
    accommodation: getCell(row, ['Ýatak jaý', 'Yatak jay', 'accommodation'], keys) || null,
    companyDirection: getCell(row, ['Kärhananyň ugry', 'Karhananyn ugry', 'companyDirection'], keys) || null,
    workersNeeded: (() => {
      const w = getCell(row, ['Gerekli işgär sany', 'Gerekli isgar sany', 'workersNeeded'], keys);
      return w != null ? String(w).slice(0, 50) : null;
    })(),
    contactPhone: getCell(row, [
      'Kärhananyň telefon belgisi, iş buýryjynyň ady we wezipesi',
      'Karhananyn telefon belgisi, is buyryjynyn ady we wezipe',
      'contactPhone',
    ], keys) || getCellExact(row, ['Telefon'], keys) || null,
    contactName: getCellExact(row, [
      'Jogapkär',
      'İş buýryjy',
      'Is buyryjy',
      'contactName',
    ], keys) || null,
    forumOperator: getCellExact(row, [
      'Operator',
      'Forum operator',
      'Forum operatorý',
      'Forum operatory',
      'Kabul eden',
      'forumOperator',
    ], keys) || null,
    assignedCandidateName: candidate ? String(candidate).slice(0, 200) : null,
    assignmentStatus: assignResult ? String(assignResult).slice(0, 100) : null,
    extraData: {
      imported: true,
      email: getCell(row, ['Kärhananyň email belgisi', 'email'], keys) || null,
      anketaNumber: getCell(row, ['Anketa nomeri'], keys) || null,
    },
  };
};

const BATCH = 100;
const UPSERT_CONCURRENCY = 24;

const chunk = (arr, size) => {
  const out = [];
  const n = Math.max(1, Number(size) || 1);
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** Çäklendirilen parallel iş — N+1 soraglary tizleşdirýär */
async function mapPool(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length));
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(list[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function foldOperatorName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-яөүәңҗһ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyExcelPlacementMark(data, mark) {
  if (!data || !mark) return data;
  const today = new Date().toISOString().slice(0, 10);
  if (mark === 'us') {
    data.status = 'Isleyar';
    data.closedReason = PLACED_BY_US_REASON;
    if (!data.employmentDate) data.employmentDate = data.formDate || today;
  } else if (mark === 'self') {
    data.status = 'Isleyar';
    data.closedReason = SELF_PLACED_REASON;
    if (!data.employmentDate) data.employmentDate = data.formDate || today;
  }
  return data;
}

/** Reňk ýok bolsa sebäp sütünden; sebäp tekstini standartlaşdyr */
function resolvePlacementMark(data, colorMark) {
  let mark = colorMark || placementMarkFromReason(data?.closedReason) || null;
  if (!mark && data?.status === 'Isleyar' && isPlacedByUsReason(data.closedReason)) mark = 'us';
  if (!mark && data?.status === 'Isleyar' && isSelfPlacedReason(data.closedReason)) mark = 'self';
  return mark;
}

class ExcelService {
  async importAnketas(buffer) {
    const packed = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    const { xlsxBuffer, zip } = await unpackAnketaImportArchive(packed);
    const buf = xlsxBuffer;
    let rows;
    let colorSkipped = false;
    try {
      // Ýaşyl/gyzyl hemişe okalmaly — uly faýlda hem (ANKETA BAZA)
      rows = await readAnketaSheetRowsWithColors(buf, {
        preferredSheets: ['BAZA'],
        maxCols: 200,
      });
    } catch (colorErr) {
      console.warn('Excel reňk okalmadý, adaty import:', colorErr.message);
      colorSkipped = true;
      rows = readSheetRows(buf, {
        preferredSheets: ['BAZA'],
        maxCols: 200,
      }).map((row) => ({ ...row, _placementMark: null }));
    }

    const mapped = [];
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      try {
        const data = mapAnketaRow(rows[i], i);
        if (!data) {
          skipped += 1;
          continue;
        }
        const mark = resolvePlacementMark(data, rows[i]?._placementMark || null);
        applyExcelPlacementMark(data, mark);
        mapped.push(data);
      } catch (err) {
        errors.push(`Setir ${i + 2}: ${err.message}`);
      }
    }

    // Ýüklenensoň № awto: 26/2/78 (ýyl / aý / şu aýdaky tertip). Excel-de dogry № bar bolsa saklanýar.
    const allocNumber = await createAnketaNumberAllocator(Anketa);
    for (const m of mapped) {
      if (needsAutoAnketaNumber(m.anketaNumber)) {
        m.anketaNumber = await allocNumber(m.formDate || new Date());
      }
    }

    // Deduplicate by anketaNumber — ähli wezipeleri « / » bilen sakla (soňky setir ýitmesin)
    const byNumber = new Map();
    mapped.forEach((m) => {
      const num = normalizeAnketaNumberKey(m.anketaNumber) || String(m.anketaNumber || '').trim();
      if (!num) return;
      m.anketaNumber = num;
      const prev = byNumber.get(num);
      byNumber.set(num, prev ? mergeDesiredPositionPayload(prev, m) : { ...m, anketaNumber: num });
    });
    const unique = [...byNumber.values()];
    const importNumbers = unique.map((u) => u.anketaNumber).filter(Boolean);

    // Dedup-dan soň sanaw — ýaşyl/gyzyl netije
    let markedUs = 0;
    let markedSelf = 0;
    unique.forEach((u) => {
      if (isPlacedByUsReason(u.closedReason)) markedUs += 1;
      else if (isSelfPlacedReason(u.closedReason)) markedSelf += 1;
    });

    // Öçürilen №-ler unique indeksi eýeleýär — import öňünden dikelt
    for (const part of chunk(importNumbers, 400)) {
      await sequelize.query(
        `UPDATE anketas SET deleted_at = NULL
         WHERE deleted_at IS NOT NULL AND anketa_number IN (:nums)`,
        { replacements: { nums: part } },
      );
    }

    // Diňe import №-leri — ähli bazany ýükleme (köne findAll haýaldýardy)
    const existingByKey = new Map();
    for (const part of chunk(importNumbers, 300)) {
      const variants = [...new Set(part.flatMap((n) => anketaNumberVariants(n)))];
      if (!variants.length) continue;
      const existingRows = await Anketa.findAll({
        attributes: [
          'id', 'anketaNumber', 'desiredPosition', 'extraData',
          'workExperience', 'educationDetails',
        ],
        where: { anketaNumber: { [Op.in]: variants } },
        paranoid: false,
        order: [['id', 'ASC']],
      });
      existingRows.forEach((row) => {
        const j = row.toJSON ? row.toJSON() : row;
        const key = normalizeAnketaNumberKey(j.anketaNumber) || String(j.anketaNumber || '').trim();
        if (!key || existingByKey.has(key)) return;
        existingByKey.set(key, j);
      });
    }

    let created = 0;
    let updated = 0;

    const preparePayload = (row, prev = null) => {
      const merged = prev ? mergeDesiredPositionPayload(prev, row) : { ...row };
      const extra = merged.extraData && typeof merged.extraData === 'object' ? { ...merged.extraData } : {};
      if (merged.desiredPosition) {
        const parts = uniqueDesiredPositions([
          ...splitDesiredPositionList(merged.desiredPosition),
          ...(Array.isArray(extra.desiredPositions) ? extra.desiredPositions : []),
        ]);
        if (parts.length) {
          extra.desiredPositions = parts.slice(0, 8);
          merged.desiredPosition = parts.join(' / ');
        }
      }
      // Excel-de öňki wezipe boş bolsa — bazadaky iş tejribesini pozma
      const nextExp = parseJsonList(merged.workExperience);
      const prevExp = parseJsonList(prev?.workExperience);
      if (!nextExp.length && prevExp.length) merged.workExperience = prevExp;
      else merged.workExperience = nextExp;

      const nextEdu = parseJsonList(merged.educationDetails);
      const prevEdu = parseJsonList(prev?.educationDetails);
      if (!nextEdu.length && prevEdu.length) merged.educationDetails = prevEdu;
      else merged.educationDetails = nextEdu;

      delete merged.id;
      delete merged.createdAt;
      delete merged.updatedAt;
      delete merged.deletedAt;
      delete merged.deleted_at;
      merged.extraData = extra;
      merged.anketaNumber = normalizeAnketaNumberKey(merged.anketaNumber) || merged.anketaNumber;
      return merged;
    };

    const toCreate = [];
    const toUpdate = [];
    unique.forEach((data) => {
      const key = normalizeAnketaNumberKey(data.anketaNumber) || data.anketaNumber;
      const prev = existingByKey.get(key) || null;
      const payload = preparePayload(data, prev);
      if (prev?.id) toUpdate.push({ id: Number(prev.id), payload, num: key });
      else toCreate.push({ payload, num: key });
    });

    for (const batch of chunk(toUpdate, BATCH)) {
      await mapPool(batch, UPSERT_CONCURRENCY, async ({ id, payload, num }) => {
        try {
          await Anketa.update(payload, { where: { id }, paranoid: false });
          existingByKey.set(num, { id, anketaNumber: num, ...payload });
          updated += 1;
        } catch (err) {
          errors.push(`${num}: ${err.message}`);
        }
      });
    }

    for (const batch of chunk(toCreate, BATCH)) {
      try {
        const createdRows = await Anketa.bulkCreate(
          batch.map((b) => b.payload),
          { validate: false, hooks: false },
        );
        createdRows.forEach((row, idx) => {
          const num = batch[idx]?.num;
          if (!num) return;
          existingByKey.set(num, { id: row.id, anketaNumber: num, ...batch[idx].payload });
        });
        created += createdRows.length;
      } catch (bulkErr) {
        // Unique / validate — setir-setir (galanlar ýitmesin)
        await mapPool(batch, UPSERT_CONCURRENCY, async ({ payload, num }) => {
          try {
            const createdRow = await Anketa.create(payload);
            created += 1;
            existingByKey.set(num, { id: createdRow.id, anketaNumber: num, ...payload });
          } catch (e2) {
            try {
              const again = await Anketa.findOne({
                where: { anketaNumber: { [Op.in]: anketaNumberVariants(num) } },
                paranoid: false,
                order: [['id', 'ASC']],
              });
              if (again) {
                await Anketa.update(payload, { where: { id: again.id }, paranoid: false });
                existingByKey.set(num, { id: again.id, anketaNumber: num, ...payload });
                updated += 1;
                return;
              }
            } catch (_) { /* ignore */ }
            errors.push(`${num}: ${e2.message}`);
          }
        });
      }
    }

    const photos = await attachPhotosFromImportZip(zip);

    return {
      total: rows.length,
      created,
      updated,
      skipped,
      unique: unique.length,
      markedUs,
      markedSelf,
      colorSkipped,
      photosLinked: Number(photos.linked) || 0,
      photosSkipped: Number(photos.skippedHasPhoto) || 0,
      photosUnmatched: Number(photos.unmatched) || 0,
      photosTotal: Number(photos.filesTotal) || 0,
      errors: errors.slice(0, 30),
    };
  }

  async importVacancies(buffer, options = {}) {
    // Only first ~35 columns: vacancy fields + first candidate block (avoids 2000+ cols OOM)
    const rows = readSheetRows(buffer, {
      preferredSheets: ['Лист1', 'List1', 'BAZA'],
      maxCols: 35,
    });

    const operatorMode = String(options.operatorMode || 'force').toLowerCase() === 'excel'
      ? 'excel'
      : 'force';

    const forcedOperatorId = options.acceptedByUserId
      ? Number(options.acceptedByUserId)
      : null;

    let forcedOperator = null;
    if (operatorMode === 'force') {
      if (!forcedOperatorId) {
        throw new ApiError(400, 'Forum operator saýlaň');
      }
      forcedOperator = await getVacancyService().resolveForumOperator(
        { acceptedByUserId: forcedOperatorId },
        null,
      );
      if (!forcedOperator.acceptedByUserId) {
        throw new ApiError(400, 'Saýlanan forum operator tapylmady');
      }
    }

    // Excel mode: operatorlary bir gezek ýükle (her setirde findAll däl)
    let staffByFold = null;
    if (operatorMode === 'excel') {
      const staffList = await User.findAll({
        where: { isActive: true, role: 'operator' },
        attributes: ['id', 'fullName', 'username', 'role', 'isActive'],
      });
      staffByFold = new Map();
      staffList.forEach((u) => {
        const byName = foldOperatorName(u.fullName);
        const byUser = foldOperatorName(u.username);
        if (byName) staffByFold.set(byName, u);
        if (byUser) staffByFold.set(byUser, u);
      });
    }

    const mapped = [];
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      try {
        const data = mapVacancyRow(rows[i]);
        if (!data) {
          skipped += 1;
          continue;
        }
        if (forcedOperator) {
          data.acceptedByUserId = forcedOperator.acceptedByUserId;
          data.forumOperator = forcedOperator.forumOperator;
        }
        mapped.push(data);
      } catch (err) {
        errors.push(`Setir ${i + 2}: ${err.message}`);
      }
    }

    let operatorsLinked = 0;
    let operatorsUnmatched = 0;
    const resolvedRaw = [];

    for (let i = 0; i < mapped.length; i += 1) {
      const row = mapped[i];
      try {
        let operator;
        if (forcedOperator) {
          operator = {
            acceptedByUserId: forcedOperator.acceptedByUserId,
            forumOperator: forcedOperator.forumOperator,
          };
          operatorsLinked += 1;
        } else {
          const want = foldOperatorName(row.forumOperator);
          const staff = want && staffByFold ? staffByFold.get(want) : null;
          if (staff) {
            operator = {
              acceptedByUserId: staff.id,
              forumOperator: staff.fullName || staff.username,
            };
            operatorsLinked += 1;
          } else {
            operator = { acceptedByUserId: null, forumOperator: row.forumOperator || null };
            if (row.forumOperator) operatorsUnmatched += 1;
          }
        }
        if (!operator.acceptedByUserId) {
          errors.push(
            `Excel № ${row.vacancyNumber || '?'}: `
            + `Forum operator tapylmady («${row.forumOperator || ''}») — setir geçirildi`,
          );
          skipped += 1;
          continue;
        }
        const contact = await getVacancyService().enrichContactFromDb({
          contactName: row.contactName,
          contactPhone: row.contactPhone,
          contactAnketaId: row.contactAnketaId,
        });
        resolvedRaw.push({
          ...row,
          ...operator,
          ...contact,
          _excelVacancyNumber: row.vacancyNumber,
        });
      } catch (err) {
        errors.push(`Setir operator: ${err.message}`);
      }
    }

    // Bir Excel içinde şol bir açar → soňky setir
    const byKey = new Map();
    resolvedRaw.forEach((m) => {
      byKey.set(vacancyImportKey(m), m);
    });
    const resolved = [...byKey.values()];

    // Operator wakansiýalaryny bir gezek ýükle — her setirde findOne däl
    const opIds = [...new Set(resolved.map((r) => Number(r.acceptedByUserId)).filter(Boolean))];
    const existingByExcel = new Map();
    const existingByFp = new Map();
    if (opIds.length) {
      const existingRows = await Vacancy.findAll({
        where: { acceptedByUserId: { [Op.in]: opIds } },
        attributes: [
          'id', 'acceptedByUserId', 'companyName', 'position',
          'vacancyDate', 'salary', 'location', 'extraData', 'vacancyNumber',
        ],
        order: [['id', 'ASC']],
      });
      existingRows.forEach((row) => {
        const j = row.toJSON ? row.toJSON() : row;
        const op = j.acceptedByUserId || 0;
        const excelNo = j.extraData && j.extraData.excelVacancyNumber != null
          ? j.extraData.excelVacancyNumber
          : null;
        if (excelNo != null && excelNo !== '') {
          const k = `e:${op}:${excelNo}`;
          if (!existingByExcel.has(k)) existingByExcel.set(k, row);
        }
        const date = j.vacancyDate ? String(j.vacancyDate).slice(0, 10) : '';
        const fp = `f:${op}:${normText(j.companyName)}|${normText(j.position)}|${date}|${normText(j.salary)}|${normText(j.location)}`;
        if (!existingByFp.has(fp)) existingByFp.set(fp, row);
      });
    }

    const findCachedExisting = (row) => {
      const op = row.acceptedByUserId || 0;
      const excelNo = row._excelVacancyNumber;
      if (excelNo != null && excelNo !== '') {
        const hit = existingByExcel.get(`e:${op}:${excelNo}`);
        if (hit) return hit;
      }
      const date = row.vacancyDate ? String(row.vacancyDate).slice(0, 10) : '';
      const fp = `f:${op}:${normText(row.companyName)}|${normText(row.position)}|${date}|${normText(row.salary)}|${normText(row.location)}`;
      return existingByFp.get(fp) || null;
    };

    // Diňe TÄZE setirlere soňky №-den dowam
    let nextNum = await getNextVacancyNumber(Vacancy);

    let created = 0;
    let updated = 0;
    let skippedDuplicates = 0;
    const numberAssigned = [];
    const createPayloads = [];
    const updateJobs = [];

    for (const row of resolved) {
      const excelNo = row._excelVacancyNumber;
      const existing = findCachedExisting(row);
      const extraData = {
        ...(row.extraData && typeof row.extraData === 'object' ? row.extraData : {}),
        imported: true,
        excelVacancyNumber: excelNo != null ? excelNo : null,
      };

      const { _excelVacancyNumber, vacancyNumber: _ignoreNum, ...rest } = row;
      const payload = {
        ...rest,
        extraData,
      };
      delete payload.vacancyNumber;

      if (existing) {
        updateJobs.push({ id: existing.id, payload, excelNo });
      } else {
        const vacancyNumber = nextNum;
        nextNum += 1;
        createPayloads.push({ ...payload, vacancyNumber, _excelNo: excelNo });
        numberAssigned.push(vacancyNumber);
      }
    }

    for (const batch of chunk(updateJobs, BATCH)) {
      await mapPool(batch, UPSERT_CONCURRENCY, async ({ id, payload, excelNo }) => {
        try {
          await Vacancy.update(payload, { where: { id } });
          updated += 1;
          skippedDuplicates += 1;
        } catch (err) {
          errors.push(`Excel № ${excelNo || '?'}: ${err.message}`);
        }
      });
    }

    for (const batch of chunk(createPayloads, BATCH)) {
      try {
        const clean = batch.map(({ _excelNo, ...rest }) => rest);
        await Vacancy.bulkCreate(clean, { validate: false, hooks: false });
        created += clean.length;
      } catch (bulkErr) {
        await mapPool(batch, UPSERT_CONCURRENCY, async (item) => {
          const { _excelNo, ...payload } = item;
          try {
            await Vacancy.create(payload);
            created += 1;
          } catch (err) {
            errors.push(`Excel № ${_excelNo || '?'}: ${err.message}`);
          }
        });
      }
    }

    const numberFrom = numberAssigned.length ? Math.min(...numberAssigned) : null;
    const numberTo = numberAssigned.length ? Math.max(...numberAssigned) : null;

    return {
      total: rows.length,
      created,
      updated,
      skipped,
      skippedDuplicates,
      unique: resolved.length,
      numberFrom,
      numberTo,
      operatorsLinked,
      operatorsUnmatched,
      forumOperator: forcedOperator?.forumOperator || null,
      acceptedByUserId: forcedOperator?.acceptedByUserId || null,
      operatorMode,
      errors: errors.slice(0, 30),
    };
  }

  /**
   * Export üçin ýyl/aý — diňe maglumatly döwürler + anketa sanlary.
   * @returns {{ years: number[], monthsByYear: Record<string, number[]>, counts: Record<string, Record<string, number>>, total: number }}
   */
  async listExportPeriods() {
    const map = new Map();
    const counts = {};

    const bumpCount = (y, m, n) => {
      const ys = String(y);
      if (!counts[ys]) counts[ys] = { all: 0 };
      const key = m == null ? 'all' : String(m);
      counts[ys][key] = (counts[ys][key] || 0) + n;
      if (m != null) counts[ys].all = (counts[ys].all || 0) + n;
    };

    try {
      const anketaRows = await sequelize.query(
        `SELECT split_part(anketa_number, '/', 1) AS yy,
                split_part(anketa_number, '/', 2) AS mm,
                COUNT(*)::int AS cnt
         FROM anketas
         WHERE deleted_at IS NULL
           AND anketa_number ~ '^[0-9]{2,4}/[0-9]{1,2}/'
         GROUP BY 1, 2`,
        { type: QueryTypes.SELECT },
      );
      anketaRows.forEach((r) => {
        addPeriod(map, r.yy, r.mm);
        const y = normalizeYearPart(r.yy);
        const m = Number(r.mm);
        if (y && m >= 1 && m <= 12) bumpCount(y, m, Number(r.cnt) || 0);
      });
    } catch (_) { /* ignore */ }

    try {
      const { index } = scanFolder.getIndex();
      for (const filePath of new Set(index.values())) {
        const stem = path.basename(filePath, path.extname(filePath));
        const parts = parseAnketaNumberParts(stem);
        if (parts) addPeriod(map, parts.y, parts.m);
      }
      const root = scanFolder.getScanRoot();
      if (fs.existsSync(root)) {
        const top = fs.readdirSync(root, { withFileTypes: true });
        for (const ent of top) {
          if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
          const y = normalizeYearPart(ent.name);
          if (!y) continue;
          const sub = fs.readdirSync(path.join(root, ent.name), { withFileTypes: true });
          for (const child of sub) {
            if (child.isDirectory()) {
              addPeriod(map, y, child.name);
            } else {
              const parts = parseAnketaNumberParts(path.basename(child.name, path.extname(child.name)));
              if (parts) addPeriod(map, parts.y || y, parts.m);
            }
          }
        }
      }
    } catch (_) { /* ignore */ }

    const years = [...map.keys()]
      .filter((y) => y >= EXPORT_YEAR_MIN && y <= new Date().getFullYear())
      .sort((a, b) => b - a);
    const monthsByYear = {};
    years.forEach((y) => {
      monthsByYear[String(y)] = [...map.get(y)].sort((a, b) => a - b);
    });
    const filteredCounts = {};
    years.forEach((y) => {
      const ys = String(y);
      if (counts[ys]) filteredCounts[ys] = counts[ys];
    });
    let total = 0;
    try {
      const [row] = await sequelize.query(
        `SELECT COUNT(*)::int AS cnt FROM anketas WHERE deleted_at IS NULL`,
        { type: QueryTypes.SELECT },
      );
      total = Number(row?.cnt) || 0;
    } catch (_) {
      Object.values(filteredCounts).forEach((c) => { total += Number(c.all) || 0; });
    }
    let vacancyTotal = 0;
    try {
      const [vrow] = await sequelize.query(
        `SELECT COUNT(*)::int AS cnt FROM vacancies WHERE deleted_at IS NULL`,
        { type: QueryTypes.SELECT },
      );
      vacancyTotal = Number(vrow?.cnt) || 0;
    } catch (_) { /* ignore */ }
    return { years, monthsByYear, counts: filteredCounts, total, vacancyTotal };
  }

  async exportAnketas(filters = {}) {
    const where = buildAnketaExportWhere(filters);

    const items = await Anketa.findAll({
      where,
      order: [['id', 'ASC']],
    });

    if (!items.length) {
      return { buffer: null, count: 0, photoCount: 0, format: 'xlsx' };
    }

    const LANG_COLS = [
      ['TÜRKMEN', 'Türkmen'],
      ['RUS', 'Rus'],
      ['IŇLIS', 'Iňlis'],
      ['TÜRK', 'Türk'],
      ['NEMES', 'Nemes'],
      ['FRANSUZ', 'Fransuz'],
      ['HYTAÝ', 'Hytaý'],
      ['ÝEWREÝÇA', 'Ýewreý'],
      ['PARS', 'Pars'],
      ['Özbek', 'Özbek'],
      ['Azerbaýjan', 'Azerbeýjan'],
    ];

    const PROG_EXPORT = [
      'MS WORD', 'EXCEL', 'INTERNET', 'ORG. TEHNIKA', 'LOGO', '1С БУХГАЛ.',
      'PHOTOSHOP', 'PAGE MAKER', 'COREL DRAW', 'AUTO CAD', '3D MAX', 'ARCHI CAD',
      'SQL', 'ILLUSTRATOR', 'POWER POINT', '1 C KADR', 'ACCES', 'MOVAVI',
    ];

    const skillHit = (skills, name) => {
      const list = Array.isArray(skills) ? skills : [];
      const want = normalizeKey(name);
      return list.some((p) => {
        const s = normalizeKey(p);
        return s === want || s.includes(want) || want.includes(s);
      });
    };

    const padEdu = (arr, n = 5) => {
      const list = parseJsonList(arr).slice();
      while (list.length < n) list.push({});
      return list.slice(0, n);
    };
    const padExp = (arr, n = 6) => {
      const list = parseJsonList(arr).slice();
      while (list.length < n) list.push({});
      return list.slice(0, n);
    };

    const rows = items.map((a) => {
      const langMap = {};
      (Array.isArray(a.languages) ? a.languages : []).forEach((l) => {
        if (typeof l === 'string') langMap[normalizeKey(l)] = 'V';
        else if (l?.name) langMap[normalizeKey(l.name)] = l.level || 'V';
      });

      const edu = padEdu(a.educationDetails, 5);
      const exp = padExp(a.workExperience, 6);
      let xd = a.extraData;
      if (typeof xd === 'string') {
        try { xd = JSON.parse(xd); } catch { xd = {}; }
      }
      if (!xd || typeof xd !== 'object') xd = {};

      const posList = extractOrderedPositions({
        ...a,
        extraData: xd,
        desiredPosition: a.desiredPosition,
      });
      const row = {
        SENE: a.formDate || '',
        'ANKETA №': a.anketaNumber || '',
        WEZIPESI: posList[0] || '',
        'WEZIPESI 2': posList[1] || '',
        'WEZIPESI 3': posList.slice(2).join(' / ') || '',
        'HÄZIRKI ÝAGDAÝY': a.status || '',
        'IŞLEÝÄN SENESI': a.employmentDate || '',
        'ÝAPYLANLYGYNYŇ SEBÄBI': a.closedReason || '',
        FAMILIÝASY: a.familyName || '',
        ADY: a.firstName || '',
        'ATASYNYŇ ADY': a.patronymic || '',
        'DOGLAN ÝYLY': a.birthYear || '',
        'DOGLAN SENESI': xd.birthDate || '',
        JYNSY: a.gender || '',
        TELEFONY: a.phone || '',
        'E-MAIL': a.email || '',
        'Ýazgyda duran şäheri': a.registrationCity || '',
        'ÝAZGYDA DURAN ÝERI': a.registrationAddress || '',
        'HÄZIRKI ÝAŞAÝAN ÝERI': a.currentAddress || '',
        'ISLEÝÄN AÝLYK HAKY': a.currentSalary || '',
        'SÜRÜJILIK Ş-NAMA': a.drivingLicense || '',
        'ŞAHSY AWTOULAGY': a.hasCar || '',
        'BAŞGA ŞÄHERE GIDIP IŞLEMEK': a.willingToRelocate || '',
        'WAHTALA-ÝYN IŞLEMEK': a.partTimeWork || '',
        'IŞ GRAFIGI': a.workSchedule || '',
        'IŞ WAGTY BAŞY': xd.workFrom || '',
        'IŞ WAGTY SOŇY': xd.workTo || '',
        'DOGLAN ÝERI': a.birthPlace || '',
        MILLETI: a.nationality || '',
        'MAŞGALA ÝAGDAÝY': a.maritalStatus || '',
        'SUDA ÇEKILEN ÝAGDAÝY': xd.criminalRecord || '',
        'HARBY BILET': a.militaryService || '',
        BILIMI: a.educationLevel || '',
        ÇAGALAR: xd.hasChildren || '',
        'PASPORT №': a.passportNumber || '',
        'PASPORT BERLEN': a.passportIssued || '',
        BELLIK: a.notes || '',
      };

      edu.forEach((e, i) => {
        const n = i + 1;
        row[`OKUW ÝYLY ${n}`] = e.years || e.year || '';
        row[`OKUW JAÝY ${n}`] = e.school || e.institution || '';
        row[`HÜNÄRI ${n}`] = e.specialty || '';
      });

      exp.forEach((e, i) => {
        const n = i + 1;
        row[`IŞ SENE ${n}`] = expYears(e);
        row[`IŞLÄN ÝERI ${n}`] = expCompany(e);
        row[`IŞ UGRY ${n}`] = expDirection(e);
        row[`IŞ WEZIPESI ${n}`] = expPosition(e);
      });

      LANG_COLS.forEach(([col, name]) => {
        row[col] = langMap[normalizeKey(name)] || '';
      });

      PROG_EXPORT.forEach((col) => {
        row[col] = skillHit(a.computerSkills, col) ? 'V' : '';
      });

      return row;
    });

    const xlsxBuffer = await buildWorkbookBuffer(rows, 'BAZA', {
      tableName: 'AnketaBaza',
      colWidths: {
        WEZIPESI: 22,
        'WEZIPESI 2': 22,
        'WEZIPESI 3': 22,
        'ÝAZGYDA DURAN ÝERI': 40,
        'HÄZIRKI ÝAŞAÝAN ÝERI': 40,
        'ÝAPYLANLYGYNYŇ SEBÄBI': 24,
        TELEFONY: 14,
        'OKUW JAÝY 1': 28,
        'OKUW JAÝY 2': 28,
        'OKUW JAÝY 3': 28,
        'IŞLÄN ÝERI 1': 28,
        'IŞLÄN ÝERI 2': 28,
        'IŞLÄN ÝERI 3': 28,
        'IŞ WEZIPESI 1': 22,
        BELLIK: 36,
      },
    });

    const withPhotos = filters.withPhotos === true
      || filters.withPhotos === 1
      || String(filters.withPhotos || '').toLowerCase() === '1'
      || String(filters.withPhotos || '').toLowerCase() === 'true';

    if (!withPhotos) {
      return { buffer: xlsxBuffer, count: items.length, photoCount: 0, format: 'xlsx' };
    }

    const JSZip = require('jszip');
    const zip = new JSZip();
    const suffixY = filters.year ? String(filters.year) : '';
    const suffixM = filters.month ? String(filters.month).padStart(2, '0') : '';
    let xlsxName = 'ANKETA_BAZA.xlsx';
    if (suffixY && suffixM) xlsxName = `ANKETA_BAZA_${suffixY}_${suffixM}.xlsx`;
    else if (suffixY) xlsxName = `ANKETA_BAZA_${suffixY}.xlsx`;
    zip.file(xlsxName, xlsxBuffer);

    let photoCount = 0;
    const usedNames = new Set([xlsxName]);
    for (const a of items) {
      let files = [];
      try {
        files = collectAnketaPhotoFiles(a);
      } catch (e) {
        console.warn('Surat ýygnamak:', e.message);
      }
      for (const f of files) {
        let zipName = f.zipName.replace(/\\/g, '/');
        if (usedNames.has(zipName)) {
          const ext = path.posix.extname(zipName) || '.jpg';
          const base = zipName.slice(0, -ext.length);
          let i = 2;
          while (usedNames.has(`${base}_${i}${ext}`)) i += 1;
          zipName = `${base}_${i}${ext}`;
        }
        usedNames.add(zipName);
        try {
          zip.file(zipName, fs.readFileSync(f.abs));
          photoCount += 1;
        } catch (e) {
          console.warn('ZIP surat:', zipName, e.message);
        }
      }
    }

    // 3×4 → anketa_kici_suratlar (skan suratlar/ galýar)
    let folderCopy = { copied: 0, folderPath: '', errors: [] };
    try {
      const portrait = require('./anketaPortraitFolderService');
      const outFolder = portrait.ensureFolder();
      folderCopy = copyAnketaPhotosToFolder(items, outFolder, { portraitsOnly: true });
    } catch (e) {
      console.warn('Papka export:', e.message);
    }

    let zipBuffer;
    try {
      zipBuffer = Buffer.from(await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 1 },
      }));
    } catch (e) {
      console.warn('ZIP export şowsuz, diňe Excel:', e.message);
      return {
        buffer: xlsxBuffer,
        count: items.length,
        photoCount: 0,
        folderCopied: folderCopy.copied || folderCopy.copied || 0,
        folderPath: folderCopy.folderPath || folderCopy.folderPath || '',
        format: 'xlsx',
      };
    }

    return {
      buffer: zipBuffer,
      count: items.length,
      photoCount,
      folderCopied: folderCopy.copied || 0,
      folderPath: folderCopy.folderPath || '',
      format: 'zip',
    };
  }

  async exportVacancies(filters = {}) {
    const andParts = [];
    const acceptedByUserId = filters.acceptedByUserId
      ? Number(filters.acceptedByUserId)
      : null;
    const forumOperator = String(filters.forumOperator || '').trim();
    const ids = Array.isArray(filters.acceptedByUserIds)
      ? filters.acceptedByUserIds.map(Number).filter((n) => n > 0)
      : [];

    if (acceptedByUserId) {
      andParts.push({ acceptedByUserId });
    } else if (ids.length) {
      andParts.push({ acceptedByUserId: { [Op.in]: ids } });
    } else if (forumOperator) {
      andParts.push({
        [Op.or]: [
        { forumOperator: { [Op.iLike]: forumOperator } },
        { forumOperator: { [Op.iLike]: `%${forumOperator}%` } },
        ],
      });
    }

    const dateFilter = buildDateRangeFilter('vacancyDate', filters);
    if (dateFilter) andParts.push(dateFilter);

    const where = andParts.length ? { [Op.and]: andParts } : {};

    const items = await Vacancy.findAll({
      where,
      include: [{
        model: User,
        as: 'acceptedBy',
        attributes: ['id', 'fullName', 'username'],
        required: false,
      }],
      order: [['vacancyNumber', 'ASC'], ['id', 'ASC']],
    });

    if (!items.length) {
      return { buffer: null, count: 0 };
    }

    const VACANCY_EXPORT_COLS = [
      'Operator',
      'Iş №',
      'Sene',
      'Wakansiýanyň ýagdaýy',
      'Wakansiýanyň ýapylmagynyň sebäbi',
      'Kärhananyň ady',
      'Gerekli işgäri',
      'Aýlyk haky',
      'Gerekli işgäriň etmeli işi',
      'Kärhananyň ýerleşýän salgysy',
      'Iş tejribesi',
      'Bilimi',
      'Bilmeli dilleri',
      'Kompýuterde bilmeli programmasy',
      'Gerekli ýaşy',
      'Propiskasy',
      'Jynsy',
      'Iş wagty',
      'Dynç güni',
      'Serwis',
      'Ýatak jaý',
      'Kärhananyň ugry',
      'Gerekli işgär sany',
      'Kärhananyň telefon belgisi, iş buýryjynyň ady we wezipesi',
      'Kärhananyň email belgisi',
      'FAMILÝASY A.A',
      'GÜRRÜŇDEŞLIGIŇ NETIJESI',
      'Anketa nomeri',
    ];

    const rows = items.map((v) => {
      const opName = v.acceptedBy?.fullName
        || v.acceptedBy?.username
        || v.forumOperator
        || '';
      const raw = {
        Operator: opName,
        'Iş №': v.vacancyNumber || '',
        Sene: v.vacancyDate || '',
        'Wakansiýanyň ýagdaýy': v.status || '',
        'Wakansiýanyň ýapylmagynyň sebäbi': v.closeReason || '',
        'Kärhananyň ady': v.companyName || '',
        'Gerekli işgäri': v.position || '',
        'Aýlyk haky': v.salary || '',
        'Gerekli işgäriň etmeli işi': v.jobDescription || '',
        'Kärhananyň ýerleşýän salgysy': v.location || '',
        'Iş tejribesi': v.experience || '',
        Bilimi: v.education || '',
        'Bilmeli dilleri': v.languages || '',
        'Kompýuterde bilmeli programmasy': v.computerPrograms || '',
        'Gerekli ýaşy': v.ageRange || '',
        Propiskasy: v.registration || '',
        Jynsy: v.gender || '',
        'Iş wagty': v.workHours || '',
        'Dynç güni': v.dayOff || '',
        Serwis: v.services || '',
        'Ýatak jaý': v.accommodation || '',
        'Kärhananyň ugry': v.companyDirection || '',
        'Gerekli işgär sany': v.workersNeeded || '',
        'Kärhananyň telefon belgisi, iş buýryjynyň ady we wezipesi': v.contactPhone || '',
        'Kärhananyň email belgisi': v.extraData?.email || '',
        'FAMILÝASY A.A': v.assignedCandidateName || '',
        'GÜRRÜŇDEŞLIGIŇ NETIJESI': v.assignmentStatus || '',
        'Anketa nomeri': v.extraData?.anketaNumber || '',
      };
      // Tertip berk: A = Operator (JS key order ýitmesin)
      const ordered = {};
      VACANCY_EXPORT_COLS.forEach((k) => { ordered[k] = raw[k] == null ? '' : raw[k]; });
      return ordered;
    });

    return {
      buffer: await buildWorkbookBuffer(rows, 'Лист1', {
        tableName: 'Wakansiyalar',
        columnOrder: VACANCY_EXPORT_COLS.slice(),
        colWidths: {
          Operator: 18,
          'Kärhananyň ady': 28,
          'Gerekli işgäri': 22,
          'Gerekli işgäriň etmeli işi': 36,
          'Kärhananyň ýerleşýän salgysy': 32,
          'Kärhananyň telefon belgisi, iş buýryjynyň ady we wezipesi': 36,
        },
      }),
      count: items.length,
    };
  }

  async exportFees(filters = {}) {
    const { items, period, totals } = await feePaymentService.listForExport(filters);

    const fmtDate = (raw) => {
      const s = String(raw || '').trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return s || '';
      return `${m[3]}.${m[2]}.${m[1].slice(-2)}`;
    };

    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    // Tölegler tablisasyndaky tertip (Hereket sütüni Excel-de ýok)
    const emptyRow = {
      'Işe başlan': '',
      'Ýagdaý': '',
      'Işden çykan': '',
      'Dalaşgär': '',
      'Anketa №': '',
      'Kärhana': '',
      'Wezipe': '',
      'Aýlyk': '',
      'Almaly': '',
      'Alnan pul': '',
      'Galdy': '',
      'Töleg ýagdaýy': '',
      'Aýlyk alýan senesi': '',
      'Işgär': '',
    };

    const summaryRows = items.length
      ? items.map((row) => ({
        'Işe başlan': fmtDate(row.workStartDate || row.employmentDate),
        'Ýagdaý': feePaymentService.workStatusLabel(row.workStatus),
        'Işden çykan': row.workStatus === 'left' ? fmtDate(row.leftDate) : '',
        'Dalaşgär': row.name || '',
        'Anketa №': row.anketaNumber || '',
        'Kärhana': row.companyName || '',
        'Wezipe': row.position || '',
        'Aýlyk': num(row.salary),
        'Almaly': num(row.expectedFee),
        'Alnan pul': num(row.paid),
        'Galdy': num(row.remaining),
        'Töleg ýagdaýy': feePaymentService.payStatusLabel(row.payStatus),
        'Aýlyk alýan senesi': fmtDate(row.salaryReceiveDate),
        'Işgär': row.operatorName || '',
      }))
      : [emptyRow];

    if (items.length && totals) {
      summaryRows.push({
        'Işe başlan': '',
        'Ýagdaý': '',
        'Işden çykan': '',
        'Dalaşgär': 'Jemi',
        'Anketa №': '',
        'Kärhana': '',
        'Wezipe': '',
        'Aýlyk': '',
        'Almaly': num(totals.expectedFee),
        'Alnan pul': num(totals.paid),
        'Galdy': num(totals.remaining),
        'Töleg ýagdaýy': '',
        'Aýlyk alýan senesi': '',
        'Işgär': '',
      });
    }

    const periodSuffix = period?.from && period?.to
      ? `_${period.from}_${period.to}`
      : '';
    return {
      buffer: await buildWorkbookBufferMulti([{
        sheetName: 'Tölegler',
        rows: summaryRows,
        options: {
          tableName: 'Tolegler',
          colWidths: {
            'Işe başlan': 12,
            'Ýagdaý': 12,
            'Işden çykan': 12,
            'Dalaşgär': 28,
            'Anketa №': 14,
            'Kärhana': 24,
            'Wezipe': 18,
            'Aýlyk': 12,
            'Almaly': 12,
            'Alnan pul': 12,
            'Galdy': 12,
            'Töleg ýagdaýy': 16,
            'Aýlyk alýan senesi': 16,
            'Işgär': 18,
          },
        },
      }]),
      count: items.length,
      paymentCount: 0,
      periodSuffix,
    };
  }

  async importFees(buffer, currentUser) {
    let rows = readSheetRows(buffer, {
      preferredSheets: ['Tölegler'],
      maxCols: 20,
    });
    if (!rows.length) {
      rows = readSheetRows(buffer, {
        preferredSheets: ['Лист1', 'List1', 'Sheet1'],
        maxCols: 20,
      });
    }
    if (!rows.length) {
      throw new ApiError(400, 'Excel-de töleg setiri tapylmady');
    }
    const result = await feePaymentService.importPayments(rows, currentUser);
    return {
      ...result,
      totalRows: rows.length,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
      errorCount: result.errors.length,
    };
  }
}

const excelService = new ExcelService();

// module.exports-i çalyşma — circular require-da boş {} galyp
// «importAnketas is not a function» bolmaz ýaly metodlary özüniň üstüne ýazýarys
module.exports.importAnketas = (buffer, options) => excelService.importAnketas(buffer, options);
module.exports.importVacancies = (buffer, options) => excelService.importVacancies(buffer, options);
module.exports.listExportPeriods = () => excelService.listExportPeriods();
module.exports.exportAnketas = (filters) => excelService.exportAnketas(filters);
module.exports.exportVacancies = (filters) => excelService.exportVacancies(filters);
module.exports.exportFees = (filters) => excelService.exportFees(filters);
module.exports.importFees = (buffer, currentUser) => excelService.importFees(buffer, currentUser);
