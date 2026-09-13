let LANGS = ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Pars', 'Özbek'];
let PROGRAMS = [
  'MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE',
  'Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint',
];

async function loadSkillOptionLists() {
  const prevLangs = typeof collectLanguages === 'function' ? collectLanguages() : [];
  const prevProgs = typeof collectPrograms === 'function' ? collectPrograms() : [];
  if (!window.OptionLists) {
    renderLangLevels();
    renderPrograms();
    restoreSkillSelections(prevLangs, prevProgs);
    return;
  }
  try {
    const langs = await OptionLists.fetchList('languages');
    if (Array.isArray(langs?.items) && langs.items.length) LANGS = langs.items.slice();
  } catch (_) { /* defaults */ }
  try {
    const progs = await OptionLists.fetchList('programs');
    if (Array.isArray(progs?.items) && progs.items.length) PROGRAMS = progs.items.slice();
  } catch (_) { /* defaults */ }
  renderLangLevels();
  renderPrograms();
  restoreSkillSelections(prevLangs, prevProgs);
}

function skillNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c');
}

function restoreSkillSelections(langs, progs) {
  (langs || []).forEach((item) => placeLanguageInForm(item.name, item.level, { quiet: true }));
  (progs || []).forEach((name) => placeProgramInForm(name, { quiet: true }));
}

function mountAnketaOptionEditors() {
  if (!window.OptionLists || !OptionLists.isAdminUser()) return;
  document.querySelectorAll('.option-edit-anchor[data-option-key]').forEach((el) => {
    OptionLists.mountSectionButton(
      el,
      el.getAttribute('data-option-key'),
      el.getAttribute('data-option-title') || el.getAttribute('data-option-key'),
    );
  });
}

window.onOptionListChanged = function onOptionListChanged(key) {
  if (key === 'languages' || key === 'programs') {
    loadSkillOptionLists();
  }
};

function addDesiredPosition(value = '') {
  const box = document.getElementById('desired-positions');
  if (!box) return;
  const count = box.querySelectorAll('.desired-pos-row').length;
  if (count >= 8) {
    const btn = document.getElementById('btn-add-desired-pos');
    if (btn) btn.style.display = 'none';
    return;
  }
  const n = count + 1;
  const row = document.createElement('div');
  row.className = 'form-group desired-pos-row';
  row.innerHTML = `
    <label>Wezipe ${n}${n === 1 ? ' *' : ''}</label>
    <div style="display:flex;gap:8px;align-items:center">
      <input type="text" class="desired-pos-input" ${n === 1 ? 'required' : ''} value="${String(value || '').replace(/"/g, '&quot;')}" placeholder="Mysal: Satyjy" style="flex:1">
      ${n > 1 ? '<button type="button" class="btn btn-sm btn-danger" onclick="removeDesiredPosition(this)">✕</button>' : ''}
    </div>
  `;
  box.appendChild(row);
  const btn = document.getElementById('btn-add-desired-pos');
  if (btn) btn.style.display = box.querySelectorAll('.desired-pos-row').length >= 8 ? 'none' : '';
}

function removeDesiredPosition(btn) {
  const row = btn.closest('.desired-pos-row');
  if (row) row.remove();
  const box = document.getElementById('desired-positions');
  if (!box) return;
  box.querySelectorAll('.desired-pos-row').forEach((el, i) => {
    const label = el.querySelector('label');
    if (label) label.textContent = `Wezipe ${i + 1}${i === 0 ? ' *' : ''}`;
    const input = el.querySelector('.desired-pos-input');
    if (input) input.required = i === 0;
  });
  const addBtn = document.getElementById('btn-add-desired-pos');
  if (addBtn) addBtn.style.display = '';
}

function collectDesiredPositions() {
  return [...document.querySelectorAll('.desired-pos-input')]
    .map((el) => el.value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

window.addDesiredPosition = addDesiredPosition;
window.removeDesiredPosition = removeDesiredPosition;

function addEducationRow(data = {}) {
  const container = document.getElementById('education-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row education-row';
  const esc = (v) => String(v || '').replace(/"/g, '&quot;');
  row.innerHTML = `
    <div class="form-group">
      <label>Okan ýyllary</label>
      <input type="text" class="edu-years" value="${esc(data.years)}" placeholder="2019-2024">
    </div>
    <div class="form-group">
      <label>Okuw jaýynyň ady</label>
      <input type="text" class="edu-school" value="${esc(data.school)}">
    </div>
    <div class="form-group">
      <label>Hünäri</label>
      <input type="text" class="edu-specialty" value="${esc(data.specialty)}">
    </div>
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

/** Kurslar — okan ýerleri ýaly (ýyllar / ady / hünär) */
function addCourseRow(data = {}) {
  const container = document.getElementById('course-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row course-row';
  const esc = (v) => String(v || '').replace(/"/g, '&quot;');
  row.innerHTML = `
    <div class="form-group">
      <label>Kurs ýyllary</label>
      <input type="text" class="course-years" value="${esc(data.years)}" placeholder="2023-2024">
    </div>
    <div class="form-group">
      <label>Kursuň ady</label>
      <input type="text" class="course-name" value="${esc(data.school || data.name)}" placeholder="Mysal: 1C, Buhgalteriýa">
    </div>
    <div class="form-group">
      <label>Hünäri / ugry</label>
      <input type="text" class="course-specialty" value="${esc(data.specialty)}">
    </div>
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

function collectEducationRows() {
  return [...document.querySelectorAll('.education-row')].map((row) => ({
    years: row.querySelector('.edu-years')?.value?.trim() || '',
    school: row.querySelector('.edu-school')?.value?.trim() || '',
    specialty: row.querySelector('.edu-specialty')?.value?.trim() || '',
  })).filter((item) => item.school || item.specialty || item.years);
}

function collectCourseRows() {
  return [...document.querySelectorAll('.course-row')].map((row) => ({
    kind: 'kurs',
    years: row.querySelector('.course-years')?.value?.trim() || '',
    school: row.querySelector('.course-name')?.value?.trim() || '',
    specialty: row.querySelector('.course-specialty')?.value?.trim() || '',
  })).filter((item) => item.school || item.specialty || item.years);
}

function isCourseEduRow(row) {
  const kind = String(row?.kind || row?.type || '').toLowerCase();
  return kind === 'kurs' || kind === 'course';
}

function fillEducationAndCourses(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const edu = list.filter((r) => !isCourseEduRow(r));
  const courses = list.filter((r) => isCourseEduRow(r));

  const eduBox = document.getElementById('education-rows');
  if (eduBox) {
    eduBox.innerHTML = '';
    (edu.length ? edu : [{}]).forEach((row) => addEducationRow({
      years: row.years || row.year || '',
      school: row.school || row.institution || '',
      specialty: row.specialty || '',
    }));
  }

  const courseBox = document.getElementById('course-rows');
  if (courseBox) {
    courseBox.innerHTML = '';
    (courses.length ? courses : [{}]).forEach((row) => addCourseRow({
      years: row.years || row.year || '',
      school: row.school || row.name || row.institution || '',
      specialty: row.specialty || '',
    }));
  }
}

function addExperienceRow(data = {}) {
  const container = document.getElementById('experience-rows');
  const row = document.createElement('div');
  row.className = 'dynamic-row experience-row';
  const esc = (v) => String(v || '').replace(/"/g, '&quot;');
  const selectedDir = String(data.direction || data.ugry || '').trim();
  row.innerHTML = `
    <div class="form-group">
      <label>Sene</label>
      <input type="text" class="exp-years" value="${esc(data.years)}" placeholder="2019-2024">
    </div>
    <div class="form-group">
      <label>Kärhananyň ady</label>
      <input type="text" class="exp-company" value="${esc(data.company)}">
    </div>
    <div class="form-group">
      <label>Kärhananyň ugry</label>
      <select class="exp-direction">
        <option value="">—</option>
        <option>Sowda</option>
        <option>Gurluşyk</option>
        <option>Hyzmat</option>
        <option>Bilim</option>
      </select>
    </div>
    <div class="form-group">
      <label>Işlän wezipesi</label>
      <input type="text" class="exp-position" value="${esc(data.position)}">
    </div>
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
  fillExperienceDirectionSelect(row.querySelector('.exp-direction'), selectedDir);
}

async function fillExperienceDirectionSelect(select, selected) {
  if (!select) return;
  const val = String(selected || '').trim();
  if (window.OptionLists) {
    try {
      const list = await OptionLists.fetchList('company_directions');
      OptionLists.fillSelect(select, list.items || [], {
        keepValue: false,
        includeEmpty: true,
        emptyLabel: '—',
        emptyValue: '',
        listKey: 'company_directions',
      });
    } catch (_) { /* fallback options already in HTML */ }
  }
  if (val) {
    if (![...select.options].some((o) => o.value === val)) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    }
    select.value = val;
  }
}

function renderLangLevels() {
  const body = document.getElementById('lang-level-body');
  body.innerHTML = LANGS.map((lang) => `
    <tr data-lang="${lang}">
      <td><strong>${lang}</strong></td>
      <td style="text-align:center"><input type="radio" name="lang_${lang}" value="Başlangyç"></td>
      <td style="text-align:center"><input type="radio" name="lang_${lang}" value="Gowy"></td>
      <td style="text-align:center"><input type="radio" name="lang_${lang}" value="Has gowy"></td>
      <td style="text-align:center">
        <button type="button" class="btn btn-sm btn-ghost lang-clear-btn" data-lang-clear="${lang}" title="Saýlawy aýyr" aria-label="${lang} saýlawyny aýyr">✕</button>
      </td>
    </tr>
  `).join('');
  enableDeselectableLangRadios(body);
}

/** Radio saýlandan soň ýene basyp aýyrmak */
function enableDeselectableLangRadios(root = document) {
  root.querySelectorAll('input[type="radio"][name^="lang_"]').forEach((radio) => {
    if (radio.dataset.deselectReady) return;
    radio.dataset.deselectReady = '1';
    radio.addEventListener('mousedown', function onDown() {
      this.dataset.wasChecked = this.checked ? '1' : '0';
    });
    radio.addEventListener('click', function onClick() {
      if (this.dataset.wasChecked === '1') {
        this.checked = false;
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

function clearLanguageSelection(lang) {
  document.querySelectorAll(`input[name="lang_${lang}"]`).forEach((el) => {
    el.checked = false;
  });
  document.querySelector(`input[name="lang_${lang}"]`)?.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderPrograms() {
  const grid = document.getElementById('programs-grid');
  grid.innerHTML = PROGRAMS.map((p) => {
    const esc = String(p).replace(/"/g, '&quot;');
    return `
    <div class="check-item prog-item">
      <label class="prog-item-label">
        <input type="checkbox" name="comp_static" value="${esc}">
        <span>${esc}</span>
      </label>
      <button type="button" class="btn btn-sm btn-ghost prog-clear-btn" data-prog-clear="${esc}" title="Aýyr" aria-label="${esc} aýyr">✕</button>
    </div>`;
  }).join('');
}

function clearProgramSelection(value) {
  const escape = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
  const staticCb = document.querySelector(`input[name="comp_static"][value="${escape}"]`);
  if (staticCb) {
    staticCb.checked = false;
    staticCb.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.querySelectorAll('#extra-programs input[name="comp_extra"]').forEach((cb) => {
    if (cb.value === value) {
      const row = cb.closest('.check-item, label');
      if (row) row.remove();
      else {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

function collectLanguages() {
  const fromTable = [...document.querySelectorAll('#lang-level-body tr[data-lang]')].map((tr) => {
    const lang = tr.getAttribute('data-lang');
    const checked = tr.querySelector('input[type="radio"]:checked');
    if (!lang || !checked) return null;
    return { name: lang, level: checked.value };
  }).filter(Boolean);

  const fromExtra = [...document.querySelectorAll('#extra-langs .extra-lang-item')].map((row) => ({
    name: row.dataset.name,
    level: row.dataset.level,
  })).filter((l) => l.name);

  const seen = new Set();
  const out = [];
  [...fromTable, ...fromExtra].forEach((item) => {
    const key = skillNameKey(item.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function collectPrograms() {
  const staticOnes = [...document.querySelectorAll('input[name="comp_static"]:checked')].map((el) => el.value);
  const extras = [...document.querySelectorAll('#extra-programs input[name="comp_extra"]:checked')].map((el) => el.value);
  const seen = new Set();
  const out = [];
  [...staticOnes, ...extras].forEach((name) => {
    const key = skillNameKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
}

function rewriteLangRow(tr, newName) {
  tr.setAttribute('data-lang', newName);
  const strong = tr.querySelector('td strong');
  if (strong) strong.textContent = newName;
  tr.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.name = `lang_${newName}`;
  });
  const btn = tr.querySelector('[data-lang-clear]');
  if (btn) {
    btn.setAttribute('data-lang-clear', newName);
    btn.setAttribute('aria-label', `${newName} saýlawyny aýyr`);
    btn.title = 'Saýlawy aýyr';
  }
}

function findLangRow(name) {
  const want = skillNameKey(name);
  return [...document.querySelectorAll('#lang-level-body tr[data-lang]')].find(
    (tr) => skillNameKey(tr.getAttribute('data-lang')) === want,
  );
}

function lastUnusedLangRow() {
  const rows = [...document.querySelectorAll('#lang-level-body tr[data-lang]')];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!rows[i].querySelector('input[type="radio"]:checked')) return rows[i];
  }
  return null;
}

function appendLangTableRow(name, level) {
  const body = document.getElementById('lang-level-body');
  if (!body) return false;
  const esc = String(name).replace(/"/g, '&quot;');
  const tr = document.createElement('tr');
  tr.setAttribute('data-lang', name);
  tr.innerHTML = `
      <td><strong></strong></td>
      <td style="text-align:center"><input type="radio" name="lang_${esc}" value="Başlangyç"></td>
      <td style="text-align:center"><input type="radio" name="lang_${esc}" value="Gowy"></td>
      <td style="text-align:center"><input type="radio" name="lang_${esc}" value="Has gowy"></td>
      <td style="text-align:center">
        <button type="button" class="btn btn-sm btn-ghost lang-clear-btn" data-lang-clear="${esc}" title="Saýlawy aýyr" aria-label="${esc} saýlawyny aýyr">✕</button>
      </td>
  `;
  tr.querySelector('td strong').textContent = name;
  tr.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.name = `lang_${name}`;
    radio.checked = radio.value === (level || 'Gowy');
  });
  const btn = tr.querySelector('[data-lang-clear]');
  if (btn) btn.setAttribute('data-lang-clear', name);
  body.appendChild(tr);
  enableDeselectableLangRadios(tr);
  return true;
}

function placeLanguageInForm(name, level, opts = {}) {
  const cleanName = String(name || '').trim();
  const lvl = level || 'Gowy';
  if (!cleanName) return false;

  const existing = findLangRow(cleanName);
  if (existing) {
    existing.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.checked = radio.value === lvl;
    });
    return true;
  }

  const lastUnused = lastUnusedLangRow();
  if (lastUnused) {
    rewriteLangRow(lastUnused, cleanName);
    lastUnused.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.checked = radio.value === lvl;
    });
    return true;
  }

  return appendLangTableRow(cleanName, lvl);
}

function appendExtraLanguage(name, level) {
  const box = document.getElementById('extra-langs');
  if (!box) return false;
  const exists = [...box.querySelectorAll('.extra-lang-item')].some(
    (el) => skillNameKey(el.dataset.name) === skillNameKey(name),
  );
  if (exists) return true;

  const row = document.createElement('div');
  row.className = 'check-item extra-lang-item';
  row.dataset.name = name;
  row.dataset.level = level;

  const text = document.createElement('span');
  text.textContent = `${name} — ${level}`;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-sm btn-danger';
  removeBtn.style.marginLeft = 'auto';
  removeBtn.style.padding = '2px 8px';
  removeBtn.textContent = '✕';
  removeBtn.onclick = () => row.remove();

  row.appendChild(text);
  row.appendChild(removeBtn);
  box.appendChild(row);
  return true;
}

function rewriteProgramBox(cb, newName) {
  cb.value = newName;
  const item = cb.closest('.prog-item');
  const span = item?.querySelector('.prog-item-label span');
  if (span) span.textContent = newName;
  const btn = item?.querySelector('.prog-clear-btn');
  if (btn) {
    btn.setAttribute('data-prog-clear', newName);
    btn.setAttribute('aria-label', `${newName} aýyr`);
  }
}

function lastUnusedProgramBox() {
  const boxes = [...document.querySelectorAll('#programs-grid input[name="comp_static"]')];
  for (let i = boxes.length - 1; i >= 0; i -= 1) {
    if (!boxes[i].checked) return boxes[i];
  }
  return null;
}

function appendProgramGridItem(name) {
  const grid = document.getElementById('programs-grid');
  if (!grid) return false;
  const esc = String(name).replace(/"/g, '&quot;');
  const wrap = document.createElement('div');
  wrap.className = 'check-item prog-item';
  wrap.innerHTML = `
      <label class="prog-item-label">
        <input type="checkbox" name="comp_static" value="${esc}" checked>
        <span></span>
      </label>
      <button type="button" class="btn btn-sm btn-ghost prog-clear-btn" data-prog-clear="${esc}" title="Aýyr" aria-label="${esc} aýyr">✕</button>
  `;
  wrap.querySelector('span').textContent = name;
  const cb = wrap.querySelector('input[type="checkbox"]');
  cb.value = name;
  cb.checked = true;
  wrap.querySelector('.prog-clear-btn')?.setAttribute('data-prog-clear', name);
  grid.appendChild(wrap);
  return true;
}

function placeProgramInForm(name, opts = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return false;
  const want = skillNameKey(cleanName);
  const all = [
    ...document.querySelectorAll('#programs-grid input[name="comp_static"]'),
    ...document.querySelectorAll('#extra-programs input[name="comp_extra"]'),
  ];
  const existing = all.find((cb) => skillNameKey(cb.value) === want);
  if (existing) {
    existing.checked = true;
    return true;
  }

  const lastUnused = lastUnusedProgramBox();
  if (lastUnused) {
    rewriteProgramBox(lastUnused, cleanName);
    lastUnused.checked = true;
    lastUnused.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return appendProgramGridItem(cleanName);
}

function appendExtraProgram(name) {
  const box = document.getElementById('extra-programs');
  if (!box) return false;
  const exists = [...box.querySelectorAll('input[name="comp_extra"]')].some(
    (el) => skillNameKey(el.value) === skillNameKey(name),
  );
  if (exists) return true;

  const row = document.createElement('label');
  row.className = 'check-item';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.name = 'comp_extra';
  cb.value = name;
  cb.checked = true;

  const text = document.createTextNode(` ${name} `);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-sm btn-danger';
  removeBtn.style.marginLeft = 'auto';
  removeBtn.style.padding = '2px 8px';
  removeBtn.textContent = '✕';
  removeBtn.onclick = () => row.remove();

  row.appendChild(cb);
  row.appendChild(text);
  row.appendChild(removeBtn);
  box.appendChild(row);
  return true;
}

function addExtraLanguage() {
  const nameInput = document.getElementById('extra-lang-name');
  const levelInput = document.getElementById('extra-lang-level');
  const name = (nameInput?.value || '').trim();
  const level = levelInput?.value || 'Gowy';
  if (!name) return;
  placeLanguageInForm(name, level);
  nameInput.value = '';
}

function addExtraProgram() {
  const nameInput = document.getElementById('extra-prog-name');
  const name = (nameInput?.value || '').trim();
  if (!name) return;
  placeProgramInForm(name);
  nameInput.value = '';
}

function getEducationLevel() {
  return document.querySelector('input[name="educationLevel"]:checked')?.value || '';
}

/** Orta bilim — okuw jaýy / hünär / ýyllar gerek däl */
function syncEducationDetailsVisibility() {
  const block = document.getElementById('education-details-block');
  if (!block) return;
  const isOrta = getEducationLevel() === 'Orta';
  block.classList.toggle('hidden', isOrta);
  block.setAttribute('aria-hidden', isOrta ? 'true' : 'false');
}

window.addExtraLanguage = addExtraLanguage;
window.addExtraProgram = addExtraProgram;
window.addEducationRow = addEducationRow;
window.addCourseRow = addCourseRow;
window.addExperienceRow = addExperienceRow;
window.clearLanguageSelection = clearLanguageSelection;
window.clearProgramSelection = clearProgramSelection;
window.addPhoneRow = addPhoneRow;
window.removePhoneRow = removePhoneRow;

const MAX_PHONES = 2;

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

/** 12121995 → 12.12.1995 (ýa-da diňe ýyl: 1995) */
function formatBirthDateInput(raw) {
  const s = String(raw || '');
  const d = digitsOnly(s).slice(0, 8);
  if (!d) return '';
  // Köne / diňe ýyl: 1995 (19xx/20xx we heniz 5-nji san ýok)
  if (d.length === 4 && !s.includes('.') && /^(19|20)\d{2}$/.test(d)) {
    return d;
  }
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

function parseBirthDateValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, year: null, display: '' };
  const maxYear = new Date().getFullYear();

  // Diňe ýyl
  if (/^\d{4}$/.test(s)) {
    const year = parseInt(s, 10);
    return { ok: year >= 1940 && year <= maxYear, year, display: s, day: null, month: null };
  }

  const d = digitsOnly(s);
  if (d.length === 4) {
    const year = parseInt(d, 10);
    return { ok: year >= 1940 && year <= maxYear, year, display: String(year), day: null, month: null };
  }
  if (d.length !== 8) {
    return { ok: false, year: null, display: formatBirthDateInput(s) };
  }

  const day = parseInt(d.slice(0, 2), 10);
  const month = parseInt(d.slice(2, 4), 10);
  const year = parseInt(d.slice(4, 8), 10);
  const display = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return { ok: false, year: null, display };
  }
  if (year < 1940 || year > maxYear) return { ok: false, year, display, day, month };
  if (month < 1 || month > 12) return { ok: false, year, display, day, month };
  if (day < 1 || day > 31) return { ok: false, year, display, day, month };

  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return { ok: false, year, display, day, month };
  }

  return { ok: true, year, display, day, month };
}

function bindBirthDateInput(input) {
  if (!input || input.dataset.birthBound === '1') return;
  input.dataset.birthBound = '1';
  input.addEventListener('input', () => {
    const prev = input.value;
    const caretAtEnd = input.selectionStart === prev.length;
    const formatted = formatBirthDateInput(prev);
    input.value = formatted;
    if (caretAtEnd) {
      try { input.setSelectionRange(formatted.length, formatted.length); } catch { /* ignore */ }
    }
    // Native validity düwmäni sessiz saklap bilýär — diňe submit-de barlaýarys
    input.setCustomValidity('');
  });
  input.addEventListener('blur', () => {
    const parsed = parseBirthDateValue(input.value);
    if (parsed.display) input.value = parsed.display;
    input.setCustomValidity('');
  });
}

function initBirthDateInputs() {
  document.querySelectorAll('input[name="birthYear"], .birth-date-input').forEach(bindBirthDateInput);
}

function splitStoredPhones(raw) {
  const s = String(raw || '').trim();
  if (!s) return [''];
  let parts = s.split(/[,;/|]+|\s+we\s+/i).map((p) => digitsOnly(p)).filter(Boolean);
  if (parts.length <= 1) {
    const all = digitsOnly(s);
    if (all.length > 9 && all.length % 9 === 0) {
      parts = [];
      for (let i = 0; i < all.length; i += 9) parts.push(all.slice(i, i + 9));
    } else if (all) {
      parts = [all];
    }
  }
  return parts.length ? parts.slice(0, MAX_PHONES) : [''];
}

function syncPhoneCombined() {
  const hidden = document.getElementById('phone-combined');
  if (!hidden) return;
  const phones = [...document.querySelectorAll('.phone-input')]
    .map((el) => digitsOnly(el.value))
    .filter(Boolean);
  hidden.value = phones.join(', ');
  updateAddPhoneBtn();
}

function updateAddPhoneBtn() {
  const btn = document.getElementById('btn-add-phone');
  const rows = document.querySelectorAll('#phone-rows .phone-row').length;
  if (btn) btn.style.display = rows >= MAX_PHONES ? 'none' : '';
}

function bindPhoneInput(input) {
  input.addEventListener('input', () => {
    const d = digitsOnly(input.value).slice(0, 9);
    input.value = d;
    input.setCustomValidity(d.length === 9 || d.length === 0 ? '' : 'Nomer 9 san bolmaly');
    syncPhoneCombined();
  });
}

function addPhoneRow(value = '', { required = false } = {}) {
  const box = document.getElementById('phone-rows');
  if (!box) return;
  const count = box.querySelectorAll('.phone-row').length;
  if (count >= MAX_PHONES) return;

  const n = count + 1;
  const row = document.createElement('div');
  row.className = 'form-group phone-row';
  const digits = digitsOnly(value).slice(0, 9);
  row.innerHTML = `
    <label>Telefon ${n}${n === 1 ? ' *' : ''}</label>
    <div class="phone-row-inner">
      <input type="tel" class="phone-input" inputmode="numeric" maxlength="9"
        placeholder="9 san, mysal: 651234567"
        value="${digits.replace(/"/g, '&quot;')}"
        ${n === 1 || required ? 'required' : ''}
        autocomplete="${n === 1 ? 'tel' : 'off'}">
      ${n > 1 ? '<button type="button" class="btn btn-sm btn-danger" onclick="removePhoneRow(this)" title="Aýyr">✕</button>' : ''}
    </div>
  `;
  box.appendChild(row);
  const input = row.querySelector('.phone-input');
  bindPhoneInput(input);
  if (digits) {
    input.setCustomValidity(digits.length === 9 ? '' : 'Nomer 9 san bolmaly');
  }
  syncPhoneCombined();
}

function removePhoneRow(btn) {
  const row = btn?.closest('.phone-row');
  if (row) row.remove();
  const box = document.getElementById('phone-rows');
  if (!box) return;
  box.querySelectorAll('.phone-row').forEach((el, i) => {
    const label = el.querySelector('label');
    if (label) label.textContent = `Telefon ${i + 1}${i === 0 ? ' *' : ''}`;
    const input = el.querySelector('.phone-input');
    if (input) input.required = i === 0;
  });
  if (!box.querySelector('.phone-row')) addPhoneRow('', { required: true });
  syncPhoneCombined();
}

function setPhoneFields(raw) {
  const box = document.getElementById('phone-rows');
  if (!box) return;
  const parts = splitStoredPhones(raw);
  box.innerHTML = '';
  parts.forEach((p, i) => addPhoneRow(p, { required: i === 0 }));
  if (!parts.length) addPhoneRow('', { required: true });
  syncPhoneCombined();
}

function validatePhones() {
  const inputs = [...document.querySelectorAll('.phone-input')];
  if (!inputs.length) return 'Telefon nomeri hökmany';
  const filled = inputs.map((el) => digitsOnly(el.value)).filter(Boolean);
  if (!filled.length) return 'Telefon nomeri hökmany (9 san)';
  for (let i = 0; i < inputs.length; i += 1) {
    const d = digitsOnly(inputs[i].value);
    if (!d && i === 0) return 'Birinji telefon nomeri hökmany (9 san)';
    if (d && d.length !== 9) {
      inputs[i].focus();
      return `Telefon ${i + 1}: diňe 9 san bolmaly (häzir ${d.length})`;
    }
  }
  syncPhoneCombined();
  return null;
}

function validatePersonalBeforeEducation() {
  const form = document.getElementById('anketa-form');
  if (!form) return 'Forma tapylmady';

  const requiredNames = [
    ['familyName', 'Familiýasy'],
    ['firstName', 'Ady'],
    ['birthYear', 'Doglan senesi'],
    ['birthPlace', 'Doglan ýeri'],
    ['nationality', 'Milleti'],
    ['registrationAddress', 'Ýazgyda duran ýeri'],
    ['currentAddress', 'Häzirki ýaşaýan ýeri'],
    ['maritalStatus', 'Maşgala ýagdaýy'],
    ['militaryService', 'Harby bilet'],
    ['drivingLicense', 'Sürüjilik şahadatnama'],
    ['hasCar', 'Şahsy awtoulagy'],
    ['gender', 'Jynsy'],
    ['passportNumber', 'Pasport №'],
    ['passportIssued', 'Pasport berilen ýeri we senesi'],
  ];

  for (const [name, label] of requiredNames) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) continue;
    const val = String(el.value || '').trim();
    if (!val) {
      el.focus();
      return `${label} hökmany`;
    }
  }

  const birthEl = form.querySelector('[name="birthYear"]');
  const parsedBirth = parseBirthDateValue(birthEl?.value);
  if (!parsedBirth.ok || !parsedBirth.year) {
    birthEl?.focus();
    return 'Doglan senesi nädogry. Mysal: 12121995 → 12.12.1995';
  }
  if (birthEl) birthEl.value = parsedBirth.display;

  const phoneErr = validatePhones();
  if (phoneErr) return phoneErr;

  if (!getEducationLevel()) {
    form.querySelector('input[name="educationLevel"]')?.focus();
    return 'Bilim derejesini saýlaň (orta / ýörite orta / ýokary)';
  }

  return null;
}

document.addEventListener('click', (e) => {
  const langBtn = e.target.closest('[data-lang-clear]');
  if (langBtn) {
    e.preventDefault();
    clearLanguageSelection(langBtn.getAttribute('data-lang-clear'));
    return;
  }
  const progBtn = e.target.closest('[data-prog-clear]');
  if (progBtn) {
    e.preventDefault();
    e.stopPropagation();
    clearProgramSelection(progBtn.getAttribute('data-prog-clear'));
  }
});

renderLangLevels();
renderPrograms();
addEducationRow();
addCourseRow();
addExperienceRow();
setPhoneFields('');
initBirthDateInputs();
syncEducationDetailsVisibility();
document.querySelectorAll('input[name="educationLevel"]').forEach((el) => {
  el.addEventListener('change', syncEducationDetailsVisibility);
});

(async function initAnketaOptionLists() {
  if (!window.OptionLists) return;
  const run = async () => {
    try {
      await OptionLists.hydrateAllSelects();
      mountAnketaOptionEditors();
      await loadSkillOptionLists();
    } catch (_) { /* ignore */ }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { run(); });
  } else {
    run();
  }
})();

/* ——— Sene / wagt (awtomatik, bir ýerde) ——— */
function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowLocalParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    display: `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function syncAnketaDateTime() {
  if (window.ANKETA_EDIT_ID) {
    const hidden = document.getElementById('formDate');
    const display = document.getElementById('anketa-datetime-display');
    const dateVal = hidden?.value || '';
    const parts = nowLocalParts();
    return {
      date: dateVal || parts.date,
      time: parts.time,
      display: display?.textContent || parts.display,
    };
  }
  const parts = nowLocalParts();
  const hidden = document.getElementById('formDate');
  const display = document.getElementById('anketa-datetime-display');
  if (hidden) hidden.value = parts.date;
  if (display) display.textContent = parts.display;
  return parts;
}

syncAnketaDateTime();
setInterval(syncAnketaDateTime, 30000);

/* ——— Surat 3×4 + draft (F5) ——— */
const DRAFT_KEY = window.ANKETA_FROM_PANEL
  ? 'kerwen_anketa_draft_panel_v1'
  : 'kerwen_anketa_draft_public_v1';

const photoRoot = document.querySelector('.photo-capture');
let photoCtl = { getItems: () => [], clear: () => {}, stopCamera: async () => {}, setFromDataUrls: async () => {}, toDataUrls: async () => [] };
try {
  if (window.AnketaPhoto?.createPhotoCapture) {
    photoCtl = window.AnketaPhoto.createPhotoCapture({
      root: photoRoot,
      max: 1,
      onChange: () => scheduleDraftSave(),
    }) || photoCtl;
  }
} catch (photoErr) {
  console.error('photo widget', photoErr);
}

function resolvePhotoCtl() {
  return photoRoot?.__kerwenPhotoCtl || window.__kerwenPhotoCtl || photoCtl;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPhotosReady(ctl, maxMs = 2500) {
  const start = Date.now();
  while (ctl.isBusy?.() && Date.now() - start < maxMs) {
    await sleep(100);
  }
  return ctl.getItems?.() || [];
}

let draftTimer = null;
let restoringDraft = false;

function setDraftStatus(text) {
  const el = document.getElementById('draft-status');
  if (el) el.textContent = text;
}

function collectFormDraft() {
  const form = document.getElementById('anketa-form');
  if (!form) return null;
  syncPhoneCombined();
  const fields = {};
  [...form.querySelectorAll('input[name], select[name], textarea[name]')].forEach((el) => {
    if (!el.name || el.type === 'file') return;
    if (el.type === 'radio') {
      if (el.checked) fields[el.name] = el.value;
      return;
    }
    if (el.type === 'checkbox') return;
    fields[el.name] = el.value;
  });

  LANGS.forEach((lang) => {
    const checked = document.querySelector(`input[name="lang_${lang}"]:checked`);
    if (checked) fields[`lang_${lang}`] = checked.value;
  });

  fields.__languages = collectLanguages();
  fields.__programs = collectPrograms();
  fields.__extraLangs = [...document.querySelectorAll('#extra-langs .extra-lang-item')].map((row) => ({
    name: row.dataset.name,
    level: row.dataset.level,
  }));
  fields.__positions = collectDesiredPositions();
  fields.__education = collectEducationRows();
  fields.__courses = collectCourseRows();
  fields.__experience = [...document.querySelectorAll('.experience-row')].map((row) => ({
    years: row.querySelector('.exp-years')?.value || '',
    company: row.querySelector('.exp-company')?.value || '',
    position: row.querySelector('.exp-position')?.value || '',
  }));
  fields.workFrom = document.getElementById('workFrom')?.value || '';
  fields.workTo = document.getElementById('workTo')?.value || '';

  return fields;
}

async function saveDraftNow() {
  if (restoringDraft || window.ANKETA_EDIT_ID) return;
  try {
    const fields = collectFormDraft();
    const photos = await photoCtl.toDataUrls();
    const payload = { savedAt: Date.now(), fields, photos };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    const t = new Date();
    setDraftStatus(`Draft saklandy · ${t.toLocaleTimeString('ru-RU')} (F5 basylanda hem galyar)`);
  } catch (e) {
    setDraftStatus('Draft saklanmady (surat uly bolup bilýär)');
  }
}

function scheduleDraftSave() {
  if (restoringDraft || window.ANKETA_EDIT_ID) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { saveDraftNow(); }, 600);
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  setDraftStatus('Draft arassalandy');
}

async function restoreDraft() {
  let raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return; }
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  if (!data?.fields) return;

  restoringDraft = true;
  const form = document.getElementById('anketa-form');
  const f = data.fields;

  Object.entries(f).forEach(([name, value]) => {
    if (name.startsWith('__')) return;
    if (name === 'workFrom' || name === 'workTo') return;
    const els = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    if (!els.length) return;
    els.forEach((el) => {
      if (el.type === 'radio') el.checked = el.value === value;
      else if (el.type !== 'file' && el.type !== 'checkbox') el.value = value ?? '';
    });
  });

  if (f.workFrom && document.getElementById('workFrom')) {
    document.getElementById('workFrom').value = f.workFrom;
  }
  if (f.workTo && document.getElementById('workTo')) {
    document.getElementById('workTo').value = f.workTo;
  }

  LANGS.forEach((lang) => {
    const val = f[`lang_${lang}`];
    if (!val) return;
    const radio = document.querySelector(`input[name="lang_${lang}"][value="${CSS.escape(val)}"]`);
    if (radio) radio.checked = true;
  });

  const draftLangs = Array.isArray(f.__languages) && f.__languages.length
    ? f.__languages
    : (Array.isArray(f.__extraLangs) ? f.__extraLangs : []);
  draftLangs.forEach((item) => {
    if (item?.name) placeLanguageInForm(item.name, item.level || 'Gowy');
  });

  if (Array.isArray(f.__programs)) {
    f.__programs.forEach((p) => placeProgramInForm(p));
  }

  if (Array.isArray(f.__positions) && f.__positions.length) {
    const box = document.getElementById('desired-positions');
    if (box) {
      box.innerHTML = '';
      f.__positions.forEach((pos, i) => {
        if (i === 0) {
          const row = document.createElement('div');
          row.className = 'form-group desired-pos-row';
          row.innerHTML = `
            <label>Wezipe 1 *</label>
            <input type="text" class="desired-pos-input" required value="${String(pos).replace(/"/g, '&quot;')}" placeholder="Mysal: Satyjy">
          `;
          box.appendChild(row);
        } else {
          addDesiredPosition(pos);
        }
      });
    }
  }

  const draftEdu = Array.isArray(f.__education) ? f.__education : [];
  const draftCourses = Array.isArray(f.__courses) ? f.__courses : [];
  if (draftEdu.length || draftCourses.length) {
    fillEducationAndCourses([
      ...draftEdu.map((r) => ({ ...r, kind: undefined })),
      ...draftCourses.map((r) => ({ ...r, kind: 'kurs' })),
    ]);
  }
  syncEducationDetailsVisibility();

  if (Array.isArray(f.__experience) && f.__experience.length) {
    const exp = document.getElementById('experience-rows');
    if (exp) {
      exp.innerHTML = '';
      f.__experience.forEach((row) => addExperienceRow(row));
    }
  }

  if (Array.isArray(data.photos) && data.photos.length) {
    // Ulanyjy eýýäm surat alan bolsa draft pozmasyn
    if (!photoCtl.getItems?.()?.length) {
      await photoCtl.setFromDataUrls(data.photos);
    }
  }

  restoringDraft = false;
  const when = data.savedAt ? new Date(data.savedAt).toLocaleString('ru-RU') : '';
  setDraftStatus(`Öňki draft dikeldildi${when ? ` (${when})` : ''}. Üýtgetmeler ýene saklanýar.`);
}

const formEl = document.getElementById('anketa-form');
formEl?.addEventListener('input', scheduleDraftSave);
formEl?.addEventListener('change', scheduleDraftSave);

(function syncEditIdFromUrl() {
  const qs = new URLSearchParams(location.search);
  const fromUrl = String(qs.get('id') || qs.get('anketaId') || '').trim();
  if (fromUrl) {
    window.ANKETA_EDIT_ID = fromUrl;
    if (window.ANKETA_FROM_PANEL == null) window.ANKETA_FROM_PANEL = true;
  }
})();
const EDIT_ID = String(window.ANKETA_EDIT_ID || new URLSearchParams(location.search).get('id') || '').trim();
let editStatus = 'Islanok';
let editFormDate = '';

function setEditPageChrome(a) {
  const num = a?.anketaNumber || EDIT_ID;
  document.title = `Anketany üýtget № ${num} — ${(typeof agencyBrandFull === 'function' && agencyBrandFull()) || 'Kerwen Agenstwa'}`;
  const h1 = document.querySelector('.logo-text h1');
  if (h1) h1.textContent = 'Anketany üýtget';
  const title = document.querySelector('.anketa-form-top .section-title');
  if (title) title.textContent = `Anketany üýtget · № ${num}`;
  const navBack = document.getElementById('btn-nav-back') || document.querySelector('nav.nav a.btn, nav.nav button.btn');
  if (navBack) {
    navBack.textContent = '← Yza';
  }
  const submitBtn = formEl?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Üýtgetmeleri ýatda sakla';
  setDraftStatus('Bar bolan anketa dolduryldy. Üýtgetip saklaň.');
}

function parseJsonArr(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function parseJsonObj(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function normalizeGender(g) {
  const s = String(g || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'ayal' || low === 'aýal' || low === 'аял' || low === 'gyz') return 'Ayal';
  if (low === 'erkek') return 'Erkek';
  return s;
}

function normalizeMaritalStatus(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  // Köne «Salah» → «Sallah»
  if (/^salah$/i.test(s)) return 'Sallah';
  return s;
}

function ensureSelectValue(select, value) {
  if (!select || value == null || value === '') return;
  const str = String(value);
  const found = [...select.options].some((o) => o.value === str);
  if (!found) {
    const opt = document.createElement('option');
    opt.value = str;
    opt.textContent = str;
    select.appendChild(opt);
  }
  select.value = str;
}

function pickField(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function setNamedValue(form, name, value) {
  if (value == null || value === '') return;
  const str = String(value);
  if (name === 'phone') {
    setPhoneFields(str);
    return;
  }
  const scope = form || document;
  const fromForm = typeof scope.querySelectorAll === 'function'
    ? [...scope.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
    : [];
  const nodes = fromForm.length ? fromForm : [...document.getElementsByName(name)];
  if (!nodes.length) {
    console.warn('Anketa meýdan tapylmady:', name);
    return;
  }
  nodes.forEach((el) => {
    if (el.type === 'radio') {
      el.checked = el.value === str;
      return;
    }
    if (el.type === 'checkbox') {
      el.checked = (el.value === str || str === 'true' || str === '1');
      return;
    }
    if (el.tagName === 'SELECT') {
      ensureSelectValue(el, str);
      return;
    }
    if (el.type !== 'file') {
      el.value = str;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* ignore */ }
    }
  });
  if (name === 'hasCar' && window.BarYokField) {
    nodes.forEach((el) => {
      const wrap = el.closest('[data-bar-yok-field]');
      if (wrap) BarYokField.setValue(wrap, str);
    });
  }
}

function applyNamedFields(fields) {
  const form = document.getElementById('anketa-form');
  if (!form) {
    console.error('anketa-form tapylmady');
    return;
  }
  Object.entries(fields).forEach(([name, value]) => setNamedValue(form, name, value));
}

function fillPositions(desiredPosition, extraPositions) {
  let parts = [];
  if (Array.isArray(extraPositions) && extraPositions.length) {
    parts = extraPositions.map((p) => String(p || '').trim()).filter(Boolean);
  }
  if (!parts.length) {
    const raw = String(desiredPosition || '').trim();
    if (!raw) return;
    parts = raw.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      parts = raw.split(/\s*,\s*|\s+we\s+/i).map((p) => p.trim()).filter(Boolean);
    }
  }
  parts = parts.slice(0, 8);
  if (!parts.length) return;
  const box = document.getElementById('desired-positions');
  if (!box) return;
  box.innerHTML = '';
  parts.forEach((pos, i) => {
    if (i === 0) {
      const row = document.createElement('div');
      row.className = 'form-group desired-pos-row';
      row.innerHTML = `
        <label>Wezipe 1 *</label>
        <input type="text" class="desired-pos-input" required value="${String(pos).replace(/"/g, '&quot;')}" placeholder="Mysal: Satyjy">
      `;
      box.appendChild(row);
    } else {
      addDesiredPosition(pos);
    }
  });
  const hidden = document.getElementById('desiredPosition');
  if (hidden) hidden.value = parts.join(' / ');
}

function fillWorkSchedule(schedule) {
  const s = String(schedule || '').trim();
  if (!s) return;
  const m = s.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  if (!m) return;
  const pad = (t) => (t.length === 4 ? `0${t}` : t);
  const from = document.getElementById('workFrom');
  const to = document.getElementById('workTo');
  if (from) from.value = pad(m[1]);
  if (to) to.value = pad(m[2]);
}

let editKeepPhotoUrls = [];

async function loadAnketaForEdit(id) {
  const alertBox = document.getElementById('alert-box');
  const form = document.getElementById('anketa-form');
  restoringDraft = true;
  editKeepPhotoUrls = [];
  window.ANKETA_EDIT_ID = String(id);
  try {
    try { clearDraft(); } catch { /* ignore */ }
    if (form) {
      form.setAttribute('autocomplete', 'off');
      const pass = form.querySelector('[name="passportNumber"]');
      if (pass) pass.required = false;
      const photoLabel = form.querySelector('.anketa-photo-side > label');
      if (photoLabel) photoLabel.textContent = 'Surat 3×4';
    }
    if (alertBox) showAlert(alertBox, 'Anketa maglumatlary ýüklenýär...', 'success');

    const res = await api.get(`/anketas/${encodeURIComponent(id)}`);
    // API { success, data } ýa-da käwagt göni obýekt
    const a = res?.data && typeof res.data === 'object' && !Array.isArray(res.data)
      ? res.data
      : res;
    if (!a || typeof a !== 'object' || (!a.id && !a.familyName && !a.firstName && !a.family_name)) {
      throw new Error('Anketa maglumaty gelmedi (boş jogap)');
    }

    const extra = parseJsonObj(pickField(a, 'extraData', 'extra_data') || {});
    editStatus = pickField(a, 'status') || 'Islanok';
    editFormDate = pickField(a, 'formDate', 'form_date') || '';
    setEditPageChrome(a);

    const fields = {
      familyName: pickField(a, 'familyName', 'family_name'),
      firstName: pickField(a, 'firstName', 'first_name'),
      patronymic: pickField(a, 'patronymic'),
      birthYear: pickField(a, 'birthYear', 'birth_year'),
      birthPlace: pickField(a, 'birthPlace', 'birth_place'),
      nationality: pickField(a, 'nationality'),
      registrationAddress: pickField(a, 'registrationAddress', 'registration_address'),
      currentAddress: pickField(a, 'currentAddress', 'current_address'),
      maritalStatus: normalizeMaritalStatus(pickField(a, 'maritalStatus', 'marital_status')),
      militaryService: pickField(a, 'militaryService', 'military_service'),
      drivingLicense: pickField(a, 'drivingLicense', 'driving_license'),
      hasCar: pickField(a, 'hasCar', 'has_car'),
      phone: pickField(a, 'phone'),
      gender: normalizeGender(pickField(a, 'gender')),
      passportNumber: pickField(a, 'passportNumber', 'passport_number'),
      passportIssued: pickField(a, 'passportIssued', 'passport_issued'),
      educationLevel: pickField(a, 'educationLevel', 'education_level'),
      partTimeWork: pickField(a, 'partTimeWork', 'part_time_work'),
      currentSalary: pickField(a, 'currentSalary', 'current_salary'),
      willingToRelocate: pickField(a, 'willingToRelocate', 'willing_to_relocate'),
      hasChildren: extra.hasChildren || 'Ýok',
    };

    // Tekst meýdanlar — suratlardan öň (surat kynçylygy forma boş etmeýär)
    applyNamedFields(fields);
    fillPositions(pickField(a, 'desiredPosition', 'desired_position'), extra.desiredPositions);
    fillWorkSchedule(pickField(a, 'workSchedule', 'work_schedule'));
    const birthEl = form.querySelector('[name="birthYear"]');
    if (birthEl) {
      const savedDate = extra.birthDate || '';
      if (savedDate) birthEl.value = formatBirthDateInput(savedDate) || savedDate;
      else if (fields.birthYear) birthEl.value = String(fields.birthYear);
      bindBirthDateInput(birthEl);
    }
    [50, 200, 500].forEach((ms) => setTimeout(() => {
      applyNamedFields(fields);
      if (birthEl) {
        const savedDate = extra.birthDate || '';
        if (savedDate) birthEl.value = formatBirthDateInput(savedDate) || savedDate;
        else if (fields.birthYear) birthEl.value = String(fields.birthYear);
      }
    }, ms));

    if (editFormDate) {
      const hidden = document.getElementById('formDate');
      if (hidden) hidden.value = editFormDate;
      const display = document.getElementById('anketa-datetime-display');
      if (display) {
        const extraDt = extra.formDateTime || extra.formTime || '';
        display.textContent = extraDt
          ? String(extraDt)
          : String(editFormDate).split('-').reverse().join('.');
      }
    }

    parseJsonArr(pickField(a, 'languages')).forEach((item) => {
      const name = typeof item === 'string' ? item : item?.name;
      const level = typeof item === 'string' ? 'Gowy' : (item?.level || 'Gowy');
      if (name) placeLanguageInForm(name, level);
    });

    parseJsonArr(pickField(a, 'computerSkills', 'computer_skills')).forEach((p) => {
      const skill = typeof p === 'string' ? p : (p?.name || '');
      if (skill) placeProgramInForm(skill);
    });

    const rows = parseJsonArr(pickField(a, 'educationDetails', 'education_details'));
    fillEducationAndCourses(rows);
    syncEducationDetailsVisibility();

    const exp = document.getElementById('experience-rows');
    if (exp) {
      exp.innerHTML = '';
      const rows = parseJsonArr(pickField(a, 'workExperience', 'work_experience'));
      (rows.length ? rows : [{}]).forEach((row) => addExperienceRow({
        years: row.years || row.period || '',
        company: row.company || '',
        position: row.position || '',
      }));
    }

    const first = form?.querySelector('[name="firstName"]')?.value
      || pickField(a, 'firstName', 'first_name')
      || '';
    const fam = form?.querySelector('[name="familyName"]')?.value
      || pickField(a, 'familyName', 'family_name')
      || '';
    if (!first && !fam) {
      throw new Error(
        `Maglumatlar forma ýazylmady (id=${id}). API: ${a.firstName || a.familyName || 'boş'}. Ctrl+F5 bilen täzeläň.`,
      );
    }

    if (alertBox) {
      showAlert(
        alertBox,
        `Anketa № ${pickField(a, 'anketaNumber', 'anketa_number') || id} — öňki maglumatlar dolduryldy (${fam} ${first}).`,
        'success',
      );
    }

    const photos = Array.isArray(extra.photos) && extra.photos.length
      ? extra.photos
      : (pickField(a, 'photoUrl', 'photo_url') ? [pickField(a, 'photoUrl', 'photo_url')] : []);
    editKeepPhotoUrls = photos.slice();
    if (photos.length) {
      try { await photoCtl.setFromDataUrls(photos); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('loadAnketaForEdit', err);
    if (alertBox) showAlert(alertBox, err.message || 'Anketa ýüklenmedi', 'error');
    else alert(err.message || 'Anketa ýüklenmedi');
  } finally {
    restoringDraft = false;
  }
}

if (EDIT_ID) {
  try {
    const h1 = document.querySelector('.logo-text h1');
    if (h1) h1.textContent = 'Anketany üýtget';
    const title = document.querySelector('.anketa-form-top .section-title');
    if (title) title.textContent = `Anketany üýtget · #${EDIT_ID}`;
  } catch { /* ignore */ }
  // Forma taýýar bolandan soň ýükle
  const startEdit = () => { loadAnketaForEdit(EDIT_ID); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEdit);
  } else {
    setTimeout(startEdit, 0);
  }
} else {
  restoreDraft();
}

async function collectAnketaPhotoFiles() {
  const ctl = resolvePhotoCtl();
  photoCtl = ctl;

  // 1) store / ctl
  let items = await waitForPhotosReady(ctl);
  let file = items[0]?.file
    || window.__kerwenPhotoFiles?.[0]
    || window.AnketaPhoto?.getFiles?.()?.[0]
    || null;

  // 2) forma bagly hidden input (DataTransfer bilen ýazylan)
  if (!file) {
    const native = document.getElementById('anketa-photo-submit');
    if (native?.files?.length) file = native.files[0];
  }

  // 3) gallery DOM-dan dikelt
  if (!file && ctl.recoverFromDom) {
    try {
      items = await ctl.recoverFromDom();
      file = items[0]?.file || null;
    } catch { /* */ }
  }

  // 4) gallery img blob
  if (!file && window.AnketaPhoto?.recoverFilesFromGallery) {
    try {
      const recovered = await window.AnketaPhoto.recoverFilesFromGallery(photoRoot);
      if (recovered[0]) file = recovered[0];
    } catch { /* */ }
  }

  return file ? [file] : [];
}

document.getElementById('anketa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (window.BarYokField) BarYokField.syncAll(e.target);
  const alertBox = document.getElementById('alert-box');
  const form = e.target;
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    try { el.setCustomValidity(''); } catch { /* */ }
  });
  const isEdit = Boolean(EDIT_ID);

  syncPhoneCombined();
  const personalErr = validatePersonalBeforeEducation();
  if (personalErr) {
    showAlert(alertBox, personalErr, 'error');
    return;
  }

  // Surat hökmany däl — operatorlar suratsyz hem goşup bilýär
  const photoFiles = await collectAnketaPhotoFiles();

  const formData = new FormData(form);
  formData.delete('photo');
  formData.delete('photos');
  if (photoFiles.length) {
    photoFiles.forEach((file) => {
      formData.append('photos', file, file.name || 'photo.jpg');
    });
    formData.append('photo', photoFiles[0], photoFiles[0].name || 'photo.jpg');
  } else if (isEdit) {
    const ctl = resolvePhotoCtl();
    const store = window.AnketaPhoto?.getStore?.();
    if (ctl?.wasTouched?.() || store?.userTouched) {
      formData.append('clearPhotos', '1');
    }
  }

  // Orta: diňe okuw jaýlary gizlenýär; kurslar hemişe saklanýar
  const educationDetails = [
    ...(getEducationLevel() === 'Orta' ? [] : collectEducationRows()),
    ...collectCourseRows(),
  ];

  const workExperience = [...document.querySelectorAll('.experience-row')].map((row) => ({
    years: row.querySelector('.exp-years').value,
    company: row.querySelector('.exp-company').value,
    direction: row.querySelector('.exp-direction')?.value || '',
    position: row.querySelector('.exp-position').value,
  })).filter((item) => item.company || item.position);

  const languages = collectLanguages();
  const computerSkills = collectPrograms();

  const workFrom = document.getElementById('workFrom')?.value || '';
  const workTo = document.getElementById('workTo')?.value || '';
  const workSchedule = workFrom && workTo ? `${workFrom}-${workTo}` : '';
  const dt = syncAnketaDateTime();
  const birthParsed = parseBirthDateValue(form.querySelector('[name="birthYear"]')?.value);
  const birthDateDisplay = birthParsed.ok ? birthParsed.display : '';

  const extraData = {
    hasChildren: formData.get('hasChildren') || 'Ýok',
    workFrom,
    workTo,
    formTime: dt.time,
    formDateTime: dt.display,
    birthDate: birthDateDisplay || undefined,
  };

  formData.delete('comp_static');
  formData.delete('comp_extra');
  formData.delete('hasChildren');
  formData.delete('logoKurs');
  LANGS.forEach((lang) => formData.delete(`lang_${lang}`));

  formData.set('workSchedule', workSchedule);
  if (birthParsed.ok && birthParsed.year) {
    formData.set('birthYear', String(birthParsed.year));
  }
  if (isEdit) {
    formData.set('status', editStatus || formData.get('status') || 'Islanok');
    formData.set('formDate', editFormDate || formData.get('formDate') || dt.date);
  } else {
    if (!formData.get('status')) formData.set('status', 'Islanok');
    formData.set('formDate', dt.date);
  }
  const positions = collectDesiredPositions();
  if (!positions.length) {
    const single = form.querySelector('[name="desiredPosition"]')?.value?.trim();
    if (single) {
      formData.set('desiredPosition', single);
      extraData.desiredPositions = [single];
    } else {
      showAlert(alertBox, 'Iň azyndan 1 wezipe ýazyň', 'error');
      return;
    }
  } else {
    formData.set('desiredPosition', positions.join(' / '));
    extraData.desiredPositions = positions;
  }
  formData.append('educationDetails', JSON.stringify(educationDetails));
  formData.append('workExperience', JSON.stringify(workExperience));
  formData.append('languages', JSON.stringify(languages));
  formData.append('computerSkills', JSON.stringify(computerSkills));
  formData.append('extraData', JSON.stringify(extraData));

  try {
    if (isEdit) {
      const res = await api.put(`/anketas/${EDIT_ID}`, formData);
      clearDraft();
      showAlert(alertBox, `Anketa täzelendi! № ${res.data.anketaNumber || EDIT_ID}`, 'success');
      setTimeout(() => {
        window.location.href = '/admin/dashboard.html';
      }, 500);
      return;
    }

    const res = await api.post('/anketas', formData);
    clearDraft();
    showAlert(alertBox, `Anketa üstünlikli iberildi! № ${res.data.anketaNumber}`, 'success');

    if (window.ANKETA_FROM_PANEL) {
      try {
        const contractRes = await api.post(`/contracts/from-anketa/${res.data.id}`, {});
        const ret = encodeURIComponent(`/admin/anketa-view.html?id=${res.data.id}`);
        window.open(`/anketa-print.html?id=${res.data.id}&return=${ret}`, '_blank');
        const cp = new URLSearchParams({
          id: String(contractRes.data.id),
          anketaId: String(res.data.id),
          return: `/admin/anketa-view.html?id=${res.data.id}`,
        });
        window.open(`/admin/contract-print.html?${cp}`, '_blank');
      } catch (contractErr) {
        const ret = encodeURIComponent(`/admin/anketa-view.html?id=${res.data.id}`);
        window.open(`/anketa-print.html?id=${res.data.id}&return=${ret}`, '_blank');
        showAlert(alertBox, `Anketa ýazyldy, şertnama: ${contractErr.message}`, 'error');
      }

      if (window.ANKETA_EMBED && window.parent !== window) {
        window.parent.postMessage({
          type: 'anketa-created',
          id: res.data.id,
          anketaNumber: res.data.anketaNumber,
          skipPrint: true,
        }, '*');
        return;
      }
      // Üstünlik: anketanyň içinde galyň (dashboarda däl)
      setTimeout(() => {
        window.location.href = `/admin/anketa-view.html?id=${res.data.id}`;
      }, 600);
      return;
    }

    window.open(`/anketa-print.html?id=${res.data.id}&return=${encodeURIComponent('/anketa.html')}`, '_blank');
    form.reset();
    photoCtl.clear();
    await photoCtl.stopCamera?.();
    const edu = document.getElementById('education-rows');
    const courses = document.getElementById('course-rows');
    const exp = document.getElementById('experience-rows');
    if (edu) edu.innerHTML = '';
    if (courses) courses.innerHTML = '';
    if (exp) exp.innerHTML = '';
    const extraLangs = document.getElementById('extra-langs');
    const extraProgs = document.getElementById('extra-programs');
    if (extraLangs) extraLangs.innerHTML = '';
    if (extraProgs) extraProgs.innerHTML = '';
    renderLangLevels();
    renderPrograms();
    addEducationRow();
    addCourseRow();
    addExperienceRow();
    setPhoneFields('');
    syncEducationDetailsVisibility();
  } catch (err) {
    let msg = err.message || 'Ýalňyşlyk';
    if (err.status === 409 && err.data?.existingId) {
      msg += ` — bar bolan anketa: /admin/anketa-view.html?id=${err.data.existingId}`;
      if (window.ANKETA_FROM_PANEL) {
        showAlert(alertBox, msg, 'error');
        const openBtn = document.createElement('div');
        openBtn.style.marginTop = '8px';
        openBtn.innerHTML = `<a class="btn btn-sm btn-primary" href="/admin/anketa-view.html?id=${err.data.existingId}" target="_blank">Bar bolan anketany aç</a>`;
        alertBox.appendChild(openBtn);
        return;
      }
    }
    showAlert(alertBox, msg, 'error');
  }
});

