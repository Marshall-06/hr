const { Op, where, fn, col } = require('sequelize');

/** Bar / Ýok — saýlaw we filter */
function foldBarYok(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ÿ/g, 'y');
}

function isYokValue(value) {
  const f = foldBarYok(value);
  return !f || f === 'yok';
}

function isBarValue(value) {
  return !isYokValue(value);
}

/** Filter param: bar | yok | null */
function parseBarYokFilter(raw) {
  const f = foldBarYok(raw);
  if (!f) return null;
  if (f === 'yok') return 'yok';
  if (f === 'bar') return 'bar';
  return null;
}

/** Sequelize: has_car sütüni bar/yok-a normalizasiýa */
function normalizedHasCarColumn(columnName = 'has_car') {
  return fn(
    'LOWER',
    fn(
      'REPLACE',
      fn(
        'REPLACE',
        fn('TRIM', fn('COALESCE', col(columnName), '')),
        'Ý',
        'y',
      ),
      'ý',
      'y',
    ),
  );
}

function buildHasCarWhere(sequelize, mode, columnName = 'has_car') {
  const norm = normalizedHasCarColumn(columnName);
  if (mode === 'yok') {
    return where(norm, { [Op.in]: ['', 'yok'] });
  }
  if (mode === 'bar') {
    return where(norm, { [Op.notIn]: ['', 'yok'] });
  }
  return null;
}

/** Wakansiýa: extra_data JSON */
function buildVacancyHasCarWhere(sequelize) {
  const expr = `LOWER(REPLACE(REPLACE(TRIM(BOTH FROM COALESCE("Vacancy"."extra_data"->>'hasCar', "Vacancy"."extra_data"->>'has_car', '')), 'Ý', 'y'), 'ý', 'y'))`;
  return {
    yok: sequelize.literal(`(${expr} IN ('', 'yok'))`),
    bar: sequelize.literal(`(${expr} NOT IN ('', 'yok'))`),
  };
}

module.exports = {
  foldBarYok,
  isYokValue,
  isBarValue,
  parseBarYokFilter,
  buildHasCarWhere,
  buildVacancyHasCarWhere,
};
