/**
 * Şahsy awtoulag — Ýok (üýtgedilmeýär) / Bar (el bilen düzedilýär).
 */
(function () {
  const YOK = 'Ýok';
  const BAR = 'Bar';

  function fold(s) {
    return String(s || '').trim().toLowerCase().replace(/ý/g, 'y');
  }

  function isYokValue(val) {
    const f = fold(val);
    return !f || f === 'yok';
  }

  function syncHidden(wrap) {
    const hidden = wrap.querySelector('.bar-yok-hidden');
    const select = wrap.querySelector('.bar-yok-select');
    const text = wrap.querySelector('.bar-yok-text');
    if (!hidden || !select || !text) return;

    if (select.value === YOK) {
      hidden.value = YOK;
    } else {
      const detail = String(text.value || '').trim();
      hidden.value = detail || BAR;
    }
  }

  function applyMode(wrap) {
    const select = wrap.querySelector('.bar-yok-select');
    const text = wrap.querySelector('.bar-yok-text');
    if (!select || !text) return;

    const isYok = select.value === YOK;
    text.disabled = isYok;
    text.readOnly = isYok;
    wrap.classList.toggle('bar-yok-field--yok', isYok);
    wrap.classList.toggle('bar-yok-field--bar', !isYok);
    if (isYok) {
      text.value = '';
      text.placeholder = '';
    } else if (!text.placeholder) {
      text.placeholder = 'Mysal: Toyota Camry';
    }
    syncHidden(wrap);
  }

  function bind(wrap) {
    if (!wrap || wrap.dataset.barYokBound) return;
    wrap.dataset.barYokBound = '1';

    const select = wrap.querySelector('.bar-yok-select');
    const text = wrap.querySelector('.bar-yok-text');
    const hidden = wrap.querySelector('.bar-yok-hidden');
    if (!select || !text || !hidden) return;

    select.addEventListener('change', () => applyMode(wrap));
    text.addEventListener('input', () => syncHidden(wrap));
    hidden.addEventListener('input', () => {
      const val = hidden.value;
      if (isYokValue(val)) {
        select.value = YOK;
        text.value = '';
      } else {
        select.value = BAR;
        text.value = String(val || '').trim() === BAR ? BAR : String(val || '').trim();
      }
      applyMode(wrap);
    });

    if (!hidden.value) {
      select.value = YOK;
    }
    applyMode(wrap);
  }

  function mountAll(root) {
    (root || document).querySelectorAll('[data-bar-yok-field]').forEach(bind);
  }

  function setValue(wrap, value) {
    if (!wrap) return;
    const select = wrap.querySelector('.bar-yok-select');
    const text = wrap.querySelector('.bar-yok-text');
    const hidden = wrap.querySelector('.bar-yok-hidden');
    if (!select || !text || !hidden) return;

    const str = String(value || '').trim();
    if (isYokValue(str)) {
      select.value = YOK;
      text.value = '';
      hidden.value = YOK;
    } else {
      select.value = BAR;
      text.value = str;
      hidden.value = str;
    }
    applyMode(wrap);
  }

  function syncAll(root) {
    (root || document).querySelectorAll('[data-bar-yok-field]').forEach(syncHidden);
  }

  window.BarYokField = {
    YOK,
    BAR,
    isYokValue,
    mountAll,
    setValue,
    syncAll,
    bind,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll());
  } else {
    mountAll();
  }
})();
