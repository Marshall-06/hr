if (!requireAuth()) throw new Error('Auth required');

const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const editEarly = document.getElementById('btn-edit-vacancy');
if (editEarly && id) {
  editEarly.href = `/admin/vacancy-new.html?id=${id}&return=view`;
}

const VACANCY_LANGS = ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Pars', 'Özbek'];
const VACANCY_PROGS = [
  'MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE',
  'Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint',
];

function navBack() {
  if (window.EscNav?.goBack) {
    EscNav.goBack();
    return;
  }
  if (history.length > 1) {
    history.back();
    return;
  }
  location.href = '/admin/dashboard.html?tab=vacancies';
}

document.getElementById('btn-nav-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  navBack();
});
document.getElementById('btn-nav-back') && (document.getElementById('btn-nav-back').dataset.navBound = '1');

function esc(v) {
  if (v == null || v === '') return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function val(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

function phoneHtml(phone) {
  if (!phone) return '—';
  const parts = String(phone).split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return esc(phone) || '—';
  return parts.map((p) => {
    const tel = p.replace(/[^\d+]/g, '') || p;
    return `<a class="phone-link" href="tel:${esc(tel)}">${esc(p)}</a>`;
  }).join(', ');
}

function emailHtml(email) {
  if (!email) return '—';
  const parts = String(email).split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return esc(email) || '—';
  return parts.map((p) => `<a class="mail-link" href="mailto:${esc(p)}">${esc(p)}</a>`).join(', ');
}

function contactsBlockHtml(v) {
  const extra = v?.extraData && typeof v.extraData === 'object' ? v.extraData : {};
  let names = Array.isArray(extra.contactNames) ? extra.contactNames.filter(Boolean) : [];
  let phones = Array.isArray(extra.contactPhones) ? extra.contactPhones.filter(Boolean) : [];
  let emails = Array.isArray(extra.contactEmails) ? extra.contactEmails.filter(Boolean) : [];

  if (!names.length && !phones.length && !emails.length && Array.isArray(extra.contacts)) {
    extra.contacts.forEach((c) => {
      if (c?.name) names.push(c.name);
      if (c?.phone) phones.push(c.phone);
      if (c?.email) emails.push(c.email);
    });
  }
  if (!names.length) {
    names = String(v.contactName || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (!phones.length) {
    phones = String(v.contactPhone || '').split(/[,;/|\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (!emails.length) {
    emails = String(v.contactEmail || '').split(/[,;/|\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  const listHtml = (items, render) => {
    if (!items.length) return '<span class="muted">—</span>';
    return `<div class="vac-view-list">${items.map((x) => `<div>${render(x)}</div>`).join('')}</div>`;
  };

  return `
    ${field('Jogapkär ady', listHtml(names, (n) => `<strong>${esc(n)}</strong>`), { html: true })}
    ${field('Telefon', listHtml(phones, (p) => phoneHtml(p)), { html: true })}
    ${field('Email', listHtml(emails, (e) => emailHtml(e)), { html: true })}
  `;
}

function forumName(v) {
  return v.acceptedBy?.fullName || v.acceptedBy?.username || v.forumOperator || '—';
}

function parseSkillList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function skillChecked(list, name) {
  const n = String(name).toLowerCase();
  return list.some((x) => {
    const a = String(x).toLowerCase();
    return a === n || a.includes(n) || n.includes(a);
  });
}

function field(label, value, opts = {}) {
  const full = opts.full ? ' style="grid-column:1/-1"' : '';
  const small = opts.small ? `<small>${esc(opts.small)}</small>` : '';
  const html = opts.html ? value : esc(val(value));
  return `
    <div class="form-group"${full}>
      <label>${esc(label)}</label>
      <div class="vac-view-field">${html}</div>
      ${small}
    </div>`;
}

function skillGrid(items, selected) {
  const known = new Set(items.map((x) => x.toLowerCase()));
  const extras = (selected || []).filter((x) => !known.has(String(x).toLowerCase()));
  return `
    <div class="checkbox-grid">
      ${items.map((name) => `
        <label class="check-item ${skillChecked(selected, name) ? 'is-on' : ''}">
          <input type="checkbox" disabled ${skillChecked(selected, name) ? 'checked' : ''}> ${esc(name)}
        </label>
      `).join('')}
      ${extras.map((name) => `
        <label class="check-item is-on">
          <input type="checkbox" disabled checked> ${esc(name)}
        </label>
      `).join('')}
    </div>`;
}

async function load() {
  const box = document.getElementById('content');
  if (!id) {
    box.innerHTML = '<p class="muted">Wakansiýa ID ýok</p>';
    return;
  }

  try {
    const res = await api.get(`/vacancies/${id}`);
    const v = res.data;
    const dateLabel = typeof formatDate === 'function' ? formatDate(v.vacancyDate) : '';
    const numLabel = `№ ${v.vacancyNumber || id}`;
    document.getElementById('vacancy-number').textContent = dateLabel ? `${numLabel} · ${dateLabel}` : numLabel;
    document.title = `Wakansiýa ${numLabel}${dateLabel ? ` · ${dateLabel}` : ''} — ${(typeof agencyBrandFull === 'function' && agencyBrandFull()) || 'Kerwen Agenstwa'}`;

    const editBtn = document.getElementById('btn-edit-vacancy');
    if (editBtn) editBtn.href = `/admin/vacancy-new.html?id=${v.id}&return=view`;

    document.getElementById('btn-match-vacancy').onclick = () => {
      window.location.href = `/admin/dashboard.html?tab=match&vacancyId=${v.id}`;
    };

    const langs = parseSkillList(v.languages);
    const progs = parseSkillList(v.computerPrograms);
    const statusLabel = v.status === 'Acyk' ? 'Açyk' : (v.status === 'Yapyk' ? 'Ýapyk' : val(v.status));

    box.innerHTML = `
      <div class="section" style="max-width:980px;margin:0 auto;padding:16px 12px 40px">
        <div class="vac-view-head">
          <h2 class="section-title" style="margin:0">Wakansiýa maglumaty</h2>
          <span class="badge ${v.status === 'Acyk' ? 'badge-success' : 'badge-danger'}">${esc(statusLabel)}</span>
        </div>

        <div class="form-section vac-view-form">
          <div class="form-grid">
            ${field('Kabul edilen senesi', typeof formatDate === 'function' ? formatDate(v.vacancyDate) : (v.vacancyDate || '—'))}
            ${field('Kärhananyň ady', v.companyName)}
            ${field('Wezipe', v.position, { small: '1 forum = 1 wezipe' })}
            ${field('Aýlyk haky', v.salary)}
            ${field('Ýerleşýän ýeri', v.location)}
            ${field('Iş wagty', v.workHours)}
            ${field('Dynç güni', v.dayOff)}
            ${field('Tejribe', v.experience)}
            ${field('Bilim', v.education)}
            ${field('Jynsy', v.gender)}
            ${field('Maşgala ýagdaýy', v.extraData?.maritalStatus)}
            ${field('Şahsy awtoulag', v.extraData?.hasCar)}
            <div class="form-group" style="grid-column:1/-1">
              <label>Bilmeli diller</label>
              ${skillGrid(VACANCY_LANGS, langs)}
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Kompýuter programmalary</label>
              ${skillGrid(VACANCY_PROGS, progs)}
            </div>
            ${field('Ýaş aralygy', v.ageRange)}
            ${field('Propiska', v.registration)}
            ${field('Işgär sany', v.workersNeeded)}
            ${field('Kärhana ugry', v.companyDirection)}
            ${field('Ýagdaý', statusLabel)}
            ${field('Ýapylmagynyň sebäbi', v.closeReason)}
            ${field('Forum operator', forumName(v))}
            ${contactsBlockHtml(v)}
            ${field('Işiň düşündirişi', v.jobDescription, { full: true })}
          </div>

          <div class="toolbar" style="margin-top:16px;gap:8px;flex-wrap:wrap">
            <a class="btn btn-accent" href="/admin/vacancy-new.html?id=${v.id}&return=view">Üýtget</a>
            <button type="button" class="btn btn-ghost" id="btn-match-inline">Dalaşgär tap</button>
          </div>
        </div>

        <div class="form-section" style="margin-top:16px" id="vacancy-comments"></div>
      </div>
    `;

    document.getElementById('btn-match-inline')?.addEventListener('click', () => {
      window.location.href = `/admin/dashboard.html?tab=match&vacancyId=${v.id}`;
    });

    if (window.CommentsUI) {
      CommentsUI.mountComments(document.getElementById('vacancy-comments'), 'vacancy', v.id);
    }
  } catch (err) {
    box.innerHTML = `<p class="muted">Ýalňyşlyk: ${esc(err.message)}</p>`;
  }
}

load();
