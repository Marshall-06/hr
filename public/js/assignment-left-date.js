/** «Işden çykdy» — işden çykan senesini modal bilen soramak */
(function () {
  const LEFT_JOB = 'Işden çykdy';

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
    const title = escHtml(labels.title || 'Işden çykan senesi');
    const hint = escHtml(labels.hint || 'Sene giriziň ýa-da saýlaň');
    const label = escHtml(labels.label || 'Işden çykan');
    const defaultDate = escHtml(labels.defaultDate || todayIso());
    const save = escHtml(labels.save || 'Ýatda sakla');
    const cancel = escHtml(labels.cancel || 'Ýatyr');
    return `
      <div class="left-job-date-modal">
        <div class="left-job-date-modal__head">
          <span class="left-job-date-modal__badge">${escHtml(LEFT_JOB)}</span>
          <h3 class="left-job-date-modal__title">${title}</h3>
          <p class="left-job-date-modal__hint">${hint}</p>
        </div>
        <div class="left-job-date-modal__field">
          <label for="left-job-date-input">${label}</label>
          <input type="date" class="tk-date left-job-date-modal__input" id="left-job-date-input" value="${defaultDate}">
        </div>
        <div class="left-job-date-modal__actions">
          <button type="button" class="btn btn-accent" id="left-job-date-save">${save}</button>
          <button type="button" class="btn btn-ghost" id="left-job-date-cancel">${cancel}</button>
        </div>
      </div>`;
  }

  function wireModal(root, handlers = {}) {
    const scope = root && root.querySelector ? root : document;
    const input = scope.querySelector('#left-job-date-input');
    if (input && window.TkDate?.enhance) window.TkDate.enhance(input);
    const saveBtn = scope.querySelector('#left-job-date-save');
    const cancelBtn = scope.querySelector('#left-job-date-cancel');
    if (cancelBtn) cancelBtn.onclick = () => handlers.onCancel?.();
    if (saveBtn) {
      saveBtn.onclick = () => {
        const leftAt = normalizeDate(input?.value || '');
        if (!leftAt) {
          handlers.onInvalid?.();
          return;
        }
        handlers.onSave?.(leftAt);
      };
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn?.click();
      });
      setTimeout(() => input.focus(), 60);
    }
  }

  window.AssignmentLeftDate = {
    STATUS: LEFT_JOB,
    isLeftJob(status) {
      return String(status || '').trim() === LEFT_JOB;
    },
    todayIso,
    normalizeDate,
    modalHtml,
    wireModal,
  };
})();
