/**
 * Recapture admin screens (wait for data) + compress to small JPEG + rebuild CEO HTML.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const SHOTS = path.join(ROOT, 'public/assets/presentation');
const OUT_HTML = path.join(ROOT, 'public/Kerwen-Prezentasiya-CEO.html');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EDGE2 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8000';
const PROFILE = path.join(process.env.TEMP || process.env.TMP || '.', 'kerwen-edge-shots2');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function edgePath() {
  if (fs.existsSync(EDGE)) return EDGE;
  if (fs.existsSync(EDGE2)) return EDGE2;
  throw new Error('Edge tapylmady');
}

function ensurePuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    console.log('puppeteer-core ýüklenýär...');
    execFileSync('npm', ['install', 'puppeteer-core@23.11.1', '--no-save'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    return require('puppeteer-core');
  }
}

function compressToJpeg(pngPath, jpgPath, maxW = 1180, quality = 58) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${pngPath.replace(/'/g, "''")}')
$w = $src.Width; $h = $src.Height
if ($w -gt ${maxW}) { $h = [int]($h * ${maxW} / $w); $w = ${maxW} }
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, $w, $h)
$src.Dispose(); $g.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, ${quality}L)
$bmp.Save('${jpgPath.replace(/'/g, "''")}', $codec, $ep)
$bmp.Dispose()
Write-Output ((Get-Item '${jpgPath.replace(/'/g, "''")}').Length)
`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'compress fail');
  return Number(String(r.stdout).trim());
}

async function captureAll() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const puppeteer = ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: edgePath(),
    headless: true,
    defaultViewport: { width: 1360, height: 860 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${PROFILE}`],
  });
  const page = await browser.newPage();

  async function shot(name, doNav) {
    await doNav();
    // Maglumat table/stat ýükläýänçä garaş
    await sleep(2500);
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('tbody tr');
      const stats = document.querySelectorAll('.stat, .card h3');
      const excel = document.querySelector('#import-anketa-file, #btn-import-anketas');
      const match = document.querySelector('#match-vacancy, #match-results, .match-results-panel, #vacancy-select, select');
      const form = document.querySelector('#anketa-form, #vacancy-form, #login-form');
      return rows.length > 0 || stats.length > 2 || excel || match || form;
    }, { timeout: 20000 }).catch(() => null);
    await sleep(800);
    const png = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: png, type: 'png' });
    console.log('shot', name);
  }

  await shot('01-login', async () => {
    await page.goto(`${BASE}/admin/login.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  });

  await page.type('input[name="username"]', 'admin');
  await page.type('input[name="password"]', 'admin123');
  await Promise.all([
    page.waitForFunction(() => location.pathname.includes('dashboard'), { timeout: 60000 }),
    page.click('#login-form button[type="submit"]'),
  ]);
  await sleep(1500);

  async function openTab(tab) {
    await page.evaluate((t) => {
      const link = document.querySelector(`[data-tab="${t}"]`);
      if (link) link.click();
    }, tab);
    await sleep(1800);
  }

  await shot('02-dashboard', async () => {
    await openTab('dashboard');
  });
  await shot('03-anketas', async () => { await openTab('anketas'); });
  await shot('04-vacancies', async () => { await openTab('vacancies'); });
  await shot('05-match', async () => { await openTab('match'); });
  await shot('06-assigned', async () => { await openTab('assigned'); });
  await shot('07-reports', async () => { await openTab('reports'); });
  await shot('08-excel', async () => { await openTab('excel'); });

  await browser.close();
}

function imgData(name) {
  const jpg = path.join(SHOTS, `${name}.jpg`);
  const png = path.join(SHOTS, `${name}.png`);
  const file = fs.existsSync(jpg) ? jpg : png;
  if (!fs.existsSync(file)) return '';
  const b64 = fs.readFileSync(file).toString('base64');
  const mime = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${b64}`;
}

function buildHtml() {
  const S = {
    login: imgData('01-login'),
    dash: imgData('02-dashboard'),
    anketas: imgData('03-anketas'),
    vacancies: imgData('04-vacancies'),
    match: imgData('05-match'),
    assigned: imgData('06-assigned'),
    reports: imgData('07-reports'),
    excel: imgData('08-excel'),
  };

  const html = `<!DOCTYPE html>
<html lang="tk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kerwen Agenstwa — Sanly Panel Prezintasýasy</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#1a2026;color:#1e242b}
.deck{height:100%;position:relative}
.slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:clamp(18px,3.5vw,48px) clamp(18px,4.5vw,64px);background:linear-gradient(145deg,#f7f4ed,#ebe6dc);overflow:auto}
.slide.on{display:flex;z-index:1}
.slide.title,.slide.dark{background:linear-gradient(160deg,#2a343d,#3a4652 55%,#2f3b46);color:#fffcf7}
.eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a6853d;margin-bottom:10px}
.slide.title .eyebrow,.slide.dark .eyebrow{color:#d4b56a}
h1{font-size:clamp(1.7rem,4.2vw,3rem);line-height:1.12;margin-bottom:12px;max-width:18ch;font-weight:700}
h2{font-size:clamp(1.3rem,3vw,2.1rem);line-height:1.18;margin-bottom:10px;max-width:30ch;font-weight:700}
.lead{font-size:clamp(.92rem,1.5vw,1.1rem);line-height:1.45;max-width:52ch;color:#5c6570;font-weight:500}
.slide.title .lead,.slide.dark .lead{color:rgba(255,252,247,.78)}
.brand{font-size:1.05rem;font-weight:700;margin-bottom:16px}
.brand small{display:block;font-size:.7rem;font-weight:600;opacity:.65;letter-spacing:.08em;text-transform:uppercase;margin-top:3px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;max-width:980px}
.card{background:rgba(255,252,247,.88);border:1px solid rgba(47,59,70,.12);border-radius:12px;padding:12px 14px}
.slide.dark .card{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12)}
.card h3{font-size:.95rem;margin-bottom:6px;color:#2f3b46}
.slide.dark .card h3{color:#f0e6d0}
.card p,.card li{font-size:.84rem;line-height:1.4;color:#5c6570}
.slide.dark .card p,.slide.dark .card li{color:rgba(255,252,247,.72)}
.card ul{list-style:none;display:flex;flex-direction:column;gap:5px}
.card li:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#a6853d;margin-right:8px;vertical-align:middle}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.7rem;font-weight:700;margin-bottom:6px}
.badge.was{background:#e8eef3;color:#3d5a73}
.badge.new{background:#f3ead3;color:#7a6230}
.shot-wrap{margin-top:12px;max-width:960px}
.shot{width:100%;max-height:min(52vh,520px);object-fit:contain;object-position:top left;border-radius:10px;border:1px solid rgba(47,59,70,.14);box-shadow:0 8px 24px rgba(15,23,42,.12);background:#fff;display:block}
.shot-cap{font-size:.76rem;color:#6b7580;margin-top:6px}
.shot-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;max-width:1040px}
.note{margin-top:12px;font-size:.85rem;padding:10px 12px;border-radius:9px;background:#f3ead3;color:#5c4a22;max-width:720px;line-height:1.4}
.slide.dark .note{background:rgba(212,181,106,.15);color:#f0e6d0}
.cta{margin-top:18px;font-size:1rem;font-weight:600;color:#d4b56a}
.footer{margin-top:22px;font-size:.76rem;opacity:.6}
.nav{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px 14px;background:linear-gradient(to top,rgba(26,32,38,.94),transparent);color:#fff}
.dots{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;flex:1}
.dot{width:8px;height:8px;border-radius:50%;border:0;background:rgba(255,255,255,.28);cursor:pointer}
.dot.on{background:#d4b56a}
.btns{display:flex;gap:8px;align-items:center}
.btns button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:6px 11px;font:600 .78rem Segoe UI,sans-serif;cursor:pointer}
.counter{font-size:.78rem;opacity:.8;min-width:46px;text-align:right}
.hint{font-size:.72rem;opacity:.7}
@media(max-width:800px){.grid2,.shot-row{grid-template-columns:1fr}.hint{display:none}}
@media print{body{overflow:visible;background:#fff}.nav{display:none}.slide{position:relative;display:flex!important;page-break-after:always;min-height:100vh;overflow:visible}}
</style>
</head>
<body>
<div class="deck" id="deck">

<section class="slide title on" data-s>
  <div class="brand">Kerwen Agenstwa<small>Kadrlar Agentligi · Sanly panel</small></div>
  <p class="eyebrow">CEO / ýolbaşçy üçin gysgaça prezintasýa</p>
  <h1>Siziň Excel sanawlaryňyzdan — bir sanly ulgama</h1>
  <p class="lead">Ilki siziň beren ANKETA BAZA we Mähri wakansiýalar Excel faýllaryňyz boýunça gurduk. Soň işi tizleşdirmek üçin goşmaça mümkinçilikler goşduk.</p>
  <p class="footer">Bir faýl — internet gerek däl · ← → ýa-da boşluk bilen geçiň</p>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Başlangyç</p>
  <h2>Siziň asyl islegiňiz näme boldy?</h2>
  <p class="lead">Excel we telefon bilen işlemek ýerine — şol bir maglumatlary web panelde saklamak we dolandyrmak.</p>
  <div class="grid2">
    <div class="card">
      <span class="badge was">Siziň beren faýllaryňyz</span>
      <h3>ANKETA BAZA.xlsx</h3>
      <ul>
        <li>Sene, anketa №, wezipe, ýagdaý</li>
        <li>F.A.A., telefon, jyns, doglan ýyly</li>
        <li>Dil, programma, tejribe meýdanlary</li>
      </ul>
    </div>
    <div class="card">
      <span class="badge was">Siziň beren faýllaryňyz</span>
      <h3>Mähri wakansiýalar.xlsx</h3>
      <ul>
        <li>Iş №, firma, wezipe, hak</li>
        <li>Jogapkär, forum operator</li>
        <li>Açyk / ýapyk ýagdaýy</li>
      </ul>
    </div>
  </div>
  <div class="note">Bu bölek — agenstwanyň öz talaby: Excel-däki işi sanly bazada dowam etdirmek.</div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · 1</p>
  <h2>Excel import / export — köne sanawlary geçirmek</h2>
  <p class="lead">ANKETA BAZA we Mähri wakansiýalar görnüşinde ýükleýär we çykarýar.</p>
  <div class="shot-wrap">
    ${S.excel ? `<img class="shot" src="${S.excel}" alt="Excel" loading="lazy" decoding="async">` : ''}
    <p class="shot-cap">Panel → Excel: anketalar we wakansiýalar üçin ýükle / çykar</p>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · 2</p>
  <h2>Anketalar we wakansiýalar — bir bazada</h2>
  <p class="lead">Filtr, gözleg, ýagdaý üýtgetmek — Excel-däki sütüner boýunça.</p>
  <div class="shot-row">
    <div>
      ${S.anketas ? `<img class="shot" src="${S.anketas}" alt="Anketalar" loading="lazy" decoding="async">` : ''}
      <p class="shot-cap">Anketalar sanawy</p>
    </div>
    <div>
      ${S.vacancies ? `<img class="shot" src="${S.vacancies}" alt="Wakansiyalar" loading="lazy" decoding="async">` : ''}
      <p class="shot-cap">Wakansiýalar sanawy</p>
    </div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · 3</p>
  <h2>Hasabatlar we dolandyryş paneli</h2>
  <p class="lead">Umumy statistika, anketalar / wakansiýalar / işe ýerleşenler hasabaty.</p>
  <div class="shot-row">
    <div>
      ${S.dash ? `<img class="shot" src="${S.dash}" alt="Dashboard" loading="lazy" decoding="async">` : ''}
      <p class="shot-cap">Dolandyryş (statistika)</p>
    </div>
    <div>
      ${S.reports ? `<img class="shot" src="${S.reports}" alt="Hasabatlar" loading="lazy" decoding="async">` : ''}
      <p class="shot-cap">Hasabatlar</p>
    </div>
  </div>
</section>

<section class="slide dark" data-s>
  <p class="eyebrow">Indiki ädim</p>
  <h2>Biz goşmaça näme goşduk?</h2>
  <p class="lead">Sanawda diňe görmän — adyna / sanyna basyp jikme-jik maglumat açylýar.</p>
  <div class="grid2">
    <div class="card"><span class="badge new">Täze</span><h3>Hödürlenen sany</h3><p>Wakansiýada hödürlenenleriň sany görkezilýär. Üstüne basylsa — şol hödürlenenleriň sanawy açylýar.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Kärhana taryhy</h3><p>Kärhananyň adyna basylsa — şol firmanyň öň sargyt eden ähli wakansiýalarynyň sanawy çykýar.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Deňeşdirme maglumaty</h3><p>Bir firmanyň wakansiýasy saýlananda — şol wakansiýanyň doly maglumaty görkezilýär, soň gabat gelýän dalaşgärler.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Adyna basyp açmak</h3><p>Anketa / hödürlenenlerde dalaşgäriň adyna basylsa — şol adamyň anketasy açylýar.</p></div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Wakansiýalar</p>
  <h2>Hödürlenen sany we kärhana sanawy</h2>
  <p class="lead">Excel-de aýratyn gözlemeli zatlar — indi bir basyşda.</p>
  <div class="shot-wrap">
    ${S.vacancies ? `<img class="shot" src="${S.vacancies}" alt="Wakansiyalar" loading="lazy" decoding="async">` : ''}
    <p class="shot-cap">Wakansiýalar: kärhana adyna → firmanyň ähli wakansiýalary · hödürlenen sany → sanaw</p>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="card">
      <h3>Hödürlenen</h3>
      <ul>
        <li>Her wakansiýada sany görkezilýär</li>
        <li>Basyşda hödürlenenleriň doly sanawy</li>
      </ul>
    </div>
    <div class="card">
      <h3>Kärhana</h3>
      <ul>
        <li>Adyna basylsa — öňki sargytlar</li>
        <li>Açyk / ýapyk wakansiýalar bir ýerde</li>
      </ul>
    </div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Deňeşdirme</p>
  <h2>Wakansiýa saýlananda — doly maglumat</h2>
  <p class="lead">Firmanyň bir wezipesi saýlananda ilki wakansiýanyň jikme-jigi, soň gabat gelýän dalaşgärler (%) bilen.</p>
  <div class="shot-wrap">
    ${S.match ? `<img class="shot" src="${S.match}" alt="Deneshdirme" loading="lazy" decoding="async">` : ''}
    <p class="shot-cap">Deňeşdirme: wakansiýa maglumaty + «Dalaşgär tap» netijesi</p>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Hödürlenenler</p>
  <h2>Ähli hödürlemeler — bir tablisada</h2>
  <p class="lead">Sütünler: Anketa № · Dalaşgär · Telefon · Firma · Wezipe · Aýlyk · Wak. № · Ýagdaý · Hereket</p>
  <div class="shot-wrap">
    ${S.assigned ? `<img class="shot" src="${S.assigned}" alt="Hodurlenenler" loading="lazy" decoding="async">` : ''}
    <p class="shot-cap">Hödürlenenler: dalaşgär adyna basylsa anketasy açylýar · ýagdaýy üýtgedip bolýar</p>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Anketalar</p>
  <h2>Adyna basylsa — adamyň maglumaty</h2>
  <p class="lead">Anketalar we beýleki sanawlarda F.A.A. / dalaşgär adyna basylsa şol adamyň doly anketasy açylýar.</p>
  <div class="shot-wrap">
    ${S.anketas ? `<img class="shot" src="${S.anketas}" alt="Anketalar" loading="lazy" decoding="async">` : ''}
    <p class="shot-cap">Anketalar: F.A.A. baglanyşygy → anketa maglumaty</p>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Giriş</p>
  <h2>Howpsuz admin paneli</h2>
  <p class="lead">Diňe admin we operator girýär. Açyk (iş gözleýji) sahypa aýratyn gizlin baglanyşyk bilen.</p>
  <div class="shot-wrap">
    ${S.login ? `<img class="shot" src="${S.login}" alt="Login" loading="eager" decoding="async">` : ''}
    <p class="shot-cap">Login ekrany — Kerwen Panel</p>
  </div>
</section>

<section class="slide dark" data-s>
  <p class="eyebrow">Netije</p>
  <h2>Gysgaça: näme üýtgedi?</h2>
  <div class="grid2">
    <div class="card">
      <h3>Siziň islegiňiz (asyl)</h3>
      <ul>
        <li>Excel → web baza</li>
        <li>Anketa / wakansiýa dolandyrmak</li>
        <li>Hasabat we Excel çykarmak</li>
      </ul>
    </div>
    <div class="card">
      <h3>Biz goşan goşmaça</h3>
      <ul>
        <li>Hödürlenen sany + sanaw (basyşda)</li>
        <li>Kärhana adyna → ähli wakansiýalary</li>
        <li>Deňeşdirmede wakansiýanyň doly maglumaty</li>
        <li>Hödürlenenler tablisasy (№, FAA, tel, firma…)</li>
        <li>Adyna basylsa — adamyň anketasy</li>
      </ul>
    </div>
  </div>
  <div class="note">Asyl Excel işiňiz saklandy — üstüne tizleşdiriji gurallar goşuldy.</div>
</section>

<section class="slide title" data-s>
  <div class="brand">Kerwen Agenstwa<small>Sagboluň</small></div>
  <h1>Soraglaryňyz barmy?</h1>
  <p class="lead">Demo we maglumat üçin bilenýäris. Panel taýýar — agenstwanyň işine gönükdirilen.</p>
  <p class="cta">kadr.kerwen@gmail.com · +993 65 24 28 56</p>
  <p class="footer">← → / boşluk — slaýd · Esc — başy · Bu bir faýl, e-poçta bilen ugradyp bolýar</p>
</section>

</div>

<div class="nav">
  <span class="hint">← → / boşluk</span>
  <div class="dots" id="dots"></div>
  <div class="btns">
    <button type="button" id="prev">←</button>
    <button type="button" id="next">→</button>
    <span class="counter" id="n">1</span>
  </div>
</div>

<script>
(function(){
  var slides=[].slice.call(document.querySelectorAll('[data-s]'));
  var dots=document.getElementById('dots');
  var nEl=document.getElementById('n');
  var i=0;
  slides.forEach(function(_,idx){
    var b=document.createElement('button');
    b.type='button';b.className='dot'+(idx===0?' on':'');
    b.onclick=function(){go(idx)};
    dots.appendChild(b);
  });
  function go(x){
    i=(x+slides.length)%slides.length;
    slides.forEach(function(s,j){s.classList.toggle('on',j===i)});
    [].forEach.call(dots.children,function(d,j){d.classList.toggle('on',j===i)});
    nEl.textContent=(i+1)+' / '+slides.length;
    // Diňe açyk slaýddaky suratlary ýörite ýükle (beýlekiler lazy)
    var active=slides[i];
    if(active){
      active.querySelectorAll('img[data-src]').forEach(function(img){
        if(!img.src||img.src.indexOf('data:')===0) return;
      });
    }
  }
  document.getElementById('prev').onclick=function(){go(i-1)};
  document.getElementById('next').onclick=function(){go(i+1)};
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();go(i+1)}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(i-1)}
    else if(e.key==='Home'||e.key==='Escape')go(0);
    else if(e.key==='End')go(slides.length-1);
  });
  var tx=null;
  document.addEventListener('touchstart',function(e){tx=e.changedTouches[0].screenX},{passive:true});
  document.addEventListener('touchend',function(e){
    if(tx==null)return;
    var dx=e.changedTouches[0].screenX-tx;
    if(Math.abs(dx)>50)go(dx<0?i+1:i-1);
    tx=null;
  },{passive:true});
  go(0);
})();
</script>
</body>
</html>`;

  fs.writeFileSync(OUT_HTML, html, 'utf8');
  const mb = (fs.statSync(OUT_HTML).size / (1024 * 1024)).toFixed(2);
  console.log('HTML:', OUT_HTML);
  console.log('Size:', mb, 'MB');
}

async function main() {
  const onlyBuild = process.argv.includes('--build-only');
  if (!onlyBuild) {
    console.log('1) Täze screenshot...');
    await captureAll();
    console.log('2) JPEG gysmak...');
    const names = ['01-login', '02-dashboard', '03-anketas', '04-vacancies', '05-match', '06-assigned', '07-reports', '08-excel'];
    for (const n of names) {
      const png = path.join(SHOTS, `${n}.png`);
      const jpg = path.join(SHOTS, `${n}.jpg`);
      if (!fs.existsSync(png)) continue;
      const size = compressToJpeg(png, jpg, 1100, 55);
      console.log(n, Math.round(size / 1024) + 'KB');
    }
  }
  console.log('3) HTML ýygnalýar...');
  buildHtml();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
