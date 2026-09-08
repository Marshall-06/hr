/**
 * Build lightweight single-file CEO presentation.
 * Images: JPEG base64, injected only when slide opens (fast first open).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SHOTS = path.join(ROOT, 'public/assets/presentation');
const OUT = path.join(ROOT, 'public/Kerwen-Prezentasiya-CEO.html');

function b64(name) {
  const jpg = path.join(SHOTS, `${name}.jpg`);
  const png = path.join(SHOTS, `${name}.png`);
  const file = fs.existsSync(jpg) ? jpg : (fs.existsSync(png) ? png : null);
  if (!file) return '';
  const mime = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

const IMGS = {
  login: b64('01-login'),
  dash: b64('02-dashboard'),
  anketas: b64('03-anketas'),
  vacancies: b64('04-vacancies'),
  match: b64('05-match'),
  assigned: b64('06-assigned'),
  reports: b64('07-reports'),
  excel: b64('08-excel'),
};

const imgsJson = JSON.stringify(IMGS);

const html = `<!DOCTYPE html>
<html lang="tk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kerwen Agenstwa — Prezintasýa</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#1a2026;color:#1e242b}
.deck{height:100%;position:relative}
.slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:clamp(16px,3vw,44px) clamp(16px,4vw,60px);background:linear-gradient(145deg,#f7f4ed,#ebe6dc);overflow:auto}
.slide.on{display:flex;z-index:1}
.slide.title,.slide.dark{background:linear-gradient(160deg,#2a343d,#3a4652 55%,#2f3b46);color:#fffcf7}
.eyebrow{font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a6853d;margin-bottom:8px}
.slide.title .eyebrow,.slide.dark .eyebrow{color:#d4b56a}
h1{font-size:clamp(1.6rem,4vw,2.8rem);line-height:1.12;margin-bottom:10px;max-width:18ch;font-weight:700}
h2{font-size:clamp(1.25rem,2.8vw,2rem);line-height:1.18;margin-bottom:8px;max-width:32ch;font-weight:700}
.lead{font-size:clamp(.9rem,1.4vw,1.05rem);line-height:1.45;max-width:54ch;color:#5c6570;font-weight:500}
.slide.title .lead,.slide.dark .lead{color:rgba(255,252,247,.78)}
.brand{font-size:1rem;font-weight:700;margin-bottom:14px}
.brand small{display:block;font-size:.68rem;font-weight:600;opacity:.65;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;max-width:960px}
.card{background:rgba(255,252,247,.9);border:1px solid rgba(47,59,70,.12);border-radius:11px;padding:11px 13px}
.slide.dark .card{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12)}
.card h3{font-size:.92rem;margin-bottom:5px;color:#2f3b46}
.slide.dark .card h3{color:#f0e6d0}
.card p,.card li{font-size:.82rem;line-height:1.4;color:#5c6570}
.slide.dark .card p,.slide.dark .card li{color:rgba(255,252,247,.72)}
.card ul{list-style:none}
.card li{margin:4px 0}
.card li:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:#a6853d;margin-right:7px;vertical-align:middle}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:700;margin-bottom:5px}
.badge.was{background:#e8eef3;color:#3d5a73}
.badge.new{background:#f3ead3;color:#7a6230}
.shot-wrap{margin-top:10px;max-width:940px}
.shot{width:100%;max-height:min(50vh,480px);object-fit:contain;object-position:top left;border-radius:9px;border:1px solid rgba(47,59,70,.14);box-shadow:0 6px 20px rgba(15,23,42,.1);background:#e8e4da;display:block;min-height:120px}
.shot-cap{font-size:.74rem;color:#6b7580;margin-top:5px}
.shot-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;max-width:1000px}
.note{margin-top:10px;font-size:.82rem;padding:9px 11px;border-radius:8px;background:#f3ead3;color:#5c4a22;max-width:700px;line-height:1.4}
.slide.dark .note{background:rgba(212,181,106,.15);color:#f0e6d0}
.cta{margin-top:16px;font-size:.98rem;font-weight:600;color:#d4b56a}
.footer{margin-top:18px;font-size:.74rem;opacity:.6}
.nav{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px 12px;background:linear-gradient(to top,rgba(26,32,38,.95),transparent);color:#fff}
.dots{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;flex:1}
.dot{width:7px;height:7px;border-radius:50%;border:0;background:rgba(255,255,255,.28);cursor:pointer}
.dot.on{background:#d4b56a}
.btns{display:flex;gap:6px;align-items:center}
.btns button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;border-radius:7px;padding:5px 10px;font:600 .76rem Segoe UI,sans-serif;cursor:pointer}
.counter{font-size:.76rem;opacity:.8;min-width:44px;text-align:right}
.hint{font-size:.7rem;opacity:.7}
@media(max-width:800px){.grid2,.shot-row{grid-template-columns:1fr}.hint{display:none}}
</style>
</head>
<body>
<div class="deck">

<section class="slide title on" data-s>
  <div class="brand">Kerwen Agenstwa<small>Kadrlar Agentligi · Sanly panel</small></div>
  <p class="eyebrow">CEO / ýolbaşçy üçin gysgaça prezintasýa</p>
  <h1>Siziň Excel sanawlaryňyzdan — bir sanly ulgama</h1>
  <p class="lead">Ilki siziň beren ANKETA BAZA we Mähri wakansiýalar Excel faýllaryňyz boýunça gurduk. Soň işi tizleşdirmek üçin goşmaça mümkinçilikler goşduk.</p>
  <p class="footer">Bir faýl — internet gerek däl · ← → / boşluk bilen geçiň</p>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Başlangyç</p>
  <h2>Siziň asyl islegiňiz näme boldy?</h2>
  <p class="lead">Excel we telefon bilen işlemek ýerine — şol bir maglumatlary web panelde saklamak we dolandyrmak.</p>
  <div class="grid2">
    <div class="card"><span class="badge was">Siziň faýlyňyz</span><h3>ANKETA BAZA.xlsx</h3><ul><li>Sene, anketa №, wezipe, ýagdaý</li><li>F.A.A., telefon, jyns</li><li>Dil, programma, tejribe</li></ul></div>
    <div class="card"><span class="badge was">Siziň faýlyňyz</span><h3>Mähri wakansiýalar.xlsx</h3><ul><li>Iş №, firma, wezipe, hak</li><li>Jogapkär, forum operator</li><li>Açyk / ýapyk ýagdaýy</li></ul></div>
  </div>
  <div class="note">Bu bölek — agenstwanyň öz talaby: Excel-däki işi sanly bazada dowam etdirmek.</div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · Excel</p>
  <h2>Excel import / export</h2>
  <p class="lead">ANKETA BAZA we Mähri wakansiýalar görnüşinde ýükleýär we çykarýar.</p>
  <div class="shot-wrap"><img class="shot" data-img="excel" alt="Excel"><p class="shot-cap">Panel → Excel: ýükle / çykar</p></div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · Sanawlar</p>
  <h2>Anketalar we wakansiýalar — bir bazada</h2>
  <p class="lead">Filtr, gözleg, ýagdaý üýtgetmek.</p>
  <div class="shot-row">
    <div><img class="shot" data-img="anketas" alt="Anketalar"><p class="shot-cap">Anketalar</p></div>
    <div><img class="shot" data-img="vacancies" alt="Wakansiyalar"><p class="shot-cap">Wakansiýalar</p></div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Asyl talap · Hasabat</p>
  <h2>Hasabatlar we dolandyryş</h2>
  <div class="shot-row">
    <div><img class="shot" data-img="dash" alt="Dashboard"><p class="shot-cap">Statistika</p></div>
    <div><img class="shot" data-img="reports" alt="Hasabatlar"><p class="shot-cap">Hasabatlar</p></div>
  </div>
</section>

<section class="slide dark" data-s>
  <p class="eyebrow">Indiki ädim</p>
  <h2>Biz goşmaça näme goşduk?</h2>
  <p class="lead">Sanawda diňe görmän — adyna / sanyna basyp jikme-jik maglumat açylýar.</p>
  <div class="grid2">
    <div class="card"><span class="badge new">Täze</span><h3>Hödürlenen sany</h3><p>Wakansiýada sany görkezilýär. Üstüne basylsa — hödürlenenleriň sanawy açylýar.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Kärhana taryhy</h3><p>Kärhananyň adyna basylsa — firmanyň öňki ähli wakansiýalary çykýar.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Deňeşdirme maglumaty</h3><p>Wakansiýa saýlananda doly maglumat, soň gabat gelýän dalaşgärler.</p></div>
    <div class="card"><span class="badge new">Täze</span><h3>Adyna basyp açmak</h3><p>Dalaşgäriň adyna basylsa — şol adamyň anketasy açylýar.</p></div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Wakansiýalar</p>
  <h2>Hödürlenen sany we kärhana sanawy</h2>
  <div class="shot-wrap"><img class="shot" data-img="vacancies" alt="Wakansiyalar"><p class="shot-cap">Kärhana adyna → ähli wakansiýalar · hödürlenen sany → sanaw</p></div>
  <div class="grid2" style="margin-top:10px">
    <div class="card"><h3>Hödürlenen</h3><ul><li>Her wakansiýada sany</li><li>Basyşda doly sanaw</li></ul></div>
    <div class="card"><h3>Kärhana</h3><ul><li>Adyna basylsa — öňki sargytlar</li><li>Açyk / ýapyk bir ýerde</li></ul></div>
  </div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Deňeşdirme</p>
  <h2>Wakansiýa saýlananda — doly maglumat</h2>
  <div class="shot-wrap"><img class="shot" data-img="match" alt="Deneshdirme"><p class="shot-cap">Wakansiýa maglumaty + dalaşgär netijeleri</p></div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Hödürlenenler</p>
  <h2>Ähli hödürlemeler — bir tablisada</h2>
  <p class="lead">Anketa № · Dalaşgär · Telefon · Firma · Wezipe · Aýlyk · Wak. № · Ýagdaý · Hereket</p>
  <div class="shot-wrap"><img class="shot" data-img="assigned" alt="Hodurlenenler"><p class="shot-cap">Adyna basylsa anketasy açylýar</p></div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Goşmaça · Anketalar</p>
  <h2>Adyna basylsa — adamyň maglumaty</h2>
  <div class="shot-wrap"><img class="shot" data-img="anketas" alt="Anketalar"><p class="shot-cap">F.A.A. baglanyşygy → anketa maglumaty</p></div>
</section>

<section class="slide" data-s>
  <p class="eyebrow">Giriş</p>
  <h2>Howpsuz admin paneli</h2>
  <div class="shot-wrap"><img class="shot" data-img="login" alt="Login"><p class="shot-cap">Login — Kerwen Panel</p></div>
</section>

<section class="slide dark" data-s>
  <p class="eyebrow">Netije</p>
  <h2>Gysgaça</h2>
  <div class="grid2">
    <div class="card"><h3>Siziň islegiňiz</h3><ul><li>Excel → web baza</li><li>Anketa / wakansiýa</li><li>Hasabat we Excel</li></ul></div>
    <div class="card"><h3>Biz goşanlar</h3><ul><li>Hödürlenen sany + sanaw</li><li>Kärhana adyna → wakansiýalar</li><li>Deňeşdirmede doly maglumat</li><li>Hödürlenenler tablisasy</li><li>Adyna basylsa — anketa</li></ul></div>
  </div>
  <div class="note">Asyl Excel işiňiz saklandy — üstüne tizleşdiriji gurallar goşuldy.</div>
</section>

<section class="slide title" data-s>
  <div class="brand">Kerwen Agenstwa<small>Sagboluň</small></div>
  <h1>Soraglaryňyz barmy?</h1>
  <p class="lead">Panel taýýar — agenstwanyň işine gönükdirilen.</p>
  <p class="cta">kadr.kerwen@gmail.com · +993 65 24 28 56</p>
  <p class="footer">← → / boşluk · Esc — başy · Bir HTML faýl</p>
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
  var IMGS=${imgsJson};
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
  function fillImgs(slide){
    if(!slide||slide._filled) return;
    slide.querySelectorAll('img[data-img]').forEach(function(el){
      var k=el.getAttribute('data-img');
      if(IMGS[k]) el.src=IMGS[k];
    });
    slide._filled=true;
  }
  function go(x){
    i=(x+slides.length)%slides.length;
    slides.forEach(function(s,j){s.classList.toggle('on',j===i)});
    [].forEach.call(dots.children,function(d,j){d.classList.toggle('on',j===i)});
    nEl.textContent=(i+1)+' / '+slides.length;
    fillImgs(slides[i]);
    // Indiki slaýdy öňünden taýýarla
    if(slides[i+1]) setTimeout(function(){fillImgs(slides[i+1])},40);
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
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
const bytes = fs.statSync(OUT).size;
console.log('Wrote', OUT);
console.log('Size', (bytes / 1024).toFixed(0) + ' KB', '(' + (bytes / (1024 * 1024)).toFixed(2) + ' MB)');
