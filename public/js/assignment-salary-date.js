/** Aýlyk alýan senesini modal bilen bellemeli */
(function () {
  const ACCEPTED = 'Kabul edildi';
  const INPUT_ID = 'salary-receive-date-input';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /** Diňe YYYY-MM-DD — type=date / TkDate üçin */
  function normalizeDate(raw) {
    const s = String(raw || '').trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function addMonthsIso(isoDate, months = 1) {
    const s = normalizeDate(isoDate);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const day = dt.getDate();
    dt.setMonth(dt.getMonth() + months);
    if (dt.getDate() !== day) dt.setDate(0);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function defaultSalaryDate(salaryReceiveAt, acceptedAt) {
    return normalizeDate(salaryReceiveAt)
      || addMonthsIso(acceptedAt, 1)
      || todayIso();
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readIsoFromScope(scope, id) {
    const el = scope.querySelector(`#${id}`);
    if (!el) return '';
    return normalizeDate(el.value || '');
  }

  function modalHtml(labels = {}) {
    const title = escHtml(labels.title || 'Aýlyk alýan senesi');
    const hint = escHtml(labels.hint || 'Aýlyk alýan senesini giriziň ýa-da saýlaň');
    const label = escHtml(labels.label || 'Aýlyk alýan senesi');
    const defaultDate = escHtml(normalizeDate(labels.defaultDate) || todayIso());
    const save = escHtml(labels.save || 'Ýatda sakla');
    const cancel = escHtml(labels.cancel || 'Ýatyr');
    return `
      <div class="left-job-date-modal salary-receive-date-modal">
        <div class="left-job-date-modal__head">
          <span class="left-job-date-modal__badge">${escHtml(labels.badge || 'Aýlyk')}</span>
          <h3 class="left-job-date-modal__title">${title}</h3>
          <p class="left-job-date-modal__hint">${hint}</p>
        </div>
        <div class="left-job-date-modal__field">
          <label for="${INPUT_ID}">${label}</label>
          <input type="date" class="tk-date left-job-date-modal__input" id="${INPUT_ID}" value="${defaultDate}">
        </div>
        <div class="left-job-date-modal__actions">
          <button type="button" class="btn btn-accent" id="salary-receive-date-save">${save}</button>
          <button type="button" class="btn btn-ghost" id="salary-receive-date-cancel">${cancel}</button>
        </div>
      </div>`;
  }

  function wireModal(root, handlers = {}) {
    const scope = root && root.querySelector ? root : document;
    const input = scope.querySelector(`#${INPUT_ID}`);
    if (input && window.TkDate?.enhance) {
      try { window.TkDate.enhance(input); } catch { /* native date */ }
    }

    const saveBtn = scope.querySelector('#salary-receive-date-save');
    const cancelBtn = scope.querySelector('#salary-receive-date-cancel');
    if (cancelBtn) cancelBtn.onclick = () => handlers.onCancel?.();
    if (saveBtn) {
      saveBtn.onclick = () => {
        // TkDate enhance-den soň #id hidden inputda galýar — täzeden oka
        const salaryReceiveAt = readIsoFromScope(scope, INPUT_ID);
        if (!salaryReceiveAt) {
          handlers.onInvalid?.();
          return;
        }
        handlers.onSave?.(salaryReceiveAt);
      };
    }

    const focusEl = scope.querySelector(`#${INPUT_ID}`)
      || scope.querySelector('.tk-date-display');
    if (focusEl) {
      setTimeout(() => {
        try { focusEl.focus(); } catch { /* ignore */ }
      }, 60);
    }
  }

  window.AssignmentSalaryDate = {
    STATUS: ACCEPTED,
    isAccepted(status) {
      return String(status || '').trim() === ACCEPTED;
    },
    todayIso,
    normalizeDate,
    addMonthsIso,
    defaultSalaryDate,
    modalHtml,
    wireModal,
  };
})();
