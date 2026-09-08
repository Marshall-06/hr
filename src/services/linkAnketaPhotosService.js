const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Anketa = require('../models/Anketa');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const OUT_W = 450;
const OUT_H = 600;

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Türkmen / latyn / kiril birmeňzeşleşdir */
function normalizeKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ç/g, 'c')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-яәғқңөұүіһ]+/gi, '')
    .trim();
}

function digitsOnly(s) {
  return String(s || '').replace(/\D+/g, '');
}

/**
 * Anketa №: 26/2/78 | 26.2.78 | 26-2-78 | 26_2_78 | 26.5.10.E | 26/5/10/E
 * → kanonik «26/2/78» (aý we tertip öňdäki 0-syz: 08 → 8)
 */
function stripAnketaNumberNoise(raw) {
  return String(raw || '')
    .trim()
    // faýl giňeltmesi
    .replace(/\.(jpe?g|png|webp|gif|bmp)$/i, '')
    // Excel / skan goşundysy: 26.5.10.E | 26/5/10/E | 26-5-10_E
    .replace(/[/._\-\s]+[eE]\s*$/u, '')
    .trim();
}

function parseAnketaNumberParts(raw) {
  const s = stripAnketaNumberNoise(raw);
  if (!s) return null;
  const m = s.match(/(\d{2,4})\s*[./\-_/\\]\s*(\d{1,2})\s*[./\-_/\\]\s*(\d{1,4})\s*$/);
  if (!m) {
    // diňe üç bölek: faýl adynda başga tekst bolsa
    const m2 = s.match(/(\d{2,4})\s*[./\-_/\\]\s*(\d{1,2})\s*[./\-_/\\]\s*(\d{1,4})/);
    if (!m2) return null;
    return {
      y: String(parseInt(m2[1], 10)),
      m: String(parseInt(m2[2], 10)),
      n: String(parseInt(m2[3], 10)),
    };
  }
  return {
    y: String(parseInt(m[1], 10)),
    m: String(parseInt(m[2], 10)),
    n: String(parseInt(m[3], 10)),
  };
}

function anketaNumberKeys(raw) {
  const keys = new Set();
  const parts = parseAnketaNumberParts(raw);
  if (parts) {
    const mp = String(parts.m).padStart(2, '0');
    const np = String(parts.n).padStart(2, '0');
    const variants = [
      `${parts.y}/${parts.m}/${parts.n}`,
      `${parts.y}/${mp}/${parts.n}`,
      `${parts.y}/${parts.m}/${np}`,
      `${parts.y}/${mp}/${np}`,
      `${parts.y}.${parts.m}.${parts.n}`,
      `${parts.y}.${mp}.${parts.n}`,
      `${parts.y}-${parts.m}-${parts.n}`,
      `${parts.y}-${mp}-${np}`,
    ];
    variants.forEach((v) => keys.add(`num:${v}`));
    keys.add(`numflat:${parts.y}${parts.m}${parts.n}`);
    keys.add(`numflat:${parts.y}${mp}${np}`);
    // Ýyl 2026 / 26
    if (parts.y.length === 4) {
      const yy = parts.y.slice(-2);
      keys.add(`num:${yy}/${parts.m}/${parts.n}`);
      keys.add(`num:${yy}/${mp}/${np}`);
      keys.add(`numflat:${yy}${parts.m}${parts.n}`);
      keys.add(`numflat:${yy}${mp}${np}`);
    } else if (parts.y.length === 2) {
      keys.add(`num:20${parts.y}/${parts.m}/${parts.n}`);
      keys.add(`num:20${parts.y}/${mp}/${np}`);
      keys.add(`numflat:20${parts.y}${parts.m}${parts.n}`);
      keys.add(`numflat:20${parts.y}${mp}${np}`);
    }
  }
  const dig = digitsOnly(raw);
  if (dig) {
    keys.add(`dig:${dig}`);
    keys.add(`dig:${dig.replace(/^0+/, '') || '0'}`);
  }
  const norm = normalizeKey(raw);
  if (norm) keys.add(`norm:${norm}`);
  return [...keys];
}

function listImageFiles(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) {
    throw new ApiError(400, `Papka tapylmady: ${abs}`);
  }
  const st = fs.statSync(abs);
  if (!st.isDirectory()) {
    throw new ApiError(400, `Bu ýol papka däl: ${abs}`);
  }
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      throw new ApiError(400, `Papka okalmakdaky ýalňyşlyk: ${e.message}`);
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      out.push(full);
    }
  };
  walk(abs);
  return out;
}

function stemKeys(filePath) {
  // Windows path.basename('26/5/7/E.jpg') → 'E.jpg' — ýalňyş; diňe soňky segment
  const raw = String(filePath || '').replace(/\\/g, '/');
  const baseName = raw.split('/').pop() || raw;
  const base = stripAnketaNumberNoise(baseName);
  const keys = new Set(anketaNumberKeys(base));

  // Familiýa_At ýaly goşmaça (nomer däl bolsa)
  const parts = base.split(/[\s_\-]+/).filter(Boolean);
  if (parts.length >= 2 && !parseAnketaNumberParts(base)) {
    keys.add(`name:${normalizeKey(parts.join(''))}`);
    keys.add(`name:${normalizeKey(`${parts[0]}${parts[1]}`)}`);
    keys.add(`name:${normalizeKey(`${parts[1]}${parts[0]}`)}`);
  }
  return [...keys].filter(Boolean);
}

function anketaIndexKeys(a) {
  const keys = new Set();
  const num = String(a.anketaNumber || '').trim();
  if (num) {
    anketaNumberKeys(num).forEach((k) => keys.add(k));
  }
  const fam = String(a.familyName || '').trim();
  const first = String(a.firstName || '').trim();
  const pat = String(a.patronymic || '').trim();
  if (fam && first) {
    keys.add(`name:${normalizeKey(`${fam}${first}`)}`);
    keys.add(`name:${normalizeKey(`${first}${fam}`)}`);
    if (pat) {
      keys.add(`name:${normalizeKey(`${fam}${first}${pat}`)}`);
    }
  }
  const pass = String(a.passportNumber || '').trim();
  if (pass) {
    keys.add(`norm:${normalizeKey(pass)}`);
    const pd = digitsOnly(pass);
    if (pd && pd.length >= 5) keys.add(`dig:${pd}`);
  }
  return [...keys].filter(Boolean);
}

function hasPhoto(a) {
  const portrait = require('./anketaPortraitFolderService');
  if (a.photoUrl) return Boolean(portrait.resolvePhotoAbs(a.photoUrl));
  const photos = a.extraData?.photos;
  if (Array.isArray(photos) && photos[0]) return Boolean(portrait.resolvePhotoAbs(photos[0]));
  return false;
}

function photoFileMissing(a) {
  return !hasPhoto(a);
}


/**
 * Skan A4 → diňe Kerwen forma .photo gutusy (132×172 / 3×4).
 * «sene:» setirinden aşakda, sagda — artykmaç meýdan almaýar.
 *
 * Hasap (A4 210×297, çap padding çep 1.5sm sag 1sm):
 *   surat ~35×46 mm, sagdan ~12 mm, ýokardan ~40 mm (seneden soň)
 */
const KERWEN_SCAN_PHOTO_REGION = {
  // sag gyradan — uly = guty çepe (terisne / öňki sag süýşmäniň tersi)
  right: 0.085,
  top: 0.138,
  width: 0.148,
  inset: 0.05,
};

function extractPortraitWindows(srcPath, destPath, opts = {}) {
  if (process.platform !== 'win32') return false;
  const forceScanCorner = opts.forceScanCorner !== false;
  const rgn = { ...KERWEN_SCAN_PHOTO_REGION, ...(opts.region || {}) };
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = ${JSON.stringify(srcPath)}
$dst = ${JSON.stringify(destPath)}
$forceCorner = $${forceScanCorner ? 'true' : 'false'}
$img = [System.Drawing.Image]::FromFile($src)
try {
  $w = [int]$img.Width
  $h = [int]$img.Height
  if ($w -lt 40 -or $h -lt 40) { throw 'Surat kiçi' }
  $ratio = $w / [double]$h
  $target = 3.0 / 4.0

  $isSmallPortrait = (-not $forceCorner) -and ($w -le 900) -and ($ratio -ge 0.62) -and ($ratio -le 0.88)

  if ($forceCorner -or -not $isSmallPortrait) {
    # Kerwen .photo gutusy — ýokary sag, seneden aşak
    $boxW = [Math]::Max(48, [int][Math]::Floor($w * ${rgn.width}))
    $boxH = [Math]::Max(48, [int][Math]::Floor($boxW / $target))
    $x = [Math]::Max(0, [int][Math]::Floor($w * (1.0 - ${rgn.right}) - $boxW))
    $y = [Math]::Max(0, [int][Math]::Floor($h * ${rgn.top}))
    if (($x + $boxW) -gt $w) { $boxW = $w - $x }
    if (($y + $boxH) -gt $h) { $boxH = $h - $y }

    # Içeri gys — çarçuwa / «sene» gyrasy girmesin
    $inset = [double]${rgn.inset}
    if ($inset -gt 0 -and $inset -lt 0.25) {
      $ix = [Math]::Max(1, [int][Math]::Floor($boxW * $inset))
      $iy = [Math]::Max(1, [int][Math]::Floor($boxH * $inset))
      $x = $x + $ix
      $y = $y + $iy
      $boxW = [Math]::Max(20, $boxW - 2 * $ix)
      $boxH = [Math]::Max(20, $boxH - 2 * $iy)
      # 3×4 sakla — çepe süýşür (ýüz çepden kesilmesin)
      $cur = $boxW / [double]$boxH
      if ($cur -gt $target) {
        $nw = [Math]::Max(20, [int][Math]::Floor($boxH * $target))
        $bias = [int][Math]::Floor(($boxW - $nw) * 0.35)
        $x = $x + $bias
        $boxW = $nw
      } elseif ($cur -lt $target) {
        $nh = [Math]::Max(20, [int][Math]::Floor($boxW / $target))
        $y = $y + [int][Math]::Floor(($boxH - $nh) / 2.0)
        $boxH = $nh
      }
    }
    if ($boxW -lt 20 -or $boxH -lt 20) { throw 'Kesim gutusy kiçi' }
  } else {
    if ($ratio -gt $target) {
      $boxH = $h
      $boxW = [Math]::Max(1, [int][Math]::Floor($h * $target))
      # Merkezden çepe (0.35) — çep tarap kesilmesin
      $x = [Math]::Max(0, [int][Math]::Floor(($w - $boxW) * 0.35))
      $y = 0
    } else {
      $boxW = $w
      $boxH = [Math]::Max(1, [int][Math]::Floor($w / $target))
      $x = 0
      $y = [Math]::Max(0, [int][Math]::Floor(($h - $boxH) / 2.0))
    }
  }

  $rect = New-Object System.Drawing.Rectangle $x, $y, $boxW, $boxH
  $cropped = $img.Clone($rect, $img.PixelFormat)
  try {
    # Projectdäki surat ýeri: 132×172 → saklaýan faýl 450×600 (anketa-photo.js bilen birmeňzeş)
    $out = New-Object System.Drawing.Bitmap ${OUT_W}, ${OUT_H}
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($cropped, 0, 0, ${OUT_W}, ${OUT_H})
    $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
    $out.Save($dst, $codec, $ep)
    $ep.Dispose()
    $out.Dispose()
  } finally {
    $cropped.Dispose()
  }
} finally {
  $img.Dispose()
}
`;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 },
  );
  if (r.status !== 0) {
    if (process.env.NODE_ENV === 'development') {
      console.error('extractPortraitWindows fail:', r.stderr || r.stdout);
    }
    return false;
  }
  try {
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
  } catch {
    return false;
  }
}

function cropTo3x4Windows(srcPath, destPath) {
  return extractPortraitWindows(srcPath, destPath, { forceScanCorner: true });
}

function copyImageToUploads(srcPath, tag = '') {
  ensureUploadDir();
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${tag ? `-${tag}` : ''}`;
  const ext = path.extname(srcPath).toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext) ? ext : '.jpg';
  const dest = path.join(UPLOAD_DIR, `${unique}${safeExt}`);
  fs.copyFileSync(srcPath, dest);
  return `/uploads/${path.basename(dest)}`;
}

/** 3×4 → anketa_kici_suratlar (№.jpg). Skan goşundy uploads-da galýar. */
function copyImageToPortrait(srcPath, anketaNumber, opts = {}) {
  const portrait = require('./anketaPortraitFolderService');
  const saved = portrait.savePortraitFile(srcPath, anketaNumber, opts);
  return saved.url;
}

/**
 * Skan JPG: doly sahypa (scanUrl uploads) + 3×4 ýüz (photoUrl → kici).
 */
function saveScanAndPortrait(srcPath, opts = {}) {
  ensureUploadDir();
  const scanUrl = copyImageToUploads(srcPath, 'scan');
  const wantExtract = Boolean(opts.extractFromScan || opts.crop3x4);
  if (!wantExtract) {
    // Diňe skan — 3×4 hökmünde hem kici-e № bilen
    if (opts.anketaNumber) {
      try {
        return { photoUrl: copyImageToPortrait(srcPath, opts.anketaNumber, opts), scanUrl };
      } catch { /* fallthrough */ }
    }
    return { photoUrl: scanUrl, scanUrl };
  }
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const destJpg = path.join(UPLOAD_DIR, `${unique}-3x4.jpg`);
  if (extractPortraitWindows(srcPath, destJpg, { forceScanCorner: true })) {
    let photoUrl;
    try {
      photoUrl = copyImageToPortrait(destJpg, opts.anketaNumber, { ...opts, removeUpload: false });
      try { fs.unlinkSync(destJpg); } catch { /* ignore */ }
    } catch {
      photoUrl = `/uploads/${path.basename(destJpg)}`;
    }
    return { photoUrl, scanUrl };
  }
  return { photoUrl: scanUrl, scanUrl };
}

function savePhotoFromFile(srcPath, opts = {}) {
  const wantExtract = Boolean(opts.extractFromScan || opts.crop3x4);
  if (wantExtract || opts.keepFullScan) {
    return saveScanAndPortrait(srcPath, opts).photoUrl;
  }
  if (opts.anketaNumber || opts.anketaId) {
    try {
      return copyImageToPortrait(srcPath, opts.anketaNumber, opts);
    } catch { /* fallthrough uploads */ }
  }
  return copyImageToUploads(srcPath);
}

function parseExtra(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function loadAnketasForMatch() {
  const rows = await Anketa.findAll({
    attributes: [
      'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
      'passportNumber', 'photoUrl', 'extraData',
    ],
    raw: true,
  });
  return rows.map((a) => ({ ...a, extraData: parseExtra(a.extraData) }));
}

function buildMatchIndex(anketas) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const a of anketas) {
    for (const k of anketaIndexKeys(a)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(a);
    }
  }
  return map;
}

function resolveFile(filePath, index) {
  const keys = stemKeys(filePath);
  const numKeys = keys.filter((k) => k.startsWith('num:'));
  const otherKeys = keys.filter((k) => !k.startsWith('num:'));

  const collect = (keyList) => {
    /** @type {Map<number, object>} */
    const hits = new Map();
    for (const k of keyList) {
      const list = index.get(k);
      if (!list) continue;
      for (const a of list) hits.set(a.id, a);
    }
    return [...hits.values()];
  };

  // Ilki takyk № (26/2/78 ↔ 26.2.78)
  let found = collect(numKeys);
  if (found.length === 1) return { status: 'matched', anketa: found[0], keys };
  if (found.length > 1) {
    return {
      status: 'ambiguous',
      candidates: found.map((a) => ({
        id: a.id,
        anketaNumber: a.anketaNumber,
        name: [a.familyName, a.firstName].filter(Boolean).join(' '),
      })),
      keys,
    };
  }

  // № ýok bolsa — familiýa / pasport
  found = collect(otherKeys);
  if (found.length === 1) return { status: 'matched', anketa: found[0], keys };
  if (found.length > 1) {
    return {
      status: 'ambiguous',
      candidates: found.map((a) => ({
        id: a.id,
        anketaNumber: a.anketaNumber,
        name: [a.familyName, a.firstName].filter(Boolean).join(' '),
      })),
      keys,
    };
  }
  return { status: 'unmatched', keys };
}

/**
 * @param {Array<{ name: string, filePath?: string }>} entries
 * @param {object} opts
 */
async function linkPhotosFromEntries(entries, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const overwrite = Boolean(opts.overwrite);
  const relinkIfMissing = Boolean(opts.relinkIfMissing);
  const crop3x4 = Boolean(opts.crop3x4);
  const extractFromScan = opts.extractFromScan !== undefined
    ? Boolean(opts.extractFromScan)
    : crop3x4;
  const sourceLabel = opts.sourceLabel || '';

  const list = (Array.isArray(entries) ? entries : [])
    .map((e) => ({
      name: path.basename(String(e.name || e.filePath || '').replace(/\\/g, '/')),
      filePath: e.filePath || null,
    }))
    .filter((e) => e.name);

  const anketas = await loadAnketasForMatch();
  const index = buildMatchIndex(anketas);

  const summary = {
    folderPath: sourceLabel,
    filesTotal: list.length,
    anketasInDb: anketas.length,
    dryRun,
    overwrite,
    linked: 0,
    skippedHasPhoto: 0,
    unmatched: 0,
    ambiguous: 0,
    errors: 0,
    samples: {
      linked: [],
      unmatched: [],
      ambiguous: [],
      errors: [],
      skipped: [],
    },
  };

  for (const entry of list) {
    const name = entry.name;
    const resolved = resolveFile(name, index);
    if (resolved.status === 'unmatched') {
      summary.unmatched += 1;
      if (summary.samples.unmatched.length < 40) {
        summary.samples.unmatched.push({ file: name });
      }
      continue;
    }
    if (resolved.status === 'ambiguous') {
      summary.ambiguous += 1;
      if (summary.samples.ambiguous.length < 30) {
        summary.samples.ambiguous.push({
          file: name,
          candidates: resolved.candidates,
        });
      }
      continue;
    }

    const a = resolved.anketa;
    const wantPhoto = overwrite || !hasPhoto(a) || (relinkIfMissing && photoFileMissing(a));
    if (!wantPhoto) {
      summary.skippedHasPhoto += 1;
      if (summary.samples.skipped.length < 30) {
        summary.samples.skipped.push({
          file: name,
          anketaNumber: a.anketaNumber,
          reason: 'Surat eýýäm bar',
        });
      }
      continue;
    }

    if (dryRun) {
      summary.linked += 1;
      if (summary.samples.linked.length < 40) {
        summary.samples.linked.push({
          file: name,
          anketaId: a.id,
          anketaNumber: a.anketaNumber,
          name: [a.familyName, a.firstName].filter(Boolean).join(' '),
        });
      }
      continue;
    }

    if (!entry.filePath) {
      summary.errors += 1;
      if (summary.samples.errors.length < 20) {
        summary.samples.errors.push({ file: name, error: 'Faýl ýoly ýok' });
      }
      continue;
    }

    try {
      const url = savePhotoFromFile(entry.filePath, {
        extractFromScan,
        crop3x4: extractFromScan,
        anketaNumber: a.anketaNumber,
        anketaId: a.id,
      });
      const extra = { ...(a.extraData || {}), photos: [url] };
      await Anketa.update({ photoUrl: url, extraData: extra }, { where: { id: a.id } });
      a.photoUrl = url;
      a.extraData = extra;
      summary.linked += 1;
      if (summary.samples.linked.length < 40) {
        summary.samples.linked.push({
          file: name,
          anketaId: a.id,
          anketaNumber: a.anketaNumber,
          photoUrl: url,
        });
      }
    } catch (e) {
      summary.errors += 1;
      if (summary.samples.errors.length < 20) {
        summary.samples.errors.push({ file: name, error: e.message });
      }
    }
  }

  return summary;
}

/**
 * @param {object} opts
 * @param {string} opts.folderPath
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.overwrite]
 */
async function linkPhotosFromFolder(opts = {}) {
  const folderPath = String(opts.folderPath || '').trim();
  if (!folderPath) throw new ApiError(400, 'Papka ýoly boş');

  const files = listImageFiles(folderPath);
  const entries = files.map((filePath) => ({
    name: path.basename(filePath),
    filePath,
  }));
  return linkPhotosFromEntries(entries, {
    dryRun: opts.dryRun,
    overwrite: opts.overwrite,
    relinkIfMissing: opts.relinkIfMissing,
    crop3x4: opts.crop3x4,
    extractFromScan: opts.extractFromScan !== undefined ? opts.extractFromScan : opts.crop3x4,
    sourceLabel: path.resolve(folderPath),
  });
}

/** Windows papka dialogy (serwer PC-de — taskbar / öňe serediň) */
function pickFolderWindows(opts = {}) {
  if (process.platform !== 'win32') {
    throw new ApiError(400, 'Papka saýlamak diňe Windows-da goldanylýar');
  }
  const os = require('os');
  const title = String(opts.title || 'Kerwen — surat papkasyny saýlaň').replace(/'/g, "''");
  const tmpPs = path.join(os.tmpdir(), `kerwen-pick-folder-${Date.now()}.ps1`);
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles() | Out-Null
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$selected = $null
$cancelled = $false

$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $true
$owner.Text = '${title}'
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(420, 80)
$owner.FormBorderStyle = 'FixedToolWindow'
$owner.ShowIcon = $false
[void]$owner.Show()
$owner.Activate()
$owner.BringToFront()
try {
  $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
  $fbd.Description = '${title}'
  $fbd.ShowNewFolderButton = $true
  $fbd.RootFolder = [System.Environment+SpecialFolder]::MyComputer
  $r = $fbd.ShowDialog($owner)
  if ($r -eq [System.Windows.Forms.DialogResult]::OK -and $fbd.SelectedPath) {
    $selected = [string]$fbd.SelectedPath
  } elseif ($r -eq [System.Windows.Forms.DialogResult]::Cancel) {
    $cancelled = $true
  }
} catch {
  # FolderBrowserDialog şowsuz — Shell zapas
} finally {
  try { $owner.Close(); $owner.Dispose() } catch {}
}

# Ýatyr basyldy — ikinji dialog açma
if ($cancelled) { exit 2 }

# Zapas: Shell BrowseForFolder (FBD açylmasa)
if (-not $selected) {
  try {
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.BrowseForFolder(0, '${title}', 0x40, 0)
    if ($folder -ne $null) { $selected = [string]$folder.Self.Path }
  } catch {}
}

if (-not $selected) { exit 2 }
if (-not (Test-Path -LiteralPath $selected -PathType Container)) { exit 3 }
[Console]::Out.Write($selected)
exit 0
`;
  fs.writeFileSync(tmpPs, `\uFEFF${ps}`, 'utf8');
  try {
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
      { encoding: 'utf8', windowsHide: false, timeout: 300000 },
    );
    if (r.status === 2) {
      throw new ApiError(400, 'Papka saýlanmady (Ýatyr). Ýoly el bilen ýazyň → Sakla.');
    }
    if (r.status === 3) {
      throw new ApiError(400, 'Saýlanan ýol papka däl');
    }
    if (r.error) {
      throw new ApiError(500, `Papka dialogy: ${r.error.message}`);
    }
    if (r.status !== 0) {
      const err = String(r.stderr || r.stdout || '').trim();
      throw new ApiError(500, err || 'Papka dialogy açylmady — taskbar-a serediň (Kerwen dialogy)');
    }
    const selected = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
    if (!selected) throw new ApiError(400, 'Papka saýlanmady');
    if (!fs.existsSync(selected)) throw new ApiError(400, `Papka tapylmady: ${selected}`);
    if (!fs.statSync(selected).isDirectory()) {
      throw new ApiError(400, `Bu ýol papka däl: ${selected}`);
    }
    return selected;
  } finally {
    try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
  }
}

module.exports = {
  linkPhotosFromFolder,
  linkPhotosFromEntries,
  listImageFiles,
  pickFolderWindows,
  extractPortraitWindows,
  savePhotoFromFile,
  saveScanAndPortrait,
  normalizeKey,
  stemKeys,
  anketaIndexKeys,
  parseAnketaNumberParts,
  anketaNumberKeys,
};
