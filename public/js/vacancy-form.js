const user = (window.Auth && Auth.getUser()) || {};
const isAdmin = user.role === 'admin';

const VACANCY_LANGS = ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Pars', 'Özbek'];
const VACANCY_PROGS = [
  'MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE',
  'Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint',
];

const EDIT_ID = String(window.VACANCY_EDIT_ID || new URLSearchParams(location.search).get('id') || '').trim();

function renderVacancySkillPickers() {
  const langGrid = document.getElementById('vacancy-lang-grid');
  const progGrid = document.getElementById('vacancy-prog-grid');
  if (langGrid && !langGrid.dataset.ready) {
    langGrid.innerHTML = VACANCY_LANGS.map((l) => `
      <label class="check-item">
        <input type="checkbox" class="vac-lang-check" value="${l}" ${['Türkmen', 'Rus'].includes(l) ? 'checked' : ''}> ${l}
      </label>
    `).join('');
    langGrid.dataset.ready = '1';
  }
  if (progGrid && !progGrid.dataset.ready) {
    progGrid.innerHTML = VACANCY_PROGS.map((p) => `
      <label class="check-item">
        <input type="checkbox" class="vac-prog-check" value="${p}"> ${p}
      </label>
    `).join('');
    progGrid.dataset.ready = '1';
  }
}

function addVacancyExtra(type) {
  const input = document.getElementById(type === 'lang' ? 'vacancy-lang-custom' : 'vacancy-prog-custom');
  const box = document.getElementById(type === 'lang' ? 'vacancy-lang-extra' : 'vacancy-prog-extra');
  const value = (input?.value || '').trim();
  if (!value || !box) return;

  const exists = [...box.querySelectorAll('input')].some((el) => el.value.toLowerCase() === value.toLowerCase());
  if (exists) {
    input.value = '';
    return;
  }

  const row = document.createElement('label');
  row.className = 'check-item';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = type === 'lang' ? 'vac-lang-check' : 'vac-prog-check';
  cb.value = value;
  cb.checked = true;

  const text = document.createTextNode(` ${value} `);

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
  input.value = '';
}

function collectVacancySkills() {
  const langs = [...document.querySelectorAll('.vac-lang-check:checked')].map((el) => el.value);
  const progs = [...document.querySelectorAll('.vac-prog-check:checked')].map((el) => el.value);
  return {
    languages: langs.join(', '),
    computerPrograms: progs.join(', '),
  };
}

function escAttr(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** @param {'name'|'phone'|'email'} kind */
function vacancyMultiMeta(kind) {
  if (kind === 'phone') {
    return {
      boxId: 'vacancy-phone-rows',
      inputClass: 'vac-c-phone',
      type: 'tel',
      placeholder: 'Telefon',
      hiddenId: 'vacancy-contact-phone',
      join: ', ',
    };
  }
  if (kind === 'email') {
    return {
      boxId: 'vacancy-email-rows',
      inputClass: 'vac-c-email',
      type: 'email',
      placeholder: 'Email',
      hiddenId: 'vacancy-contact-email',
      join: ', ',
    };
  }
  return {
    boxId: 'vacancy-name-rows',
    inputClass: 'vac-c-name',
    type: 'text',
    placeholder: 'Jogapkär ady',
    hiddenId: 'vacancy-contact-name',
    join: '\n',
  };
}

function addVacancyMultiRow(kind, value = '') {
  const meta = vacancyMultiMeta(kind);
  const box = document.getElementById(meta.boxId);
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'vac-multi-row';
  row.innerHTML = `
    <input type="${meta.type}" class="${meta.inputClass}" placeholder="${meta.placeholder}"
      autocomplete="off" value="${escAttr(value)}">
    <button type="button" class="btn btn-sm btn-danger vac-c-remove" title="Poz">✕</button>
  `;
  row.querySelector('.vac-c-remove').onclick = () => {
    row.remove();
    if (!box.querySelector('.vac-multi-row')) addVacancyMultiRow(kind);
    syncVacancyContactHidden();
  };
  row.querySelector('input')?.addEventListener('input', syncVacancyContactHidden);
  box.appendChild(row);
  syncVacancyContactHidden();
}

function collectVacancyMultiValues(kind) {
  const meta = vacancyMultiMeta(kind);
  return [...document.querySelectorAll(`#${meta.boxId} .${meta.inputClass}`)]
    .map((el) => String(el.value || '').trim())
    .filter(Boolean);
}

function syncVacancyContactHidden() {
  const names = collectVacancyMultiValues('name');
  const phones = collectVacancyMultiValues('phone');
  const emails = collectVacancyMultiValues('email');
  const nameEl = document.getElementById('vacancy-contact-name');
  const phoneEl = document.getElementById('vacancy-contact-phone');
  const emailEl = document.getElementById('vacancy-contact-email');
  if (nameEl) nameEl.value = names.join('\n');
  if (phoneEl) phoneEl.value = phones.join(', ');
  if (emailEl) emailEl.value = emails.join(', ');
}

function collectVacancyContacts() {
  const names = collectVacancyMultiValues('name');
  const phones = collectVacancyMultiValues('phone');
  const emails = collectVacancyMultiValues('email');
  const n = Math.max(names.length, phones.length, emails.length);
  const contacts = [];
  for (let i = 0; i < n; i += 1) {
    contacts.push({
      name: names[i] || '',
      phone: phones[i] || '',
      email: emails[i] || '',
    });
  }
  return {
    names,
    phones,
    emails,
    contacts: contacts.filter((c) => c.name || c.phone || c.email),
  };
}

function fillVacancyMultiBox(kind, values) {
  const meta = vacancyMultiMeta(kind);
  const box = document.getElementById(meta.boxId);
  if (!box) return;
  box.innerHTML = '';
  const list = (Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean);
  if (!list.length) addVacancyMultiRow(kind);
  else list.forEach((v) => addVacancyMultiRow(kind, v));
}

function fillVacancyContacts(v) {
  const extra = v?.extraData && typeof v.extraData === 'object' ? v.extraData : {};
  let names = Array.isArray(extra.contactNames) ? extra.contactNames.slice() : [];
  let phones = Array.isArray(extra.contactPhones) ? extra.contactPhones.slice() : [];
  let emails = Array.isArray(extra.contactEmails) ? extra.contactEmails.slice() : [];

  if (!names.length && !phones.length && !emails.length && Array.isArray(extra.contacts)) {
    extra.contacts.forEach((c) => {
      if (c?.name) names.push(c.name);
      if (c?.phone) phones.push(c.phone);
      if (c?.email) emails.push(c.email);
    });
  }

  if (!names.length) {
    names = String(pickVac(v, 'contactName', 'contact_name') || '')
      .split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (!phones.length) {
    phones = String(pickVac(v, 'contactPhone', 'contact_phone') || '')
      .split(/[,;/|\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (!emails.length) {
    emails = String(pickVac(v, 'contactEmail', 'contact_email') || '')
      .split(/[,;/|\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  fillVacancyMultiBox('name', names);
  fillVacancyMultiBox('phone', phones);
  fillVacancyMultiBox('email', emails);
}

function ensureVacancyMultiDefaults() {
  if (!document.querySelector('#vacancy-name-rows .vac-multi-row')) addVacancyMultiRow('name');
  if (!document.querySelector('#vacancy-phone-rows .vac-multi-row')) addVacancyMultiRow('phone');
  if (!document.querySelector('#vacancy-email-rows .vac-multi-row')) addVacancyMultiRow('email');
}

async function hydrateVacancyMaritalList() {
  const list = document.getElementById('vacancy-marital-list');
  if (!list || !window.OptionLists) return;
  try {
    const data = await OptionLists.fetchList('marital_status');
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return;
    const extras = ['Soralanmaýar'];
    const all = [...items];
    extras.forEach((x) => {
      if (!all.some((i) => String(i).toLowerCase() === x.toLowerCase())) all.push(x);
    });
    list.innerHTML = all.map((v) => `<option value="${escAttr(v)}"></option>`).join('');
  } catch { /* defaults in HTML */ }
}

function setForumOperatorSelf(select) {
  if (!select || !user?.id) return;
  const label = user.fullName || user.username || 'Men';
  select.innerHTML = `<option value="${user.id}" selected>${label}</option>`;
}

async function loadForumOperators(preferredId) {
  const select = document.getElementById('vacancy-forum-operator');
  const hint = document.getElementById('vacancy-forum-hint');
  if (!select) return;

  setForumOperatorSelf(select);

  if (!isAdmin) {
    select.disabled = true;
    let hidden = document.getElementById('vacancy-forum-operator-hidden');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'acceptedByUserId';
      hidden.id = 'vacancy-forum-operator-hidden';
      select.insertAdjacentElement('afterend', hidden);
    }
    hidden.value = String(user.id);
    select.removeAttribute('name');
    if (hint) hint.textContent = 'Forum operator — giren ulanyjy (awtomatik, üýtgedip bolmaýar).';
    return;
  }

  try {
    const res = await api.get('/auth/staff');
    const staff = (res.data || []).filter((u) => u.role === 'operator');
    if (!staff.length) {
      select.innerHTML = '<option value="">Operator ýok — Ulanyjylar sekmesinde goşuň</option>';
      if (hint) hint.textContent = 'Ilki bir operator ulanyjy dörediň.';
      return;
    }
    const prefer = preferredId ? String(preferredId) : '';
    select.innerHTML = [
      '<option value="">— Forum operator saýlaň —</option>',
      ...staff.map((u) => {
        const label = u.fullName || u.username;
        const selected = prefer && String(u.id) === prefer ? 'selected' : '';
        return `<option value="${u.id}" ${selected}>${label}</option>`;
      }),
    ].join('');
    if (prefer && [...select.options].some((o) => o.value === prefer)) {
      select.value = prefer;
    }
    if (hint) hint.textContent = 'Hökman dogry operator saýlaň — garyşyklyk bolmaz ýaly.';
  } catch (e) {
    select.innerHTML = '<option value="">Operator ýüklenmedi</option>';
    if (hint) hint.textContent = e.message || 'Staff sanawy ýüklenmedi';
  }
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

function setChecksFromCsv(csv, customInputId, checkClass) {
  const values = String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  document.querySelectorAll(`.${checkClass}`).forEach((el) => { el.checked = false; });
  values.forEach((val) => {
    const std = [...document.querySelectorAll(`.${checkClass}`)]
      .find((el) => el.value === val);
    if (std) {
      std.checked = true;
      return;
    }
    const input = document.getElementById(customInputId);
    if (input) {
      input.value = val;
      addVacancyExtra(checkClass.includes('lang') ? 'lang' : 'prog');
    }
  });
}

function setEditChrome(v) {
  const num = v?.vacancyNumber || EDIT_ID;
  document.title = `Wakansiýany üýtget № ${num} — ${(typeof agencyBrandFull === 'function' && agencyBrandFull()) || 'Kerwen Agenstwa'}`;
  const h1 = document.querySelector('.logo-text h1');
  if (h1) h1.textContent = 'Wakansiýany üýtget';
  const title = document.querySelector('.section-title');
  if (title) title.textContent = `Wakansiýany üýtget · № ${num}`;
  document.querySelectorAll('a.btn-ghost[href*="dashboard"]').forEach((a) => {
    a.href = `/admin/vacancy-view.html?id=${EDIT_ID}`;
    a.textContent = a.textContent.includes('Ýatyr') ? 'Ýatyr' : '← Wakansiýany gör';
  });
  const submitBtn = document.querySelector('#vacancy-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Üýtgetmeleri ýatda sakla';
}

function setVacancyDateField(iso) {
  if (!iso) return;
  const dateIso = String(iso).slice(0, 10);
  const el = document.querySelector('#vacancy-form [name="vacancyDate"]');
  if (!el) return;
  el.value = dateIso;
  const display = el.closest('.tk-date-wrap')?.querySelector('.tk-date-display');
  if (display && typeof window.formatDateTk === 'function') {
    display.value = formatDateTk(dateIso, false);
  }
}

function initVacancyDatePicker() {
  const raw = document.getElementById('vacancy-date');
  if (raw && !EDIT_ID && !raw.value) {
    raw.value = new Date().toISOString().slice(0, 10);
  }
  if (typeof initTkDatePickers === 'function') {
    initTkDatePickers(document.getElementById('vacancy-form'));
  }
}
function pickVac(obj, camel, snake) {
  if (!obj) return undefined;
  if (obj[camel] != null && obj[camel] !== '') return obj[camel];
  if (snake && obj[snake] != null && obj[snake] !== '') return obj[snake];
  return undefined;
}

async function loadVacancyForEdit(id) {
  const alertBox = document.getElementById('alert-box');
  try {
    showAlert(alertBox, 'Wakansiýa maglumatlary ýüklenýär...', 'success');
    window.VACANCY_EDIT_ID = String(id);
    const res = await api.get(`/vacancies/${encodeURIComponent(id)}`);
    const v = (res?.data && typeof res.data === 'object') ? res.data : (res || {});
    if (!v || (!v.id && !v.companyName && !v.position)) {
      throw new Error('Wakansiýa maglumaty gelmedi');
    }
    setEditChrome(v);
    const form = document.getElementById('vacancy-form');
    if (!form) throw new Error('Forma tapylmady');

    const fieldMap = [
      ['vacancyDate', 'vacancy_date'],
      ['companyName', 'company_name'],
      ['position', 'position'],
      ['salary', 'salary'],
      ['location', 'location'],
      ['workHours', 'work_hours'],
      ['dayOff', 'day_off'],
      ['experience', 'experience'],
      ['education', 'education'],
      ['gender', 'gender'],
      ['ageRange', 'age_range'],
      ['registration', 'registration'],
      ['workersNeeded', 'workers_needed'],
      ['companyDirection', 'company_direction'],
      ['status', 'status'],
      ['closeReason', 'close_reason'],
      ['jobDescription', 'job_description'],
    ];
    const apply = () => {
      fieldMap.forEach(([camel, snake]) => {
        const val = pickVac(v, camel, snake);
        if (val == null || val === '') return;
        if (camel === 'vacancyDate') {
          setVacancyDateField(val);
          return;
        }
        const el = form.querySelector(`[name="${camel}"]`);
        if (!el) return;
        if (el.tagName === 'SELECT') ensureSelectValue(el, val);
        else el.value = String(val);
      });
    };
    apply();
    setTimeout(apply, 80);

    fillVacancyContacts(v);
    const maritalEl = form.querySelector('[name="maritalStatus"]');
    const marital = (v.extraData && v.extraData.maritalStatus)
      || pickVac(v, 'maritalStatus', 'marital_status')
      || '';
    if (maritalEl && marital) maritalEl.value = String(marital);

    const carWrap = form.querySelector('[data-bar-yok-field]');
    const hasCar = (v.extraData && v.extraData.hasCar)
      || pickVac(v, 'hasCar', 'has_car')
      || '';
    if (carWrap && window.BarYokField) BarYokField.setValue(carWrap, hasCar);

    setChecksFromCsv(pickVac(v, 'languages', 'languages'), 'vacancy-lang-custom', 'vac-lang-check');
    setChecksFromCsv(
      pickVac(v, 'computerPrograms', 'computer_programs'),
      'vacancy-prog-custom',
      'vac-prog-check',
    );

    await loadForumOperators(
      pickVac(v, 'acceptedByUserId', 'accepted_by_user_id') || v.acceptedBy?.id,
    );
    showAlert(
      alertBox,
      `Wakansiýa № ${pickVac(v, 'vacancyNumber', 'vacancy_number') || id} — öňki maglumatlar dolduryldy. Üýtgedip saklaň.`,
      'success',
    );
  } catch (err) {
    console.error('loadVacancyForEdit', err);
    showAlert(alertBox, err.message || 'Wakansiýa ýüklenmedi', 'error');
  }
}

const DEFAULT_VACANCY_CLOSE_REASONS = [
  'Bizden alyndy',
  'Bizden alynmady',
  'Indi saýlanmaly',
  'Bile işleşmek islemediler',
];

function pickCloseReasonItems(data) {
  const defaults = [...DEFAULT_VACANCY_CLOSE_REASONS];
  const defaultsLower = new Set(defaults.map((d) => d.toLowerCase()));
  const custom = (Array.isArray(data?.custom) ? data.custom : [])
    .map((x) => String(x || '').trim().replace(/\s+/g, ' '))
    .filter((x) => {
      if (x.length < 2 || x.length > 60) return false;
      if (defaultsLower.has(x.toLowerCase())) return false;
      if (/[.!?]/.test(x)) return false;
      if (x.split(/\s+/).length > 8) return false;
      return true;
    });
  const seen = new Set(defaults.map((d) => d.toLowerCase()));
  const items = [...defaults];
  custom.forEach((r) => {
    const key = r.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(r);
  });
  return items;
}

async function fillVacancyCloseReasonSelect(selected = '') {
  const sel = document.getElementById('vacancy-close-reason');
  if (!sel) return;
  let items = DEFAULT_VACANCY_CLOSE_REASONS;
  try {
    const res = await api.get('/vacancies/close-reasons');
    items = pickCloseReasonItems(res.data);
  } catch {
    /* default */
  }
  const prev = selected || sel.value || '';
  sel.innerHTML = `<option value="">-</option>${items.map((r) => {
    const v = String(r).replace(/"/g, '&quot;');
    return `<option value="${v}">${v}</option>`;
  }).join('')}`;
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

async function addVacancyCloseReasonOnForm() {
  if (!isAdmin) {
    alert('Diňe admin düzedip bilýär');
    return;
  }
  if (window.OptionLists) {
    OptionLists.showEditorModal('vacancy_close_reasons', 'Wakansiýa ýapylma sebäpleri');
    return;
  }
  const raw = window.prompt('Täze ýapylma sebäbini ýazyň:');
  if (raw == null) return;
  const reason = String(raw).trim();
  if (reason.length < 2) {
    alert('Sebäp gaty gysga');
    return;
  }
  try {
    const res = await api.post('/vacancies/close-reasons', { reason });
    await fillVacancyCloseReasonSelect(res.data?.added || reason);
    alert(res.data?.alreadyExists ? 'Bu sebäp eýýäm bar' : 'Sebäp goşuldy');
  } catch (e) {
    alert(e.message || 'Goşulmady');
  }
}

window.addVacancyExtra = addVacancyExtra;
window.addVacancyMultiRow = addVacancyMultiRow;
window.addVacancyCloseReasonOnForm = addVacancyCloseReasonOnForm;

renderVacancySkillPickers();

(async () => {
  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('hidden'));
  }

  if (window.OptionLists) {
    window.onOptionListChanged = async (key) => {
      if (key === 'vacancy_close_reasons') await fillVacancyCloseReasonSelect();
    };
    await OptionLists.hydrateAllSelects();
  }

  await fillVacancyCloseReasonSelect();
  initVacancyDatePicker();
  await hydrateVacancyMaritalList();
  document.getElementById('btn-add-vacancy-name')?.addEventListener('click', () => addVacancyMultiRow('name'));
  document.getElementById('btn-add-vacancy-phone')?.addEventListener('click', () => addVacancyMultiRow('phone'));
  document.getElementById('btn-add-vacancy-email')?.addEventListener('click', () => addVacancyMultiRow('email'));
  if (!EDIT_ID) ensureVacancyMultiDefaults();
  if (EDIT_ID) {
    await loadVacancyForEdit(EDIT_ID);
    const form = document.getElementById('vacancy-form');
    const current = form?.querySelector('[name="closeReason"]')?.value || '';
    if (current) await fillVacancyCloseReasonSelect(current);
  } else {
    await loadForumOperators();
  }
})();

document.getElementById('vacancy-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('alert-box');
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());
  if (!data.status) data.status = 'Acyk';
  if (!data.closeReason) data.closeReason = null;
  if (!data.vacancyDate) {
    showAlert(alertBox, 'Kabul edilen senesini ýazyň', 'error');
    return;
  }
  data.vacancyDate = String(data.vacancyDate).slice(0, 10);
  data.contactAnketaId = null;

  syncVacancyContactHidden();
  const packed = collectVacancyContacts();
  data.contactName = packed.names.join('\n') || null;
  data.contactPhone = packed.phones.join(', ') || null;
  data.contactEmail = packed.emails.join(', ') || null;

  const maritalStatus = String(data.maritalStatus || '').trim() || null;
  delete data.maritalStatus;
  if (window.BarYokField) BarYokField.syncAll(e.target);
  const hasCar = String(data.hasCar || '').trim() || null;
  delete data.hasCar;
  data.extraData = {
    contactNames: packed.names,
    contactPhones: packed.phones,
    contactEmails: packed.emails,
    contacts: packed.contacts,
    maritalStatus,
    hasCar,
  };

  if (!data.acceptedByUserId && user.id && user.role === 'operator') {
    data.acceptedByUserId = user.id;
  }
  if (user.role === 'operator') {
    data.acceptedByUserId = user.id;
    data.forumOperator = user.fullName || user.username;
  }
  if (data.acceptedByUserId) {
    data.acceptedByUserId = Number(data.acceptedByUserId);
  }
  if (user.role === 'admin' && !data.acceptedByUserId && !EDIT_ID) {
    showAlert(alertBox, 'Forum operator saýlaň', 'error');
    return;
  }

  const sel = document.getElementById('vacancy-forum-operator');
  if (user.role !== 'operator' && sel && sel.value && !sel.disabled) {
    const opt = sel.selectedOptions[0];
    if (opt) data.forumOperator = (opt.textContent || '').trim();
  } else if (user.role === 'operator' && (user.fullName || user.username)) {
    data.forumOperator = user.fullName || user.username;
  }

  try {
    const skills = collectVacancySkills();
    data.languages = skills.languages || null;
    data.computerPrograms = skills.computerPrograms || null;

    let vacId = EDIT_ID;
    if (EDIT_ID) {
      const res = await api.put(`/vacancies/${EDIT_ID}`, data);
      vacId = res.data?.id || EDIT_ID;
      showAlert(alertBox, `Wakansiýa täzelendi! № ${res.data?.vacancyNumber || EDIT_ID}`, 'success');
      setTimeout(() => {
        window.location.href = '/admin/dashboard.html';
      }, 400);
      return;
    }
    const res = await api.post('/vacancies', data);
    vacId = res.data?.id;
    showAlert(alertBox, `Wakansiýa goşuldy! № ${res.data?.vacancyNumber || ''}`, 'success');
    setTimeout(() => {
      window.location.href = `/admin/vacancy-view.html?id=${vacId}`;
    }, 400);
  } catch (err) {
    showAlert(alertBox, err.message, 'error');
  }
});
