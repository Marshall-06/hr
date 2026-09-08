/**
 * Anketa 3×4 suratlar — programma daşynda (Desktop ýa-da saýlanan papka).
 * Esasy: daşarky kici papka (№.jpg). Rezerv: public/uploads/{№}.jpg.
 * Köne suratlar: public/uploads hem okalýar.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseAnketaNumberParts, anketaNumberKeys, stemKeys } = require('./linkAnketaPhotosService');
const localPaths = require('../utils/localPaths');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'data/kici-suratlar-folder.json');
const FOLDER_NAME = 'anketa_kici_suratlar';
/** Köne programma-içi papka — diňe şondan daşyna göçürmek üçin */
const LOCAL_KICI_DIR = path.join(PROJECT_ROOT, 'data', FOLDER_NAME);
const UPLOAD_DIR = path.resolve(PROJECT_ROOT, 'public/uploads');
const WEB_PREFIX = '/kici-suratlar';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

let cachedIndex = null;
let cachedRoot = null;
let cachedAt = 0;
const INDEX_TTL_MS = 30 * 1000;

function getDesktopDir() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'OneDrive', 'Рабочий стол'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'Desktop'),
    path.join(home, 'Рабочий стол'),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch { /* ignore */ }
  }
  return path.join(home, 'Desktop');
}

function defaultFolderPath() {
  return path.join(getDesktopDir(), FOLDER_NAME);
}

function outsideFolderCandidates() {
  const home = os.homedir();
  return [
    path.join(getDesktopDir(), FOLDER_NAME),
    path.join(home, 'Documents', FOLDER_NAME),
    path.join(home, 'Документы', FOLDER_NAME),
    path.join(home, 'Pictures', FOLDER_NAME),
    'D:\\anketa_kici_suratlar',
    'E:\\anketa_kici_suratlar',
  ];
}

function pickOutsideFolder() {
  for (const p of outsideFolderCandidates()) {
    if (localPaths.isForeignUserPath(p)) continue;
    if (localPaths.dirWritable(p)) return path.resolve(p);
  }
  return defaultFolderPath();
}

/** Programma içi / başga PC ulanyjysy / ýazylmaýan ýol → şu PC-niň daşarky papkasy */
function shouldUseOutsideFallback(root) {
  if (!root) return true;
  if (localPaths.isForeignUserPath(root)) return true;
  if (localPaths.isProjectPath(root)) return true;
  if (!localPaths.dirWritable(root)) return true;
  return false;
}

function harvestSourceDirs() {
  const dirs = [];
  const seen = new Set();
  const add = (p) => {
    const abs = path.resolve(String(p || ''));
    if (!abs || seen.has(abs.toLowerCase())) return;
    seen.add(abs.toLowerCase());
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) dirs.push(abs);
    } catch { /* skip */ }
  };
  add(path.join(getDesktopDir(), FOLDER_NAME));
  add(LOCAL_KICI_DIR);
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const j = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (j?.folderPath) add(j.folderPath);
    }
  } catch { /* ignore */ }
  add(UPLOAD_DIR);
  add(path.join(PROJECT_ROOT, 'suratlar'));
  add(path.join(PROJECT_ROOT, 'public', 'uploads'));
  try {
    const scan = require('./anketaScanFolderService');
    add(scan.getScanRoot());
  } catch { /* ignore */ }
  return dirs;
}

const SKIP_DIR_NAMES = new Set([
  'windows', 'windows.old', 'program files', 'program files (x86)', 'programdata',
  '$recycle.bin', 'system volume information', 'recovery', 'msocache',
  'perflogs', 'node_modules', '.git', '.cursor', 'appdata', 'temp', 'tmp',
  'cache', 'inetpub', 'config.msi',
]);

function shouldSkipDirName(name) {
  const n = String(name || '').toLowerCase();
  if (!n || n.startsWith('.')) return true;
  return SKIP_DIR_NAMES.has(n);
}

function userSearchRoots() {
  const home = os.homedir();
  const roots = [
    home,
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    path.join(home, 'Pictures'),
    path.join(home, 'Pictures', 'Camera Roll'),
    path.join(home, 'OneDrive'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'OneDrive', 'Pictures'),
    path.join(home, 'OneDrive', 'Рабочий стол'),
    path.join(home, 'Рабочий стол'),
    path.join(home, 'Документы'),
    path.join(home, 'Загрузки'),
    path.join(home, 'Изображения'),
  ];
  return roots;
}

function extraDriveRoots() {
  const out = [];
  if (process.platform !== 'win32') return out;
  for (let i = 67; i <= 90; i += 1) { // C: … Z:
    const root = `${String.fromCharCode(i)}:\\`;
    try {
      if (fs.existsSync(root)) out.push(root);
    } catch { /* skip */ }
  }
  return out;
}

function pcSearchRoots() {
  const dirs = [];
  const seen = new Set();
  const add = (p) => {
    const abs = path.resolve(String(p || ''));
    if (!abs || seen.has(abs.toLowerCase())) return;
    seen.add(abs.toLowerCase());
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) dirs.push(abs);
    } catch { /* skip */ }
  };
  harvestSourceDirs().forEach(add);
  userSearchRoots().forEach(add);
  extraDriveRoots().forEach(add);
  return dirs;
}

/**
 * Diňe anketa № ýaly at ýa-da extraNames (ýiten uuid.jpg).
 */
function walkWantedImages(dir, extraNames, destRoot, opts = {}) {
  const maxDepth = opts.maxDepth || 10;
  const maxVisit = opts.maxVisit || 80000;
  const found = [];
  let visited = 0;
  const destNorm = path.resolve(destRoot).toLowerCase();

  const walk = (current, depth) => {
    if (depth > maxDepth || visited >= maxVisit || found.length >= 8000) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (visited >= maxVisit) return;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDirName(ent.name)) continue;
        if (path.resolve(full).toLowerCase() === destNorm) continue;
        walk(full, depth + 1);
        continue;
      }
      visited += 1;
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      const base = ent.name;
      const wanted = Boolean(numberedDestName(full))
        || extraNames.has(base.toLowerCase());
      if (wanted) found.push(full);
    }
  };

  walk(dir, 0);
  return { files: found, visited };
}

/**
 * Faýl ady → 26.7.66.jpg (anketa №). Gabat gelenok bolsa asyl ady.
 */
function isPlausibleAnketaParts(parts) {
  if (!parts) return false;
  let y = parseInt(parts.y, 10);
  const m = parseInt(parts.m, 10);
  const n = parseInt(parts.n, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(n)) return false;
  if (y > 2000) y %= 100;
  if (y < 20 || y > 30) return false;
  if (m < 1 || m > 12) return false;
  if (n < 1 || n > 2000) return false;
  return true;
}

function numberedDestName(srcPath) {
  const base = path.basename(srcPath);
  const ext = (path.extname(base) || '.jpg').toLowerCase();
  const safeExt = IMAGE_EXT.has(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.jpg';
  const parts = parseAnketaNumberParts(base);
  if (!isPlausibleAnketaParts(parts)) return null;
  return `${parseInt(parts.y, 10) % 100}.${parseInt(parts.m, 10)}.${parseInt(parts.n, 10)}${safeExt}`;
}

function copyIfMissing(src, dest) {
  if (!src || !fs.existsSync(src) || src === dest) return false;
  if (fs.existsSync(dest)) return false;
  try {
    const st = fs.statSync(src);
    if (!st.isFile() || st.size < 50) return false; // OneDrive boş placeholder
  } catch {
    return false;
  }
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

function destNameForHarvest(srcPath, extraNames) {
  const numbered = numberedDestName(srcPath);
  if (numbered) return numbered;
  const base = path.basename(srcPath);
  if (extraNames && extraNames.has(base.toLowerCase())) return base;
  return null;
}

/** Ýakyn papkalar: uploads, Desktop kici (her ensure-de) */
function harvestIntoLocalFolder(destRoot, extraNames = new Set()) {
  let copied = 0;
  for (const srcDir of harvestSourceDirs()) {
    if (path.resolve(srcDir) === path.resolve(destRoot)) continue;
    for (const filePath of walkImages(srcDir)) {
      const destName = destNameForHarvest(filePath, extraNames);
      if (!destName) continue;
      if (copyIfMissing(filePath, path.join(destRoot, destName))) copied += 1;
    }
  }
  if (copied) invalidateIndex();
  return copied;
}

/**
 * Kompýuteriň ýerleri: Documents, Downloads, Pictures, OneDrive, D: E: …
 * Windows / Program Files süzülýär. Diňe №.jpg ýa-da ýiten at.
 */
function harvestFromWholePc(destRoot, extraNames = new Set()) {
  let copied = 0;
  const destNorm = path.resolve(destRoot).toLowerCase();
  for (const srcDir of pcSearchRoots()) {
    if (path.resolve(srcDir).toLowerCase() === destNorm) continue;
    const { files } = walkWantedImages(srcDir, extraNames, destRoot, {
      maxDepth: /^[a-z]:\\$/i.test(srcDir) ? 7 : 12,
      maxVisit: /^c:\\$/i.test(srcDir) ? 40000 : 80000,
    });
    for (const filePath of files) {
      const destName = destNameForHarvest(filePath, extraNames);
      if (!destName) continue;
      if (copyIfMissing(filePath, path.join(destRoot, destName))) copied += 1;
    }
  }
  if (copied) invalidateIndex();
  return copied;
}

async function missingPhotoBasenames() {
  const names = new Set();
  try {
    const { Anketa } = require('../models');
    const rows = await Anketa.findAll({
      attributes: ['photoUrl'],
      where: { photoUrl: { [require('sequelize').Op.ne]: null } },
    });
    rows.forEach((r) => {
      const url = r.photoUrl;
      if (!url) return;
      const base = path.basename(String(url).split('?')[0]);
      if (base) names.add(base.toLowerCase());
    });
  } catch { /* model heniz taýýar däl */ }
  return names;
}

function ensureDataDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const j = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (j?.folderPath) {
        const resolved = localPaths.resolveMaybeRelative(j.folderPath);
        if (resolved && !localPaths.isForeignUserPath(resolved)) return resolved;
      }
    }
  } catch { /* ignore */ }
  const env = String(process.env.ANKETA_KICI_DIR || process.env.PORTRAIT_FOLDER || '').trim();
  if (env) return localPaths.resolveMaybeRelative(env);
  return defaultFolderPath();
}

function writeConfig(folderPath) {
  ensureDataDir();
  const abs = path.resolve(String(folderPath || '').trim());
  const stored = localPaths.toStoredPath(abs);
  try {
    try {
      if (fs.existsSync(CONFIG_PATH)) fs.chmodSync(CONFIG_PATH, 0o666);
    } catch { /* ignore */ }
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ folderPath: stored, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  } catch (e) {
    console.warn('kici-suratlar-folder.json ýazylmady:', e.message);
  }
  invalidateIndex();
  return abs;
}

function getRoot() {
  return path.resolve(readConfig());
}

function ensureFolder(opts = {}) {
  let root = getRoot();
  if (shouldUseOutsideFallback(root)) {
    const dest = pickOutsideFolder();
    try { harvestIntoLocalFolder(dest); } catch (e) {
      console.warn('kici daşyna göçürme:', e.message);
    }
    root = dest;
  }
  try {
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    console.warn('kici papka döredilmedi:', root, e.message);
    root = pickOutsideFolder();
    try {
      if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    } catch (e2) {
      console.warn('kici daşarky papka döredilmedi:', e2.message);
    }
  }
  try {
    let stored = '';
    if (fs.existsSync(CONFIG_PATH)) {
      const j = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      stored = localPaths.resolveMaybeRelative(j?.folderPath || '');
    }
    if (path.resolve(stored || '') !== path.resolve(root)) writeConfig(root);
  } catch { /* ignore */ }
  if (opts.harvest) {
    try { harvestIntoLocalFolder(root); } catch (e) {
      console.warn('kici harvest:', e.message);
    }
  }
  return root;
}

function invalidateIndex() {
  cachedIndex = null;
  cachedRoot = null;
  cachedAt = 0;
}

function walkImages(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      walkImages(full, out);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (IMAGE_EXT.has(ext)) out.push(full);
  }
  return out;
}

function buildIndex(rootDir) {
  const map = new Map();
  if (!fs.existsSync(rootDir)) return map;
  for (const filePath of walkImages(rootDir)) {
    for (const k of stemKeys(filePath)) {
      if (!k.startsWith('num:') && !k.startsWith('numflat:') && !k.startsWith('dig:')) continue;
      if (!map.has(k)) map.set(k, filePath);
    }
  }
  return map;
}

function getIndex() {
  const root = ensureFolder();
  const now = Date.now();
  if (cachedIndex && cachedRoot === root && (now - cachedAt) < INDEX_TTL_MS) {
    return { root, index: cachedIndex };
  }
  cachedIndex = buildIndex(root);
  cachedRoot = root;
  cachedAt = now;
  return { root, index: cachedIndex };
}

function anketaDiskStem(anketaNumber) {
  const parts = parseAnketaNumberParts(anketaNumber);
  if (parts) return `${parts.y}.${parts.m}.${parts.n}`;
  return String(anketaNumber || '')
    .replace(/[^\d./\-]+/g, '')
    .replace(/[/\\]/g, '.')
    .replace(/-+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '') || '';
}

function findByAnketaNumber(anketaNumber) {
  if (!anketaNumber) return null;
  const { index } = getIndex();
  for (const k of anketaNumberKeys(anketaNumber)) {
    if (index.has(k)) return index.get(k);
  }
  return null;
}

function webUrlForFile(absPath) {
  const root = getRoot();
  const rel = path.relative(root, absPath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return null;
  return `${WEB_PREFIX}/${rel}`;
}

/**
 * Absolute path for photo URL:
 * /kici-suratlar/... → daşarky papka
 * /uploads/... → public/uploads (köne)
 */
function resolvePhotoAbs(url) {
  if (!url) return null;
  let rel = String(url).trim().replace(/^https?:\/\/[^/]+/i, '');
  if (!rel) return null;

  if (/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('\\\\')) {
    return fs.existsSync(rel) ? rel : null;
  }
  if (!rel.startsWith('/')) rel = `/${rel}`;

  if (rel.startsWith(`${WEB_PREFIX}/`) || rel === WEB_PREFIX) {
    const rest = rel.slice(WEB_PREFIX.length).replace(/^\//, '');
    const abs = path.resolve(getRoot(), rest);
    return fs.existsSync(abs) ? abs : null;
  }

  if (rel.startsWith('/uploads/')) {
    const abs = path.resolve(UPLOAD_DIR, path.basename(rel));
    // uploads can have subdirs — prefer full relative under public
    const underPublic = path.resolve(__dirname, '../../public', rel.replace(/^\//, ''));
    if (fs.existsSync(underPublic)) return underPublic;
    return fs.existsSync(abs) ? abs : null;
  }

  const base = path.basename(rel);
  if (base && IMAGE_EXT.has(path.extname(base).toLowerCase())) {
    const inKici = path.join(getRoot(), base);
    if (fs.existsSync(inKici)) return inKici;
    const inUploads = path.join(UPLOAD_DIR, base);
    if (fs.existsSync(inUploads)) return inUploads;
  }
  return null;
}

/**
 * 3×4 tap: 1) DB URL (kici ýa-da uploads) 2) kici papkada №.jpg 3) uploads
 */
function resolvePortraitForAnketa(anketa) {
  const a = anketa && typeof anketa.toJSON === 'function' ? anketa.toJSON() : (anketa || {});
  const xd = a.extraData && typeof a.extraData === 'object' ? a.extraData : {};
  const refs = [];
  if (a.photoUrl || a.photo_url) refs.push(a.photoUrl || a.photo_url);
  if (Array.isArray(xd.photos)) refs.push(...xd.photos);

  for (const ref of refs) {
    const abs = resolvePhotoAbs(ref);
    if (abs) return { path: abs, url: ref, source: String(ref).includes('kici') ? 'kici' : 'uploads' };
  }

  // DB-däki ýol boş / faýl ýok — papkadaky №.jpg
  const byNum = findByAnketaNumber(a.anketaNumber);
  if (byNum) {
    return { path: byNum, url: webUrlForFile(byNum), source: 'kici-number' };
  }
  return null;
}

/**
 * DB-de / uploads-da tapyllan 3×4 → anketa_kici_suratlar/{№}.jpg
 * + uploads/{№}.jpg rezerv. photoUrl kici papka görkezýär.
 */
async function copyResolvedPhotosToKiciByNumber() {
  const root = ensureFolder();
  const { Anketa } = require('../models');
  let scanFolder = null;
  try { scanFolder = require('./anketaScanFolderService'); } catch { /* ignore */ }
  const rows = await Anketa.findAll({
    attributes: ['id', 'anketaNumber', 'photoUrl', 'extraData'],
  });
  let copied = 0;
  let updated = 0;
  let reserved = 0;
  for (const row of rows) {
    const a = row.toJSON ? row.toJSON() : row;
    const stem = anketaDiskStem(a.anketaNumber);
    if (!stem) continue;
    let hit = resolvePortraitForAnketa(a);
    if (!hit?.path && scanFolder) {
      try {
        const scan = scanFolder.resolveScanForAnketa(a);
        if (scan?.path && fs.existsSync(scan.path)) hit = { path: scan.path };
      } catch { /* ignore */ }
    }
    if (!hit?.path || !fs.existsSync(hit.path)) continue;
    let ext = path.extname(hit.path).toLowerCase();
    if (!IMAGE_EXT.has(ext)) ext = '.jpg';
    if (ext === '.jpeg') ext = '.jpg';
    const destName = `${stem}${ext}`;
    const dest = path.join(root, destName);
    if (path.resolve(hit.path) !== path.resolve(dest)) {
      if (copyIfMissing(hit.path, dest)) copied += 1;
      else if (!fs.existsSync(dest)) {
        try {
          fs.copyFileSync(hit.path, dest);
          copied += 1;
        } catch { /* ignore */ }
      }
    }
    if (!fs.existsSync(dest)) continue;
    if (mirrorReserveToUploads(dest, destName)) reserved += 1;
    const newUrl = `${WEB_PREFIX}/${destName}`;
    const extra = a.extraData && typeof a.extraData === 'object' ? { ...a.extraData } : {};
    const photos = Array.isArray(extra.photos) ? extra.photos.filter(Boolean) : [];
    const nextPhotos = [newUrl, ...photos.filter((p) => p !== newUrl && p !== a.photoUrl)].slice(0, 8);
    if (a.photoUrl === newUrl && JSON.stringify(photos) === JSON.stringify(nextPhotos)) continue;
    try {
      await Anketa.update(
        { photoUrl: newUrl, extraData: { ...extra, photos: nextPhotos } },
        { where: { id: a.id } },
      );
      updated += 1;
    } catch { /* ignore one row */ }
  }
  if (copied) invalidateIndex();
  return { copied, updated, reserved };
}

/**
 * Papkadaky №.jpg → anketanyň photoUrl.
 * Serwer açylanda: ýiten ýoly täzele, täze faýllary bagla.
 */
async function autoLinkFromKiciFolder(opts = {}) {
  const root = ensureFolder({ harvest: true });
  const extra = await missingPhotoBasenames();
  const fromNear = harvestIntoLocalFolder(root, extra);
  const fromPc = (opts.scanPc || opts.scanPc) ? harvestFromWholePc(root, extra) : 0;
  let numbered = { copied: 0, updated: 0 };
  if (!opts.skipNumbered) {
    try {
      numbered = await copyResolvedPhotosToKiciByNumber();
    } catch (e) {
      console.warn('№.jpg göçürme:', e.message);
    }
  }
  let linked = { linked: 0, filesTotal: 0 };
  try {
    const { linkPhotosFromFolder } = require('./linkAnketaPhotosService');
    linked = await linkPhotosFromFolder({
      folderPath: root,
      dryRun: Boolean(opts.dryRun),
      overwrite: Boolean(opts.overwrite),
      relinkIfMissing: opts.relinkIfMissing !== false,
      crop3x4: false,
      extractFromScan: false,
    });
  } catch (e) {
    console.warn('3×4 baglama:', e.message);
  }
  return {
    ...linked,
    harvested: fromNear + fromPc,
    numberedCopied: numbered.copied,
    numberedUpdated: numbered.updated,
    numberedReserved: numbered.reserved || 0,
    folderPath: root,
  };
}

/**
 * Täze 3×4 → anketa_kici_suratlar/{№}.jpg + uploads/{№}.jpg rezerv
 * @returns {{ url: string, abs: string, reserveAbs?: string }}
 */
function savePortraitFile(srcPath, anketaNumber, opts = {}) {
  const root = ensureFolder();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  let ext = path.extname(srcPath).toLowerCase();
  if (!IMAGE_EXT.has(ext)) ext = '.jpg';
  if (ext === '.jpeg') ext = '.jpg';

  let stem = anketaDiskStem(anketaNumber);
  if (!stem) {
    stem = `id.${opts.anketaId || Date.now()}`;
  }
  let destName = `${stem}${ext}`;
  let dest = path.join(root, destName);
  if (fs.existsSync(dest) && opts.unique) {
    let i = 2;
    while (fs.existsSync(path.join(root, `${stem}_${i}${ext}`))) i += 1;
    destName = `${stem}_${i}${ext}`;
    dest = path.join(root, destName);
  }
  try {
    fs.copyFileSync(srcPath, dest);
  } catch (e) {
    throw new Error(`3×4 surat papka ýazylmady (${root}): ${e.message}`);
  }
  invalidateIndex();
  const reserveAbs = mirrorReserveToUploads(dest, destName);
  return { url: `${WEB_PREFIX}/${destName}`, abs: dest, reserveAbs: reserveAbs || undefined };
}

/**
 * public/uploads/{№}.jpg — kici papka bilen birlikde rezerv.
 * Esasy URL hemişe kici; uploads diňe ätiýaçlyk / köne ýol.
 */
function mirrorReserveToUploads(srcAbs, destNameOrAnketa) {
  if (!srcAbs || !fs.existsSync(srcAbs)) return null;
  const raw = String(destNameOrAnketa || '').trim();
  let destName = path.basename(raw);
  const looksNamed = IMAGE_EXT.has(path.extname(destName).toLowerCase());
  if (!looksNamed) {
    const stem = anketaDiskStem(raw);
    if (!stem) return null;
    let ext = path.extname(srcAbs).toLowerCase();
    if (!IMAGE_EXT.has(ext)) ext = '.jpg';
    if (ext === '.jpeg') ext = '.jpg';
    destName = `${stem}${ext}`;
  }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, destName);
  if (path.resolve(srcAbs) === path.resolve(dest)) return dest;
  try {
    fs.copyFileSync(srcAbs, dest);
    return dest;
  } catch (e) {
    console.warn('uploads rezerv:', e.message);
    return null;
  }
}

/** Multer /uploads faýlyny kici papka göçür, № bilen uploads rezerv goý, uuid öçür */
function adoptUploadToPortrait(uploadAbsPath, anketaNumber, opts = {}) {
  if (!uploadAbsPath || !fs.existsSync(uploadAbsPath)) return null;
  try {
    const saved = savePortraitFile(uploadAbsPath, anketaNumber, opts);
    try {
      if (opts.removeUpload && localPaths.isInsideDir(uploadAbsPath, UPLOAD_DIR)) {
        const reserveName = saved.reserveAbs ? path.basename(saved.reserveAbs).toLowerCase() : '';
        const base = path.basename(uploadAbsPath).toLowerCase();
        // №.jpg rezervi öçürme — diňe multer uuid
        if (base !== reserveName) fs.unlinkSync(uploadAbsPath);
      }
    } catch { /* ignore */ }
    return saved;
  } catch (e) {
    console.warn('3×4 papka ýazylmady, uploads-da galdy:', e.message);
    // Zapas: azyndan № bilen uploads-da goý
    try {
      const reserveAbs = mirrorReserveToUploads(uploadAbsPath, anketaNumber);
      if (reserveAbs) {
        return { url: `/uploads/${path.basename(reserveAbs)}`, abs: reserveAbs, reserveAbs };
      }
    } catch { /* ignore */ }
    return { url: `/uploads/${path.basename(uploadAbsPath)}`, abs: path.resolve(uploadAbsPath) };
  }
}

function fileCount() {
  return getIndex().index.size;
}

module.exports = {
  FOLDER_NAME,
  WEB_PREFIX,
  UPLOAD_DIR,
  LOCAL_KICI_DIR,
  getDesktopDir,
  defaultFolderPath,
  getRoot,
  ensureFolder,
  writeConfig,
  readConfig,
  invalidateIndex,
  findByAnketaNumber,
  resolvePhotoAbs,
  resolvePortraitForAnketa,
  savePortraitFile,
  adoptUploadToPortrait,
  mirrorReserveToUploads,
  webUrlForFile,
  anketaDiskStem,
  fileCount,
  getIndex,
  harvestIntoLocalFolder,
  harvestFromWholePc,
  autoLinkFromKiciFolder,
  copyResolvedPhotosToKiciByNumber,
};
