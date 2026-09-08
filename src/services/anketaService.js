const { Op, where, cast, col, literal } = require('sequelize');
const sequelize = require('../config/database');
const { Anketa, VacancyAssignment, Vacancy, Contract } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  buildPagination,
  formatFullName,
  generateAnketaNumber,
  isUniqueConstraintError,
} = require('../utils/helpers');
const { placedByUsReasonWhere } = require('../utils/placedByUs');
const {
  reconcileDesiredPositions,
} = require('../utils/desiredPositions');
const { parseBarYokFilter, buildHasCarWhere } = require('../utils/barYokFilter');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

/** Bir ýa-da birnäçe nomer — hersi 9 san */
function normalizePhoneField(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let parts = raw.split(/[,;/|]+|\s+we\s+/i).map((p) => normalizePhone(p)).filter(Boolean);
  if (parts.length <= 1) {
    const all = normalizePhone(raw);
    if (all.length > 9 && all.length % 9 === 0) {
      parts = [];
      for (let i = 0; i < all.length; i += 9) parts.push(all.slice(i, i + 9));
    } else if (all) {
      parts = [all];
    }
  }
  if (!parts.length) return '';
  const bad = parts.find((p) => p.length !== 9);
  if (bad) {
    throw new ApiError(400, `Telefon nomeri 9 san bolmaly (mysal: 8651234567). Nädogry: ${bad} (${bad.length} san)`);
  }
  return parts.slice(0, 2).join(', ');
}

function applyDesiredPositions(payload) {
  const fixed = reconcileDesiredPositions(payload.desiredPosition, payload.extraData);
  if (!fixed) return payload;
  payload.desiredPosition = fixed.desiredPosition;
  payload.extraData = fixed.extraData;
  return payload;
}

const escapeLike = (s) => String(s).replace(/[%_\\]/g, '\\$&');

/** Umumy gözleg — anketanyň ähli maglumatlary (JSON hem) */
const ANKETA_TEXT_FIELDS = [
  'familyName', 'firstName', 'patronymic', 'phone', 'email',
  'desiredPosition', 'anketaNumber', 'registrationCity', 'registrationAddress',
  'currentAddress', 'birthPlace', 'nationality', 'maritalStatus',
  'educationLevel', 'drivingLicense', 'hasCar', 'militaryService',
  'willingToRelocate', 'partTimeWork', 'workSchedule', 'currentSalary',
  'closedReason', 'passportNumber', 'passportIssued', 'notes',
];

/** ENUM / san / sene — ILIKE üçin TEXT cast */
const ANKETA_CAST_COLUMNS = [
  'status',
  'gender',
  'birth_year',
  'form_date',
  'employment_date',
];

/** Sanaw — agyr JSON sütunlary ýükleme */
const ANKETA_LIST_ATTRS = [
  'id', 'anketaNumber', 'formDate', 'familyName', 'firstName', 'patronymic',
  'desiredPosition', 'phone', 'email', 'gender', 'birthYear', 'status',
  'registrationCity', 'currentAddress', 'educationLevel', 'hasCar',
  'drivingLicense', 'currentSalary', 'employmentDate', 'closedReason',
  'photoUrl', 'createdAt', 'updatedAt', 'statusChangedAt', 'extraData',
  'maritalStatus', 'nationality', 'workSchedule', 'partTimeWork',
  'willingToRelocate', 'militaryService', 'notes',
];

function buildAnketaSearchFilter(search) {
  const raw = String(search || '').trim();
  if (!raw) return {};

  const tokens = raw.split(/\s+/).filter(Boolean).slice(0, 6);

  const orForToken = (token) => {
    const like = `%${escapeLike(token)}%`;
    const ors = ANKETA_TEXT_FIELDS.map((field) => ({
      [field]: { [Op.iLike]: like },
    }));
    // JSON sütunlaryny hemişe skanirleme — CPU ýüklenmesini azaltýar
    ANKETA_CAST_COLUMNS.forEach((dbCol) => {
      ors.push(where(cast(col(dbCol), 'TEXT'), { [Op.iLike]: like }));
    });
    return ors;
  };

  if (tokens.length === 1) {
    return { [Op.or]: orForToken(tokens[0]) };
  }
  return {
    [Op.and]: tokens.map((t) => ({ [Op.or]: orForToken(t) })),
  };
}

class AnketaService {
  async getAll(query = {}) {
    const { page, limit, offset } = buildPagination(query);
    const whereClause = {
      ...buildAnketaSearchFilter(query.search),
    };

    if (query.status) whereClause.status = query.status;
    if (query.gender) {
      const g = String(query.gender).trim();
      const fold = g.toLowerCase()
        .replace(/ý/g, 'y').replace(/ä/g, 'a');
      let values;
      if (fold.startsWith('erkek')) values = ['Erkek'];
      else if (fold.startsWith('gyz')) values = ['Gyz', 'Ayal'];
      else if (fold.startsWith('ayal') || fold.startsWith('aýal')) values = ['Ayal', 'Gyz'];
      else values = [g];
      const andParts = Array.isArray(whereClause[Op.and])
        ? whereClause[Op.and]
        : whereClause[Op.and]
          ? [whereClause[Op.and]]
          : [];
      andParts.push(where(cast(col('gender'), 'TEXT'), { [Op.in]: values }));
      whereClause[Op.and] = andParts;
    }
    if (query.desiredPosition) {
      const pos = String(query.desiredPosition).trim().replace(/[%_\\]/g, '\\$&');
      const andParts = Array.isArray(whereClause[Op.and])
        ? whereClause[Op.and]
        : whereClause[Op.and]
          ? [whereClause[Op.and]]
          : [];
      andParts.push({
        [Op.or]: [
          { desiredPosition: { [Op.iLike]: `%${pos}%` } },
          // extra_data diňe desiredPositions üçin — doly JSON text däl
          literal(`"Anketa"."extra_data"->>'desiredPositions' ILIKE '%${pos}%'`),
        ],
      });
      whereClause[Op.and] = andParts;
    }
    if (query.phone) {
      whereClause.phone = { [Op.iLike]: `%${String(query.phone).trim()}%` };
    }
    if (query.anketaNumber) {
      whereClause.anketaNumber = { [Op.iLike]: `%${String(query.anketaNumber).trim()}%` };
    }
    if (query.familyName) {
      whereClause.familyName = { [Op.iLike]: `%${String(query.familyName).trim()}%` };
    }
    if (query.firstName) {
      whereClause.firstName = { [Op.iLike]: `%${String(query.firstName).trim()}%` };
    }
    if (query.faa) {
      const parts = String(query.faa).trim().split(/\s+/).filter(Boolean);
      if (parts.length) {
        whereClause[Op.and] = [
          ...(whereClause[Op.and] || []),
          ...parts.map((p) => ({
            [Op.or]: [
              { familyName: { [Op.iLike]: `%${p}%` } },
              { firstName: { [Op.iLike]: `%${p}%` } },
              { patronymic: { [Op.iLike]: `%${p}%` } },
            ],
          })),
        ];
      }
    }
    if (query.dateFrom) {
      whereClause.formDate = { ...(whereClause.formDate || {}), [Op.gte]: query.dateFrom };
    }
    if (query.dateTo) {
      whereClause.formDate = { ...(whereClause.formDate || {}), [Op.lte]: query.dateTo };
    }
    if (query.hasCar) {
      const mode = parseBarYokFilter(query.hasCar);
      if (mode) {
        const andParts = Array.isArray(whereClause[Op.and])
          ? whereClause[Op.and]
          : whereClause[Op.and]
            ? [whereClause[Op.and]]
            : [];
        const carWhere = buildHasCarWhere(sequelize, mode, 'has_car');
        if (carWhere) andParts.push(carWhere);
        if (andParts.length) whereClause[Op.and] = andParts;
      }
    }

    const { rows, count } = await Anketa.findAndCountAll({
      where: whereClause,
      attributes: ANKETA_LIST_ATTRS,
      limit,
      offset,
      // Täzeler ýokarda, köneler aşakda
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });

    return {
      items: rows.map((row) => {
        const j = row.toJSON ? row.toJSON() : row;
        return applyDesiredPositions({ ...j, extraData: j.extraData || {} });
      }),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getById(id) {
    const anketa = await Anketa.findByPk(id);
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    return anketa;
  }

  /** Şol adam (telefon / passport) — beýleki anketa nusgalary */
  async listRelated(anketa) {
    if (!anketa) return [];
    const id = Number(anketa.id);
    const phone = normalizePhone(anketa.phone);
    const passport = String(anketa.passportNumber || '').trim();
    const or = [];
    if (phone.length >= 9) {
      or.push(
        sequelize.where(
          sequelize.fn('regexp_replace', sequelize.col('phone'), '[^0-9]', '', 'g'),
          phone,
        ),
      );
    }
    if (passport) {
      or.push({ passportNumber: { [Op.iLike]: passport } });
    }
    if (!or.length || !id) return [];

    const rows = await Anketa.findAll({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: or,
      },
      attributes: ['id', 'anketaNumber', 'status', 'formDate', 'desiredPosition', 'statusChangedAt'],
      order: [['id', 'DESC']],
      limit: 20,
    });
    return rows.map((r) => (r.toJSON ? r.toJSON() : r));
  }

  async toPublic(anketa) {
    const json = anketa.toJSON ? anketa.toJSON() : { ...anketa };
    const relatedAnketas = await this.listRelated(anketa);
    return {
      ...applyDesiredPositions({ ...json, extraData: json.extraData || {} }),
      relatedAnketas,
    };
  }

  /**
   * Bir adam — bir anketa.
   * Telefon, passport ýa-da FAA+doglan ýyly gabat gelse gaýtalanma hasaplanýar.
   */
  async findDuplicate(data, excludeId = null) {
    const phone = normalizePhone(data.phone);
    const passport = String(data.passportNumber || '').trim();
    const familyName = String(data.familyName || '').trim();
    const firstName = String(data.firstName || '').trim();
    const patronymic = String(data.patronymic || '').trim();
    const birthYear = data.birthYear ? parseInt(data.birthYear, 10) : null;

    const notSelf = excludeId ? { id: { [Op.ne]: excludeId } } : {};

    if (phone.length >= 9) {
      const byPhone = await Anketa.findOne({
        where: {
          ...notSelf,
          [Op.and]: [
            sequelize.where(
              sequelize.fn('regexp_replace', sequelize.col('phone'), '[^0-9]', '', 'g'),
              phone,
            ),
          ],
        },
        order: [['id', 'DESC']],
      });
      if (byPhone) {
        return { anketa: byPhone, reason: 'telefon' };
      }
    }

    if (passport) {
      const byPassport = await Anketa.findOne({
        where: {
          ...notSelf,
          passportNumber: { [Op.iLike]: passport },
        },
        order: [['id', 'DESC']],
      });
      if (byPassport) {
        return { anketa: byPassport, reason: 'passport' };
      }
    }

    if (familyName && firstName && birthYear) {
      const nameWhere = {
        ...notSelf,
        familyName: { [Op.iLike]: familyName },
        firstName: { [Op.iLike]: firstName },
        birthYear,
      };
      if (patronymic) {
        nameWhere.patronymic = { [Op.iLike]: patronymic };
      }
      const byName = await Anketa.findOne({
        where: nameWhere,
        order: [['id', 'DESC']],
      });
      if (byName) {
        // At+ýyl gabat gelse, telefon boş bolsa ýa-da telefon hem gabat gelse
        const existingPhone = normalizePhone(byName.phone);
        if (!phone || !existingPhone || existingPhone === phone || existingPhone.endsWith(phone.slice(-8))) {
          return { anketa: byName, reason: 'ady we doglan ýyly' };
        }
      }
    }

    return null;
  }

  async assertUnique(data, excludeId = null) {
    const dup = await this.findDuplicate(data, excludeId);
    if (!dup) return;

    const a = dup.anketa;
    const name = formatFullName(a.familyName, a.firstName, a.patronymic);
    const err = new ApiError(
      409,
      `Bu adam eýýäm bazada bar (№ ${a.anketaNumber}${name ? ` — ${name}` : ''}). Gaýtalanma: ${dup.reason}.`,
    );
    err.data = {
      existingId: a.id,
      anketaNumber: a.anketaNumber,
      reason: dup.reason,
    };
    throw err;
  }

  async create(data) {
    const payload = applyDesiredPositions({ ...data });
    if (payload.phone !== undefined) payload.phone = normalizePhoneField(payload.phone);
    const formDate = payload.formDate || (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })();
    const requestedNumber = payload.anketaNumber || null;
    let anketaNumber = requestedNumber || await generateAnketaNumber(Anketa, formDate);
    let lastErr = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        return await Anketa.create({
          ...payload,
          anketaNumber,
          formDate,
        });
      } catch (err) {
        lastErr = err;
        if (requestedNumber || !isUniqueConstraintError(err)) throw err;
        const m = String(anketaNumber).match(/^(.*\/)(\d+)(#del\d+)?$/);
        anketaNumber = m ? `${m[1]}${Number(m[2]) + 1}` : await generateAnketaNumber(Anketa, formDate);
      }
    }
    throw lastErr || new ApiError(409, 'Anketa belgesi eýýäm bar — täzeden synanyň');
  }

  async update(id, data) {
    const anketa = await this.getById(id);
    const incoming = applyDesiredPositions({ ...data });
    if (incoming.phone !== undefined) incoming.phone = normalizePhoneField(incoming.phone);

    const payload = { ...incoming };
    if (payload.status !== undefined && payload.status !== anketa.status) {
      payload.statusChangedAt = new Date();
      if (payload.status === 'Isleyar') {
        // Her ýapylanda täze sene — şol nusgany birnäçe gezek ýapyp bolýar
        payload.employmentDate = incoming.employmentDate
          || new Date().toISOString().slice(0, 10);
      } else if (payload.status === 'Islanok') {
        payload.employmentDate = null;
        if (incoming.closedReason === undefined) payload.closedReason = null;
      }
    }

    await anketa.update(payload);
    return anketa;
  }

  async remove(id) {
    const anketa = await this.getById(id);
    await VacancyAssignment.destroy({ where: { anketaId: anketa.id } });
    await Contract.destroy({ where: { anketaId: anketa.id } });
    await Vacancy.update(
      { assignedAnketaId: null, assignedCandidateName: null, assignmentStatus: null },
      { where: { assignedAnketaId: anketa.id } },
    );
    await Vacancy.update(
      { contactAnketaId: null },
      { where: { contactAnketaId: anketa.id } },
    );
    await anketa.destroy();
    return { message: 'Anketa pozuldy' };
  }

  async getStats() {
    const total = await Anketa.count();
    const isleyar = await Anketa.count({ where: { status: 'Isleyar' } });
    const islanok = await Anketa.count({ where: { status: 'Islanok' } });

    // Biziň ýerleşdirenlerimiz: «Kabul edildi» ýa-da Excel ýaşyl / sebäp
    const acceptedRows = await VacancyAssignment.findAll({
      attributes: ['anketaId'],
      where: { status: 'Kabul edildi' },
      raw: true,
    });
    const placedByUsSet = new Set();
    acceptedRows.forEach((r) => {
      const id = Number(r.anketaId);
      if (id > 0) placedByUsSet.add(id);
    });

    const byReason = await Anketa.findAll({
      attributes: ['id'],
      where: {
        status: 'Isleyar',
        ...placedByUsReasonWhere(),
      },
      raw: true,
    });
    byReason.forEach((r) => {
      const id = Number(r.id);
      if (id > 0) placedByUsSet.add(id);
    });
    const placedByUs = placedByUsSet.size;

    // Özi işe ýerleşenler = Işleýär, ýöne biziň ýerleşdiren däl
    const selfPlaced = placedByUsSet.size
      ? await Anketa.count({
        where: {
          status: 'Isleyar',
          id: { [Op.notIn]: [...placedByUsSet] },
        },
      })
      : isleyar;

    return {
      total,
      isleyar,
      islanok,
      placedByUs,
      selfPlaced,
    };
  }

  /** Ýapylma sebäpleri — default + bazadaky goşmaça ýazgylar */
  async getClosedReasons() {
    const defaults = [
      'Biziň ýerleşdirenlerimiz',
      'Işe ýerleşenler',
      'Özi işe ýerleşenler',
      'Özüni aýyrdy',
      'Habarlaşyp bolmady',
      'Başga',
    ];
    const rows = await Anketa.findAll({
      attributes: ['closedReason'],
      where: {
        closedReason: { [Op.ne]: null },
      },
      raw: true,
      limit: 2000,
    });

    const extra = new Set();
    rows.forEach((row) => {
      const raw = String(row.closedReason || '').trim();
      if (!raw) return;
      raw
        .split(/\s*[—\-–]\s*|\s*\|\s*/)
        .map((p) => p.trim())
        .filter((p) => p && p.length >= 2 && p.length <= 120)
        .forEach((p) => {
          if (!defaults.some((d) => d.toLowerCase() === p.toLowerCase())) {
            extra.add(p);
          }
        });
      // Doly ýazgy da saýlawda peýdaly bolup bilýär
      if (raw.includes('—') || raw.includes(' - ') || raw.includes('|')) {
        if (raw.length <= 120 && !defaults.some((d) => d.toLowerCase() === raw.toLowerCase())) {
          extra.add(raw);
        }
      }
    });

    return {
      defaults,
      custom: [...extra].sort((a, b) => a.localeCompare(b, 'tk')),
      items: [...defaults, ...[...extra].sort((a, b) => a.localeCompare(b, 'tk'))],
    };
  }

  formatName(anketa) {
    return formatFullName(anketa.familyName, anketa.firstName, anketa.patronymic);
  }
}

module.exports = new AnketaService();
