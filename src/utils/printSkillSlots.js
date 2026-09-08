/**
 * Anketa çap blankasy — dil / programma setir sany hemişe şol.
 * Täze dil ýa-da programma saýlanmadyk default ýeri eýeleýär.
 */

const DEFAULT_LANGS = ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Azerbeýjan', 'Pars', 'Özbek'];
const DEFAULT_PROG_LEFT = ['MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE'];
const DEFAULT_PROG_RIGHT = ['Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint'];
const LANG_SLOT_COUNT = DEFAULT_LANGS.length;
const PROG_SLOT_COUNT = DEFAULT_PROG_LEFT.length + DEFAULT_PROG_RIGHT.length;

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function namesEqual(a, b) {
  const left = normName(a);
  const right = normName(b);
  return Boolean(left) && left === right;
}

function uniqueNames(list, max) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((raw) => {
    const name = String(raw || '').trim();
    if (!name) return;
    const key = normName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return typeof max === 'number' ? out.slice(0, max) : out;
}

function buildFixedSlots(preferred, defaults, max) {
  return uniqueNames([...(preferred || []), ...(defaults || [])], max);
}

function parseLanguages(languages) {
  const list = Array.isArray(languages) ? languages : [];
  return list
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name, level: '' } : null;
      }
      const name = String(item?.name || '').trim();
      if (!name) return null;
      return { name, level: String(item.level || '').trim() };
    })
    .filter(Boolean);
}

function parsePrograms(programs) {
  const list = Array.isArray(programs) ? programs : [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      return String(item?.name || item || '').trim();
    })
    .filter(Boolean);
}

/**
 * Default setirler galýar; täze dil soňky boş ýeri eýeleýär.
 * Hemmesi doly bolsa, aşakda täze setir goşulýar.
 */
function mapLanguageSlots(slotNames, languages) {
  const slots = (slotNames || []).map((label) => ({
    label: String(label || '').trim(),
    level: '',
  }));
  const selected = parseLanguages(languages);
  const taken = new Set();

  selected.forEach((lang, idx) => {
    const hit = slots.findIndex((slot) => !slot.level && namesEqual(slot.label, lang.name));
    if (hit < 0) return;
    slots[hit].level = lang.level;
    slots[hit].label = slots[hit].label || lang.name;
    taken.add(idx);
  });

  selected.forEach((lang, idx) => {
    if (taken.has(idx)) return;
    let empty = -1;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (!slots[i].level) {
        empty = i;
        break;
      }
    }
    if (empty >= 0) {
      slots[empty].label = lang.name;
      slots[empty].level = lang.level;
    } else {
      slots.push({ label: lang.name, level: lang.level });
    }
    taken.add(idx);
  });

  return slots;
}

function defaultProgMatcher(selectedName, slotLabel) {
  return namesEqual(selectedName, slotLabel);
}

/**
 * Default programmalar galýar; täze programma soňky boş ýeri eýeleýär.
 * Hemmesi doly bolsa, aşakda täze setir goşulýar.
 */
function mapProgramSlots(slotNames, programs, matcher = defaultProgMatcher) {
  const slots = (slotNames || []).map((label) => ({
    label: String(label || '').trim(),
    checked: false,
  }));
  const selected = parsePrograms(programs);
  const taken = new Set();

  selected.forEach((name, idx) => {
    const hit = slots.findIndex((slot) => !slot.checked && matcher(name, slot.label));
    if (hit < 0) return;
    slots[hit].checked = true;
    taken.add(idx);
  });

  selected.forEach((name, idx) => {
    if (taken.has(idx)) return;
    let empty = -1;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (!slots[i].checked) {
        empty = i;
        break;
      }
    }
    if (empty >= 0) {
      slots[empty].label = name;
      slots[empty].checked = true;
    } else {
      slots.push({ label: name, checked: true });
    }
    taken.add(idx);
  });

  return slots;
}

function splitProgramColumns(slots) {
  const leftCount = DEFAULT_PROG_LEFT.length;
  const rightCount = DEFAULT_PROG_RIGHT.length;
  const left = (slots || []).slice(0, leftCount);
  const right = (slots || []).slice(leftCount, leftCount + rightCount);
  (slots || []).slice(leftCount + rightCount).forEach((slot, idx) => {
    if (idx % 2 === 0) left.push(slot);
    else right.push(slot);
  });
  return { left, right };
}

function languageSlotsForPrint(languages, optionItems) {
  const names = buildFixedSlots(optionItems, DEFAULT_LANGS, LANG_SLOT_COUNT);
  while (names.length < LANG_SLOT_COUNT) names.push('');
  return mapLanguageSlots(names, languages);
}

function programSlotsForPrint(programs, optionItems, matcher) {
  const defaults = [...DEFAULT_PROG_LEFT, ...DEFAULT_PROG_RIGHT];
  const names = buildFixedSlots(optionItems, defaults, PROG_SLOT_COUNT);
  while (names.length < PROG_SLOT_COUNT) names.push('');
  return splitProgramColumns(mapProgramSlots(names, programs, matcher));
}

module.exports = {
  DEFAULT_LANGS,
  DEFAULT_PROG_LEFT,
  DEFAULT_PROG_RIGHT,
  LANG_SLOT_COUNT,
  PROG_SLOT_COUNT,
  namesEqual,
  buildFixedSlots,
  mapLanguageSlots,
  mapProgramSlots,
  splitProgramColumns,
  languageSlotsForPrint,
  programSlotsForPrint,
};
