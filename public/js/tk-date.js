/** Türkmen / Rus sene formaty we kalendar (brauzeriň date picker-ini çalyşýar) */

const MONTHS_TK = [
  'Ýanwar', 'Fewral', 'Mart', 'Aprel', 'Maý', 'Iýun',
  'Iýul', 'Awgust', 'Sentýabr', 'Oktýabr', 'Noýabr', 'Dekabr',
];
const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const MONTHS_SHORT_TK = [
  'Ýan', 'Few', 'Mar', 'Apr', 'Maý', 'Iýun',
  'Iýul', 'Awg', 'Sen', 'Okt', 'Noý', 'Dek',
];
const MONTHS_SHORT_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];
const WEEKDAYS_TK = ['Du', 'Si', 'Ça', 'Pe', 'An', 'Şe', 'Ýe'];
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function uiLang() {
  try {
    if (typeof window !== 'undefined' && window.I18n?.getLang) return I18n.getLang();
    const saved = localStorage.getItem('ui_lang');
    return saved === 'ru' ? 'ru' : 'tk';
  } catch (e) {
    return 'tk';
  }
}

function monthsFull() {
  return uiLang() === 'ru' ? MONTHS_RU : MONTHS_TK;
}

function monthsShort() {
  return uiLang() === 'ru' ? MONTHS_SHORT_RU : MONTHS_SHORT_TK;
}

function weekdays() {
  return uiLang() === 'ru' ? WEEKDAYS_RU : WEEKDAYS_TK;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toIsoDate(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** dd.mm.yyyy ýa-da ISO → Date */
function parseFlexibleDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = parseIsoDate(s);
  if (iso) return iso;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatDateTk(dateStr, withMonthName = false, shortYear = false) {
  if (!dateStr) return '-';
  const raw = String(dateStr).slice(0, 10);
  const dt = parseIsoDate(raw) || (() => {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  })();
  if (!dt) return '-';
  const yearLabel = shortYear ? pad2(dt.getFullYear() % 100) : dt.getFullYear();
  if (withMonthName) {
    return `${dt.getDate()} ${monthsFull()[dt.getMonth()]} ${yearLabel}`;
  }
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${yearLabel}`;
}

function closeAllTkPickers(except) {
  document.querySelectorAll('.tk-date-wrap.is-open').forEach((wrap) => {
    if (wrap !== except) wrap.classList.remove('is-open');
  });
}

function buildCalendar(wrap, viewYear, viewMonth) {
  const pop = wrap.querySelector('.tk-date-pop');
  const hidden = wrap.querySelector('input[type="hidden"]');
  const selected = parseIsoDate(hidden.value);
  const lang = uiLang();
  const clearLabel = lang === 'ru' ? 'Очистить' : 'Arassala';
  const todayLabel = lang === 'ru' ? 'Сегодня' : 'Şu gün';
  const prevLabel = lang === 'ru' ? 'Предыдущий месяц' : 'Öňki aý';
  const nextLabel = lang === 'ru' ? 'Следующий месяц' : 'Indiki aý';

  const title = `${monthsFull()[viewMonth]} ${viewYear}`;
  const first = new Date(viewYear, viewMonth, 1);
  let startPad = first.getDay() - 1;
  if (startPad < 0) startPad = 6;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  let daysHtml = '';
  for (let i = 0; i < startPad; i += 1) {
    daysHtml += '<span class="tk-day is-empty"></span>';
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`;
    const isSel = selected && toIsoDate(selected) === iso;
    const today = toIsoDate(new Date()) === iso;
    daysHtml += `<button type="button" class="tk-day${isSel ? ' is-selected' : ''}${today ? ' is-today' : ''}" data-iso="${iso}">${d}</button>`;
  }

  pop.innerHTML = `
    <div class="tk-date-head">
      <button type="button" class="tk-nav" data-nav="-1" aria-label="${prevLabel}">‹</button>
      <span class="tk-date-title">${title}</span>
      <button type="button" class="tk-nav" data-nav="1" aria-label="${nextLabel}">›</button>
    </div>
    <div class="tk-weekdays">${weekdays().map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="tk-days">${daysHtml}</div>
    <div class="tk-date-foot">
      <button type="button" class="tk-clear" data-clear>${clearLabel}</button>
      <button type="button" class="tk-today" data-today>${todayLabel}</button>
    </div>
  `;

  pop.querySelector('[data-nav="-1"]').onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    let m = viewMonth - 1;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    wrap._tkView = { y, m };
    buildCalendar(wrap, y, m);
  };
  pop.querySelector('[data-nav="1"]').onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    let m = viewMonth + 1;
    let y = viewYear;
    if (m > 11) { m = 0; y += 1; }
    wrap._tkView = { y, m };
    buildCalendar(wrap, y, m);
  };
  pop.querySelectorAll('.tk-day[data-iso]').forEach((btn) => {
    btn.onclick = () => {
      hidden.value = btn.dataset.iso;
      syncDisplay(wrap);
      wrap.classList.remove('is-open');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
  pop.querySelector('[data-clear]').onclick = () => {
    hidden.value = '';
    syncDisplay(wrap);
    wrap.classList.remove('is-open');
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };
  pop.querySelector('[data-today]').onclick = () => {
    const now = new Date();
    hidden.value = toIsoDate(now);
    syncDisplay(wrap);
    wrap.classList.remove('is-open');
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };
}

/** Diňe sanlar → gg.aa.ýýýý (ýazanda awtomat nokat) */
function maskDottedDate(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function countDigitsBefore(str, caret) {
  let n = 0;
  const end = Math.min(caret, str.length);
  for (let i = 0; i < end; i += 1) {
    if (/\d/.test(str[i])) n += 1;
  }
  return n;
}

function caretAfterDigits(masked, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < masked.length; i += 1) {
    if (/\d/.test(masked[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return masked.length;
}

function applyTypedDate(wrap, raw, caret) {
  const display = wrap.querySelector('.tk-date-display');
  const hidden = wrap.querySelector('input[type="hidden"]');
  const digitsBefore = countDigitsBefore(String(raw || ''), caret == null ? String(raw || '').length : caret);
  const masked = maskDottedDate(raw);
  display.value = masked;
  const nextCaret = caretAfterDigits(masked, digitsBefore);
  try {
    display.setSelectionRange(nextCaret, nextCaret);
  } catch (e) { /* ignore */ }

  const dt = parseFlexibleDate(masked);
  const nextIso = dt ? toIsoDate(dt) : '';
  if (hidden.value !== nextIso) {
    hidden.value = nextIso;
    if (nextIso || masked === '') {
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function syncDisplay(wrap) {
  const hidden = wrap.querySelector('input[type="hidden"]');
  const display = wrap.querySelector('.tk-date-display');
  const ph = wrap.dataset.placeholder || (uiLang() === 'ru' ? 'дд.мм.гггг' : 'gg.aa.ýýýý');
  if (!hidden.value) {
    if (document.activeElement !== display) {
      display.value = '';
    }
    display.placeholder = ph;
    return;
  }
  display.value = formatDateTk(hidden.value, false);
}

function enhanceDateInput(input) {
  if (!input || input.dataset.tkReady) return;
  // type=month native galdyrylýar (aý saýlamak)
  if (input.type === 'month') return;
  input.dataset.tkReady = '1';

  const wrap = document.createElement('div');
  wrap.className = 'tk-date-wrap';
  wrap.dataset.placeholder = input.getAttribute('placeholder')
    || input.getAttribute('title')
    || (uiLang() === 'ru' ? 'дд.мм.гггг' : 'gg.aa.ýýýý');

  const display = document.createElement('input');
  display.type = 'text';
  display.className = 'tk-date-display';
  display.inputMode = 'numeric';
  display.autocomplete = 'off';
  display.maxLength = 10;
  display.placeholder = wrap.dataset.placeholder;
  display.setAttribute('aria-label', wrap.dataset.placeholder);

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = input.id;
  hidden.name = input.name || '';
  if (input.value) hidden.value = input.value;
  if (input.getAttribute('onchange')) {
    hidden.setAttribute('onchange', input.getAttribute('onchange'));
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tk-date-toggle';
  toggle.setAttribute('aria-label', uiLang() === 'ru' ? 'Открыть календарь' : 'Kalendary aç');
  toggle.innerHTML = '▾';

  const pop = document.createElement('div');
  pop.className = 'tk-date-pop';

  wrap.appendChild(display);
  wrap.appendChild(hidden);
  wrap.appendChild(toggle);
  wrap.appendChild(pop);

  input.replaceWith(wrap);
  syncDisplay(wrap);

  const open = () => {
    closeAllTkPickers(wrap);
    const base = parseIsoDate(hidden.value) || parseFlexibleDate(display.value) || new Date();
    wrap._tkView = { y: base.getFullYear(), m: base.getMonth() };
    buildCalendar(wrap, wrap._tkView.y, wrap._tkView.m);
    wrap.classList.add('is-open');
  };

  display.addEventListener('input', () => {
    applyTypedDate(wrap, display.value, display.selectionStart);
  });

  display.addEventListener('blur', () => {
    const masked = maskDottedDate(display.value);
    if (!masked) {
      hidden.value = '';
      display.value = '';
      return;
    }
    const dt = parseFlexibleDate(masked);
    if (dt) {
      hidden.value = toIsoDate(dt);
      display.value = formatDateTk(hidden.value, false);
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Doly däl / nädogry — görkezileni sakla, ISO boş
      display.value = masked;
      if (hidden.value) {
        hidden.value = '';
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      display.blur();
    } else if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault();
      open();
    }
  });

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    if (wrap.classList.contains('is-open')) {
      wrap.classList.remove('is-open');
    } else {
      open();
    }
  });
}

function refreshTkDateLanguage() {
  document.querySelectorAll('.tk-date-wrap').forEach((wrap) => {
    syncDisplay(wrap);
    if (wrap.classList.contains('is-open') && wrap._tkView) {
      buildCalendar(wrap, wrap._tkView.y, wrap._tkView.m);
    }
  });
}

function initTkDatePickers(root = document) {
  root.querySelectorAll('input[type="date"][data-tk], input.tk-date').forEach(enhanceDateInput);
}

function clickInsideTkDateWrap(e) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  if (path.some((el) => el?.classList?.contains('tk-date-wrap'))) return true;
  const target = e.target;
  return !!(target && typeof target.closest === 'function' && target.closest('.tk-date-wrap'));
}

document.addEventListener('click', (e) => {
  if (!clickInsideTkDateWrap(e)) closeAllTkPickers();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllTkPickers();
});

document.addEventListener('ui-lang-changed', () => {
  refreshTkDateLanguage();
});

if (typeof window !== 'undefined') {
  window.TK_MONTHS = MONTHS_TK;
  window.TK_MONTHS_SHORT = MONTHS_SHORT_TK;
  window.formatDateTk = formatDateTk;
  window.parseFlexibleDate = parseFlexibleDate;
  window.maskDottedDate = maskDottedDate;
  window.initTkDatePickers = initTkDatePickers;
  window.refreshTkDateLanguage = refreshTkDateLanguage;
}
