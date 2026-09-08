/** «Kabul edildi» — işe başlan senesini modal bilen soramak */
(function () {
  const ACCEPTED = 'Kabul edildi';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function normalizeDate(raw) {
    const s = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function modalHtml(labels = {}) {
    const title = escHtml(labels.title || 'Kabul edildi');
    const hint = escHtml(labels.hint || 'Işe başlan senesini giriziň ýa-da saýlaň');
    const label = escHtml(labels.dateLabel || labels.label || 'Işe başlan');
    const defaultDate = escHtml(labels.defaultDate || todayIso());
    const save = escHtml(labels.save || 'Ýatda sakla');
    const cancel = escHtml(labels.cancel || 'Ýatyr');
    return `
      <div class="left-job-date-modal accept-direction-modal">
        <div class="left-job-date-modal__head">
          <span class="left-job-date-modal__badge">${escHtml(ACCEPTED)}</span>
          <h3 class="left-job-date-modal__title">${title}</h3>
          <p class="left-job-date-modal__hint">${hint}</p>
        </div>
        <div class="left-job-date-modal__field">
          <label for="accept-date-input">${label}</label>
          <input type="date" class="tk-date left-job-date-modal__input" id="accept-date-input" value="${defaultDate}">
        </div>
        <div class="left-job-date-modal__actions">
          <button type="button" class="btn btn-accent" id="accept-date-save">${save}</button>
          <button type="button" class="btn btn-ghost" id="accept-date-cancel">${cancel}</button>
        </div>
      </div>`;
  }

  function wireModal(root, handlers = {}) {
    const scope = root && root.querySelector ? root : document;
    const input = scope.querySelector('#accept-date-input');
    const saveBtn = scope.querySelector('#accept-date-save');
    const cancelBtn = scope.querySelector('#accept-date-cancel');
    if (input && window.TkDate?.enhance) window.TkDate.enhance(input);
    if (cancelBtn) cancelBtn.onclick = () => handlers.onCancel?.();
    if (saveBtn) {
      saveBtn.onclick = () => {
        const acceptedAt = normalizeDate(input?.value || '');
        if (!acceptedAt) {
          handlers.onInvalidDate?.();
          return;
        }
        handlers.onSave?.(acceptedAt);
      };
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn?.click();
      });
      setTimeout(() => input.focus(), 60);
    }
  }

  window.AssignmentCompanyDirection = {
    STATUS: ACCEPTED,
    isAccepted(status) {
      return String(status || '').trim() === ACCEPTED;
    },
    todayIso,
    normalizeDate,
    modalHtml,
    wireModal,
  };
})();
