const { Op } = require('sequelize');
const { Anketa, Vacancy } = require('../models');
const ApiError = require('../utils/ApiError');

const sequelize = Anketa.sequelize;

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/ý/g, 'y')
  .replace(/ä/g, 'a')
  .replace(/ö/g, 'o')
  .replace(/ü/g, 'u')
  .replace(/ň/g, 'n')
  .replace(/ş/g, 's')
  .replace(/ç/g, 'c')
  .replace(/ž/g, 'z')
  .trim();

const ANKETA_MATCH_ATTRS = [
  'id', 'anketaNumber', 'desiredPosition', 'familyName', 'firstName', 'patronymic',
  'birthYear', 'gender', 'phone', 'educationLevel', 'languages', 'computerSkills',
  'registrationCity', 'status', 'workExperience', 'formDate', 'createdAt', 'extraData',
  'maritalStatus', 'currentSalary', 'workSchedule', 'partTimeWork', 'hasCar',
];

const VACANCY_MATCH_ATTRS = [
  'id', 'vacancyNumber', 'companyName', 'position', 'salary', 'location', 'workHours',
  'dayOff', 'experience', 'education', 'gender', 'languages', 'computerPrograms',
  'ageRange', 'registration', 'workersNeeded', 'companyDirection', 'status', 'closeReason',
  'jobDescription', 'contactName', 'contactPhone', 'contactEmail', 'forumOperator',
  'acceptedByUserId', 'assignmentCount', 'extraData', 'vacancyDate',
];

/** Diňe hakykatdan ähmiýetsiz sözler — «öz ulagynda» ýaly anyklygy aýyrma */
const POSITION_STOPWORDS = new Set([
  'we', 'hem', 'ya', 'yada', 'bilen', 'ucin', 'isin', 'isi',
  'yer', 'yerinde', 'yerine', 'bolup', 'bolan', 'gerek', 'talap',
  'wakansiya', 'anketa', 'is', 'isle', 'isleyan', 'isleyji',
]);

/** Ýer / kontekst — wezipe däl («ofisda tämizçi» ↔ «tämizçi») */
const PLACE_MODIFIER_WORDS = new Set([
  'ofis', 'ofisda', 'ofisde', 'kafe', 'restoran', 'magazin', 'dukan',
  'zavod', 'fabrika', 'sklad', 'ambar', 'otel', 'myhmanhana',
  'klinika', 'hassahana', 'mekdep', 'oy', 'oyde', 'kwartira', 'kvartira',
]);

const isPlaceModifierWord = (word) => {
  const n = normalize(word);
  return Boolean(n && PLACE_MODIFIER_WORDS.has(n));
};

/** Dereje / goşundy — «Baş buhgalter» ↔ «Buhgalter», «kömekçisi» ↔ esasy wezipe */
const TITLE_RANK_WORDS = new Set([
  'bas', 'baslyk', 'basly', 'senior', 'junior', 'komekci', 'komekcisi',
  'komek', 'yoradamjy', 'assistant', 'baslygy',
]);

const isTitleRankWord = (word) => {
  const n = normalize(word);
  if (!n) return false;
  if (TITLE_RANK_WORDS.has(n)) return true;
  const st = stemPositionWord(n);
  return TITLE_RANK_WORDS.has(st);
};

/** Birmeňzeş wezipe sinonimleri */
const POSITION_SYNONYMS = [
  ['suruji', 'sofyor', 'driver', 'voditel'],
  ['dizayner', 'designer', 'grafik', 'grafiki'],
  ['marketolog', 'marketing', 'smm'],
  ['buhgalter', 'muhasip', 'accountant', 'buhgalterin'],
  ['komekci', 'komekcisi', 'komek', 'assistant'],
  ['materialny', 'materialnyy', 'materiýalny', 'materiýalnyy'],
  ['rascotny', 'raschyotny', 'raschotny', 'rasçýotny', 'rasçotny'],
  ['kassir', 'sotnik', 'cashier'],
  ['satyjy', 'satiji', 'seller', 'prodavec'],
  ['asy', 'ascy', 'aspaz', 'povar', 'powar', 'powur', 'cook'],
  ['tamizci', 'tamizcilik', 'uborshica', 'uborshik', 'cleaner', 'domrabotnisa'],
  ['ofisiant', 'oficiant', 'ofitsiant', 'ofisant', 'garson', 'garsonka', 'waiter', 'ofisiantlyk'],
  ['mudir', 'direktor', 'manager', 'menejer'],
  ['nyanka', 'nanka', 'nanya', 'nanny', 'nyanya', 'eneke'],
  ['weterinar', 'veterinar', 'baytar'],
  ['operator', 'operatory', 'operatr'],
  ['kompyuter', 'kompiuter', 'computer'],
  ['logo', 'loga'],
  ['telefonist', 'kollcentr', 'callcenter', 'koll'],
];

const PROGRAM_STOPWORDS = new Set([
  'we', 'hem', 'bilen', 'gerek', 'talap', 'bilmeli', 'programma', 'programmalar',
  'kompyuter', 'komp', 'office', 'ms',
]);

const parseAgeRange = (ageRange) => {
  if (!ageRange || isUnspecified(ageRange)) return null;
  const text = String(ageRange);
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
  const plus = text.match(/(\d+)\s*\+/);
  if (plus) return { min: parseInt(plus[1], 10), max: 99 };
  const from = text.match(/(\d+)\s*(?:den|dan|ýaşdan|yasdan)/i);
  if (from) return { min: parseInt(from[1], 10), max: 99 };
  const only = text.match(/(\d{2})/);
  if (only && !/\d{2}.*\d{2}/.test(text.replace(/\s/g, ''))) {
    const n = parseInt(only[1], 10);
    if (n >= 16 && n <= 70) return { min: Math.max(16, n - 2), max: n + 2 };
  }
  return null;
};

const getAge = (birthYear) => {
  if (!birthYear) return null;
  return new Date().getFullYear() - Number(birthYear);
};

const arePositionSynonyms = (a, b) => {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  return POSITION_SYNONYMS.some((group) => group.includes(x) && group.includes(y));
};

/** Diňe hakyky wezipe gabatlygy — token bölekleýin däl */
const positionsMatchForReason = (a, b) => {
  if (!a || !b) return false;
  if (positionsExclusiveConflict(a, b)) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const ga = exclusiveGroupIndex(a);
  const gb = exclusiveGroupIndex(b);
  if (ga >= 0 && ga === gb) return true;
  return positionTextIncludes(a, b);
};

/** Bir-birine gabat gelmeli däl wezipeler — normalize() görnüşinde */
const POSITION_EXCLUSIVE = [
  ['ofisiant', 'oficiant', 'ofitsiant', 'ofisant', 'ofisiantlyk'],
  ['ofis isgari', 'ofis ishgari', 'ofis isci', 'ofis ishgar', 'ofis ishchi', 'ofis ishgi', 'office isci', 'ofis islegi', 'ofis isgar'],
  ['satyjy', 'satiji', 'seller', 'prodavec'],
  ['kassir', 'sotnik', 'cashier'],
];

/** Umumy wezipe sözleri — diňe bular gabat gelse iş birmeňzeş däl */
const GENERIC_ROLE_WORDS = new Set([
  'operator', 'operatory', 'operatr', 'isci', 'isgar', 'ishgar', 'ishci',
  'mudir', 'menejer', 'manager', 'direktor',
  'hunarmen', 'specialist', 'spesialist', 'hizmetci',
]);

/** Operator görnüşleri: kompýuter ≠ logo ≠ telefon */
const OPERATOR_KIND_KEYS = [
  { id: 'computer', keys: ['kompyuter', 'kompiuter', 'computer'] },
  { id: 'logo', keys: ['logo', 'loga'] },
  { id: 'phone', keys: ['telefon', 'telefonist', 'kollcentr', 'callcenter', 'call'] },
  { id: 'machine', keys: ['stank', 'stanok', 'stanokly', 'cnc'] },
  { id: 'camera', keys: ['kamera', 'video'] },
];

const phraseHasOperator = (text) => {
  const n = compactPhrase(text);
  return n.includes('operator') || n.includes('operatory');
};

const operatorKind = (text) => {
  if (!phraseHasOperator(text)) return null;
  const n = compactPhrase(text);
  const words = positionWords(text);
  for (const kind of OPERATOR_KIND_KEYS) {
    const hit = kind.keys.some((k) => n.includes(k) || words.some((w) => positionWordsEqual(w, k)));
    if (hit) return kind.id;
  }
  return 'generic';
};

const operatorsConflict = (a, b) => {
  const ka = operatorKind(a);
  const kb = operatorKind(b);
  if (!ka || !kb) return false;
  return ka !== kb;
};

const isGenericRoleWord = (word) => {
  const n = normalize(word);
  if (GENERIC_ROLE_WORDS.has(n)) return true;
  return expandWord(n).some((x) => GENERIC_ROLE_WORDS.has(x));
};

const exclusiveGroupIndex = (text) => {
  const n = normalize(text);
  if (!n) return -1;
  let bestGroup = -1;
  let bestKeyLen = 0;
  for (let i = 0; i < POSITION_EXCLUSIVE.length; i += 1) {
    POSITION_EXCLUSIVE[i].forEach((k) => {
      const key = normalize(k);
      const hit = n === key
        || (n.includes(key) && key.length >= 5)
        || (key.includes(n) && n.length >= 5);
      if (hit && key.length > bestKeyLen) {
        bestKeyLen = key.length;
        bestGroup = i;
      }
    });
  }
  return bestGroup;
};

const positionsExclusiveConflict = (a, b) => {
  if (operatorsConflict(a, b)) return true;
  const ga = exclusiveGroupIndex(a);
  const gb = exclusiveGroupIndex(b);
  return ga >= 0 && gb >= 0 && ga !== gb;
};

/** Ofisiant / ofis işgäri ýaly aýratyn toparlar — diňe şol topardaky isleg wezipesi */
const desiredMatchesExclusiveVacancy = (desiredPositions, vacancyPosition) => {
  const vacGroup = exclusiveGroupIndex(vacancyPosition);
  if (vacGroup < 0) return true;
  const list = Array.isArray(desiredPositions) ? desiredPositions : [desiredPositions];
  return list.some((pos) => pos && exclusiveGroupIndex(pos) === vacGroup);
};

/** Gysga söz başga wezipäniň başy bolsa — ýalňyş gabat (ofis ⊂ ofisiant) */
const isPrefixFalsePositive = (short, long) => {
  if (!short || !long || short === long) return false;
  const s = normalize(short);
  const l = normalize(long);
  if (s.length >= 5 || !l.startsWith(s)) return false;
  return !arePositionSynonyms(s, l);
};

const positionTextIncludes = (a, b) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (arePositionSynonyms(left, right)) return true;
  if (positionsExclusiveConflict(a, b)) return false;
  if (left.includes(right)) {
    if (isPrefixFalsePositive(right, left)) return false;
    return true;
  }
  if (right.includes(left)) {
    if (isPrefixFalsePositive(left, right)) return false;
    return true;
  }
  return false;
};

const positionTokensMatch = (w, vw) => {
  if (w === vw) return true;
  if (arePositionSynonyms(w, vw)) return true;
  if (isPrefixFalsePositive(w, vw) || isPrefixFalsePositive(vw, w)) return false;
  const short = w.length <= vw.length ? w : vw;
  const long = w.length <= vw.length ? vw : w;
  if (short.length >= 5 && long.includes(short)) return true;
  return false;
};

const textIncludes = (a, b) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

const positionTokens = (text) => normalize(text)
  .split(/[\s/,;|+\-_().]+/)
  .map((w) => w.trim())
  .filter((w) => w.length >= 3 && !POSITION_STOPWORDS.has(w));

/** Esasy wezipe sözleri — gysga atlary hem goý */
const significantPositionTokens = (text) => positionTokens(text)
  .filter((w) => w.length >= 4 || ['mudir', 'kassir', 'ascy', 'asy', 'sowt', 'sofyor', 'smm'].includes(w));

/** Sinonim toparlary bilen wezipe tokenlerini giňelt — diňe takyk söz, bölek däl */
const expandPositionTokens = (text) => {
  const base = significantPositionTokens(text);
  const out = new Set(base);
  base.forEach((t) => {
    POSITION_SYNONYMS.forEach((group) => {
      if (group.includes(t)) group.forEach((g) => out.add(g));
    });
  });
  return [...out];
};

const splitDesiredPositions = (anketa) => {
  const extraRaw = Array.isArray(anketa?.extraData?.desiredPositions)
    ? anketa.extraData.desiredPositions.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const expand = (list) => {
    const out = [];
    const seen = new Set();
    list.forEach((s) => {
      String(s || '')
        .split(/\s*\/\s*|\r?\n+|[,;|]+|\s+we\s+|\s+hem\s+/i)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => {
          const k = p.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          out.push(p);
        });
    });
    return out;
  };
  const fromField = expand([anketa?.desiredPosition].filter(Boolean));
  const fromExtra = extraRaw.length ? expand(extraRaw) : [];
  const mergeOnto = (base, extra) => {
    const seen = new Set(base.map((p) => p.toLowerCase()));
    extra.forEach((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      base.push(p);
    });
    return base;
  };
  // « / » meýdanynda 2+ wezipe bolsa ony esasy al (extraData köne 1-nji wezipe galyp biler)
  if (fromField.length >= 2) return mergeOnto(fromField, fromExtra);
  if (fromExtra.length) return mergeOnto(fromExtra, fromField);
  return fromField;
};

const positionWords = (text) => compactPhrase(text)
  .split(/\s+/)
  .filter((w) => w.length >= 3 && !POSITION_STOPWORDS.has(w));

const expandWord = (word) => {
  const out = new Set([word]);
  POSITION_SYNONYMS.forEach((group) => {
    if (group.includes(word)) group.forEach((g) => out.add(g));
  });
  return [...out];
};

/** Türkmen goşundylar: operator ↔ operatory, suruji ↔ surujilik */
const POSITION_WORD_SUFFIXES = [
  'lyk', 'lik', 'lug', 'lig', 'cylyk', 'cilik',
  'cy', 'ci', 'jy', 'ji', 'lar', 'ler',
  'dan', 'den', 'yna', 'ine', 'yny', 'ini', 'ny', 'ni',
  'y', 'i', 'a', 'e',
];

const stemPositionWord = (word) => {
  let s = normalize(word);
  if (s.length < 4) return s;
  // eýelik: buhgalterin → buhgalter, komekcisi → komekci
  const poss = ['lerin', 'laryn', 'nin', 'nyn', 'in', 'yn', 'si', 'sy'];
  for (const suf of poss) {
    if (s.length > suf.length + 4 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  for (const suf of POSITION_WORD_SUFFIXES) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) {
      return s.slice(0, -suf.length);
    }
  }
  return s;
};

/** Gözleg üçin kök + gysga görnüşler (buhgalterin → buhgalter) */
const searchStemsForToken = (token) => {
  const ascii = normalize(token);
  const out = new Set([ascii]);
  if (ascii.length >= 4) out.add(stemPositionWord(ascii));
  if (ascii.length >= 8) {
    out.add(ascii.slice(0, ascii.length - 2));
    out.add(ascii.slice(0, ascii.length - 1));
  }
  expandWord(ascii).forEach((t) => {
    const n = normalize(t);
    out.add(n);
    out.add(stemPositionWord(n));
  });
  return [...out].filter((t) => t && t.length >= 3);
};

/** Birmeňzeş wezipe sözi: takyk, sinonim ýa-da birmeňzeş kök (+goşundy) */
const positionWordsEqual = (a, b) => {
  if (!a || !b) return false;
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (arePositionSynonyms(left, right)) return true;
  const sa = stemPositionWord(left);
  const sb = stemPositionWord(right);
  if (sa && sb && sa.length >= 4 && sa === sb) return true;
  // gysga kök uzyn sözüň başynda (operator ⊂ operatory)
  const short = left.length <= right.length ? left : right;
  const long = left.length <= right.length ? right : left;
  if (short.length >= 5 && long.startsWith(short) && (long.length - short.length) <= 4) {
    return true;
  }
  return false;
};

const compactPhrase = (text) => normalize(text)
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isUnspecified = (value) => {
  const n = normalize(value);
  if (!n) return true;
  return n === '-' || n === '—'
    || n === 'ahli'
    || n === 'hemme'
    || n === 'hemmesi'
    || n === 'any'
    || n.includes('soralanok')
    || n.includes('soralanmayar')
    || n.includes('saylanok')
    || n.includes('saylanmayar')
    || n.includes('gerekdal');
};

const isNegotiable = (value) => {
  const n = normalize(value);
  return !n || n.includes('ylalasyk') || n.includes('ylalasik') || n.includes('doglesme');
};

/**
 * Wezipe gabat:
 * — birmeňzeş / sinonim
 * — wakansiýanyň sözleri islegde (isleg has giň)
 * — islegiň sözleri wakansiýada (isleg gysga: «ofisiant» ↔ «ofisiant kafe»)
 * Kompýuter operator ≠ logo operator ≠ telefon operator.
 */
const positionPhraseMatch = (desired, vacancyPos) => {
  const d = compactPhrase(desired);
  const v = compactPhrase(vacancyPos);
  if (!d || !v) return { exact: false, score: 0 };
  if (positionsExclusiveConflict(desired, vacancyPos)) return { exact: false, score: 0 };
  if (d === v) return { exact: true, score: 50 };
  if (arePositionSynonyms(d, v)) return { exact: true, score: 49 };
  // «Operator kassir» ↔ «Kassir» rugsat; kompýuter≠logo — operatorsConflict / exclusive

  const vRaw = positionWords(vacancyPos);
  const dRaw = positionWords(desired);
  const dropMod = (w) => isPlaceModifierWord(w) || isTitleRankWord(w);
  const vWords = vRaw.filter((w) => !dropMod(w));
  const dWords = dRaw.filter((w) => !dropMod(w));
  const vUse = vWords.length ? vWords : vRaw.filter((w) => !isPlaceModifierWord(w));
  const dUse = dWords.length ? dWords : dRaw.filter((w) => !isPlaceModifierWord(w));
  if (!vUse.length || !dUse.length) return { exact: false, score: 0 };

  const wordIn = (needle, hayWords) => {
    const need = expandWord(needle);
    return hayWords.some((hw) => need.some((n) => positionWordsEqual(hw, n)));
  };

  const dMods = dUse.filter((w) => !isGenericRoleWord(w));
  const vMods = vUse.filter((w) => !isGenericRoleWord(w));
  if (dMods.length && vMods.length) {
    const modHit = dMods.some((dw) => wordIn(dw, vMods));
    if (!modHit) return { exact: false, score: 0 };
    const dExtra = dMods.filter((dw) => !wordIn(dw, vMods));
    const vExtra = vMods.filter((vw) => !wordIn(vw, dMods));
    if (dExtra.length && vExtra.length) return { exact: false, score: 0 };
  } else if (dMods.length && !vMods.length) {
    return { exact: false, score: 0 };
  } else if (!dMods.length && vMods.length) {
    return { exact: false, score: 0 };
  }

  const allVacancyInDesired = vUse.every((vw) => wordIn(vw, dUse));
  if (allVacancyInDesired) return { exact: true, score: 48 };

  const allDesiredInVacancy = dUse.every((dw) => wordIn(dw, vUse));
  if (allDesiredInVacancy) return { exact: false, score: 46 };

  if (vUse.length <= 2 && dUse.length <= 2) {
    const overlap = vUse.filter((vw) => wordIn(vw, dUse) && !isGenericRoleWord(vw));
    if (overlap.length) return { exact: false, score: 45 };
  }

  return { exact: false, score: 0 };
};

const tokensOverlap = (aTokens, bTokens) => {
  if (!aTokens?.length || !bTokens?.length) return [];
  return aTokens.filter((w) => bTokens.some((vw) => positionTokensMatch(w, vw)));
};

const getWorkExperienceList = (anketa) => {
  const raw = anketa?.workExperience;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const EXPERIENCE_PLACEHOLDER = new Set([
  '', '-', '—', '–', '.', 'yoq', 'yok', 'bar', 'nan', 'null', 'none', 'het', 'bos',
]);

const cleanExperienceField = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (EXPERIENCE_PLACEHOLDER.has(normalize(s))) return '';
  return s;
};

/** Bazada hakyky iş ýeri / ýyllary bar setir (diňe wezipe ýazmak tejribe däl) */
const isMeaningfulExperience = (item) => {
  if (!item || typeof item !== 'object') return false;
  const pos = cleanExperienceField(item.position || item.wezipe);
  const company = cleanExperienceField(item.company || item.yer || item.firma || item.karhana);
  const years = cleanExperienceField(item.years || item.period || item.year || item.sene);
  if (!pos && !company && !years) return false;
  if (pos && !company && !years) return false;
  return Boolean((pos && (company || years)) || (company && years));
};

const getMeaningfulWorkExperience = (anketa) => getWorkExperienceList(anketa)
  .filter(isMeaningfulExperience);

/** Öňki iş wezipeleri (tejribe) */
const experiencePositions = (anketa) => getMeaningfulWorkExperience(anketa)
  .map((item) => String(item?.position || item?.wezipe || '').trim())
  .filter(Boolean);

/** "2019-2024", "2020 — häzir" we ş.m. → { start, end } */
const parseExperienceYears = (item) => {
  const text = String(item?.years || item?.period || item?.year || item?.sene || '').trim();
  const nums = text.match(/(19|20)\d{2}/g);
  if (!nums || !nums.length) return { start: 0, end: 0 };
  const years = nums.map(Number);
  return { start: Math.min(...years), end: Math.max(...years) };
};

/** Iş tejribesiniň iň täze ýyly (täzeler öňde üçin) */
const getExperienceRecency = (anketa) => {
  let maxEnd = 0;
  getMeaningfulWorkExperience(anketa).forEach((item) => {
    const { end } = parseExperienceYears(item);
    if (end > maxEnd) maxEnd = end;
  });
  return maxEnd;
};

/**
 * Wakansiýa wezipesine gabat gelýän işleriň iň täze ýyly.
 * Gabat ýok bolsa umumy tejribe täzeligi.
 */
const getMatchingExperienceRecency = (anketa, vacancy) => {
  const list = getMeaningfulWorkExperience(anketa);
  const vacPos = vacancy?.position || '';
  let maxEnd = 0;
  list.forEach((item) => {
    const pos = String(item?.position || item?.wezipe || '').trim();
    if (!pos || !vacPos) return;
    let hit = positionTextIncludes(pos, vacPos);
    if (!hit) {
      const overlap = tokensOverlap(expandPositionTokens(pos), expandPositionTokens(vacPos));
      hit = overlap.length > 0;
    }
    if (!hit) return;
    const { end } = parseExperienceYears(item);
    if (end > maxEnd) maxEnd = end;
  });
  return maxEnd || getExperienceRecency(anketa);
};

/** Anketa nähili täze (formDate / createdAt) */
const getAnketaFreshness = (anketa) => {
  const raw = anketa?.formDate || anketa?.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const experienceHasAny = (anketa) => getMeaningfulWorkExperience(anketa).length > 0;

const vacancyNeedsExperience = (vacancy) => {
  const exp = normalize(vacancy.experience);
  if (!exp) return false;
  if (exp.includes('soralanok') || exp.includes('saylanok') || exp.includes('gerekdal')
    || exp === 'yok' || exp === 'ýok') {
    return false;
  }
  // Diňe «Tejribeli» / «Bar» ýaly umumy ýazgy — hökmany däl (Excel-de köp)
  if (/^(tejribeli|tejribe|bar|yes|howa|required)$/i.test(exp.replace(/\s+/g, ''))) {
    return false;
  }
  // Ýyl / san görkezilen bolsa hökmany (mysal: 2 ýyl, 1+, 3-5)
  if (/\d/.test(exp)) return true;
  if (exp.includes('yyl') || exp.includes('il') || exp.includes('year')) return true;
  return false;
};

/** Anketanyň programma sanawy */
const anketaProgramList = (anketa) => {
  const raw = anketa?.computerSkills || anketa?.computer_skills || [];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      if (typeof item === 'string') return normalize(item);
      return normalize(item?.name || item?.program || item?.title || '');
    })
    .filter((s) => s.length >= 2);
};

/** Wakansiýanyň programma tokenleri */
const vacancyProgramTokens = (vacancy) => normalize(vacancy?.computerPrograms || '')
  .split(/[,;/|+\n]+/)
  .map((s) => s.trim())
  .filter((s) => s.length >= 2 && !PROGRAM_STOPWORDS.has(s));

const anketaLangList = (anketa) => {
  const list = Array.isArray(anketa?.languages) ? anketa.languages : [];
  return list
    .map((item) => normalize(typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
};

const vacancyLangTokens = (vacancy) => normalize(vacancy?.languages || '')
  .split(/[,;/|+\-\s]+/)
  .map((s) => s.trim())
  .filter((s) => s.length >= 2 && !['we', 'hem', 'dil', 'diller', ' bilen'].includes(s));

/** Programmalar gabatlygy — AutoCAD ↔ AutoCAD, 1C ↔ 1c */
const matchPrograms = (anketa, vacancy) => {
  const ank = anketaProgramList(anketa);
  const vac = vacancyProgramTokens(vacancy);
  if (!ank.length || !vac.length) return [];
  return vac.filter((vp) => ank.some((ap) => {
    const a = ap.replace(/\s+/g, '');
    const v = vp.replace(/\s+/g, '');
    return a === v || a.includes(v) || v.includes(a);
  }));
};

const matchLanguages = (anketa, vacancy) => {
  const ank = anketaLangList(anketa);
  const vac = vacancyLangTokens(vacancy);
  if (!ank.length || !vac.length) return [];
  return vac.filter((vl) => ank.some((al) => al.includes(vl) || vl.includes(al)));
};

const parseSalaryRange = (text) => {
  if (isUnspecified(text) || isNegotiable(text)) return null;
  const nums = String(text).replace(/\s/g, '').match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return null;
  const vals = nums.map((x) => parseFloat(x.replace(',', '.'))).filter((n) => n > 0);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
};

const scoreSalary = (anketa, vacancy) => {
  const vRange = parseSalaryRange(vacancy.salary);
  const aRange = parseSalaryRange(anketa.currentSalary);
  if (!vRange || !aRange) return { score: 0, reason: '' };
  if (aRange.min <= vRange.max && vRange.min <= aRange.max) {
    return { score: 12, reason: 'Aýlyk haky gabat geldi' };
  }
  if (aRange.min > vRange.max) return { score: 0, reason: 'Aýlyk haky gabat gelmedi' };
  return { score: 6, reason: 'Aýlyk haky gabat geldi' };
};

const parseHourRange = (text) => {
  const m = String(text || '').match(/(\d{1,2})[:.](\d{2})\s*[-–—]?\s+(\d{1,2})[:.](\d{2})/)
    || String(text || '').match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return {
    start: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
    end: parseInt(m[3], 10) * 60 + parseInt(m[4], 10),
  };
};

const scoreWorkHours = (anketa, vacancy) => {
  if (isUnspecified(vacancy.workHours)) return { score: 0, reason: '' };
  const aHours = [anketa.workSchedule, anketa.partTimeWork].filter(Boolean).join(' ');
  if (!aHours || isUnspecified(aHours)) return { score: 0, reason: '' };
  if (textIncludes(aHours, vacancy.workHours)) {
    return { score: 10, reason: 'Iş wagty gabat geldi' };
  }
  const vh = parseHourRange(vacancy.workHours);
  const ah = parseHourRange(aHours);
  if (vh && ah && Math.abs(vh.start - ah.start) <= 90 && Math.abs(vh.end - ah.end) <= 90) {
    return { score: 10, reason: 'Iş wagty gabat geldi' };
  }
  // Gabat gelmese-de ball berilmeýär — hard filter däl
  return { score: 0, reason: '' };
};

const vacancyMarital = (vacancy) => {
  const extra = vacancy?.extraData && typeof vacancy.extraData === 'object' ? vacancy.extraData : {};
  return extra.maritalStatus || extra.marital_status || vacancy?.maritalStatus || '';
};

const vacancyCarRequirement = (vacancy) => {
  const extra = vacancy?.extraData && typeof vacancy.extraData === 'object' ? vacancy.extraData : {};
  return extra.hasCar || extra.has_car || '';
};

const isCarYok = (value) => {
  const n = normalize(value);
  return !n || n === 'yok';
};

const vacancyRequiresCar = (vacCar) => {
  if (isUnspecified(vacCar)) return false;
  return !isCarYok(vacCar);
};

const anketaHasCar = (ankCar) => !isCarYok(ankCar);

const carCompatible = (ankCar, vacCar) => {
  if (!vacancyRequiresCar(vacCar)) return true;
  if (!anketaHasCar(ankCar)) return false;
  const v = compactPhrase(vacCar);
  if (v === 'bar') return true;
  return textIncludes(ankCar, vacCar) || textIncludes(vacCar, ankCar);
};

const MARITAL_GROUPS = [
  ['masgalaly', 'oylenen', 'durmusa cykan', 'gurlan', 'aileli', 'married'],
  ['sallah', 'salah', 'boydak', 'durmusa cykmadyk', 'single'],
  ['ayrylysan', 'divorced'],
];

const maritalGroup = (value) => {
  const n = compactPhrase(value);
  if (!n) return -1;
  return MARITAL_GROUPS.findIndex((g) => g.some((k) => n === k || n.includes(k) || k.includes(n)));
};

const maritalCompatible = (anketaStatus, vacancyStatus) => {
  if (isUnspecified(vacancyStatus)) return true;
  if (isUnspecified(anketaStatus)) return false;
  if (textIncludes(anketaStatus, vacancyStatus)) return true;
  const ga = maritalGroup(anketaStatus);
  const gv = maritalGroup(vacancyStatus);
  return ga >= 0 && ga === gv;
};

const FEMALE_GENDERS = new Set(['ayal', 'gyz', 'zenan', 'female', 'woman', 'gelin', 'gyzgelin']);
const MALE_GENDERS = new Set(['erkek', 'oglan', 'male', 'man']);

const genderCompatible = (anketaGender, vacancyGender) => {
  if (isUnspecified(vacancyGender)) return true;
  const a = normalize(anketaGender);
  const v = normalize(vacancyGender).replace(/[-_/]+/g, ' ');
  if (!a) return false;
  if (textIncludes(a, v) || textIncludes(v, a)) return true;
  const vacAllowsMale = [...MALE_GENDERS].some((k) => v.includes(k));
  const vacAllowsFemale = [...FEMALE_GENDERS].some((k) => v.includes(k));
  if (vacAllowsMale && vacAllowsFemale) return true;
  if (FEMALE_GENDERS.has(a) && vacAllowsFemale) return true;
  if (MALE_GENDERS.has(a) && vacAllowsMale) return true;
  return FEMALE_GENDERS.has(a) && FEMALE_GENDERS.has(v);
};

/**
 * Hökmany süzgüç (öňki kriteriýalar):
 * 1) Wezipe — scoreMatch-da öňünden barlanýar
 * 2) Jyns — görkezilen bolsa
 * 3) Ýaş — ageRange görkezilen bolsa
 * 4) Maşgala ýagdaýy — saýlanan bolsa; Saýlanmaýar / boş bolsa seredilmeýär
 * Beýleki talaplar diňe ball (soft).
 */
const passesVacancyHardFilters = (anketa, vacancy) => {
  if (!isUnspecified(vacancy.gender) && !genderCompatible(anketa.gender, vacancy.gender)) {
    return false;
  }

  const ageRange = parseAgeRange(vacancy.ageRange);
  if (ageRange) {
    const age = getAge(anketa.birthYear);
    if (age === null || age < ageRange.min || age > ageRange.max) return false;
  }

  const vacMarital = vacancyMarital(vacancy);
  if (!isUnspecified(vacMarital) && !maritalCompatible(anketa.maritalStatus, vacMarital)) {
    return false;
  }

  return true;
};

const emptyMatch = (anketa) => ({
  score: 0,
  reasons: [],
  positionScore: 0,
  salaryScore: 0,
  hoursScore: 0,
  experienceScore: 0,
  genderScore: 0,
  langScore: 0,
  programScore: 0,
  ageScore: 0,
  maritalScore: 0,
  carScore: 0,
  exactPositionMatch: false,
  relevant: false,
  matchedPosition: '',
  experienceRecency: 0,
  anketaFreshness: getAnketaFreshness(anketa),
});

/** UI / API üçin ýeňil anketa */
const toAnketaLite = (anketa) => {
  const a = anketa?.toJSON ? anketa.toJSON() : anketa;
  if (!a) return null;
  const expList = getMeaningfulWorkExperience(a);
  const desiredList = splitDesiredPositions(a);
  return {
    id: a.id,
    anketaNumber: a.anketaNumber,
    desiredPosition: desiredList.length ? desiredList.join(' / ') : a.desiredPosition,
    extraData: desiredList.length ? { desiredPositions: desiredList } : undefined,
    familyName: a.familyName,
    firstName: a.firstName,
    patronymic: a.patronymic,
    phone: a.phone,
    gender: a.gender,
    birthYear: a.birthYear,
    status: a.status,
    formDate: a.formDate || null,
    workExperienceCount: expList.length,
    experienceRecency: getExperienceRecency(a),
  };
};

/**
 * Deňeşdirme: hökmany wezipe → jyns → ýaş → maşgala ýagdaýy; beýlekiler soft ball.
 * Maşgala saýlanmadyk bolsa şol süzgüç ulanylmaýar.
 */
const scoreMatch = (anketa, vacancy) => {
  const reasons = [];
  let score = 0;
  let positionScore = 0;
  let salaryScore = 0;
  let hoursScore = 0;
  let experienceScore = 0;
  let genderScore = 0;
  let programScore = 0;
  let langScore = 0;
  let ageScore = 0;
  let maritalScore = 0;
  let carScore = 0;
  let exactPositionMatch = false;

  const desiredList = splitDesiredPositions(anketa);
  const positionsToCheck = desiredList.length ? desiredList : [anketa.desiredPosition];
  const vacancyExclusiveGroup = exclusiveGroupIndex(vacancy.position);

  if (vacancyExclusiveGroup >= 0 && !desiredMatchesExclusiveVacancy(positionsToCheck, vacancy.position)) {
    return emptyMatch(anketa);
  }

  let matchedPosition = '';
  let matchedIdx = 99;
  positionsToCheck.forEach((pos, idx) => {
    if (!pos || !vacancy.position) return;
    if (positionsExclusiveConflict(pos, vacancy.position)) return;
    if (vacancyExclusiveGroup >= 0 && exclusiveGroupIndex(pos) !== vacancyExclusiveGroup) return;
    const hit = positionPhraseMatch(pos, vacancy.position);
    if (!hit.score) return;
    if (hit.score > positionScore || (hit.score === positionScore && idx < matchedIdx)) {
      positionScore = hit.score;
      exactPositionMatch = hit.exact;
      matchedPosition = pos;
      matchedIdx = idx;
    }
  });
  if (!positionScore) return emptyMatch(anketa);
  if (!passesVacancyHardFilters(anketa, vacancy)) return emptyMatch(anketa);
  // 1-nji wezipe +3, 2-nji +2, 3-nji +1 — wakansiýa tertip boýunça
  const orderBonus = matchedIdx < 3 ? (3 - matchedIdx) : 0;
  positionScore += orderBonus;
  score += positionScore;
  reasons.push('Wezipe gabat geldi');

  const ageRange = parseAgeRange(vacancy.ageRange);
  const age = getAge(anketa.birthYear);
  const vacMarital = vacancyMarital(vacancy);
  const vacCar = vacancyCarRequirement(vacancy);

  const salaryHit = scoreSalary(anketa, vacancy);
  salaryScore = salaryHit.score;
  score += salaryScore;
  if (salaryHit.reason) reasons.push(salaryHit.reason);

  const hoursHit = scoreWorkHours(anketa, vacancy);
  hoursScore = hoursHit.score;
  score += hoursScore;
  if (hoursHit.reason) reasons.push(hoursHit.reason);

  const pastPositions = experiencePositions(anketa);
  if (vacancy.position && pastPositions.length) {
    let bestExp = 0;
    pastPositions.forEach((pos) => {
      if (positionsExclusiveConflict(pos, vacancy.position)) return;
      const phrase = positionPhraseMatch(pos, vacancy.position);
      if (phrase.score) {
        bestExp = Math.max(bestExp, 10);
        return;
      }
      const overlap = tokensOverlap(expandPositionTokens(pos), expandPositionTokens(vacancy.position));
      if (overlap.length) bestExp = Math.max(bestExp, 6);
    });
    if (bestExp) {
      experienceScore = bestExp;
      score += bestExp;
      reasons.push(bestExp >= 10
        ? 'Iş tejribesi (öňki wezipe) gabat geldi'
        : 'Iş tejribesi bölekleýin gabat geldi');
    }
  }
  if (!experienceScore && vacancyNeedsExperience(vacancy) && experienceHasAny(anketa)) {
    experienceScore = 4;
    score += 4;
    reasons.push('Iş tejribesi bar');
  }

  if (!isUnspecified(vacancy.gender) && genderCompatible(anketa.gender, vacancy.gender)) {
    genderScore = 8;
    score += 8;
    reasons.push('Jynsy gabat geldi');
  }

  const langHits = matchLanguages(anketa, vacancy);
  if (langHits.length) {
    langScore = 6;
    score += 6;
    reasons.push('Dil bilimi gabat geldi');
  }

  const progHits = matchPrograms(anketa, vacancy);
  if (progHits.length) {
    programScore = 6;
    score += 6;
    reasons.push('Programmalar gabat geldi');
  }

  if (ageRange && age !== null && age >= ageRange.min && age <= ageRange.max) {
    ageScore = 5;
    score += 5;
    reasons.push('Ýaş aralygy gabat geldi');
  }

  if (!isUnspecified(vacMarital) && maritalCompatible(anketa.maritalStatus, vacMarital)) {
    maritalScore = 5;
    score += 5;
    reasons.push('Maşgala ýagdaýy gabat geldi');
  }

  if (vacancyRequiresCar(vacCar) && carCompatible(anketa.hasCar, vacCar)) {
    carScore = 5;
    score += 5;
    reasons.push('Şahsy awtoulag gabat geldi');
  }

  if (!isUnspecified(vacancy.education) && anketa.educationLevel
    && textIncludes(anketa.educationLevel, vacancy.education)) {
    score += 4;
    reasons.push('Bilim gabat geldi');
  }
  if (!isUnspecified(vacancy.registration) && anketa.registrationCity
    && textIncludes(anketa.registrationCity, vacancy.registration)) {
    score += 3;
    reasons.push('Propiska gabat geldi');
  }
  if (anketa.status === 'Islanok') {
    score += 3;
    reasons.push('Iş gözleýär');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    positionScore,
    salaryScore,
    hoursScore,
    experienceScore,
    genderScore,
    programScore,
    langScore,
    ageScore,
    maritalScore,
    carScore,
    exactPositionMatch,
    matchedPosition,
    relevant: true,
    experienceRecency: getMatchingExperienceRecency(anketa, vacancy),
    anketaFreshness: getAnketaFreshness(anketa),
  };
};

/** Tertip: wezipe → jyns → ýaş → maşgala ýagdaýy → beýleki ballar */
const sortMatchRows = (a, b) =>
  (b.exactPositionMatch ? 1 : 0) - (a.exactPositionMatch ? 1 : 0)
  || (b.positionScore || 0) - (a.positionScore || 0)
  || (b.genderScore || 0) - (a.genderScore || 0)
  || (b.ageScore || 0) - (a.ageScore || 0)
  || (b.maritalScore || 0) - (a.maritalScore || 0)
  || (b.salaryScore || 0) - (a.salaryScore || 0)
  || (b.hoursScore || 0) - (a.hoursScore || 0)
  || (b.experienceScore || 0) - (a.experienceScore || 0)
  || (b.langScore || 0) - (a.langScore || 0)
  || (b.programScore || 0) - (a.programScore || 0)
  || (b.carScore || 0) - (a.carScore || 0)
  || b.score - a.score
  || b.experienceRecency - a.experienceRecency
  || b.anketaFreshness - a.anketaFreshness;

const toVacancyMatchPublic = ({ vacancy, score, reasons, matchTier }) => ({
  vacancy,
  score,
  reasons,
  matchTier,
});

const toAnketaMatchPublic = ({ anketa, score, reasons, matchTier }) => ({
  anketa,
  score,
  reasons,
  matchTier,
});

/** Wakansiýa wezipesinden DB gözleg tokenleri (sinonimler bilen) */
const positionSearchTokens = (vacancyPosition) => {
  const words = positionWords(vacancyPosition);
  const out = new Set();
  words.forEach((w) => {
    expandWord(w).forEach((x) => {
      if (x && x.length >= 3) {
        turkmenSearchVariants(x).forEach((v) => out.add(v));
      }
    });
  });
  if (!out.size) {
    const c = compactPhrase(vacancyPosition).replace(/\s+/g, '');
    if (c.length >= 3) turkmenSearchVariants(c).forEach((v) => out.add(v));
  }
  return [...out];
};

const TM_FROM = 'äöüňşçýžÄÖÜŇŞÇÝŽ';
const TM_TO = 'aounscyyzAOUNSCYYZ';

const toAsciiTurkmen = (token) => String(token || '')
  .toLowerCase()
  .replace(/ý/g, 'y')
  .replace(/ä/g, 'a')
  .replace(/ö/g, 'o')
  .replace(/ü/g, 'u')
  .replace(/ň/g, 'n')
  .replace(/ş/g, 's')
  .replace(/ç/g, 'c')
  .replace(/ž/g, 'z');

const TURKMEN_LETTER_PAIRS = [
  ['a', 'ä'], ['o', 'ö'], ['u', 'ü'], ['n', 'ň'],
  ['s', 'ş'], ['c', 'ç'], ['y', 'ý'], ['z', 'ž'],
];

/** «tamizci» ↔ «tämizçi» — ähli wezipeler üçin */
const turkmenSearchVariants = (token) => {
  const raw = String(token || '').trim().toLowerCase();
  if (!raw) return [];
  const out = new Set([raw]);
  const ascii = toAsciiTurkmen(raw);
  out.add(ascii);
  let allTm = ascii;
  TURKMEN_LETTER_PAIRS.forEach(([plain, tm]) => {
    allTm = allTm.split(plain).join(tm);
  });
  out.add(allTm);
  out.add(ascii.replace(/y/g, 'ý'));
  const base = ascii;
  const flipable = [];
  for (let i = 0; i < base.length; i += 1) {
    const pair = TURKMEN_LETTER_PAIRS.find(([plain]) => plain === base[i]);
    if (pair) flipable.push({ i, tm: pair[1] });
  }
  if (flipable.length && flipable.length <= 6) {
    const total = 1 << flipable.length;
    for (let mask = 1; mask < total; mask += 1) {
      const chars = base.split('');
      flipable.forEach((f, bit) => {
        if (mask & (1 << bit)) chars[f.i] = f.tm;
      });
      out.add(chars.join(''));
    }
  } else {
    flipable.forEach((f) => {
      const chars = base.split('');
      chars[f.i] = f.tm;
      out.add(chars.join(''));
    });
  }
  return [...out].filter((t) => t.length >= 2);
};

/** PG: ä/ç tapawudy bolmaz ýaly gözleg */
const colUnaccentILike = (colName, asciiToken) => {
  const tok = toAsciiTurkmen(asciiToken).replace(/[%_]/g, '');
  if (!tok || tok.length < 2) return null;
  return sequelize.where(
    sequelize.fn(
      'translate',
      sequelize.fn('lower', sequelize.cast(sequelize.col(colName), 'text')),
      TM_FROM,
      TM_TO,
    ),
    { [Op.iLike]: '%' + tok + '%' },
  );
};

/**
 * Ähli bazadan wezipe boýunça kandidatlar.
 * translate() + wariantlar — tämizçi/sürüji/aşçy we ş.m.
 */
const anketaWhereForVacancyPosition = (vacancyPosition, statusFilter) => {
  const where = {};
  if (statusFilter && statusFilter !== 'all') {
    where.status = statusFilter;
  }

  const tokens = positionSearchTokens(vacancyPosition);
  const asciiTokens = [...new Set(
    tokens.flatMap((t) => searchStemsForToken(t)).filter((t) => t.length >= 3 || ['asy', 'smm'].includes(t)),
  )].slice(0, 40);
  if (!asciiTokens.length) {
    where.id = -1;
    return where;
  }

  const or = [];
  asciiTokens.forEach((t) => {
    const onDesired = colUnaccentILike('desired_position', t);
    const onExtra = colUnaccentILike('extra_data', t);
    if (onDesired) or.push(onDesired);
    if (onExtra) or.push(onExtra);
    turkmenSearchVariants(t).slice(0, 6).forEach((v) => {
      or.push({ desiredPosition: { [Op.iLike]: '%' + v + '%' } });
    });
  });
  where[Op.or] = or;
  return where;
};

/** Anketa → wakansiýa: OR (AND däl) — «Powar kömekçisi» → «Powar» */
const vacancyWhereForAnketaPositions = (desiredList, includeClosed, extraWhere = {}) => {
  const where = { ...extraWhere };
  if (!includeClosed) where.status = 'Acyk';

  const list = (Array.isArray(desiredList) ? desiredList : [desiredList])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  const orBlocks = [];

  list.forEach((pos) => {
    const words = positionWords(pos);
    const mods = words.filter((w) => !isGenericRoleWord(w) && !isPlaceModifierWord(w) && !isTitleRankWord(w) && w.length >= 4);
    const focus = mods.length ? mods : words.filter((w) => w.length >= 3 && !isPlaceModifierWord(w) && !isTitleRankWord(w));
    const tokenOr = [];

    const addToken = (m) => {
      searchStemsForToken(m).slice(0, 16).forEach((t) => {
        const u = colUnaccentILike('position', t);
        if (u) tokenOr.push(u);
        turkmenSearchVariants(t).slice(0, 5).forEach((v) => {
          if (v.length >= 2) tokenOr.push({ position: { [Op.iLike]: '%' + v + '%' } });
        });
      });
    };

    if (!focus.length) {
      const c = compactPhrase(pos).replace(/\s+/g, '');
      if (c.length >= 3) addToken(c);
    } else {
      focus.forEach((m) => addToken(m));
    }
    if (tokenOr.length) orBlocks.push({ [Op.or]: tokenOr });
  });

  if (orBlocks.length) where[Op.or] = orBlocks;
  return where;
};

class MatchService {
  /** Operator — diňe öz wakansiýalary; admin — ählisi; anketa hemişe umumy */
  operatorVacancyWhere(currentUser = null) {
    if (currentUser?.role === 'operator' && currentUser.id) {
      return { acceptedByUserId: currentUser.id };
    }
    return {};
  }

  assertOperatorOwnsVacancy(vacancy, currentUser = null) {
    if (
      currentUser?.role === 'operator'
      && currentUser.id
      && Number(vacancy.acceptedByUserId) !== Number(currentUser.id)
    ) {
      throw new ApiError(403, 'Bu wakansiýa size degişli däl');
    }
  }

  async matchForVacancy(vacancyId, minScore = 20, statusFilter = 'Islanok', options = {}) {
    const resultLimit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 10), 500);

    const vacancy = await Vacancy.findByPk(vacancyId, {
      attributes: VACANCY_MATCH_ATTRS.filter((a) => a !== 'assignmentCount'),
    });
    if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');
    this.assertOperatorOwnsVacancy(vacancy, options.currentUser);

    const vacPosRaw = String(vacancy.position || '').trim();
    if (!vacPosRaw) {
      return {
        vacancy,
        matches: [],
        statusFilter: statusFilter || 'all',
        totalMatched: 0,
      };
    }

    // Wezipe boýunça bazadan gözle — çäk: CPU ýüklenmesini saklamak
    const anketas = await Anketa.findAll({
      where: anketaWhereForVacancyPosition(vacPosRaw, statusFilter),
      attributes: ANKETA_MATCH_ATTRS,
      order: [['createdAt', 'DESC']],
      limit: 5000,
    });

    const scoreFloor = Number.isFinite(minScore) ? minScore : 20;

    const scored = anketas
      .map((anketa) => {
        const result = scoreMatch(anketa, vacancy);
        return { anketa: toAnketaLite(anketa), ...result };
      })
      .filter((m) => m.relevant && m.positionScore >= 45 && m.score >= scoreFloor)
      .sort(sortMatchRows);

    const matches = scored
      .slice(0, resultLimit)
      .map((m) => toAnketaMatchPublic({
        anketa: m.anketa,
        score: m.score,
        reasons: m.reasons,
        matchTier: 'position',
      }));

    return {
      vacancy,
      matches,
      statusFilter: statusFilter || 'all',
      totalMatched: scored.length,
    };
  }

  async matchForAnketa(anketaId, minScore = 0, options = {}) {
    const resultLimit = Math.min(Math.max(parseInt(options.limit, 10) || 150, 10), 500);

    const anketa = await Anketa.findByPk(anketaId, { attributes: ANKETA_MATCH_ATTRS });
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');

    const vacancyStatus = String(options.vacancyStatus || 'Acyk').trim();
    const includeClosed = vacancyStatus === 'all' || vacancyStatus === 'Ählisi';
    const desiredList = splitDesiredPositions(anketa);
    const vacWhere = vacancyWhereForAnketaPositions(
      desiredList.length ? desiredList : [anketa.desiredPosition],
      includeClosed,
      this.operatorVacancyWhere(options.currentUser),
    );

    const vacancies = await Vacancy.findAll({
      where: vacWhere,
      attributes: VACANCY_MATCH_ATTRS.filter((a) => a !== 'assignmentCount'),
      order: [['createdAt', 'DESC']],
      limit: 4000,
    });

    const scoreFloor = Number.isFinite(minScore) ? minScore : 0;

    const scored = vacancies
      .map((vacancy) => {
        const result = scoreMatch(anketa, vacancy);
        return { vacancy, ...result };
      })
      .filter((m) => m.relevant && m.positionScore >= 45 && m.score >= scoreFloor)
      .sort((a, b) => {
        const oa = String(a.vacancy?.status || '') === 'Acyk' ? 1 : 0;
        const ob = String(b.vacancy?.status || '') === 'Acyk' ? 1 : 0;
        return (ob - oa) || sortMatchRows(a, b);
      });

    const mapPublic = (m) => toVacancyMatchPublic({
      vacancy: m.vacancy,
      score: m.score,
      reasons: m.reasons,
      matchTier: 'position',
    });

    const positionMatches = scored.slice(0, resultLimit).map(mapPublic);

    return {
      anketa: toAnketaLite(anketa),
      matches: positionMatches,
      positionMatches,
      skillMatches: [],
      totalPosition: scored.length,
      totalSkills: 0,
      vacancyStatus: includeClosed ? 'all' : 'Acyk',
    };
  }

  async recommendAll(limit = 20, currentUser = null) {
    const vacancies = await Vacancy.findAll({
      where: {
        status: 'Acyk',
        ...this.operatorVacancyWhere(currentUser),
      },
      attributes: VACANCY_MATCH_ATTRS.filter((a) => a !== 'assignmentCount'),
      order: [['createdAt', 'DESC']],
      limit: 25,
    });

    const anketas = await Anketa.findAll({
      where: { status: 'Islanok' },
      attributes: ANKETA_MATCH_ATTRS,
      order: [['createdAt', 'DESC']],
      limit: 150,
    });

    const results = [];
    for (const vacancy of vacancies) {
      const matches = anketas
        .map((anketa) => {
          const result = scoreMatch(anketa, vacancy);
          return { anketa: toAnketaLite(anketa), ...result };
        })
        .filter((m) => m.relevant && m.positionScore >= 45 && m.score >= 25)
        .sort(sortMatchRows);

      if (matches.length) {
        results.push({
          vacancy,
          topMatches: matches.slice(0, 5).map(({ anketa, score, reasons }) => ({ anketa, score, reasons })),
          totalMatches: matches.length,
        });
      }
    }

    return results.slice(0, limit);
  }
}

module.exports = new MatchService();
