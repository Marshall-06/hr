/**
 * Anketa HTML → JPG (e-poçta).
 * Diňe .sheet mazmuny — aşakdaky boş ak ýer kesilýär.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { buildAnketaHtmlAttachment, fullName, safeFileName } = require('./anketaPrintHtml');
const scanFolder = require('./anketaScanFolderService');
const ApiError = require('../utils/ApiError');
/** A4 mazmun giňligi (~96dpi) */
const SHOT_WIDTH = 794;

function chromeCandidates() {
  const list = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  return [...new Set(list)];
}

function findBrowserExecutable() {
  for (const p of chromeCandidates()) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* */ }
  }
  return null;
}

function jpgFileName(anketa) {
  return String(safeFileName(anketa) || 'anketa.html').replace(/\.html$/i, '.jpg');
}

function toFileUrl(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

/** Screenshot üçin: diňe anketa, aşak boş ýok — anketa-print.css ölçegleri */
function prepareHtmlForShot(html) {
  const tightCss = `
<style id="kerwen-shot-css">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${SHOT_WIDTH}px !important;
    min-height: 0 !important;
    height: auto !important;
    overflow: hidden !important;
    background: #fff !important;
  }
  .sheet {
    width: ${SHOT_WIDTH}px !important;
    max-width: ${SHOT_WIDTH}px !important;
    margin: 0 auto !important;
    padding: 26px 38px 26px 57px !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
  }
</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tightCss}</head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${tightCss}</head><body>${html}</body></html>`;
}

/**
 * Tez crop: aşakdan ýokaryk gözleýär (boş ak ýeri aýyrýar) → JPG.
 */
function cropAndJpeg(pngPath, quality = 90) {
  const jpgPath = pngPath.replace(/\.png$/i, '.jpg');

  if (process.platform !== 'win32') {
    return fs.readFileSync(pngPath);
  }

  const ps = `
Add-Type -AssemblyName System.Drawing
$srcPath = '${pngPath.replace(/'/g, "''")}'
$outJpg = '${jpgPath.replace(/'/g, "''")}'
$bmp = New-Object System.Drawing.Bitmap $srcPath
$w = $bmp.Width; $h = $bmp.Height

function RowHasInk([System.Drawing.Bitmap]$b, [int]$y, [int]$w) {
  $step = [Math]::Max(1, [int]($w / 40))
  for ($x = 0; $x -lt $w; $x += $step) {
    $c = $b.GetPixel($x, $y)
    if ($c.A -ge 8 -and -not ($c.R -ge 250 -and $c.G -ge 250 -and $c.B -ge 250)) { return $true }
  }
  # gyralary hem barla
  foreach ($x in @(0, [int]($w/2), $w-1)) {
    if ($x -lt 0 -or $x -ge $w) { continue }
    $c = $b.GetPixel($x, $y)
    if ($c.A -ge 8 -and -not ($c.R -ge 250 -and $c.G -ge 250 -and $c.B -ge 250)) { return $true }
  }
  return $false
}

# Aşakdan ilkinji mazmun setiri
$maxY = $h - 1
while ($maxY -gt 0 -and -not (RowHasInk $bmp $maxY $w)) { $maxY-- }

# Ýokardan
$minY = 0
while ($minY -lt $maxY -and -not (RowHasInk $bmp $minY $w)) { $minY++ }

# Çep / sag — her 3-nji setir
$minX = $w; $maxX = -1
for ($y = $minY; $y -le $maxY; $y += 3) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.A -ge 8 -and -not ($c.R -ge 250 -and $c.G -ge 250 -and $c.B -ge 250)) {
      if ($x -lt $minX) { $minX = $x }
      break
    }
  }
  for ($x = $w - 1; $x -ge 0; $x--) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.A -ge 8 -and -not ($c.R -ge 250 -and $c.G -ge 250 -and $c.B -ge 250)) {
      if ($x -gt $maxX) { $maxX = $x }
      break
    }
  }
}
if ($maxX -lt 0) { $minX = 0; $maxX = $w - 1 }

$pad = 6
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($w - 1, $maxX + $pad)
$maxY = [Math]::Min($h - 1, $maxY + $pad)
$cw = [Math]::Max(1, $maxX - $minX + 1)
$ch = [Math]::Max(1, $maxY - $minY + 1)

$rect = New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch
$crop = $bmp.Clone($rect, $bmp.PixelFormat)
$bmp.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, ${quality}L)
$crop.Save($outJpg, $codec, $ep)
$crop.Dispose()
Write-Output ("ok " + $cw + "x" + $ch)
`;

  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  if (r.status !== 0 || !fs.existsSync(jpgPath)) {
    throw new Error((r.stderr || r.stdout || 'PNG→JPG crop näsaz').toString().slice(0, 300));
  }
  const buf = fs.readFileSync(jpgPath);
  try { fs.unlinkSync(jpgPath); } catch { /* */ }
  return buf;
}

async function htmlToJpegViaPuppeteer(html, executablePath) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    return null;
  }
  const userDataDir = path.join(os.tmpdir(), `kerwen-anketa-img-${process.pid}-${Date.now()}`);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir,
      defaultViewport: { width: SHOT_WIDTH, height: 400, deviceScaleFactor: 2 },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setContent(prepareHtmlForShot(html), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      const imgs = [...document.images];
      await Promise.all(imgs.map((img) => {
        if (img.complete) return null;
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 2000);
        });
      }));
    });

    const sheet = await page.$('.sheet');
    if (sheet) {
      const box = await sheet.boundingBox();
      if (box && box.height > 0) {
        await page.setViewport({
          width: Math.max(SHOT_WIDTH, Math.ceil(box.width) + 2),
          height: Math.ceil(box.height) + 2,
          deviceScaleFactor: 2,
        });
      }
      const buf = await sheet.screenshot({ type: 'jpeg', quality: 92, omitBackground: false });
      return Buffer.from(buf);
    }
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, fullPage: true });
    return Buffer.from(buf);
  } finally {
    try { await browser?.close(); } catch { /* */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

/**
 * 1) Screenshot (viewport)
 * 2) Aşakdaky ak ýeri kesip JPG
 */
function htmlToJpegViaCli(html, executablePath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerwen-anketa-'));
  const htmlPath = path.join(tmpDir, 'anketa.html');
  const pngPath = path.join(tmpDir, 'anketa.png');
  fs.writeFileSync(htmlPath, prepareHtmlForShot(html), 'utf8');

  const userDataDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${SHOT_WIDTH},1800`,
    `--screenshot=${pngPath}`,
    toFileUrl(htmlPath),
  ];

  const r = spawnSync(executablePath, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 90000,
  });

  if (!fs.existsSync(pngPath)) {
    const err = (r.stderr || r.stdout || '').slice(0, 400);
    throw new Error(`Brauzer screenshot alnmady. ${err || 'Edge/Chrome synap görüň.'}`);
  }

  try {
    return cropAndJpeg(pngPath, 92);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
async function htmlToJpegBuffer(html) {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new ApiError(503, 'Chrome/Edge tapylmady — JPG üçin Edge ýa-da Chrome gurnalyň');
  }

  try {
    const viaPuppeteer = await htmlToJpegViaPuppeteer(html, executablePath);
    if (viaPuppeteer && viaPuppeteer.length) return viaPuppeteer;
  } catch (e) {
    console.warn('puppeteer JPG synagy:', e.message || e);
  }

  try {
    return htmlToJpegViaCli(html, executablePath);
  } catch (e) {
    throw new ApiError(503, e.message || 'Anketa JPG döredilmedi');
  }
}

/**
 * Köne anketa (awgustdan öň) → skan papkadan asyl JPG; täze → programma HTML→JPG.
 * @param {object} anketa
 * @returns {Promise<{ filename: string, content: Buffer, contentType: string, cid: string, name?: string, source?: string }>}
 */
async function buildAnketaJpgAttachment(anketa) {
  const plain = typeof anketa.toJSON === 'function' ? anketa.toJSON() : anketa;
  const filename = jpgFileName(plain);
  const id = plain.id || plain.anketaNumber || Date.now();
  const cid = `anketa-${id}@kerwen`;

  // Saýlanan skan papkada №.jpg bar bolsa — şol JPG (programma daşynda / başga papka)
  const resolved = scanFolder.resolveScanForAnketa(plain);
  if (resolved?.path && fs.existsSync(resolved.path)) {
    const content = fs.readFileSync(resolved.path);
    const ext = path.extname(resolved.path);
    const isJpeg = ['.jpg', '.jpeg'].includes(ext.toLowerCase())
      || (content[0] === 0xff && content[1] === 0xd8);
    return {
      filename: isJpeg ? filename : filename.replace(/\.jpg$/i, ext.toLowerCase() || '.jpg'),
      content,
      contentType: scanFolder.mimeForExt(ext),
      cid,
      name: fullName(plain),
      source: resolved.source || 'scan',
    };
  }

  const htmlFile = buildAnketaHtmlAttachment(plain);
  const content = await htmlToJpegBuffer(htmlFile.content);
  const isJpeg = content[0] === 0xff && content[1] === 0xd8;
  return {
    filename: isJpeg ? filename : filename.replace(/\.jpg$/i, '.png'),
    content,
    contentType: isJpeg ? 'image/jpeg' : 'image/png',
    cid,
    name: fullName(plain),
    source: 'program',
  };
}
/** JPG synap gör; bolmasa HTML goşundy — poçta ýene-de gider. */
async function buildAnketaMailAttachment(anketa) {
  try {
    return await buildAnketaJpgAttachment(anketa);
  } catch (e) {
    console.warn('Anketa JPG ýasalmady, HTML iberilýär:', e.message || e);
    const plain = typeof anketa.toJSON === 'function' ? anketa.toJSON() : anketa;
    const htmlFile = buildAnketaHtmlAttachment(plain);
    const id = plain.id || Date.now();
    return {
      filename: String(htmlFile.filename || 'anketa.html'),
      content: Buffer.isBuffer(htmlFile.content)
        ? htmlFile.content
        : Buffer.from(String(htmlFile.content || ''), 'utf8'),
      contentType: 'text/html; charset=utf-8',
      cid: `anketa-${id}@kerwen`,
      name: fullName(plain),
      source: 'html-fallback',
    };
  }
}

module.exports = {
  htmlToJpegBuffer,
  buildAnketaJpgAttachment,
  buildAnketaMailAttachment,
  jpgFileName,
  findBrowserExecutable,
};
