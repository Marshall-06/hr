const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  anketaNumberKeys,
  stemKeys,
  parseAnketaNumberParts,
} = require('./linkAnketaPhotosService');
const localPaths = require('../utils/localPaths');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const CONFIG_PATH = path.join(__dirname, '../../data/scan-folder.json');
const DEFAULT_DIR = path.resolve(__dirname, '../../suratlar');
const DESKTOP_FOLDER_NAME = 'Kerwen suratlar';

/** Windows / OneDrive Desktop ýoly */
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

/** Programmadan daşarda: Desktop/Kerwen suratlar */
function getDesktopPhotoFolderPath() {
  return path.join(getDesktopDir(), DESKTOP_FOLDER_NAME);
}

function ensureDesktopPhotoFolder() {
  const folderPath = getDesktopPhotoFolderPath();
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return writeConfig(folderPath);
}

/** 2026 awgustyň öňi → skan JPG; awgustdan soň → programma formaty */
const SCAN_VIEW_UNTIL = { year: 2026, month: 8 }; // month < 8 → skan

let cachedIndex = null;
let cachedRoot = null;
let cachedAt = 0;
const INDEX_TTL_MS = 60 * 1000;

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
  const env = String(process.env.ANKETA_SCAN_DIR || process.env.SCAN_FOLDER || '').trim();
  if (env) return localPaths.resolveMaybeRelative(env);
  return DEFAULT_DIR;
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
    console.warn('scan-folder.json ýazylmady:', e.message);
  }
  invalidateIndex();
  return abs;
}

function getScanRoot() {
  const root = path.resolve(readConfig());
  if (localPaths.isForeignUserPath(root) || !fs.existsSync(root)) {
    return DEFAULT_DIR;
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
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(rootDir)) return map;
  const files = walkImages(rootDir);
  for (const filePath of files) {
    for (const k of stemKeys(filePath)) {
      if (!k.startsWith('num:') && !k.startsWith('numflat:') && !k.startsWith('dig:')) continue;
      if (!map.has(k)) map.set(k, filePath);
    }
  }
  return map;
}

function getIndex() {
  const root = getScanRoot();
  const now = Date.now();
  if (cachedIndex && cachedRoot === root && (now - cachedAt) < INDEX_TTL_MS) {
    return { root, index: cachedIndex };
  }
  cachedIndex = buildIndex(root);
  cachedRoot = root;
  cachedAt = now;
  return { root, index: cachedIndex };
}

function findScanFileByAnketaNumber(anketaNumber) {
  const { index } = getIndex();
  const keys = anketaNumberKeys(anketaNumber);
  for (const k of keys) {
    if (index.has(k)) return index.get(k);
  }
  return null;
}

/**
 * Awgust 2026-dan öň → skan JPG görkeziş.
 * №: 26/7/10 → 2026-07; 26/8/1 → programma.
 */
function prefersFolderScanView(anketa) {
  const parts = parseAnketaNumberParts(anketa?.anketaNumber);
  if (parts) {
    let y = parseInt(parts.y, 10);
    if (y < 100) y += 2000;
    const m = parseInt(parts.m, 10) || 1;
    if (y < SCAN_VIEW_UNTIL.year) return true;
    if (y > SCAN_VIEW_UNTIL.year) return false;
    return m < SCAN_VIEW_UNTIL.month;
  }
  const fd = anketa?.formDate;
  if (fd) {
    const d = new Date(fd);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (y < SCAN_VIEW_UNTIL.year) return true;
      if (y > SCAN_VIEW_UNTIL.year) return false;
      return m < SCAN_VIEW_UNTIL.month;
    }
  }
  return false;
}

function mimeForExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  if (e === '.bmp') return 'image/bmp';
  return 'image/jpeg';
}

function parseExtraData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveUploadedScanPath(scanUrl) {
  if (!scanUrl) return null;
  let rel = String(scanUrl).trim().replace(/^https?:\/\/[^/]+/i, '');
  if (!rel.startsWith('/')) rel = `/${rel}`;
  if (!rel.startsWith('/uploads/')) return null;
  const abs = path.resolve(__dirname, '../../public', rel.replace(/^\//, ''));
  return fs.existsSync(abs) ? abs : null;
}

/** JPEG ölçegi (SOF) — sharp gerekmeýär */
function readImageDims(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    if (buf.length < 10) return null;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      if (buf.length < 24) return null;
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 8 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = (buf[i + 2] << 8) + buf[i + 3];
      if (marker >= 0xc0 && marker <= 0xc3 && len >= 7) {
        return { h: (buf[i + 5] << 8) + buf[i + 6], w: (buf[i + 7] << 8) + buf[i + 8] };
      }
      i += 2 + len;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Webkamera 3×4 (~450×600) däl — doly A4 skan ýaly uly suratmy?
 * Köne baglanyşykda photoUrl-da skan saklanypdy.
 */
function looksLikeFullPageScan(absPath) {
  const d = readImageDims(absPath);
  if (!d?.w || !d?.h) return false;
  const { w, h } = d;
  // Tipiki webkamera / 3×4
  if (w <= 700 && h <= 900 && w / h <= 0.9) return false;
  if (w <= 500 && h <= 700) return false;
  // A4 / skan
  if (h >= 1000 || w >= 1000) return true;
  if (h > w * 1.2 && h >= 800) return true;
  return false;
}

/** Papkadan ýa-da DB extraData.scanUrl / photoUrl (köne skan) */
function resolveScanForAnketa(anketa) {
  const folder = findScanFileByAnketaNumber(anketa?.anketaNumber);
  if (folder) return { path: folder, source: 'folder' };

  const extra = parseExtraData(anketa?.extraData || anketa?.extra_data);
  const upload = resolveUploadedScanPath(extra?.scanUrl);
  if (upload) return { path: upload, source: 'upload' };

  // Köne: diňe photoUrl-da doly skan (3×4 däl)
  const photoRefs = [];
  if (Array.isArray(extra.photos)) photoRefs.push(...extra.photos);
  if (anketa?.photoUrl) photoRefs.push(anketa.photoUrl);
  if (anketa?.photo_url) photoRefs.push(anketa.photo_url);
  for (const ref of photoRefs) {
    const abs = resolveUploadedScanPath(ref);
    if (abs && looksLikeFullPageScan(abs)) {
      return { path: abs, source: 'photo' };
    }
  }
  return null;
}

module.exports = {
  getScanRoot,
  readConfig,
  writeConfig,
  findScanFileByAnketaNumber,
  resolveScanForAnketa,
  resolveUploadedScanPath,
  prefersFolderScanView,
  invalidateIndex,
  getIndex,
  mimeForExt,
  looksLikeFullPageScan,
  readImageDims,
  getDesktopDir,
  getDesktopPhotoFolderPath,
  ensureDesktopPhotoFolder,
  DESKTOP_FOLDER_NAME,
  SCAN_VIEW_UNTIL,
  DEFAULT_DIR,
};
