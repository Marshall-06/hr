const { Op } = require('sequelize');

const buildPagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 2000);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const buildSearchFilter = (fields, search) => {
  if (!search || !fields.length) return {};
  return {
    [Op.or]: fields.map((field) => ({
      [field]: { [Op.iLike]: `%${search}%` },
    })),
  };
};

const formatFullName = (familyName, firstName, patronymic) => {
  return [familyName, firstName, patronymic].filter(Boolean).join(' ');
};

/** Anketa senesinden ýyl (26) we aý (2) — format: 26/2/78 */
const parseAnketaDateParts = (dateRef) => {
  let y;
  let m;
  if (dateRef instanceof Date && !Number.isNaN(dateRef.getTime())) {
    y = dateRef.getFullYear();
    m = dateRef.getMonth() + 1;
  } else if (typeof dateRef === 'string') {
    const iso = dateRef.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      y = Number(iso[1]);
      m = Number(iso[2]);
    } else {
      const d = new Date(dateRef);
      if (!Number.isNaN(d.getTime())) {
        y = d.getFullYear();
        m = d.getMonth() + 1;
      }
    }
  }
  if (y == null || m == null || m < 1 || m > 12) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  return {
    yy: String(y).slice(-2),
    month: m,
  };
};

/** Pozulan № (`26/8/50#del12`) tertibe girmez. */
const isFreedAnketaNumber = (raw) => /#del\d+$/i.test(String(raw || ''));

const isUniqueConstraintError = (err) => {
  if (!err) return false;
  if (err.name === 'SequelizeUniqueConstraintError') return true;
  const code = err.parent?.code || err.original?.code || err.code;
  return String(code) === '23505';
};

/** Şu ýyl/aý üçin iň uly tertip (26/2/78 → 78). 26/20 bilen garyşmaz. */
const maxSeqForMonth = async (Anketa, yy, month) => {
  const rows = await Anketa.findAll({
    attributes: ['anketaNumber'],
    where: {
      anketaNumber: { [Op.like]: `${yy}/%` },
    },
    paranoid: false,
    raw: true,
  });
  let max = 0;
  const monthStr = String(month);
  for (const r of rows) {
    const num = String(r.anketaNumber || '');
    if (isFreedAnketaNumber(num)) continue;
    const parts = num.split('/');
    if (parts.length < 3) continue;
    if (parts[0] !== yy) continue;
    if (String(Number(parts[1])) !== monthStr) continue;
    const n = parseInt(parts[2], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};

/**
 * Täze anketa №: ÝYL/AÝ/TERTIP
 * Mysal: 2026-nji ýylyň fewralynda 78-nji → 26/2/78
 */
const generateAnketaNumber = async (Anketa, dateRef) => {
  const { yy, month } = parseAnketaDateParts(dateRef);
  const max = await maxSeqForMonth(Anketa, yy, month);
  return `${yy}/${month}/${max + 1}`;
};

/**
 * Excel / köp setir: bir aýda yzygider sanlar (bir gezek DB-den max alýar).
 */
const createAnketaNumberAllocator = async (Anketa) => {
  const nextByMonth = new Map();
  return async (dateRef) => {
    const { yy, month } = parseAnketaDateParts(dateRef);
    const key = `${yy}/${month}`;
    if (!nextByMonth.has(key)) {
      const max = await maxSeqForMonth(Anketa, yy, month);
      nextByMonth.set(key, max + 1);
    }
    const n = nextByMonth.get(key);
    nextByMonth.set(key, n + 1);
    return `${yy}/${month}/${n}`;
  };
};

const needsAutoAnketaNumber = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (/^IMP\//i.test(s)) return true;
  // Excel-de № eýýäm bar — sakla (täzeden berilmez)
  return false;
};

const generateContractNumber = async (Contract, anketaNumber) => {
  const count = await Contract.count();
  return anketaNumber || `${count + 1}/7/75`;
};

/** Iň uly wakansiýa № + 1 (mysal: 786 → 787). Pozulanlar hem hasaplanýar. */
const getNextVacancyNumber = async (Vacancy) => {
  const max = await Vacancy.max('vacancyNumber', { paranoid: false });
  const n = Number(max);
  return Number.isFinite(n) && n > 0 ? n + 1 : 1;
};

const excelDateToJS = (serial) => {
  if (!serial) return null;
  if (typeof serial === 'string') return serial;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split('T')[0];
};

module.exports = {
  buildPagination,
  buildSearchFilter,
  formatFullName,
  parseAnketaDateParts,
  maxSeqForMonth,
  generateAnketaNumber,
  createAnketaNumberAllocator,
  needsAutoAnketaNumber,
  generateContractNumber,
  getNextVacancyNumber,
  isUniqueConstraintError,
  excelDateToJS,
};
