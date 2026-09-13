if (!requireAuth()) throw new Error('Auth required');

const user = (window.Auth && Auth.getUser()) || {};
const isAdmin = user.role === 'admin';
const tr = (key, fallback) => {
  if (typeof t === 'function') {
    const v = t(key);
    if (v && v !== key) return v;
  }
  return fallback || key;
};

document.getElementById('user-info').textContent = user.fullName || user.username || '';
document.getElementById('role-badge').textContent = isAdmin
  ? tr('role_admin', 'Admin')
  : tr('role_operator', 'Operator');

if (isAdmin) {
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('hidden'));
}

(function initSidebarToggle() {
  const layout = document.getElementById('admin-layout');
  const btn = document.getElementById('btn-sidebar-toggle');
  if (!layout || !btn) return;
  const key = 'sidebar_collapsed';
  const apply = (collapsed) => {
    layout.classList.toggle('sidebar-collapsed', collapsed);
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    localStorage.setItem(key, collapsed ? '1' : '0');
    // CSS transition gutarandan soň diagrammalary täze ölçegde çyz
    setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
  };
  apply(localStorage.getItem(key) === '1');
  btn.addEventListener('click', () => apply(!layout.classList.contains('sidebar-collapsed')));
})();

document.querySelectorAll('.lang-switch [data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (window.I18n) I18n.setLang(btn.getAttribute('data-lang'));
  });
});

document.addEventListener('ui-lang-changed', () => {
  document.getElementById('role-badge').textContent = isAdmin
    ? tr('role_admin', 'Admin')
    : tr('role_operator', 'Operator');
  const active = document.querySelector('.sidebar a.active');
  const tab = active?.getAttribute('data-tab');
  if (tab === 'anketas') loadAnketas();
  else if (tab === 'vacancies') {
    loadAdminVacancies();
  } else if (tab === 'assigned') loadAssigned();
  else if (tab === 'match') {
    const id = document.getElementById('match-vacancy')?.value;
    if (id) loadMatchForVacancy(id);
    else if (typeof prepareMatch === 'function') prepareMatch();
  } else if (tab === 'reports') loadReport('analytics');
  else if (tab === 'users' && typeof loadUsers === 'function') loadUsers();
});

let assignmentStatusesCache = [
  'Hödürlendi',
  'Ugradyldy',
  'Barjak diýdi',
  'Kabul edildi',
  'Olar atkaz etdiler',
];

function assignmentStatusClass(status) {
  if (status === 'Ugradyldy') return 'status-select--sent';
  if (status === 'Barjak diýdi' || status === 'Kabul edildi') return 'status-select--ok';
  if (status === 'Olar atkaz etdiler') return 'status-select--no';
  return 'status-select--offer';
}

function assignmentStatusSelectHtml(assignmentId, current) {
  const st = current || assignmentStatusesCache[0] || 'Hödürlendi';
  const opts = (assignmentStatusesCache.length ? assignmentStatusesCache : [st]).map((val) => [val, val]);
  if (st && !opts.some(([v]) => v === st)) opts.unshift([st, st]);
  return `
    <select class="status-select ${assignmentStatusClass(st)}"
      data-prev-status="${escHtml(st)}"
      onchange="onAssignmentStatusChange(this, ${assignmentId})">
      ${opts.map(([val, label]) =>
    `<option value="${escHtml(val)}" ${st === val ? 'selected' : ''}>${escHtml(label)}</option>`).join('')}
    </select>`;
}

function onAssignmentStatusChange(el, assignmentId) {
  const newStatus = el.value;
  const prevStatus = el.dataset.prevStatus || el.getAttribute('data-prev-status') || '';

  // «Işden çykdy» — işden çykýan senesi modal
  if (window.AssignmentLeftDate?.isLeftJob?.(newStatus) && prevStatus !== newStatus) {
    el.value = prevStatus;
    el.className = `status-select ${assignmentStatusClass(prevStatus)}`;
    showLeftJobDateModalDashboard(assignmentId, newStatus, el, prevStatus);
    return;
  }

  // «Kabul edildi» — işe başlan senesi modal
  if (window.AssignmentCompanyDirection?.isAccepted?.(newStatus) && prevStatus !== newStatus) {
    el.value = prevStatus;
    el.className = `status-select ${assignmentStatusClass(prevStatus)}`;
    showAcceptDateModalDashboard(assignmentId, newStatus, el, prevStatus);
    return;
  }

  el.dataset.prevStatus = newStatus;
  el.className = `status-select ${assignmentStatusClass(newStatus)}`;
  changeAssignmentRowStatus(assignmentId, newStatus);
}

function showAcceptDateModalDashboard(assignmentId, newStatus, selectEl, prevStatus) {
  const html = window.AssignmentCompanyDirection.modalHtml({
    title: 'Kabul edildi',
    hint: 'Işe başlan senesini giriziň ýa-da saýlaň',
    dateLabel: 'Işe başlan',
    defaultDate: window.AssignmentCompanyDirection.todayIso(),
    save: 'Ýatda sakla',
    cancel: 'Ýatyr',
  });
  showModal(html);
  const body = document.getElementById('modal-content');
  window.AssignmentCompanyDirection.wireModal(body, {
    onCancel: () => {
      closeModal();
      selectEl.value = prevStatus;
      selectEl.dataset.prevStatus = prevStatus;
      selectEl.className = `status-select ${assignmentStatusClass(prevStatus)}`;
    },
    onInvalidDate: () => {
      showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
    },
    onSave: async (acceptedAt) => {
      closeModal();
      selectEl.value = newStatus;
      selectEl.dataset.prevStatus = newStatus;
      selectEl.className = `status-select ${assignmentStatusClass(newStatus)}`;
      try {
        await api.patch(`/vacancies/assignments/${assignmentId}`, {
          assignmentStatus: newStatus,
          acceptedAt,
        });
        showAlert(document.getElementById('alert-box'), `${tr('status_updated', 'Ýagdaý')}: Kabul edildi`, 'success');
        loadAssigned();
        loadDashboard();
      } catch (e) {
        showAlert(document.getElementById('alert-box'), e.message, 'error');
        selectEl.value = prevStatus;
        selectEl.dataset.prevStatus = prevStatus;
        selectEl.className = `status-select ${assignmentStatusClass(prevStatus)}`;
      }
    },
  });
}

function showLeftJobDateModalDashboard(assignmentId, newStatus, selectEl, prevStatus) {
  const html = window.AssignmentLeftDate.modalHtml({
    title: 'Işden çykdy',
    hint: 'Işden çykan senesini giriziň ýa-da saýlaň',
    label: 'Işden çykan',
    defaultDate: window.AssignmentLeftDate.todayIso(),
    save: 'Ýatda sakla',
    cancel: 'Ýatyr',
  });

  showModal(html);
  const body = document.getElementById('modal-content');

  window.AssignmentLeftDate.wireModal(body, {
    onCancel: () => {
      closeModal();
      selectEl.value = prevStatus;
      selectEl.dataset.prevStatus = prevStatus;
      selectEl.className = `status-select ${assignmentStatusClass(prevStatus)}`;
    },
    onInvalid: () => {
      showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
    },
    onSave: async (leftAt) => {
      closeModal();
      selectEl.value = newStatus;
      selectEl.dataset.prevStatus = newStatus;
      selectEl.className = `status-select ${assignmentStatusClass(newStatus)}`;
      try {
        await api.patch(`/vacancies/assignments/${assignmentId}`, {
          assignmentStatus: newStatus,
          leftAt,
        });
        showAlert(document.getElementById('alert-box'), `${tr('status_updated', 'Ýagdaý')}: Işden çykdy`, 'success');

        loadAssigned();
        loadDashboard();
        const tabFees = document.getElementById('tab-fees');
        if (tabFees && !tabFees.classList.contains('hidden') && typeof loadFeePayments === 'function') {
          loadFeePayments();
        }
      } catch (e) {
        showAlert(document.getElementById('alert-box'), e.message, 'error');
        selectEl.value = prevStatus;
        selectEl.dataset.prevStatus = prevStatus;
        selectEl.className = `status-select ${assignmentStatusClass(prevStatus)}`;
      }
    },
  });
}

function anketaActiveAssignBtnHtml(anketaId, activeCount, totalCount) {
  const active = Number(activeCount) || 0;
  const total = Number(totalCount) || 0;
  if (!anketaId || active < 1) return '';
  const label = tr('active_assignments_short', 'Aktiv');
  const full = tr('active_assignments', 'Aktiv hödürleniş');
  const title = `${full}: ${active}${total > active ? ` · ${tr('total_assignments', 'Jemi')}: ${total}` : ''}`;
  return `
    <button type="button" class="active-assign-pill" title="${escHtml(title)}"
      onclick="openAnketaAssignments(${anketaId})">
      <span class="active-assign-num">${active}</span>
      <span class="active-assign-label">${escHtml(label)}</span>
    </button>`;
}

function anketaActiveAssignCellHtml(anketaId, activeCount, totalCount) {
  if (!anketaId) return '<span class="muted">—</span>';
  const active = Number(activeCount) || 0;
  if (active < 1) return '<span class="active-assign-zero">0</span>';
  return anketaActiveAssignBtnHtml(anketaId, activeCount, totalCount);
}

async function openAnketaAssignments(anketaId) {
  try {
    const res = await api.get(`/vacancies/assignments/by-anketa/${anketaId}`);
    const { anketa, items = [], total = 0, active = 0 } = res.data;
    const faa = anketaFullName(anketa) || 'Dalaşgär';
    const num = anketa?.anketaNumber || '—';

    showModal(`
      <h3 style="margin-top:0">${tr('anketa_assignments_title', 'Dalaşgäriň hödürlenişleri')}</h3>
      <p class="muted" style="margin:0 0 12px">
        <strong>${escHtml(faa)}</strong> · № ${escHtml(num)}
        · ${tr('active_assignments', 'Aktiv hödürleniş')}: <strong>${active}</strong>
        · ${tr('total_assignments', 'Jemi hödürleniş')}: <strong>${total}</strong>
      </p>
      ${!items.length ? `<p>${tr('assigned_empty', 'Häzir hödürlenen ýok')}</p>` : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${tr('th_company', 'Firma')}</th>
              <th>${tr('th_position', 'Wezipe')}</th>
              <th>${tr('th_salary', 'Aýlyk')}</th>
              <th>${tr('th_vac_no', 'Wak. №')}</th>
              <th>${tr('th_status', 'Ýagdaý')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map((row, i) => {
      const v = row.vacancy || {};
      const st = row.status || 'Hödürlendi';
      const vacId = v.id || row.vacancyId;
      return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${escHtml(v.companyName || '—')}</td>
                  <td>${escHtml(v.position || '—')}</td>
                  <td>${escHtml(v.salary || '—')}</td>
                  <td>
                    <button type="button" class="link-faa" onclick="closeModal(); openVacancyAssignments(${vacId})">
                      №${escHtml(v.vacancyNumber || vacId)}
                    </button>
                  </td>
                  <td>${assignmentStatusSelectHtml(row.id, st)}</td>
                  <td>
                    <button class="btn btn-sm btn-pill btn-ghost" type="button"
                      onclick="closeModal(); openAssignedVacancy(${vacId})">${tr('btn_vacancy', 'Wakansiýa')}</button>
                  </td>
                </tr>`;
    }).join('')}
          </tbody>
        </table>
      </div>`}
    `, { wide: true });
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

/** Wakansiýa / şertnama pozmak — diňe admin */
function canDelete() {
  return isAdmin;
}

/** Anketa pozmak — admin ýa-da admin rugsat beren operator (session täzelenýär) */
function canDeleteAnketas() {
  if (isAdmin) return true;
  const u = (window.Auth && Auth.getUser()) || user || {};
  return Boolean(u.canDeleteAnketa);
}

/** Login-dan soň rugsat üýtgän bolsa — session täzele */
async function refreshAuthProfile() {
  try {
    const res = await api.get('/auth/profile');
    const fresh = res.data;
    if (!fresh?.id || !window.Auth?.setSession) return;
    const token = Auth.getToken();
    if (!token) return;
    Auth.setSession(token, {
      id: fresh.id,
      username: fresh.username,
      fullName: fresh.fullName,
      role: fresh.role,
      canDeleteAnketa: Boolean(fresh.canDeleteAnketa),
    });
    Object.assign(user, {
      id: fresh.id,
      username: fresh.username,
      fullName: fresh.fullName,
      role: fresh.role,
      canDeleteAnketa: Boolean(fresh.canDeleteAnketa),
    });
  } catch { /* ignore — köne session bilen dowam */ }
}

let currentDashboardTab = 'dashboard';
let dashboardHistorySilent = false;

function dashboardHistoryUrl(tab) {
  const q = new URLSearchParams();
  q.set('tab', tab || 'dashboard');
  if (tab === 'match') {
    const vac = document.getElementById('match-vacancy')?.value || pendingMatchVacancyId;
    const ank = pendingMatchAnketaId;
    if (vac) q.set('vacancyId', String(vac));
    if (ank) q.set('anketaId', String(ank));
  }
  return `/admin/dashboard.html?${q.toString()}`;
}

function writeDashboardHistory(tab, { replace = false } = {}) {
  const url = dashboardHistoryUrl(tab);
  const state = { dashTab: tab };
  try {
    if (replace) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
  } catch { /* ignore */ }
}

function switchTab(tab, el, opts = {}) {
  const adminTabs = ['fees', 'reports', 'excel', 'users', 'settings'];
  if (adminTabs.includes(tab) && !isAdmin) {
    showAlert(document.getElementById('alert-box'), tr('admin_only', 'Diňe admin girip bilýär'), 'error');
    return;
  }

  const prevTab = currentDashboardTab;
  currentDashboardTab = tab;

  document.querySelectorAll('.sidebar a').forEach((a) => a.classList.remove('active'));
  const link = el || document.querySelector(`.sidebar a[data-tab="${tab}"]`);
  if (link) link.classList.add('active');
  document.querySelectorAll('[id^="tab-"]').forEach((s) => s.classList.add('hidden'));
  const section = document.getElementById(`tab-${tab}`);
  if (section) section.classList.remove('hidden');

  if (tab === 'dashboard') loadDashboard();
  if (tab === 'anketas') loadAnketas();
  if (tab === 'vacancies') loadAdminVacancies();
  if (tab === 'match') prepareMatch();
  if (tab === 'assigned') loadAssigned();
  if (tab === 'fees') loadFeePayments();
  if (tab === 'reports') loadReport('analytics');
  if (tab === 'excel') {
    document.getElementById('excel-result').innerHTML = '';
    if (typeof initExcelPeriodSelects === 'function') initExcelPeriodSelects();
    if (typeof loadExcelExportOperators === 'function') loadExcelExportOperators();
  }
  if (tab === 'users') loadUsers();
  if (tab === 'settings') {
    loadMailSettings();
    if (window.OptionLists && isAdmin) {
      OptionLists.renderSettingsPanel(document.getElementById('option-lists-settings'));
    }
  }

  // Yza → şol tab-a gaýtsyn
  if (typeof window.EscNav?.onDashboardTab === 'function') {
    EscNav.onDashboardTab(tab);
  }

  if (!opts.skipHistory && !dashboardHistorySilent) {
    writeDashboardHistory(tab, { replace: prevTab === tab });
  }
}

window.addEventListener('popstate', () => {
  const q = new URLSearchParams(location.search);
  const tab = (history.state && history.state.dashTab) || q.get('tab') || 'dashboard';
  if (tab === 'match') {
    if (q.get('vacancyId')) pendingMatchVacancyId = q.get('vacancyId');
    if (q.get('anketaId')) pendingMatchAnketaId = q.get('anketaId');
  }
  dashboardHistorySilent = true;
  try {
    switchTab(tab, document.querySelector(`[data-tab="${tab}"]`), { skipHistory: true });
  } finally {
    dashboardHistorySilent = false;
  }
});

let pendingMatchVacancyId = null;
let pendingMatchAnketaId = null;
/** Deňeşdirme e-poçta modaly üçin (onclick JSON dırnaýyny bozmaz ýaly) */
let matchMailContext = { vacancyId: null, email: '', name: '' };
const LAST_MATCH_VACANCY_KEY = 'kerwen_last_match_vacancy';

function rememberMatchVacancy(vacancyId) {
  const id = Number(vacancyId);
  if (!id) return;
  try { sessionStorage.setItem(LAST_MATCH_VACANCY_KEY, String(id)); } catch (_) { /* ignore */ }
}

function recalledMatchVacancy() {
  try {
    const n = Number(sessionStorage.getItem(LAST_MATCH_VACANCY_KEY) || '');
    return n || null;
  } catch {
    return null;
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');
  modal.classList.remove('modal-wide');
  modal.style.display = 'none';
}

function showModal(html, options = {}) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) {
    console.error('Modal DOM ýok');
    window.alert(String(html).replace(/<[^>]+>/g, ' ').slice(0, 200));
    return;
  }
  content.innerHTML = html;
  modal.classList.toggle('modal-wide', Boolean(options.wide));
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

async function loadDashboard() {
  try {
    const [a, v] = await Promise.all([
      api.get('/anketas/stats'),
      api.get('/vacancies/stats'),
    ]);
    const stats = a.data || {};
    document.getElementById('d-total-anketa').textContent = stats.total ?? 0;
    const placedEl = document.getElementById('d-placed-by-us');
    if (placedEl) placedEl.textContent = stats.placedByUs ?? 0;
    const selfEl = document.getElementById('d-self-placed');
    if (selfEl) {
      // Öňki «Işe ýerleşenler» → indi «Özi işe ýerleşenler» (biziňkiler aýrylan)
      const self = stats.selfPlaced != null
        ? stats.selfPlaced
        : Math.max(0, Number(stats.isleyar || 0) - Number(stats.placedByUs || 0));
      selfEl.textContent = self;
    }
    document.getElementById('d-islanok').textContent = stats.islanok ?? 0;
    document.getElementById('d-acyk-vac').textContent = v.data?.acyk ?? 0;
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function statusAnketaLabel(status) {
  if (window.I18n?.anketaStatusLabel) return I18n.anketaStatusLabel(status);
  if (status === 'Isleyar') return tr('st_working', 'Işleýär');
  if (status === 'Islanok') return tr('st_not_working', 'Işlemeýär');
  return status || '—';
}

/** Anketadaky 1–4 wezipe — extraData + desiredPosition (uzyn sanawy saýla) */
function anketaPositionList(a) {
  const extra = (a?.extraData && typeof a.extraData === 'object' ? a.extraData : null)
    || (a?.extra_data && typeof a.extra_data === 'object' ? a.extra_data : {})
    || {};
  const splitRaw = (raw) => String(raw || '')
    .split(/\s*\/\s*|\r?\n+|[,;|]+|\s+we\s+|\s+hem\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const fromExtra = Array.isArray(extra.desiredPositions)
    ? extra.desiredPositions.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const fromField = splitRaw(a?.desiredPosition || a?.desired_position || '');
  const merge = (base, more) => {
    const seen = new Set(base.map((p) => p.toLowerCase()));
    more.forEach((p) => {
      const k = p.toLowerCase();
      if (!p || seen.has(k)) return;
      seen.add(k);
      base.push(p);
    });
    return base;
  };
  const parts = fromField.length >= fromExtra.length
    ? merge(fromField.slice(), fromExtra)
    : merge(fromExtra.slice(), fromField);
  return parts;
}

function formatAnketaPositionsDisplay(a) {
  const parts = anketaPositionList(a);
  return parts.length ? parts.join(' / ') : '—';
}

function positionsHtml(a) {
  const parts = anketaPositionList(a);
  if (!parts.length) return '—';
  return `<span class="pos-stack">${parts.map((p) => `<span class="pos-stack__item">${escHtml(p)}</span>`).join('')}</span>`;
}

function splitDesiredPositionParts(desiredOrAnketa) {
  const extra = desiredOrAnketa && typeof desiredOrAnketa === 'object'
    ? (desiredOrAnketa.extraData && typeof desiredOrAnketa.extraData === 'object'
      ? desiredOrAnketa.extraData : {})
    : {};
  const splitRaw = (raw) => String(raw || '')
    .split(/\s*\/\s*|\r?\n+|[,;|]+|\s+we\s+|\s+hem\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const fromExtra = Array.isArray(extra.desiredPositions)
    ? extra.desiredPositions.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const fromField = typeof desiredOrAnketa === 'object'
    ? splitRaw(desiredOrAnketa.desiredPosition)
    : splitRaw(desiredOrAnketa);
  const merge = (base, more) => {
    const seen = new Set(base.map((p) => p.toLowerCase()));
    more.forEach((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      base.push(p);
    });
    return base;
  };
  if (fromField.length >= 2) return merge(fromField.slice(), fromExtra);
  if (fromExtra.length) return merge(fromExtra.slice(), fromField);
  return fromField;
}

/** Deňeşdirme: anketaň 1-nji, 2-nji, 3-nji wezipesiniň haýsysy hem bolsa gabat gelse */
function desiredPositionFitsVacancy(desired, vacancyPos) {
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/ý/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ň/g, 'n').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set(['we', 'hem', 'ya', 'yada', 'bilen', 'ucin', 'gerek', 'talap', 'is']);
  const synonyms = [
    ['nyanka', 'nanka', 'nanya', 'nanny', 'nyanya', 'eneke'],
    ['suruji', 'sofyor', 'driver', 'voditel'],
    ['weterinar', 'veterinar', 'baytar'],
  ];
  const words = (s) => norm(s).split(' ').filter((w) => w.length >= 3 && !stop.has(w));
  const eq = (a, b) => a === b || synonyms.some((g) => g.includes(a) && g.includes(b));
  const vWords = words(vacancyPos);
  const parts = splitDesiredPositionParts(desired);
  if (!vWords.length || !parts.length) return false;
  return parts.some((part) => {
    const dWords = words(part);
    return dWords.length && vWords.every((vw) => dWords.some((dw) => eq(dw, vw)));
  });
}

function statusVacancyLabel(status) {
  if (window.I18n?.vacancyStatusLabel) return I18n.vacancyStatusLabel(status);
  if (status === 'Acyk') return tr('vac_open_short', 'Açyk');
  if (status === 'Yapyk') return tr('vac_closed_short', 'Ýapyk');
  return status || '—';
}

function reasonsHtml(reasons) {
  if (window.I18n?.reasonsText) return escHtml(I18n.reasonsText(reasons));
  return escHtml((reasons || []).join(', ') || '—');
}

function splitPhoneList(phone) {
  if (phone == null || phone === '') return [];
  let text = String(phone).trim();
  if (!text) return [];

  text = text
    .replace(/\s+we\s+/gi, ',')
    .replace(/\s+&\s+/g, ',')
    .replace(/\s+weýa\s+/gi, ',');

  const rough = text.split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
  const out = [];

  rough.forEach((chunk) => {
    const tokens = chunk.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) {
      out.push(chunk);
      return;
    }

    const digitLens = tokens.map((t) => t.replace(/\D/g, '').length);
    // Ähli bölek aýry nomer (4+ san) → her biri aýratyn setir
    if (digitLens.every((n) => n >= 4 && n <= 15)) {
      tokens.forEach((t) => out.push(t));
      return;
    }

    // Mysal: "65 711111 65 722222"
    const pairRe = /\b\d{2}\s+\d{5,8}\b/g;
    const pairs = chunk.match(pairRe);
    if (pairs && pairs.length > 1) {
      pairs.forEach((p) => out.push(p.trim()));
      return;
    }

    // Birnäçe doly nomer bir hatda
    const longs = chunk.match(/\+?\d[\d\-()]{5,}\d/g);
    if (longs && longs.length > 1) {
      longs.forEach((p) => out.push(p.trim()));
      return;
    }

    out.push(chunk.replace(/\s+/g, ' '));
  });

  return out.filter(Boolean);
}

function phoneHtml(phone) {
  const parts = splitPhoneList(phone);
  if (!parts.length) return '—';
  return `<span class="phone-stack">${parts.map((p) => {
    const tel = p.replace(/[^\d+]/g, '') || p;
    return `<span class="phone-stack__item"><a class="phone-link" href="tel:${escHtml(tel)}">${escHtml(p)}</a></span>`;
  }).join('')}</span>`;
}

const LIST_PAGE_SIZE = 50;
let anketaListPage = 1;
let vacancyListPage = 1;

function renderListPager(elId, pag, loadFnName) {
  const el = document.getElementById(elId);
  if (!el) return;
  const total = Number(pag.total) || 0;
  const page = Number(pag.page) || 1;
  const limit = Number(pag.limit) || LIST_PAGE_SIZE;
  const totalPages = Math.max(1, Number(pag.totalPages) || Math.ceil(total / limit) || 1);
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total);

  if (!total) {
    el.innerHTML = `<span class="list-pager__meta muted">${tr('empty_not_found', 'Tapylmady')}</span>`;
    return;
  }

  const prevDisabled = page <= 1 ? 'disabled' : '';
  const nextDisabled = page >= totalPages ? 'disabled' : '';
  el.innerHTML = `
    <span class="list-pager__meta">
      <strong>${from}–${to}</strong> / <strong>${total}</strong>
      <span class="muted">(${tr('page', 'sahypa')} ${page}/${totalPages})</span>
    </span>
    <div class="list-pager__btns">
      <button type="button" class="btn btn-sm btn-ghost" ${prevDisabled}
        onclick="${loadFnName}(${page - 1})">←</button>
      <button type="button" class="btn btn-sm btn-ghost" ${nextDisabled}
        onclick="${loadFnName}(${page + 1})">→</button>
    </div>
  `;
}

async function loadAnketas(page = 1) {
  anketaListPage = Math.max(1, parseInt(page, 10) || 1);
  const search = document.getElementById('anketa-search')?.value || '';
  const status = document.getElementById('anketa-status')?.value || 'Islanok';
  const gender = document.getElementById('anketa-gender')?.value || '';
  const anketaNumber = document.getElementById('anketa-filter-number')?.value || '';
  const dateFrom = document.getElementById('anketa-filter-date-from')?.value || '';
  const dateTo = document.getElementById('anketa-filter-date-to')?.value || '';
  const faa = document.getElementById('anketa-filter-faa')?.value || '';
  const desiredPosition = document.getElementById('anketa-filter-position')?.value || '';
  const phone = document.getElementById('anketa-filter-phone')?.value || '';

  const params = new URLSearchParams({
    limit: String(LIST_PAGE_SIZE),
    page: String(anketaListPage),
  });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);
  if (gender) params.set('gender', gender);
  if (anketaNumber) params.set('anketaNumber', anketaNumber);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (faa) params.set('faa', faa);
  if (desiredPosition) params.set('desiredPosition', desiredPosition);
  if (phone) params.set('phone', phone);

  try {
    const res = await api.get(`/anketas?${params}`);
    const items = res.data.items || [];
    const pag = res.data.pagination || {};
    lastAnketaItems = items;
    renderAnketaRows(items);
    renderListPager('anketa-pager', pag, 'loadAnketas');
    const wrap = document.querySelector('#tab-anketas .table-wrap');
    if (wrap) wrap.scrollTop = 0;
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function resetAnketaFilters() {
  ['anketa-search', 'anketa-filter-number', 'anketa-filter-date-from', 'anketa-filter-date-to', 'anketa-filter-faa', 'anketa-filter-position', 'anketa-filter-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#tab-anketas .tk-date-wrap').forEach((wrap) => {
    const display = wrap.querySelector('.tk-date-display');
    const hidden = wrap.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = '';
    if (display) {
      display.value = '';
      display.placeholder = wrap.dataset.placeholder || 'gg.aa.ýýýý';
    }
  });
  const st = document.getElementById('anketa-status');
  const g = document.getElementById('anketa-gender');
  if (st) st.value = 'Islanok';
  if (g) g.value = '';
  anketaListPage = 1;
  loadAnketas(1);
}

let lastAnketaListIds = [];
let lastAnketaItems = [];
let lastVacancyItems = [];
const smartTableSort = {
  anketas: { key: null, dir: 'asc' },
  vacancies: { key: null, dir: 'asc' },
};

function smartSortValue(item, key, kind) {
  if (kind === 'anketas') {
    if (key === 'faa') {
      return [item.familyName, item.firstName, item.patronymic].filter(Boolean).join(' ').toLowerCase();
    }
    if (key === 'anketaNumber') {
      const n = parseInt(String(item.anketaNumber || '').replace(/\D/g, ''), 10);
      return Number.isNaN(n) ? String(item.anketaNumber || '') : n;
    }
    return item[key] ?? '';
  }
  if (key === 'assigned') {
    return item.assignedCandidateName || item.assignmentStatus || '';
  }
  if (key === 'vacancyNumber') {
    const n = Number(item.vacancyNumber);
    return Number.isNaN(n) ? 0 : n;
  }
  return item[key] ?? '';
}

function sortSmartItems(items, kind) {
  const st = smartTableSort[kind];
  if (!st?.key) return items.slice();
  const dir = st.dir === 'desc' ? -1 : 1;
  return items.slice().sort((a, b) => {
    const va = smartSortValue(a, st.key, kind);
    const vb = smartSortValue(b, st.key, kind);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'tk', { sensitivity: 'base', numeric: true }) * dir;
  });
}

function updateSmartSortHeaders(tableId, kind) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const st = smartTableSort[kind];
  table.querySelectorAll('th.sortable').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (st.key && th.dataset.sort === st.key) {
      th.classList.add(st.dir === 'desc' ? 'sort-desc' : 'sort-asc');
    }
  });
}

function bindSmartTables() {
  document.querySelectorAll('table.smart-table').forEach((table) => {
    if (table.dataset.sortBound === '1') return;
    table.dataset.sortBound = '1';
    const kind = table.dataset.smartTable;
    table.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (!key) return;
        const st = smartTableSort[kind] || { key: null, dir: 'asc' };
        if (st.key === key) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else {
          st.key = key;
          st.dir = 'asc';
        }
        smartTableSort[kind] = st;
        if (kind === 'anketas') renderAnketaRows(lastAnketaItems);
        if (kind === 'vacancies') {
          document.getElementById('vacancy-tbody').innerHTML = vacancyTableHtml(sortSmartItems(lastVacancyItems, 'vacancies'));
          updateSmartSortHeaders('vacancy-table', 'vacancies');
        }
      });
    });
  });
}

function renderAnketaRows(items) {
  const sorted = sortSmartItems(items, 'anketas');
  lastAnketaListIds = sorted.map((a) => a.id).filter(Boolean);
  const idsJs = JSON.stringify(lastAnketaListIds);
  const tbody = document.getElementById('anketa-tbody');
  if (!tbody) return;
  tbody.innerHTML = sorted.map((a) => {
    const faaName = [a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ') || '-';
    return `
      <tr>
        <td>
          <button type="button" class="link-faa" onclick='openAnketaPage(${a.id}, ${idsJs})' title="${escHtml(tr('open_anketa', 'Anketany aç'))}">
            <strong>${escHtml(a.anketaNumber || '—')}</strong>
          </button>
          ${a.extraData?.scanUrl ? '<span class="badge" style="margin-left:6px;background:#fef3c7;color:#92400e" title="Eski skan JPG">Skan</span>' : ''}
        </td>
        <td>${formatDate(a.formDate)}</td>
        <td>
          <button type="button" class="link-faa" onclick='openAnketaPage(${a.id}, ${idsJs})' title="${escHtml(tr('open_anketa', 'Anketany aç'))}">
            ${escHtml(faaName)}
          </button>
        </td>
        <td class="anketa-pos-cell" title="${escHtml(formatAnketaPositionsDisplay(a))}">${positionsHtml(a)}</td>
        <td>${phoneHtml(a.phone)}</td>
        <td><span class="badge ${a.status === 'Isleyar' ? 'badge-success' : 'badge-warning'}">${statusAnketaLabel(a.status)}</span></td>
        <td class="muted" title="${escHtml(a.statusChangedAt || a.employmentDate || '')}">${a.statusChangedAt
        ? formatDateTime(a.statusChangedAt)
        : (a.employmentDate ? formatDate(a.employmentDate) : '—')
      }</td>
        <td class="col-actions">
          <div class="actions-cell actions-cell--compact">
            <button type="button" class="act-btn act-btn--accent" onclick="matchAnketa(${a.id})" title="${escHtml(tr('btn_vacancy', 'Wakansiýa'))}">Wakansiýa</button>
            <a class="act-btn act-btn--soft" href="/admin/anketa-new.html?id=${a.id}&return=dashboard" title="${escHtml(tr('btn_edit', 'Üýtget'))}">Üýtget</a>
            <button type="button" class="act-btn act-btn--print" onclick="printAnketa(${a.id})" title="${escHtml(tr('btn_anketa_only_print', 'Anketa çap'))}">Çap</button>
            <button type="button" class="act-btn ${a.status === 'Isleyar' ? 'act-btn--ok' : 'act-btn--warn'}" onclick="toggleAnketa(${a.id}, '${escHtml(a.status || 'Islanok')}')" title="${escHtml(a.status === 'Isleyar' ? tr('btn_open', 'Aç') : tr('btn_close', 'Ýap'))}">${a.status === 'Isleyar' ? tr('btn_open', 'Aç') : tr('btn_close', 'Ýap')}</button>
            <button type="button" class="act-btn act-btn--note" onclick="printContractOnly(${a.id})" title="${escHtml(tr('btn_contract_print', 'Şertnama çap'))}">Şertnama</button>
            ${canDeleteAnketas() ? `<button type="button" class="act-btn act-btn--danger" onclick="deleteAnketa(${a.id})" title="${escHtml(tr('btn_delete', 'Poz'))}">Poz</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty-hint">${tr('empty_not_found', 'Tapylmady. Filtrleri üýtgediň ýa-da arassalaň.')}</div></td></tr>`;
  updateSmartSortHeaders('anketa-table', 'anketas');
}

function openAnketaPage(id, ids, vacancyId) {
  const list = Array.isArray(ids) && ids.length
    ? ids.map(Number).filter(Boolean)
    : (lastAnketaListIds || []).map(Number).filter(Boolean);
  const q = new URLSearchParams();
  q.set('id', String(id));
  if (list.length) q.set('ids', [...new Set(list)].join(','));

  const vacFromMatch = matchMailContext?.vacancyId || pendingMatchVacancyId
    || document.getElementById('match-vacancy')?.value
    || recalledMatchVacancy();
  const explicitVacId = Number(vacancyId) || 0;
  const vacId = explicitVacId || Number(vacFromMatch) || null;
  const onMatch = document.getElementById('tab-match')
    && !document.getElementById('tab-match').classList.contains('hidden');
  const onAssigned = document.getElementById('tab-assigned')
    && !document.getElementById('tab-assigned').classList.contains('hidden');
  const onVacancies = document.getElementById('tab-vacancies')
    && !document.getElementById('tab-vacancies').classList.contains('hidden');

  // Anketa içinden hem hödürläp bolar ýaly
  if (vacId) q.set('vacancyId', String(vacId));

  // Deňeşdirme / hödürlenenler — programma formaty (bazadan №), skan däl
  if (onMatch || onAssigned || explicitVacId > 0) {
    q.set('view', 'form');
  }

  // Yza → şol wezipäniň deňeşdirme / dalaşgär sanawy / hödürlenenler
  if (vacId && (onMatch || onAssigned)) {
    rememberMatchVacancy(vacId);
    q.set('return', `/admin/dashboard.html?tab=match&vacancyId=${vacId}`);
  } else if (onAssigned) {
    q.set('return', buildAssignedReturnUrl());
  } else if (onMatch && vacFromMatch) {
    rememberMatchVacancy(vacFromMatch);
    q.set('return', `/admin/dashboard.html?tab=match&vacancyId=${vacFromMatch}`);
  } else if (explicitVacId > 0 && (onVacancies || !onMatch)) {
    // Wakansiýa → hödürlenenler sanawyndan açyldy: yza gaýdanda şol sanaw açylsyn
    q.set('return', `/admin/dashboard.html?tab=vacancies&openAssignments=${explicitVacId}`);
  } else {
    const tabEl = document.querySelector('.sidebar a.active[data-tab], [data-tab].active');
    const tab = tabEl?.getAttribute('data-tab') || 'anketas';
    q.set('return', `/admin/dashboard.html?tab=${encodeURIComponent(tab)}`);
  }
  window.location.href = `/admin/anketa-view.html?${q.toString()}`;
}

async function viewAnketa(id) {
  openAnketaPage(id);
}

function printAnketa(id) {
  const ret = encodeURIComponent(`/admin/anketa-view.html?id=${id}`);
  window.open(`/anketa-print.html?id=${id}&view=form&return=${ret}`, '_blank');
}

// Biziň ýerleşdiren — täze şertnama barlagy (frontend üçin)
function normalizeTmText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlacedByUsReasonUI(closedReason) {
  const n = normalizeTmText(closedReason);
  return n.includes('bizin yerlesdiren');
}

async function ensureContract__old(anketaId) {
  return ensureContract(anketaId, {});
}

function openContractPrint(contractId, anketaId) {
  const params = new URLSearchParams({ id: String(contractId) });
  if (anketaId) {
    params.set('anketaId', String(anketaId));
    params.set('return', `/admin/anketa-view.html?id=${anketaId}`);
  } else {
    params.set('return', '/admin/dashboard.html');
  }
  window.open(`/admin/contract-print.html?${params}`, '_blank');
}

/** Anketa + şertnama bir penjirede, yzygiderli çap */
function openAnketaPacketPrint(anketaId, contractId) {
  const params = new URLSearchParams({
    anketaId: String(anketaId),
    view: 'form',
    return: `/admin/anketa-view.html?id=${anketaId}`,
  });
  if (contractId) params.set('contractId', String(contractId));
  window.open(`/admin/anketa-packet-print.html?${params}`, '_blank');
}

/** Diňe şertnama çap — passport anketadan alynýar, şertnamada görkezilýär */
async function printContractOnly__old(anketaId) {
  return printContractOnly(anketaId, false);
}

async function ensureContract(anketaId, opts = {}) {
  const { forceNew = false } = opts || {};
  const res = await api.post(`/contracts/from-anketa/${anketaId}`, { forceNew });
  return res.data;
}

async function printContractOnly(anketaId, forceNew = false) {
  try {
    const aRes = await api.get(`/anketas/${anketaId}`);
    const a = aRes.data;
    if (!a?.anketaNumber) {
      showAlert(document.getElementById('alert-box'), 'Anketa belgesi (№) ýok — çap edip bolmaz', 'error');
      return;
    }

    const needPassport = !String(a.passportNumber || '').trim();
    if (needPassport) {
      showModal(`
        <h3 style="margin-top:0">Şertnama çap — pasport</h3>
        <p class="muted" style="margin:0 0 12px">
          Pasport anketadan alynýar we şertnamada (Word rekwizitleri ýaly) görkezilýär.
        </p>
        <div class="form-group">
          <label>Pasport № *</label>
          <input type="text" id="print-passport-number" placeholder="Mysal: I-AŞ 123456" required>
        </div>
        <div class="form-group">
          <label>Berilen ýeri we senesi</label>
          <input type="text" id="print-passport-issued" placeholder="Mysal: Aşgabat ş., 12.03.2018 ý.">
        </div>
        <button class="btn btn-accent" type="button" onclick="savePassportAndPrintContract(${anketaId}, ${forceNew ? 'true' : 'false'})">
          Ýatda sakla we çap et
        </button>
      `);
      return;
    }

    const contract = await ensureContract(anketaId, { forceNew });
    openContractPrint(contract.id, anketaId);
    const label = forceNew ? 'Täze şert' : 'Şertnama';
    showAlert(document.getElementById('alert-box'), `${label} № ${contract.contractNumber || ''} taýýar`, 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function savePassportAndPrintContract(anketaId, forceNew = false) {
  const passportNumber = document.getElementById('print-passport-number')?.value?.trim() || '';
  const passportIssued = document.getElementById('print-passport-issued')?.value?.trim() || '';
  if (!passportNumber) {
    showAlert(document.getElementById('alert-box'), 'Pasport № ýazyp beriň', 'error');
    return;
  }
  try {
    await api.put(`/anketas/${anketaId}`, { passportNumber, passportIssued });
    closeModal();
    const contract = await ensureContract(anketaId, { forceNew });
    openContractPrint(contract.id, anketaId);
    const label = forceNew ? 'Täze şert' : 'Şertnama';
    showAlert(document.getElementById('alert-box'), `Pasport ýazdy we ${label} çap edildi`, 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

/** Anketa + şertnama bile taýýar / çap */
async function printAnketaPacket(anketaId) {
  try {
    const aRes = await api.get(`/anketas/${anketaId}`);
    const a = aRes.data;
    if (!a?.anketaNumber) {
      showAlert(document.getElementById('alert-box'), 'Anketa belgesi (№) ýok — çap edip bolmaz', 'error');
      return;
    }

    if (!String(a.passportNumber || '').trim()) {
      showModal(`
        <h3 style="margin-top:0">Anketa + şertnama çap — pasport</h3>
        <p class="muted" style="margin:0 0 12px">
          Pasport anketadan alynýar we şertnamada (Word rekwizitleri ýaly) görkezilýär.
        </p>
        <div class="form-group">
          <label>Pasport № *</label>
          <input type="text" id="print-passport-number" placeholder="Mysal: I-AŞ 123456" required>
        </div>
        <div class="form-group">
          <label>Berilen ýeri we senesi</label>
          <input type="text" id="print-passport-issued" placeholder="Mysal: Aşgabat ş., 12.03.2018 ý.">
        </div>
        <button class="btn btn-accent" type="button" onclick="savePassportAndPrintPacket(${anketaId})">
          Ýatda sakla we çap et
        </button>
      `);
      return;
    }

    const contract = await ensureContract(anketaId);
    openAnketaPacketPrint(anketaId, contract.id);
    showAlert(document.getElementById('alert-box'), `Anketa № ${a.anketaNumber} we şertnama taýýar (bile çap)`, 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function savePassportAndPrintPacket(anketaId) {
  const passportNumber = document.getElementById('print-passport-number')?.value?.trim() || '';
  const passportIssued = document.getElementById('print-passport-issued')?.value?.trim() || '';
  if (!passportNumber) {
    showAlert(document.getElementById('alert-box'), 'Pasport № ýazyp beriň', 'error');
    return;
  }
  try {
    await api.put(`/anketas/${anketaId}`, { passportNumber, passportIssued });
    closeModal();
    const contract = await ensureContract(anketaId);
    openAnketaPacketPrint(anketaId, contract.id);
    showAlert(document.getElementById('alert-box'), 'Pasport ýazdy — anketa we şertnama bile çap', 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function createContract(anketaId) {
  return printContractOnly(anketaId);
}

/** Wakansiýadaky ýaly: ýapyk (Isleyar) → Aç, açyk (Islanok) → Ýap */
async function toggleAnketa(id, currentStatus) {
  if (currentStatus === 'Isleyar') {
    try {
      await api.put(`/anketas/${id}`, { status: 'Islanok', closedReason: null, employmentDate: null });
      loadAnketas();
      if (typeof loadDashboard === 'function') loadDashboard();
      showAlert(document.getElementById('alert-box'), tr('anketa_opened', 'Anketa açyldy (iş gözleýär)'), 'success');
    } catch (e) {
      showAlert(document.getElementById('alert-box'), e.message, 'error');
    }
    return;
  }
  openCloseAnketa(id, currentStatus || 'Islanok');
}

async function openCloseAnketa(id, currentStatus) {
  showModal(`
    <h3>${tr('close_anketa_title', 'Anketany ýap / ýagdaý üýtget')}</h3>
    <p style="margin:8px 0 16px;color:var(--muted)">${tr('close_anketa_hint', 'Admin we operator ikisem üýtgedip bilýär')}</p>
    <div class="form-group">
      <label>${tr('label_status', 'Ýagdaý')}</label>
      <select id="status-update" data-option-list="anketa_statuses" data-option-title="Anketa ýagdaýy (Işleýär / Işlemeýär)">
        <option value="Islanok" ${currentStatus === 'Islanok' ? 'selected' : ''}>${tr('opt_islanok', 'Islanok (iş gözleýär / açyk)')}</option>
        <option value="Isleyar" ${currentStatus === 'Isleyar' ? 'selected' : ''}>${tr('opt_isleyar', 'Isleyar (işe ýerleşdi / ýapyk)')}</option>
      </select>
      <small class="muted">${tr('status_time_auto', 'Ýagdaý üýtgedilende wagt awtomatik bellenýär. Ýapylandan soň «Işleýär» filtrinde ýene Açyp bilersiňiz.')}</small>
    </div>
    <div class="toolbar" style="margin:0 0 14px;gap:8px">
      <button class="btn btn-accent" type="button" onclick="updateAnketaStatus(${id})">${tr('btn_save', 'Ýatda sakla')}</button>
    </div>
    <div id="anketa-status-comments"></div>
  `);
  if (window.OptionLists?.refreshSelectsForKey) {
    OptionLists.refreshSelectsForKey('anketa_statuses').then(() => {
      const sel = document.getElementById('status-update');
      if (sel && currentStatus) sel.value = currentStatus;
      if (isAdmin && sel) OptionLists.mountButton(sel, 'anketa_statuses', 'Anketa ýagdaýy (Işleýär / Işlemeýär)');
    }).catch(() => { });
  }
  if (window.CommentsUI) {
    CommentsUI.mountComments(document.getElementById('anketa-status-comments'), 'anketa', id, { compact: true });
  }
}

async function updateAnketaStatus(id) {
  const status = document.getElementById('status-update').value;
  try {
    const payload = { status };
    if (status === 'Isleyar') payload.closedReason = 'Özi işe ýerleşenler';
    else {
      payload.closedReason = null;
      payload.employmentDate = null;
    }
    await api.put(`/anketas/${id}`, payload);
    closeModal();
    // Ýapylandan soň sanawda ýene görüň / açyp bilmek üçin «Ähli» ýa-da şol ýagdaý
    const stFilter = document.getElementById('anketa-status');
    if (stFilter && status === 'Isleyar' && stFilter.value === 'Islanok') {
      stFilter.value = 'Isleyar';
    } else if (stFilter && status === 'Islanok' && stFilter.value === 'Isleyar') {
      stFilter.value = 'Islanok';
    }
    loadAnketas();
    if (typeof loadDashboard === 'function') loadDashboard();
    const msg = status === 'Isleyar'
      ? tr('anketa_closed', 'Anketa ýapyldy (işleýär)')
      : tr('anketa_opened', 'Anketa açyldy (iş gözleýär)');
    showAlert(document.getElementById('alert-box'), msg, 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function deleteAnketa(id) {
  if (!canDeleteAnketas()) return;
  if (!confirm(tr('confirm_delete_anketa', 'Anketany pozmak isleýärsiňizmi?'))) return;
  await api.delete(`/anketas/${id}`);
  loadAnketas();
  showAlert(document.getElementById('alert-box'), tr('anketa_deleted', 'Anketa pozuldy'), 'success');
}

function openNewVacancyPage() {
  window.location.href = '/admin/vacancy-new.html?return=vacancies';
}

function toggleVacancyCreate() {
  openNewVacancyPage();
}

function openNewAnketaPage() {
  window.location.href = '/admin/anketa-new.html?return=anketas';
}

function toggleAnketaCreate() {
  openNewAnketaPage();
}

window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'anketa-created') return;
  loadAnketas();
  showAlert(document.getElementById('alert-box'), `Anketa goşuldy: № ${event.data.anketaNumber || ''}`, 'success');
});


function myForumOperatorName() {
  return String(user.fullName || user.username || '').trim();
}

function forumOperatorOptionLabel(u) {
  return String(u.fullName || u.username || '').trim();
}

async function loadVacancyForumOperatorFilter() {
  const select = document.getElementById('vacancy-filter-operator');
  if (!select) return;
  const prev = select.value;
  try {
    const res = await api.get('/auth/staff');
    const staff = (res.data || []).filter((u) => u.role === 'operator');
    const seen = new Set();
    const options = [];

    // Admin — ähli operatorlar; operator — diňe özüni görýär
    if (isAdmin) {
      options.push(`<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`);
    }

    staff.forEach((u) => {
      if (!isAdmin && user?.id && Number(u.id) !== Number(user.id)) return;
      const name = String(u.fullName || u.username || '').trim();
      if (!name || seen.has(`id:${u.id}`)) return;
      seen.add(`id:${u.id}`);
      seen.add(name.toLowerCase());
      options.push(`<option value="u:${u.id}">${escHtml(forumOperatorOptionLabel(u))}</option>`);
    });

    if (isAdmin) {
      try {
        const byOp = await api.get('/vacancies/by-operator');
        (byOp.data || []).forEach((row) => {
          const name = String(row.forumOperator || '').trim();
          if (!name || name === 'Bellenmedik') return;
          if (seen.has(name.toLowerCase())) return;
          if (row.acceptedByUserId && seen.has(`id:${row.acceptedByUserId}`)) return;
          seen.add(name.toLowerCase());
          options.push(`<option value="n:${escHtml(name)}">${escHtml(name)}</option>`);
        });
      } catch (_) { /* ignore */ }
    } else if (user?.id && !seen.has(`id:${user.id}`)) {
      const mine = myForumOperatorName();
      if (mine) options.push(`<option value="u:${user.id}">${escHtml(mine)}</option>`);
    }

    select.innerHTML = options.join('') || `<option value="u:${user?.id || ''}">${escHtml(myForumOperatorName() || 'Men')}</option>`;
    if (!isAdmin) {
      select.disabled = true;
      select.title = tr('own_vacancies_only', 'Diňe öz wakansiýalaryňyz');
    } else {
      select.disabled = false;
      select.title = '';
    }
    if (prev && isAdmin && [...select.options].some((o) => o.value === prev)) {
      select.value = prev;
    } else {
      applyDefaultVacancyOperatorFilter();
    }
  } catch (e) {
    const mine = myForumOperatorName();
    if (!isAdmin && mine && user.id) {
      select.innerHTML = `<option value="u:${user.id}">${escHtml(mine)}</option>`;
      select.disabled = true;
    } else {
      select.innerHTML = `<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`;
      select.disabled = false;
    }
    applyDefaultVacancyOperatorFilter();
  }
}

function applyDefaultVacancyOperatorFilter() {
  const el = document.getElementById('vacancy-filter-operator');
  if (!el) return;
  if (isAdmin) {
    el.value = '';
    return;
  }
  if (user?.id && [...el.options].some((o) => o.value === `u:${user.id}`)) {
    el.value = `u:${user.id}`;
    return;
  }
  const mine = myForumOperatorName();
  if (!mine) {
    el.value = '';
    return;
  }
  const opt = [...el.options].find((o) =>
    o.value === `n:${mine}` || o.value === mine || o.textContent.trim().toLowerCase() === mine.toLowerCase());
  el.value = opt ? opt.value : '';
}

function openVacancyPage(id) {
  const q = new URLSearchParams();
  q.set('id', String(id));
  const tabEl = document.querySelector('.sidebar a.active[data-tab], [data-tab].active');
  const tab = tabEl?.getAttribute('data-tab') || 'vacancies';
  const onMatch = tab === 'match'
    || (document.getElementById('tab-match')
      && !document.getElementById('tab-match').classList.contains('hidden'));
  if (onMatch) {
    const vac = document.getElementById('match-vacancy')?.value || recalledMatchVacancy();
    if (vac) {
      rememberMatchVacancy(vac);
      q.set('return', `/admin/dashboard.html?tab=match&vacancyId=${vac}`);
    } else {
      q.set('return', '/admin/dashboard.html?tab=match');
    }
  } else {
    q.set('return', `/admin/dashboard.html?tab=${encodeURIComponent(tab === 'dashboard' ? 'vacancies' : tab)}`);
  }
  // Şol tabda aç — target=_blank sessionStorage token geçirmeýär → login
  window.location.href = `/admin/vacancy-view.html?${q.toString()}`;
}

function vacancyTableRowHtml(v) {
  return `
      <tr>
        <td class="vac-cell-nowrap"><button type="button" class="link-faa" onclick="openVacancyPage(${v.id})">№ ${escHtml(v.vacancyNumber)}</button></td>
        <td class="vac-cell-nowrap">${formatDate(v.vacancyDate) || '—'}</td>
        <td>${v.companyName
      ? `<a href="#" class="link-faa" title="Firmanyň wakansiýalary"
               onclick='event.preventDefault(); openCompanyVacancies(${JSON.stringify(v.companyName)})'>${escHtml(v.companyName)}</a>`
      : '-'}</td>
        <td><button type="button" class="link-faa" onclick="openVacancyPage(${v.id})">${escHtml(v.position || '-')}</button></td>
        <td class="vac-cell-nowrap">${escHtml(v.salary || '-')}</td>
        <td class="vac-cell-nowrap"><span class="badge ${v.status === 'Acyk' ? 'badge-success' : 'badge-danger'}">${statusVacancyLabel(v.status)}</span></td>
        <td class="vac-cell-nowrap vac-cell-assign">${Number(v.assignmentCount) > 0
      ? `<button type="button" class="assign-count-btn assign-count-btn--vac" onclick="openVacancyAssignments(${v.id})" title="${escHtml(tr('th_assigned', 'Hödürlenen'))}">
               <span class="assign-count-num">${Number(v.assignmentCount)}</span>
             </button>`
      : '<span class="muted vac-assign-zero">0</span>'}</td>
        <td>${formatForumOperatorCell(v)}</td>
        <td>${formatJogapkarCell(v)}</td>
        <td class="col-actions">
          <div class="actions-cell actions-cell--compact">
            <button type="button" class="act-btn act-btn--accent" onclick="closeModal(); matchVacancy(${v.id})" title="${escHtml(tr('dash_find_cand', 'Dalaşgär tap'))}">Dalaşgär</button>
            <a class="act-btn act-btn--soft" href="/admin/vacancy-new.html?id=${v.id}&return=dashboard" title="${escHtml(tr('btn_edit', 'Üýtget'))}">Üýtget</a>
            <button type="button" class="act-btn act-btn--note" onclick="openEntityComments('vacancy', ${v.id})" title="${escHtml(tr('comments_title', 'Komentariýalar'))}">Bellik</button>
            <button type="button" class="act-btn ${v.status === 'Acyk' ? 'act-btn--warn' : 'act-btn--ok'}" onclick="toggleVacancy(${v.id}, '${v.status}')" title="${escHtml(v.status === 'Acyk' ? tr('btn_close', 'Ýap') : tr('btn_open', 'Aç'))}">${v.status === 'Acyk' ? tr('btn_close', 'Ýap') : tr('btn_open', 'Aç')}</button>
            ${canDelete() ? `<button type="button" class="act-btn act-btn--danger" onclick="deleteVacancy(${v.id})" title="${escHtml(tr('btn_delete', 'Poz'))}">Poz</button>` : ''}
          </div>
        </td>
      </tr>`;
}

function vacancyTableHtml(items, emptyMsg) {
  if (!items?.length) {
    return `<tr><td colspan="10"><div class="empty-hint">${emptyMsg || tr('empty_not_found', 'Tapylmady. Filtrleri üýtgediň ýa-da arassalaň.')}</div></td></tr>`;
  }
  return items.map(vacancyTableRowHtml).join('');
}

function vacancyTableFullHtml(items, emptyMsg) {
  return `
    <div class="table-wrap company-vac-table-wrap">
      <table class="company-vac-table vacancy-list-table">
        <thead>
          <tr>
            <th>${tr('th_no', '№')}</th>
            <th>${tr('th_date', 'Sene')}</th>
            <th>${tr('th_company', 'Kärhana')}</th>
            <th>${tr('th_position', 'Wezipe')}</th>
            <th>${tr('th_salary_short', 'Haky')}</th>
            <th>${tr('th_status', 'Ýagdaý')}</th>
            <th>${tr('th_assigned', 'Hödürlenen')}</th>
            <th>${tr('th_forum_op', 'Forum operator')}</th>
            <th>${tr('th_contact_firm', 'Jogapkär (firma wekili)')}</th>
            <th class="col-actions">${tr('th_actions', 'Hereket')}</th>
          </tr>
        </thead>
        <tbody>
          ${vacancyTableHtml(items, emptyMsg)}
        </tbody>
      </table>
    </div>`;
}

async function loadAdminVacancies(page = 1) {
  vacancyListPage = Math.max(1, parseInt(page, 10) || 1);
  const search = document.getElementById('vacancy-search')?.value || '';
  const status = document.getElementById('vacancy-status')?.value || '';
  const closeReason = document.getElementById('vacancy-close-reason-filter')?.value || '';
  const hasAssignments = document.getElementById('vacancy-assigned-filter')?.value || '';
  const vacancyNumber = document.getElementById('vacancy-filter-number')?.value || '';
  const companyName = document.getElementById('vacancy-filter-company')?.value || '';
  const position = document.getElementById('vacancy-filter-position')?.value || '';
  const salary = document.getElementById('vacancy-filter-salary')?.value || '';
  const forumOperatorRaw = document.getElementById('vacancy-filter-operator')?.value || '';
  const contactName = document.getElementById('vacancy-filter-contact')?.value || '';
  const maritalStatus = document.getElementById('vacancy-filter-marital')?.value || '';

  const params = new URLSearchParams({
    limit: String(LIST_PAGE_SIZE),
    page: String(vacancyListPage),
  });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (closeReason) params.set('closeReason', closeReason);
  if (hasAssignments !== '') params.set('hasAssignments', hasAssignments);
  if (vacancyNumber) params.set('vacancyNumber', vacancyNumber);
  if (companyName) params.set('companyName', companyName);
  if (position) params.set('position', position);
  if (salary) params.set('salary', salary);
  if (forumOperatorRaw.startsWith('u:')) {
    params.set('acceptedByUserId', forumOperatorRaw.slice(2));
  } else if (forumOperatorRaw.startsWith('n:')) {
    params.set('forumOperator', forumOperatorRaw.slice(2));
  } else if (forumOperatorRaw) {
    params.set('forumOperator', forumOperatorRaw);
  }
  if (contactName) params.set('contactName', contactName);
  if (maritalStatus) params.set('maritalStatus', maritalStatus);

  try {
    const res = await api.get(`/vacancies?${params}`);
    lastVacancyItems = res.data.items || [];
    const pag = res.data.pagination || {};
    document.getElementById('vacancy-tbody').innerHTML = vacancyTableHtml(sortSmartItems(lastVacancyItems, 'vacancies'));
    updateSmartSortHeaders('vacancy-table', 'vacancies');
    renderListPager('vacancy-pager', pag, 'loadAdminVacancies');
    const wrap = document.querySelector('#tab-vacancies .table-wrap');
    if (wrap) wrap.scrollTop = 0;
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function resetVacancyFilters() {
  ['vacancy-filter-number', 'vacancy-filter-company', 'vacancy-filter-position', 'vacancy-filter-salary'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const st = document.getElementById('vacancy-status');
  if (st) st.value = 'Acyk';
  const marital = document.getElementById('vacancy-filter-marital');
  if (marital) marital.value = '';
  applyDefaultVacancyOperatorFilter();
  vacancyListPage = 1;
  loadAdminVacancies(1);
}

const DEFAULT_VACANCY_CLOSE_REASONS = [
  'Bizden alyndy',
  'Bizden alynmady',
  'Indi saýlanmaly',
  'Bile işleşmek islemediler',
];

let vacancyCloseReasonsCache = null;

function normalizeVacancyCloseReasonsCache(data) {
  // Diňe standart + admin Goşmak — API-däki items/custom hapasy (köne serwer) selecte düşmez
  const defaults = [...DEFAULT_VACANCY_CLOSE_REASONS];
  const defaultsLower = new Set(defaults.map((d) => d.toLowerCase()));
  const customRaw = Array.isArray(data?.custom) ? data.custom : [];
  // Köne serwer DB-den uzyn tekstleri custom-a salýardy — diňe gysga status ýaly goşmalary al
  const custom = customRaw
    .map((x) => String(x || '').trim().replace(/\s+/g, ' '))
    .filter((x) => {
      if (x.length < 2 || x.length > 60) return false;
      if (defaultsLower.has(x.toLowerCase())) return false;
      // Erkin ýazylan teswirler (nokat, köp söz) däl — status ýaly gysga
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
  return { defaults, custom, items };
}

async function loadVacancyCloseReasons(force = false) {
  if (!force && vacancyCloseReasonsCache?.items?.length) return vacancyCloseReasonsCache;
  try {
    const res = await api.get('/vacancies/close-reasons');
    vacancyCloseReasonsCache = normalizeVacancyCloseReasonsCache(res.data);
  } catch {
    vacancyCloseReasonsCache = normalizeVacancyCloseReasonsCache(null);
  }
  // Hökmany: iň azyndan 4 standart
  if (!vacancyCloseReasonsCache.items?.length) {
    vacancyCloseReasonsCache = normalizeVacancyCloseReasonsCache(null);
  }
  return vacancyCloseReasonsCache;
}

function closeReasonOptionsHtml(selected = '', { includeEmpty = false, emptyLabel = '-' } = {}) {
  const items = (vacancyCloseReasonsCache?.items?.length
    ? vacancyCloseReasonsCache.items
    : DEFAULT_VACANCY_CLOSE_REASONS).slice();
  const opts = [];
  if (includeEmpty) {
    opts.push(`<option value="">${escHtml(emptyLabel)}</option>`);
  }
  items.forEach((reason) => {
    const sel = reason === selected ? ' selected' : '';
    opts.push(`<option value="${escHtml(reason)}"${sel}>${escHtml(reason)}</option>`);
  });
  return opts.join('');
}

async function refreshVacancyCloseReasonFilter() {
  const sel = document.getElementById('vacancy-close-reason-filter');
  if (!sel) return;
  const prev = sel.value;
  await loadVacancyCloseReasons(true);
  sel.innerHTML = `
    <option value="">${tr('all_reasons', 'Ähli sebäp')}</option>
    ${closeReasonOptionsHtml(prev)}
  `;
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

async function addVacancyCloseReasonFromUi(selectId) {
  if (!isAdmin) {
    showAlert(document.getElementById('alert-box'), tr('admin_only_add', 'Diňe admin goşup bilýär'), 'error');
    return;
  }
  if (window.OptionLists) {
    OptionLists.showEditorModal('vacancy_close_reasons', 'Wakansiýa ýapylma sebäpleri');
    return;
  }
  const raw = window.prompt(tr('add_close_reason_prompt', 'Täze ýapylma sebäbini ýazyň:'));
  if (raw == null) return;
  const reason = String(raw).trim();
  if (reason.length < 2) {
    showAlert(document.getElementById('alert-box'), tr('reason_too_short', 'Sebäp gaty gysga'), 'error');
    return;
  }
  try {
    const res = await api.post('/vacancies/close-reasons', { reason });
    vacancyCloseReasonsCache = normalizeVacancyCloseReasonsCache(res.data);
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = closeReasonOptionsHtml(res.data.added || reason);
      select.value = res.data.added || reason;
    }
    await refreshVacancyCloseReasonFilter();
    showAlert(
      document.getElementById('alert-box'),
      res.data.alreadyExists
        ? tr('reason_exists', 'Bu sebäp eýýäm bar')
        : tr('reason_added', 'Sebäp goşuldy'),
      res.data.alreadyExists ? 'error' : 'success',
    );
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function toggleVacancy(id, currentStatus) {
  if (currentStatus === 'Acyk') {
    await loadVacancyCloseReasons(true);
    const addBtn = isAdmin
      ? `<button type="button" class="btn btn-sm btn-ghost" onclick="addVacancyCloseReasonFromUi('vacancy-close-reason')">${tr('btn_edit_list', 'Düzediş')}</button>`
      : '';
    showModal(`
      <h3>${tr('close_vacancy_title', 'Wakansiýany ýap')}</h3>
      <p style="margin:8px 0 16px;color:var(--muted)">${tr('close_anketa_hint', 'Admin we operator ikisem ýapyp bilýär')}</p>
      <div class="form-group">
        <label>${tr('close_reason', 'Ýapylmagynyň sebäbi *')}</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="vacancy-close-reason" data-option-list="vacancy_close_reasons" required style="flex:1;min-width:180px">
            ${closeReasonOptionsHtml('Bizden alyndy')}
          </select>
          ${addBtn}
        </div>
        ${isAdmin ? `<small class="muted">${tr('edit_list_admin_hint', 'Sanawy diňe admin düzetip / goşup bilýär')}</small>` : ''}
      </div>
      <button class="btn btn-accent" onclick="confirmCloseVacancy(${id})">${tr('btn_close', 'Ýap')}</button>
    `);
    return;
  }
  try {
    await api.put(`/vacancies/${id}`, { status: 'Acyk', closeReason: null });
    loadAdminVacancies();
    showAlert(document.getElementById('alert-box'), tr('vacancy_opened', 'Wakansiýa açyldy'), 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function confirmCloseVacancy(id) {
  const closeReason = document.getElementById('vacancy-close-reason')?.value || 'Bizden alyndy';
  try {
    await api.put(`/vacancies/${id}`, { status: 'Yapyk', closeReason });
    closeModal();
    loadAdminVacancies();
    showAlert(document.getElementById('alert-box'), tr('vacancy_closed', 'Wakansiýa ýapyldy'), 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openCompanyVacancies(companyName) {
  if (!companyName) return;
  try {
    const params = new URLSearchParams({
      companyName,
      limit: 200,
    });
    const res = await api.get(`/vacancies?${params}`);
    const items = res.data.items || [];
    const total = res.data.pagination?.total ?? items.length;
    const acyk = items.filter((v) => v.status === 'Acyk').length;
    const yapyk = items.filter((v) => v.status === 'Yapyk').length;

    showModal(`
      <div class="company-vac-head">
        <h3>${escHtml(companyName)}</h3>
        <div class="company-vac-stats">
          <span><b>${total}</b> jemi</span>
          <span class="ok"><b>${acyk}</b> açyk</span>
          <span class="off"><b>${yapyk}</b> ýapyk</span>
        </div>
      </div>
      ${vacancyTableFullHtml(items, tr('empty_vacancy', 'Wakansiýa ýok'))}
    `, { wide: true });
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function deleteVacancy(id) {
  if (!canDelete()) return;
  if (!confirm(tr('confirm_delete_vacancy', 'Wakansiýany pozmak isleýärsiňizmi?'))) return;
  try {
    await api.delete(`/vacancies/${id}`);
    loadAdminVacancies();
    showAlert(document.getElementById('alert-box'), tr('vacancy_deleted', 'Wakansiýa pozuldy'), 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function prepareMatch() {
  syncMatchStatusToggleBtn();
  const res = await api.get('/vacancies?status=Acyk&limit=5000');
  const select = document.getElementById('match-vacancy');
  if (!select) return;

  const anketaIdPending = pendingMatchAnketaId;
  matchSearchMode = anketaIdPending ? 'anketa' : 'vacancy';
  syncMatchModeUi();
  if (matchSearchMode === 'anketa') {
    currentMatchAnketaId = anketaIdPending;
    currentMatchVacancyId = null;
  }
  const items = res.data.items || [];
  const vacOptionsHtml = items.map((v) => {
    const d = formatDate(v.vacancyDate);
    const datePart = d ? ` · ${d}` : '';
    return `<option value="${v.id}">№${v.vacancyNumber}${datePart} — ${v.position} (${v.companyName || ''})</option>`;
  }).join('') || `<option value="">${tr('match_vac_none', 'Açyk wakansiýa ýok')}</option>`;

  // Eger biz anketa boýunça wakansiýa gözleýän bolsak — ýokarky saýlawyň
  // özbaşdak 1-nji wakansiýany saýlap durmagyny islemeýäris.
  select.innerHTML = anketaIdPending
    ? `<option value=""> </option>${vacOptionsHtml}`
    : vacOptionsHtml;

  // Operator üçin: diňe öz wakansiýalary (API eýýäm süzýär). Admin — ählisi, bellik ýok.
  if (!isAdmin) {
    let hint = document.getElementById('match-op-own-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'match-op-own-hint';
      hint.className = 'muted';
      hint.style.cssText = 'margin:0 0 8px;font-size:0.85rem';
      hint.textContent = tr('match_own_vacancies', 'Diňe siziň wakansiýalaryňyz (anketalar — ählisi)');
      select.parentElement?.insertBefore(hint, select);
    }
  } else {
    document.getElementById('match-op-own-hint')?.remove();
  }

  if (!select.dataset.bound) {
    select.addEventListener('change', async () => {
      if (select.value) await loadMatchForVacancy(select.value);
      else {
        hideMatchVacancyCard();
        const box = document.getElementById('match-results');
        if (box) box.innerHTML = '';
      }
    });
    select.dataset.bound = '1';
  }

  const id = pendingMatchVacancyId || recalledMatchVacancy() || select.value;
  pendingMatchVacancyId = null;
  const anketaId = pendingMatchAnketaId;
  pendingMatchAnketaId = null;

  if (anketaId) {
    await loadMatchForAnketa(anketaId);
    return;
  }

  if (id) {
    if (![...select.options].some((o) => o.value === String(id))) {
      const opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = `Wakansiýa #${id}`;
      select.appendChild(opt);
    }
    select.value = String(id);
  }

  if (select.value) {
    await loadMatchForVacancy(select.value);
  } else {
    hideMatchVacancyCard();
    const box = document.getElementById('match-results');
    if (box) box.innerHTML = '';
  }
}

function hideMatchVacancyCard() {
  const card = document.getElementById('match-vacancy-card');
  if (!card) return;
  card.classList.add('hidden');
  card.innerHTML = '';
}

function escHtml(v) {
  if (v == null || v === '') return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function anketaFullName(a) {
  if (!a) return '';
  return [a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ');
}

/** Hökman anketa № bilen görkez */
function formatAnketaRef(a, fallbackName = '') {
  const num = a?.anketaNumber;
  const name = anketaFullName(a) || fallbackName || '—';
  if (!num) return name;
  return `№ ${num} — ${name}`;
}

function requireAnketaNumber(a) {
  if (!a?.anketaNumber) {
    throw new Error('Anketa belgesi (№) ýok — bu hereketi edip bolmaz');
  }
  return a.anketaNumber;
}

function formatForumOperatorCell(v, compact = false) {
  const u = v.acceptedBy;
  const name = u?.fullName || u?.username || v.forumOperator || '—';
  if (compact) {
    return `<span class="vac-cell-clip" title="${escHtml(name)}">${escHtml(name)}</span>`;
  }
  return escHtml(name);
}

function cleanContactName(name, phone, email) {
  let n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n) return '';

  // Telefon / email adyň içinde bolsa — aýyr (aýratyn görkezilýär)
  if (phone) {
    const telDigits = String(phone).replace(/\D/g, '');
    if (telDigits.length >= 6) {
      n = n.replace(new RegExp(String(phone).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
      n = n.replace(new RegExp(telDigits.split('').join('\\D*'), 'g'), ' ');
    }
  }
  if (email) {
    n = n.replace(new RegExp(String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  n = n.replace(/[,;/|]+/g, ' ').replace(/\s+/g, ' ').trim();

  // «Myrat Myrat» ýa-da «Myrat Berdiýew Myrat Berdiýew»
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const a = parts.slice(0, half).join(' ');
    const b = parts.slice(half).join(' ');
    if (a.toLowerCase() === b.toLowerCase()) n = a;
  }
  // Yzygiderli şol bir söz
  const uniq = [];
  parts.forEach((p) => {
    if (!uniq.length || uniq[uniq.length - 1].toLowerCase() !== p.toLowerCase()) uniq.push(p);
  });
  if (uniq.join(' ').length < n.length && uniq.length) {
    const doubled = uniq.concat(uniq).join(' ');
    if (doubled.toLowerCase() === n.toLowerCase()) n = uniq.join(' ');
  }

  return n.trim();
}

function formatJogapkarCell(v, compact = false) {
  const phone = v.contactPhone || '';
  const email = v.contactEmail || '';
  const rawName = String(v.contactName || '').trim();
  const nameLines = rawName
    ? rawName.split(/\r?\n+/).map((part) => cleanContactName(part.trim(), phone, email) || part.trim()).filter(Boolean)
    : [];

  if (compact) {
    const parts = [];
    if (nameLines[0]) parts.push(nameLines[0]);
    const phoneParts = phone ? splitPhoneList(phone) : [];
    if (phoneParts[0]) parts.push(phoneParts[0]);
    const title = [nameLines.join(' · '), phone, email].filter(Boolean).join(' · ');
    if (!parts.length) return '—';
    return `<span class="vac-cell-clip" title="${escHtml(title)}">${escHtml(parts.join(' · '))}</span>`;
  }

  // Ýzly-yzyna: at/bölüm → nomer → mail (her biri aýratyn setir)
  const lines = [];
  nameLines.forEach((line, i) => {
    const cls = i === 0 ? 'jogapkar-name' : 'jogapkar-dept';
    lines.push(`<div class="jogapkar-line ${cls}">${escHtml(line)}</div>`);
  });
  if (phone) {
    const parts = splitPhoneList(phone);
    parts.forEach((p) => {
      const tel = p.replace(/[^\d+]/g, '') || p;
      lines.push(`<div class="jogapkar-line jogapkar-phone"><a class="phone-link" href="tel:${escHtml(tel)}">${escHtml(p)}</a></div>`);
    });
    if (!parts.length) {
      lines.push(`<div class="jogapkar-line jogapkar-phone">${escHtml(phone)}</div>`);
    }
  }
  if (email) {
    const mailParts = String(email).split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
    mailParts.forEach((m) => {
      lines.push(`<div class="jogapkar-line jogapkar-mail"><a class="mail-link" href="mailto:${escHtml(m)}">${escHtml(m)}</a></div>`);
    });
    if (!mailParts.length) {
      lines.push(`<div class="jogapkar-line jogapkar-mail">${escHtml(email)}</div>`);
    }
  }
  if (!lines.length) return '—';
  return `<div class="jogapkar-stack">${lines.join('')}</div>`;
}

function vacancyField(label, value) {
  if (value == null || value === '' || value === '-') return '';
  return `<div class="vac-field"><dt>${label}</dt><dd>${escHtml(value)}</dd></div>`;
}

function renderVacancyCallCard(v) {
  const chip = (label, value) => {
    if (value == null || value === '' || value === '-') return '';
    return `<span class="vac-chip"><b>${label}</b> ${escHtml(value)}</span>`;
  };
  const contact = formatJogapkarCell(v);
  const contactChip = contact && contact !== '—'
    ? `<span class="vac-chip vac-chip-btn vac-chip-contact"><b>Jogapkär</b> ${contact}</span>`
    : '';
  const assign = Number(v.assignmentCount) > 0
    ? `<button type="button" class="vac-chip vac-chip-btn" onclick="openVacancyAssignments(${v.id})"><b>Hödür</b> ${Number(v.assignmentCount)}</button>`
    : '';

  return `
    <div class="vac-call-compact">
      <div class="vac-chips">
        ${chip('Sene', formatDate(v.vacancyDate))}
        ${chip('Firma', v.companyName)}
        ${chip('Wezipe', v.position)}
        ${v.salary ? `<span class="vac-chip vac-chip-salary"><b>Aýlyk</b> ${escHtml(v.salary)}</span>` : ''}
        ${chip('Ýer', v.location)}
        ${contactChip}
        ${assign}
      </div>
    </div>
  `;
}

async function showMatchVacancyCard(vacancyId) {
  const card = document.getElementById('match-vacancy-card');
  if (!card || !vacancyId) return;
  card.classList.remove('hidden');
  card.innerHTML = '<p class="muted">Wakansiýa ýüklenýär...</p>';
  try {
    const res = await api.get(`/vacancies/${vacancyId}`);
    card.innerHTML = renderVacancyCallCard(res.data);
  } catch (e) {
    card.innerHTML = `<p class="muted">Wakansiýa maglumaty: ${escHtml(e.message)}</p>`;
  }
}

let matchSearchMode = 'vacancy'; // 'vacancy' | 'anketa'
let currentMatchVacancyId = null;
let currentMatchAnketaId = null;
/** false = diňe Işlemeýänler (Islanok); true = Ählisi */
let matchShowAllStatuses = false;
/** false = diňe Açyk wakansiýalar; true = Açyk + Ýapyk */
let matchShowAllVacancies = false;

function syncMatchModeUi() {
  const anketaSwitch = document.getElementById('match-anketa-status-switch')
    || document.querySelector('.match-status-switch');
  const vacSwitch = document.getElementById('match-vacancy-status-switch');
  if (anketaSwitch) anketaSwitch.classList.toggle('hidden', matchSearchMode !== 'vacancy');
  if (vacSwitch) vacSwitch.classList.toggle('hidden', matchSearchMode !== 'anketa');
  syncMatchStatusToggleBtn();
  syncMatchVacancyToggleBtn();
}

function syncMatchStatusToggleBtn() {
  const idleBtn = document.getElementById('btn-match-status-idle');
  const allBtn = document.getElementById('btn-match-status-all');
  if (idleBtn) {
    idleBtn.classList.toggle('is-active', !matchShowAllStatuses);
    idleBtn.setAttribute('aria-pressed', matchShowAllStatuses ? 'false' : 'true');
  }
  if (allBtn) {
    allBtn.classList.toggle('is-active', matchShowAllStatuses);
    allBtn.setAttribute('aria-pressed', matchShowAllStatuses ? 'true' : 'false');
  }
}

function syncMatchVacancyToggleBtn() {
  const openBtn = document.getElementById('btn-match-vac-open');
  const allBtn = document.getElementById('btn-match-vac-all');
  if (openBtn) {
    openBtn.classList.toggle('is-active', !matchShowAllVacancies);
    openBtn.setAttribute('aria-pressed', matchShowAllVacancies ? 'false' : 'true');
  }
  if (allBtn) {
    allBtn.classList.toggle('is-active', matchShowAllVacancies);
    allBtn.setAttribute('aria-pressed', matchShowAllVacancies ? 'true' : 'false');
  }
}

function setMatchStatusFilter(showAll) {
  const next = Boolean(showAll);
  if (matchShowAllStatuses === next) return;
  matchShowAllStatuses = next;
  syncMatchStatusToggleBtn();
  if (matchSearchMode !== 'vacancy') return;
  const vacancyId = document.getElementById('match-vacancy')?.value;
  if (vacancyId) loadMatchForVacancy(vacancyId);
}

function setMatchVacancyFilter(showAll) {
  const next = Boolean(showAll);
  if (matchShowAllVacancies === next) return;
  matchShowAllVacancies = next;
  syncMatchVacancyToggleBtn();
  if (matchSearchMode !== 'anketa') return;
  if (currentMatchAnketaId) loadMatchForAnketa(currentMatchAnketaId);
}

async function runMatch() {
  if (matchSearchMode === 'vacancy') {
    const vacancyId = document.getElementById('match-vacancy')?.value;
    if (!vacancyId) return;
    await loadMatchForVacancy(vacancyId);
    return;
  }

  if (matchSearchMode === 'anketa') {
    if (!currentMatchAnketaId) return;
    await loadMatchForAnketa(currentMatchAnketaId);
  }
}

async function matchVacancy(vacancyId) {
  matchSearchMode = 'vacancy';
  currentMatchVacancyId = vacancyId;
  currentMatchAnketaId = null;
  syncMatchModeUi();

  pendingMatchVacancyId = vacancyId;
  const matchTab = document.getElementById('tab-match');
  const alreadyOpen = matchTab && !matchTab.classList.contains('hidden');
  if (alreadyOpen) {
    const select = document.getElementById('match-vacancy');
    if (select) {
      if (![...select.options].some((o) => o.value === String(vacancyId))) {
        const opt = document.createElement('option');
        opt.value = vacancyId;
        opt.textContent = `Wakansiýa #${vacancyId}`;
        select.appendChild(opt);
      }
      select.value = String(vacancyId);
    }
    pendingMatchVacancyId = null;
    await loadMatchForVacancy(vacancyId);
    return;
  }
  switchTab('match', document.querySelector('[data-tab="match"]'));
}

async function loadMatchForVacancy(vacancyId) {
  matchSearchMode = 'vacancy';
  currentMatchVacancyId = vacancyId;
  currentMatchAnketaId = null;
  syncMatchModeUi();

  const select = document.getElementById('match-vacancy');
  if (select) select.value = String(vacancyId);
  rememberMatchVacancy(vacancyId);

  const box = document.getElementById('match-results');
  if (box) box.innerHTML = `<p class="muted">${tr('match_searching', 'Dalaşgärler gözlenýär...')}</p>`;

  // Kart we netije bir wagtda — has tiz
  const cardPromise = showMatchVacancyCard(vacancyId);

  try {
    const statusQ = matchShowAllStatuses ? 'all' : 'Islanok';
    const res = await api.get(`/match/vacancy/${vacancyId}?minScore=15&status=${encodeURIComponent(statusQ)}&limit=500`);
    await cardPromise;
    const { vacancy, matches: rawMatches, totalMatched } = res.data;
    const vacPos = String(vacancy?.position || '').trim();
    const matches = rawMatches || [];
    const totalFound = Number(totalMatched) || matches.length;

    if (!matches.length) {
      const emptyHint = matchShowAllStatuses
        ? tr('match_none', 'Bu wezipe boýunça gabat gelýän anketa ýok.')
        : tr('match_none_idle', 'Işlemeýän gabat gelýän anketa ýok. «Ählisi» basyp işleýänleri hem görüň.');
      box.innerHTML = `<p>${emptyHint}${vacPos ? ` <strong>(${escHtml(vacPos)})</strong>` : ''}</p>`;
      return;
    }

    let assignCounts = {};
    try {
      const ids = matches.map((m) => m.anketa.id).filter(Boolean);
      if (ids.length) {
        const cRes = await api.get(`/vacancies/assignments/anketa-counts?ids=${ids.join(',')}`);
        assignCounts = cRes.data || {};
      }
    } catch { /* optional */ }

    matchMailContext = {
      vacancyId: vacancy.id,
      email: (() => {
        const extra = vacancy.extraData && typeof vacancy.extraData === 'object' ? vacancy.extraData : {};
        const fromExtra = String(extra.email || '').split(/[,;/|\n]+/).map((s) => s.trim()).filter((e) => e.includes('@'));
        const fromContact = String(vacancy.contactEmail || '').split(/[,;/|\n]+/).map((s) => s.trim()).filter((e) => e.includes('@'));
        const fromList = Array.isArray(extra.contactEmails)
          ? extra.contactEmails.map((s) => String(s || '').trim()).filter((e) => e.includes('@'))
          : [];
        return fromContact[0] || fromExtra[0] || fromList[0] || '';
      })(),
      name: String(vacancy.contactName || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean)[0] || '',
      company: String(vacancy.companyName || '').trim(),
      position: String(vacancy.position || '').trim(),
    };

    const matchIds = matches.map((m) => m.anketa.id).filter(Boolean);
    lastAnketaListIds = matchIds.slice();
    const idsJs = JSON.stringify(matchIds);

    box.innerHTML = `
      <div class="match-results-sticky">
        <div class="match-results-head">
          <span class="match-results-count">${totalFound > matches.length
              ? `${matches.length} / ${totalFound}`
              : matches.length} ${tr('match_candidates', 'dalaşgär')}
            <span class="match-filter-pill ${matchShowAllStatuses ? 'is-all' : ''}">${escHtml(matchShowAllStatuses
              ? tr('match_filter_all', 'Ähli ýagdaý')
              : tr('match_filter_idle', 'Diňe işlemeýänler'))}</span>
          </span>
          <div class="match-mail-actions">
            ${isAdmin ? `<button type="button" class="btn btn-sm btn-ghost"
              onclick="OptionLists && OptionLists.open('assignment_statuses','Hödürleme ýagdaýlary')"
              title="${escHtml(tr('btn_edit_list', 'Düzediş'))}">${tr('btn_edit_list', 'Düzediş')}</button>` : ''}
            <label class="match-select-all">
              <input type="checkbox" id="match-select-all" onchange="toggleMatchSelectAll(this.checked)">
              ${tr('match_select_all', 'Ählisini saýla')}
            </label>
            <button type="button" class="btn btn-sm btn-accent"
              id="btn-send-candidates-mail"
              title="${escHtml(tr('match_send_email', 'E-poçta ugrat'))}">
              ${tr('match_send_email', 'E-poçta ugrat')}
            </button>
          </div>
        </div>
        <p class="match-mail-hint muted">${tr('match_email_hint', 'Saýlaň → alyjy ýazyň → Ugrat (kakajan / kompaniýa poçtasyndan)')}</p>
      </div>
      <div class="match-table-scroll">
      <div class="table-wrap match-table-wrap">
        <table class="match-candidates-table">
          <thead>
            <tr>
              <th></th>
              <th>${tr('th_score', '%')}</th>
              <th>${tr('th_anketa_no', 'Anketa №')}</th>
              <th>${tr('th_candidate', 'Dalaşgär')}</th>
              <th>${tr('th_status', 'Ýagdaý')}</th>
              <th>${tr('th_position', 'Wezipe')}</th>
              <th>${tr('th_phone', 'Telefon')}</th>
              <th>${tr('th_why', 'Näme üçin')}</th>
              <th>${tr('th_offer', 'Hödürleniş')}</th>
              <th class="col-actions">${tr('th_actions', 'Hereket')}</th>
            </tr>
          </thead>
          <tbody>
            ${matches.map((m) => {
      const faa = anketaFullName(m.anketa);
      const num = m.anketa.anketaNumber || '—';
      const st = m.anketa.status || '';
      const stCls = st === 'Isleyar' ? 'badge-success' : 'badge-warning';
      const c = assignCounts[m.anketa.id] || { active: 0, total: 0 };
      const why = window.I18n?.reasonsText
        ? I18n.reasonsText(m.reasons)
        : ((m.reasons || []).join(', ') || '—');
      return `
              <tr class="${st === 'Isleyar' ? 'match-row--working' : ''}">
                <td>
                  <input type="checkbox" class="match-anketa-cb" value="${m.anketa.id}"
                    data-score="${Number(m.score) || 0}"
                    data-num="${escHtml(String(num))}"
                    data-name="${escHtml(faa)}">
                </td>
                <td class="match-score"><strong>${m.score}%</strong></td>
                <td><button type="button" class="link-faa" onclick='openAnketaPage(${m.anketa.id}, ${idsJs}, ${vacancy.id})'><strong>№ ${escHtml(num)}</strong></button></td>
                <td class="match-name">
                  <button type="button" class="link-faa" onclick='openAnketaPage(${m.anketa.id}, ${idsJs}, ${vacancy.id})'>${escHtml(faa)}</button>
                </td>
                <td><span class="badge ${stCls}">${escHtml(statusAnketaLabel(st))}</span></td>
                <td class="match-pos">${escHtml(formatAnketaPositionsDisplay(m.anketa))}</td>
                <td class="match-phone">${phoneHtml(m.anketa.phone)}</td>
                <td class="match-why" title="${escHtml(why)}">${escHtml(why)}</td>
                <td class="td-active-assign">${anketaActiveAssignCellHtml(m.anketa.id, c.active, c.total)}</td>
                <td>
                  <button class="btn btn-sm btn-success" onclick="assignMatch(${vacancy.id}, ${m.anketa.id})" title="${escHtml(tr('btn_offer', 'Hödürle'))}">${tr('btn_offer', 'Hödürle')}</button>
                </td>
              </tr>`;
    }).join('')}
          </tbody>
        </table>
      </div>
      </div>
    `;
    bindMatchResultsScroll(box);
    bindMatchMailButton(box);
    syncMatchStatusToggleBtn();
  } catch (e) {
    await cardPromise.catch(() => null);
    if (box) box.innerHTML = `<p class="muted">${tr('match_error', 'Ýalňyşlyk')}: ${escHtml(e.message)}</p>`;
  }
}

function bindMatchMailButton(box) {
  const btn = box?.querySelector('#btn-send-candidates-mail');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      openMatchEmailModal();
    } catch (err) {
      console.error(err);
      showAlert(document.getElementById('alert-box'), err.message || 'E-poçta açylmady', 'error');
    }
  });
}

/** Tablisa aýratyn scroll — başlyk (.match-results-sticky) ýokarda galýar */
function bindMatchResultsScroll(box) {
  if (!box) return;
  box.onscroll = null;
}

function toggleMatchSelectAll(checked) {
  document.querySelectorAll('.match-anketa-cb').forEach((cb) => {
    cb.checked = Boolean(checked);
  });
}

function getSelectedMatchAnketas() {
  const ids = [];
  const scores = {};
  const rows = [];
  document.querySelectorAll('.match-anketa-cb:checked').forEach((cb) => {
    const id = Number(cb.value);
    if (!id) return;
    ids.push(id);
    scores[id] = Number(cb.dataset.score) || 0;
    rows.push({
      id,
      score: scores[id],
      num: String(cb.dataset.num || '').trim() || String(id),
      name: String(cb.dataset.name || '').trim() || ('#' + id),
    });
  });
  return { ids, scores, rows };
}

function buildMatchGmailUrl({ to, subject, body }) {
  const q = new URLSearchParams();
  q.set('view', 'cm');
  q.set('fs', '1');
  q.set('tf', '1');
  if (to) q.set('to', String(to).trim());
  if (subject) q.set('su', String(subject).trim().slice(0, 200));
  if (body) q.set('body', String(body).trim().slice(0, 900));
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** Popup-blocker-siz Gmail açmak */
function openGmailComposeTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openMatchEmailModal(vacancyId, defaultEmail = '', contactName = '') {
  const ctxId = Number(vacancyId) || Number(matchMailContext.vacancyId);
  const emailPrefill = String(defaultEmail || matchMailContext.email || '').trim();
  const alertBox = document.getElementById('alert-box');

  if (!ctxId) {
    const msg = tr('match_error', 'Ilki wakansiýa saýlaň (Deňeşdirme)');
    if (typeof showAlert === 'function') showAlert(alertBox, msg, 'error');
    else window.alert(msg);
    return;
  }

  const { ids, rows } = getSelectedMatchAnketas();
  if (!ids.length) {
    const msg = tr('match_pick_one', 'Ilki anketalary saýlaň');
    if (typeof showAlert === 'function') showAlert(alertBox, msg, 'error');
    else window.alert(msg);
    return;
  }

  const names = rows.map((r) => `№ ${r.num} ${r.name}`).join(', ');

  showModal(`
    <h3 style="margin:0 0 6px">${escHtml(tr('match_send_email', 'E-poçta ugrat'))}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:13px">
      <strong>${rows.length}</strong> ${escHtml(tr('match_candidates', 'anketa'))} (JPG surat) —
      ${escHtml(names.length > 90 ? `${names.slice(0, 87)}…` : names)}
    </p>
    <p id="match-mail-status" class="muted" style="margin:0 0 10px;font-size:12px"></p>

    <div id="match-mail-setup" class="hidden" style="margin:0 0 12px;padding:12px;border:1px solid #e6e0d4;border-radius:12px;background:#fffcf7">
      <p id="match-mail-setup-hint" style="margin:0 0 8px;font-size:13px;line-height:1.4"></p>
      <div class="form-group" style="margin-bottom:8px">
        <label for="match-gmail-user">${escHtml(tr('match_gmail_user', 'Ugradýan Gmail'))}</label>
        <input type="email" id="match-gmail-user" placeholder="siz@gmail.com"
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid #d8d2c6">
      </div>
      <div id="match-mail-pass-wrap" class="form-group" style="margin-bottom:0">
        <label for="match-gmail-pass">${escHtml(tr('match_gmail_pass', 'App Password'))}</label>
        <input type="password" id="match-gmail-pass" placeholder="saklanan / 16 harp"
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid #d8d2c6">
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label for="match-mail-to">${escHtml(tr('match_email_to', 'Alyjy e-poçta'))}</label>
      <input type="text" id="match-mail-to" autocomplete="email" inputmode="email" placeholder="mysal@firma.com"
        value="${escHtml(emailPrefill)}"
        style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #d8d2c6;font-size:15px"
        onkeydown="if(event.key==='Enter'){event.preventDefault();confirmSendMatchEmail(${ctxId});}">
    </div>
    <div class="toolbar" style="justify-content:flex-end;gap:8px;margin:0">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">${escHtml(tr('btn_cancel', 'Ýatyr'))}</button>
      <button type="button" class="btn btn-accent" id="btn-match-mail-send"
        onclick="confirmSendMatchEmail(${ctxId})" style="min-width:140px">
        ${escHtml(tr('match_send_btn', 'Ugrat'))}
      </button>
    </div>
  `);

  setTimeout(() => {
    document.getElementById('match-mail-to')?.focus();
  }, 40);

  refreshMatchMailStatus();
}

async function fetchMailStatus() {
  try {
    return (await api.get('/mail/status')).data || {};
  } catch (e) {
    if (e.status === 404) {
      return (await api.get('/vacancies/mail-status')).data || {};
    }
    throw e;
  }
}

async function refreshMatchMailStatus() {
  const el = document.getElementById('match-mail-status');
  const setup = document.getElementById('match-mail-setup');
  const hint = document.getElementById('match-mail-setup-hint');
  const passWrap = document.getElementById('match-mail-pass-wrap');
  try {
    const st = await fetchMailStatus();
    if (!el) return;

    if (st.enabled || st.ready) {
      el.style.color = '#1a7f4b';
      el.textContent = tr('match_smtp_ok', `Taýýar · ${st.user || 'Gmail'} — diňe alyjy ýazyň we Ugrat`);
      if (setup) setup.classList.add('hidden');
      return;
    }

    el.style.color = '#9b3d3d';
    el.textContent = tr(
      'match_smtp_admin_only',
      'Poçta taýýar däl — Admin: Sazlamalar → Poçta (Gmail + App Password). Gmail-e harp goşmaň.',
    );
    if (setup) setup.classList.add('hidden');
    if (hint) {
      hint.textContent = tr(
        'mail_admin_only_hint',
        'Operatorlar Gmail üýtgetmeli däl — kompaniýa poçtasy adminde saklanýar.',
      );
    }
    if (passWrap) passWrap.classList.add('hidden');
  } catch (e) {
    if (el) {
      el.style.color = '#9b3d3d';
      el.textContent = e.message || 'Poçta ýagdaýy alynmady';
    }
    if (setup) setup.classList.add('hidden');
  }
}

async function confirmSendMatchEmail(vacancyId) {
  const { ids, rows, scores } = getSelectedMatchAnketas();
  if (!ids.length) {
    showAlert(document.getElementById('alert-box'), tr('match_pick_one', 'Ilki anketalary saýlaň'), 'error');
    closeModal();
    return;
  }

  const to = String(document.getElementById('match-mail-to')?.value || '').trim();
  if (!to || !to.includes('@')) {
    showAlert(document.getElementById('alert-box'), tr('match_email_required', 'Alyjy e-poçtany ýazyň'), 'error');
    document.getElementById('match-mail-to')?.focus();
    return;
  }

  const sendBtn = document.getElementById('btn-match-mail-send');
  const listBtn = document.getElementById('btn-send-candidates-mail');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = tr('match_sending', 'Ugradylýar...');
  }
  if (listBtn) {
    listBtn.disabled = true;
    listBtn.textContent = tr('match_sending', 'Ugradylýar...');
  }

  try {
    let st = {};
    try {
      st = await fetchMailStatus();
    } catch (e) {
      if (e.status === 404 || /tapylmady|not found/i.test(String(e.message || ''))) {
        showAlert(
          document.getElementById('alert-box'),
          'E-poçta API tapylmady — Main PC-de serweri täzeden başladyň. Gmail adresine harp goşmaň/aýyrmaň.',
          'error',
        );
        return;
      }
      throw e;
    }

    if (!(st.enabled || st.ready)) {
      showAlert(
        document.getElementById('alert-box'),
        tr('mail_need_admin', 'Poçta taýýar däl. Admin: Sazlamalar → Poçta saklaň.'),
        'error',
      );
      return;
    }

    const res = await api.post(`/vacancies/${vacancyId}/send-candidates`, {
      anketaIds: ids,
      scores,
      to,
      note: '',
    }, { timeoutMs: 300000 });
    const d = res.data || {};
    closeModal();
    const assignedN = Number(d.assignedCount || 0);
    const mailMsg = `${d.count || rows.length} ${tr('match_email_sent', 'anketa JPG surat bilen ugradyldy')} → ${d.contactEmail || to}`;
    const assignMsg = assignedN
      ? ` · ${assignedN} ${tr('match_auto_assigned', 'awtomatik hödürlendi')}`
      : '';
    showAlert(
      document.getElementById('alert-box'),
      mailMsg + assignMsg,
      'success',
    );
    if (typeof loadAssigned === 'function'
      && document.getElementById('tab-assigned')
      && !document.getElementById('tab-assigned').classList.contains('hidden')) {
      loadAssigned();
    }
    if (typeof loadAdminVacancies === 'function'
      && document.getElementById('tab-vacancies')
      && !document.getElementById('tab-vacancies').classList.contains('hidden')) {
      loadAdminVacancies();
    }
    // Match sanawyny täzele (aktiv hödürleniş)
    if (typeof loadMatchForVacancy === 'function' && vacancyId) {
      try { await loadMatchForVacancy(vacancyId); } catch { /* ignore */ }
    }
  } catch (e) {
    const msg = String(e.message || 'Ugradylmady');
    const tip = /tapylmady|not found|404/i.test(msg)
      ? `${msg} — Main PC serwer restart + Ctrl+F5 (Gmail-e harp goşmaň)`
      : msg;
    showAlert(document.getElementById('alert-box'), tip, 'error');
    await refreshMatchMailStatus();
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = tr('match_send_btn', 'Ugrat');
    }
    if (listBtn) {
      listBtn.disabled = false;
      listBtn.textContent = tr('match_send_email', 'E-poçta ugrat');
    }
  }
}

async function loadMailSettings() {
  if (!isAdmin) return;
  const statusEl = document.getElementById('mail-settings-status');
  const userEl = document.getElementById('mail-settings-user');
  try {
    const st = await fetchMailStatus();
    if (userEl && !userEl.value) userEl.value = st.user || st.defaultUser || '';
    if (statusEl) {
      if (st.enabled || st.ready) {
        statusEl.style.color = '#1a7f4b';
        statusEl.textContent = tr('mail_settings_ok', `Birikdirilen: ${st.user || st.from || 'Gmail'}`);
      } else {
        statusEl.style.color = '#9b3d3d';
        statusEl.textContent = st.hint || tr('mail_settings_need', 'Heniz birikdirilmedi — Gmail we App Password ýazyň');
      }
    }
  } catch (e) {
    if (statusEl) {
      statusEl.style.color = '#9b3d3d';
      statusEl.textContent = e.message || 'Ýalňyşlyk';
    }
  }
}

async function saveCompanyMailSettings() {
  if (!isAdmin) return;
  const email = String(document.getElementById('mail-settings-user')?.value || '').trim();
  const password = String(document.getElementById('mail-settings-pass')?.value || '').trim();
  const btn = document.getElementById('btn-mail-settings-save');
  const statusEl = document.getElementById('mail-settings-status');
  if (!email.includes('@') || password.replace(/\s+/g, '').length !== 16) {
    showAlert(document.getElementById('alert-box'), tr('match_gmail_login_need', 'Gmail we App Password (16 harp) ýazyň — harp goşmaň/aýyrmaň'), 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = tr('match_sending', 'Synag...'); }
  try {
    try {
      await api.post('/mail/login', { email, password });
    } catch (e) {
      if (e.status === 404) await api.post('/vacancies/mail-login', { email, password });
      else throw e;
    }
    const passEl = document.getElementById('mail-settings-pass');
    if (passEl) passEl.value = '';
    showAlert(document.getElementById('alert-box'), tr('mail_settings_saved', 'Kompaniýa poçtasy taýýar — indi ähli operatorlar Ugrat bilen faýl ugradyp bilýär'), 'success');
    await loadMailSettings();
  } catch (e) {
    if (statusEl) { statusEl.style.color = '#9b3d3d'; statusEl.textContent = e.message; }
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = tr('mail_settings_save', 'Sakla we synag et');
    }
  }
}

async function clearCompanyMailSettings() {
  if (!isAdmin) return;
  try {
    try {
      await api.post('/mail/logout');
    } catch (e) {
      if (e.status === 404) await api.post('/vacancies/mail-logout');
      else throw e;
    }
    showAlert(document.getElementById('alert-box'), tr('mail_settings_cleared', 'Kompaniýa poçtasy aýryldy'), 'success');
    const passEl = document.getElementById('mail-settings-pass');
    if (passEl) passEl.value = '';
    await loadMailSettings();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function submitGmailMailLogin() {
  return saveCompanyMailSettings();
}

async function logoutMatchMailAccount() {
  return clearCompanyMailSettings();
}

function openMatchGmailDraft(vacancyId) {
  const { rows } = getSelectedMatchAnketas();
  if (!rows.length) {
    showAlert(document.getElementById('alert-box'), tr('match_pick_one', 'Ilki anketalary saýlaň'), 'error');
    return;
  }
  const to = String(document.getElementById('match-mail-to')?.value || '').trim();
  const note = String(document.getElementById('match-mail-note')?.value || '').trim();
  const company = matchMailContext.company || '';
  const position = matchMailContext.position || '';
  const contact = matchMailContext.name || '';
  const subject = `Anketalar: ${position || 'wezipe'} — ${company || 'HR'} (${rows.length})`;
  const lines = [
    contact ? `Hormatly ${contact},` : 'Hormatly alyjy,',
    '',
    `${company || '—'} / ${position || '—'} üçin saýlanan anketalar:`,
    '',
    ...rows.map((r, i) => `${i + 1}. № ${r.num} — ${r.name}`),
  ];
  if (note) lines.push('', `Bellik: ${note}`);
  openGmailComposeTab(buildMatchGmailUrl({ to, subject, body: lines.join('\n') }));
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'anketa.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function downloadSelectedComposeFiles(vacancyId, files) {
  const token = (window.Auth && Auth.getToken()) || '';
  const list = Array.isArray(files) ? files : [];
  for (const f of list) {
    const anketaId = f.anketaId || f.id;
    if (!anketaId) continue;
    const res = await fetch(`/api/vacancies/${vacancyId}/compose-file/${anketaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let msg = 'Anketa faýly ýüklenmedi';
      try {
        const data = await res.json();
        msg = data.message || msg;
      } catch { /* */ }
      throw new Error(msg);
    }
    downloadBlobFile(await res.blob(), f.filename || `Anketa-${anketaId}.jpg`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function autoAssignSelectedMatchAnketas(vacancyId, anketaIds) {
  const ids = [...new Set((anketaIds || []).map(Number).filter(Boolean))];
  let ok = 0;
  for (const anketaId of ids) {
    try {
      await api.patch(`/vacancies/${vacancyId}/assign`, {
        anketaId,
        assignmentStatus: 'Hödürlendi',
      });
      ok += 1;
    } catch { /* eýýäm hödürlenen / ýalňyşlyk */ }
  }
  return ok;
}

async function sendMatchViaFilesAndGmail(vacancyId, opts = {}) {
  const { ids, rows } = getSelectedMatchAnketas();
  if (!ids.length) {
    showAlert(document.getElementById('alert-box'), tr('match_pick_one', 'Ilki anketalary saýlaň'), 'error');
    return;
  }
  const to = String(opts.to || document.getElementById('match-mail-to')?.value || '').trim();
  const note = String(opts.note || document.getElementById('match-mail-note')?.value || '').trim();

  const res = await api.post(`/vacancies/${vacancyId}/gmail-compose`, {
    anketaIds: ids,
    to: to || undefined,
    note: note || undefined,
  });
  const d = res.data || {};
  await downloadSelectedComposeFiles(vacancyId, d.files || []);

  // Faýl + Gmail ýoly — hödürlemäni hem awtomatik goý
  const assignedN = await autoAssignSelectedMatchAnketas(vacancyId, ids);

  const company = matchMailContext.company || '';
  const position = matchMailContext.position || '';
  const contact = matchMailContext.name || '';
  const subject = d.subject || `Anketalar: ${position || 'wezipe'} — ${company || 'HR'} (${rows.length})`;
  const lines = [
    contact ? `Hormatly ${contact},` : 'Hormatly alyjy,',
    '',
    `${company || '—'} / ${position || '—'} üçin anketalar goşundyda.`,
    '',
    ...rows.map((r, i) => `${i + 1}. № ${r.num} — ${r.name}`),
    '',
    'Goşundy: Ýüklenenler papkasyndaky JPG suratlar.',
  ];
  if (note) lines.push('', `Bellik: ${note}`);

  openGmailComposeTab(d.gmailUrl || buildMatchGmailUrl({ to, subject, body: lines.join('\n') }));
  closeModal();
  const assignMsg = assignedN
    ? ` · ${assignedN} ${tr('match_auto_assigned', 'awtomatik hödürlendi')}`
    : '';
  showAlert(
    document.getElementById('alert-box'),
    tr(
      'match_files_gmail_ok',
      `${rows.length} faýl taýýar. Gmail-de: 📎 goşundy → Ýüklenenler → Ugrat`,
    ) + assignMsg,
    'success',
  );
  if (typeof loadMatchForVacancy === 'function') {
    try { await loadMatchForVacancy(vacancyId); } catch { /* ignore */ }
  }
}

/** @deprecated — openMatchEmailModal ulanyň */
async function sendMatchCandidatesEmail() {
  openMatchEmailModal();
}

async function matchAnketa(anketaId) {
  matchSearchMode = 'anketa';
  currentMatchAnketaId = Number(anketaId) || anketaId;
  currentMatchVacancyId = null;
  syncMatchModeUi();

  pendingMatchAnketaId = Number(anketaId) || anketaId;
  switchTab('match', document.querySelector('[data-tab="match"]'));
}

async function loadMatchForAnketa(anketaId) {
  matchSearchMode = 'anketa';
  currentMatchAnketaId = Number(anketaId) || anketaId;
  currentMatchVacancyId = null;
  syncMatchModeUi();

  hideMatchVacancyCard();
  const box = document.getElementById('match-results');
  if (box) box.innerHTML = `<p class="muted">${tr('match_searching', 'Gözlenýär...')}</p>`;

  try {
    const vacStatusQ = matchShowAllVacancies ? 'all' : 'Acyk';
    const res = await api.get(`/match/anketa/${anketaId}?minScore=0&limit=500&vacancyStatus=${encodeURIComponent(vacStatusQ)}`);
    const {
      anketa,
      matches = [],
      positionMatches,
      skillMatches,
    } = res.data || {};
    const name = [anketa.familyName, anketa.firstName, anketa.patronymic].filter(Boolean).join(' ');

    let posList = Array.isArray(positionMatches) && positionMatches.length
      ? positionMatches
      : matches.filter((m) => m.matchTier === 'position' || m.matchTier === 'partial');
    
    // Auto-filter: anketa boýunça görkezilýän netijäniň diňe şol wakansiýalary
    // ýokarky saýlawda (forumda) görkezilsin.
    const select = document.getElementById('match-vacancy');
    if (select) {
      const uniqVac = new Map();
      posList.forEach((m) => {
        if (!m?.vacancy?.id) return;
        if (!uniqVac.has(m.vacancy.id)) uniqVac.set(m.vacancy.id, m.vacancy);
      });

      const vacOptionsHtml = Array.from(uniqVac.values()).map((v) => {
        const d = formatDate(v.vacancyDate);
        const datePart = d ? ` · ${d}` : '';
        const st = String(v.status || '').trim();
        const stPart = st && st !== 'Acyk' ? ` [${st}]` : '';
        return `<option value="${v.id}">№${v.vacancyNumber}${datePart} — ${v.position} (${v.companyName || ''})${stPart}</option>`;
      }).join('');

      select.innerHTML = `<option value=""> </option>${vacOptionsHtml}`;
      select.value = '';
    }

    const skillList = [];

    if (!posList.length) {
      const emptyVac = matchShowAllVacancies
        ? tr('match_vac_for_none', 'üçin gabat gelýän wakansiýa tapylmady.')
        : tr('match_vac_for_none_open', 'üçin açyk gabat gelýän wakansiýa ýok. «Ählisi» basyp ýapyklary hem görüň.');
      box.innerHTML = `<p><strong>${escHtml(name)}</strong> ${emptyVac}</p>`;
      return;
    }

    const renderVacRows = (rows) => rows.map((m) => {
      const st = String(m.vacancy?.status || '').trim();
      const isOpen = st === 'Acyk';
      const stLabel = isOpen
        ? tr('vac_open_short', 'Açyk')
        : (st === 'Yapyk' ? tr('vac_closed_short', 'Ýapyk') : (st || '—'));
      const stBadge = `<span class="badge ${isOpen ? 'badge-success' : 'badge-muted'}">${escHtml(stLabel)}</span>`;
      const offerBtn = isOpen
        ? `<button class="btn btn-sm btn-success" onclick="assignMatch(${m.vacancy.id}, ${anketa.id})" title="${escHtml(tr('btn_offer', 'Hödürle'))}">${tr('btn_offer', 'Hödürle')}</button>`
        : '';
      return `
              <tr class="match-row match-row--${escHtml(m.matchTier || 'skills')}">
                <td><strong>${m.score}%</strong></td>
                <td>${escHtml(m.vacancy.companyName || '-')}</td>
                <td>${escHtml(m.vacancy.position || '-')}</td>
                <td>${escHtml(m.vacancy.salary || '-')}</td>
                <td>${stBadge}</td>
                <td>${window.I18n?.reasonsText ? escHtml(I18n.reasonsText(m.reasons)) : escHtml((m.reasons || []).join(', '))}</td>
                <td>
                  <div class="actions-cell">
                    <button class="btn btn-sm btn-ghost" onclick="previewVacancyForCall(${m.vacancy.id})">${tr('btn_vacancy', 'Maglumat')}</button>
                    ${offerBtn}
                  </div>
                </td>
              </tr>`;
    }).join('');

    const renderSection = (title, rows) => {
      if (!rows.length) return '';
      return `
      <h3 class="match-section-title" style="margin:16px 0 8px;font-size:1.05rem">${escHtml(title)} <span class="muted">(${rows.length})</span></h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>${tr('th_score', '%')}</th><th>${tr('th_company', 'Kärhana')}</th><th>${tr('th_position', 'Wezipe')}</th><th>${tr('th_salary_short', 'Haky')}</th><th>${tr('th_status', 'Ýagdaý')}</th><th>${tr('th_why', 'Näme üçin')}</th><th class="col-actions">${tr('th_actions', 'Hereket')}</th></tr>
          </thead>
          <tbody>${renderVacRows(rows)}</tbody>
        </table>
      </div>`;
    };

    box.innerHTML = `
      <div class="match-banner">
        <strong>${tr('th_candidate', 'Dalaşgär')}:</strong> ${escHtml(formatAnketaRef(anketa, name))}
        ${anketa.desiredPosition ? ` · <strong>${escHtml(anketa.desiredPosition)}</strong>` : ''}
        <div style="margin-top:6px">${phoneHtml(anketa.phone)}</div>
        <span class="match-filter-pill ${matchShowAllVacancies ? 'is-all' : ''}" style="margin-top:8px;display:inline-block">${escHtml(matchShowAllVacancies
          ? tr('match_filter_vac_all', 'Açyk + ýapyk')
          : tr('match_filter_vac_open', 'Diňe açyk'))}</span>
      </div>
      <p class="muted" style="margin:10px 0 0">${tr('match_vac_order_hint', 'Ilki anyk wezipe, soň aýlyk haky, iş wagty, tejribe, jyns, diller, programmalar, ýaş, maşgala ýagdaýy.')}</p>
      ${renderSection(tr('match_vac_position', 'Wezipe gabat wakansiýalar'), posList)}
      ${renderSection(tr('match_vac_skills', 'Programma / dil boýunça'), skillList)}
    `;
  } catch (e) {
    if (box) box.innerHTML = `<p class="err">${escHtml(e.message || 'Ýalňyşlyk')}</p>`;
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function previewVacancyForCall(vacancyId) {
  const select = document.getElementById('match-vacancy');
  if (select) {
    // goş eger sanawda ýok bolsa
    if (![...select.options].some((o) => o.value === String(vacancyId))) {
      const opt = document.createElement('option');
      opt.value = vacancyId;
      opt.textContent = `Wakansiýa #${vacancyId}`;
      select.appendChild(opt);
    }
    select.value = String(vacancyId);
  }
  await showMatchVacancyCard(vacancyId);
  const card = document.getElementById('match-vacancy-card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function assignMatch(vacancyId, anketaId) {
  try {
    const [vRes, aRes, cRes] = await Promise.all([
      api.get(`/vacancies/${vacancyId}`),
      api.get(`/anketas/${anketaId}`),
      api.get(`/vacancies/assignments/anketa-counts?ids=${anketaId}`).catch(() => ({ data: {} })),
    ]);
    const v = vRes.data;
    const a = aRes.data;
    const ankCounts = cRes.data?.[anketaId] || { total: 0, active: 0 };
    if (!a.anketaNumber) {
      showAlert(document.getElementById('alert-box'), 'Anketa belgesi (№) ýok — hödürläp bolmaz', 'error');
      return;
    }
    const faa = anketaFullName(a) || 'Dalaşgär';
    const company = v.companyName || 'Kärhana';
    const position = v.position || 'Wezipe';

    showModal(`
      <h3 style="margin-top:0">${tr('assign_who', 'Kim kimiňe hödürlenýär?')}</h3>
      <div class="assign-preview">
        <div class="assign-box">
          <small>${tr('th_candidate', 'DALAŞGÄR')}</small>
          <strong>№ ${escHtml(a.anketaNumber)}</strong>
          <p>${escHtml(faa)}</p>
          <p>${phoneHtml(a.phone)}</p>
          <p>${escHtml(formatAnketaPositionsDisplay(a))}</p>
          ${Number(ankCounts.active) > 0 ? `
            <p style="margin-top:10px">
              ${anketaActiveAssignBtnHtml(anketaId, ankCounts.active, ankCounts.total)}
            </p>` : ''}
        </div>
        <div class="assign-arrow">→</div>
        <div class="assign-box">
          <small>${tr('btn_vacancy', 'WAKANSIÝA')}</small>
          <strong>${escHtml(company)}</strong>
          <p>${escHtml(position)}${v.salary ? ` · ${escHtml(v.salary)}` : ''}</p>
          <p class="cell-stack"><span>${tr('ph_contact', 'Jogapkär')}:</span>${formatJogapkarCell(v)}</p>
        </div>
      </div>
      ${Number(ankCounts.active) > 0 ? `
        <p class="assign-warn">${tr('anketa_assign_warn', 'Bu dalaşgär eýýäm başga wezipelere hödürlenen.')} (${tr('active_assignments', 'Aktiv')}: ${Number(ankCounts.active)}, ${tr('total_assignments', 'Jemi')}: ${Number(ankCounts.total)})</p>
      ` : ''}
      ${Number(v.assignmentCount) > 0 ? `
        <p class="assign-warn">${tr('th_assigned', 'Hödürlenen')}: <strong>${Number(v.assignmentCount)}</strong>. ${tr('btn_add', 'Goş')}.</p>
      ` : ''}
      <div class="form-group" style="margin-top:12px">
        <label>${tr('th_status', 'Ýagdaý')}</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="assign-status" class="status-select status-select--offer" style="flex:1;min-width:180px"
            onchange="this.className='status-select '+assignmentStatusClass(this.value)">
            ${(assignmentStatusesCache.length ? assignmentStatusesCache : ['Hödürlendi']).map((val, i) =>
      `<option value="${escHtml(val)}" ${i === 0 ? 'selected' : ''}>${escHtml(val)}</option>`).join('')}
          </select>
          ${isAdmin ? `<button type="button" class="btn btn-sm btn-ghost" onclick="OptionLists && OptionLists.open('assignment_statuses','Hödürleme ýagdaýlary')">${tr('btn_edit_list', 'Düzediş')}</button>` : ''}
        </div>
      </div>
      <div class="form-group">
        <label>${tr('comments_note', 'Komentariýa / bellik')}</label>
        <textarea id="assign-notes" rows="3" placeholder="${escHtml(tr('comments_placeholder', 'Mysal: jaň edildi, ertir geler'))}"></textarea>
      </div>
      <button class="btn btn-accent" type="button" onclick="confirmAssign(${vacancyId}, ${anketaId})">
        ${tr('btn_offer', 'Hödürle')} (№ ${escHtml(a.anketaNumber)})
      </button>
    `);
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function confirmAssign(vacancyId, anketaId) {
  const assignmentStatus = document.getElementById('assign-status')?.value || 'Hödürlendi';
  const notes = (document.getElementById('assign-notes')?.value || '').trim();
  try {
    const res = await api.patch(`/vacancies/${vacancyId}/assign`, {
      anketaId,
      assignmentStatus,
      notes: notes || undefined,
    });
    const v = res.data;
    closeModal();
    showAlert(
      document.getElementById('alert-box'),
      `${v.assignedCandidateName} hödürlendi → ${v.companyName || ''} (jemi: ${v.assignmentCount || '?'}).`,
      'success',
    );
    if (document.getElementById('tab-vacancies') && !document.getElementById('tab-vacancies').classList.contains('hidden')) {
      loadAdminVacancies();
    }
    if (document.getElementById('tab-assigned') && !document.getElementById('tab-assigned').classList.contains('hidden')) {
      loadAssigned();
    }
    if (document.getElementById('tab-match') && !document.getElementById('tab-match').classList.contains('hidden')) {
      runMatch();
    }
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function feePayStatusLabel(st) {
  if (st === 'paid') return tr('fees_st_paid', 'Doly tölenen');
  if (st === 'partial') return tr('fees_st_partial', 'Bölek tölenen');
  if (st === 'no_salary') return tr('fees_st_no_salary', 'Aýlyk ýok');
  return tr('fees_st_open', 'Tölenmedi');
}

function feePayStatusBadge(st) {
  const cls = st === 'paid'
    ? 'badge-success'
    : st === 'partial'
      ? 'badge-warning'
      : st === 'no_salary'
        ? 'badge-muted'
        : 'badge-danger';
  return `<span class="badge ${cls}">${escHtml(feePayStatusLabel(st))}</span>`;
}

let feesPeriod = 'month';
let feesDate = todayIso();
let activityAnchorDate = null;
let activityAnchorPromise = null;
let feesDefaultAnchorApplied = false;
let reportDefaultAnchorApplied = false;

function shiftIsoByMonths(iso, deltaMonths) {
  const d = new Date(`${String(iso || todayIso()).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return todayIso();
  d.setMonth(d.getMonth() + deltaMonths);
  return `${d.getFullYear()}-${pad2Report(d.getMonth() + 1)}-${pad2Report(Math.min(d.getDate(), 28))}`;
}

function analyticsMonthHasData(d) {
  const s = (d && d.summary) || {};
  return (
    Number(s.anketasInPeriod || 0)
    + Number(s.vacanciesInPeriod || 0)
    + Number(s.hiredInPeriod || s.employedInPeriod || 0)
    + Number(s.assignmentsInPeriod || 0)
    + Number(s.agencyIncome || 0)
    + Number(s.feeDue || 0)
    + Number(s.feeReceived || 0)
  ) > 0.009;
}

function feesMonthHasData(d) {
  const totals = (d && d.totals) || {};
  const n = (d && d.items && d.items.length) || (d && d.pagination && d.pagination.total) || 0;
  return n > 0
    || Number(totals.expectedFee || 0) > 0.009
    || Number(totals.paid || 0) > 0.009
    || Number(totals.remaining || 0) > 0.009;
}

/** Soňky maglumatly aý — API ýok bolsa aý-aý yza synap tapýar */
function loadActivityAnchor() {
  if (!activityAnchorPromise) {
    activityAnchorPromise = (async () => {
      try {
        const res = await api.get('/reports/latest-anchor');
        const d = res.data?.date;
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          activityAnchorDate = d;
          return d;
        }
      } catch (_) { /* köne serwer / 404 — aşakda synag */ }

      let date = todayIso();
      for (let i = 0; i < 18; i += 1) {
        try {
          const params = new URLSearchParams({ period: 'month', date });
          const res = await api.get(`/reports/analytics?${params}`);
          if (analyticsMonthHasData(res.data)) {
            activityAnchorDate = date;
            return date;
          }
        } catch (_) { /* indiki aý */ }
        date = shiftIsoByMonths(date, -1);
      }
      activityAnchorDate = todayIso();
      return activityAnchorDate;
    })();
  }
  return activityAnchorPromise;
}

/** Ýyl saýlawyndan aý/hepde/güne geçende 01.01 ýa-da boş aýa düşmez ýaly */
function periodAnchorAfterSwitch(prevPeriod, nextPeriod, rawDate) {
  let d = String(rawDate || todayIso()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = todayIso();
  if (prevPeriod === 'year' && nextPeriod !== 'year') {
    const y = d.slice(0, 4);
    const today = todayIso();
    const activity = activityAnchorDate || today;
    if (String(activity).startsWith(y)) return activity;
    if (y === today.slice(0, 4)) return activityAnchorDate || today;
    const merged = `${y}-${(activityAnchorDate || today).slice(5)}`;
    const parsed = new Date(`${merged}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? `${y}-06-15` : merged;
  }
  return d;
}

function syncFeesPeriodButtons() {
  document.querySelectorAll('.fees-period-btn').forEach((btn) => {
    const active = btn.dataset.period === feesPeriod;
    btn.classList.toggle('btn-accent', active);
    btn.classList.toggle('btn-ghost', !active);
  });
}

function syncFeesDateInput() {
  const wrap = document.getElementById('fees-anchor-wrap');
  if (!wrap) return;
  const d = new Date(`${feesDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) feesDate = todayIso();
  const cur = new Date(`${feesDate}T12:00:00`);

  if (feesPeriod === 'year') {
    const y = cur.getFullYear();
    const years = [];
    const nowY = new Date().getFullYear();
    for (let i = nowY; i >= nowY - 8; i -= 1) years.push(i);
    if (!years.includes(y)) years.unshift(y);
    wrap.innerHTML = `
      <select id="fees-date" class="report-date-select" onchange="onFeesDateChange()">
        ${years.map((yy) => `<option value="${yy}-01-01" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}
      </select>`;
  } else if (feesPeriod === 'month') {
    const val = `${cur.getFullYear()}-${pad2Report(cur.getMonth() + 1)}`;
    wrap.innerHTML = `<input type="month" class="tk-date report-date-input" id="fees-date" value="${val}" onchange="onFeesDateChange()">`;
  } else {
    wrap.innerHTML = `<input type="date" class="tk-date report-date-input" id="fees-date" value="${feesDate}" onchange="onFeesDateChange()">`;
  }
  if (typeof initTkDatePickers === 'function') initTkDatePickers(wrap);
}

function readFeesDateFromInput() {
  const el = document.getElementById('fees-date');
  if (!el) return feesDate;
  const v = String(el.value || '').trim();
  if (!v) return feesDate;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  return v;
}

function setFeesPeriod(period) {
  const prev = feesPeriod;
  const next = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  feesDefaultAnchorApplied = true;
  feesDate = periodAnchorAfterSwitch(prev, next, readFeesDateFromInput() || feesDate || todayIso());
  feesPeriod = next;
  syncFeesPeriodButtons();
  syncFeesDateInput();
  loadFeePayments();
}

function onFeesDateChange() {
  feesDefaultAnchorApplied = true;
  feesDate = readFeesDateFromInput() || todayIso();
  loadFeePayments();
}

function goFeesToday() {
  feesDefaultAnchorApplied = true;
  feesDate = todayIso();
  syncFeesDateInput();
  loadFeePayments();
}

function shiftFeesPeriod(dir) {
  feesDefaultAnchorApplied = true;
  const d = new Date(`${(readFeesDateFromInput() || feesDate)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return;
  if (feesPeriod === 'day') d.setDate(d.getDate() + dir);
  else if (feesPeriod === 'week') d.setDate(d.getDate() + (7 * dir));
  else if (feesPeriod === 'year') d.setFullYear(d.getFullYear() + dir);
  else d.setMonth(d.getMonth() + dir);
  feesDate = `${d.getFullYear()}-${pad2Report(d.getMonth() + 1)}-${pad2Report(d.getDate())}`;
  syncFeesDateInput();
  loadFeePayments();
}

function resetFeeFilters() {
  ['fees-search', 'fees-filter-number'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const st = document.getElementById('fees-pay-status');
  if (st) st.value = 'all';
  feesPeriod = 'month';
  feesDefaultAnchorApplied = false;
  loadFeePayments();
}

let _feeOpsLoaded = false;
async function _ensureFeeOperatorFilter() {
  if (_feeOpsLoaded) return;
  _feeOpsLoaded = true;
  try {
    const res = await api.get('/auth/users?role=operator&active=true');
    const ops = (res.data || []).filter((u) => u.role === 'operator' && u.isActive);
    const sel = document.getElementById('fees-filter-operator');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">Ähli operatorlar</option>`
      + ops.map((u) => `<option value="${u.id}"${String(u.id) === cur ? ' selected' : ''}>${escHtml(u.fullName || u.username)}</option>`).join('');
  } catch { /* ignore */ }
}

async function loadFeePayments() {
  await Promise.all([loadActivityAnchor(), _ensureFeeOperatorFilter()]);
  if (!['day', 'week', 'month', 'year'].includes(feesPeriod)) feesPeriod = 'month';
  if (!feesDefaultAnchorApplied) {
    feesDefaultAnchorApplied = true;
    if (activityAnchorDate) feesDate = activityAnchorDate;
  }
  if (!feesDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(feesDate))) {
    feesDate = activityAnchorDate || todayIso();
  }
  syncFeesPeriodButtons();
  syncFeesDateInput();
  feesDate = readFeesDateFromInput() || feesDate || activityAnchorDate || todayIso();
  if (!feesDate || !/^\d{4}-\d{2}-\d{2}$/.test(feesDate)) {
    feesDate = activityAnchorDate || todayIso();
    syncFeesDateInput();
  }

  const params = new URLSearchParams({
    limit: 100,
    period: feesPeriod || 'month',
    date: feesDate,
  });
  const search = document.getElementById('fees-search')?.value || '';
  const anketaNumber = document.getElementById('fees-filter-number')?.value || '';
  const payStatus = document.getElementById('fees-pay-status')?.value || 'all';
  const workStatus = document.getElementById('fees-work-status')?.value || 'all';
  const operatorId = document.getElementById('fees-filter-operator')?.value || '';
  if (search) params.set('search', search);
  if (anketaNumber) params.set('anketaNumber', anketaNumber);
  if (payStatus && payStatus !== 'all') params.set('payStatus', payStatus);
  if (workStatus && workStatus !== 'all') params.set('workStatus', workStatus);
  if (operatorId) params.set('operatorId', operatorId);

  try {
    const res = await api.get(`/fee-payments?${params}`);
    const d = res.data || {};
    const totals = d.totals || {};
    const dueEl = document.getElementById('fees-sum-due');
    const paidEl = document.getElementById('fees-sum-paid');
    const remEl = document.getElementById('fees-sum-remaining');
    // Kartlar: Almaly = 50% jemi, Alnan = tölenen, Galdy = galan
    if (dueEl) dueEl.textContent = moneyFmt(totals.expectedFee);
    if (paidEl) paidEl.textContent = moneyFmt(totals.paid);
    if (remEl) remEl.textContent = moneyFmt(totals.remaining);

    const tbody = document.getElementById('fees-tbody');
    if (!tbody) return;
    const items = d.items || [];
    const feeWorkBadge = (st) => {
      const working = st === 'working';
      const cls = working ? 'badge-success' : 'badge-muted';
      const label = working ? 'Işleýär' : 'Çykdy';
      return `<span class="badge ${cls}">${escHtml(label)}</span>`;
    };
    const fmtShort = (d) => (typeof formatDateTk === 'function' ? formatDateTk(d, false, true) : formatDate(d));
    tbody.innerHTML = items.map((row) => `
      <tr>
        <td class="fe-col-start fe-col-nowrap">${fmtShort(row.workStartDate || row.employmentDate) || '—'}</td>
        <td class="fe-col-status">${feeWorkBadge(row.workStatus)}</td>
        <td class="fe-col-left fe-col-nowrap">${row.workStatus === 'left' && row.leftDate ? fmtShort(row.leftDate) : '—'}</td>
        <td class="fe-col-name fees-cell-name">
          <a href="#" class="link-faa" title="№ ${escHtml(row.anketaNumber || '')}" onclick="event.preventDefault(); openAnketaPage(${row.anketaId})">
            ${escHtml(row.name || '—')}
          </a>
        </td>
        <td class="fe-col-company fe-col-compact"><span class="fees-wrap-text">${escHtml(row.companyName || '—')}</span></td>
        <td class="fe-col-position fe-col-compact"><span class="fees-wrap-text">${escHtml(row.position || '—')}</span></td>
        <td class="fe-col-money">${moneyFmt(row.salary)}</td>
        <td class="fe-col-money"><strong>${moneyFmt(row.expectedFee)}</strong></td>
        <td class="fe-col-money">${moneyFmt(row.paid)}</td>
        <td class="fe-col-remain">
          <div class="fees-stack">
            <strong>${moneyFmt(row.remaining)}</strong>
            ${feePayStatusBadge(row.payStatus)}
          </div>
        </td>
        <td class="fe-col-salary-date fe-col-nowrap">${fmtShort(row.salaryReceiveDate) || '—'}</td>
        <td class="fe-col-worker fees-col-worker">${escHtml(row.operatorName || '—')}</td>
        <td class="fe-col-action fees-col-action">
          <button type="button" class="btn btn-sm btn-accent fees-pay-btn"
            onclick="openFeePaymentModal(${row.anketaId})">${tr('fees_btn_pay', 'Töleg')}</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="13"><div class="empty-hint">${tr('empty_not_found', 'Tapylmady')}</div></td></tr>`;
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openFeePaymentModal(anketaId) {
  try {
    const res = await api.get(`/fee-payments/anketa/${anketaId}`);
    const d = res.data;
    if (!d) throw new Error(tr('rpt_no_data', 'Maglumat ýok'));
    const today = new Date().toISOString().slice(0, 10);
    const paymentsHtml = (d.payments || []).length
      ? `<div class="table-wrap" style="margin-top:12px;max-height:220px;overflow:auto">
          <table>
            <thead>
              <tr>
                <th>${tr('th_date', 'Sene')}</th>
                <th>${tr('fees_amount', 'Mukdar')}</th>
                <th>${tr('fees_note', 'Bellik')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(d.payments || []).map((p) => `
                <tr>
                  <td>${formatDate(p.paymentDate) || '—'}</td>
                  <td><strong>${moneyFmt(p.amount)}</strong></td>
                  <td>${escHtml(p.note || '—')}</td>
                  <td>
                    <button type="button" class="btn btn-sm btn-danger"
                      onclick="deleteFeePayment(${p.id}, ${d.anketaId})">${tr('btn_delete', 'Poz')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
      : `<p class="muted" style="margin-top:12px">${tr('fees_no_payments', 'Heniz töleg ýok')}</p>`;

    showModal(`
      <h3 style="margin-top:0">${tr('fees_modal_title', 'Töleg ýaz')} · № ${escHtml(d.anketaNumber || '')}</h3>
      <p style="margin:0 0 8px">${escHtml(d.name || '')}</p>
      <p class="muted" style="margin:0 0 12px">
        ${tr('th_salary', 'Aýlyk')}: <strong>${moneyFmt(d.salary)}</strong>
        · ${tr('fees_due', 'Almaly')}: <strong>${moneyFmt(d.expectedFee)}</strong>
        · ${tr('fees_received', 'Alnan')}: <strong>${moneyFmt(d.paid)}</strong>
        · ${tr('fees_remaining', 'Galdy')}: <strong>${moneyFmt(d.remaining)}</strong>
      </p>
      <p class="muted" style="margin:0 0 16px;font-size:0.9em">${tr('fees_full_month_hint', 'Doly aýlygyň 50%-i — aý ortasynda ýerleşsede prorasýa ýok (mysal: 4000 → 2000 TMT).')}</p>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label>${tr('fees_amount', 'Mukdar')} (TMT) *</label>
          <input type="number" id="fee-pay-amount" min="0" step="0.01" value="${d.remaining > 0 ? d.remaining : ''}" required>
        </div>
        <div class="form-group">
          <label>${tr('th_date', 'Sene')} *</label>
          <input type="date" id="fee-pay-date" value="${today}" required>
        </div>
      </div>
      <div class="form-group">
        <label>${tr('fees_note', 'Bellik')}</label>
        <input type="text" id="fee-pay-note" placeholder="${tr('fees_note_ph', 'Mysal: 1-nji aý — 1000 TMT')}" maxlength="500">
      </div>
      <div class="toolbar" style="margin-top:12px;gap:8px">
        <button type="button" class="btn btn-accent" onclick="submitFeePayment(${d.anketaId})">${tr('fees_btn_save', 'Tölegi ýaz')}</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">${tr('btn_cancel', 'Ýatyr')}</button>
      </div>
      ${paymentsHtml}
    `, { wide: true });
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function submitFeePayment(anketaId) {
  const amount = Number(document.getElementById('fee-pay-amount')?.value);
  const paymentDate = document.getElementById('fee-pay-date')?.value;
  const note = document.getElementById('fee-pay-note')?.value || '';
  if (!(amount > 0)) {
    showAlert(document.getElementById('alert-box'), tr('fees_amount_required', 'Töleg mukdaryny ýazyň'), 'error');
    return;
  }
  try {
    await api.post(`/fee-payments/anketa/${anketaId}`, { amount, paymentDate, note });
    showAlert(document.getElementById('alert-box'), tr('fees_saved', 'Töleg ýazyldy'), 'success');
    await openFeePaymentModal(anketaId);
    loadFeePayments();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function deleteFeePayment(paymentId, anketaId) {
  if (!confirm(tr('fees_delete_confirm', 'Bu töleg ýazgysyny pozmalymy?'))) return;
  try {
    await api.delete(`/fee-payments/${paymentId}`);
    showAlert(document.getElementById('alert-box'), tr('fees_deleted', 'Töleg pozuldy'), 'success');
    if (anketaId) await openFeePaymentModal(anketaId);
    loadFeePayments();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

const ASSIGNED_FILTERS_KEY = 'kerwen_assigned_filters';
const ASSIGNED_FILTER_FIELD_MAP = {
  search: 'assigned-search',
  status: 'assigned-status',
  vacancyStatus: 'assigned-vacancy-status',
  anketaNumber: 'assigned-filter-number',
  faa: 'assigned-filter-faa',
  phone: 'assigned-filter-phone',
  company: 'assigned-filter-company',
  position: 'assigned-filter-position',
  salary: 'assigned-filter-salary',
  vacancyNumber: 'assigned-filter-vacancy-number',
  operator: 'assigned-filter-operator',
};

let _assignedOpsLoaded = false;
async function loadAssignedOperatorFilter() {
  const select = document.getElementById('assigned-filter-operator');
  if (!select) return;
  if (!isAdmin) {
    select.classList.add('hidden');
    select.value = '';
    return;
  }
  select.classList.remove('hidden');
  if (_assignedOpsLoaded && select.options.length > 1) return;

  const prev = select.value;
  try {
    const res = await api.get('/auth/staff');
    const staff = (res.data || []).filter((u) => u.role === 'operator');
    const seen = new Set();
    const options = [`<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`];

    staff.forEach((u) => {
      const name = String(u.fullName || u.username || '').trim();
      if (!name || seen.has(`id:${u.id}`)) return;
      seen.add(`id:${u.id}`);
      seen.add(name.toLowerCase());
      options.push(`<option value="u:${u.id}">${escHtml(forumOperatorOptionLabel(u))}</option>`);
    });

    try {
      const byOp = await api.get('/vacancies/by-operator');
      (byOp.data || []).forEach((row) => {
        const name = String(row.forumOperator || '').trim();
        if (!name || name === 'Bellenmedik') return;
        if (seen.has(name.toLowerCase())) return;
        if (row.acceptedByUserId && seen.has(`id:${row.acceptedByUserId}`)) return;
        seen.add(name.toLowerCase());
        options.push(`<option value="n:${escHtml(name)}">${escHtml(name)}</option>`);
      });
    } catch (_) { /* ignore */ }

    select.innerHTML = options.join('');
    if (prev && [...select.options].some((o) => o.value === prev)) {
      select.value = prev;
    } else {
      select.value = '';
    }
    _assignedOpsLoaded = true;
  } catch (_) {
    select.innerHTML = `<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`;
    select.value = '';
  }
}

function resetAssignedFilters() {
  [
    'assigned-search',
    'assigned-filter-number',
    'assigned-filter-faa',
    'assigned-filter-phone',
    'assigned-filter-company',
    'assigned-filter-position',
    'assigned-filter-salary',
    'assigned-filter-vacancy-number',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const st = document.getElementById('assigned-status');
  const vs = document.getElementById('assigned-vacancy-status');
  const op = document.getElementById('assigned-filter-operator');
  if (st) st.value = '';
  if (vs) vs.value = '';
  if (op) op.value = '';
  try { sessionStorage.removeItem(ASSIGNED_FILTERS_KEY); } catch (_) { /* ignore */ }
  loadAssigned();
}

function getAssignedFilterState() {
  const state = {};
  Object.entries(ASSIGNED_FILTER_FIELD_MAP).forEach(([key, id]) => {
    const val = document.getElementById(id)?.value?.trim();
    if (val) state[key] = val;
  });
  return state;
}

function applyAssignedFilterState(state) {
  if (!state || typeof state !== 'object') return;
  Object.entries(ASSIGNED_FILTER_FIELD_MAP).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && state[key] != null) el.value = String(state[key]);
  });
}

function saveAssignedFilterState() {
  const state = getAssignedFilterState();
  try {
    sessionStorage.setItem(ASSIGNED_FILTERS_KEY, JSON.stringify(state));
  } catch (_) { /* ignore */ }
  return state;
}

function buildAssignedReturnUrl() {
  const state = saveAssignedFilterState();
  const q = new URLSearchParams({ tab: 'assigned' });
  Object.entries(state).forEach(([k, v]) => q.set(k, v));
  return `/admin/dashboard.html?${q.toString()}`;
}

async function loadAssigned() {
  await loadAssignedOperatorFilter();
  saveAssignedFilterState();
  const params = new URLSearchParams({ limit: 100 });
  Object.entries(ASSIGNED_FILTER_FIELD_MAP).forEach(([key, id]) => {
    if (key === 'operator') return;
    const val = document.getElementById(id)?.value?.trim();
    if (val) params.set(key, val);
  });

  // Admin: operator filtri (default boş = ählisi)
  if (isAdmin) {
    const raw = String(document.getElementById('assigned-filter-operator')?.value || '').trim();
    if (raw.startsWith('u:')) {
      const uid = Number(raw.slice(2));
      if (uid) params.set('acceptedByUserId', String(uid));
    } else if (raw.startsWith('n:')) {
      const name = raw.slice(2).trim();
      if (name) params.set('forumOperator', name);
    }
  }

  const tbody = document.getElementById('assigned-tbody');
  if (!tbody) return;

  try {
    const res = await api.get(`/vacancies/assignments?${params}`);
    const items = res.data.items || [];
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="11">${tr('assigned_empty', 'Häzir hödürlenen ýok')}</td></tr>`;
      return;
    }

    const listIds = items.map((row) => row.anketa?.id || row.anketaId).filter(Boolean);
    lastAnketaListIds = listIds.slice();
    const idsJs = JSON.stringify(listIds);

    tbody.innerHTML = items.map((row) => {
      const a = row.anketa;
      const v = row.vacancy || {};
      const num = a?.anketaNumber || '—';
      const faa = anketaFullName(a) || (row.candidateName || '—');
      const anketaId = a?.id || row.anketaId;
      const st = row.status || 'Hödürlendi';
      const salaryReceiveAt = row.salaryReceiveAt || row.salary_receive_at || row.salaryReceiveDate || row.salary_receive_date || '';
      const closedReason = String(a?.closedReason || a?.closed_reason || '');
      const placedByUs = isPlacedByUsReasonUI(closedReason);
      const vacId = v.id || row.vacancyId;
      const activeCount = row.anketaActiveCount ?? 0;
      const totalCount = row.anketaTotalCount ?? 0;
      const assignedAt = row.createdAt || row.created_at || '';
      const dateLabel = assignedAt ? formatDate(assignedAt) : '—';
      const dateTitle = assignedAt ? formatDateTime(assignedAt) : '';
      const activeHtml = !anketaId
        ? '<span class="muted">—</span>'
        : (activeCount < 1
          ? '<span class="vac-assign-zero">0</span>'
          : `<button type="button" class="assign-count-btn assign-count-btn--vac" onclick="openAnketaAssignments(${anketaId})" title="${escHtml(tr('th_active_assign', 'Aktiv hödürleniş'))}: ${activeCount}${totalCount > activeCount ? ` / ${totalCount}` : ''}"><span class="assign-count-num">${activeCount}</span></button>`);
      return `
        <tr>
          <td class="vac-cell-nowrap">
            ${anketaId
          ? `<button type="button" class="link-faa" onclick='openAnketaPage(${anketaId}, ${idsJs}, ${Number(vacId) || 0})'>№ ${escHtml(num)}</button>`
          : `<strong>№ ${escHtml(num)}</strong>`}
          </td>
          <td>
            ${anketaId
          ? `<button type="button" class="link-faa" onclick='openAnketaPage(${anketaId}, ${idsJs}, ${Number(vacId) || 0})'>${escHtml(faa)}</button>`
          : escHtml(faa)}
          </td>
          <td>${phoneHtml(a?.phone)}</td>
          <td>${v.companyName
          ? `<a href="#" class="link-faa" onclick='event.preventDefault(); openCompanyVacancies(${JSON.stringify(v.companyName)})'>${escHtml(v.companyName)}</a>`
          : '—'}</td>
          <td>
            <button type="button" class="link-faa" onclick="openAssignedVacancy(${vacId})">${escHtml(v.position || '—')}</button>
          </td>
          <td class="vac-cell-nowrap"><strong>${escHtml(v.salary || '—')}</strong></td>
          <td class="vac-cell-nowrap">
            <button type="button" class="link-faa" onclick="openVacancyAssignments(${vacId})">№ ${escHtml(v.vacancyNumber || vacId)}</button>
          </td>
          <td class="vac-cell-nowrap" title="${escHtml(dateTitle)}">${escHtml(dateLabel)}</td>
          <td>${assignmentStatusSelectHtml(row.id, st)}</td>
          <td class="vac-cell-nowrap vac-cell-assign">${activeHtml}</td>
          <td class="col-actions">
            <div class="actions-cell actions-cell--compact">
              <button type="button" class="act-btn act-btn--accent" onclick="openAssignedVacancy(${vacId})" title="${escHtml(tr('btn_vacancy', 'Wakansiýa'))}">Wakansiýa</button>
              ${assignedPrintButtonHtml(row.id, st, anketaId, { salaryReceiveAt })}
              <button type="button" class="act-btn act-btn--note" onclick="openAssignmentComments(${row.id})" title="${escHtml(tr('comments_title', 'Komentariýalar'))}">Bellik</button>
              ${anketaId
                ? (String(st).trim() === 'Kabul edildi' || placedByUs
                  ? `<button type="button" class="act-btn act-btn--contract-new" onclick="printContractOnly(${anketaId}, true)" title="${escHtml(tr('btn_new_contract', 'Täze şert çap'))}">${tr('btn_new_contract_short', 'Täze şert')}</button>`
                  : `<button type="button" class="act-btn act-btn--warn" onclick="printContractOnly(${anketaId})" title="${escHtml(tr('btn_contract', 'Şertnama'))}">Şertnama</button>`)
                : ''}
              ${dilHatyButtonHtml(row.id, st)}
              <button type="button" class="act-btn act-btn--danger" onclick="removeAssignmentRow(${row.id})" title="${escHtml(tr('btn_remove', 'Aýyr'))}">Aýyr</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function canEditSalaryReceive(status) {
  const s = String(status || '').trim();
  return s === 'Kabul edildi' || s === 'Işden çykdy';
}

function dilHatyButtonHtml(assignmentId, status, opts = {}) {
  if (!assignmentId || !canEditSalaryReceive(status)) return '';
  const label = tr('btn_dil_haty', 'Dil haty');
  const title = tr('btn_dil_haty_hint', 'Dil hatyny aç we çap et');
  const cls = opts.pill
    ? 'btn btn-sm btn-pill btn-dil-haty'
    : 'act-btn act-btn--dilhaty';
  return `<button type="button" class="${cls}" onclick="printDilHaty(${Number(assignmentId)})" title="${escHtml(title)}">${escHtml(label)}</button>`;
}

function salaryReceiveButtonHtml(assignmentId, opts = {}) {
  if (!assignmentId) return '';
  const salaryReceiveAt = opts.salaryReceiveAt || '';
  const cleanSalaryReceiveAt = String(salaryReceiveAt || '').trim().slice(0, 10);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(cleanSalaryReceiveAt) ? cleanSalaryReceiveAt : '';

  const label = tr('modal_salary', 'Aýlyk');
  const baseTitle = tr('fees_salary_date', 'Aýlyk alýan senesi');
  const title = safeDate ? `${baseTitle}: ${safeDate}` : baseTitle;

  return `<button type="button" class="act-btn act-btn--salary"
    data-assignment-id="${Number(assignmentId)}"
    data-salary-date="${escHtml(safeDate)}"
    onclick="event.preventDefault();event.stopPropagation();openSalaryReceiveModal(${Number(assignmentId)}, '${safeDate}')"
    title="${escHtml(title)}">${escHtml(label)}</button>`;
}

async function openSalaryReceiveModal(assignmentId, currentSalaryReceiveAt = '') {
  const id = Number(assignmentId);
  if (!id) {
    showAlert(document.getElementById('alert-box'), 'Hödürleme ID ýok', 'error');
    return;
  }

  const helper = window.AssignmentSalaryDate;
  if (!helper || typeof helper.modalHtml !== 'function') {
    showAlert(document.getElementById('alert-box'), 'Aýlyk modal modul ýüklenmedi — sahypany Ctrl+F5 bilen täzeläň', 'error');
    return;
  }

  const prefill = helper.normalizeDate
    ? helper.normalizeDate(currentSalaryReceiveAt)
    : String(currentSalaryReceiveAt || '').trim().slice(0, 10);

  try {
    const html = helper.modalHtml({
      title: tr('fees_salary_date', 'Aýlyk alýan senesi'),
      hint: 'Sene saýlaň we «Ýatda sakla» basyň',
      label: tr('fees_salary_date', 'Aýlyk alýan senesi'),
      defaultDate: prefill || helper.todayIso(),
      badge: tr('modal_salary', 'Aýlyk'),
      save: 'Ýatda sakla',
      cancel: 'Ýatyr',
    });

    showModal(html);
    const root = document.getElementById('modal-content') || document;

    helper.wireModal(root, {
      onCancel: () => closeModal(),
      onInvalid: () => showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error'),
      onSave: async (salaryReceiveAt) => {
        const day = helper.normalizeDate(salaryReceiveAt);
        if (!day) {
          showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
          return;
        }
        try {
          await api.patch(`/vacancies/assignments/${id}`, { salaryReceiveAt: day });
          closeModal();
          showAlert(document.getElementById('alert-box'), `Aýlyk alýan sene: ${day}`, 'success');

          const year = day.slice(0, 4);
          if (/^\d{4}$/.test(year)) {
            feesDefaultAnchorApplied = true;
            feesPeriod = 'year';
            feesDate = `${year}-01-01`;
          }

          // Hödürlenenler sanawynda gal — düwme işleýändigini görmek üçin
          if (typeof loadAssigned === 'function') loadAssigned();
          const feesTab = document.getElementById('tab-fees');
          if (feesTab && !feesTab.classList.contains('hidden') && typeof loadFeePayments === 'function') {
            loadFeePayments();
          }
        } catch (e) {
          showAlert(document.getElementById('alert-box'), e.message || 'Aýlyk ýazylmady', 'error');
        }
      },
    });
  } catch (e) {
    console.error(e);
    showAlert(document.getElementById('alert-box'), e.message || 'Aýlyk modal açylmady', 'error');
  }
}

function assignedPrintButtonHtml(assignmentId, status, anketaId, opts = {}) {
  if (canEditSalaryReceive(status)) return salaryReceiveButtonHtml(assignmentId, opts);
  if (!anketaId) return '';
  return `<button type="button" class="act-btn act-btn--print" onclick="printAnketa(${anketaId})" title="${escHtml(tr('btn_print', 'Çap'))}">Çap</button>`;
}

function printDilHaty(assignmentId) {
  if (!assignmentId) return;
  window.open(`/admin/dil-haty-print.html?assignmentId=${assignmentId}`, '_blank');
}

async function openEntityComments(entityType, entityId) {
  const titles = {
    anketa: tr('anketas_title', 'Anketa'),
    vacancy: tr('vacancies_title', 'Wakansiýa'),
    assignment: tr('th_offer', 'Hödürleniş'),
  };
  showModal(`
    <h3 style="margin-top:0">${tr('comments_btn', 'Komentariýa')} · ${titles[entityType] || ''} #${entityId}</h3>
    <div id="modal-entity-comments"></div>
  `);
  if (window.CommentsUI) {
    await CommentsUI.mountComments(
      document.getElementById('modal-entity-comments'),
      entityType,
      entityId,
    );
  }
}

async function openAssignmentComments(assignmentId) {
  return openEntityComments('assignment', assignmentId);
}

async function changeAssignmentRowStatus(assignmentId, assignmentStatus) {
  try {
    await api.patch(`/vacancies/assignments/${assignmentId}`, { assignmentStatus });
    const label = (window.I18n && I18n.statusLabel(assignmentStatus)) || assignmentStatus;
    showAlert(document.getElementById('alert-box'), `${tr('status_updated', 'Ýagdaý')}: ${label}`, 'success');
    // Kabul edilenler sanawdan gizlenýär (baza galýar) we dashboarda goşulýar
    if (assignmentStatus === 'Kabul edildi' || document.getElementById('tab-assigned')) {
      loadAssigned();
    }
    if (assignmentStatus === 'Kabul edildi') {
      loadDashboard();
      if (document.getElementById('tab-anketas') && !document.getElementById('tab-anketas').classList.contains('hidden')) {
        loadAnketas();
      }
    }
    if (document.getElementById('tab-vacancies') && !document.getElementById('tab-vacancies').classList.contains('hidden')) {
      loadAdminVacancies();
    }
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
    loadAssigned();
  }
}

async function removeAssignmentRow(assignmentId) {
  if (!confirm(tr('confirm_remove', 'Bu hödürlemäni sanawdan aýyrmak?'))) return;
  try {
    await api.delete(`/vacancies/assignments/${assignmentId}`);
    loadAssigned();
    if (document.getElementById('tab-vacancies') && !document.getElementById('tab-vacancies').classList.contains('hidden')) {
      loadAdminVacancies();
    }
    showAlert(document.getElementById('alert-box'), tr('assigned_removed', 'Hödürleme aýryldy'), 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function changeAssignedStatus(vacancyId, assignmentStatus) {
  try {
    await api.patch(`/vacancies/${vacancyId}/assignment-status`, { assignmentStatus });
    showAlert(document.getElementById('alert-box'), `Ýagdaý: ${assignmentStatus}`, 'success');
    if (assignmentStatus === 'Kabul edildi') {
      loadDashboard();
      loadAssigned();
    }
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
    loadAssigned();
  }
}

async function clearAssigned(vacancyId) {
  if (!confirm('Bu wakansiýanyň ähli hödürlemelerini aýyrmak?')) return;
  try {
    await api.delete(`/vacancies/${vacancyId}/assign`);
    loadAssigned();
    loadAdminVacancies();
    showAlert(document.getElementById('alert-box'), 'Hödürlemeler aýryldy', 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openVacancyAssignments(vacancyId) {
  try {
    const [vRes, aRes] = await Promise.all([
      api.get(`/vacancies/${vacancyId}`),
      api.get(`/vacancies/${vacancyId}/assignments`),
    ]);
    const v = vRes.data;
    const items = aRes.data.items || [];
    const title = `${v.companyName || 'Firma'} — ${v.position || ''} (№${v.vacancyNumber || ''})`;
    // Diňe şu wakansiýanyň hödürlenen anketalary — view-da strelka bilen şolaryň arasynda
    const listIds = items.map((row) => row.anketa?.id || row.anketaId).filter(Boolean);
    lastAnketaListIds = listIds.slice();
    const idsJs = JSON.stringify(listIds);
    const vacNum = Number(vacancyId) || 0;

    showModal(`
      <h3 style="margin-top:0">${tr('modal_assigned', 'Hödürlenenler')} · ${escHtml(title)}</h3>
      <p class="muted" style="margin:0 0 12px">
        ${tr('modal_salary', 'Aýlyk')}: <strong>${escHtml(v.salary || '—')}</strong>
        · ${tr('modal_total', 'Jemi')}: <strong>${items.length}</strong> ${tr('modal_people', 'adam')}
      </p>
      ${!items.length ? `<p>${tr('modal_empty', 'Bu wakansiýada hödürlenen ýok.')}</p>` : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>${tr('th_anketa', 'Anketa №')}</th>
              <th>${tr('th_candidate', 'Dalaşgär')}</th>
              <th>${tr('th_phone', 'Telefon')}</th>
              <th>${tr('th_position', 'Wezipe')}</th>
              <th>${tr('th_status', 'Ýagdaý')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map((row, i) => {
      const a = row.anketa;
      const faa = anketaFullName(a) || row.candidateName || '—';
      const num = a?.anketaNumber || '—';
      const phone = a?.phone || '—';
      const anketaId = a?.id || row.anketaId;
      const st = row.status || 'Hödürlendi';
      const openBtn = anketaId
        ? `openAnketaPage(${anketaId}, ${idsJs}, ${vacNum})`
        : '';
      return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${anketaId
          ? `<button type="button" class="link-faa" onclick='${openBtn}' title="${escHtml(tr('open_anketa', 'Anketany aç'))}"><strong>№ ${escHtml(num)}</strong></button>`
          : `<strong>№ ${escHtml(num)}</strong>`}</td>
                  <td>${anketaId
          ? `<button type="button" class="link-faa" onclick='${openBtn}' title="${escHtml(tr('open_anketa', 'Anketany aç'))}">${escHtml(faa)}</button>`
          : escHtml(faa)}</td>
                  <td>${phoneHtml(a?.phone)}</td>
                  <td>${escHtml(formatAnketaPositionsDisplay(a))}</td>
                  <td>${assignmentStatusSelectHtml(row.id, st)}</td>
                  <td class="col-actions">
                    <div class="actions-cell actions-cell--assign">
                      ${anketaId ? `<button class="btn btn-sm btn-pill btn-ghost" type="button" onclick='${openBtn}'>${tr('open_anketa', 'Gör')}</button>` : ''}
                      ${canEditSalaryReceive(st)
                        ? `<button class="btn btn-sm btn-pill btn-accent" type="button" onclick="event.preventDefault();closeModal();openSalaryReceiveModal(${row.id}, '${String(row.salaryReceiveAt || row.salary_receive_at || '').slice(0, 10).replace(/'/g, '')}')">${tr('modal_salary', 'Aýlyk')}</button>`
                        : (anketaId ? `<button class="btn btn-sm btn-pill btn-primary" type="button" onclick="printAnketa(${anketaId})">${tr('btn_print', 'Çap')}</button>` : '')}
              ${anketaId ? `<button class="btn btn-sm btn-pill btn-accent" type="button" onclick="printContractOnly(${anketaId})">${tr('btn_contract', 'Şertnama')}</button>` : ''}
                      <button class="btn btn-sm btn-pill btn-danger" type="button" onclick="removeAssignmentFromModal(${row.id}, ${vacancyId})">${tr('btn_remove', 'Aýyr')}</button>
                    </div>
                  </td>
                </tr>`;
    }).join('')}
          </tbody>
        </table>
      </div>`}
    `);
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function removeAssignmentFromModal(assignmentId, vacancyId) {
  if (!confirm(tr('confirm_remove_one', 'Bu hödürlemäni aýyrmak?'))) return;
  try {
    await api.delete(`/vacancies/assignments/${assignmentId}`);
    await openVacancyAssignments(vacancyId);
    loadAdminVacancies();
    if (document.getElementById('tab-assigned') && !document.getElementById('tab-assigned').classList.contains('hidden')) {
      loadAssigned();
    }
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openAssignedVacancy(vacancyId) {
  switchTab('match', document.querySelector('[data-tab="match"]'));
  await previewVacancyForCall(vacancyId);
}

async function loadRecommendations() {
  switchTab('assigned', document.querySelector('[data-tab="assigned"]'));
}

async function loadContracts() {
  /* Şertnama aýratyn sahypa ýok — anketa bilen bile çap edilýär */
}

function printContract(id) {
  window.open(`/admin/contract-print.html?id=${id}`, '_blank');
}

async function signContract(id) {
  await api.patch(`/contracts/${id}/sign`, {});
  showAlert(document.getElementById('alert-box'), 'Şertnama gol çekildi', 'success');
}

async function deleteContract(id) {
  if (!canDelete()) return;
  if (!confirm('Şertnamany pozmak isleýärsiňizmi?')) return;
  await api.delete(`/contracts/${id}`);
  showAlert(document.getElementById('alert-box'), 'Şertnama pozuldy', 'success');
}

function pad2Report(n) {
  return String(n).padStart(2, '0');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2Report(d.getMonth() + 1)}-${pad2Report(d.getDate())}`;
}

let reportPeriod = 'month';
let reportDate = todayIso();
let reportLoadSeq = 0;
let reportOperatorFilter = 'all';
let reportAnalyticsData = null;
const reportChartInstances = [];

/** Hasabat diagramma reňkleri — hersi tapawutly */
const REPORT_COLORS = {
  anketa: '#a6853d',
  vacancy: '#3d5a73',
  hired: '#3d6b4f',
  assignment: '#6d28d9',
  kabul: '#0f766e',
  money: '#2e7d52',
};

const REPORT_TIMELINE_SERIES = [
  { key: 'anketas', labelKey: 'rpt_anketa', color: REPORT_COLORS.anketa, field: 'anketas' },
  { key: 'vacancies', labelKey: 'rpt_vacancy', color: REPORT_COLORS.vacancy, field: 'vacancies' },
  { key: 'hired', labelKey: 'rpt_hired', color: REPORT_COLORS.hired, field: 'hired' },
  { key: 'assignments', labelKey: 'rpt_assignment', color: REPORT_COLORS.assignment, field: 'assignments' },
];

const REPORT_OPERATOR_SERIES = [
  { key: 'vacancies', labelKey: 'rpt_vacancy', color: REPORT_COLORS.vacancy, field: 'vacancies' },
  { key: 'anketas', labelKey: 'rpt_anketa', color: REPORT_COLORS.anketa, field: 'anketasHandled' },
  { key: 'assignments', labelKey: 'rpt_assignment', color: REPORT_COLORS.assignment, field: 'assignments' },
  { key: 'kabul', labelKey: 'rpt_kabul', color: REPORT_COLORS.kabul, field: 'kabul' },
];

function reportSeriesLabel(s) {
  return tr(s.labelKey || s.label, s.label || s.key);
}

const ASSIGN_STATUS_COLORS = {
  'Hödürlendi': REPORT_COLORS.assignment,
  'Ugradyldy': '#2563eb',
  'Barjak diýdi': '#0891b2',
  'Kabul edildi': REPORT_COLORS.hired,
  'Olar atkaz etdiler': '#9b3d3d',
};

let reportTimelineVisible = Object.fromEntries(REPORT_TIMELINE_SERIES.map((s) => [s.key, true]));
let reportOperatorSeriesVisible = Object.fromEntries(REPORT_OPERATOR_SERIES.map((s) => [s.key, true]));

function syncReportPeriodButtons() {
  document.querySelectorAll('.report-period-btn').forEach((btn) => {
    const active = btn.dataset.period === reportPeriod;
    btn.classList.toggle('btn-accent', active);
    btn.classList.toggle('btn-ghost', !active);
  });
}

function syncReportDateInput() {
  const wrap = document.getElementById('report-anchor-wrap');
  if (!wrap) return;
  const d = new Date(`${reportDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    reportDate = todayIso();
  }
  const cur = new Date(`${reportDate}T12:00:00`);

  if (reportPeriod === 'year') {
    const y = cur.getFullYear();
    const years = [];
    const nowY = new Date().getFullYear();
    for (let i = nowY; i >= nowY - 8; i -= 1) years.push(i);
    if (!years.includes(y)) years.unshift(y);
    wrap.innerHTML = `
      <select id="report-date" class="report-date-select" onchange="onReportDateChange()">
        ${years.map((yy) => `<option value="${yy}-01-01" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}
      </select>`;
  } else if (reportPeriod === 'month') {
    const val = `${cur.getFullYear()}-${pad2Report(cur.getMonth() + 1)}`;
    wrap.innerHTML = `<input type="month" class="tk-date report-date-input" id="report-date" value="${val}" onchange="onReportDateChange()">`;
  } else {
    wrap.innerHTML = `<input type="date" class="tk-date report-date-input" id="report-date" value="${reportDate}" onchange="onReportDateChange()">`;
  }
  if (typeof initTkDatePickers === 'function') initTkDatePickers(wrap);
}

function readReportDateFromInput() {
  const el = document.getElementById('report-date');
  if (!el) return reportDate;
  const v = String(el.value || '').trim();
  if (!v) return reportDate;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  return v;
}

function setReportPeriod(period) {
  const prev = reportPeriod;
  const next = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  reportDefaultAnchorApplied = true;
  reportDate = periodAnchorAfterSwitch(prev, next, readReportDateFromInput() || reportDate || todayIso());
  reportPeriod = next;
  syncReportPeriodButtons();
  syncReportDateInput();
  loadReport('analytics');
}

function onReportDateChange() {
  reportDefaultAnchorApplied = true;
  reportDate = readReportDateFromInput() || todayIso();
  loadReport('analytics');
}

function goReportToday() {
  reportDefaultAnchorApplied = true;
  reportDate = todayIso();
  syncReportDateInput();
  loadReport('analytics');
}

function shiftReportPeriod(dir) {
  reportDefaultAnchorApplied = true;
  const d = new Date(`${(readReportDateFromInput() || reportDate)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return;
  if (reportPeriod === 'day') d.setDate(d.getDate() + dir);
  else if (reportPeriod === 'week') d.setDate(d.getDate() + (7 * dir));
  else if (reportPeriod === 'year') d.setFullYear(d.getFullYear() + dir);
  else d.setMonth(d.getMonth() + dir);
  reportDate = `${d.getFullYear()}-${pad2Report(d.getMonth() + 1)}-${pad2Report(d.getDate())}`;
  syncReportDateInput();
  loadReport('analytics');
}

function destroyReportCharts() {
  while (reportChartInstances.length) {
    const c = reportChartInstances.pop();
    try { c.destroy(); } catch { /* ignore */ }
  }
}

function moneyFmt(n) {
  const x = Number(n) || 0;
  return `${x.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} TMT`;
}

/** Hasabat / diagramma — diňe operator ady (familiýa däl) */
function operatorShortName(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  return s.split(/\s+/)[0];
}

function openReportFeeDetails(kind) {
  const d = reportAnalyticsData;
  if (!d) return;
  const details = d.feeDetails || {};
  const key = kind === 'received' ? 'received' : kind === 'remaining' ? 'remaining' : 'due';
  const items = details[key] || [];
  const titles = {
    due: tr('fees_due', 'Almaly pul'),
    received: tr('fees_received', 'Alnan pul'),
    remaining: tr('fees_remaining', 'Galdy'),
  };
  const title = titles[key] || titles.due;

  // Tölegler bilen birmeňzeş: Almaly=50% jemi, Alnan=tölenen, Galdy=galan
  const totalGross = items.reduce((s, x) => s + (Number(x.expectedFee) || 0), 0);
  const totalPaid = items.reduce((s, x) => s + (Number(key === 'received' ? (x.paidInPeriod ?? x.amount ?? x.paid) : x.paid) || 0), 0);
  const totalLeft = items.reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const totalDue = key === 'remaining' ? totalLeft : (key === 'received' ? totalPaid : totalGross);

  let rowsHtml;
  if (!items.length) {
    rowsHtml = `<tr><td colspan="8"><div class="empty-hint">${tr('empty_not_found', 'Tapylmady')}</div></td></tr>`;
  } else {
    let lastGroup = null;
    rowsHtml = items.map((x) => {
      let groupHtml = '';
      if (key === 'due' || key === 'remaining') {
        const group = (Number(x.paid) || 0) > 0.009 ? 'partial' : 'open';
        if (group !== lastGroup) {
          lastGroup = group;
          const label = group === 'partial'
            ? tr('fees_st_partial', 'Bölek tölenen')
            : tr('fees_st_open', 'Tölenmedi');
          groupHtml = `<tr class="fee-group-row"><td colspan="8" style="background:var(--surface-2,#f5f3ee);font-weight:600;padding:8px 10px">${escHtml(label)}</td></tr>`;
        }
      }
      const paymentsNote = (x.payments || []).length > 1
        ? `<div class="muted" style="font-size:11px;margin-top:2px">${x.payments.length} ${tr('fees_partial_pays', 'bölek töleg')}</div>`
        : (x.payments || []).length === 1 && (key === 'received' || key === 'due')
          ? `<div class="muted" style="font-size:11px;margin-top:2px">${formatDate(x.payments[0].paymentDate) || ''}</div>`
          : (key === 'due' && x.paid > 0
            ? `<div class="muted" style="font-size:11px;margin-top:2px">${tr('fees_st_partial', 'Bölek tölenen')}</div>`
            : '');
      const paidShow = key === 'received'
        ? (x.paidInPeriod != null ? x.paidInPeriod : x.amount)
        : x.paid;
      // Tölegler tablisasy ýaly: Almaly = 50%, Alnan = tölenen, Galdy = galan
      const almalyShow = x.expectedFee;
      const almalySub = '';
      return `${groupHtml}
      <tr>
        <td>
          ${x.anketaId
          ? `<a class="link-faa" href="#" onclick="event.preventDefault(); openAnketaPage(${x.anketaId})"><strong>${escHtml(x.anketaNumber || '—')}</strong></a>`
          : `<strong>${escHtml(x.anketaNumber || '—')}</strong>`}
        </td>
        <td>${escHtml(x.name || '—')}${paymentsNote}</td>
        <td>${formatDate(x.date) || '—'}</td>
        <td>${moneyFmt(x.salary)}</td>
        <td><strong>${moneyFmt(almalyShow)}</strong>${almalySub}</td>
        <td class="report-fee-paid"><strong>${moneyFmt(paidShow)}</strong></td>
        <td class="report-fee-left"><strong>${moneyFmt(x.remaining)}</strong></td>
        <td>
          ${x.anketaId
          ? `<button type="button" class="btn btn-sm btn-accent" onclick="closeModal(); openFeePaymentModal(${x.anketaId})">${tr('fees_btn_pay', 'Töleg')}</button>`
          : '—'}
        </td>
      </tr>`;
    }).join('');
  }

  const paidColTitle = key === 'received'
    ? `${tr('fees_received', 'Alnan')} (${tr('rpt_this_period', 'bu döwürde')})`
    : tr('fees_received', 'Alnan');

  showModal(`
    <h3 style="margin-top:0">${escHtml(title)}</h3>
    <p class="muted" style="margin:0 0 12px">
      ${items.length} ${tr('fees_people', 'adam')}
      · ${tr('fees_due', 'Almaly')}: <strong>${moneyFmt(totalDue)}</strong>
      · ${tr('fees_received', 'Alnan')}: <strong>${moneyFmt(totalPaid)}</strong>
      · ${tr('fees_remaining', 'Galdy')}: <strong>${moneyFmt(totalLeft)}</strong>
    </p>
    <div class="table-wrap" style="max-height:420px;overflow:auto">
      <table>
        <thead>
          <tr>
            <th>${tr('th_anketa', 'Anketa №')}</th>
            <th>${tr('th_candidate', 'Dalaşgär')}</th>
            <th>${tr('th_hired_date', 'Ýerleşen')}</th>
            <th>${tr('th_salary', 'Aýlyk')}</th>
            <th>${tr('fees_due', 'Almaly')}</th>
            <th>${paidColTitle}</th>
            <th>${tr('fees_remaining', 'Galdy')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">${tr('btn_cancel', 'Ýatyr')}</button>
    </div>
  `, { wide: true });
}

function makeChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  if (typeof Chart === 'undefined') {
    el.parentElement?.insertAdjacentHTML(
      'beforeend',
      '<p class="muted">Diagramma kitaphanasy ýüklenmedi — sahypany täzeläň.</p>',
    );
    return null;
  }
  try {
    const chart = new Chart(el, config);
    reportChartInstances.push(chart);
    return chart;
  } catch (err) {
    console.error('chart', canvasId, err);
    el.parentElement?.insertAdjacentHTML(
      'beforeend',
      `<p class="muted">Diagramma: ${escHtml(err.message || 'ýalňyşlyk')}</p>`,
    );
    return null;
  }
}

function destroyReportChart(canvasId) {
  const idx = reportChartInstances.findIndex((chart) => chart?.canvas?.id === canvasId);
  if (idx < 0) return;
  const [chart] = reportChartInstances.splice(idx, 1);
  try { chart.destroy(); } catch { /* ignore */ }
}

function reportChartTools(canvasId) {
  return `
    <div class="report-chart-tools" aria-label="Diagramma ululygy">
      <button type="button" onclick="zoomReportChart('${canvasId}', -1)" title="Kiçelt">−</button>
      <button type="button" onclick="zoomReportChart('${canvasId}', 0)" title="Adaty ölçeg">100%</button>
      <button type="button" onclick="zoomReportChart('${canvasId}', 1)" title="Ulalt">+</button>
    </div>`;
}

function zoomReportChart(canvasId, direction) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas?.closest('.report-chart-canvas-wrap');
  if (!wrap) return;
  const base = Number(wrap.dataset.baseHeight || wrap.clientHeight || 280);
  wrap.dataset.baseHeight = String(base);
  let zoom = Number(wrap.dataset.zoom || 1);
  zoom = direction === 0 ? 1 : Math.min(2, Math.max(0.7, zoom + direction * 0.2));
  wrap.dataset.zoom = String(zoom);
  wrap.style.height = `${Math.round(base * zoom)}px`;
  wrap.style.minHeight = `${Math.round(base * zoom)}px`;
  const label = wrap.closest('.report-chart-card')?.querySelector(
    `.report-chart-tools button:nth-child(2)`,
  );
  if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

function reportSeriesTogglesHtml(seriesList, visibleMap, toggleFn) {
  return `
    <div class="report-series-toggles" role="group" aria-label="${escHtml(tr('rpt_activity', 'Işjeňlik'))}">
      ${seriesList.map((s) => {
    const on = visibleMap[s.key] !== false;
    const label = reportSeriesLabel(s);
    return `
          <button type="button"
            class="report-series-chip${on ? ' is-on' : ''}"
            style="--series-color:${s.color}"
            onclick="${toggleFn}('${s.key}')"
            title="${on ? escHtml(label) : escHtml(label)}">
            <span class="report-series-dot"></span>
            ${escHtml(label)}
          </button>`;
  }).join('')}
    </div>`;
}

function drawTimelineReportChart() {
  const d = reportAnalyticsData;
  if (!d) return;
  const tl = d.timeline || { labels: [] };
  const chartType = (tl.labels || []).length <= 1 ? 'bar' : 'line';
  const datasets = REPORT_TIMELINE_SERIES
    .filter((s) => reportTimelineVisible[s.key] !== false)
    .map((s) => ({
      label: reportSeriesLabel(s),
      data: tl[s.field] || [],
      borderColor: s.color,
      backgroundColor: s.color,
    }));
  destroyReportChart('chart-timeline');
  makeChart('chart-timeline', {
    type: chartType,
    data: {
      labels: tl.labels || [],
      datasets: datasets.length
        ? datasets
        : [{ label: tr('rpt_no_data', 'Maglumat ýok'), data: (tl.labels || []).map(() => 0), borderColor: '#94a3b8', backgroundColor: '#94a3b8' }],
    },
  });
}

function toggleReportTimelineSeries(key) {
  if (!(key in reportTimelineVisible)) return;
  const onCount = Object.values(reportTimelineVisible).filter(Boolean).length;
  // Birini basyp diňe şony görkez; ýeke galanyny basyp ählisini gaýtar
  if (reportTimelineVisible[key] && onCount > 1) {
    REPORT_TIMELINE_SERIES.forEach((s) => {
      reportTimelineVisible[s.key] = s.key === key;
    });
  } else if (reportTimelineVisible[key] && onCount === 1) {
    REPORT_TIMELINE_SERIES.forEach((s) => { reportTimelineVisible[s.key] = true; });
  } else {
    reportTimelineVisible[key] = true;
  }
  const host = document.querySelector('#chart-timeline')?.closest('.report-chart-card');
  const toggles = host?.querySelector('.report-series-toggles');
  if (toggles) {
    toggles.outerHTML = reportSeriesTogglesHtml(
      REPORT_TIMELINE_SERIES,
      reportTimelineVisible,
      'toggleReportTimelineSeries',
    );
  }
  drawTimelineReportChart();
}

function drawOperatorReportChart() {
  const d = reportAnalyticsData;
  if (!d) return;
  const all = d.operators || [];
  const ops = reportOperatorFilter === 'all'
    ? all
    : all.filter((_, index) => String(index) === String(reportOperatorFilter));
  const datasets = REPORT_OPERATOR_SERIES
    .filter((s) => reportOperatorSeriesVisible[s.key] !== false)
    .map((s) => ({
      label: reportSeriesLabel(s),
      data: ops.map((o) => o[s.field] || 0),
      backgroundColor: s.color,
    }));
  destroyReportChart('chart-operators');
  makeChart('chart-operators', {
    type: 'bar',
    data: {
      labels: ops.length ? ops.map((o) => operatorShortName(o.name)) : [tr('rpt_no_data', 'Maglumat ýok')],
      datasets: datasets.length
        ? datasets
        : [{ label: tr('rpt_no_data', 'Maglumat ýok'), data: ops.map(() => 0), backgroundColor: '#94a3b8' }],
    },
  });
}

function filterReportOperator(value) {
  reportOperatorFilter = String(value ?? 'all');
  drawOperatorReportChart();
  const sel = document.querySelector('.report-operator-controls select');
  if (sel && [...sel.options].some((o) => o.value === reportOperatorFilter)) {
    sel.value = reportOperatorFilter;
  }
  document.querySelectorAll('.report-op-plan-table tbody tr').forEach((tr) => {
    tr.classList.toggle('report-op-row-active', tr.getAttribute('onclick')?.includes(`'${reportOperatorFilter}'`));
  });
}

function toggleReportOperatorSeries(key) {
  if (!(key in reportOperatorSeriesVisible)) return;
  const onCount = Object.values(reportOperatorSeriesVisible).filter(Boolean).length;
  if (reportOperatorSeriesVisible[key] && onCount > 1) {
    REPORT_OPERATOR_SERIES.forEach((s) => {
      reportOperatorSeriesVisible[s.key] = s.key === key;
    });
  } else if (reportOperatorSeriesVisible[key] && onCount === 1) {
    REPORT_OPERATOR_SERIES.forEach((s) => { reportOperatorSeriesVisible[s.key] = true; });
  } else {
    reportOperatorSeriesVisible[key] = true;
  }
  const host = document.querySelector('#chart-operators')?.closest('.report-chart-card');
  const toggles = host?.querySelector('.report-series-toggles');
  if (toggles) {
    toggles.outerHTML = reportSeriesTogglesHtml(
      REPORT_OPERATOR_SERIES,
      reportOperatorSeriesVisible,
      'toggleReportOperatorSeries',
    );
  }
  drawOperatorReportChart();
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function periodTitleRu(period) {
  if (period === 'day') return tr('rpt_daily', 'Gündelik');
  if (period === 'week') return tr('rpt_weekly', 'Hepdelik');
  if (period === 'year') return tr('rpt_yearly', 'Ýyllyk');
  return tr('rpt_monthly', 'Aýlyk');
}

async function renderAnalyticsReport(out) {
  destroyReportCharts();
  const seq = ++reportLoadSeq;
  await loadActivityAnchor();
  // Ilki döwür düwmeleri + sene meýdany (boş input 0 görkezmez ýaly)
  if (!['day', 'week', 'month', 'year'].includes(reportPeriod)) reportPeriod = 'month';
  if (!reportDefaultAnchorApplied) {
    reportDefaultAnchorApplied = true;
    if (activityAnchorDate) reportDate = activityAnchorDate;
  }
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate))) {
    reportDate = activityAnchorDate || todayIso();
  }
  syncReportPeriodButtons();
  syncReportDateInput();
  reportDate = readReportDateFromInput() || reportDate || activityAnchorDate || todayIso();
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate))) {
    reportDate = activityAnchorDate || todayIso();
    syncReportDateInput();
  }

  const params = new URLSearchParams({
    period: reportPeriod,
    date: reportDate,
  });
  out.innerHTML = `<p class="muted report-loading">${escHtml(tr('rpt_loading', 'Hasabat ýüklenýär...'))}</p>`;

  const res = await api.get(`/reports/analytics?${params}`);
  if (seq !== reportLoadSeq) return;
  const d = res.data;
  if (!d) throw new Error(tr('rpt_no_data', 'Hasabat maglumaty gelmedi'));
  reportAnalyticsData = d;

  const s = d.summary || {};
  const ops = d.operators || [];
  if (reportOperatorFilter !== 'all' && !ops[Number(reportOperatorFilter)]) {
    reportOperatorFilter = 'all';
  }
  const feePct = Math.round((d.feeRate || 0.5) * 100);
  const rangeText = d.fromDisplay === d.toDisplay
    ? d.fromDisplay
    : `${d.fromDisplay || d.from} — ${d.toDisplay || d.to}`;

  out.innerHTML = `
    <div class="report-analytics">
      <div class="report-analytics-head">
        <div>
          <h3 class="report-analytics-title">${periodTitleRu(d.period)} · ${escHtml(d.title || rangeText)}</h3>
          <p class="report-analytics-range">${escHtml(rangeText)} · ${escHtml(tr('rpt_agency', 'Agentstwa'))} ${feePct}% · ${escHtml(tr('rpt_real_data', 'hakyky maglumat'))}</p>
        </div>
      </div>

      <div class="report-kpi-grid">
        <div class="report-kpi report-kpi-gold">
          <span class="report-kpi-label">${escHtml(tr('rpt_anketa', 'Anketa'))}</span>
          <strong>${s.anketasInPeriod || 0}</strong>
          <small>${escHtml(tr('rpt_this_period', 'Bu döwürde'))}</small>
        </div>
        <div class="report-kpi report-kpi-blue">
          <span class="report-kpi-label">${escHtml(tr('rpt_vacancy', 'Wakansiýa'))}</span>
          <strong>${s.vacanciesInPeriod || 0}</strong>
          <small>${escHtml(tr('rpt_this_period', 'Bu döwürde'))}</small>
        </div>
        <div class="report-kpi report-kpi-green">
          <span class="report-kpi-label">${escHtml(tr('rpt_hired', 'Işe ýerleşen'))}</span>
          <strong>${s.hiredInPeriod || 0}</strong>
          <small>${escHtml(tr('rpt_this_period', 'Bu döwürde'))}</small>
        </div>
        <div class="report-kpi report-kpi-amber">
          <span class="report-kpi-label">${escHtml(tr('rpt_assignment', 'Hödürleme'))}</span>
          <strong>${s.assignmentsInPeriod || 0}</strong>
          <small>${escHtml(tr('rpt_accepted', 'Kabul'))} ${s.kabulInPeriod || 0}</small>
        </div>
        <div class="report-kpi report-kpi-money">
          <span class="report-kpi-label">${escHtml(tr('rpt_income', 'Girdeji'))} (${feePct}%)</span>
          <strong>${moneyFmt(s.agencyIncome)}</strong>
          <small>${s.placedFinanceCount || 0} ${escHtml(tr('rpt_placed', 'ýerleşdirilen'))}</small>
        </div>
      </div>

      <div class="report-fee-table-wrap">
        <table class="report-fee-table">
          <thead>
            <tr>
              <th>${escHtml(tr('fees_due', 'Almaly pul'))}</th>
              <th>${escHtml(tr('fees_received', 'Alnan pul'))}</th>
              <th>${escHtml(tr('fees_remaining', 'Galdy'))}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button type="button" class="report-num-btn report-fee-btn" onclick="openReportFeeDetails('due')" title="${escHtml(tr('fees_click_people', 'Adamlar sanawy'))}">
                  <strong>${moneyFmt(s.feeDue != null ? s.feeDue : s.agencyIncome)}</strong>
                </button>
              </td>
              <td class="report-fee-paid">
                <button type="button" class="report-num-btn report-fee-btn" onclick="openReportFeeDetails('received')" title="${escHtml(tr('fees_click_people', 'Adamlar sanawy'))}">
                  <strong>${moneyFmt(s.feeReceived || 0)}</strong>
                </button>
              </td>
              <td class="report-fee-left">
                <button type="button" class="report-num-btn report-fee-btn" onclick="openReportFeeDetails('remaining')" title="${escHtml(tr('fees_click_people', 'Adamlar sanawy'))}">
                  <strong>${moneyFmt(s.feeRemaining != null ? s.feeRemaining : ((s.feeDue != null ? s.feeDue : s.agencyIncome || 0) - (s.feeReceived || 0)))}</strong>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted report-fee-note">${escHtml(tr('fees_report_hint', 'Almaly / Alnan / Galdy — Tölegler bölümindäki ýaly (şol döwürde ýerleşenler we töleg ýazylanlar).'))}</p>
      </div>

      <div class="report-chart-grid">
        <div class="report-chart-card report-chart-wide">
          <div class="report-chart-head">
            <div class="report-chart-title">
              <h4>${escHtml(tr('rpt_activity', 'Işjeňlik'))}</h4>
              <span class="report-chart-tag">${d.period === 'year' ? escHtml(tr('rpt_by_month', 'aý boýunça')) : escHtml(tr('rpt_by_day', 'gün boýunça'))}</span>
            </div>
            ${reportChartTools('chart-timeline')}
          </div>
          ${reportSeriesTogglesHtml(REPORT_TIMELINE_SERIES, reportTimelineVisible, 'toggleReportTimelineSeries')}
          <p class="report-series-hint">${escHtml(tr('rpt_series_hint', 'Birini basyp diňe şony görüň · ýene basyp ählisini gaýtaryň'))}</p>
          <div class="report-chart-canvas-wrap report-chart-hero"><canvas id="chart-timeline"></canvas></div>
        </div>
        <div class="report-chart-card">
          <div class="report-chart-head">
            <div class="report-chart-title">
              <h4>${escHtml(tr('rpt_assignment', 'Hödürleme'))}</h4>
              <span class="report-chart-tag">${escHtml(tr('rpt_status', 'ýagdaý'))}</span>
            </div>
            ${reportChartTools('chart-assign-status')}
          </div>
          <div class="report-chart-canvas-wrap"><canvas id="chart-assign-status"></canvas></div>
        </div>
        <div class="report-chart-card">
          <div class="report-chart-head">
            <div class="report-chart-title">
              <h4>${escHtml(tr('rpt_anketa', 'Anketa'))}</h4>
              <span class="report-chart-tag">${escHtml(tr('rpt_in_period', 'bu döwürde'))}</span>
            </div>
            ${reportChartTools('chart-anketa-status')}
          </div>
          <div class="report-chart-canvas-wrap"><canvas id="chart-anketa-status"></canvas></div>
        </div>
        <div class="report-chart-card">
          <div class="report-chart-head report-chart-head-wrap">
            <div class="report-chart-title">
              <h4>${escHtml(tr('rpt_operators', 'Operatorlar'))}</h4>
              <span class="report-chart-tag">${escHtml(tr('rpt_activity', 'işjeňlik'))}</span>
            </div>
            <div class="report-operator-controls">
              <select onchange="filterReportOperator(this.value)" aria-label="${escHtml(tr('rpt_pick_operator', 'Operatory saýla'))}">
                <option value="all" ${reportOperatorFilter === 'all' ? 'selected' : ''}>${escHtml(tr('rpt_all_operators', 'Ähli operatorlar'))}</option>
                ${ops.map((op, index) => `
                  <option value="${index}" ${String(reportOperatorFilter) === String(index) ? 'selected' : ''}>
                    ${escHtml(operatorShortName(op.name) || `${tr('role_operator', 'Operator')} ${index + 1}`)}
                  </option>`).join('')}
              </select>
              ${reportChartTools('chart-operators')}
            </div>
          </div>
          ${reportSeriesTogglesHtml(REPORT_OPERATOR_SERIES, reportOperatorSeriesVisible, 'toggleReportOperatorSeries')}
          <div class="report-chart-canvas-wrap report-chart-tall"><canvas id="chart-operators"></canvas></div>
        </div>
        <div class="report-chart-card">
          <div class="report-chart-head">
            <div class="report-chart-title">
              <h4>${escHtml(tr('rpt_income', 'Girdeji'))}</h4>
              <span class="report-chart-tag">${feePct}% ${escHtml(tr('rpt_salary_tmt', 'aýlyk · TMT'))}</span>
            </div>
            ${reportChartTools('chart-finance')}
          </div>
          <div class="report-chart-canvas-wrap report-chart-tall"><canvas id="chart-finance"></canvas></div>
        </div>
      </div>
    </div>
  `;

  await waitForPaint();
  await new Promise((r) => setTimeout(r, 50));
  if (seq !== reportLoadSeq) return;

  const tl = d.timeline || { labels: [] };
  drawTimelineReportChart();

  const asg = d.assignmentStatus || { labels: [], values: [] };
  const asgRaw = asg.labels?.length ? asg.labels : [tr('rpt_no_data', 'Maglumat ýok')];
  const asgLabels = asgRaw.map((lab) => (window.I18n?.statusLabel ? I18n.statusLabel(lab) : lab));
  const asgValues = asg.values?.length ? asg.values : [0];
  makeChart('chart-assign-status', {
    type: 'doughnut',
    data: {
      labels: asgLabels,
      datasets: [{
        data: asgValues,
        backgroundColor: asgRaw.map((lab, i) => ASSIGN_STATUS_COLORS[lab]
          || [REPORT_COLORS.assignment, '#2563eb', '#0891b2', REPORT_COLORS.hired, '#9b3d3d', '#94a3b8'][i]
          || '#94a3b8'),
      }],
    },
  });

  makeChart('chart-anketa-status', {
    type: 'doughnut',
    data: {
      labels: [tr('rpt_working', 'Işleýär'), tr('rpt_seeking', 'Gözleýär')],
      datasets: [{
        data: [s.isleyarInPeriod || 0, s.islanokInPeriod || 0],
        backgroundColor: [REPORT_COLORS.hired, REPORT_COLORS.anketa],
      }],
    },
  });

  drawOperatorReportChart();

  makeChart('chart-finance', {
    type: 'bar',
    data: {
      labels: tl.labels || [],
      datasets: [{
        label: `${tr('rpt_income', 'Girdeji')} ${feePct}% (TMT)`,
        data: tl.agencyIncome || [],
        backgroundColor: REPORT_COLORS.money,
      }],
    },
    options: {
      // Her aýyň bahasy sütüniň ýokarsynda hemişe görünsin
      showValues: true,
    },
  });
}

function reportAnketaRowsHtml(items) {
  if (!items?.length) return '<tr><td colspan="6">Maglumat ýok</td></tr>';
  return items.map((a) => `
    <tr>
      <td><strong>№ ${escHtml(a.anketaNumber || '—')}</strong></td>
      <td>${formatDate(a.formDate) || '—'}</td>
      <td>
        <a href="#" class="link-faa" onclick="event.preventDefault(); openAnketaPage(a.id)">
          ${escHtml([a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ') || '—')}
        </a>
      </td>
      <td>${escHtml(formatAnketaPositionsDisplay(a))}</td>
      <td>${phoneHtml(a.phone)}</td>
      <td>
        <span class="badge ${a.status === 'Isleyar' ? 'badge-success' : 'badge-warning'}">${escHtml(a.status || '—')}</span>
        <button type="button" class="btn btn-sm btn-accent" style="margin-left:6px"
          onclick="closeModal(); matchAnketa(${a.id})">Deňeşdir</button>
      </td>
    </tr>`).join('');
}

async function openReportAnketasByStatus(status) {
  try {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await api.get(`/reports/anketas-by-status${q}`);
    const d = res.data;
    const title = status === 'Isleyar'
      ? 'Işleýär — anketalar'
      : status === 'Islanok'
        ? 'Gözleýär — anketalar'
        : 'Ähli anketalar';
    showModal(`
      <h3 style="margin-top:0">${title} (${d.total})</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>№</th><th>Sene</th><th>F.A.A</th><th>Wezipe</th><th>Telefon</th><th>Ýagdaý / Hereket</th></tr>
          </thead>
          <tbody>${reportAnketaRowsHtml(d.items)}</tbody>
        </table>
      </div>
    `, { wide: true });
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openPositionReportDetails(position, status = '') {
  try {
    const params = new URLSearchParams({ position });
    if (status) params.set('status', status);
    const res = await api.get(`/reports/by-position/details?${params}`);
    const d = res.data;
    const statusLabel = status === 'Isleyar' ? 'Işleýär' : status === 'Islanok' ? 'Gözleýär' : 'Jemi';
    const vacBtn = (d.matchVacancies || []).length
      ? `<button type="button" class="btn btn-accent btn-sm" onclick="openPositionOnMatch(${JSON.stringify(d.position)})">
           Deňeşdirme aç (${d.matchVacancies.length} açyk wakansiýa)
         </button>`
      : '<span class="muted">Bu wezipe boýunça açyk wakansiýa ýok</span>';

    showModal(`
      <h3 style="margin-top:0">${escHtml(d.position)} · ${statusLabel} (${d.total})</h3>
      ${(d.variants || []).length > 1 ? `
        <p class="muted" style="margin:0 0 10px">
          Birleşdirilen ýazylyşlar: ${(d.variants || []).map((v) => escHtml(v)).join(' · ')}
        </p>` : ''}
      <div class="toolbar" style="margin-bottom:12px">${vacBtn}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>№</th><th>Sene</th><th>F.A.A</th><th>Wezipe</th><th>Telefon</th><th>Ýagdaý / Hereket</th></tr>
          </thead>
          <tbody>${reportAnketaRowsHtml(d.items)}</tbody>
        </table>
      </div>
    `, { wide: true });
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function openPositionOnMatch(position) {
  try {
    closeModal();
    const res = await api.get(`/reports/by-position/details?position=${encodeURIComponent(position)}`);
    const vacs = res.data.matchVacancies || [];
    if (!vacs.length) {
      showAlert(document.getElementById('alert-box'), 'Bu wezipe boýunça açyk wakansiýa ýok', 'error');
      return;
    }
    // Birinji açyk wakansiýany deňeşdirmede aç
    await matchVacancy(vacs[0].id);
    showAlert(
      document.getElementById('alert-box'),
      `Deňeşdirme: ${vacs[0].companyName || ''} — ${vacs[0].position || position}`,
      'success',
    );
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function loadReport(type) {
  const out = document.getElementById('report-output');
  if (!out) return;
  out.innerHTML = '<p>Ýüklenýär...</p>';
  const q = new URLSearchParams({
    from: reportDate || todayIso(),
    to: reportDate || todayIso(),
  }).toString();

  try {
    if (type === 'analytics') {
      await renderAnalyticsReport(out);
      return;
    }

    destroyReportCharts();

    if (type === 'overview') {
      const res = await api.get('/reports/overview');
      const d = res.data;
      out.innerHTML = `
        <h3>Umumy hasabat</h3>
        <p class="muted">Sanlara basyň — jikme-jik sanaw açylar</p>
        <div class="cards" style="padding:0">
          <div class="card report-stat-card">
            <h3>Anketalar</h3>
            <button type="button" class="stat report-stat-btn" onclick="openReportAnketasByStatus('')">${d.anketas.total}</button>
            <p>
              <button type="button" class="link-faa" onclick="openReportAnketasByStatus('Isleyar')">Işleýär: ${d.anketas.isleyar}</button>
              ·
              <button type="button" class="link-faa" onclick="openReportAnketasByStatus('Islanok')">Gözleýär: ${d.anketas.islanok}</button>
            </p>
          </div>
          <div class="card">
            <h3>Wakansiýalar</h3>
            <p class="stat">${d.vacancies.total}</p>
            <p>Açyk: ${d.vacancies.acyk} | Ýapyk: ${d.vacancies.yapyk}</p>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'by-position') {
      const res = await api.get('/reports/by-position');
      const d = res.data || {};
      const rows = d.items || [];
      out.innerHTML = `
        <h3>Wezipe boýunça hasabat</h3>
        <p>
          <strong>Jemi wezipe:</strong> ${d.uniquePositions || rows.length}
          · <span class="muted">Çig ýazylyş: ${d.rawSpellings || '—'} (uly/kiçi harp, ýalňyş ýazylyş birleşdirildi)</span>
        </p>
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Wezipe</th>
              <th>Birleşen</th>
              <th>Jemi</th>
              <th>Işleýär</th>
              <th>Gözleýär</th>
              <th>Hereket</th>
            </tr>
          </thead>
          <tbody>${rows.map((r) => {
        const pos = JSON.stringify(r.position);
        const otherSpellings = (r.variants || []).filter((v) => v !== r.position);
        const variantsCell = otherSpellings.length
          ? `<small class="muted" title="${escHtml(otherSpellings.join(' · '))}">+${otherSpellings.length}: ${escHtml(otherSpellings.slice(0, 3).join(', '))}${otherSpellings.length > 3 ? '…' : ''}</small>`
          : '—';
        return `
            <tr>
              <td>
                <button type="button" class="link-faa" onclick='openPositionReportDetails(${pos}, "")'>${escHtml(r.position)}</button>
                ${otherSpellings.length ? `<div class="muted" style="font-size:11px;margin-top:2px">Birleşdi: ${escHtml(otherSpellings.slice(0, 4).join(' · '))}${otherSpellings.length > 4 ? '…' : ''}</div>` : ''}
              </td>
              <td>${variantsCell}</td>
              <td><button type="button" class="report-num-btn" onclick='openPositionReportDetails(${pos}, "")'><strong>${r.total}</strong></button></td>
              <td><button type="button" class="report-num-btn" onclick='openPositionReportDetails(${pos}, "Isleyar")'>${r.isleyar}</button></td>
              <td><button type="button" class="report-num-btn" onclick='openPositionReportDetails(${pos}, "Islanok")'>${r.islanok}</button></td>
              <td>
                <button type="button" class="btn btn-sm btn-accent" onclick='openPositionOnMatch(${pos})'>Deňeşdir</button>
              </td>
            </tr>`;
      }).join('') || '<tr><td colspan="6">Maglumat ýok</td></tr>'}</tbody>
        </table></div>
      `;
      return;
    }

    if (type === 'by-operator') {
      const res = await api.get('/vacancies/by-operator');
      out.innerHTML = `
        <h3>Forum operator boýunça wakansiýalar</h3>
        <p>Başlyk aýlyk bermek üçin her operatoryň kabul eden wakansiýalary</p>
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Forum operator</th><th>Rol</th><th>Jemi</th><th>Açyk</th><th>Ýapyk</th><th>Bizden alyndy</th>
            </tr>
          </thead>
          <tbody>${(res.data || []).map((r) => `
            <tr>
              <td>${escHtml(operatorShortName(r.forumOperator))}</td>
              <td>${r.role || '-'}</td>
              <td><strong>${r.total}</strong></td>
              <td>${r.acyk}</td>
              <td>${r.yapyk}</td>
              <td>${r.bizdenAlyndy}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">Maglumat ýok</td></tr>'}</tbody>
        </table></div>
      `;
      return;
    }

    const endpoints = {
      anketas: '/reports/anketas',
      vacancies: '/reports/vacancies',
      employed: '/reports/employed',
    };

    if (!endpoints[type]) {
      out.innerHTML = '<p class="muted">Bu hasabat ýok</p>';
      return;
    }

    const res = await api.get(`${endpoints[type]}?${q}`);
    const d = res.data;

    if (type === 'anketas') {
      out.innerHTML = `
        <h3>Anketalar hasabaty (${d.total})</h3>
        <p>
          <button type="button" class="link-faa" onclick="openReportAnketasByStatus('Isleyar')">Işleýär: ${d.isleyar}</button>
          ·
          <button type="button" class="link-faa" onclick="openReportAnketasByStatus('Islanok')">Gözleýär: ${d.islanok}</button>
        </p>
        <div class="table-wrap"><table>
          <thead><tr><th>№</th><th>Sene</th><th>F.A.A</th><th>Wezipe</th><th>Telefon</th><th>Ýagdaý</th></tr></thead>
          <tbody>${(d.items || []).map((a) => `
            <tr>
              <td>${a.anketaNumber}</td><td>${formatDate(a.formDate)}</td>
              <td>
                <a href="/admin/anketa-view.html?id=${a.id}" class="link-faa">
                  ${[a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ')}
                </a>
              </td>
              <td>${escHtml(formatAnketaPositionsDisplay(a))}</td><td>${phoneHtml(a.phone)}</td>
              <td>
                ${a.status}
                <button type="button" class="btn btn-sm btn-accent" style="margin-left:6px" onclick="matchAnketa(${a.id})">Deňeşdir</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }

    if (type === 'vacancies') {
      out.innerHTML = `
        <h3>Wakansiýalar hasabaty (${d.total})</h3>
        <p>Açyk: ${d.acyk} | Ýapyk: ${d.yapyk}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>№</th><th>Sene</th><th>Kärhana</th><th>Wezipe</th><th>Haky</th><th>Ýagdaý</th><th>Forum operator</th><th>Jogapkär</th></tr></thead>
          <tbody>${(d.items || []).map((v) => `
            <tr>
              <td>${v.vacancyNumber}</td><td>${formatDate(v.vacancyDate)}</td>
              <td>${v.companyName || '-'}</td><td>${v.position || '-'}</td>
              <td>${v.salary || '-'}</td><td>${v.status}</td>
              <td>${v.acceptedBy?.fullName || v.acceptedBy?.username || v.forumOperator || '-'}</td>
              <td>${v.contactName || '-'}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }

    if (type === 'employed') {
      out.innerHTML = `
        <h3>Işe ýerleşenler (${d.total})</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>№</th><th>F.A.A</th><th>Wezipe</th><th>Telefon</th><th>Sene</th></tr></thead>
          <tbody>${(d.items || []).map((a) => `
            <tr>
              <td>${a.anketaNumber}</td>
              <td>
                <a href="/admin/anketa-view.html?id=${a.id}" class="link-faa">
                  ${[a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ')}
                </a>
              </td>
              <td>${escHtml(formatAnketaPositionsDisplay(a))}</td><td>${phoneHtml(a.phone)}</td>
              <td>${formatDate(a.employmentDate)}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }
  } catch (e) {
    out.innerHTML = `<p style="color:red">${e.message}</p>`;
  }
}

function reportPrintPeriodLabel() {
  if (reportPeriod === 'day') return tr('rpt_daily', 'Gündelik');
  if (reportPeriod === 'week') return tr('rpt_weekly', 'Hepdelik');
  if (reportPeriod === 'year') return tr('rpt_yearly', 'Ýyllyk');
  return tr('rpt_monthly', 'Aýlyk');
}

function reportPrintNowText() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function prepareReportPrintClone(source) {
  const canvasMap = new Map();
  source.querySelectorAll('canvas').forEach((canvas, idx) => {
    try {
      const key = canvas.id || `canvas-${idx}`;
      if (canvas.width > 0 && canvas.height > 0) {
        canvasMap.set(key, canvas.toDataURL('image/png'));
      }
    } catch (e) { /* ignore */ }
  });

  const clone = source.cloneNode(true);
  clone.querySelectorAll('canvas').forEach((canvas, idx) => {
    const key = canvas.id || `canvas-${idx}`;
    const dataUrl = canvasMap.get(key);
    const img = document.createElement('img');
    img.className = 'print-chart-img';
    img.alt = canvas.id || 'chart';
    if (dataUrl) img.src = dataUrl;
    else {
      img.alt = tr('rpt_no_data', 'Maglumat ýok');
      img.style.minHeight = '80px';
    }
    canvas.replaceWith(img);
  });

  // Interaktiw / çapda gerek däl elementler
  clone.querySelectorAll(
    '.report-chart-tools, .report-series-toggles, .report-series-hint, .report-operator-controls, .report-loading',
  ).forEach((el) => el.remove());

  // Tablisa / KPI düwmelerini tekste öwür
  clone.querySelectorAll('button, a.link-faa, a.btn').forEach((el) => {
    const span = document.createElement('span');
    span.className = el.classList.contains('badge') ? el.className : 'print-text';
    span.textContent = (el.textContent || '').replace(/\s+/g, ' ').trim();
    el.replaceWith(span);
  });
  clone.querySelectorAll('select').forEach((el) => el.remove());

  // Çapda goşa başlyk bolmaz ýaly ekran başlygyny aýyr
  clone.querySelectorAll('.report-analytics-head').forEach((el) => el.remove());

  // Bölüm belgi: KPI we diagrammalar
  const kpi = clone.querySelector('.report-kpi-grid');
  if (kpi && !kpi.previousElementSibling?.classList?.contains('print-section-label')) {
    const label = document.createElement('div');
    label.className = 'print-section-label';
    label.textContent = tr('rpt_indicators', 'Umumy görkezijiler');
    kpi.parentNode.insertBefore(label, kpi);
  }
  const charts = clone.querySelector('.report-chart-grid');
  if (charts && !charts.previousElementSibling?.classList?.contains('print-section-label')) {
    const label = document.createElement('div');
    label.className = 'print-section-label';
    label.textContent = tr('rpt_charts', 'Diagrammalar');
    charts.parentNode.insertBefore(label, charts);
  }

  // Tablisa hasabatlarynda h3-den soň bölüm
  const table = clone.querySelector('table');
  if (table && !clone.querySelector('.report-kpi-grid')) {
    const wrap = table.closest('.table-wrap') || table;
    if (!wrap.previousElementSibling?.classList?.contains('print-section-label')) {
      const label = document.createElement('div');
      label.className = 'print-section-label';
      label.textContent = tr('rpt_table', 'Sanaw');
      wrap.parentNode.insertBefore(label, wrap);
    }
  }

  return clone;
}

async function printReport() {
  const source = document.getElementById('report-output');
  if (!source || !source.innerHTML.trim() || source.querySelector('.report-loading')) {
    showAlert(document.getElementById('alert-box'), tr('rpt_no_data', 'Maglumat ýok'), 'error');
    return;
  }

  const clone = prepareReportPrintClone(source);

  const title = reportAnalyticsData
    ? `${reportPrintPeriodLabel()} · ${tr('reports_title', 'Hasabatlar')}`
    : tr('reports_title', 'Hasabatlar');
  const period = reportPrintPeriodLabel();
  const range = reportAnalyticsData
    ? (reportAnalyticsData.fromDisplay === reportAnalyticsData.toDisplay
      ? (reportAnalyticsData.fromDisplay || reportDate)
      : `${reportAnalyticsData.fromDisplay || ''} — ${reportAnalyticsData.toDisplay || ''}`)
    : (reportDate || todayIso());
  const printedBy = user.fullName || user.username || '';
  const printedAt = reportPrintNowText();
  const brand = window.AgencyBrand?.brand || {};
  const brandFull = brand.full || 'Kerwen Agenstwa';
  const brandShort = brand.short || 'Kerwen';
  const brandMark = (brandShort || 'K').charAt(0).toUpperCase();
  const company = window.AgencyBrand?.company?.name
    || `${tr('rpt_agency', 'Agentstwa')} ${brandShort}`;
  const lang = (window.I18n && I18n.getLang && I18n.getLang() === 'ru') ? 'ru' : 'tk';
  const docNo = `KK-${String(reportDate || todayIso()).replace(/-/g, '')}-${reportPeriod || 'm'}`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)} — ${escHtml(brandShort)}</title>
  <style>
    @page { size: A4; margin: 12mm 11mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      color: #1f2933;
      font: 11.5px/1.45 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-sheet { max-width: 188mm; margin: 0 auto; }
    .print-topbar {
      height: 4px;
      background: linear-gradient(90deg, #a6853d 0%, #d4b56a 45%, #3d5a73 100%);
      border-radius: 2px;
      margin-bottom: 14px;
    }
    .print-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1.5px solid #e8e2d6;
    }
    .print-brand-mark {
      width: 42px; height: 42px;
      border-radius: 10px;
      background: linear-gradient(145deg, #c8a951, #8f6f2e);
      color: #fff;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: -0.04em;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .print-brand-row { display: flex; gap: 12px; align-items: center; }
    .print-brand strong {
      display: block;
      font-size: 17px;
      letter-spacing: -0.02em;
      color: #1f2933;
      line-height: 1.2;
    }
    .print-brand span { color: #6b7280; font-size: 11px; }
    .print-meta-card {
      background: #faf8f4;
      border: 1px solid #e8e2d6;
      border-radius: 10px;
      padding: 8px 12px;
      min-width: 168px;
      font-size: 10.5px;
      color: #4b5563;
      line-height: 1.55;
    }
    .print-meta-card b { color: #1f2933; font-weight: 650; }
    .print-meta-card .doc-no {
      display: block;
      font-size: 9.5px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #a6853d;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .print-title-block {
      margin: 0 0 16px;
      text-align: center;
      padding: 10px 12px 12px;
      background: linear-gradient(180deg, #fffcf7 0%, #fff 100%);
      border: 1px solid #ebe4d6;
      border-radius: 12px;
    }
    .print-title-block h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 750;
      letter-spacing: -0.02em;
      color: #1f2933;
    }
    .print-title-block p {
      margin: 4px 0 0;
      color: #6b7280;
      font-size: 12px;
    }
    .print-title-block .print-period-pill {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #f0e8d4;
      color: #7a5c1e;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .print-section-label {
      margin: 4px 0 8px;
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a6853d;
    }
    .report-analytics { margin: 0; }
    .report-kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 7px;
      margin-bottom: 16px;
    }
    .report-kpi {
      border: 1px solid #e6e0d4;
      border-radius: 10px;
      padding: 9px 10px 10px;
      background: #fffcf7;
      position: relative;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-kpi::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3.5px;
      background: #a6853d;
    }
    .report-kpi-blue::before { background: #3d5a73; }
    .report-kpi-green::before { background: #3d6b4f; }
    .report-kpi-amber::before { background: #6d28d9; }
    .report-kpi-money::before { background: #2e7d52; }
    .report-kpi-label {
      display: block;
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #7a8490;
      font-weight: 700;
      margin-bottom: 3px;
    }
    .report-kpi strong {
      display: block;
      font-size: 16px;
      line-height: 1.15;
      letter-spacing: -0.03em;
      color: #1f2933;
    }
    .report-kpi small { color: #8a92a0; font-size: 9.5px; }
    .report-chart-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: stretch;
    }
    .report-chart-card {
      border: 1px solid #e6e0d4;
      border-radius: 11px;
      padding: 10px 11px 11px;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .report-chart-wide { grid-column: 1 / -1; }
    .report-chart-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #ece7dc;
    }
    .report-chart-title {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .report-chart-title h4 {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      color: #1f2933;
    }
    .report-chart-tag {
      font-size: 9.5px;
      color: #7a8490;
      background: #f4f0e8;
      border-radius: 999px;
      padding: 2px 8px;
      font-weight: 600;
    }
    .report-chart-canvas-wrap {
      flex: 1;
      min-height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 0;
    }
    .report-chart-hero { min-height: 200px; }
    .report-chart-tall { min-height: 175px; }
    .print-chart-img {
      width: 100%;
      height: auto;
      max-height: 230px;
      object-fit: contain;
      display: block;
    }
    .report-chart-wide .print-chart-img { max-height: 250px; }
    .cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 0 !important;
      margin-bottom: 12px;
    }
    .card, .report-stat-card {
      border: 1px solid #e6e0d4;
      border-radius: 10px;
      padding: 12px 14px;
      background: #fffcf7;
      break-inside: avoid;
    }
    .card h3, .report-stat-card h3 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat, .report-stat-btn, .print-text {
      font-size: 20px;
      font-weight: 750;
      color: #1f2933;
    }
    h3 { margin: 0 0 8px; font-size: 15px; }
    p { margin: 0 0 10px; color: #4b5563; }
    .muted { color: #8a92a0; }
    .table-wrap { margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      border: 1px solid #e0d9cc;
      padding: 7px 8px;
      text-align: left;
      font-size: 10.5px;
      vertical-align: top;
    }
    th {
      background: #2a2f36;
      color: #fff;
      font-weight: 650;
      letter-spacing: 0.01em;
    }
    tbody tr:nth-child(even) td { background: #faf8f4; }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 9.5px;
      font-weight: 700;
      background: #f4f0e8;
      color: #5c6570;
    }
    .print-sign {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1.5px solid #e8e2d6;
    }
    .print-sign-box {
      break-inside: avoid;
    }
    .print-sign-box .label {
      font-size: 10px;
      color: #6b7280;
      margin-bottom: 28px;
      font-weight: 600;
    }
    .print-sign-box .line {
      border-bottom: 1px solid #9ca3af;
      height: 1px;
      margin-bottom: 6px;
    }
    .print-sign-box .hint {
      font-size: 9.5px;
      color: #9ca3af;
    }
    .print-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px dashed #e6e0d4;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #9ca3af;
      font-size: 9.5px;
    }
    @media print {
      body { padding: 0; }
      .report-chart-card, .report-kpi, .card, .print-sign-box, tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="print-sheet">
    <div class="print-topbar"></div>
    <header class="print-header">
      <div class="print-brand-row">
        <div class="print-brand-mark" aria-hidden="true">${escHtml(brandMark)}</div>
        <div class="print-brand">
          <strong>${escHtml(brandFull)}</strong>
          <span>${escHtml(company)} · Kadr hasabaty</span>
        </div>
      </div>
      <div class="print-meta-card">
        <span class="doc-no">${escHtml(docNo)}</span>
        <div><b>${escHtml(tr('rpt_period', 'Döwür'))}:</b> ${escHtml(period)}</div>
        <div><b>${escHtml(tr('rpt_date', 'Sene'))}:</b> ${escHtml(String(range || '—'))}</div>
        <div><b>${escHtml(tr('rpt_printed_at', 'Çap wagty'))}:</b> ${escHtml(printedAt)}</div>
      </div>
    </header>

    <div class="print-title-block">
      <h1>${escHtml(title)}</h1>
      <p>${escHtml(String(range || '—'))}</p>
      <span class="print-period-pill">${escHtml(period)} · ${escHtml(tr('rpt_real_data', 'hakyky maglumat'))}</span>
    </div>

    ${clone.innerHTML}

    <div class="print-sign">
      <div class="print-sign-box">
        <div class="label">${escHtml(tr('rpt_printed_by', 'Çapan'))}: ${escHtml(printedBy || '—')}</div>
        <div class="line"></div>
        <div class="hint">${escHtml(tr('rpt_signature', 'Gol / Signature'))}</div>
      </div>
      <div class="print-sign-box">
        <div class="label">${escHtml(tr('rpt_approved', 'Tassyklady'))}</div>
        <div class="line"></div>
        <div class="hint">${escHtml(tr('rpt_signature', 'Gol / Signature'))}</div>
      </div>
    </div>

    <footer class="print-footer">
      <span>${escHtml(brandShort)} Kadr</span>
      <span>${escHtml(printedAt)}</span>
    </footer>
  </div>
</body>
</html>`;

  const prev = document.getElementById('kerwen-print-frame');
  if (prev) prev.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'kerwen-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    showAlert(document.getElementById('alert-box'), tr('rpt_print_popup', 'Çap açylmady'), 'error');
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      showAlert(document.getElementById('alert-box'), e.message || tr('rpt_print_popup', 'Çap açylmady'), 'error');
    }
    setTimeout(() => {
      try { iframe.remove(); } catch (err) { /* ignore */ }
    }, 1500);
  };

  const imgs = [...doc.querySelectorAll('img.print-chart-img')];
  if (!imgs.length) {
    setTimeout(doPrint, 120);
    return;
  }
  let left = imgs.length;
  const done = () => {
    left -= 1;
    if (left <= 0) setTimeout(doPrint, 80);
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  });
  setTimeout(() => { if (left > 0) { left = 0; doPrint(); } }, 2500);
}

function setExcelResult(html) {
  const box = document.getElementById('excel-result');
  if (box) box.innerHTML = html;
}

function isLocalServerHost() {
  const h = String(location.hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h === 'kerwenkadr' || h.endsWith('.local')) return true;
  // Main PC-de LAN IP bilen açylan bolsa hem dialog şol PC-de açylýar
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return false;
}

const PHOTO_PATH_LS_KEY = 'kerwen_photo_scan_folder';
const PHOTO_KICI_LS_KEY = 'kerwen_photo_kici_folder';

function setScanFolderStatus(text, ok) {
  const el = document.getElementById('scan-folder-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === false ? '#b91c1c' : (ok ? '#166534' : 'var(--muted)');
}

async function refreshScanFolderStatus() {
  try {
    const res = await api.get('/photos/scan-folder', { timeoutMs: 30000 });
    const d = res.data || {};
    const pathStr = d.folderPath || '';
    const input = document.getElementById('photo-server-path');
    if (input && pathStr && !input.value) input.value = pathStr;
    setScanFolderStatus(
      pathStr
        ? `Skan (suratlar): ${pathStr} (${d.fileCount || 0} JPG)`
        : 'Skan papkasy bellenmedi — «suratlar/» basyň',
      d.exists !== false && Boolean(pathStr),
    );
  } catch (e) {
    setScanFolderStatus(e.message || 'Skan papkasy okalmady', false);
  }
  refreshKiciFolderStatus();
}

function setKiciFolderStatus(text, ok) {
  const el = document.getElementById('kici-folder-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === false ? '#b91c1c' : (ok ? '#166534' : 'var(--muted)');
}

function applyKiciFolderPath(folderPath) {
  const pathStr = String(folderPath || '').trim();
  if (!pathStr) return;
  const input = document.getElementById('photo-kici-path');
  if (input) input.value = pathStr;
  try { localStorage.setItem(PHOTO_KICI_LS_KEY, pathStr); } catch { /* ignore */ }
}

async function refreshKiciFolderStatus() {
  try {
    const res = await api.get('/photos/kici-folder', { timeoutMs: 15000 });
    const d = res.data || {};
    const pathStr = d.folderPath || '';
    if (pathStr) applyKiciFolderPath(pathStr);
    setKiciFolderStatus(
      pathStr
        ? `3×4 kici: ${pathStr} (${d.fileCount || 0} surat)`
        : '3×4 papkasy taýýarlanmady',
      Boolean(pathStr),
    );
  } catch {
    setKiciFolderStatus('3×4: Desktop\\anketa_kici_suratlar (awto)', true);
  }
}

async function saveScanFolderPath(folderPath) {
  const pathStr = String(folderPath || '').trim();
  if (!pathStr) throw new Error('Papka ýoly boş');
  const res = await api.post('/photos/scan-folder', { folderPath: pathStr }, { timeoutMs: 60000 });
  const saved = res.data?.folderPath || pathStr;
  applyServerFolderPath(saved);
  setScanFolderStatus(
    `Skan papkasy saklandy: ${saved} (${res.data?.fileCount || 0} surat)`,
    true,
  );
  return saved;
}

async function saveKiciFolderPath(folderPath) {
  const pathStr = String(folderPath || '').trim();
  if (!pathStr) throw new Error('Papka ýoly boş');
  const res = await api.post('/photos/kici-folder', { folderPath: pathStr }, { timeoutMs: 180000 });
  const saved = res.data?.folderPath || pathStr;
  const linked = res.data?.linked || 0;
  applyKiciFolderPath(saved);
  setKiciFolderStatus(
    `3×4 papkasy saklandy: ${saved} (${res.data?.fileCount || 0} surat)`
      + (linked ? ` · baglandy ${linked}` : ''),
    true,
  );
  return { saved, linked, fileCount: res.data?.fileCount || 0 };
}

function applyServerFolderPath(folderPath) {
  const pathStr = String(folderPath || '').trim();
  if (!pathStr) return;
  const input = document.getElementById('photo-server-path');
  if (input) input.value = pathStr;
  try { localStorage.setItem(PHOTO_PATH_LS_KEY, pathStr); } catch { /* ignore */ }
}

async function useTypedServerPath() {
  const raw = String(document.getElementById('photo-server-path')?.value || '').trim();
  if (!raw) {
    showAlert(document.getElementById('alert-box'), 'Papka ýoluny ýazyň', 'error');
    return;
  }
  try {
    const res = await api.post('/photos/resolve-folder', { folderPath: raw }, { timeoutMs: 30000 });
    const folderPath = res.data?.folderPath || raw;
    const saved = await saveScanFolderPath(folderPath);
    setExcelResult(`<p>Skan papkasy saklandy: <code>${escHtml(saved)}</code><br>Awgust 2026-dan öň anketalar JPG görkezişde açylar.</p>`);
    showAlert(document.getElementById('alert-box'), 'Skan papkasy saklandy', 'success');
  } catch (e) {
    setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`);
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function useTypedKiciPath() {
  const raw = String(document.getElementById('photo-kici-path')?.value || '').trim();
  if (!raw) {
    showAlert(document.getElementById('alert-box'), '3×4 papka ýoluny ýazyň', 'error');
    return;
  }
  try {
    const res = await api.post('/photos/resolve-folder', { folderPath: raw }, { timeoutMs: 30000 });
    const folderPath = res.data?.folderPath || raw;
    const { saved, linked } = await saveKiciFolderPath(folderPath);
    setExcelResult(
      `<p>3×4 papkasy saklandy: <code>${escHtml(saved)}</code>`
      + (linked ? ` · baglandy ${linked}` : '')
      + `</p>`,
    );
    showAlert(document.getElementById('alert-box'), '3×4 papkasy saklandy', 'success');
  } catch (e) {
    setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`);
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function useDesktopPhotoFolder() {
  try {
    setExcelResult('<p>Desktopda <code>Kerwen suratlar</code> papkasy taýýarlanýar…</p>');
    const res = await api.post('/photos/desktop-scan-dir', {}, { timeoutMs: 30000 });
    const saved = res.data?.folderPath || '';
    applyServerFolderPath(saved);
    setScanFolderStatus(
      `Desktop papkasy: ${saved} (${res.data?.fileCount || 0} surat)`,
      true,
    );
    setExcelResult(`
      <p><strong>Desktop papkasy taýýar</strong></p>
      <p><code>${escHtml(saved)}</code></p>
      <p class="muted">Suratly export edilende faýllar şu ýere № boýunça düşýär (mysal <code>26.7.66.jpg</code>).
      Täze PC-de şol papkany USB bilen alyp, «Papkadan saýla» ýa-da ýoly ýazyň → Sakla.</p>
    `);
    showAlert(document.getElementById('alert-box'), 'Desktop papkasy taýýar', 'success');
  } catch (e) {
    setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`);
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function useSuratlarFolder() {
  try {
    const res = await api.get('/photos/default-scan-dir', { timeoutMs: 15000 });
    const folderPath = res.data?.folderPath || '';
    if (!folderPath) throw new Error('suratlar/ ýoly tapylmady');
    const saved = await saveScanFolderPath(folderPath);
    setExcelResult(`<p>Proýekt papkasy: <code>${escHtml(saved)}</code><br>Skan JPG-leri şu ýere goýuň (içinde ýyl/aý papka hem bolup biler).</p>`);
    showAlert(document.getElementById('alert-box'), 'suratlar/ saklandy', 'success');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function pickServerPhotoFolder() {
  const btn = document.getElementById('btn-photo-pick-server');
  if (btn) btn.disabled = true;
  setExcelResult('<p>Skan papka: Windows dialog açylýar… <strong>Taskbar</strong>-da «Kerwen — skan…» serediň we <em>papkany</em> saýlaň.</p>');
  showAlert(document.getElementById('alert-box'), 'Skan: papka dialogyna serediň (taskbar)', 'success');
  try {
    const res = await api.post('/photos/pick-folder', { kind: 'scan' }, { timeoutMs: 300000 });
    const folderPath = res.data?.folderPath || '';
    if (!folderPath) throw new Error('Papka saýlanmady');
    const saved = await saveScanFolderPath(folderPath);
    await refreshScanFolderStatus();
    const statusEl = document.getElementById('scan-folder-status');
    setExcelResult(`<p>Skan papkasy saklandy: <code>${escHtml(saved)}</code>. Köne anketa açylanda <strong>JPG goni</strong> gelýär.</p><p class="muted">${escHtml(statusEl?.textContent || '')}</p>`);
    showAlert(document.getElementById('alert-box'), 'Skan papkasy saklandy', 'success');
  } catch (e) {
    setExcelResult(
      `<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`
      + '<p class="muted">Dialog açylmasa: ýoly inputa ýazyň → <strong>Sakla</strong>.</p>',
    );
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function pickKiciPhotoFolder() {
  const btn = document.getElementById('btn-photo-pick-kici');
  if (btn) btn.disabled = true;
  setExcelResult('<p>3×4 papka: Windows dialog açylýar… <strong>Taskbar</strong>-da «Kerwen — 3x4…» serediň we <em>papkany</em> saýlaň.</p>');
  showAlert(document.getElementById('alert-box'), '3×4: papka dialogyna serediň (taskbar)', 'success');
  try {
    const res = await api.post('/photos/pick-folder', { kind: 'kici' }, { timeoutMs: 300000 });
    const folderPath = res.data?.folderPath || '';
    if (!folderPath) throw new Error('Papka saýlanmady');
    const { saved, linked } = await saveKiciFolderPath(folderPath);
    await refreshKiciFolderStatus();
    setExcelResult(
      `<p>3×4 papkasy saklandy: <code>${escHtml(saved)}</code>. Täze 3×4 suratlar şu ýere ýazylar.`
      + (linked ? ` Baglandy: ${linked}.` : '')
      + `</p>`,
    );
    showAlert(document.getElementById('alert-box'), '3×4 papkasy saklandy', 'success');
  } catch (e) {
    setExcelResult(
      `<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`
      + '<p class="muted">Dialog açylmasa: ýoly inputa ýazyň → <strong>Sakla</strong>.</p>',
    );
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initPhotoDiskPathUi() {
  const box = document.getElementById('photo-disk-path-box');
  const hint = document.getElementById('photo-lan-hint');
  if (!box) return;
  box.style.display = '';
  if (hint) {
    if (isLocalServerHost()) {
      hint.style.display = 'none';
    } else {
      hint.style.display = '';
      hint.textContent = '«Papkadan saýla» dialogy Main (serwer) PC ekranynda açylýar. Ýa-da ýoly ýazyň → Sakla.';
    }
  }
  try {
    const saved = localStorage.getItem(PHOTO_PATH_LS_KEY);
    if (saved && document.getElementById('photo-server-path')) {
      document.getElementById('photo-server-path').value = saved;
    }
    const kiciSaved = localStorage.getItem(PHOTO_KICI_LS_KEY);
    if (kiciSaved && document.getElementById('photo-kici-path')) {
      document.getElementById('photo-kici-path').value = kiciSaved;
    }
  } catch { /* ignore */ }
  document.getElementById('btn-photo-use-path')?.addEventListener('click', () => useTypedServerPath());
  document.getElementById('btn-photo-use-suratlar')?.addEventListener('click', () => useSuratlarFolder());
  document.getElementById('btn-photo-pick-server')?.addEventListener('click', () => pickServerPhotoFolder());
  document.getElementById('btn-photo-pick-kici')?.addEventListener('click', () => pickKiciPhotoFolder());
  document.getElementById('btn-photo-use-kici-path')?.addEventListener('click', () => useTypedKiciPath());
  document.getElementById('btn-photo-auto-link-kici')?.addEventListener('click', async () => {
    const status = document.getElementById('kici-folder-status');
    try {
      if (status) status.textContent = '3×4: № boýunça baglanýar…';
      const res = await api.post('/photos/auto-link-kici', {}, { timeoutMs: 180000 });
      const d = res.data || {};
      const n = d.linked || 0;
      setKiciFolderStatus(
        `3×4 baglandy: ${n} surat`
        + (d.folderPath ? ` (${d.folderPath})` : '')
        + (d.unmatched ? ` · tapylmady ${d.unmatched}` : ''),
        true,
      );
      showAlert(document.getElementById('alert-box'), res.message || `${n} surat baglandy`, 'success');
    } catch (e) {
      setKiciFolderStatus(e.message || 'Baglama şowsuz', false);
      showAlert(document.getElementById('alert-box'), e.message || 'Baglama şowsuz', 'error');
    }
  });
  document.getElementById('photo-server-path')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      useTypedServerPath();
    }
  });
  document.getElementById('photo-kici-path')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      useTypedKiciPath();
    }
  });
  refreshScanFolderStatus();
  refreshKiciFolderStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhotoDiskPathUi);
} else {
  initPhotoDiskPathUi();
}

async function importAnketasExcel() {
  const input = document.getElementById('import-anketa-file');
  const btn = document.getElementById('btn-import-anketas');
  const file = input?.files?.[0];
  if (!file) {
    showAlert(document.getElementById('alert-box'), 'Anketa Excel ýa-da ZIP saýlaň', 'error');
    setExcelResult('<p style="color:#b91c1c">Ilki ANKETA_BAZA.xlsx ýa-da suratly ZIP saýlaň, soň «Ýükle» basyň.</p>');
    return;
  }
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  setExcelResult(`<p>Anketalar ýüklenýär… <span class="muted">(${escHtml(file.name)}, ${mb} MB). Birnäçe minut alyp bilýär — sahypany ýapmaň.</span></p>`);
  if (btn) btn.disabled = true;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await api.post('/excel/import/anketas', fd, { timeoutMs: 15 * 60 * 1000 });
    const colorNote = res.data.colorSkipped
      ? '<p style="color:#b45309"><strong>Üns:</strong> Ýaşyl/gyzyl reňk okalyp bilmedi — diňe sebäp sütüni ulanyldy.</p>'
      : '';
    const placeNote = `
      <p>
        <span style="color:#15803d">Ýaşyl (biziň ýerleşdiren): <strong>${Number(res.data.markedUs) || 0}</strong></span>
        &nbsp;|&nbsp;
        <span style="color:#b91c1c">Gyzyl (özi işe ýerleşen): <strong>${Number(res.data.markedSelf) || 0}</strong></span>
      </p>`;
    const photosTotal = Number(res.data.photosTotal) || 0;
    const photosLinked = Number(res.data.photosLinked) || 0;
    const photoNote = photosTotal
      ? `<p>Surat: ZIP-de <strong>${photosTotal}</strong> · baglanan <strong>${photosLinked}</strong>${
          Number(res.data.photosSkipped) ? ` · eýýäm bar: ${Number(res.data.photosSkipped)}` : ''
        }${
          Number(res.data.photosUnmatched) ? ` · tapylmadyk: ${Number(res.data.photosUnmatched)}` : ''
        }</p>`
      : '';
    setExcelResult(`
      <h3>Anketa import netijesi</h3>
      <p>Jemi: ${res.data.total} | Täze: ${res.data.created} | Täzelenen: ${res.data.updated} | Geçirilen: ${res.data.skipped} | Üýtgeşik №: ${res.data.unique || '—'}</p>
      ${placeNote}
      ${photoNote}
      ${colorNote}
      ${(res.data.errors || []).length ? `<pre>${res.data.errors.join('\n')}</pre>` : ''}
    `);
    showAlert(
      document.getElementById('alert-box'),
      photosLinked ? `Anketalar ýüklendi, ${photosLinked} surat baglandy` : 'Anketalar ýüklendi',
      'success',
    );
  } catch (e) {
    setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`);
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function importVacanciesExcel() {
  const input = document.getElementById('import-vacancy-file');
  const file = input?.files?.[0];
  if (!file) {
    showAlert(document.getElementById('alert-box'), 'Wakansiýa Excel faýlyny saýlaň', 'error');
    setExcelResult('<p style="color:#b91c1c">Ilki Mähri wakansiýalar.xlsx faýlyny saýlaň, soň «Excel-den ýükle» basyň.</p>');
    return;
  }

  let staff = [];
  try {
    const res = await api.get('/auth/staff');
    staff = (res.data || []).filter((u) => u.role === 'operator');
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
    return;
  }
  if (!staff.length) {
    showAlert(document.getElementById('alert-box'), 'Bazada operator ýok — ilki Ulanyjylar sekmesinde operator goşuň', 'error');
    return;
  }

  const opts = [
    '<option value="">— Operator saýlaň —</option>',
    ...staff.map((u) => `<option value="${u.id}">${escHtml(u.fullName || u.username)}</option>`),
  ].join('');

  showModal(`
    <h3 style="margin-top:0">${tr('excel_pick_operator', 'Wakansiýa Excel ýükle')}</h3>
    <p style="margin:0 0 10px"><strong>${escHtml(file.name)}</strong></p>
    <p style="margin:0 0 12px;color:var(--muted);font-size:0.92rem">
      <strong>Üns beriň:</strong> nädogry operator saýlasaňyz — ähli wakansiýalar şol adama geçýär.
      Bir operatoryň faýly bolsa — şol operatora baglaň.
      Birnäçe operator bir faýlda bolsa — «Excel-däki Forum operator» saýlaň (ady ulanyjy bilen <em>takyk</em> gabat gelmeli).
    </p>
    <div class="form-group" style="margin-bottom:10px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="radio" name="excel-op-mode" value="force" checked>
        Ähli setirler şu operatora
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px">
        <input type="radio" name="excel-op-mode" value="excel">
        Excel-däki «Forum operator» sütüni (setir setir)
      </label>
    </div>
    <div class="form-group" id="excel-op-select-wrap">
      <label>${tr('th_forum_op', 'Forum operator')} *</label>
      <select id="excel-import-operator">${opts}</select>
    </div>
    <div class="toolbar" style="margin-top:14px;gap:8px">
      <button type="button" class="btn btn-accent" id="btn-excel-vac-confirm">${tr('btn_excel_import', 'Excel-den ýükle')}</button>
      <button type="button" class="btn btn-ghost" onclick="closeModal()">${tr('btn_cancel', 'Ýatyr')}</button>
    </div>
  `);

  const syncModeUi = () => {
    const mode = document.querySelector('input[name="excel-op-mode"]:checked')?.value || 'force';
    const wrap = document.getElementById('excel-op-select-wrap');
    if (wrap) wrap.style.display = mode === 'force' ? '' : 'none';
  };
  document.querySelectorAll('input[name="excel-op-mode"]').forEach((el) => {
    el.addEventListener('change', syncModeUi);
  });
  syncModeUi();

  document.getElementById('btn-excel-vac-confirm').onclick = async () => {
    const mode = document.querySelector('input[name="excel-op-mode"]:checked')?.value || 'force';
    const opId = document.getElementById('excel-import-operator')?.value;
    if (mode === 'force' && !opId) {
      showAlert(document.getElementById('alert-box'), 'Forum operator saýlaň', 'error');
      return;
    }
    closeModal();
    const btn = document.getElementById('btn-import-vacancies');
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    setExcelResult(`<p>Wakansiýalar ýüklenýär… <span class="muted">(${escHtml(file.name)}, ${mb} MB). Birnäçe minut alyp bilýär — sahypany ýapmaň.</span></p>`);
    if (btn) btn.disabled = true;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('operatorMode', mode);
    if (mode === 'force' && opId) fd.append('acceptedByUserId', opId);
    try {
      const res = await api.post('/excel/import/vacancies', fd, { timeoutMs: 15 * 60 * 1000 });
      setExcelResult(`
        <h3>Wakansiýa import netijesi</h3>
        <p>Mod: <strong>${escHtml(res.data.operatorMode === 'excel' ? 'Excel setir setir' : 'Bir operator')}</strong></p>
        <p>Forum operator: <strong>${escHtml(res.data.forumOperator || '— (setir setir)')}</strong></p>
        <p>Jemi: ${res.data.total} | Täze: ${res.data.created} | Täzelenen: ${res.data.updated || 0} | Geçirilen: ${res.data.skipped}</p>
        ${res.data.numberFrom != null ? `<p>Täze berlen №: <strong>${res.data.numberFrom}</strong> … <strong>${res.data.numberTo}</strong></p>` : '<p class="muted">Ählisi eýýäm bardy — täze № berilmedi</p>'}
        <p>Operator baglanan: <strong>${res.data.operatorsLinked || 0}</strong>
          ${res.data.operatorsUnmatched ? ` | Tapylmady: <strong>${res.data.operatorsUnmatched}</strong>` : ''}</p>
        ${(res.data.errors || []).length ? `<pre>${res.data.errors.join('\n')}</pre>` : ''}
      `);
      showAlert(document.getElementById('alert-box'), 'Wakansiýalar ýüklendi', 'success');
      if (typeof loadAdminVacancies === 'function'
        && document.getElementById('tab-vacancies')
        && !document.getElementById('tab-vacancies').classList.contains('hidden')) {
        loadAdminVacancies();
      }
    } catch (e) {
      setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(e.message)}</p>`);
      showAlert(document.getElementById('alert-box'), e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

function getExcelExportPeriodParams() {
  const params = new URLSearchParams();
  const yearSel = document.getElementById('excel-export-year');
  const monthSel = document.getElementById('excel-export-month');
  const year = yearSel?.value || '';
  const month = monthSel?.value || '';
  // Aý saýlanan bolsa ýyl hem gerek — häzirki ýyly awto goýma (boş export bolmaz ýaly)
  if (month && !year) {
    showAlert(
      document.getElementById('alert-box'),
      tr('excel_need_year', 'Aý saýlanda ýyl hem saýlaň'),
      'error',
    );
    throw new Error(tr('excel_need_year', 'Aý saýlanda ýyl hem saýlaň'));
  }
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  const withPhotos = document.getElementById('excel-export-with-photos')?.checked;
  if (withPhotos) params.set('withPhotos', '1');
  return params;
}

function excelExportPeriodSuffix() {
  const year = document.getElementById('excel-export-year')?.value || '';
  const month = document.getElementById('excel-export-month')?.value || '';
  if (year && month) return `_${year}_${String(month).padStart(2, '0')}`;
  if (year) return `_${year}`;
  return '_tutush';
}

const EXCEL_MONTH_NAMES = [
  '', 'Ýanwar', 'Fewral', 'Mart', 'Aprel', 'Maý', 'Iýun',
  'Iýul', 'Awgust', 'Sentýabr', 'Oktýabr', 'Noýabr', 'Dekabr',
];

let excelExportPeriodsCache = null;

function excelPeriodCount(year, month) {
  const counts = excelExportPeriodsCache?.counts || {};
  if (!year) {
    return Number(excelExportPeriodsCache?.total) || 0;
  }
  const yc = counts[String(year)] || {};
  if (month) return Number(yc[String(month)]) || 0;
  return Number(yc.all) || 0;
}

function withPhotosHint(count) {
  const on = document.getElementById('excel-export-with-photos')?.checked;
  if (!on) return '';
  if (Number(count) > 80) {
    return ' · <b>suratly ZIP</b> — aý saýlaň (ýeňil) ýa-da ählisi bir ZIP-de geler';
  }
  return ' · suratly bir ZIP (Excel + suratlar)';
}

function updateExcelPeriodSummary() {
  const el = document.getElementById('excel-period-summary');
  if (!el) return;
  const year = document.getElementById('excel-export-year')?.value || '';
  const month = document.getElementById('excel-export-month')?.value || '';
  const withPhotos = Boolean(document.getElementById('excel-export-with-photos')?.checked);
  const count = excelPeriodCount(year, month);
  const yy = year ? String(year).slice(-2) : '';

  if (!year && !month) {
    const vacN = Number(excelExportPeriodsCache?.vacancyTotal) || 0;
    const vacPart = vacN ? ` · wakansiýa <b>${vacN}</b>` : '';
    el.innerHTML = count
      ? `<strong>Tutuş ähli</strong> · anketa <b>${count}</b>${vacPart} · Excel-e <b>hemmesi</b> çykýar${withPhotosHint(count)}`
      : `<strong>Tutuş ähli</strong> · döwür sanawy ýok — export ählisini synar`;
    el.className = withPhotos && count > 80
      ? 'excel-period-summary excel-period-summary--warn'
      : 'excel-period-summary excel-period-summary--ok';
    return;
  }

  if (year && !month) {
    el.innerHTML = `<strong>${escHtml(year)} ýyly</strong> · № <code>${escHtml(yy)}/…</code> · <b>${count}</b> anketa${withPhotosHint(count)}`;
    el.className = !count || (withPhotos && count > 120)
      ? 'excel-period-summary excel-period-summary--warn'
      : 'excel-period-summary';
    return;
  }

  if (year && month) {
    const mName = EXCEL_MONTH_NAMES[Number(month)] || month;
    if (!count) {
      el.innerHTML = `<strong>${escHtml(mName)} ${escHtml(year)}</strong> · bazada anketa ýok (№ <code>${escHtml(yy)}/${escHtml(month)}/…</code>). Başga aý saýlaň.`;
      el.className = 'excel-period-summary excel-period-summary--warn';
      return;
    }
    el.innerHTML = `<strong>${escHtml(mName)} ${escHtml(year)}</strong> · diňe № <code>${escHtml(yy)}/${escHtml(month)}/…</code> · <b>${count}</b> anketa${withPhotosHint(count)}`;
    el.className = 'excel-period-summary excel-period-summary--ok';
  }
}

function fillExcelMonthSelect(yearValue, prevMonth, { preferLatest = false } = {}) {
  const monthSel = document.getElementById('excel-export-month');
  if (!monthSel) return;
  const monthsByYear = excelExportPeriodsCache?.monthsByYear || {};
  let months = [];
  if (yearValue && monthsByYear[yearValue]) {
    months = monthsByYear[yearValue].slice();
  } else if (!yearValue) {
    const all = new Set();
    Object.values(monthsByYear).forEach((arr) => {
      (arr || []).forEach((m) => all.add(m));
    });
    months = [...all].sort((a, b) => a - b);
  }

  const opts = [yearValue
    ? `<option value="">Ählisi (şol ýyl)</option>`
    : `<option value="">Ählisi (tutuş)</option>`];
  months.forEach((m) => {
    const c = yearValue ? excelPeriodCount(yearValue, m) : 0;
    const label = c > 0
      ? `${m} — ${EXCEL_MONTH_NAMES[m] || m} (${c})`
      : `${m} — ${EXCEL_MONTH_NAMES[m] || m}`;
    opts.push(`<option value="${m}">${label}</option>`);
  });
  monthSel.innerHTML = opts.join('');

  if (prevMonth && [...monthSel.options].some((o) => o.value === String(prevMonth))) {
    monthSel.value = String(prevMonth);
  } else if (preferLatest && months.length) {
    monthSel.value = String(months[months.length - 1]);
  } else {
    monthSel.value = '';
  }
  updateExcelPeriodSummary();
}

async function initExcelPeriodSelects() {
  const yearSel = document.getElementById('excel-export-year');
  const monthSel = document.getElementById('excel-export-month');
  if (!yearSel || !monthSel) return;

  const prevYear = yearSel.value;
  const prevMonth = monthSel.value;
  const summary = document.getElementById('excel-period-summary');

  try {
    const res = await api.get('/excel/export-periods');
    excelExportPeriodsCache = res.data || { years: [], monthsByYear: {}, counts: {}, total: 0, vacancyTotal: 0 };
  } catch (err) {
    excelExportPeriodsCache = { years: [], monthsByYear: {}, counts: {}, total: 0, vacancyTotal: 0 };
    if (summary) {
      summary.className = 'excel-period-summary excel-period-summary--warn';
      summary.textContent = `Döwür ýüklenmedi: ${err.message || 'näbelli ýalňyşlyk'}`;
    }
  }

  const yearsRaw = excelExportPeriodsCache.years || [];
  const years = yearsRaw.filter((y) => excelPeriodCount(y, '') > 0);
  const yearList = years.length ? years : yearsRaw;
  const yearOpts = [`<option value="">Ählisi (tutuş)</option>`];
  yearList.forEach((y) => {
    const c = excelPeriodCount(y, '');
    yearOpts.push(`<option value="${y}">${y}${c ? ` (${c})` : ''}</option>`);
  });
  yearSel.innerHTML = yearOpts.join('');

  // Deslapdan «Ählisi (tutuş)» — ýyl/aý diňe süzgüç gerek bolsa saýlanýar
  if (prevYear && [...yearSel.options].some((o) => o.value === prevYear)) {
    yearSel.value = prevYear;
  } else {
    yearSel.value = '';
  }

  fillExcelMonthSelect(yearSel.value, prevMonth, { preferLatest: false });

  if (!yearList.length && summary && !summary.textContent.includes('ýüklenmedi')) {
    summary.className = 'excel-period-summary excel-period-summary--warn';
    summary.textContent = 'Bazada döwür tapylmady — «Ählisi (tutuş)» bilen ählisini çykaryp bilersiňiz.';
  }

  if (!yearSel.dataset.periodBound) {
    yearSel.dataset.periodBound = '1';
    yearSel.addEventListener('change', () => {
      const months = (excelExportPeriodsCache?.monthsByYear || {})[yearSel.value] || [];
      fillExcelMonthSelect(yearSel.value, '', {
        preferLatest: Boolean(yearSel.value && months.length),
      });
      updateExcelPeriodSummary();
    });
    monthSel.addEventListener('change', updateExcelPeriodSummary);
    document.getElementById('excel-export-with-photos')?.addEventListener('change', updateExcelPeriodSummary);
  }
  updateExcelPeriodSummary();
}

function exportAnketasExcel() {
  let params;
  try {
    params = getExcelExportPeriodParams();
  } catch (_) {
    return;
  }
  const withPhotos = params.get('withPhotos') === '1';
  const suffix = excelExportPeriodSuffix();
  const qs = params.toString();
  const base = suffix ? `ANKETA_BAZA${suffix}` : 'ANKETA_BAZA';
  const filename = withPhotos ? `${base}.zip` : `${base}.xlsx`;
  downloadExcel(`/excel/export/anketas${qs ? `?${qs}` : ''}`, filename);
}

function exportVacanciesExcel() {
  const sel = document.getElementById('excel-export-operator')?.value || '';
  let params;
  try {
    params = getExcelExportPeriodParams();
  } catch (_) {
    return;
  }
  // Wakansiýa export-da surat gerek däl
  params.delete('withPhotos');
  let filename = 'Mahri_wakansiyalar.xlsx';
  if (sel.startsWith('u:')) {
    params.set('acceptedByUserId', sel.slice(2));
    const name = document.getElementById('excel-export-operator')?.selectedOptions?.[0]?.textContent || 'operator';
    filename = `wakansiyalar_${String(name).trim().replace(/[^\w\-äöüňýşžçÄÖÜŇÝŞŽÇ]+/gi, '_') || 'operator'}.xlsx`;
  } else if (sel.startsWith('n:')) {
    params.set('forumOperator', sel.slice(2));
    filename = `wakansiyalar_${sel.slice(2).replace(/[^\w\-]+/gi, '_').slice(0, 40)}.xlsx`;
  }
  const periodSuffix = excelExportPeriodSuffix();
  if (periodSuffix) {
    filename = filename.replace(/\.xlsx$/i, `${periodSuffix}.xlsx`);
  }
  const qs = params.toString();
  downloadExcel(`/excel/export/vacancies${qs ? `?${qs}` : ''}`, filename);
}

function exportFeesExcel() {
  let params;
  try {
    params = getExcelExportPeriodParams();
  } catch (_) {
    return;
  }
  params.delete('withPhotos');
  const suffix = excelExportPeriodSuffix();
  const filename = suffix ? `Tolegler${suffix}.xlsx` : 'Tolegler.xlsx';
  const qs = params.toString();
  downloadExcel(`/excel/export/fees${qs ? `?${qs}` : ''}`, filename);
}

function exportFeesExcelFromTable() {
  const params = new URLSearchParams();
  if (feesPeriod) params.set('period', feesPeriod);
  if (feesDate) params.set('date', feesDate);
  const search = document.getElementById('fees-search')?.value || '';
  const anketaNumber = document.getElementById('fees-filter-number')?.value || '';
  const payStatus = document.getElementById('fees-pay-status')?.value || 'all';
  const workStatus = document.getElementById('fees-work-status')?.value || 'all';
  const operatorId = document.getElementById('fees-filter-operator')?.value || '';
  if (search) params.set('search', search);
  if (anketaNumber) params.set('anketaNumber', anketaNumber);
  if (payStatus && payStatus !== 'all') params.set('payStatus', payStatus);
  if (workStatus && workStatus !== 'all') params.set('workStatus', workStatus);
  if (operatorId) params.set('operatorId', operatorId);
  const qs = params.toString();
  const suffix = feesDate ? `_${String(feesDate).slice(0, 10)}` : '';
  downloadExcel(`/excel/export/fees${qs ? `?${qs}` : ''}`, `Tolegler${suffix}.xlsx`);
}

async function loadExcelExportOperators() {
  const select = document.getElementById('excel-export-operator');
  if (!select) return;
  const prev = select.value;
  try {
    const res = await api.get('/auth/staff');
    const staff = (res.data || []).filter((u) => u.role === 'operator' || u.role === 'admin');
    const seen = new Set();
    const options = [`<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`];
    staff.forEach((u) => {
      if (!u?.id || seen.has(`id:${u.id}`)) return;
      seen.add(`id:${u.id}`);
      const name = String(u.fullName || u.username || '').trim();
      if (name) seen.add(name.toLowerCase());
      options.push(`<option value="u:${u.id}">${escHtml(forumOperatorOptionLabel(u))}</option>`);
    });
    try {
      const byOp = await api.get('/vacancies/by-operator');
      (byOp.data || []).forEach((row) => {
        const name = String(row.forumOperator || '').trim();
        if (!name || name === 'Bellenmedik') return;
        if (seen.has(name.toLowerCase())) return;
        if (row.acceptedByUserId && seen.has(`id:${row.acceptedByUserId}`)) return;
        seen.add(name.toLowerCase());
        options.push(`<option value="n:${escHtml(name)}">${escHtml(name)}</option>`);
      });
    } catch (_) { /* ignore */ }
    select.innerHTML = options.join('');
    if (prev && [...select.options].some((o) => o.value === prev)) select.value = prev;
  } catch (_) {
    select.innerHTML = `<option value="">${tr('all_operators', 'Ähli operatorlar')}</option>`;
  }
}

async function downloadExcel(endpoint, filename) {
  setExcelResult(`<p>${escHtml(filename)} taýýarlanýar...</p>`);
  try {
    const token = (window.Auth && Auth.getToken()) || '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20 * 60 * 1000);
    let res;
    try {
      res = await fetch(`/api${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const type = res.headers.get('Content-Type') || '';
    if (!res.ok) {
      let msg = 'Export şowsuz boldy';
      if (type.includes('application/json')) {
        const data = await res.json();
        msg = data.message || msg;
      } else if (res.status === 404) {
        msg = 'Bu döwürde anketa tapylmady. Başga ýyl/aý saýlaň.';
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const count = res.headers.get('X-Export-Count');
    const photos = res.headers.get('X-Export-Photos');
    const folderCopied = res.headers.get('X-Export-Folder-Copied');
    let folderPathHdr = res.headers.get('X-Export-Folder-Path') || '';
    try { folderPathHdr = folderPathHdr ? decodeURIComponent(folderPathHdr) : ''; } catch { /* ignore */ }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const countTxt = count != null && count !== '' ? ` <strong>${escHtml(count)}</strong> setir.` : '';
    const photoTxt = photos && Number(photos) > 0
      ? ` <strong>${escHtml(photos)}</strong> surat ZIP-de.`
      : (String(filename).toLowerCase().endsWith('.zip') ? ' <span style="color:#b45309">ZIP-de surat ýok</span> — papka ýa-da /uploads barlaň.' : '');
    const folderTxt = folderCopied && Number(folderCopied) > 0
      ? ` Papka: <strong>${escHtml(folderCopied)}</strong> surat → <code>${escHtml(folderPathHdr || 'surat papkasy')}</code>.`
      : '';
    const fmtHint = String(filename).toLowerCase().endsWith('.zip')
      ? ' ZIP + daşarky papka (№.jpg).'
      : ' Excel-de <strong>gök başlyk + filter ▼</strong> görünmeli.';
    setExcelResult(`<p>${escHtml(filename)} ýüklendi.${countTxt}${photoTxt}${folderTxt}${fmtHint}</p>`);
    showAlert(
      document.getElementById('alert-box'),
      `${filename} ýüklendi${count ? ` (${count} setir)` : ''}${photos && Number(photos) > 0 ? `, ${photos} surat` : ''}${folderCopied && Number(folderCopied) > 0 ? `, papka ${folderCopied}` : ''}`,
      'success',
    );
  } catch (e) {
    let msg = e.message || 'Export şowsuz';
    if (e.name === 'AbortError') {
      msg = 'Export gaty uzaga çekdi. Ýyl/aý saýlaň ýa-da suratly export-y bir aý bilen synanyň.';
    } else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      msg = 'Export şowsuz: serwer jogap bermedi. Suratly ZIP uly bolup biler — aý saýlaň ýa-da serweri täzeden açyň.';
    }
    setExcelResult(`<p style="color:#b91c1c">Ýalňyşlyk: ${escHtml(msg)}</p>`);
    showAlert(document.getElementById('alert-box'), msg, 'error');
  }
}

window.importAnketasExcel = importAnketasExcel;
window.importVacanciesExcel = importVacanciesExcel;
window.exportAnketasExcel = exportAnketasExcel;
window.exportVacanciesExcel = exportVacanciesExcel;
window.exportFeesExcel = exportFeesExcel;
window.exportFeesExcelFromTable = exportFeesExcelFromTable;
window.loadExcelExportOperators = loadExcelExportOperators;
window.initExcelPeriodSelects = initExcelPeriodSelects;

document.getElementById('btn-import-anketas')?.addEventListener('click', importAnketasExcel);
document.getElementById('btn-export-anketas')?.addEventListener('click', exportAnketasExcel);
document.getElementById('btn-import-vacancies')?.addEventListener('click', importVacanciesExcel);
document.getElementById('btn-export-vacancies')?.addEventListener('click', exportVacanciesExcel);
document.getElementById('btn-export-fees')?.addEventListener('click', exportFeesExcel);

// Excel tab açylanda operator sanawyny doldur
document.querySelector('[data-tab="excel"]')?.addEventListener('click', () => {
  initExcelPeriodSelects();
  loadExcelExportOperators();
});
initExcelPeriodSelects();
loadExcelExportOperators();


async function loadUsers() {
  if (!isAdmin) return;
  const params = new URLSearchParams();
  const search = document.getElementById('user-search')?.value || '';
  const role = document.getElementById('user-role-filter')?.value || '';
  const active = document.getElementById('user-active-filter')?.value || '';
  if (search) params.set('search', search);
  if (role) params.set('role', role);
  if (active) params.set('active', active);

  try {
    const res = await api.get(`/auth/users?${params}`);
    window.__usersCache = {};
    (res.data || []).forEach((u) => { window.__usersCache[u.id] = u; });

    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = (res.data || []).map((u) => {
      const canDel = Boolean(u.canDeleteAnketa);
      const delBadge = u.role === 'admin'
        ? '<span class="badge badge-info">Admin</span>'
        : `<span class="badge ${canDel ? 'badge-success' : 'badge-danger'}">${canDel ? 'Rugsat bar' : 'Ýok'}</span>`;
      const delToggle = u.role === 'operator'
        ? `<button class="btn btn-sm ${canDel ? 'btn-ghost' : 'btn-accent'}" type="button"
             onclick="toggleUserCanDeleteAnketa(${u.id}, ${canDel})"
             title="${canDel ? 'Rugsaty aýyr' : 'Rugsat ber'}">${canDel ? 'Rugsaty aýyr' : 'Rugsat ber'}</button>`
        : '';
      return `
      <tr>
        <td>${u.id}</td>
        <td>${escHtml(u.fullName || '-')}</td>
        <td>${escHtml(u.username)}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-info' : 'badge-warning'}">${escHtml(u.role)}</span></td>
        <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? 'Hawa' : 'Ýok'}</span></td>
        <td>${delBadge}</td>
        <td class="col-actions">
          <div class="actions-cell">
            <button class="btn btn-sm btn-ghost" onclick="editUser(${u.id})">Üýtget</button>
            ${delToggle}
            <button class="btn btn-sm btn-ghost" onclick="toggleUserActive(${u.id}, ${u.isActive})">${u.isActive ? 'Işjeň däl et' : 'Işjeň et'}</button>
            ${u.id !== user.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Pozmak</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">Ulanyjy ýok</td></tr>';
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

function syncUserDeleteAnketaField() {
  const role = document.getElementById('user-role')?.value || 'operator';
  const wrap = document.getElementById('user-delete-anketa-wrap');
  const sel = document.getElementById('user-can-delete-anketa');
  if (!wrap) return;
  const isOp = role === 'operator';
  wrap.hidden = !isOp;
  if (!isOp && sel) sel.value = 'false';
}

function resetUserForm() {
  const form = document.getElementById('user-form');
  if (!form) return;
  form.reset();
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-form-title').textContent = 'Täze ulanyjy';
  document.getElementById('user-submit-btn').textContent = 'Goş';
  document.getElementById('user-pass-hint').textContent = '*';
  document.getElementById('user-password').required = true;
  document.getElementById('user-cancel-btn').style.display = 'none';
  document.getElementById('user-role').value = 'operator';
  document.getElementById('user-active').value = 'true';
  const delSel = document.getElementById('user-can-delete-anketa');
  if (delSel) delSel.value = 'false';
  syncUserDeleteAnketaField();
}

function editUser(id) {
  const u = (window.__usersCache || {})[id];
  if (!u) return;
  document.getElementById('user-edit-id').value = u.id;
  document.getElementById('user-fullName').value = u.fullName || '';
  document.getElementById('user-username').value = u.username || '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-pass-hint').textContent = '(üýtgetmek isleseňiz)';
  document.getElementById('user-role').value = u.role || 'operator';
  document.getElementById('user-active').value = u.isActive ? 'true' : 'false';
  const delSel = document.getElementById('user-can-delete-anketa');
  if (delSel) delSel.value = u.canDeleteAnketa ? 'true' : 'false';
  syncUserDeleteAnketaField();
  document.getElementById('user-form-title').textContent = `Üýtget: ${u.username}`;
  document.getElementById('user-submit-btn').textContent = 'Ýatda sakla';
  document.getElementById('user-cancel-btn').style.display = '';
  document.getElementById('user-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleUserActive(id, isActive) {
  try {
    await api.put(`/auth/users/${id}`, { isActive: !isActive });
    showAlert(document.getElementById('alert-box'), 'Ýagdaý üýtgedildi', 'success');
    loadUsers();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function toggleUserCanDeleteAnketa(id, currentlyAllowed) {
  const u = (window.__usersCache || {})[id];
  if (!u || u.role !== 'operator') return;
  const next = !currentlyAllowed;
  const label = u.fullName || u.username || id;
  const msg = next
    ? `«${label}» üçin anketa pozmak rugsatyny bermek isleýärsiňizmi?`
    : `«${label}» üçin anketa pozmak rugsatyny aýyrmak isleýärsiňizmi?`;
  if (!confirm(msg)) return;
  try {
    await api.put(`/auth/users/${id}`, { canDeleteAnketa: next });
    showAlert(
      document.getElementById('alert-box'),
      next ? 'Rugsat berildi — operator anketany pozup bilýär' : 'Rugsat aýryldy — operator anketany pozup bilmeýär',
      'success',
    );
    loadUsers();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

async function deleteUser(id) {
  const u = (window.__usersCache || {})[id];
  const name = u?.username || id;
  if (!confirm(`«${name}» ulanyjyny pozmak isleýärsiňizmi?`)) return;
  try {
    await api.delete(`/auth/users/${id}`);
    showAlert(document.getElementById('alert-box'), 'Ulanyjy pozuldy', 'success');
    resetUserForm();
    loadUsers();
  } catch (e) {
    showAlert(document.getElementById('alert-box'), e.message, 'error');
  }
}

const userForm = document.getElementById('user-form');
if (userForm) {
  document.getElementById('user-role')?.addEventListener('change', syncUserDeleteAnketaField);
  syncUserDeleteAnketaField();
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    const id = document.getElementById('user-edit-id').value;
    const role = document.getElementById('user-role').value;
    const payload = {
      fullName: document.getElementById('user-fullName').value.trim(),
      username: document.getElementById('user-username').value.trim(),
      role,
      isActive: document.getElementById('user-active').value === 'true',
      canDeleteAnketa: role === 'operator'
        && document.getElementById('user-can-delete-anketa')?.value === 'true',
    };
    const password = document.getElementById('user-password').value;
    if (password) payload.password = password;

    try {
      if (id) {
        if (!password) delete payload.password;
        await api.put(`/auth/users/${id}`, payload);
        showAlert(document.getElementById('alert-box'), 'Ulanyjy täzelendi', 'success');
      } else {
        if (!password) {
          showAlert(document.getElementById('alert-box'), 'Täze ulanyjy üçin parol hökmany', 'error');
          return;
        }
        await api.post('/auth/users', payload);
        showAlert(document.getElementById('alert-box'), 'Ulanyjy goşuldy', 'success');
      }
      resetUserForm();
      loadUsers();
    } catch (err) {
      showAlert(document.getElementById('alert-box'), err.message, 'error');
    }
  });
}

window.toggleVacancyCreate = toggleVacancyCreate;
window.toggleAnketaCreate = toggleAnketaCreate;
window.loadUsers = loadUsers;
window.editUser = editUser;
window.resetUserForm = resetUserForm;
window.toggleUserActive = toggleUserActive;
window.toggleUserCanDeleteAnketa = toggleUserCanDeleteAnketa;
window.deleteUser = deleteUser;

function bindEasySearch(inputId, onSearch, debounceMs = 280) {
  const el = document.getElementById(inputId);
  if (!el || el.dataset.easyBound) return;
  el.dataset.easyBound = '1';
  let timer = null;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onSearch(), debounceMs);
  };
  el.addEventListener('input', run);
  el.addEventListener('change', run);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      onSearch();
    }
  });
}

bindEasySearch('anketa-search', loadAnketas);
bindEasySearch('anketa-filter-faa', loadAnketas);
bindEasySearch('anketa-filter-position', loadAnketas);
bindEasySearch('anketa-filter-phone', loadAnketas);
bindEasySearch('anketa-filter-number', loadAnketas);
bindEasySearch('vacancy-filter-company', loadAdminVacancies);
bindEasySearch('vacancy-filter-position', loadAdminVacancies);
bindEasySearch('vacancy-filter-salary', loadAdminVacancies);
bindEasySearch('vacancy-filter-number', loadAdminVacancies);
bindEasySearch('assigned-search', loadAssigned);
bindEasySearch('assigned-filter-number', loadAssigned);
bindEasySearch('assigned-filter-faa', loadAssigned);
bindEasySearch('assigned-filter-phone', loadAssigned);
bindEasySearch('assigned-filter-company', loadAssigned);
bindEasySearch('assigned-filter-position', loadAssigned);
bindEasySearch('assigned-filter-salary', loadAssigned);
bindEasySearch('assigned-filter-vacancy-number', loadAssigned);
bindEasySearch('fees-search', loadFeePayments);
bindEasySearch('fees-filter-number', loadFeePayments);
bindEasySearch('user-search', loadUsers);
bindSmartTables();

window.showModal = showModal;
window.closeModal = closeModal;
window.openNewVacancyPage = openNewVacancyPage;
window.resetAnketaFilters = resetAnketaFilters;
window.loadAnketas = loadAnketas;
window.loadAdminVacancies = loadAdminVacancies;
window.resetVacancyFilters = resetVacancyFilters;
window.resetAssignedFilters = resetAssignedFilters;
window.loadFeePayments = loadFeePayments;
window.resetFeeFilters = resetFeeFilters;
window.setFeesPeriod = setFeesPeriod;
window.onFeesDateChange = onFeesDateChange;
window.goFeesToday = goFeesToday;
window.shiftFeesPeriod = shiftFeesPeriod;
window.openFeePaymentModal = openFeePaymentModal;
window.openReportFeeDetails = openReportFeeDetails;
window.submitFeePayment = submitFeePayment;
window.deleteFeePayment = deleteFeePayment;
window.addVacancyCloseReasonFromUi = addVacancyCloseReasonFromUi;
window.toggleVacancy = toggleVacancy;
window.confirmCloseVacancy = confirmCloseVacancy;
window.onAssignmentStatusChange = onAssignmentStatusChange;
window.printAnketa = printAnketa;
window.printContractOnly = printContractOnly;
window.printDilHaty = printDilHaty;
window.dilHatyButtonHtml = dilHatyButtonHtml;
window.assignedPrintButtonHtml = assignedPrintButtonHtml;
window.openSalaryReceiveModal = openSalaryReceiveModal;
window.savePassportAndPrintContract = savePassportAndPrintContract;
window.openAnketaAssignments = openAnketaAssignments;
window.openAnketaPage = openAnketaPage;
window.openReportAnketasByStatus = openReportAnketasByStatus;
window.openPositionReportDetails = openPositionReportDetails;
window.openPositionOnMatch = openPositionOnMatch;
window.setReportPeriod = setReportPeriod;
window.onReportDateChange = onReportDateChange;
window.goReportToday = goReportToday;
window.shiftReportPeriod = shiftReportPeriod;
window.zoomReportChart = zoomReportChart;
window.filterReportOperator = filterReportOperator;
window.toggleReportTimelineSeries = toggleReportTimelineSeries;
window.toggleReportOperatorSeries = toggleReportOperatorSeries;
window.loadReport = loadReport;
window.printReport = printReport;
window.toggleMatchSelectAll = toggleMatchSelectAll;
window.runMatch = runMatch;
window.setMatchStatusFilter = setMatchStatusFilter;
window.setMatchVacancyFilter = setMatchVacancyFilter;
window.matchAnketa = matchAnketa;
window.matchVacancy = matchVacancy;
window.previewVacancyForCall = previewVacancyForCall;
window.assignMatch = assignMatch;
window.openVacancyAssignments = openVacancyAssignments;
window.sendMatchCandidatesEmail = sendMatchCandidatesEmail;
window.openMatchEmailModal = openMatchEmailModal;
window.confirmSendMatchEmail = confirmSendMatchEmail;
window.submitGmailMailLogin = submitGmailMailLogin;
window.refreshMatchMailStatus = refreshMatchMailStatus;
window.openMatchGmailDraft = openMatchGmailDraft;
window.sendMatchViaFilesAndGmail = sendMatchViaFilesAndGmail;
window.logoutMatchMailAccount = logoutMatchMailAccount;
window.loadMailSettings = loadMailSettings;
window.saveCompanyMailSettings = saveCompanyMailSettings;
window.clearCompanyMailSettings = clearCompanyMailSettings;

(async () => {
  await refreshAuthProfile();

  window.onOptionListChanged = async (key, data) => {
    if (key === 'vacancy_close_reasons') {
      vacancyCloseReasonsCache = normalizeVacancyCloseReasonsCache(data);
      await refreshVacancyCloseReasonFilter();
    }
    if (key === 'assignment_statuses' && data?.items?.length) {
      assignmentStatusesCache = data.items.slice();
      if (document.getElementById('tab-assigned') && !document.getElementById('tab-assigned').classList.contains('hidden')) {
        loadAssigned();
      }
    }
  };

  if (window.OptionLists) {
    try {
      const asg = await OptionLists.fetchList('assignment_statuses');
      if (asg?.items?.length) assignmentStatusesCache = asg.items.slice();
    } catch (_) { /* defaults */ }
    await OptionLists.hydrateAllSelects();
  }

  await loadVacancyForumOperatorFilter();

  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const created = params.get('created');
  const createdType = params.get('createdType');
  const vacancyId = params.get('vacancyId');
  const anketaId = params.get('anketaId');
  const openAssignmentsId = Number(params.get('openAssignments')) || 0;
  if (tab) {
    if (tab === 'assigned') {
      const fromUrl = {};
      Object.keys(ASSIGNED_FILTER_FIELD_MAP).forEach((key) => {
        const v = params.get(key);
        if (v) fromUrl[key] = v;
      });
      let state = fromUrl;
      if (!Object.keys(state).length) {
        try {
          state = JSON.parse(sessionStorage.getItem(ASSIGNED_FILTERS_KEY) || '{}') || {};
        } catch (_) {
          state = {};
        }
      }
      applyAssignedFilterState(state);
    }
    if (tab === 'match' && anketaId) {
      pendingMatchAnketaId = Number(anketaId) || anketaId;
      switchTab(tab, document.querySelector(`[data-tab="${tab}"]`), { skipHistory: true });
      if (created) {
        const msg = createdType === 'vacancy'
          ? `Wakansiýa goşuldy: № ${created}`
          : `Anketa goşuldy: № ${created}`;
        showAlert(document.getElementById('alert-box'), msg, 'success');
      }
      writeDashboardHistory(tab, { replace: true });
      if (typeof window.EscNav?.onDashboardTab === 'function') {
        EscNav.onDashboardTab(tab, anketaId ? { anketaId } : (vacancyId ? { vacancyId } : null));
      }
      return;
    }
    if (tab === 'match' && vacancyId) {
      pendingMatchVacancyId = Number(vacancyId) || vacancyId;
      rememberMatchVacancy(pendingMatchVacancyId);
      switchTab(tab, document.querySelector(`[data-tab="${tab}"]`), { skipHistory: true });
      if (created) {
        const msg = createdType === 'vacancy'
          ? `Wakansiýa goşuldy: № ${created}`
          : `Anketa goşuldy: № ${created}`;
        showAlert(document.getElementById('alert-box'), msg, 'success');
      }
      writeDashboardHistory(tab, { replace: true });
      if (typeof window.EscNav?.onDashboardTab === 'function') {
        EscNav.onDashboardTab(tab, { vacancyId });
      }
      return;
    }
    switchTab(tab, document.querySelector(`[data-tab="${tab}"]`), { skipHistory: true });
    if (created) {
      const msg = createdType === 'vacancy'
        ? `Wakansiýa goşuldy: № ${created}`
        : `Anketa goşuldy: № ${created}`;
      showAlert(document.getElementById('alert-box'), msg, 'success');
    }
    writeDashboardHistory(tab, { replace: true });
    if (typeof window.EscNav?.onDashboardTab === 'function') {
      EscNav.onDashboardTab(tab);
    }
    if (openAssignmentsId > 0 && (tab === 'vacancies' || tab === 'assigned' || tab === 'match')) {
      setTimeout(() => openVacancyAssignments(openAssignmentsId), 80);
    }
    return;
  }
  loadDashboard();
  writeDashboardHistory('dashboard', { replace: true });
  if (typeof window.EscNav?.onDashboardTab === 'function') {
    EscNav.onDashboardTab('dashboard');
  }
})();
