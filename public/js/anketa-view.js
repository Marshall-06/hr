if (!requireAuth()) throw new Error('Auth required');

const params = new URLSearchParams(window.location.search);
let id = params.get('id');
const DEFAULT_ASSIGN_STATUSES = [
  'Hödürlendi',
  'Ugradyldy',
  'Barjak diýdi',
  'Kabul edildi',
  'Olar atkaz etdiler',
  'Kabul edilmedi',
  'Özi otkaz etdi',
  'Işden çykdy',
];

function resolveVacancyId() {
  const direct = Number(params.get('vacancyId'));
  if (direct > 0) return direct;
  const ret = params.get('return') || '';
  try {
    const u = new URL(ret, window.location.origin);
    const fromRet = Number(u.searchParams.get('vacancyId'));
    if (fromRet > 0) return fromRet;
  } catch { /* ignore */ }
  return null;
}

let vacancyIdForOffer = resolveVacancyId();
let cachedAnketa = null;

const editEarly = document.getElementById('btn-edit-anketa');
if (editEarly && id) {
  editEarly.href = `/admin/anketa-new.html?id=${id}&return=view`;
}

function parseNavIds() {
  const raw = params.get('ids') || '';
  return [...new Set(raw.split(',').map((x) => Number(String(x).trim())).filter((n) => n > 0))];
}

function formatAnketaPositionsDisplay(a) {
  const extra = a?.extraData && typeof a.extraData === 'object' ? a.extraData : {};
  let parts = [];
  if (Array.isArray(extra.desiredPositions) && extra.desiredPositions.length) {
    parts = extra.desiredPositions.map((p) => String(p || '').trim()).filter(Boolean);
  }
  if (!parts.length) {
    const raw = String(a?.desiredPosition || '').trim();
    if (!raw) return '—';
    parts = raw.split(/\s*\/\s*|\r?\n+|[,;|]+|\s+we\s+/i).map((p) => p.trim()).filter(Boolean);
  }
  return parts.length ? parts.join(' / ') : '—';
}

function navBack() {
  if (window.EscNav?.goBack) {
    EscNav.goBack();
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = '/admin/dashboard.html?tab=anketas';
}

function assignmentStatusClass(status) {
  if (status === 'Ugradyldy') return 'status-select--sent';
  if (status === 'Barjak diýdi' || status === 'Kabul edildi') return 'status-select--ok';
  if (status === 'Olar atkaz etdiler' || status === 'Kabul edilmedi'
    || status === 'Özi otkaz etdi' || status === 'Işden çykdy') {
    return 'status-select--no';
  }
  return 'status-select--offer';
}

function formatAssignDay(raw) {
  if (!raw) return '—';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
  if (typeof formatDate === 'function') return formatDate(raw) || '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function ensureAssignModal() {
  let modal = document.getElementById('assign-offer-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'assign-offer-modal';
  modal.className = 'modal-overlay hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-panel" style="max-width:920px;width:100%">
      <div class="modal-body" id="assign-offer-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAssignModal();
  });
  return modal;
}

function closeAssignModal() {
  const modal = document.getElementById('assign-offer-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function showAssignModal(html) {
  const modal = ensureAssignModal();
  const body = document.getElementById('assign-offer-body');
  if (body) body.innerHTML = html;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

async function loadAssignStatuses() {
  try {
    const res = await api.get('/option-lists/assignment_statuses');
    const items = res.data?.items;
    if (Array.isArray(items) && items.length) {
      const merged = [...items];
      DEFAULT_ASSIGN_STATUSES.forEach((s) => {
        if (!merged.some((x) => String(x).trim() === s)) merged.push(s);
      });
      return merged;
    }
  } catch { /* fallback */ }
  return DEFAULT_ASSIGN_STATUSES;
}

function phoneSimpleHtml(phone) {
  if (!phone) return '—';
  return esc(String(phone).trim()) || '—';
}

function assignmentStatusSelectViewHtml(assignmentId, current, statuses, opts = {}) {
  const st = current || 'Hödürlendi';
  const list = statuses?.length ? statuses : DEFAULT_ASSIGN_STATUSES;
  const optsHtml = list.map((val) => (
    `<option value="${esc(val)}" ${val === st ? 'selected' : ''}>${esc(val)}</option>`
  )).join('');
  const wide = opts.wide ? 'min-width:220px;width:100%;max-width:320px' : 'min-width:160px;max-width:220px';
  return `
    <select class="status-select ${assignmentStatusClass(st)}"
      data-assign-id="${assignmentId}"
      data-prev-status="${esc(st)}"
      style="${wide}">
      ${optsHtml}
    </select>`;
}

function revertAssignmentSelectView(selectEl, prevStatus) {
  if (!selectEl || !prevStatus) return;
  selectEl.value = prevStatus;
  selectEl.dataset.prevStatus = prevStatus;
  selectEl.className = `status-select ${assignmentStatusClass(prevStatus)}`;
}

function ensureLeftJobDateModal() {
  let modal = document.getElementById('left-job-date-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'left-job-date-modal';
  modal.className = 'modal-overlay hidden';
  modal.style.zIndex = '12000';
  modal.innerHTML = `
    <div class="modal-panel left-job-date-panel">
      <div class="modal-body" id="left-job-date-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLeftJobDateModal();
  });
  return modal;
}

function closeLeftJobDateModal() {
  const modal = document.getElementById('left-job-date-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

function ensureSalaryDateModal() {
  let modal = document.getElementById('salary-receive-date-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'salary-receive-date-modal';
  modal.className = 'modal-overlay hidden';
  modal.style.zIndex = '12000';
  modal.innerHTML = `
    <div class="modal-panel left-job-date-panel">
      <div class="modal-body" id="salary-receive-date-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSalaryDateModal();
  });
  return modal;
}

function closeSalaryDateModal() {
  const modal = document.getElementById('salary-receive-date-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function openSalaryReceiveModalView(assignmentId, acceptedAt, salaryReceiveAt) {
  const helper = window.AssignmentSalaryDate;
  if (!helper) {
    showAlert(document.getElementById('alert-box'), 'Aýlyk modal modul ýüklenmedi — Ctrl+F5', 'error');
    return;
  }
  const modal = ensureSalaryDateModal();
  const body = document.getElementById('salary-receive-date-body');
  body.innerHTML = helper.modalHtml({
    title: 'Aýlyk alýan senesi',
    hint: 'Sene saýlaň we «Ýatda sakla» basyň',
    label: 'Aýlyk alýan senesi',
    badge: 'Aýlyk',
    defaultDate: helper.defaultSalaryDate(salaryReceiveAt, acceptedAt),
    save: 'Ýatda sakla',
    cancel: 'Ýatyr',
  });
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  helper.wireModal(body, {
    onCancel: () => closeSalaryDateModal(),
    onInvalid: () => {
      showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
    },
    onSave: async (dateIso) => {
      const day = helper.normalizeDate(dateIso);
      if (!day) {
        showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
        return;
      }
      try {
        await api.patch(`/vacancies/assignments/${assignmentId}`, { salaryReceiveAt: day });
        closeSalaryDateModal();
        showAlert(document.getElementById('alert-box'), `Aýlyk alýan senesi: ${day}`, 'success');
        await openAnketaAssignHistory();
      } catch (err) {
        showAlert(document.getElementById('alert-box'), err.message || 'Sene ýazylmady', 'error');
      }
    },
  });
}

function showLeftJobDateModalView(assignmentId, assignmentStatus, selectEl, prevStatus, onDone) {
  const modal = ensureLeftJobDateModal();
  const body = document.getElementById('left-job-date-body');
  body.innerHTML = window.AssignmentLeftDate.modalHtml({
    title: 'Işden çykan senesi',
    hint: 'Sene giriziň ýa-da saýlaň',
    label: 'Işden çykan',
    defaultDate: window.AssignmentLeftDate?.todayIso?.() || '',
    save: 'Ýatda sakla',
    cancel: 'Ýatyr',
  });
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  window.AssignmentLeftDate.wireModal(body, {
    onCancel: () => {
      closeLeftJobDateModal();
      revertAssignmentSelectView(selectEl, prevStatus);
    },
    onInvalid: () => {
      showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
    },
    onSave: async (leftAt) => {
      closeLeftJobDateModal();
      if (selectEl) {
        selectEl.value = assignmentStatus;
        selectEl.dataset.prevStatus = assignmentStatus;
        selectEl.className = `status-select ${assignmentStatusClass(assignmentStatus)}`;
      }
      try {
        await api.patch(`/vacancies/assignments/${assignmentId}`, { assignmentStatus, leftAt });
        showAlert(document.getElementById('alert-box'), `Ýagdaý: ${assignmentStatus}`, 'success');
        if (onDone) await onDone();
      } catch (err) {
        showAlert(document.getElementById('alert-box'), err.message || 'Ýagdaý üýtgedilmedi', 'error');
        revertAssignmentSelectView(selectEl, prevStatus);
        if (onDone) await onDone();
      }
    },
  });
}

function ensureAcceptDirectionModal() {
  let modal = document.getElementById('accept-direction-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'accept-direction-modal';
  modal.className = 'modal-overlay hidden';
  modal.style.zIndex = '12000';
  modal.innerHTML = `
    <div class="modal-panel left-job-date-panel">
      <div class="modal-body" id="accept-direction-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAcceptDirectionModal();
  });
  return modal;
}

function closeAcceptDirectionModal() {
  const modal = document.getElementById('accept-direction-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function showCompanyDirectionModalView(assignmentId, assignmentStatus, selectEl, prevStatus, onDone) {
  const modal = ensureAcceptDirectionModal();
  const body = document.getElementById('accept-direction-body');
  body.innerHTML = window.AssignmentCompanyDirection.modalHtml({
    title: 'Kabul edildi',
    hint: 'Işe başlan senesini giriziň ýa-da saýlaň',
    dateLabel: 'Işe başlan',
    defaultDate: window.AssignmentCompanyDirection?.todayIso?.() || '',
    save: 'Ýatda sakla',
    cancel: 'Ýatyr',
  });
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  window.AssignmentCompanyDirection.wireModal(body, {
    onCancel: () => {
      closeAcceptDirectionModal();
      revertAssignmentSelectView(selectEl, prevStatus);
    },
    onInvalidDate: () => {
      showAlert(document.getElementById('alert-box'), 'Dogry sene giriziň', 'error');
    },
    onSave: async (acceptedAt) => {
      closeAcceptDirectionModal();
      if (selectEl) {
        selectEl.value = assignmentStatus;
        selectEl.dataset.prevStatus = assignmentStatus;
        selectEl.className = `status-select ${assignmentStatusClass(assignmentStatus)}`;
      }
      try {
        await api.patch(`/vacancies/assignments/${assignmentId}`, {
          assignmentStatus,
          acceptedAt,
        });
        showAlert(document.getElementById('alert-box'), `Ýagdaý: ${assignmentStatus}`, 'success');
        if (onDone) await onDone();
      } catch (err) {
        showAlert(document.getElementById('alert-box'), err.message || 'Ýagdaý üýtgedilmedi', 'error');
        revertAssignmentSelectView(selectEl, prevStatus);
        if (onDone) await onDone();
      }
    },
  });
}

async function handleAssignmentStatusViewChange(el, onDone) {
  const assignmentId = Number(el.getAttribute('data-assign-id'));
  const newStatus = el.value;
  const prevStatus = el.dataset.prevStatus || el.getAttribute('data-prev-status') || '';
  if (window.AssignmentLeftDate?.isLeftJob?.(newStatus)) {
    revertAssignmentSelectView(el, prevStatus);
    showLeftJobDateModalView(assignmentId, newStatus, el, prevStatus, onDone);
    return;
  }
  if (window.AssignmentCompanyDirection?.isAccepted?.(newStatus)) {
    revertAssignmentSelectView(el, prevStatus);
    showCompanyDirectionModalView(assignmentId, newStatus, el, prevStatus, onDone);
    return;
  }
  el.dataset.prevStatus = newStatus;
  el.className = `status-select ${assignmentStatusClass(newStatus)}`;
  try {
    await api.patch(`/vacancies/assignments/${assignmentId}`, { assignmentStatus: newStatus });
    showAlert(document.getElementById('alert-box'), `Ýagdaý: ${newStatus}`, 'success');
    if (onDone) await onDone();
  } catch (err) {
    showAlert(document.getElementById('alert-box'), err.message || 'Ýagdaý üýtgedilmedi', 'error');
    revertAssignmentSelectView(el, prevStatus);
    if (onDone) await onDone();
  }
}

function pickLatestAssignment(items = []) {
  if (!items.length) return null;
  const scored = items.map((row) => {
    const t = new Date(row.updatedAt || row.acceptedAt || row.createdAt || 0).getTime();
    return { row, t: Number.isFinite(t) ? t : 0 };
  });
  scored.sort((a, b) => b.t - a.t);
  return scored[0].row;
}

/** Anketa hödürleme — ýokarda soňky ýagdaý, aşakda taryh */
async function openAnketaAssignHistory() {
  const anketaId = Number(id);
  if (!anketaId) {
    showAlert(document.getElementById('alert-box'), 'Anketa ID ýok', 'error');
    return;
  }
  try {
    const [histRes, statuses] = await Promise.all([
      api.get(`/vacancies/assignments/by-anketa/${anketaId}`),
      loadAssignStatuses(),
    ]);
    const { anketa, items = [], total = 0, active = 0 } = histRes.data || {};
    const latest = histRes.data?.latest || pickLatestAssignment(items);
    const a = anketa || cachedAnketa || {};
    const faa = fullName(a) || 'Dalaşgär';
    const num = a.anketaNumber || '—';
    const vacOfferId = Number(vacancyIdForOffer) || 0;
    const lv = latest?.vacancy || {};
    const latestDay = latest
      ? (latest.acceptedAt || latest.updatedAt || latest.createdAt)
      : null;

    showAssignModal(`
      <h3 style="margin-top:0">Hödürleme</h3>
      <p class="muted" style="margin:0 0 12px">
        <strong>${esc(faa)}</strong> · № ${esc(num)}
        · Aktiv: <strong>${active}</strong>
        · Jemi: <strong>${total}</strong>
      </p>

      ${latest ? `
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:16px;background:#f8fafc">
        <div style="font-size:0.8rem;letter-spacing:0.04em;color:#64748b;margin-bottom:6px">SOŇKY ÝAGDAÝ</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end">
          <div style="flex:1;min-width:180px">
            <strong>${esc(lv.companyName || '—')}</strong>
            <div class="muted">${esc(lv.position || '—')}${lv.salary ? ` · ${esc(lv.salary)}` : ''}</div>
            <div class="muted" style="margin-top:4px">Wak. №${esc(lv.vacancyNumber || latest.vacancyId || '—')} · ${formatAssignDay(latestDay)}</div>
          </div>
          <div style="min-width:220px;flex:1">
            <label class="muted" style="display:block;margin-bottom:4px;font-size:0.85em">Ýagdaýy üýtget</label>
            ${assignmentStatusSelectViewHtml(latest.id, latest.status || 'Hödürlendi', statuses, { wide: true })}
            ${['Kabul edildi', 'Işden çykdy'].includes(String(latest.status || '').trim())
              ? `<button type="button" class="btn btn-sm btn-accent" style="margin-top:8px" onclick="openSalaryReceiveModalView(${latest.id}, '${esc(String(latest.acceptedAt || '').slice(0, 10))}', '${esc(String(latest.salaryReceiveAt || '').slice(0, 10))}')">Aýlyk</button>`
              : ''}
          </div>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:0.85em">
          «Kabul edildi» → «Kabul edilmedi» / «Özi otkaz etdi» / «Işden çykdy» geçirseňiz —
          täze şertnama, aktiv hödürleme we töleg prosesleri ýatyrylýar.
        </p>
      </div>` : '<p>Bu anketa entek hiç ýere hödürlenmändir.</p>'}

      ${items.length ? `
      <h4 style="margin:0 0 8px">Taryh (${items.length})</h4>
      <div class="table-wrap" style="max-height:360px;overflow:auto">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Sene</th>
              <th>Firma</th>
              <th>Wezipe</th>
              <th>Aýlyk</th>
              <th>Wak. №</th>
              <th>Ýagdaý</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((row, i) => {
              const v = row.vacancy || {};
              const st = row.status || 'Hödürlendi';
              const day = row.acceptedAt || row.updatedAt || row.createdAt;
              const isLatest = latest && Number(row.id) === Number(latest.id);
              return `
                <tr${isLatest ? ' style="background:#eef6ff"' : ''}>
                  <td>${i + 1}${isLatest ? ' ·' : ''}</td>
                  <td title="${esc(String(day || ''))}">${formatAssignDay(day)}</td>
                  <td>${esc(v.companyName || '—')}</td>
                  <td>${esc(v.position || '—')}</td>
                  <td>${esc(v.salary || '—')}</td>
                  <td>№${esc(v.vacancyNumber || row.vacancyId || '—')}</td>
                  <td><span class="badge">${esc(st)}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="btn btn-ghost" id="btn-assign-cancel">Ýap</button>
        ${vacOfferId
          ? `<button type="button" class="btn btn-success" id="btn-assign-new-offer">Täze hödürle</button>`
          : `<button type="button" class="btn btn-accent" id="btn-assign-go-match">Wakansiýa saýla / hödürle</button>`}
      </div>
    `);

    document.getElementById('btn-assign-cancel').onclick = () => closeAssignModal();
    document.getElementById('btn-assign-new-offer')?.addEventListener('click', () => {
      closeAssignModal();
      openAssignOffer();
    });
    document.getElementById('btn-assign-go-match')?.addEventListener('click', () => {
      closeAssignModal();
      window.location.href = `/admin/dashboard.html?tab=match&anketaId=${anketaId}`;
    });

    document.querySelectorAll('#assign-offer-body select[data-assign-id]').forEach((el) => {
      el.onfocus = () => {
        el.dataset.prevStatus = el.value;
      };
      el.onchange = async () => {
        await handleAssignmentStatusViewChange(el, async () => {
          await openAnketaAssignHistory();
          await load();
        });
      };
    });
  } catch (err) {
    showAlert(document.getElementById('alert-box'), err.message || 'Hödürleme taryhy açylmady', 'error');
  }
}

async function openAssignOffer() {
  const anketaId = Number(id);
  const vacId = Number(vacancyIdForOffer);
  if (!anketaId || !vacId) {
    showAlert(document.getElementById('alert-box'), 'Wakansiýa saýlanmady — hödürläp bolmaz', 'error');
    return;
  }
  try {
    const [vRes, aRes, cRes, statuses] = await Promise.all([
      api.get(`/vacancies/${vacId}`),
      cachedAnketa ? Promise.resolve({ data: cachedAnketa }) : api.get(`/anketas/${anketaId}`),
      api.get(`/vacancies/assignments/anketa-counts?ids=${anketaId}`).catch(() => ({ data: {} })),
      loadAssignStatuses(),
    ]);
    const v = vRes.data;
    const a = aRes.data;
    cachedAnketa = a;
    const ankCounts = cRes.data?.[anketaId] || { total: 0, active: 0 };
    if (!a.anketaNumber) {
      showAlert(document.getElementById('alert-box'), 'Anketa belgesi (№) ýok — hödürläp bolmaz', 'error');
      return;
    }
    const faa = fullName(a) || 'Dalaşgär';
    const company = v.companyName || 'Kärhana';
    const position = v.position || 'Wezipe';
    const statusOpts = (statuses.length ? statuses : DEFAULT_ASSIGN_STATUSES)
      .map((val, i) => `<option value="${esc(val)}" ${i === 0 ? 'selected' : ''}>${esc(val)}</option>`)
      .join('');

    showAssignModal(`
      <h3 style="margin-top:0">Kim kimiňe hödürlenýär?</h3>
      <div class="assign-preview">
        <div class="assign-box">
          <small>DALAŞGÄR</small>
          <strong>№ ${esc(a.anketaNumber)}</strong>
          <p>${esc(faa)}</p>
          <p>${phoneSimpleHtml(a.phone)}</p>
          <p>${esc(formatAnketaPositionsDisplay(a))}</p>
        </div>
        <div class="assign-arrow">→</div>
        <div class="assign-box">
          <small>WAKANSIÝA</small>
          <strong>${esc(company)}</strong>
          <p>${esc(position)}${v.salary ? ` · ${esc(v.salary)}` : ''}</p>
        </div>
      </div>
      ${Number(ankCounts.active) > 0 ? `
        <p class="assign-warn">Bu dalaşgär eýýäm başga wezipelere hödürlenen.
          (Aktiv: ${Number(ankCounts.active)}, Jemi: ${Number(ankCounts.total)})</p>
      ` : ''}
      ${Number(v.assignmentCount) > 0 ? `
        <p class="assign-warn">Hödürlenen: <strong>${Number(v.assignmentCount)}</strong>. Goş.</p>
      ` : ''}
      <div class="form-group" style="margin-top:12px">
        <label>Ýagdaý</label>
        <select id="view-assign-status" class="status-select status-select--offer" style="width:100%;min-width:180px">
          ${statusOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Komentariýa / bellik</label>
        <textarea id="view-assign-notes" rows="3" placeholder="Mysal: jaň edildi, ertir geler"></textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="btn btn-ghost" id="btn-assign-cancel">Ýatyr</button>
        <button type="button" class="btn btn-ghost" id="btn-assign-history">Taryh</button>
        <button type="button" class="btn btn-accent" id="btn-assign-confirm">
          Hödürle (№ ${esc(a.anketaNumber)})
        </button>
      </div>
    `);

    const statusEl = document.getElementById('view-assign-status');
    if (statusEl) {
      statusEl.onchange = () => {
        statusEl.className = `status-select ${assignmentStatusClass(statusEl.value)}`;
      };
    }
    document.getElementById('btn-assign-cancel').onclick = () => closeAssignModal();
    document.getElementById('btn-assign-history').onclick = () => openAnketaAssignHistory();
    document.getElementById('btn-assign-confirm').onclick = () => confirmAssignOffer(vacId, anketaId);
  } catch (err) {
    showAlert(document.getElementById('alert-box'), err.message || 'Hödürleme açylmady', 'error');
  }
}

async function confirmAssignOffer(vacId, anketaId) {
  const assignmentStatus = document.getElementById('view-assign-status')?.value || 'Hödürlendi';
  const notes = (document.getElementById('view-assign-notes')?.value || '').trim();
  try {
    const res = await api.patch(`/vacancies/${vacId}/assign`, {
      anketaId,
      assignmentStatus,
      notes: notes || undefined,
    });
    const v = res.data;
    closeAssignModal();
    showAlert(
      document.getElementById('alert-box'),
      `${v.assignedCandidateName || 'Dalaşgär'} hödürlendi → ${v.companyName || ''} (jemi: ${v.assignmentCount || '?'}).`,
      'success',
    );
    await load();
  } catch (err) {
    showAlert(document.getElementById('alert-box'), err.message || 'Hödürleme şowsuz', 'error');
  }
}

function setupOfferButton() {
  const btn = document.getElementById('btn-assign-offer');
  if (!btn) return;
  btn.hidden = false;
  btn.textContent = 'Hödürleme';
  btn.title = 'Hödürleme taryhy we ýagdaý';
  btn.onclick = () => openAnketaAssignHistory();
}

setupOfferButton();

document.getElementById('btn-nav-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  navBack();
});
const _ankBack = document.getElementById('btn-nav-back');
if (_ankBack) _ankBack.dataset.navBound = '1';

function goSibling(delta) {
  const ids = parseNavIds();
  const cur = Number(id);
  const idx = ids.indexOf(cur);
  if (idx < 0) return;
  const nextId = ids[idx + delta];
  if (!nextId) return;
  const q = new URLSearchParams(window.location.search);
  q.set('id', String(nextId));
  // replace — sag/çep history-ni doldurmaýar; Yza sanawa gaýdýar
  window.location.replace(`/admin/anketa-view.html?${q.toString()}`);
}

function setupNavArrows() {
  const ids = parseNavIds();
  const cur = Number(id);
  const idx = ids.indexOf(cur);
  const prevBtn = document.getElementById('btn-anketa-prev');
  const nextBtn = document.getElementById('btn-anketa-next');
  const counter = document.getElementById('anketa-nav-counter');

  if (!ids.length || idx < 0) {
    if (prevBtn) prevBtn.hidden = true;
    if (nextBtn) nextBtn.hidden = true;
    if (counter) counter.hidden = true;
    return;
  }

  if (prevBtn) {
    prevBtn.hidden = false;
    prevBtn.disabled = idx >= ids.length - 1;
    prevBtn.onclick = () => goSibling(1);
  }
  if (nextBtn) {
    nextBtn.hidden = false;
    nextBtn.disabled = idx <= 0;
    nextBtn.onclick = () => goSibling(-1);
  }
  if (counter) {
    counter.hidden = false;
    counter.textContent = `${idx + 1} / ${ids.length}`;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goSibling(1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    goSibling(-1);
  }
});

setupNavArrows();


function esc(v) {
  if (v == null || v === '') return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fullName(a) {
  if (!a) return '—';
  return [a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ') || '—';
}

function phoneStackHtml(phone) {
  if (!phone) return '<span class="muted">Telefon ýok</span>';
  let text = String(phone).trim()
    .replace(/\s+we\s+/gi, ',')
    .replace(/\s+&\s+/g, ',');
  const rough = text.split(/[,;/|\n]+/).map((p) => p.trim()).filter(Boolean);
  const parts = [];
  rough.forEach((chunk) => {
    const tokens = chunk.split(/\s+/).filter(Boolean);
    const digitLens = tokens.map((t) => t.replace(/\D/g, '').length);
    if (tokens.length > 1 && digitLens.every((n) => n >= 4 && n <= 15)) {
      tokens.forEach((t) => parts.push(t));
      return;
    }
    const pairs = chunk.match(/\b\d{2}\s+\d{5,8}\b/g);
    if (pairs && pairs.length > 1) {
      pairs.forEach((p) => parts.push(p.trim()));
      return;
    }
    parts.push(chunk);
  });
  return `<span class="phone-stack">${parts.map((p) => {
    const tel = p.replace(/[^\d+]/g, '') || p;
    return `<span class="phone-stack__item"><a class="phone-link" href="tel:${esc(tel)}">${esc(p)}</a></span>`;
  }).join('')}</span>`;
}

function langText(langs) {
  if (!Array.isArray(langs) || !langs.length) return '—';
  return langs.map((l) => (typeof l === 'string' ? l : `${l.name || ''} (${l.level || ''})`.trim())).join(', ');
}

function listTable(rows, cols) {
  if (!Array.isArray(rows) || !rows.length) return '<p class="muted">Maglumat ýok</p>';
  return `
    <table class="list-table">
      <thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${cols.map((c) => `<td>${esc(row[c.key] || row[c.alt] || '')}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function ensurePhotoModal() {
  let modal = document.getElementById('photo-edit-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'photo-edit-modal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-panel" style="max-width:720px;width:100%">
      <h3 style="margin-top:0">Surat 3×4</h3>
      <p class="muted">Ýok bolsa goşuň, bar bolsa üýtgediň. Webkamera ýa-da faýl — diňe 3×4.</p>
      <div class="form-group photo-capture" id="view-photo-capture">
        <div class="photo-actions">
          <label class="btn btn-sm btn-ghost photo-file-btn">
            Faýldan saýla
            <input type="file" id="photo-file" accept="image/*" multiple hidden>
          </label>
          <button type="button" class="btn btn-sm btn-accent" id="btn-open-camera">Kameradan al</button>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-photo-folder" title="USB suratlar üçin papka">Papka saýla</button>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-clear-photo" style="display:none">Ählisini aýyr</button>
        </div>
        <p class="muted" id="photo-folder-hint" style="margin:6px 0 0">Isläge görä papka saýlaň — USB surat şol papka düşer (Edge)</p>
        <p class="muted" id="photo-count-hint" style="margin:8px 0 0">0 / 4 surat (3×4)</p>
        <div class="photo-gallery" id="photo-gallery"></div>
        <div class="camera-panel hidden" id="camera-panel">
          <div class="camera-layout">
            <div class="camera-preview camera-preview-3x4">
              <video id="camera-video" autoplay playsinline muted></video>
              <div class="camera-frame-3x4" aria-hidden="true"></div>
            </div>
            <div class="camera-side">
              <p class="camera-side-title">3×4 surat</p>
              <label class="camera-side-label" for="camera-select">Kamera</label>
              <select id="camera-select" class="camera-select"></select>
              <button type="button" class="btn btn-accent" id="btn-capture">Surata düşür</button>
              <button type="button" class="btn btn-ghost" id="btn-close-camera">Kamerany ýap</button>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="btn-photo-cancel">Ýatyr</button>
        <button type="button" class="btn btn-ghost" id="btn-photo-clear-save" style="color:#b91c1c">Suraty poz we sakla</button>
        <button type="button" class="btn btn-accent" id="btn-photo-save">Suraty ýatda sakla</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePhotoModal();
  });
  return modal;
}

let viewPhotoCtl = null;

function closePhotoModal() {
  const modal = document.getElementById('photo-edit-modal');
  if (viewPhotoCtl) {
    viewPhotoCtl.stopCamera?.();
    viewPhotoCtl.destroy?.();
    viewPhotoCtl = null;
  }
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function openPhotoEditor(anketa) {
  const modal = ensurePhotoModal();
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  if (viewPhotoCtl) {
    viewPhotoCtl.destroy?.();
    viewPhotoCtl = null;
  }
  viewPhotoCtl = window.AnketaPhoto.createPhotoCapture({
    root: document.getElementById('view-photo-capture'),
    max: 4,
  });

  const existing = Array.isArray(anketa.extraData?.photos) && anketa.extraData.photos.length
    ? anketa.extraData.photos
    : (anketa.photoUrl ? [anketa.photoUrl] : []);
  if (existing.length) {
    viewPhotoCtl.setFromDataUrls?.(existing, { force: true });
  }

  document.getElementById('btn-photo-cancel').onclick = () => closePhotoModal();
  document.getElementById('btn-photo-clear-save').onclick = async () => {
    viewPhotoCtl.clear?.();
    if (!confirm('Suraty doly pozmak isleýärsiňizmi?')) return;
    const fd = new FormData();
    fd.append('clearPhotos', '1');
    try {
      await api.put(`/anketas/${anketa.id}`, fd);
      closePhotoModal();
      load();
    } catch (err) {
      alert(err.message || 'Surat pozulmady');
    }
  };
  document.getElementById('btn-photo-save').onclick = async () => {
    const items = viewPhotoCtl.getItems();
    const fd = new FormData();
    if (!items.length) {
      if (!confirm('Suraty doly pozmak isleýärsiňizmi?')) return;
      fd.append('clearPhotos', '1');
    } else {
      items.forEach((item) => fd.append('photos', item.file, item.file.name));
      fd.append('photo', items[0].file, items[0].file.name);
    }
    try {
      await api.put(`/anketas/${anketa.id}`, fd);
      closePhotoModal();
      load();
    } catch (err) {
      alert(err.message || 'Surat ýazylmady');
    }
  };
}

async function deleteAnketaPhoto(anketaId) {
  if (!confirm('Suraty pozmak isleýärsiňizmi?')) return;
  try {
    const fd = new FormData();
    fd.append('clearPhotos', '1');
    await api.put(`/anketas/${anketaId}`, fd);
    load();
  } catch (err) {
    alert(err.message || 'Surat pozulmady');
  }
}

function mountViewSide(a) {
  const extra = document.getElementById('anketa-view-extra');
  const phoneBox = document.getElementById('anketa-view-phone');
  const relatedBox = document.getElementById('anketa-related');
  if (!extra) return;
  extra.hidden = false;
  if (phoneBox) {
    phoneBox.innerHTML = a.phone
      ? `<strong>Telefon:</strong> ${phoneStackHtml(a.phone)}`
      : '<span class="muted">Telefon ýok</span>';
  }
  if (relatedBox) {
    const related = Array.isArray(a.relatedAnketas) ? a.relatedAnketas : [];
    if (!related.length) {
      relatedBox.innerHTML = '';
    } else {
      relatedBox.innerHTML = `
        <div class="anketa-related-box">
          <strong>Beýleki nusgalar (${related.length})</strong>
          <p class="muted" style="margin:6px 0 8px">Her nusgany aýratyn Aç / Ýap edip bolýar.</p>
          <ul class="anketa-related-list">
            ${related.map((r) => {
              const closed = r.status === 'Isleyar';
              return `<li>
                <a href="/admin/anketa-view.html?id=${r.id}">№ ${esc(r.anketaNumber)}</a>
                <span class="badge ${closed ? 'badge-success' : 'badge-warning'}">${closed ? 'Ýapyk' : 'Açyk'}</span>
                <button type="button" class="btn btn-sm ${closed ? 'btn-success' : 'btn-accent'}" data-rel-id="${r.id}" data-rel-status="${esc(r.status || 'Islanok')}">${closed ? 'Aç' : 'Ýap'}</button>
              </li>`;
            }).join('')}
          </ul>
        </div>`;
      relatedBox.querySelectorAll('[data-rel-id]').forEach((btn) => {
        btn.onclick = async () => {
          const rid = Number(btn.getAttribute('data-rel-id'));
          const st = btn.getAttribute('data-rel-status');
          try {
            if (st === 'Isleyar') {
              await api.put(`/anketas/${rid}`, { status: 'Islanok', closedReason: null, employmentDate: null });
            } else {
              await api.put(`/anketas/${rid}`, { status: 'Isleyar', closedReason: 'Özi işe ýerleşenler' });
            }
            await load();
          } catch (err) {
            showAlert(document.getElementById('alert-box'), err.message || 'Ýagdaý üýtgedilmedi', 'error');
          }
        };
      });
    }
  }
  if (window.CommentsUI) {
    CommentsUI.mountComments(document.getElementById('anketa-comments'), 'anketa', a.id);
  }
}

async function resolveScanView(a) {
  if (window.AnketaScanView?.resolveScanDisplay) {
    return AnketaScanView.resolveScanDisplay(a.id, '');
  }
  return { show: false, url: '', preferScan: false, found: false };
}

async function ensurePassportOnAnketa(a) {
  if (String(a.passportNumber || '').trim()) return true;
  const num = window.prompt('Pasport № (şertnama üçin):', '');
  if (!num) return false;
  const issued = window.prompt('Berilen ýeri we senesi:', a.passportIssued || '') || '';
  await api.put(`/anketas/${a.id}`, {
    passportNumber: num.trim(),
    passportIssued: issued.trim(),
  });
  a.passportNumber = num.trim();
  a.passportIssued = issued.trim();
  return true;
}

function openAnketaPrintOnly(anketaId) {
  const ret = encodeURIComponent(`/admin/anketa-view.html?id=${anketaId}`);
  window.open(`/anketa-print.html?id=${anketaId}&return=${ret}`, '_blank');
}

async function openContractPrintOnly(a) {
  const ok = await ensurePassportOnAnketa(a);
  if (!ok) return;
  const contractRes = await api.post(`/contracts/from-anketa/${a.id}`, {});
  const params = new URLSearchParams({
    id: String(contractRes.data.id),
    anketaId: String(a.id),
    return: `/admin/anketa-view.html?id=${a.id}`,
  });
  window.open(`/admin/contract-print.html?${params}`, '_blank');
}

async function load() {
  const sheet = document.getElementById('anketa-sheet') || document.getElementById('content');
  const extra = document.getElementById('anketa-view-extra');
  const phoneBox = document.getElementById('anketa-view-phone');
  if (!id) {
    if (sheet) sheet.innerHTML = '<p class="err">Anketa ID ýok</p>';
    return;
  }

  try {
    const res = await api.get(`/anketas/${id}`);
    const a = res.data;
    cachedAnketa = a;
    document.getElementById('anketa-number').textContent = `№ ${a.anketaNumber || id}`;
    document.title = `Anketa № ${a.anketaNumber || id}`;

    const editBtn = document.getElementById('btn-edit-anketa');
    if (editBtn) editBtn.href = `/admin/anketa-new.html?id=${a.id}&return=view`;

    const statusBtn = document.getElementById('btn-anketa-toggle-status');
    if (statusBtn) {
      const closed = a.status === 'Isleyar';
      statusBtn.hidden = false;
      statusBtn.textContent = closed ? 'Aç' : 'Ýap';
      statusBtn.className = `btn btn-sm ${closed ? 'btn-success' : 'btn-accent'}`;
      statusBtn.title = closed ? 'Anketany aç (iş gözleýär)' : 'Anketany ýap (işleýär)';
      statusBtn.onclick = async () => {
        try {
          if (closed) {
            await api.put(`/anketas/${a.id}`, { status: 'Islanok', closedReason: null, employmentDate: null });
            showAlert(document.getElementById('alert-box'), 'Anketa açyldy (iş gözleýär)', 'success');
          } else {
            await api.put(`/anketas/${a.id}`, { status: 'Isleyar', closedReason: 'Özi işe ýerleşenler' });
            showAlert(document.getElementById('alert-box'), 'Anketa ýapyldy (işleýär)', 'success');
          }
          await load();
        } catch (err) {
          showAlert(document.getElementById('alert-box'), err.message || 'Ýagdaý üýtgedilmedi', 'error');
        }
      };
    }

    document.getElementById('btn-match-anketa').onclick = () => {
      window.location.href = `/admin/dashboard.html?tab=match&anketaId=${a.id}`;
    };

    /** Diňe anketa çap */
    document.getElementById('btn-anketa-print').onclick = () => {
      openAnketaPrintOnly(a.id);
    };

    const contractBtn = document.getElementById('btn-anketa-contract-print');
    if (contractBtn) {
      const reason = String(a.closedReason || a.closed_reason || '')
        .toLowerCase()
        .replace(/ý/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
        .replace(/ň/g, 'n').replace(/ş/g, 's').replace(/ç/g, 'c');
      const placedByUs = reason.includes('bizin yerlesdiren');
      if (placedByUs) {
        contractBtn.textContent = 'Täze şert';
        contractBtn.classList.remove('btn-accent', 'btn-ghost');
        contractBtn.classList.add('btn-contract-new');
        contractBtn.title = 'Biziň ýerleşdiren — täze şert çap';
      } else {
        contractBtn.textContent = 'Şertnama';
        contractBtn.classList.remove('btn-contract-new');
        if (!contractBtn.classList.contains('btn-accent')) contractBtn.classList.add('btn-accent');
        contractBtn.title = 'Şertnama çap';
      }
      contractBtn.onclick = async () => {
        try {
          await openContractPrintOnly(a);
        } catch (err) {
          alert(err.message || 'Şertnama çap edilmedi');
        }
      };
    }

    const photos = Array.isArray(a.extraData?.photos) && a.extraData.photos.length
      ? a.extraData.photos
      : (a.photoUrl ? [a.photoUrl] : []);
    const photoBtn = document.getElementById('btn-edit-photo');
    if (photoBtn) {
      photoBtn.textContent = photos.length ? 'Suraty üýtget' : 'Surat goş';
      photoBtn.onclick = () => openPhotoEditor(a);
    }

    mountViewSide(a);

    const mailBtn = document.getElementById('btn-anketa-mail');
    if (mailBtn) {
      mailBtn.hidden = false;
      mailBtn.onclick = () => {
        if (window.AnketaMail?.openAnketaEmailModal) {
          AnketaMail.openAnketaEmailModal(a, {
            vacancyId: vacancyIdForOffer || null,
          });
        }
      };
    }

    const scan = await resolveScanView(a);
    const hasScanFile = Boolean(scan.found || scan.url);

    if (scan.show && scan.url && window.AnketaScanView?.loadScanIntoElement) {
      try {
        const loaded = await AnketaScanView.loadScanIntoElement(sheet, a.id, a.anketaNumber, '');
        if (!loaded?.shown) throw new Error('scan not shown');
      } catch {
        document.body.classList.remove('anketa-scan-mode');
        sheet.classList.remove('anketa-view-sheet--scan');
        if (typeof window.renderAnketaPrintSheet === 'function') {
          if (typeof window.ensurePrintSkillLists === 'function') {
            await window.ensurePrintSkillLists();
          }
          sheet.innerHTML = window.renderAnketaPrintSheet(a);
          if (typeof window.enhanceAnketaPrintPhoto === 'function') {
            window.enhanceAnketaPrintPhoto(sheet);
          }
        }
      }
    } else {
      document.body.classList.remove('anketa-scan-mode');
      if (typeof window.renderAnketaPrintSheet === 'function') {
        if (typeof window.ensurePrintSkillLists === 'function') {
          await window.ensurePrintSkillLists();
        }
        sheet.classList.remove('anketa-view-sheet--scan');
        sheet.innerHTML = window.renderAnketaPrintSheet(a);
        if (typeof window.enhanceAnketaPrintPhoto === 'function') {
          window.enhanceAnketaPrintPhoto(sheet);
        }
      } else {
        sheet.innerHTML = '<p class="err">Çap formaty ýüklenmedi</p>';
      }
    }
  } catch (err) {
    if (sheet) sheet.innerHTML = `<p class="err">Ýalňyşlyk: ${esc(err.message)}</p>`;
    if (extra) extra.hidden = true;
  }
}

load();
