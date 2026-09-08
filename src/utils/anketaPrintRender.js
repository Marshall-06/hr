/**
 * Anketa çap blankasy — public/js/anketa-print.js render() bilen deň.
 * E-poçta JPG we çap HTML üçin ortak mazmun.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const optionListService = require('../services/optionListService');
const {
  DEFAULT_LANGS,
  DEFAULT_PROG_LEFT,
  DEFAULT_PROG_RIGHT,
  LANG_SLOT_COUNT,
  PROG_SLOT_COUNT,
  buildFixedSlots,
  mapLanguageSlots,
  mapProgramSlots,
  splitProgramColumns,
} = require('./printSkillSlots');

const LEVELS = ['Başlangyç', 'Gowy', 'Has gowy'];

const PROG_ALIASES = {
  msword: ['msword', 'word'],
  excel: ['excel'],
  internet: ['internet', 'web'],
  acces: ['acces', 'access'],
  logo: ['logo'],
  '1cbuhg': ['1c', '1cbuhg', '1cбухг'],
  onbace: ['onbace', 'onbase', 'movavi'],
  photoshop: ['photoshop'],
  outlook: ['outlook', '3dmax'],
  coreldraw: ['coreldraw', 'corel'],
  primerepro: ['primerepro', 'premiere', 'premierepro'],
  autocad: ['autocad'],
  akhasap: ['akhasap', 'illustrator'],
  powerpoint: ['powerpoint'],
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function u(v) {
  if (v == null || v === '') return '&nbsp;';
  return esc(v);
}

function box(on) {
  return `<span class="box${on ? ' on' : ''}">${on ? 'V' : ''}</span>`;
}

function progMark(on) {
  return on ? 'V' : '&nbsp;';
}

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${String(x.getFullYear()).slice(-2)}`;
}

function normProg(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/[.\s]/g, '')
    .replace(/б/g, 'b')
    .replace(/с/g, 'c')
    .replace(/у/g, 'u')
    .replace(/х/g, 'h')
    .replace(/г/g, 'g');
}

function hasProg(progs, name) {
  const list = Array.isArray(progs) ? progs : [];
  const want = normProg(name);
  const aliases = PROG_ALIASES[want] || [want];
  const wants = new Set([want, ...aliases.map(normProg)]);
  return list.some((p) => {
    const s = normProg(p);
    for (const w of wants) {
      if (s === w || s.includes(w) || w.includes(s)) return true;
    }
    return false;
  });
}

function eduMark(level, current) {
  if (!current) return box(false);
  const a = String(current).toLowerCase().replace(/ý/g, 'y');
  const b = String(level).toLowerCase().replace(/ý/g, 'y');
  if (b === 'orta') return box(a === 'orta' || a.startsWith('orta '));
  return box(a.includes(b) || b.includes(a));
}

function padRows(rows, min) {
  const out = Array.isArray(rows) ? [...rows] : [];
  while (out.length < min) out.push({});
  return out;
}

function desiredLines(a) {
  const extra = a.extraData || a.extra_data || {};
  let parts = [];
  if (Array.isArray(extra.desiredPositions) && extra.desiredPositions.length) {
    parts = extra.desiredPositions.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (!parts.length) {
    const raw = String(a.desiredPosition || a.desired_position || '').trim();
    if (raw) {
      parts = raw.split(/\s*\/\s*|\n+|[,;|]+|\s+we\s+/i).map((x) => x.trim()).filter(Boolean);
    }
  }
  if (!parts.length) return ['', '', '', '', ''];
  while (parts.length < 5) parts.push('');
  return parts.slice(0, 5);
}

function splitCompany(e) {
  const company = String(e.company || '').trim();
  const ugry = String(e.direction || e.ugry || e.industry || '').trim();
  if (ugry) return { name: company, ugry };
  const m = company.match(/^(.+?)\s*[|/—–]\s*(.+)$/);
  if (m) return { name: m[1].trim(), ugry: m[2].trim() };
  return { name: company, ugry: '' };
}

function yesNo(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === '—' || s === '-') return 'Ýok';
  if (s === 'hawa' || s === 'bar' || s === 'yes' || s === '1') return 'Hawa';
  if (s === 'ýok' || s === 'yok' || s === 'no' || s === '0') return 'Ýok';
  return String(v);
}

function optionItems(key) {
  try {
    const items = optionListService.getItems(key);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function resolveLogoDataUrl() {
  const filePath = path.join(__dirname, '../../public/assets/logo.png');
  try {
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return `data:image/png;base64,${buf.toString('base64')}`;
    }
  } catch { /* ignore */ }
  return '';
}

function resolvePhotoDataUrl(photoRef) {
  if (!photoRef) return '';
  const s = String(photoRef).trim();
  if (s.startsWith('data:image')) return s;

  try {
    const portrait = require('../services/anketaPortraitFolderService');
    const abs = portrait.resolvePhotoAbs(s);
    if (abs && fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch { /* ignore */ }

  let rel = s.replace(/^https?:\/\/[^/]+/i, '');
  if (rel.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '../../public', rel.replace(/^\//, ''));
    try {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch { /* ignore */ }
  }
  return '';
}

function readImageDimensions(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    const buf = Buffer.from(base64, 'base64');
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const h = buf.readUInt16BE(i + 5);
          const w = buf.readUInt16BE(i + 7);
          return { w, h };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      return { w, h };
    }
  } catch { /* ignore */ }
  return null;
}

function firstPhotoData(anketa) {
  const plain = typeof anketa.toJSON === 'function' ? anketa.toJSON() : anketa;
  const extra = plain.extraData || plain.extra_data || {};
  const list = [];
  if (Array.isArray(extra.photos)) list.push(...extra.photos);
  if (plain.photoUrl) list.push(plain.photoUrl);
  if (plain.photo_url) list.push(plain.photo_url);
  for (const p of list) {
    const data = resolvePhotoDataUrl(p);
    if (data) return data;
  }
  try {
    const portrait = require('../services/anketaPortraitFolderService');
    const hit = portrait.resolvePortraitForAnketa(plain);
    if (hit?.path && fs.existsSync(hit.path)) {
      const buf = fs.readFileSync(hit.path);
      const ext = path.extname(hit.path).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch { /* ignore */ }
  return '';
}

function photoHtml(photoData) {
  if (!photoData) return '<span>surat</span>';
  const dim = readImageDimensions(photoData);
  let cls = '';
  let style = '';
  if (dim) {
    const { w, h } = dim;
    if (h >= 1000 || w >= 1000 || (h > w * 1.2 && h >= 800)) {
      cls = ' photo-from-scan';
      style = ' style="object-position:88% 6%"';
    }
  }
  return `<img class="${cls.trim()}" src="${photoData}" alt="surat"${style}>`;
}

function brandAgencyLine() {
  const short = String(env.brand?.short || 'KERWEN').trim() || 'KERWEN';
  return `KADRLAR AGENTLIGI «${esc(short.toUpperCase())}»`;
}

function footContactLine() {
  const mail = esc(env.company?.email || 'kadr.kerwen@gmail.com');
  const phone = esc(env.company?.phone || '+993 65 24 28 56');
  return `E-mail: ${mail} &nbsp;&nbsp;&nbsp; ${phone}`;
}

/**
 * @param {object} anketa
 * @returns {string} .sheet içindäki HTML
 */
function renderAnketaPrintBody(anketa) {
  const a = typeof anketa.toJSON === 'function' ? anketa.toJSON() : { ...anketa };
  const langs = a.languages || [];
  const progs = a.computerSkills || a.computer_skills || [];
  const extra = a.extraData || a.extra_data || {};

  const langNames = buildFixedSlots(optionItems('languages'), DEFAULT_LANGS, LANG_SLOT_COUNT);
  while (langNames.length < LANG_SLOT_COUNT) langNames.push('');
  const langSlots = mapLanguageSlots(langNames, langs);

  const progDefaults = [...DEFAULT_PROG_LEFT, ...DEFAULT_PROG_RIGHT];
  const progNames = buildFixedSlots(optionItems('programs'), progDefaults, PROG_SLOT_COUNT);
  while (progNames.length < PROG_SLOT_COUNT) progNames.push('');
  const allProgSlots = mapProgramSlots(progNames, progs, (name, label) => hasProg([name], label));
  const { left: progLeft, right: progRight } = splitProgramColumns(allProgSlots);

  const educationRaw = a.educationDetails || a.education_details || [];
  const education = padRows(educationRaw, 3).slice(0, Math.max(3, Array.isArray(educationRaw) ? educationRaw.length : 3));
  const experience = padRows(a.workExperience || a.work_experience, 4).slice(0, 4);
  const positions = desiredLines(a);

  const photoData = firstPhotoData(a);
  const photo = photoHtml(photoData);
  const logoData = resolveLogoDataUrl();
  const logo = logoData
    ? `<img class="x-logo" src="${logoData}" alt="Kerwen">`
    : '';

  const schedule = a.workSchedule || a.work_schedule || '';
  let from = extra.workFrom || '';
  let to = extra.workTo || '';
  if (!from && String(schedule).includes('-')) {
    const parts = String(schedule).split('-');
    from = (parts[0] || '').trim();
    to = (parts[1] || '').trim();
  }

  const yazgy = [a.registrationCity, a.registrationAddress].filter(Boolean).join(' ')
    || a.registrationAddress || '';
  const yasa = a.currentAddress || '';

  const langRows = langSlots.map((slot) => `
    <tr>
      <td class="lang-name">${esc(slot.label)}</td>
      ${LEVELS.map((lv) => `<td class="c">${box(String(slot.level || '').toLowerCase() === lv.toLowerCase())}</td>`).join('')}
    </tr>`).join('');

  const progLeftRows = progLeft.map((slot) => {
    const leftLabel = (normProg(slot.label) === 'logo' && extra.logoKurs)
      ? `Logo kurs: ${extra.logoKurs}`
      : slot.label;
    return `<tr>
      <td class="prog-name">${esc(leftLabel)}</td>
      <td class="c">${progMark(slot.checked)}</td>
    </tr>`;
  }).join('');

  const progRightRows = progRight.map((slot) => `<tr>
      <td class="prog-name">${esc(slot.label)}</td>
      <td class="c">${progMark(slot.checked)}</td>
    </tr>`).join('');

  return `
    <div class="x-brand">
      <div class="x-agency">${brandAgencyLine()}</div>
    </div>

    <div class="x-anketa-no">ANKETA № ${u(a.anketaNumber)}</div>

    <div class="x-top">
      ${logo}
      <div class="x-top-main">
        <div class="pos-row">
          <div class="pos-label">1) DALAŞGÄR WEZIPESI:</div>
          <table class="pos-table">
            <tbody>
              ${positions.map((p) => `<tr><td>${u(p)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="x-top-side">
        <div class="x-sene"><span>sene:</span> <b>${u(fmtDate(a.formDate || a.form_date))}</b></div>
        <div class="photo">${photo}</div>
      </div>
    </div>

    <div class="sec-title">2) ŞAHSY MAGLUMATLAR:</div>
    <div class="person-split">
      <table class="person person-half">
        <colgroup><col class="c-lbl"><col class="c-val"></colgroup>
        <tr><td class="lbl">Familiýasy:</td><td class="val">${u(a.familyName)}</td></tr>
        <tr><td class="lbl">Ady:</td><td class="val">${u(a.firstName)}</td></tr>
        <tr><td class="lbl">Atasynyň ady:</td><td class="val">${u(a.patronymic)}</td></tr>
        <tr><td class="lbl">Doglan ýyly:</td><td class="val">${u(extra.birthDate || a.birthYear)}</td></tr>
        <tr><td class="lbl">Doglan ýeri:</td><td class="val">${u(a.birthPlace)}</td></tr>
        <tr><td class="lbl">Milleti:</td><td class="val">${u(a.nationality)}</td></tr>
      </table>
      <table class="person person-half">
        <colgroup><col class="c-lbl"><col class="c-val"></colgroup>
        <tr><td class="lbl">Maşgala ýagdaýy:</td><td class="val">${u(a.maritalStatus)}</td></tr>
        <tr><td class="lbl">Çagalar:</td><td class="val">${u(yesNo(extra.hasChildren))}</td></tr>
        <tr><td class="lbl">Harby bilet:</td><td class="val">${u(a.militaryService)}</td></tr>
        <tr><td class="lbl">Sürüjilik şahadatnama:</td><td class="val">${u(a.drivingLicense)}</td></tr>
        <tr><td class="lbl">Şahsy awtoulagy:</td><td class="val">${u(a.hasCar)}</td></tr>
      </table>
    </div>
    <table class="person person-full">
      <colgroup><col class="c-lbl-l"><col class="c-val-l"></colgroup>
      <tr class="addr">
        <td class="lbl">Ýazgyda duran ýeri:</td>
        <td class="val">${u(yazgy)}</td>
      </tr>
      <tr class="addr">
        <td class="lbl">Häzirki ýaşaýan ýeri:</td>
        <td class="val">${u(yasa)}</td>
      </tr>
    </table>

    <div class="bilim-row bilim-row--excel">
      <span class="sec-inline">3) BILIMI:</span>
      <span>${eduMark('orta', a.educationLevel)} orta:</span>
      <span>${eduMark('ýörite', a.educationLevel)} ýörite orta:</span>
      <span>${eduMark('kurs', a.educationLevel)} kurs:</span>
      <span>${eduMark('ýokary', a.educationLevel)} ýokary:</span>
    </div>
    <table class="grid edu">
      <thead>
        <tr>
          <th class="w-years">Okan ýyllary</th>
          <th>Okuw jaýynyň ady</th>
          <th class="w-spec">Hünäri</th>
        </tr>
      </thead>
      <tbody>
        ${education.map((e) => {
          const isKurs = /^(kurs|course)$/i.test(String(e.kind || e.type || ''));
          const school = e.school || e.institution || e.name || '';
          const schoolLabel = isKurs && school ? `Kurs: ${school}` : school;
          return `
          <tr>
            <td>${u(e.years || e.year)}</td>
            <td>${u(schoolLabel)}</td>
            <td>${u(e.specialty)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="sec-title">4) DIL WE KOMPÝUTER SOWATLYGY:</div>
    <div class="skills-split">
      <table class="grid langs">
        <thead>
          <tr>
            <th>Dil</th>
            <th>Başlangyç</th>
            <th>Gowy</th>
            <th>Has gowy</th>
          </tr>
        </thead>
        <tbody>${langRows}</tbody>
      </table>
      <div class="progs-block">
        <div class="progs-head">PROGRAMMALAR</div>
        <div class="progs-split">
          <table class="grid progs progs-half">
            <colgroup><col class="prog-n"><col class="prog-t"></colgroup>
            <tbody>${progLeftRows}</tbody>
          </table>
          <table class="grid progs progs-half">
            <colgroup><col class="prog-n"><col class="prog-t"></colgroup>
            <tbody>${progRightRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="sec-title">5) IŞLÄN ÝERLERI BARADA MAGLUMAT</div>
    <table class="grid work">
      <thead>
        <tr>
          <th class="w-years">Sene</th>
          <th>Kärhananyň ady</th>
          <th class="w-dir">Kärhananyň ugry</th>
          <th class="w-pos">Işlän wezipesi</th>
        </tr>
      </thead>
      <tbody>
        ${experience.map((e) => {
    const c = splitCompany(e);
    return `<tr>
            <td>${u(e.years || e.period)}</td>
            <td>${u(c.name)}</td>
            <td>${u(c.ugry)}</td>
            <td>${u(e.position)}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>

    <div class="sec-title sec-terms">6) IŞ GRAFIGI WE BEÝLEKI ŞERTLER:</div>
    <div class="row6">
      <span class="lbl6">Iş grafigi:</span>
      <span class="u short">${u(from)}</span>
      <span>dan</span>
      <span class="u short">${u(to)}</span>
      <span>çenli</span>
      <span class="spacer"></span>
      <span class="lbl6">Isleýän zähmet haky:</span>
      <span class="u short">${u(a.currentSalary)}</span>
      <span>manat</span>
    </div>

    <div class="x-foot">
      <div class="x-foot-contact">${footContactLine()}</div>
      <div class="x-sign"><strong>Goly:</strong> <span class="sign-line"></span></div>
    </div>
  `;
}

function loadPrintStylesheet() {
  const cssPath = path.join(__dirname, '../../public/css/anketa-print.css');
  try {
    return fs.readFileSync(cssPath, 'utf8');
  } catch {
    return '';
  }
}

function emailPrintOverrides() {
  return `
/* E-poçta JPG — anketa-view blankasy bilen deň */
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
}
.sheet {
  width: 210mm !important;
  max-width: 210mm !important;
  min-height: auto !important;
  margin: 0 auto !important;
  padding: 7mm 1cm 7mm 1.5cm !important;
  box-shadow: none !important;
  background: #fff !important;
}
.photo img.photo-from-scan {
  object-fit: cover;
  object-position: 88% 6%;
}
`;
}

function fullName(a) {
  return [a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ').trim() || 'anketa';
}

function safeFileName(a) {
  const num = String(a.anketaNumber || a.id || 'x').replace(/[^\w\-№.]/g, '_');
  const name = fullName(a).replace(/[^\w\-а-яА-ЯёЁäÄöÖüÜňŇýÝşŞžŽçÇ\s]/gi, '').trim().replace(/\s+/g, '_');
  return `Anketa-${num}${name ? `-${name}` : ''}.html`.slice(0, 120);
}

/**
 * @param {object} anketa
 * @returns {{ filename: string, content: string, contentType: string }}
 */
function buildAnketaPrintDocument(anketa) {
  const a = typeof anketa.toJSON === 'function' ? anketa.toJSON() : { ...anketa };
  const body = renderAnketaPrintBody(a);
  const css = loadPrintStylesheet();
  const overrides = emailPrintOverrides();

  const content = `<!DOCTYPE html>
<html lang="tk">
<head>
<meta charset="UTF-8">
<title>Anketa № ${esc(a.anketaNumber || '')}</title>
<style>
${css}
${overrides}
</style>
</head>
<body>
  <div class="sheet">${body}</div>
</body>
</html>`;

  return {
    filename: safeFileName(a),
    content,
    contentType: 'text/html; charset=utf-8',
  };
}

module.exports = {
  renderAnketaPrintBody,
  buildAnketaPrintDocument,
  fullName,
  safeFileName,
  resolveLogoDataUrl,
  firstPhotoData,
};
