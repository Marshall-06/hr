const { Op } = require('sequelize');
const { Anketa, Vacancy, Contract, VacancyAssignment, User, AgencyFeePayment } = require('../models');
const feePaymentService = require('./feePaymentService');
const { parseMoney } = feePaymentService;
const {
  splitPositions,
  clusterPositions,
  normalizePositionKey,
  similarKeys,
} = require('../utils/positionNormalize');

const AGENCY_FEE_RATE = 0.5;

const ASSIGNMENT_STATUSES = [
  'Hödürlendi',
  'Ugradyldy',
  'Barjak diýdi',
  'Kabul edildi',
  'Olar atkaz etdiler',
  'Kabul edilmedi',
  'Özi otkaz etdi',
  'Işden çykdy',
];

/** Hasabatda operator — diňe ady (familiýa/fullName däl) */
function operatorReportName(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Bellenmedik';
  return s.split(/\s+/)[0];
}

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
  // 2026 | 2026-07 | 2026-07-17
  if (/^\d{4}$/.test(s)) return startOfDay(new Date(Number(s), 0, 1));
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    return startOfDay(new Date(y, m - 1, 1));
  }
  const d = startOfDay(new Date(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mondayOf(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Ýekşenbe
  const offset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + offset);
  return x;
}

/**
 * Anyk döwür:
 * - day: diňe şol gün (17.07.2026)
 * - week: şol hepdäniň Duşenbe–Ýekşenbe
 * - month: diňe şol aý (07.2026)
 * - year: diňe şol ýyl (2026)
 */
function resolveRange(period, date, from, to) {
  const today = startOfDay(new Date());
  const p = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  // Köne from/to — diňe ikisem berlen bolsa custom aralyk; ýogsam period+date
  if (from && to && !date) {
    let start = parseAnchorDate(from) || today;
    let end = parseAnchorDate(to) || today;
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }
    return {
      period: p,
      start,
      end,
      from: toIsoDate(start),
      to: toIsoDate(end),
      bucket: p === 'year' ? 'month' : 'day',
      title: `${fmtDisplayDate(start)} — ${fmtDisplayDate(end)}`,
    };
  }

  const anchor = parseAnchorDate(date) || parseAnchorDate(from) || today;
  let start;
  let end;
  let title;
  let bucket = 'day';

  if (p === 'day') {
    start = new Date(anchor);
    end = new Date(anchor);
    title = fmtDisplayDate(start);
    bucket = 'day';
  } else if (p === 'week') {
    start = mondayOf(anchor);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    title = `${fmtDisplayDate(start)} — ${fmtDisplayDate(end)}`;
    bucket = 'day';
  } else if (p === 'year') {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31);
    title = String(anchor.getFullYear());
    bucket = 'month';
  } else {
    // month
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    title = `${pad2(start.getMonth() + 1)}.${start.getFullYear()}`;
    bucket = 'day';
  }

  return {
    period: p,
    start: startOfDay(start),
    end: startOfDay(end),
    from: toIsoDate(start),
    to: toIsoDate(end),
    bucket,
    title,
    anchor: toIsoDate(anchor),
  };
}

function fmtDisplayDate(d) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtMonthLabel(ym) {
  const [y, m] = String(ym).split('-');
  return `${m}.${y}`;
}

function fmtDayLabel(iso) {
  const d = parseAnchorDate(iso);
  if (!d) return String(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function bucketKey(dateVal, bucket) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  if (bucket === 'month') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  if (bucket === 'year') return String(d.getFullYear());
  return toIsoDate(d);
}

function buildBuckets(start, end, bucket) {
  const keys = [];
  const display = [];
  const cursor = startOfDay(start);
  if (bucket === 'month') {
    cursor.setDate(1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
      keys.push(key);
      display.push(fmtMonthLabel(key));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (bucket === 'year') {
    cursor.setMonth(0, 1);
    while (cursor.getFullYear() <= end.getFullYear()) {
      const key = String(cursor.getFullYear());
      keys.push(key);
      display.push(key);
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  } else {
    const last = startOfDay(end);
    while (cursor <= last) {
      const key = toIsoDate(cursor);
      keys.push(key);
      display.push(fmtDayLabel(key));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return { keys, display };
}

function emptySeries(n) {
  return Array(n).fill(0);
}

const ANKETA_LIST_ATTRS = [
  'id', 'anketaNumber', 'formDate', 'familyName', 'firstName', 'patronymic',
  'desiredPosition', 'phone', 'gender', 'status', 'registrationCity',
  'employmentDate', 'closedReason',
];

/** Wezipe hasabaty cache */
let byPositionCache = { at: 0, data: null };
const BY_POSITION_TTL_MS = 90 * 1000;

function buildClusterKeyIndex(clusters) {
  const keyToIdx = new Map();
  clusters.forEach((c, idx) => {
    if (c.key) keyToIdx.set(c.key, idx);
    const posKey = normalizePositionKey(c.position);
    if (posKey) keyToIdx.set(posKey, idx);
    (c.variants || []).forEach((v) => {
      const label = typeof v === 'string' ? v : v.label;
      const k = normalizePositionKey(label);
      if (k) keyToIdx.set(k, idx);
    });
  });
  return keyToIdx;
}

function resolveClusterIndex(key, clusters, keyToIdx) {
  if (!key) return -1;
  const hit = keyToIdx.get(key);
  if (hit != null) return hit;
  for (let i = 0; i < clusters.length; i += 1) {
    if (similarKeys(key, clusters[i].key)) {
      keyToIdx.set(key, i);
      return i;
    }
  }
  return -1;
}

class ReportService {
  /**
   * Hasabat/töleg default sene — şu günden uly däl soňky işjeňlik (ýerleşme/anketa/wakansiýa/töleg).
   * Mysal: şu gün awgust, soňky maglumat iýul → iýul açylýar (boş awgust däl).
   */
  async latestActivityDate() {
    const today = toIsoDate(startOfDay(new Date()));
    const [emp, form, vac, pay] = await Promise.all([
      Anketa.max('employmentDate'),
      Anketa.max('formDate'),
      Vacancy.max('vacancyDate'),
      AgencyFeePayment.max('paymentDate'),
    ]);
    const dates = [emp, form, vac, pay]
      .map((d) => (d ? String(d).slice(0, 10) : ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today)
      .sort();
    return {
      date: dates.length ? dates[dates.length - 1] : today,
      today,
    };
  }

  async overview() {
    const [
      totalAnketas,
      isleyar,
      islanok,
      totalVacancies,
      acyk,
      yapyk,
      totalContracts,
      signedContracts,
    ] = await Promise.all([
      Anketa.count(),
      Anketa.count({ where: { status: 'Isleyar' } }),
      Anketa.count({ where: { status: 'Islanok' } }),
      Vacancy.count(),
      Vacancy.count({ where: { status: 'Acyk' } }),
      Vacancy.count({ where: { status: 'Yapyk' } }),
      Contract.count(),
      Contract.count({ where: { status: 'Gol cekildi' } }),
    ]);

    return {
      anketas: { total: totalAnketas, isleyar, islanok },
      vacancies: { total: totalVacancies, acyk, yapyk },
      contracts: { total: totalContracts, signed: signedContracts },
    };
  }

  async anketasByPeriod(from, to) {
    const where = {};
    if (from || to) {
      where.formDate = {};
      if (from) where.formDate[Op.gte] = from;
      if (to) where.formDate[Op.lte] = to;
    }

    const items = await Anketa.findAll({
      where,
      order: [['formDate', 'DESC']],
      attributes: ANKETA_LIST_ATTRS,
    });

    return {
      from: from || null,
      to: to || null,
      total: items.length,
      isleyar: items.filter((i) => i.status === 'Isleyar').length,
      islanok: items.filter((i) => i.status === 'Islanok').length,
      items,
    };
  }

  async anketasByStatus(status) {
    const where = {};
    if (status === 'Isleyar' || status === 'Islanok') where.status = status;

    const items = await Anketa.findAll({
      where,
      order: [['formDate', 'DESC'], ['id', 'DESC']],
      attributes: ANKETA_LIST_ATTRS,
      limit: 500,
    });

    return {
      status: status || 'all',
      total: items.length,
      items,
    };
  }

  async vacanciesByPeriod(from, to) {
    const where = {};
    if (from || to) {
      where.vacancyDate = {};
      if (from) where.vacancyDate[Op.gte] = from;
      if (to) where.vacancyDate[Op.lte] = to;
    }

    const items = await Vacancy.findAll({
      where,
      order: [['vacancyDate', 'DESC']],
      attributes: [
        'id', 'vacancyNumber', 'vacancyDate', 'companyName', 'position',
        'salary', 'status', 'assignedCandidateName', 'assignmentStatus', 'location',
        'forumOperator', 'contactName',
      ],
    });

    return {
      from: from || null,
      to: to || null,
      total: items.length,
      acyk: items.filter((i) => i.status === 'Acyk').length,
      yapyk: items.filter((i) => i.status === 'Yapyk').length,
      items,
    };
  }

  async employedReport(from, to) {
    const where = { status: 'Isleyar' };
    if (from || to) {
      where.employmentDate = {};
      if (from) where.employmentDate[Op.gte] = from;
      if (to) where.employmentDate[Op.lte] = to;
    }

    const items = await Anketa.findAll({
      where,
      order: [['employmentDate', 'DESC']],
      attributes: [
        'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
        'desiredPosition', 'phone', 'employmentDate', 'closedReason',
      ],
    });

    return { from: from || null, to: to || null, total: items.length, items };
  }

  async contractsReport(from, to) {
    const where = {};
    if (from || to) {
      where.contractDate = {};
      if (from) where.contractDate[Op.gte] = from;
      if (to) where.contractDate[Op.lte] = to;
    }

    const items = await Contract.findAll({
      where,
      order: [['contractDate', 'DESC']],
      include: [{
        model: Anketa,
        as: 'anketa',
        attributes: ['id', 'anketaNumber', 'desiredPosition', 'phone'],
      }],
    });

    return {
      from: from || null,
      to: to || null,
      total: items.length,
      signed: items.filter((i) => i.status === 'Gol cekildi').length,
      draft: items.filter((i) => i.status === 'Taslama').length,
      items,
    };
  }

  invalidateByPositionCache() {
    byPositionCache = { at: 0, data: null };
  }

  async byPosition({ force = false } = {}) {
    const now = Date.now();
    if (!force && byPositionCache.data && (now - byPositionCache.at) < BY_POSITION_TTL_MS) {
      return byPositionCache.data;
    }

    const anketas = await Anketa.findAll({
      attributes: ['id', 'desiredPosition', 'status'],
      raw: true,
    });

    const rawFreq = {};
    const anketaEntries = [];

    for (let i = 0; i < anketas.length; i += 1) {
      const a = anketas[i];
      const parts = splitPositions(a.desiredPosition);
      const keys = [];
      for (let p = 0; p < parts.length; p += 1) {
        const pos = parts[p];
        rawFreq[pos] = (rawFreq[pos] || 0) + 1;
        const k = normalizePositionKey(pos);
        if (k) keys.push(k);
      }
      anketaEntries.push({ id: a.id, status: a.status, keys });
    }

    const clusters = clusterPositions(rawFreq);
    const keyToIdx = buildClusterKeyIndex(clusters);
    const stats = clusters.map(() => ({ total: 0, isleyar: 0, islanok: 0 }));

    for (let i = 0; i < anketaEntries.length; i += 1) {
      const a = anketaEntries[i];
      const claimed = new Set();
      for (let k = 0; k < a.keys.length; k += 1) {
        const idx = resolveClusterIndex(a.keys[k], clusters, keyToIdx);
        if (idx >= 0) claimed.add(idx);
      }
      claimed.forEach((idx) => {
        stats[idx].total += 1;
        if (a.status === 'Isleyar') stats[idx].isleyar += 1;
        else stats[idx].islanok += 1;
      });
    }

    const items = clusters.map((c, idx) => ({
      position: c.position,
      key: c.key,
      variants: (c.variants || []).map((v) => (typeof v === 'string' ? v : v.label)),
      variantCount: (c.variants || []).length,
      total: stats[idx].total,
      isleyar: stats[idx].isleyar,
      islanok: stats[idx].islanok,
    })).filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total || a.position.localeCompare(b.position, 'tk'));

    const result = {
      uniquePositions: items.length,
      rawSpellings: Object.keys(rawFreq).length,
      totalAnketas: anketas.length,
      items,
    };

    byPositionCache = { at: now, data: result };
    return result;
  }

  async byPositionDetails(position, status = '') {
    const key = normalizePositionKey(position);
    if (!key && position !== 'Görkezilmedik') {
      return { position, status: status || 'all', total: 0, items: [], variants: [] };
    }

    const report = await this.byPosition();
    const group = (report.items || []).find((it) =>
      it.key === key
      || normalizePositionKey(it.position) === key
      || (it.variants || []).some((v) => normalizePositionKey(v) === key)
      || String(it.position).toLowerCase() === String(position).toLowerCase());

    const cluster = group || {
      position: position || 'Görkezilmedik',
      key,
      variants: [position || 'Görkezilmedik'],
    };

    const clusterKeys = new Set(
      (cluster.variants || []).map((v) => normalizePositionKey(typeof v === 'string' ? v : v)),
    );
    if (cluster.key) clusterKeys.add(cluster.key);
    if (cluster.position) clusterKeys.add(normalizePositionKey(cluster.position));

    const matchByFastKeys = (raw) => {
      const parts = splitPositions(raw);
      for (let i = 0; i < parts.length; i += 1) {
        const k = normalizePositionKey(parts[i]);
        if (!k) continue;
        if (clusterKeys.has(k)) return true;
        for (const ck of clusterKeys) {
          if (similarKeys(k, ck)) {
            clusterKeys.add(k);
            return true;
          }
        }
      }
      return false;
    };

    const where = {};
    if (status === 'Isleyar' || status === 'Islanok') where.status = status;

    const [all, vacancies] = await Promise.all([
      Anketa.findAll({
        where,
        order: [['formDate', 'DESC'], ['id', 'DESC']],
        attributes: ANKETA_LIST_ATTRS,
        limit: 800,
        raw: true,
      }),
      Vacancy.findAll({
        where: { status: 'Acyk' },
        attributes: ['id', 'vacancyNumber', 'companyName', 'position', 'salary'],
        order: [['id', 'DESC']],
        limit: 200,
        raw: true,
      }),
    ]);

    const items = all.filter((a) => matchByFastKeys(a.desiredPosition));
    const matchVacancies = vacancies.filter((v) => matchByFastKeys(v.position)).slice(0, 20);

    return {
      position: cluster.position,
      key: cluster.key,
      variants: cluster.variants || [cluster.position],
      status: status || 'all',
      total: items.length,
      items,
      matchVacancies,
    };
  }

  /**
   * Diagrammalar üçin doly analitika (anyk gün/hepde/aý/ýyl).
   */
  async analytics({ period = 'month', date = '', from = '', to = '' } = {}) {
    const range = resolveRange(period, date, from, to);
    const p = range.period;
    const bucket = range.bucket;
    const { keys: labels, display: displayLabels } = buildBuckets(range.start, range.end, bucket);
    const idx = new Map(labels.map((l, i) => [l, i]));

    const anketaDateWhere = {
      formDate: { [Op.gte]: range.from, [Op.lte]: range.to },
    };
    const vacancyDateWhere = {
      vacancyDate: { [Op.gte]: range.from, [Op.lte]: range.to },
    };
    const employedDateWhere = {
      status: 'Isleyar',
      employmentDate: { [Op.gte]: range.from, [Op.lte]: range.to },
    };
    const assignmentCreatedRange = {
      [Op.gte]: new Date(`${range.from}T00:00:00`),
      [Op.lte]: new Date(`${range.to}T23:59:59.999`),
    };
    const assignmentDateWhere = {
      createdAt: assignmentCreatedRange,
    };
    const acceptedDateWhere = {
      status: 'Kabul edildi',
      [Op.or]: [
        { acceptedAt: { [Op.gte]: range.from, [Op.lte]: range.to } },
        { acceptedAt: null, updatedAt: assignmentCreatedRange },
      ],
    };
    const assignmentIncludes = [
      {
        model: Vacancy,
        as: 'vacancy',
        attributes: ['id', 'salary', 'position', 'companyName', 'acceptedByUserId', 'forumOperator'],
        required: false,
      },
      {
        model: Anketa,
        as: 'anketa',
        attributes: ['id', 'anketaNumber', 'currentSalary', 'status', 'familyName', 'firstName', 'patronymic'],
        required: false,
      },
      {
        model: User,
        as: 'assignedBy',
        attributes: ['id', 'fullName', 'username', 'role'],
        required: false,
      },
    ];

    const [
      anketasInRange,
      vacanciesInRange,
      employedInRange,
      allAnketas,
      allVacancies,
      assignments,
      acceptedAssignments,
      users,
    ] = await Promise.all([
      Anketa.findAll({
        where: anketaDateWhere,
        attributes: ['id', 'formDate', 'status'],
        raw: true,
      }),
      Vacancy.findAll({
        where: vacancyDateWhere,
        attributes: ['id', 'vacancyDate', 'status', 'acceptedByUserId', 'forumOperator', 'salary'],
        raw: true,
      }),
      Anketa.findAll({
        where: employedDateWhere,
        attributes: [
          'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
          'desiredPosition', 'employmentDate', 'currentSalary',
        ],
        raw: true,
      }),
      Anketa.count(),
      Vacancy.count(),
      VacancyAssignment.findAll({
        where: assignmentDateWhere,
        attributes: ['id', 'status', 'assignedByUserId', 'anketaId', 'vacancyId', 'candidateName', 'createdAt'],
        include: assignmentIncludes,
      }),
      VacancyAssignment.findAll({
        where: acceptedDateWhere,
        attributes: [
          'id', 'status', 'assignedByUserId', 'anketaId', 'vacancyId', 'candidateName',
          'createdAt', 'updatedAt', 'acceptedAt',
        ],
        include: assignmentIncludes,
      }),
      User.findAll({
        attributes: ['id', 'fullName', 'username', 'role'],
        where: { isActive: true },
        raw: true,
      }),
    ]);

    const timeline = {
      labels: displayLabels,
      keys: labels,
      anketas: emptySeries(labels.length),
      vacancies: emptySeries(labels.length),
      hired: emptySeries(labels.length),
      assignments: emptySeries(labels.length),
      agencyIncome: emptySeries(labels.length),
    };

    anketasInRange.forEach((a) => {
      const k = bucketKey(a.formDate, bucket);
      if (k != null && idx.has(k)) timeline.anketas[idx.get(k)] += 1;
    });
    vacanciesInRange.forEach((v) => {
      const k = bucketKey(v.vacancyDate, bucket);
      if (k != null && idx.has(k)) timeline.vacancies[idx.get(k)] += 1;
    });
    employedInRange.forEach((a) => {
      const k = bucketKey(a.employmentDate, bucket);
      if (k != null && idx.has(k)) timeline.hired[idx.get(k)] += 1;
    });

    const statusCounts = Object.fromEntries(ASSIGNMENT_STATUSES.map((s) => [s, 0]));
    let otherStatus = 0;
    const asgRows = assignments.map((row) => (row.toJSON ? row.toJSON() : row));
    const acceptedRows = acceptedAssignments.map((row) => (row.toJSON ? row.toJSON() : row));

    asgRows.forEach((row) => {
      const st = String(row.status || 'Hödürlendi').trim() || 'Hödürlendi';
      if (st === 'Kabul edildi') {
        // Kabul sene «acceptedAt» boýunça aýratyn hasaplanýar
      } else if (statusCounts[st] != null) statusCounts[st] += 1;
      else otherStatus += 1;
      const k = bucketKey(row.createdAt, bucket);
      if (k != null && idx.has(k)) timeline.assignments[idx.get(k)] += 1;
    });

    const assignmentAcceptedDay = (row) => row.acceptedAt || row.updatedAt || row.createdAt;

    const financeMap = new Map();
    acceptedRows.forEach((r) => {
      statusCounts['Kabul edildi'] += 1;
      const acceptDay = assignmentAcceptedDay(r);
      const salary = parseMoney(r.vacancy?.salary) || parseMoney(r.anketa?.currentSalary);
      const fee = Math.round(salary * AGENCY_FEE_RATE * 100) / 100;
      const key = `anketa-${r.anketaId}`;
      if (financeMap.has(key)) {
        const prev = financeMap.get(key);
        if (!prev.salary && salary) {
          prev.salary = salary;
          prev.agencyFee = fee;
          prev.company = r.vacancy?.companyName || '';
          prev.vacancyPosition = r.vacancy?.position || '';
        }
        return;
      }
      financeMap.set(key, {
        key,
        source: 'Kabul edildi',
        anketaId: r.anketaId,
        anketaNumber: r.anketa?.anketaNumber,
        name: r.candidateName
          || [r.anketa?.familyName, r.anketa?.firstName, r.anketa?.patronymic].filter(Boolean).join(' ')
          || '—',
        position: r.vacancy?.position || r.anketa?.desiredPosition || '—',
        company: r.vacancy?.companyName || '',
        date: acceptDay,
        salary,
        agencyFee: fee,
      });
      const k = bucketKey(acceptDay, bucket);
      if (k != null && idx.has(k)) timeline.agencyIncome[idx.get(k)] += fee;
    });

    const financePlacements = [...financeMap.values()]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    // Töleg kartlary — Tölegler taby bilen birmeňzeş (şol API / hasap)
    const feeList = await feePaymentService.list({
      period: p,
      date: range.anchor,
      limit: 500,
    });
    const feeItems = feeList.items || [];
    const feeTotals = feeList.totals || {};
    const feeDue = Math.round((Number(feeTotals.expectedFee) || 0) * 100) / 100;
    const feeReceived = Math.round((Number(feeTotals.paid) || 0) * 100) / 100;
    const feeRemaining = Math.round((Number(feeTotals.remaining) || 0) * 100) / 100;

    const feeDetails = {
      due: feeItems.filter((x) => (Number(x.expectedFee) || 0) > 0.009),
      received: feeItems
        .filter((x) => (Number(x.paid) || 0) > 0.009)
        .map((x) => ({ ...x, amount: x.paid, paidInPeriod: x.paid })),
      remaining: feeItems.filter((x) => (Number(x.remaining) || 0) > 0.009),
      dueTotal: feeRemaining,
      receivedPayments: [],
      placementIds: feeItems.map((x) => x.anketaId).filter(Boolean),
    };

    const feeCash = await feePaymentService.financeSummaryForAnketaIds(
      feeItems.map((x) => x.anketaId).filter(Boolean),
      { from: range.from, to: range.to },
    );

    // Girdeji KPI — Tölegler «Almaly» bilen deň
    const totalSalary = feeItems.reduce((s, x) => s + (Number(x.salary) || 0), 0);
    const agencyIncome = feeDue;

    // Bu döwürde anketa ýagdaýy (umumy jemi däl)
    let isleyarInPeriod = 0;
    let islanokInPeriod = 0;
    anketasInRange.forEach((a) => {
      if (a.status === 'Isleyar') isleyarInPeriod += 1;
      else islanokInPeriod += 1;
    });

    const opMap = new Map();
    const ensureOp = (id, name) => {
      const key = id != null ? `u-${id}` : `n-${name || 'none'}`;
      if (!opMap.has(key)) {
        opMap.set(key, {
          userId: id || null,
          name: name || 'Bellenmedik',
          vacancies: 0,
          assignments: 0,
          ugradyldy: 0,
          kabul: 0,
          hodurlendi: 0,
          barjak: 0,
          atkaz: 0,
          otherStatus: 0,
          anketasHandled: 0,
          _anketas: new Set(),
        });
      }
      return opMap.get(key);
    };

    users.forEach((u) => {
      if (u.role === 'operator') {
        ensureOp(u.id, operatorReportName(u.fullName || u.username));
      }
    });

    const adminIds = new Set(
      users.filter((u) => u.role === 'admin').map((u) => u.id),
    );
    const adminNames = new Set(
      users
        .filter((u) => u.role === 'admin')
        .flatMap((u) => [u.fullName, u.username, operatorReportName(u.fullName || u.username)])
        .map((n) => String(n || '').trim().toLowerCase())
        .filter(Boolean),
    );

    vacanciesInRange.forEach((v) => {
      // Admin işjeňligi operator hasabatynda görkezilmeýär
      if (v.acceptedByUserId && adminIds.has(v.acceptedByUserId)) return;
      const rawName = v.forumOperator || 'Bellenmedik';
      if (adminNames.has(String(rawName).trim().toLowerCase())) return;
      const name = operatorReportName(rawName);
      const op = ensureOp(v.acceptedByUserId || null, name);
      op.vacancies += 1;
      if (!op.name || op.name === 'Bellenmedik') op.name = name;
    });

    asgRows.forEach((r) => {
      if (r.assignedByUserId && adminIds.has(r.assignedByUserId)) return;
      const u = r.assignedBy;
      if (u?.role === 'admin') return;
      const rawName = u?.fullName || u?.username || 'Bellenmedik';
      if (adminNames.has(String(rawName).trim().toLowerCase())) return;
      const name = operatorReportName(rawName);
      const op = ensureOp(r.assignedByUserId || null, name);
      op.assignments += 1;
      if (r.anketaId) op._anketas.add(r.anketaId);
      const st = String(r.status || '').trim();
      if (st === 'Hödürlendi') op.hodurlendi += 1;
      else if (st === 'Ugradyldy') op.ugradyldy += 1;
      else if (st === 'Barjak diýdi') op.barjak += 1;
      else if (st === 'Olar atkaz etdiler') op.atkaz += 1;
      else if (st && st !== 'Kabul edildi') op.otherStatus += 1;
    });

    acceptedRows.forEach((r) => {
      if (r.assignedByUserId && adminIds.has(r.assignedByUserId)) return;
      const u = r.assignedBy;
      if (u?.role === 'admin') return;
      const rawName = u?.fullName || u?.username || 'Bellenmedik';
      if (adminNames.has(String(rawName).trim().toLowerCase())) return;
      const name = operatorReportName(rawName);
      const op = ensureOp(r.assignedByUserId || null, name);
      op.kabul += 1;
      if (r.anketaId) op._anketas.add(r.anketaId);
    });

    // Ähli operatorlar görünmeli (0 işjeňlik hem) — aýratyn saýlap bolsun
    const operators = [...opMap.values()]
      .map((o) => {
        const anketasHandled = o._anketas.size;
        delete o._anketas;
        return {
          ...o,
          name: operatorReportName(o.name),
          anketasHandled,
          statuses: {
            'Hödürlendi': o.hodurlendi || 0,
            'Ugradyldy': o.ugradyldy || 0,
            'Barjak diýdi': o.barjak || 0,
            'Kabul edildi': o.kabul || 0,
            'Olar atkaz etdiler': o.atkaz || 0,
            'Beýleki': o.otherStatus || 0,
          },
        };
      })
      .filter((o) => {
        if (o.userId && adminIds.has(o.userId)) return false;
        if (adminNames.has(String(o.name || '').trim().toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const score = (x) => (x.assignments || 0) + (x.vacancies || 0) + (x.kabul || 0);
        const d = score(b) - score(a);
        if (d !== 0) return d;
        return String(a.name || '').localeCompare(String(b.name || ''), 'tk');
      });

    const isleyarTotal = await Anketa.count({ where: { status: 'Isleyar' } });
    const islanokTotal = await Anketa.count({ where: { status: 'Islanok' } });
    const acykTotal = await Vacancy.count({ where: { status: 'Acyk' } });
    const yapykTotal = await Vacancy.count({ where: { status: 'Yapyk' } });

    return {
      period: p,
      bucket,
      title: range.title,
      anchor: range.anchor,
      from: range.from,
      to: range.to,
      fromDisplay: fmtDisplayDate(range.start),
      toDisplay: fmtDisplayDate(range.end),
      feeRate: AGENCY_FEE_RATE,
      summary: {
        anketasTotal: allAnketas,
        anketasInPeriod: anketasInRange.length,
        vacanciesTotal: allVacancies,
        vacanciesInPeriod: vacanciesInRange.length,
        isleyarTotal,
        islanokTotal,
        isleyarInPeriod,
        islanokInPeriod,
        hiredInPeriod: employedInRange.length,
        acykTotal,
        yapykTotal,
        assignmentsInPeriod: asgRows.length,
        kabulInPeriod: statusCounts['Kabul edildi'] || 0,
        ugradyldyInPeriod: statusCounts.Ugradyldy || 0,
        placedFinanceCount: feeItems.length,
        totalSalary: Math.round(totalSalary * 100) / 100,
        agencyIncome: Math.round(agencyIncome * 100) / 100,
        feeDue,
        feeReceived,
        feeRemaining,
        feeCashInPeriod: feeCash.feeCashInPeriod,
      },
      timeline,
      assignmentStatus: {
        labels: ASSIGNMENT_STATUSES.filter((s) => (statusCounts[s] || 0) > 0)
          .concat(otherStatus ? ['Beýleki'] : []),
        values: ASSIGNMENT_STATUSES
          .filter((s) => (statusCounts[s] || 0) > 0)
          .map((s) => statusCounts[s] || 0)
          .concat(otherStatus ? [otherStatus] : []),
      },
      operators,
      financePlacements: financePlacements.slice(0, 100),
      feeCash,
      feeDetails,
    };
  }
}

module.exports = new ReportService();
