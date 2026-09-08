/**
 * Täze PC / OneDrive: köne ulanyjy ýoly, relatiw papka, ýazyp bolýarmy.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const writableCache = new Map();

function isInsideDir(child, parent) {
  const c = path.resolve(String(child || '')).toLowerCase();
  const p = path.resolve(String(parent || '')).toLowerCase();
  if (!c || !p) return false;
  return c === p || c.startsWith(`${p}${path.sep}`);
}

function isProjectPath(p) {
  return isInsideDir(p, PROJECT_ROOT);
}

function isForeignUserPath(p) {
  if (process.platform !== 'win32') return false;
  const norm = String(p || '').replace(/\//g, '\\');
  const m = norm.match(/^([A-Za-z]:\\Users\\)([^\\]+)\\/i);
  if (!m) return false;
  const mine = path.basename(os.homedir() || '');
  return Boolean(mine && m[2] && m[2].toLowerCase() !== mine.toLowerCase());
}

function resolveMaybeRelative(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (path.isAbsolute(s)) return path.resolve(s);
  return path.resolve(PROJECT_ROOT, s);
}

function toStoredPath(abs) {
  const resolved = path.resolve(abs);
  if (isProjectPath(resolved)) {
    const rel = path.relative(PROJECT_ROOT, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  }
  return resolved;
}

function dirWritable(dir) {
  const key = path.resolve(String(dir || '')).toLowerCase();
  const hit = writableCache.get(key);
  if (hit && (Date.now() - hit.at) < 60 * 1000) return hit.ok;
  let ok = false;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    ok = true;
  } catch {
    ok = false;
  }
  writableCache.set(key, { ok, at: Date.now() });
  return ok;
}

function clearWritableCache() {
  writableCache.clear();
}

module.exports = {
  PROJECT_ROOT,
  isInsideDir,
  isProjectPath,
  isForeignUserPath,
  resolveMaybeRelative,
  toStoredPath,
  dirWritable,
  clearWritableCache,
};
