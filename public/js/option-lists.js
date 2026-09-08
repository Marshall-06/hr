/**
 * Admin «Düzediş» — saýlaw sanawlaryny modalda üýtgetmek / goşmak / pozmak.
 * Diňe role === 'admin'.
 */
(function (global) {
  function isAdminUser() {
    try {
      const u = (window.Auth && Auth.getUser()) || null;
      return u && u.role === 'admin';
    } catch {
      return false;
    }
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const cache = {};

  /** Kod → UI ýazgy (DB ENUM bilen gabat) */
  const ITEM_LABEL_KEYS = {
    anketa_statuses: {
      Islanok: 'st_not_working',
      Isleyar: 'st_working',
    },
  };

  const ITEM_LABEL_FALLBACK = {
    anketa_statuses: {
      Islanok: 'Işlemeýär',
      Isleyar: 'Işleýär',
    },
  };

  function itemDisplayLabel(key, item) {
    const labelKey = ITEM_LABEL_KEYS[key]?.[item];
    if (labelKey && typeof global.t === 'function') {
      const v = global.t(labelKey);
      if (v && v !== labelKey) return v;
    }
    return ITEM_LABEL_FALLBACK[key]?.[item] || item;
  }

  function editListBtnText() {
    if (typeof global.t === 'function') {
      const v = global.t('btn_edit_list');
      if (v && v !== 'btn_edit_list') return v;
    }
    return 'Düzediş';
  }

  async function fetchList(key, force) {
    if (!force && cache[key]?.items) return cache[key];
    const res = await api.get(`/option-lists/${encodeURIComponent(key)}`);
    cache[key] = res.data;
    return cache[key];
  }

  function fillSelect(select, items, {
    keepValue = true,
    includeEmpty = false,
    emptyLabel = '-',
    emptyValue = '',
    listKey = '',
  } = {}) {
    if (!select) return;
    const prev = select.value;
    const opts = [];
    if (includeEmpty) opts.push(`<option value="${esc(emptyValue)}">${esc(emptyLabel)}</option>`);
    (items || []).forEach((it) => {
      const label = itemDisplayLabel(listKey, it);
      opts.push(`<option value="${esc(it)}">${esc(label)}</option>`);
    });
    select.innerHTML = opts.join('');
    if (keepValue && prev !== undefined && prev !== null
      && [...select.options].some((o) => o.value === prev)) {
      select.value = prev;
    }
  }

  async function refreshSelectsForKey(key) {
    const data = await fetchList(key, true);
    document.querySelectorAll(`select[data-option-list="${key}"]`).forEach((sel) => {
      const includeEmpty = sel.hasAttribute('data-option-empty');
      const emptyLabel = sel.getAttribute('data-option-empty-label') || '-';
      const emptyValue = sel.hasAttribute('data-option-empty-value')
        ? (sel.getAttribute('data-option-empty-value') || '')
        : '';
      fillSelect(sel, data.items, {
        includeEmpty,
        emptyLabel,
        emptyValue,
        listKey: key,
      });
    });
    if (typeof global.onOptionListChanged === 'function') {
      try { global.onOptionListChanged(key, data); } catch (_) { /* ignore */ }
    }
  }

  function ensureEditorOverlay() {
    let box = document.getElementById('option-list-fallback-modal');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'option-list-fallback-modal';
    box.className = 'modal-overlay';
    box.setAttribute('aria-hidden', 'false');
    box.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    box.innerHTML = `
      <div class="modal-panel" style="max-width:720px;width:100%;max-height:90vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(15,23,42,.22)">
        <div class="modal-body" id="option-list-editor-body" style="padding:18px"></div>
      </div>
    `;
    box.addEventListener('click', (ev) => {
      if (ev.target === box) closeEditorOverlay();
    });
    document.body.appendChild(box);
    return box;
  }

  function closeEditorOverlay() {
    const box = document.getElementById('option-list-fallback-modal');
    if (box) box.remove();
  }

  function openEditorOverlay(html) {
    const box = ensureEditorOverlay();
    const body = document.getElementById('option-list-editor-body');
    if (body) body.innerHTML = html;
    box.style.display = 'flex';
    box.setAttribute('aria-hidden', 'false');
    return body || box;
  }

  function showEditorModal(key, title) {
    if (!isAdminUser()) {
      alert('Diňe admin düzedip bilýär');
      return;
    }
    const open = async () => {
      let data;
      try {
        data = await fetchList(key, true);
      } catch (e) {
        alert(e.message || 'Sanaw ýüklenmedi');
        return;
      }

      const rows = (data.items || []).map((it, idx) => {
        const shown = itemDisplayLabel(key, it);
        const hint = shown !== it
          ? ` <span class="muted" style="font-size:12px">→ ${esc(shown)}</span>`
          : '';
        return `
        <div class="option-edit-row" data-value="${esc(it)}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
          <span class="muted" style="min-width:28px">${idx + 1}.</span>
          <input type="text" class="option-edit-input" value="${esc(it)}" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid var(--line);border-radius:8px">
          ${hint}
          <button type="button" class="btn btn-sm btn-accent option-save-btn">Sakla</button>
          <button type="button" class="btn btn-sm btn-danger option-del-btn">Poz</button>
        </div>
      `;
      }).join('');

      const html = `
        <h3 style="margin-top:0">${esc(editListBtnText())} — ${esc(title || data.title || key)}</h3>
        <p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.4">
          ${key === 'anketa_statuses'
    ? 'Ulgamyň kodlary: <b>Islanok</b> (Işlemeýär) we <b>Isleyar</b> (Işleýär). Bu kodlary üýtgetmäň — diňe goşmaça ýazgy goşup bilersiňiz.'
    : 'Bar bolanlary üýtgediň ýa-da täze goşuň. Diňe admin. Üýtgeşmeler ähli saýlawlarda görünýär.'}
        </p>
        <div id="option-edit-list" style="max-height:min(50vh,420px);overflow:auto;margin-bottom:12px">
          ${rows || '<p class="muted">Sanaw boş</p>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
          <input type="text" id="option-new-value" placeholder="Täze element..." style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--line);border-radius:8px">
          <button type="button" class="btn btn-accent" id="option-add-btn">+ Goş</button>
          <button type="button" class="btn btn-ghost" id="option-reset-btn">Deslapky</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost" id="option-close-btn">Ýap</button>
        </div>
      `;

      // Always use own overlay — anketa-new.html-da showModal ýok, dashboard-da hem ynamly
      const root = openEditorOverlay(html);
      const alertBox = document.getElementById('alert-box');

      async function reloadModal() {
        await refreshSelectsForKey(key);
        open();
      }

      root.querySelectorAll('.option-edit-row').forEach((row) => {
        const from = row.getAttribute('data-value');
        row.querySelector('.option-save-btn')?.addEventListener('click', async () => {
          const to = row.querySelector('.option-edit-input')?.value?.trim();
          if (!to || to === from) return;
          if (key === 'anketa_statuses' && (from === 'Islanok' || from === 'Isleyar')
            && to !== 'Islanok' && to !== 'Isleyar') {
            if (!confirm('Ulgamyň koduny üýtgedýärsiňiz. Filter / ýagdaý bozulyp biler. Dowam etmeli?')) return;
          }
          try {
            await api.patch(`/option-lists/${encodeURIComponent(key)}`, { from, to });
            if (typeof showAlert === 'function' && alertBox) showAlert(alertBox, 'Üýtgedildi', 'success');
            await reloadModal();
          } catch (e) {
            if (typeof showAlert === 'function' && alertBox) showAlert(alertBox, e.message, 'error');
            else alert(e.message);
          }
        });
        row.querySelector('.option-del-btn')?.addEventListener('click', async () => {
          if (key === 'anketa_statuses' && (from === 'Islanok' || from === 'Isleyar')) {
            alert('Islanok / Isleyar ulgamyň kodlary — pozup bolmaz');
            return;
          }
          if (!confirm(`Pozmak: «${from}»?`)) return;
          try {
            await api.delete(`/option-lists/${encodeURIComponent(key)}?value=${encodeURIComponent(from)}`);
            if (typeof showAlert === 'function' && alertBox) showAlert(alertBox, 'Pozuldy', 'success');
            await reloadModal();
          } catch (e) {
            if (typeof showAlert === 'function' && alertBox) showAlert(alertBox, e.message, 'error');
            else alert(e.message);
          }
        });
      });

      document.getElementById('option-add-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('option-new-value');
        const value = input?.value?.trim();
        if (!value) return;
        try {
          const res = await api.post(`/option-lists/${encodeURIComponent(key)}`, { value });
          if (typeof showAlert === 'function' && alertBox) {
            showAlert(alertBox, res.data?.alreadyExists ? 'Eýýäm bar' : 'Goşuldy', res.data?.alreadyExists ? 'error' : 'success');
          }
          await reloadModal();
        } catch (e) {
          if (typeof showAlert === 'function' && alertBox) showAlert(alertBox, e.message, 'error');
          else alert(e.message);
        }
      });

      document.getElementById('option-reset-btn')?.addEventListener('click', async () => {
        if (!confirm('Deslapky sanawa gaýtarylşynmy?')) return;
        try {
          await api.post(`/option-lists/${encodeURIComponent(key)}/reset`, {});
          await reloadModal();
        } catch (e) {
          alert(e.message);
        }
      });

      document.getElementById('option-close-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeEditorOverlay();
      });
    };
    open();
  }

  function mountButton(selectOrWrap, key, title) {
    if (!isAdminUser()) return null;
    const select = typeof selectOrWrap === 'string'
      ? document.getElementById(selectOrWrap) || document.querySelector(selectOrWrap)
      : selectOrWrap;
    if (!select || !select.parentNode) return null;

    let wrap = select.closest('.option-list-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'option-list-wrap';
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
    }
    let btn = wrap.querySelector('.btn-option-edit');
    if (btn) {
      btn.textContent = editListBtnText();
      return btn;
    }

    select.setAttribute('data-option-list', key);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-ghost btn-option-edit';
    btn.textContent = editListBtnText();
    btn.title = 'Saýlaw sanawyny düzediş (diňe admin)';
    btn.setAttribute('data-i18n', 'btn_edit_list');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEditorModal(key, title || select.getAttribute('data-option-title') || key);
    });
    wrap.appendChild(btn);
    return btn;
  }

  /** Select däl bölümler üçin (dil / programma sanawy) */
  function mountSectionButton(anchor, key, title) {
    if (!isAdminUser() || !anchor) return null;
    let btn = anchor.querySelector('.btn-option-edit');
    if (btn) {
      btn.textContent = editListBtnText();
      return btn;
    }
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-ghost btn-option-edit';
    btn.textContent = editListBtnText();
    btn.title = 'Sanawy düzediş (diňe admin)';
    btn.setAttribute('data-i18n', 'btn_edit_list');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEditorModal(key, title);
    });
    anchor.appendChild(btn);
    return btn;
  }

  async function hydrateAllSelects() {
    const nodes = [...document.querySelectorAll('select[data-option-list]')];
    const keys = [...new Set(nodes.map((n) => n.getAttribute('data-option-list')).filter(Boolean))];
    for (const key of keys) {
      try {
        await refreshSelectsForKey(key);
      } catch (err) {
        console.warn('[OptionLists] ýüklenmedi:', key, err?.message || err);
      }
    }
    if (isAdminUser()) {
      // Query again — wrap/DOM üýtgän bolup biler
      document.querySelectorAll('select[data-option-list]').forEach((sel) => {
        const key = sel.getAttribute('data-option-list');
        if (key) mountButton(sel, key, sel.getAttribute('data-option-title') || key);
      });
    }
  }

  async function renderSettingsPanel(container) {
    if (!container || !isAdminUser()) return;
    let meta;
    try {
      const res = await api.get('/option-lists');
      meta = res.data?.lists || [];
    } catch (e) {
      container.innerHTML = `<p style="color:red">${esc(e.message)}</p>`;
      return;
    }
    container.innerHTML = `
      <h3 style="margin-top:0">Saýlaw sanawlary (Düzediş)</h3>
      <p class="muted" style="margin:0 0 12px;font-size:13px">Diňe admin. Her sanawda goş / üýtget / poz.</p>
      <div style="display:grid;gap:8px">
        ${meta.map((m) => `
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;flex-wrap:wrap">
            <div>
              <strong>${esc(m.title)}</strong>
              <span class="muted" style="margin-left:8px;font-size:12px">${m.count} element</span>
            </div>
            <button type="button" class="btn btn-sm btn-accent" data-edit-key="${esc(m.key)}" data-edit-title="${esc(m.title)}">${esc(editListBtnText())}</button>
          </div>
        `).join('')}
      </div>
    `;
    container.querySelectorAll('[data-edit-key]').forEach((btn) => {
      btn.addEventListener('click', () => showEditorModal(btn.getAttribute('data-edit-key'), btn.getAttribute('data-edit-title')));
    });
  }

  global.OptionLists = {
    isAdminUser,
    fetchList,
    fillSelect,
    refreshSelectsForKey,
    showEditorModal,
    mountButton,
    mountSectionButton,
    hydrateAllSelects,
    renderSettingsPanel,
    open: showEditorModal,
    close: closeEditorOverlay,
  };
})(window);
