/**
 * Täze Main PC: köne ulanyjy ýollary (C:\Users\edovr\...) crash bermez ýaly arassala.
 * Serwer açylanda bir gezek çagyrylýar.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const localPaths = require('./localPaths');

const PROJECT_ROOT = localPaths.PROJECT_ROOT;
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

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

function safeRewriteJson(filePath, mutator) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    const j = JSON.parse(raw);
    const next = mutator(j);
    if (!next) return false;
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return true;
  } catch (e) {
    console.warn(`sanitize ${path.basename(filePath)}:`, e.message);
    return false;
  }
}

function ensureDir(p) {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch { /* ignore */ }
}

/**
 * @returns {{ fixed: string[], kici: string, scan: string }}
 */
function sanitizeLocalConfig() {
  const fixed = [];
  ensureDir(DATA_DIR);

  const desktopKici = path.join(getDesktopDir(), 'anketa_kici_suratlar');
  ensureDir(desktopKici);

  const kiciCfg = path.join(DATA_DIR, 'kici-suratlar-folder.json');
  if (safeRewriteJson(kiciCfg, (j) => {
    const raw = String(j?.folderPath || '').trim();
    const resolved = raw ? localPaths.resolveMaybeRelative(raw) : '';
    if (!resolved || localPaths.isForeignUserPath(resolved) || localPaths.isProjectPath(resolved) || !localPaths.dirWritable(resolved)) {
      fixed.push('kici-suratlar-folder.json → Desktop');
      return { folderPath: desktopKici, updatedAt: new Date().toISOString() };
    }
    return null;
  })) {
    /* logged via fixed */
  } else if (!fs.existsSync(kiciCfg)) {
    try {
      fs.writeFileSync(
        kiciCfg,
        `${JSON.stringify({ folderPath: desktopKici, updatedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8',
      );
      fixed.push('kici-suratlar-folder.json döredildi');
    } catch { /* ignore */ }
  }

  const scanCfg = path.join(DATA_DIR, 'scan-folder.json');
  const suratlar = path.join(PROJECT_ROOT, 'suratlar');
  ensureDir(suratlar);
  safeRewriteJson(scanCfg, (j) => {
    const raw = String(j?.folderPath || '').trim();
    const resolved = raw ? localPaths.resolveMaybeRelative(raw) : '';
    if (!resolved || localPaths.isForeignUserPath(resolved) || !localPaths.dirWritable(resolved)) {
      fixed.push('scan-folder.json → suratlar/');
      return { folderPath: 'suratlar', updatedAt: new Date().toISOString() };
    }
    return null;
  });

  ensureDir(path.join(PROJECT_ROOT, 'public', 'uploads'));

  return {
    fixed,
    kici: desktopKici,
    scan: suratlar,
  };
}

module.exports = { sanitizeLocalConfig, getDesktopDir };
