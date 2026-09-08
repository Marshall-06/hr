const LANGS = ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Azerbeýjan', 'Pars', 'Özbek'];
const LEVELS = ['Başlangyç', 'Gowy', 'Has gowy'];
const PROG_LEFT = ['MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE'];
const PROG_RIGHT = ['Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint'];
let PRINT_LANG_ITEMS = LANGS.slice();
let PRINT_PROG_ITEMS = [...PROG_LEFT, ...PROG_RIGHT];

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

function box(on) {
  return `<span class="box${on ? ' on' : ''}">${on ? 'V' : ''}</span>`;
}

function progMark(on) {
  return on ? 'V' : '&nbsp;';
}

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

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${String(x.getFullYear()).slice(-2)}`;
}

function langLevel(langs, name, level) {
  const list = Array.isArray(langs) ? langs : [];
  return list.some((item) => {
    if (typeof item === 'string') return false;
    return String(item.name || '').toLowerCase() === name.toLowerCase()
      && String(item.level || '').toLowerCase() === level.toLowerCase();
  });
}

function skillNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function uniqueSkillNames(list, max) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((raw) => {
    const name = String(raw || '').trim();
    if (!name) return;
    const key = skillNameKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out.slice(0, max);
}

function mapLanguageSlots(slotNames, languages) {
  const slots = (slotNames || []).map((label) => ({ label: String(label || '').trim(), level: '' }));
  const selected = (Array.isArray(languages) ? languages : []).map((item) => {
    if (typeof item === 'string') return { name: item.trim(), level: '' };
    return { name: String(item?.name || '').trim(), level: String(item?.level || '').trim() };
  }).filter((x) => x.name);
  const taken = new Set();
  selected.forEach((lang, idx) => {
    const hit = slots.findIndex((slot) => !slot.level && skillNameKey(slot.label) === skillNameKey(lang.name));
    if (hit < 0) return;
    slots[hit].level = lang.level;
    taken.add(idx);
  });
  selected.forEach((lang, idx) => {
    if (taken.has(idx)) return;
    let empty = -1;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (!slots[i].level) {
        empty = i;
        break;
      }
    }
    if (empty >= 0) slots[empty] = { label: lang.name, level: lang.level };
    else slots.push({ label: lang.name, level: lang.level });
    taken.add(idx);
  });
  return slots;
}

function mapProgramSlots(slotNames, programs) {
  const slots = (slotNames || []).map((label) => ({ label: String(label || '').trim(), checked: false }));
  const selected = (Array.isArray(programs) ? programs : [])
    .map((item) => (typeof item === 'string' ? item.trim() : String(item?.name || '').trim()))
    .filter(Boolean);
  const taken = new Set();
  selected.forEach((name, idx) => {
    const hit = slots.findIndex((slot) => !slot.checked && hasProg([name], slot.label));
    if (hit < 0) return;
    slots[hit].checked = true;
    taken.add(idx);
  });
  selected.forEach((name, idx) => {
    if (taken.has(idx)) return;
    let empty = -1;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (!slots[i].checked) {
        empty = i;
        break;
      }
    }
    if (empty >= 0) slots[empty] = { label: name, checked: true };
    else slots.push({ label: name, checked: true });
    taken.add(idx);
  });
  return slots;
}

async function loadPrintSkillLists() {
  if (typeof api === 'undefined' || !api.get) return;
  try {
    const langs = await api.get('/option-lists/languages');
    if (Array.isArray(langs?.data?.items) && langs.data.items.length) {
      PRINT_LANG_ITEMS = langs.data.items.slice();
    }
  } catch (_) { /* defaults */ }
  try {
    const progs = await api.get('/option-lists/programs');
    if (Array.isArray(progs?.data?.items) && progs.data.items.length) {
      PRINT_PROG_ITEMS = progs.data.items.slice();
    }
  } catch (_) { /* defaults */ }
}

loadPrintSkillLists();

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
    const raw = String(a.desiredPosition || '').trim();
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

/** Excel ANKETA Kadr Türkmençe — bir A4 sahypa */
function firstPhotoUrl(a) {
  const extra = a.extraData || a.extra_data || {};
  if (a.photoUrl) return a.photoUrl;
  if (a.photo_url) return a.photo_url;
  if (Array.isArray(extra.photos) && extra.photos.length) {
    const p = extra.photos.find((x) => x && String(x).trim());
    if (p) return p;
  }
  return '';
}

function enhancePhotoBox(root) {
  const img = root?.querySelector?.('.photo img');
  if (!img) return;
  const apply = () => {
    const w = img.naturalWidth || 0;
    const h = img.naturalHeight || 0;
    if (!w || !h) return;
    // Doly skan uly — 3×4 gutuda ýüz sag ýokarky burçda (anketa blankasy)
    if (h >= 1000 || w >= 1000 || (h > w * 1.2 && h >= 800)) {
      img.classList.add('photo-from-scan');
      img.style.objectPosition = '88% 6%';
    }
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
}

function render(a) {
  const langs = a.languages || [];
  const progs = a.computerSkills || [];
  const extra = a.extraData || {};
  const langSlots = mapLanguageSlots(uniqueSkillNames([...PRINT_LANG_ITEMS, ...LANGS], LANGS.length), langs);
  while (langSlots.length < LANGS.length) langSlots.push({ label: '', level: '' });
  const allProgDefaults = [...PROG_LEFT, ...PROG_RIGHT];
  const progSlots = mapProgramSlots(
    uniqueSkillNames([...PRINT_PROG_ITEMS, ...allProgDefaults], allProgDefaults.length),
    progs,
  );
  while (progSlots.length < allProgDefaults.length) progSlots.push({ label: '', checked: false });
  const progLeft = progSlots.slice(0, PROG_LEFT.length);
  const progRight = progSlots.slice(PROG_LEFT.length, allProgDefaults.length);
  progSlots.slice(allProgDefaults.length).forEach((slot, idx) => {
    if (idx % 2 === 0) progLeft.push(slot);
    else progRight.push(slot);
  });
  const educationRaw = Array.isArray(a.educationDetails) ? a.educationDetails : [];
  const education = padRows(educationRaw, 3).slice(0, Math.max(3, educationRaw.length));
  const experience = padRows(a.workExperience, 4).slice(0, 4);
  const positions = desiredLines(a);

  const photoSrc = firstPhotoUrl(a);
  const photo = photoSrc
    ? `<img src="${esc(photoSrc)}" alt="surat">`
    : '<span>surat</span>';

  const schedule = a.workSchedule || '';
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
      <div class="x-agency">KADRLAR AGENTLIGI «KERWEN»</div>
    </div>

    <div class="x-anketa-no">ANKETA № ${u(a.anketaNumber)}</div>

    <div class="x-top">
      <img class="x-logo" src="/assets/logo.png" alt="Kerwen" onerror="this.style.display='none'">
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
        <div class="x-sene"><span>sene:</span> <b>${u(fmtDate(a.formDate))}</b></div>
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
      <div class="x-foot-contact">E-mail: kadr.kerwen@gmail.com &nbsp;&nbsp;&nbsp; +993 65 24 28 56</div>
      <div class="x-sign"><strong>Goly:</strong> <span class="sign-line"></span></div>
    </div>
  `;
}

window.renderAnketaPrintSheet = function renderAnketaPrintSheet(a) {
  const html = render(a);
  // Callers set innerHTML then we enhance — return html; enhance after insert
  return html;
};
window.enhanceAnketaPrintPhoto = enhancePhotoBox;
window.ensurePrintSkillLists = loadPrintSkillLists;

(async function initAnketaPrintPage() {
  if (!/anketa-print\.html/i.test(window.location.pathname || '')) return;

  const sheet = document.getElementById('sheet');
  if (!sheet) return;

  const printParams = new URLSearchParams(window.location.search);
  const printId = printParams.get('id');
  const forceView = String(printParams.get('view') || '').toLowerCase();
  if (!printId) {
    sheet.innerHTML = '<p class="err">Anketa ID tapylmady</p>';
    return;
  }

  try {
    const token = (window.Auth && Auth.getToken()) || sessionStorage.getItem('token') || '';
    const res = await fetch(`/api/anketas/print/${encodeURIComponent(printId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Ýüklenmedi (${res.status})`);
    if (!data.data) throw new Error('Anketa maglumaty ýok');
    const a = data.data;

    let shownScan = false;
    if (window.AnketaScanView?.loadScanIntoElement) {
      try {
        const r = await AnketaScanView.loadScanIntoElement(sheet, printId, a.anketaNumber, forceView);
        shownScan = Boolean(r?.shown);
      } catch { /* forma */ }
    }
    if (!shownScan) {
      document.body.classList.remove('anketa-scan-mode');
      await loadPrintSkillLists();
      sheet.innerHTML = render(a);
      enhancePhotoBox(sheet);
    }
    document.title = `Anketa № ${a.anketaNumber || printId}`;
  } catch (err) {
    document.body.classList.remove('anketa-scan-mode');
    sheet.innerHTML = `<p class="err">${esc(err.message || 'Ýalňyşlyk')}</p>`;
  }
})();
