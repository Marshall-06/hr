function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseAnchorDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return startOfDay(new Date(Number(s), 0, 1));
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    return startOfDay(new Date(y, m - 1, 1));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-').map(Number);
    return startOfDay(new Date(y, m - 1, day));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function mondayOf(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + offset);
  return x;
}

/** Gün / hepde / aý / ýyl — from/to ISO seneleri */
function resolvePeriodRange(period, date) {
  const today = startOfDay(new Date());
  const p = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  const anchor = parseAnchorDate(date) || today;
  let start;
  let end;
  if (p === 'day') {
    start = new Date(anchor);
    end = new Date(anchor);
  } else if (p === 'week') {
    start = mondayOf(anchor);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (p === 'year') {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31);
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  return {
    period: p,
    from: toIsoDate(startOfDay(start)),
    to: toIsoDate(startOfDay(end)),
  };
}

module.exports = {
  resolvePeriodRange,
  parseAnchorDate,
  toIsoDate,
};
