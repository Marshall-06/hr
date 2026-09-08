const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');

/**
 * Admin tarapyndan düzedilýän saýlaw sanawlary.
 * defaults — başlangyç; data/option-lists.json — saklanan items (bolmasa defaults).
 */
const CATALOG = {
  vacancy_close_reasons: {
    title: 'Wakansiýa ýapylma sebäpleri',
    defaults: [
      'Bizden alyndy',
      'Bizden alynmady',
      'Indi saýlanmaly',
      'Bile işleşmek islemediler',
    ],
  },
  anketa_closed_reasons: {
    title: 'Anketa ýapylma sebäpleri',
    defaults: [
      'Biziň ýerleşdirenlerimiz',
      'Işe ýerleşenler',
      'Özi işe ýerleşenler',
      'Özüni aýyrdy',
      'Habarlaşyp bolmady',
      'Başga',
    ],
  },
  anketa_statuses: {
    title: 'Anketa ýagdaýy (Işleýär / Işlemeýär)',
    defaults: ['Islanok', 'Isleyar'],
  },
  assignment_statuses: {
    title: 'Hödürleme ýagdaýlary',
    defaults: [
      'Hödürlendi',
      'Ugradyldy',
      'Barjak diýdi',
      'Kabul edildi',
      'Olar atkaz etdiler',
      'Kabul edilmedi',
      'Özi otkaz etdi',
      'Işden çykdy',
    ],
  },
  company_directions: {
    title: 'Kärhana ugurlary',
    defaults: ['Sowda', 'Gurluşyk', 'Hyzmat', 'Bilim'],
  },
  experience: {
    title: 'Tejribe',
    defaults: ['Tejribeli', 'Tejribesiz'],
  },
  gender: {
    title: 'Jyns',
    defaults: ['Saýlanmaýar', 'Erkek', 'Ayal'],
  },
  person_gender: {
    title: 'Jyns (anketa)',
    defaults: ['Erkek', 'Ayal'],
  },
  marital_status: {
    title: 'Maşgala ýagdaýy',
    defaults: ['Maşgalaly', 'Sallah', 'Aýrylyşan', 'Durmuşa çykmadyk', 'Soralanmaýar'],
  },
  driving_license: {
    title: 'Sürüjilik şahadatnamasy',
    defaults: ['Ýok', 'B', 'BC', 'AB', 'A'],
  },
  military_service: {
    title: 'Harby gulluk',
    defaults: ['Bar', 'Ýok'],
  },
  yes_no: {
    title: 'Hawa / Ýok',
    defaults: ['Hawa', 'Ýok'],
  },
  bar_yok: {
    title: 'Bar / Ýok',
    defaults: ['Bar', 'Ýok'],
  },
  lang_levels: {
    title: 'Dil derejeleri',
    defaults: ['Başlangyç', 'Gowy', 'Has gowy'],
  },
  languages: {
    title: 'Diller',
    defaults: ['Türkmen', 'Rus', 'Iňlis', 'Türk', 'Pars', 'Özbek'],
  },
  programs: {
    title: 'Kompýuter programmalary',
    defaults: [
      'MS Word', 'Excel', 'Internet', 'ACCES', 'Logo', '1 C Бухг.', 'ONBACE',
      'Photoshop', 'Outlook', 'CorelDraw', 'Primere Pro', 'AutoCad', 'Ak hasap', 'Powerpoint',
    ],
  },
};

const STORE_PATH = path.join(__dirname, '../../data/option-lists.json');
const LEGACY_CLOSE_PATH = path.join(__dirname, '../../data/vacancy-close-reasons.json');

function normalizeItem(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function validateItem(value) {
  if (value.length < 1) throw new ApiError(400, 'Element boş bolmaly däl');
  if (value.length > 120) throw new ApiError(400, 'Element 120 harpdan uzyn bolmaly däl');
  return value;
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function readLegacyCloseCustom() {
  try {
    if (!fs.existsSync(LEGACY_CLOSE_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(LEGACY_CLOSE_PATH, 'utf8'));
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.custom) ? raw.custom : []);
    return [...new Set(list.map(normalizeItem).filter((x) => x.length >= 2 && x.length <= 120))];
  } catch {
    return [];
  }
}

function uniqueItems(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = normalizeItem(raw);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function assertKey(key) {
  if (!CATALOG[key]) throw new ApiError(404, `Saýlaw sanawy tapylmady: ${key}`);
}

function getDefaults(key) {
  assertKey(key);
  return [...CATALOG[key].defaults];
}

function getItems(key) {
  assertKey(key);
  const store = readStore();
  if (Array.isArray(store[key]?.items) && store[key].items.length) {
    return uniqueItems(store[key].items);
  }
  // Legacy: vacancy close reasons custom faýly
  if (key === 'vacancy_close_reasons') {
    const defaults = getDefaults(key);
    const custom = readLegacyCloseCustom();
    return uniqueItems([...defaults, ...custom]);
  }
  return getDefaults(key);
}

function listMeta() {
  return Object.keys(CATALOG).map((key) => ({
    key,
    title: CATALOG[key].title,
    count: getItems(key).length,
  }));
}

function getList(key) {
  assertKey(key);
  const defaults = getDefaults(key);
  const items = getItems(key);
  const defaultsLower = new Set(defaults.map((d) => d.toLowerCase()));
  const custom = items.filter((x) => !defaultsLower.has(x.toLowerCase()));
  return {
    key,
    title: CATALOG[key].title,
    defaults,
    custom,
    items,
  };
}

function setItems(key, items) {
  assertKey(key);
  const next = uniqueItems((items || []).map(validateItem));
  if (!next.length) throw new ApiError(400, 'Iň azyndan 1 element gerek');
  const store = readStore();
  store[key] = { items: next, updatedAt: new Date().toISOString() };
  writeStore(store);
  return getList(key);
}

function addItem(key, value) {
  const item = validateItem(normalizeItem(value));
  const current = getItems(key);
  if (current.some((x) => x.toLowerCase() === item.toLowerCase())) {
    return { ...getList(key), added: item, alreadyExists: true };
  }
  const next = setItems(key, [...current, item]);
  return { ...next, added: item, alreadyExists: false };
}

function updateItem(key, from, to) {
  const oldVal = validateItem(normalizeItem(from));
  const newVal = validateItem(normalizeItem(to));
  const current = getItems(key);
  const idx = current.findIndex((x) => x.toLowerCase() === oldVal.toLowerCase());
  if (idx < 0) throw new ApiError(404, 'Element tapylmady');
  if (current.some((x, i) => i !== idx && x.toLowerCase() === newVal.toLowerCase())) {
    throw new ApiError(400, 'Şeýle element eýýäm bar');
  }
  const next = [...current];
  next[idx] = newVal;
  return setItems(key, next);
}

function removeItem(key, value) {
  const item = validateItem(normalizeItem(value));
  if (key === 'anketa_statuses' && (item === 'Islanok' || item === 'Isleyar')) {
    throw new ApiError(400, 'Islanok / Isleyar ulgamyň kodlary — pozup bolmaz');
  }
  const current = getItems(key);
  const next = current.filter((x) => x.toLowerCase() !== item.toLowerCase());
  if (next.length === current.length) throw new ApiError(404, 'Element tapylmady');
  if (!next.length) throw new ApiError(400, 'Ähli elementleri pozup bolmaz');
  return setItems(key, next);
}

function resetList(key) {
  assertKey(key);
  const store = readStore();
  delete store[key];
  writeStore(store);
  return getList(key);
}

module.exports = {
  CATALOG,
  listMeta,
  getList,
  getItems,
  setItems,
  addItem,
  updateItem,
  removeItem,
  resetList,
};
