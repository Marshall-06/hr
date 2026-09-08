const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Anketa, AgencyFeePayment, User, VacancyAssignment, Vacancy } = require('../models');
const ApiError = require('../utils/ApiError');
const { buildPagination } = require('../utils/helpers');
const { resolvePeriodRange } = require('../utils/periodRange');
const { isPlacedByUsReason } = require('../utils/placedByUs');
const { ASSIGNMENT_STATUS } = require('../utils/assignmentStatus');

const LEFT_WORK_STATUSES = ['Işden çykdy', 'Özi otkaz etdi', 'Olar atkaz etdiler'];

function resolvePlacementWorkerId(placement, assignedBy) {
  if (assignedBy?.role === 'operator' && assignedBy.id) return assignedBy.id;
  return null;
}

const AGENCY_FEE_RATE = 0.5;
const FEE_DAYS_IN_MONTH = 30;

function parseMoney(raw) {
  if (raw == null || raw === '') return 0;
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return 0;
  const mul = /(müň|myn|тыс)/i.test(s) ? 1000 : 1;
  // "2.500+5%" → diňe esasy aýlyk (2500). %+ goşulyp 2.5005 / 3 bolmaz ýaly.
  s = s.split(/[+/]/)[0] || s;
  s = s.replace(/\s+/g, '').replace(/%/g, '').replace(/[^\d,.\-]/g, '');
  if (!s) return 0;

  let n;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    n = parseFloat(s.replace(/\./g, ''));
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    n = parseFloat(s.replace(/,/g, ''));
  } else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) {
    n = parseFloat(s.replace(/,/g, ''));
  } else {
    const nums = s.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return 0;
    n = Math.max(...nums.map((x) => parseFloat(x) || 0));
  }
  return (Number.isFinite(n) ? n : 0) * mul;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function operatorFirstName(userOrName) {
  if (!userOrName) return '—';
  const s = typeof userOrName === 'string'
    ? userOrName
    : (userOrName.fullName || userOrName.username || '');
  const first = String(s).trim().split(/\s+/)[0];
  return first || '—';
}

function fullName(a) {
  return [a.familyName, a.firstName, a.patronymic].filter(Boolean).join(' ') || '—';
}

/** Anketa № tertibi: 26/10 soň 26/2 däl — san boýunça */
function anketaNumberSortKey(num) {
  const s = String(num || '').trim();
  const parts = s.split('/').map((p) => {
    const n = parseInt(String(p).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : -1;
  });
  while (parts.length < 3) parts.push(-1);
  return parts;
}

function compareAnketaNumber(a, b) {
  const ka = anketaNumberSortKey(a);
  const kb = anketaNumberSortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i += 1) {
    const da = ka[i] ?? -1;
    const db = kb[i] ?? -1;
    if (da !== db) return da - db;
  }
  return String(a || '').localeCompare(String(b || ''), 'tk');
}

/** Tölegler tablisasy — soňky kabul edilenler ýokarda (täze → köne) */
function compareByAcceptedRecent(a, b) {
  const ta = Date.parse(String(a.acceptedSortAt || a.acceptedAt || a.workStartDate || '')) || 0;
  const tb = Date.parse(String(b.acceptedSortAt || b.acceptedAt || b.workStartDate || '')) || 0;
  if (ta !== tb) return tb - ta;
  const ida = Number(a.anketaId) || 0;
  const idb = Number(b.anketaId) || 0;
  if (ida !== idb) return idb - ida;
  return compareAnketaNumber(a.anketaNumber, b.anketaNumber);
}

/**
 * Ilki bölek tölenenler (anketa №), soň tölenmedikler (anketa №)
 */
function sortDuePeople(list) {
  const partial = [];
  const unpaid = [];
  (list || []).forEach((x) => {
    if ((Number(x.paid) || 0) > 0.009) partial.push(x);
    else unpaid.push(x);
  });
  partial.sort((a, b) => compareAnketaNumber(a.anketaNumber, b.anketaNumber));
  unpaid.sort((a, b) => compareAnketaNumber(a.anketaNumber, b.anketaNumber));
  return partial.concat(unpaid);
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

function resolveFeePeriodRange(period, date) {
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

/** Doly aýlygyň 50% (30 gün üçin) */
function expectedFeeFromSalary(salaryRaw) {
  return round2(parseMoney(salaryRaw) * AGENCY_FEE_RATE);
}

function normalizeIsoDay(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = parseAnchorDate(s);
  return d ? toIsoDate(d) : null;
}

/** Işe başlan senesinden +1 aý (mysal: 18.08 → 18.09) */
function addMonthsIso(isoDate, months = 1) {
  const dayStr = normalizeIsoDay(isoDate);
  const d = parseAnchorDate(dayStr);
  if (!d) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return toIsoDate(d);
}

/**
 * Işlen gün: 17.08 → 27.08 = 10 gün (27 − 17), iki tarapy goşup 11 däl.
 * Şol gün başlap şol gün çykan bolsa = 1 gün.
 */
function daysWorkedCount(fromIso, toIso) {
  const from = parseAnchorDate(fromIso);
  const to = parseAnchorDate(toIso);
  if (!from || !to || to < from) return 0;
  const diff = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return diff === 0 ? 1 : diff;
}

function daysInclusive(fromIso, toIso) {
  return daysWorkedCount(fromIso, toIso);
}

function feeTodayIso() {
  return toIsoDate(startOfDay(new Date()));
}

/**
 * Agentstwa tölegi:
 * — Işden çykmadyk (çykan sene ýok) → aýlygyň doly 50% (1700 → 850)
 * — Işden çykdy → 50% ÷ 30 × işlän gün (10 gün, 20 gün…)
 */
function computeAgencyDue(salaryRaw, { stillWorking, workStartIso, leftDateIso }) {
  const monthlyFee = expectedFeeFromSalary(salaryRaw);
  const workStart = normalizeIsoDay(workStartIso);
  const salaryReceiveDate = workStart ? addMonthsIso(workStart, 1) : null;
  const dailyFee = monthlyFee > 0 ? monthlyFee / FEE_DAYS_IN_MONTH : 0;
  const leftDay = normalizeIsoDay(leftDateIso);
  if (monthlyFee <= 0) {
    return {
      expectedFee: 0,
      daysWorked: 0,
      fullMonthFee: 0,
      dailyFee: 0,
      salaryReceiveDate,
    };
  }
  // Işden çykmadyk (çykan sene ýok) → hemişe aýlygyň 50%-i
  if (!leftDay) {
    return {
      expectedFee: monthlyFee,
      daysWorked: FEE_DAYS_IN_MONTH,
      fullMonthFee: monthlyFee,
      dailyFee: round2(dailyFee),
      salaryReceiveDate,
    };
  }
  if (!workStart) {
    return {
      expectedFee: monthlyFee,
      daysWorked: FEE_DAYS_IN_MONTH,
      fullMonthFee: monthlyFee,
      dailyFee: round2(dailyFee),
      salaryReceiveDate,
    };
  }
  const daysWorked = Math.min(FEE_DAYS_IN_MONTH, Math.max(1, daysWorkedCount(workStart, leftDay)));
  return {
    expectedFee: round2(dailyFee * daysWorked),
    daysWorked,
    fullMonthFee: monthlyFee,
    dailyFee: round2(dailyFee),
    salaryReceiveDate,
  };
}

function computeProratedFee(salaryRaw, workStartIso, workEndIso) {
  return computeAgencyDue(salaryRaw, {
    stillWorking: !normalizeIsoDay(workEndIso),
    workStartIso,
    leftDateIso: workEndIso,
  });
}

function paymentPlain(p) {
  const row = p.toJSON ? p.toJSON() : p;
  return {
    id: row.id,
    anketaId: row.anketaId,
    amount: round2(row.amount),
    paymentDate: row.paymentDate,
    note: row.note || '',
    createdAt: row.createdAt,
    createdBy: row.createdBy
      ? {
        id: row.createdBy.id,
        fullName: row.createdBy.fullName,
        username: row.createdBy.username,
      }
      : null,
  };
}

class FeePaymentService {
  async resolveSalary(anketa, placement = null) {
    const fromPlacement = parseMoney(placement?.vacancySalary);
    if (fromPlacement > 0) return fromPlacement;

    const fromAnketa = parseMoney(anketa?.currentSalary);
    if (fromAnketa > 0) return fromAnketa;

    if (placement?.assignmentId) {
      const byId = await VacancyAssignment.findByPk(placement.assignmentId, {
        paranoid: false,
        include: [{
          model: Vacancy,
          as: 'vacancy',
          attributes: ['salary'],
          paranoid: false,
        }],
      });
      const fromRow = parseMoney(byId?.vacancy?.salary);
      if (fromRow > 0) return fromRow;
    }

    const asg = await VacancyAssignment.findOne({
      where: { anketaId: anketa.id },
      paranoid: false,
      include: [{
        model: Vacancy,
        as: 'vacancy',
        attributes: ['salary'],
        paranoid: false,
      }],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });
    return parseMoney(asg?.vacancy?.salary);
  }

  async acceptedDayByAnketaIds(anketaIds) {
    const map = new Map();
    if (!anketaIds.length) return map;

    const activeRows = await VacancyAssignment.findAll({
      attributes: ['anketaId', 'acceptedAt', 'updatedAt', 'createdAt'],
      where: {
        anketaId: { [Op.in]: anketaIds },
        status: ASSIGNMENT_STATUS.ACCEPTED,
      },
      raw: true,
    });
    activeRows.forEach((r) => {
      const day = this.isoDay(r.acceptedAt) || this.isoDay(r.updatedAt) || this.isoDay(r.createdAt);
      const id = Number(r.anketaId);
      if (!day || !id) return;
      const prev = map.get(id);
      if (!prev || day > prev) map.set(id, day);
    });

    const missing = anketaIds.map(Number).filter((id) => id > 0 && !map.has(id));
    if (!missing.length) return map;

    const rows = await VacancyAssignment.findAll({
      attributes: ['anketaId', 'acceptedAt', 'updatedAt', 'createdAt'],
      where: {
        anketaId: { [Op.in]: missing },
        acceptedAt: { [Op.ne]: null },
      },
      raw: true,
    });
    rows.forEach((r) => {
      const day = this.isoDay(r.acceptedAt) || this.isoDay(r.updatedAt) || this.isoDay(r.createdAt);
      const id = Number(r.anketaId);
      if (!day || !id) return;
      const prev = map.get(id);
      if (!prev || day > prev) map.set(id, day);
    });
    return map;
  }

  async buildAnketaFeeRow(
    anketa,
    paidMap,
    acceptedAt,
    placement = null,
    _workPeriodFromIso = null,
    _workPeriodToIso = null,
  ) {
    const salary = await this.resolveSalary(anketa, placement);
    const acceptedDay = normalizeIsoDay(
      acceptedAt
      || placement?.acceptedAt
      || anketa.employmentDate,
    );
    const workStartDate = acceptedDay;
    const leftDate = placement?.leftDate || null;
    const stillWorking = placement?.workStatus === 'working'
      || (!leftDate && placement?.assignmentStatus !== ASSIGNMENT_STATUS.LEFT_JOB);
    const workStatus = stillWorking ? 'working' : 'left';

    // Döwür diňe sanaw üçin. Almaly: işde → aýlygyň 50%; çykdy → 50% ÷ 30 × işlän gün.
    const feeCalc = computeAgencyDue(salary, {
      stillWorking,
      workStartIso: workStartDate,
      leftDateIso: leftDate,
    });
    const expectedFee = feeCalc.expectedFee;
    const paid = round2(paidMap.get(anketa.id) || 0);
    const remaining = round2(Math.max(0, expectedFee - paid));
    let payStatus = 'open';
    if (expectedFee <= 0) payStatus = 'no_salary';
    else if (remaining <= 0) payStatus = 'paid';
    else if (paid > 0) payStatus = 'partial';

    return {
      anketaId: anketa.id,
      anketaNumber: anketa.anketaNumber,
      name: fullName(anketa),
      phone: anketa.phone || '',
      position: placement?.position || anketa.desiredPosition || '—',
      companyName: placement?.companyName || '—',
      employmentDate: workStartDate,
      workStartDate,
      acceptedAt: acceptedDay,
      acceptedSortAt: placement?.acceptedSortAt || acceptedDay,
      workStatus,
      assignmentStatus: placement?.assignmentStatus || null,
      assignmentId: placement?.assignmentId || null,
      assignedByUserId: placement?.assignedByUserId || null,
      leftDate,
      operatorName: placement?.operatorName || '—',
      salaryReceiveAt: placement?.salaryReceiveAt || null,
      salaryReceiveDate: normalizeIsoDay(placement?.salaryReceiveAt) || feeCalc.salaryReceiveDate,
      daysWorked: feeCalc.daysWorked,
      fullMonthFee: feeCalc.fullMonthFee,
      dailyFee: feeCalc.dailyFee,
      salary: round2(salary),
      expectedFee,
      paid,
      remaining,
      payStatus,
      feeRate: AGENCY_FEE_RATE,
    };
  }

  async paidTotalsByAnketaIds(anketaIds) {
    const map = new Map();
    if (!anketaIds.length) return map;
    const rows = await AgencyFeePayment.findAll({
      where: { anketaId: { [Op.in]: anketaIds } },
      attributes: ['anketaId', 'amount'],
      raw: true,
    });
    rows.forEach((r) => {
      const id = r.anketaId;
      map.set(id, round2((map.get(id) || 0) + Number(r.amount || 0)));
    });
    return map;
  }

  async placedByUsAnketaIds() {
    return this.feeEligibleAnketaIds();
  }

  invalidateEligibleCache() {
    this._eligibleIdsCache = null;
    this._eligibleIdsCacheAt = 0;
  }

  /** Häzir işleýän, öň ýerleşen ýa-da töleg ýazgysy bar anketalar */
  async feeEligibleAnketaIds() {
    const now = Date.now();
    if (
      this._eligibleIdsCache
      && (now - this._eligibleIdsCacheAt) < 45000
    ) {
      return this._eligibleIdsCache;
    }

    const [rows] = await sequelize.query(`
      SELECT DISTINCT anketa_id AS id FROM vacancy_assignments
      WHERE deleted_at IS NULL
        AND (
          status IN ('Kabul edildi', 'Işden çykdy')
          OR accepted_at IS NOT NULL
        )
      UNION
      SELECT DISTINCT anketa_id AS id FROM agency_fee_payments
      WHERE anketa_id IS NOT NULL
      UNION
      SELECT id FROM anketas
      WHERE deleted_at IS NULL
        AND (
          closed_reason ILIKE '%Biziň ýerleşdiren%'
          OR closed_reason ILIKE '%bizin%yerlesdiren%'
        )
    `);

    const ids = (rows || [])
      .map((r) => Number(r.id))
      .filter((id) => id > 0);
    this._eligibleIdsCache = ids;
    this._eligibleIdsCacheAt = now;
    return ids;
  }

  async isFeeEligible(anketaId) {
    if (!anketaId) return false;
    const id = Number(anketaId);
    if (
      this._eligibleIdsCache
      && (Date.now() - this._eligibleIdsCacheAt) < 45000
    ) {
      return this._eligibleIdsCache.includes(id);
    }

    const [hit] = await sequelize.query(`
      SELECT 1 AS ok WHERE EXISTS (
        SELECT 1 FROM vacancy_assignments
        WHERE anketa_id = :id AND deleted_at IS NULL
          AND (
            status IN ('Kabul edildi', 'Işden çykdy')
            OR accepted_at IS NOT NULL
          )
      ) OR EXISTS (
        SELECT 1 FROM agency_fee_payments WHERE anketa_id = :id
      ) OR EXISTS (
        SELECT 1 FROM anketas
        WHERE id = :id AND deleted_at IS NULL
          AND (
            closed_reason ILIKE '%Biziň ýerleşdiren%'
            OR closed_reason ILIKE '%bizin%yerlesdiren%'
          )
      )
      LIMIT 1
    `, { replacements: { id } });
    return Boolean(hit?.length);
  }

  async lastPaymentDateByAnketaIds(anketaIds) {
    const map = new Map();
    if (!anketaIds.length) return map;
    const rows = await AgencyFeePayment.findAll({
      where: { anketaId: { [Op.in]: anketaIds } },
      attributes: ['anketaId', 'paymentDate'],
      order: [['paymentDate', 'DESC'], ['id', 'DESC']],
      raw: true,
    });
    rows.forEach((r) => {
      const id = Number(r.anketaId);
      if (!id || map.has(id)) return;
      map.set(id, this.isoDay(r.paymentDate));
    });
    return map;
  }

  async placementDetailsByAnketaIds(anketaIds) {
    const map = new Map();
    if (!anketaIds.length) return map;

    const rows = await VacancyAssignment.findAll({
      where: { anketaId: { [Op.in]: anketaIds } },
      paranoid: false,
      include: [
        {
          model: Vacancy,
          as: 'vacancy',
          attributes: ['companyName', 'companyDirection', 'position', 'salary', 'acceptedByUserId'],
          paranoid: false,
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'fullName', 'username', 'role'],
          required: false,
        },
      ],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });

    const byAnketa = new Map();
    rows.forEach((r) => {
      const id = Number(r.anketaId);
      if (!byAnketa.has(id)) byAnketa.set(id, []);
      byAnketa.get(id).push(r);
    });

    anketaIds.forEach((rawId) => {
      const id = Number(rawId);
      const list = byAnketa.get(id) || [];
      if (!list.length) return;

      const acceptedNow = list
        .filter((a) => a.status === ASSIGNMENT_STATUS.ACCEPTED)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      const leftJobRow = list
        .filter((a) => String(a.status || '').trim() === ASSIGNMENT_STATUS.LEFT_JOB)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      const withAccepted = list
        .filter((a) => a.acceptedAt)
        .sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)));
      const placement = acceptedNow || leftJobRow || withAccepted[0] || list[0];
      const working = Boolean(acceptedNow);

      let leftDate = null;
      if (!working && leftJobRow) {
        leftDate = this.isoDay(leftJobRow.leftAt)
          || this.isoDay(leftJobRow.updatedAt)
          || this.isoDay(leftJobRow.acceptedAt);
      }

      const operator = placement.assignedBy;
      const workerId = resolvePlacementWorkerId(placement, operator);
      const assignmentStatus = working
        ? ASSIGNMENT_STATUS.ACCEPTED
        : (leftJobRow ? ASSIGNMENT_STATUS.LEFT_JOB : placement.status);

      const sortSource = acceptedNow || leftJobRow || placement;
      const acceptedSortAt = sortSource?.updatedAt
        ? new Date(sortSource.updatedAt).toISOString()
        : (this.isoDay(sortSource?.acceptedAt) || null);

      const salarySource = working ? acceptedNow : (leftJobRow || placement);
      const vacancySalary = salarySource?.vacancy?.salary
        || leftJobRow?.vacancy?.salary
        || acceptedNow?.vacancy?.salary
        || placement.vacancy?.salary
        || null;

      map.set(id, {
        assignmentId: salarySource?.id || placement.id,
        assignedByUserId: workerId,
        assignmentStatus,
        companyName: (salarySource || placement).vacancy?.companyName || '—',
        companyDirection: (salarySource || placement).vacancy?.companyDirection || '—',
        position: (salarySource || placement).vacancy?.position || '—',
        vacancySalary,
        operatorName: 'Admin',
        workStatus: working ? 'working' : 'left',
        leftDate,
        acceptedAt: this.isoDay((salarySource || placement).acceptedAt) || null,
        salaryReceiveAt: this.isoDay((salarySource || placement).salaryReceiveAt) || null,
        acceptedSortAt,
      });
    });

    const workerIds = [...new Set(
      [...map.values()].map((v) => Number(v.assignedByUserId)).filter((n) => n > 0),
    )];
    if (workerIds.length) {
      const workers = await User.findAll({
        where: { id: { [Op.in]: workerIds } },
        attributes: ['id', 'fullName', 'username', 'role'],
      });
      const workerMap = new Map(workers.map((u) => [u.id, u]));
      map.forEach((row) => {
        const w = workerMap.get(Number(row.assignedByUserId));
        if (w?.role === 'operator') {
          row.operatorName = operatorFirstName(w);
        } else if (w?.role === 'admin') {
          row.operatorName = 'Admin';
        }
      });
    }

    return map;
  }

  isoDay(raw) {
    if (!raw) return '';
    const s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return toIsoDate(startOfDay(d));
  }

  /** Töleg döwri — «Kabul edildi» / acceptedAt senesi */
  async placedByUsAnketaIdsInPeriod(from, to) {
    const rows = await VacancyAssignment.findAll({
      attributes: ['anketaId', 'acceptedAt', 'updatedAt', 'createdAt', 'status'],
      where: { acceptedAt: { [Op.ne]: null } },
      raw: true,
    });
    const ids = [];
    rows.forEach((r) => {
      const day = this.isoDay(r.acceptedAt) || this.isoDay(r.updatedAt) || this.isoDay(r.createdAt);
      if (day && day >= from && day <= to) ids.push(Number(r.anketaId));
    });
    return [...new Set(ids.filter((n) => n > 0))];
  }

  async assertPlacedByUs(anketa) {
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    const ok = await this.isFeeEligible(anketa.id)
      || isPlacedByUsReason(anketa.closedReason);
    if (!ok) {
      throw new ApiError(400, 'Töleg diňe biziň ýerleşdirenlerimiz üçin ýazylýar (Hödürlenen → Kabul edildi)');
    }
  }

  /**
   * Tölegler sanawynda döwürden bagymsyz hemişe görüner:
   * — häzir «Kabul edildi» (işleýär)
   * — «Işden çykdy» (işe başlan / çykan sene bilen aýlyk hasaplamak üçin)
   */
  async getActiveAcceptedAnketaIds() {
    const rows = await VacancyAssignment.findAll({
      attributes: ['anketaId'],
      where: {
        status: {
          [Op.in]: [ASSIGNMENT_STATUS.ACCEPTED, ASSIGNMENT_STATUS.LEFT_JOB],
        },
      },
      raw: true,
    });
    return [...new Set(rows.map((r) => Number(r.anketaId)).filter((n) => n > 0))];
  }

  /** Bu döwürde işden çykanlar — aýlyk hasaplamak üçin töleglerde görünsin */
  async leftJobAnketaIdsInPeriod(from, to) {
    if (!from || !to) return [];
    const rows = await VacancyAssignment.findAll({
      attributes: ['anketaId', 'leftAt', 'updatedAt', 'acceptedAt'],
      where: { status: ASSIGNMENT_STATUS.LEFT_JOB },
      raw: true,
    });
    const ids = [];
    rows.forEach((r) => {
      const day = this.isoDay(r.leftAt) || this.isoDay(r.updatedAt) || this.isoDay(r.acceptedAt);
      if (day && day >= from && day <= to) ids.push(Number(r.anketaId));
    });
    return [...new Set(ids.filter((n) => n > 0))];
  }

  async list(query = {}) {
    const { page, limit, offset } = buildPagination(query);
    const placedIds = await this.placedByUsAnketaIds();
    if (!placedIds.length) {
      return {
        items: [],
        totals: { expectedFee: 0, paid: 0, remaining: 0, feeRate: AGENCY_FEE_RATE },
        period: null,
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const where = { id: { [Op.in]: placedIds } };
    const period = String(query.period || '').trim();
    const hasPeriod = ['day', 'week', 'month', 'year'].includes(period);
    const range = hasPeriod ? resolvePeriodRange(period, query.date) : null;

    if (query.anketaNumber) {
      where.anketaNumber = { [Op.iLike]: `%${String(query.anketaNumber).trim()}%` };
    }
    if (query.search) {
      const q = `%${String(query.search).trim()}%`;
      where[Op.or] = [
        { anketaNumber: { [Op.iLike]: q } },
        { familyName: { [Op.iLike]: q } },
        { firstName: { [Op.iLike]: q } },
        { patronymic: { [Op.iLike]: q } },
        { phone: { [Op.iLike]: q } },
        { desiredPosition: { [Op.iLike]: q } },
      ];
    }

    if (range) {
      const activeIds = await this.getActiveAcceptedAnketaIds();
      const acceptedIds = await this.placedByUsAnketaIdsInPeriod(range.from, range.to);
      const leftInPeriodIds = await this.leftJobAnketaIdsInPeriod(range.from, range.to);
      const paidInPeriod = await AgencyFeePayment.findAll({
        where: { paymentDate: { [Op.between]: [range.from, range.to] } },
        attributes: ['anketaId'],
        raw: true,
      });
      const paidIds = [...new Set(paidInPeriod.map((r) => r.anketaId).filter(Boolean))];
      const periodOnlyIds = [...new Set([...acceptedIds, ...leftInPeriodIds, ...paidIds])];
      // Häzir «Kabul edildi» + «Işden çykdy» — döwürden bagymsyz hemişe görünsin
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            activeIds.length ? { id: { [Op.in]: activeIds } } : { id: -1 },
            periodOnlyIds.length ? { id: { [Op.in]: periodOnlyIds } } : { id: -1 },
          ],
        },
      ];
    }

    const workStatus = String(query.workStatus || '').trim();
    const operatorId = parseInt(query.operatorId || query.assignedByUserId, 10);
    const needsFullFetch = hasPeriod
      || operatorId > 0
      || (query.payStatus && query.payStatus !== 'all')
      || (workStatus && workStatus !== 'all');

    // Tertip: bölek / tölenmedik üçin setirleri alyp soň sort (pagination dogry bolsun)
    const fetchLimit = needsFullFetch ? 1200 : limit;
    const fetchOffset = needsFullFetch ? 0 : offset;

    const FEE_LIST_ATTRS = [
      'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic', 'phone',
      'desiredPosition', 'status', 'employmentDate', 'currentSalary', 'closedReason',
      'formDate', 'createdAt',
    ];

    const { rows, count } = await Anketa.findAndCountAll({
      where,
      attributes: FEE_LIST_ATTRS,
      limit: fetchLimit,
      offset: fetchOffset,
      order: [
        ['employmentDate', 'DESC NULLS LAST'],
        ['id', 'DESC'],
      ],
    });

    const anketaIdList = rows.map((a) => a.id);
    const paidMap = await this.paidTotalsByAnketaIds(anketaIdList);
    const acceptedMap = await this.acceptedDayByAnketaIds(anketaIdList);
    const placementMap = await this.placementDetailsByAnketaIds(anketaIdList);
    let items = [];
    for (const a of rows) {
      items.push(await this.buildAnketaFeeRow(
        a,
        paidMap,
        acceptedMap.get(a.id),
        placementMap.get(a.id),
        range?.from || null,
        range?.to || null,
      ));
    }

    if (query.payStatus && query.payStatus !== 'all') {
      items = items.filter((x) => x.payStatus === query.payStatus);
    }

    if (workStatus === 'working') {
      items = items.filter((x) => x.workStatus === 'working');
    } else if (workStatus === 'left') {
      items = items.filter((x) => x.workStatus === 'left');
    }

    if (operatorId > 0) {
      items = items.filter((x) => Number(x.assignedByUserId) === operatorId);
    }

    items.sort(compareByAcceptedRecent);

    const totals = items.reduce(
      (acc, x) => {
        acc.expectedFee += x.expectedFee;
        acc.paid += x.paid;
        acc.remaining += x.remaining;
        return acc;
      },
      { expectedFee: 0, paid: 0, remaining: 0 },
    );

    const total = items.length;
    const pageItems = needsFullFetch
      ? items.slice(offset, offset + limit)
      : items;

    return {
      items: pageItems,
      totals: {
        expectedFee: round2(totals.expectedFee),
        paid: round2(totals.paid),
        remaining: round2(totals.remaining),
        feeRate: AGENCY_FEE_RATE,
      },
      period: range || null,
      pagination: {
        page,
        limit,
        total: needsFullFetch ? total : count,
        totalPages: Math.ceil((needsFullFetch ? total : count) / limit),
      },
    };
  }

  async getByAnketa(anketaId) {
    const anketa = await Anketa.findByPk(anketaId);
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    await this.assertPlacedByUs(anketa);

    const paidMap = await this.paidTotalsByAnketaIds([anketa.id]);
    const acceptedMap = await this.acceptedDayByAnketaIds([anketa.id]);
    const placementMap = await this.placementDetailsByAnketaIds([anketa.id]);
    const summary = await this.buildAnketaFeeRow(
      anketa,
      paidMap,
      acceptedMap.get(anketa.id),
      placementMap.get(anketa.id),
    );
    const payments = await AgencyFeePayment.findAll({
      where: { anketaId: anketa.id },
      include: [{
        model: User,
        as: 'createdBy',
        attributes: ['id', 'fullName', 'username'],
        required: false,
      }],
      order: [['paymentDate', 'DESC'], ['id', 'DESC']],
    });

    return {
      ...summary,
      payments: payments.map(paymentPlain),
    };
  }

  async addPayment(anketaId, data, currentUser) {
    const anketa = await Anketa.findByPk(anketaId);
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    await this.assertPlacedByUs(anketa);

    const amount = round2(data.amount);
    if (!(amount > 0)) throw new ApiError(400, 'Töleg mukdary 0-dan uly bolmaly');

    const paymentDate = String(data.paymentDate || '').trim()
      || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      throw new ApiError(400, 'Töleg senesi nädogry (YYYY-MM-DD)');
    }

    const row = await AgencyFeePayment.create({
      anketaId: anketa.id,
      amount,
      paymentDate,
      note: String(data.note || '').trim().slice(0, 500) || null,
      createdByUserId: currentUser?.id || null,
    });

    this._eligibleIdsCache = null;
    return this.getByAnketa(anketa.id);
  }

  async removePayment(paymentId, currentUser) {
    const row = await AgencyFeePayment.findByPk(paymentId);
    if (!row) throw new ApiError(404, 'Töleg ýazgysy tapylmady');
    const anketaId = row.anketaId;
    await row.destroy();
    this._eligibleIdsCache = null;
    return this.getByAnketa(anketaId);
  }

  payStatusLabel(st) {
    if (st === 'paid') return 'Doly tölenen';
    if (st === 'partial') return 'Bölek tölenen';
    if (st === 'no_salary') return 'Aýlyk ýok';
    return 'Tölenmedi';
  }

  workStatusLabel(st) {
    return st === 'working' ? 'Işleýär' : 'Çykdy';
  }

  /** Excel export — sanaw + töleg ýazgylary */
  async listForExport(query = {}) {
    const exportQuery = {
      ...query,
      page: 1,
      limit: 2000,
    };
    const result = await this.list(exportQuery);
    const items = result.items || [];
    const anketaIds = items.map((x) => x.anketaId).filter(Boolean);

    const paymentWhere = {};
    const period = String(query.period || '').trim();
    if (['day', 'week', 'month', 'year'].includes(period)) {
      const range = resolveFeePeriodRange(period, query.date);
      if (range) {
        paymentWhere.paymentDate = { [Op.between]: [range.from, range.to] };
      }
    }

    let paymentRows = [];
    if (anketaIds.length) {
      const payWhere = { ...paymentWhere, anketaId: { [Op.in]: anketaIds } };
      const payments = await AgencyFeePayment.findAll({
        where: payWhere,
        include: [{
          model: Anketa,
          as: 'anketa',
          attributes: ['id', 'anketaNumber', 'familyName', 'firstName', 'patronymic'],
          required: false,
        }],
        order: [['paymentDate', 'DESC'], ['id', 'DESC']],
      });
      paymentRows = payments.map((p) => {
        const row = p.toJSON ? p.toJSON() : p;
        const a = row.anketa || {};
        return {
          id: row.id,
          anketaId: row.anketaId,
          anketaNumber: a.anketaNumber || '',
          name: fullName(a),
          amount: round2(row.amount),
          paymentDate: row.paymentDate,
          note: row.note || '',
        };
      });
    }

    return {
      items,
      payments: paymentRows,
      totals: result.totals || {},
      period: result.period || null,
    };
  }

  /** Excel import — töleg ýazgylary goş */
  async importPayments(rows = [], currentUser, { anketaByNumber } = {}) {
    const { buildKeyIndex, getCell, excelSerialToDate } = require('../utils/excel');
    const created = [];
    const skipped = [];
    const errors = [];

    const findAnketa = async (rawNum) => {
      const key = String(rawNum || '').trim();
      if (!key) return null;
      if (anketaByNumber?.has(key)) return anketaByNumber.get(key);
      const variants = new Set([key]);
      const norm = key.replace(/\u00a0/g, '').replace(/\s+/g, '').replace(/[\\.\-]+/g, '/');
      variants.add(norm);
      const m = norm.match(/^(\d+)\/(\d+)\/(\d+)$/);
      if (m) {
        variants.add(`${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`);
        variants.add(`${String(m[1]).padStart(2, '0')}/${String(m[2]).padStart(2, '0')}/${m[3]}`);
      }
      const anketa = await Anketa.findOne({
        where: { anketaNumber: { [Op.in]: [...variants] } },
        attributes: ['id', 'anketaNumber'],
      });
      if (anketa && anketaByNumber) anketaByNumber.set(key, anketa);
      return anketa;
    };

    const parseDate = (raw) => {
      if (!raw && raw !== 0) return null;
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return toIsoDate(startOfDay(raw));
      }
      if (typeof raw === 'number' && raw > 20000 && raw < 60000) {
        const d = excelSerialToDate(raw);
        return d ? toIsoDate(startOfDay(d)) : null;
      }
      return normalizeIsoDay(String(raw).trim());
    };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;
      const keys = buildKeyIndex(row);
      const anketaRaw = getCell(row, [
        'Anketa №', 'Anketa No', 'Anketa nomeri', 'Anketa number', 'anketaNumber', '№',
      ], keys);
      const amountRaw = getCell(row, [
        'Mukdar', 'Töleg mukdary', 'amount', 'Töleg',
      ], keys);
      const dateRaw = getCell(row, [
        'Töleg senesi', 'Sene', 'payment_date', 'paymentDate', 'Töleg senesi',
      ], keys);
      const note = String(getCell(row, ['Bellik', 'note', 'Bellikler'], keys) || '').trim().slice(0, 500);
      const paymentId = parseInt(getCell(row, ['Töleg ID', 'Töleg id', 'paymentId', 'id'], keys), 10);

      if (!anketaRaw && !amountRaw && !dateRaw) continue;

      const amount = round2(parseMoney(amountRaw));
      const paymentDate = parseDate(dateRaw) || feeTodayIso();

      if (!anketaRaw) {
        errors.push({ row: i + 2, message: 'Anketa № ýok' });
        continue;
      }
      if (!amountRaw || !(amount > 0)) {
        skipped.push({ row: i + 2, reason: 'Mukdar ýok' });
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        errors.push({ row: i + 2, message: `Anketa ${anketaRaw}: sene nädogry` });
        continue;
      }

      if (paymentId > 0) {
        const existing = await AgencyFeePayment.findByPk(paymentId);
        if (existing) {
          skipped.push({ row: i + 2, reason: 'Töleg ID eýýäm bar', paymentId });
          continue;
        }
      }

      try {
        const anketa = await findAnketa(anketaRaw);
        if (!anketa) {
          errors.push({ row: i + 2, message: `Anketa tapylmady: ${anketaRaw}` });
          continue;
        }
        await this.assertPlacedByUs(anketa);

        const dup = await AgencyFeePayment.findOne({
          where: {
            anketaId: anketa.id,
            amount,
            paymentDate,
            note: note || null,
          },
        });
        if (dup) {
          skipped.push({ row: i + 2, reason: 'Şol töleg eýýäm bar', paymentId: dup.id });
          continue;
        }

        const createdRow = await AgencyFeePayment.create({
          anketaId: anketa.id,
          amount,
          paymentDate,
          note: note || null,
          createdByUserId: currentUser?.id || null,
        });
        created.push({
          row: i + 2,
          paymentId: createdRow.id,
          anketaNumber: anketa.anketaNumber,
          amount,
          paymentDate,
        });
      } catch (err) {
        errors.push({ row: i + 2, message: err.message || 'Ýalňyşlyk' });
      }
    }

    return { created, skipped, errors };
  }

  /**
   * Hasabat üçin: berlen anketalara bagly tölenen jemi + bu döwürde kassa
   */
  async financeSummaryForAnketaIds(anketaIds, { from, to } = {}) {
    const ids = [...new Set((anketaIds || []).filter(Boolean))];
    const paidMap = await this.paidTotalsByAnketaIds(ids);
    let feeReceived = 0;
    ids.forEach((id) => {
      feeReceived += paidMap.get(id) || 0;
    });

    let receivedInPeriod = 0;
    if (from && to) {
      const periodPayments = await AgencyFeePayment.findAll({
        where: {
          paymentDate: { [Op.between]: [from, to] },
        },
        attributes: ['amount'],
        raw: true,
      });
      receivedInPeriod = periodPayments.reduce((s, r) => s + Number(r.amount || 0), 0);
    }

    return {
      feeReceived: round2(feeReceived),
      feeCashInPeriod: round2(receivedInPeriod),
      feeRate: AGENCY_FEE_RATE,
    };
  }

  /**
   * Hasabat modal: Almaly / Alnan / Galdy — diňe saýlanan döwür
   * Almaly = bu döwürde ýerleşenleriň entek çekmeli puly (tölenen aýyrylansoň)
   */
  async buildFeeDetails(financePlacements = [], { from, to } = {}) {
    const placements = (financePlacements || []).filter((p) => p && p.anketaId);
    const placementIds = new Set(placements.map((p) => p.anketaId));

    let periodPayments = [];
    if (from && to) {
      periodPayments = await AgencyFeePayment.findAll({
        where: { paymentDate: { [Op.between]: [from, to] } },
        include: [{
          model: Anketa,
          as: 'anketa',
          attributes: [
            'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
            'desiredPosition', 'currentSalary', 'employmentDate', 'status',
          ],
          required: false,
        }],
        order: [['paymentDate', 'DESC'], ['id', 'DESC']],
      });
    }

    const byAnketa = new Map();

    const ensure = (id, seed = {}) => {
      if (!id) return null;
      if (!byAnketa.has(id)) {
        byAnketa.set(id, {
          anketaId: id,
          anketaNumber: seed.anketaNumber || '—',
          name: seed.name || '—',
          position: seed.position || '—',
          date: seed.date || null,
          salary: round2(seed.salary || 0),
          expectedFee: round2(seed.expectedFee || 0),
          paid: 0,
          paidInPeriod: 0,
          remaining: 0,
          inPeriodPlacement: false,
          payments: [],
        });
      }
      const row = byAnketa.get(id);
      if (seed.anketaNumber && row.anketaNumber === '—') row.anketaNumber = seed.anketaNumber;
      if (seed.name && row.name === '—') row.name = seed.name;
      if (seed.position && row.position === '—') row.position = seed.position;
      if (seed.date && !row.date) row.date = seed.date;
      if (seed.salary && !row.salary) row.salary = round2(seed.salary);
      if (seed.expectedFee && !row.expectedFee) row.expectedFee = round2(seed.expectedFee);
      if (seed.inPeriodPlacement) row.inPeriodPlacement = true;
      return row;
    };

    placements.forEach((p) => {
      ensure(p.anketaId, {
        anketaNumber: p.anketaNumber,
        name: p.name,
        position: p.position,
        date: p.date,
        salary: p.salary,
        expectedFee: p.agencyFee,
        inPeriodPlacement: true,
      });
    });

    periodPayments.forEach((row) => {
      const p = row.toJSON ? row.toJSON() : row;
      const a = p.anketa || {};
      const salary = parseMoney(a.currentSalary);
      const expectedFee = expectedFeeFromSalary(salary);
      const person = ensure(p.anketaId, {
        anketaNumber: a.anketaNumber,
        name: fullName(a),
        position: a.desiredPosition,
        date: a.employmentDate,
        salary,
        expectedFee,
      });
      if (!person) return;
      const amount = round2(p.amount);
      person.paidInPeriod = round2(person.paidInPeriod + amount);
      person.payments.push({
        paymentId: p.id,
        paymentDate: p.paymentDate,
        amount,
        note: p.note || '',
      });
    });

    const allIds = [...byAnketa.keys()];
    const paidMap = await this.paidTotalsByAnketaIds(allIds);

    const needReload = allIds.filter((id) => {
      const row = byAnketa.get(id);
      return !row.expectedFee || !row.salary || row.name === '—';
    });
    if (needReload.length) {
      const anketas = await Anketa.findAll({
        where: { id: { [Op.in]: needReload } },
        attributes: [
          'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
          'desiredPosition', 'currentSalary', 'employmentDate', 'status',
        ],
      });
      const acceptedMap = await this.acceptedDayByAnketaIds(needReload);
      const placementMap = await this.placementDetailsByAnketaIds(needReload);
      for (const anketa of anketas) {
        const row = byAnketa.get(anketa.id);
        if (!row) continue;
        const salary = await this.resolveSalary(anketa, placementMap.get(anketa.id));
        if (!row.salary) row.salary = round2(salary);
        const workStart = acceptedMap.get(anketa.id) || anketa.employmentDate;
        const placement = placementMap.get(anketa.id);
        if (!row.expectedFee) {
          const leftDate = placement?.leftDate || null;
          const stillWorking = placement?.workStatus === 'working'
            || (!leftDate && placement?.assignmentStatus !== ASSIGNMENT_STATUS.LEFT_JOB);
          row.expectedFee = computeAgencyDue(salary || row.salary, {
            stillWorking,
            workStartIso: workStart,
            leftDateIso: leftDate,
          }).expectedFee;
        }
        if (row.name === '—') row.name = fullName(anketa);
        if (row.anketaNumber === '—') row.anketaNumber = anketa.anketaNumber || '—';
        if (!row.date) row.date = workStart || anketa.employmentDate;
        if (row.position === '—') row.position = anketa.desiredPosition || '—';
      }
    }

    allIds.forEach((id) => {
      const row = byAnketa.get(id);
      row.paid = round2(paidMap.get(id) || 0);
      row.remaining = round2(Math.max(0, row.expectedFee - row.paid));
    });

    const people = [...byAnketa.values()];

    // Almaly sanawy — diňe bu döwürde ýerleşenler / töleg geçenler (galan > 0)
    const due = sortDuePeople(
      people.filter((x) => {
        if (!(x.remaining > 0.009 && x.expectedFee > 0.009)) return false;
        return x.inPeriodPlacement || x.paidInPeriod > 0.009;
      }),
    );

    // Alnan — bu döwürde töleg geçen adamlar (anketa №)
    const received = people
      .filter((x) => x.paidInPeriod > 0.009)
      .map((x) => ({
        ...x,
        amount: x.paidInPeriod,
      }))
      .sort((a, b) => compareAnketaNumber(a.anketaNumber, b.anketaNumber));

    // Galdy — şol tertip
    const remaining = due.slice();

    const receivedPayments = periodPayments.map((row) => {
      const p = row.toJSON ? row.toJSON() : row;
      const a = p.anketa || {};
      return {
        paymentId: p.id,
        anketaId: p.anketaId,
        anketaNumber: a.anketaNumber || '—',
        name: fullName(a),
        position: a.desiredPosition || '—',
        paymentDate: p.paymentDate,
        amount: round2(p.amount),
        note: p.note || '',
      };
    });

    // Bu döwürde ýerleşenlerden çekmeli (tölenen aýyrylan)
    const placementDueTotal = round2(
      people
        .filter((x) => x.inPeriodPlacement)
        .reduce((s, x) => s + (Number(x.remaining) || 0), 0),
    );

    return {
      due,
      received,
      remaining,
      receivedPayments,
      dueTotal: placementDueTotal,
      placementIds: [...placementIds],
    };
  }
}

module.exports = new FeePaymentService();
module.exports.AGENCY_FEE_RATE = AGENCY_FEE_RATE;
module.exports.FEE_DAYS_IN_MONTH = FEE_DAYS_IN_MONTH;
module.exports.parseMoney = parseMoney;
module.exports.expectedFeeFromSalary = expectedFeeFromSalary;
module.exports.computeProratedFee = computeProratedFee;
module.exports.computeAgencyDue = computeAgencyDue;
module.exports.normalizeIsoDay = normalizeIsoDay;
module.exports.addMonthsIso = addMonthsIso;
module.exports.daysInclusive = daysInclusive;
