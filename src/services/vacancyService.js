const { Vacancy, Anketa, User, VacancyAssignment } = require('../models');
const commentService = require('./commentService');
const ApiError = require('../utils/ApiError');
const { isPlacedByUsReason, PLACED_BY_US_REASON } = require('../utils/placedByUs');
const {
  INACTIVE_ASSIGNMENT_STATUSES,
  isAcceptedAssignmentStatus: isAssignmentAccepted,
  isActiveAssignmentStatus,
  ASSIGNMENT_STATUS,
  normalizeAssignmentStatus,
} = require('../utils/assignmentStatus');
const { buildPagination, getNextVacancyNumber, isUniqueConstraintError } = require('../utils/helpers');
const { buildDilHatyPrintData } = require('../utils/dilHatyData');
const { resolvePeriodRange } = require('../utils/periodRange');
const { parseBarYokFilter, buildVacancyHasCarWhere } = require('../utils/barYokFilter');
const { Op, where, cast, col } = require('sequelize');
const sequelize = require('../config/database');

const escapeLike = (s) => String(s).replace(/[%_\\]/g, '\\$&');

/** Işgär (operator) — admin ID-si ýerine forum operator ýa-da giriş eden operator */
async function resolveAssignmentWorkerId(currentUser, vacancy, existingAssignedByUserId = null) {
  if (currentUser?.role === 'operator' && currentUser.id) return currentUser.id;

  if (existingAssignedByUserId) {
    const u = await User.findByPk(existingAssignedByUserId, { attributes: ['id', 'role', 'isActive'] });
    if (u?.isActive && u.role === 'operator') return u.id;
  }

  const vacOpId = vacancy?.acceptedByUserId;
  if (vacOpId) {
    const op = await User.findByPk(vacOpId, { attributes: ['id', 'role', 'isActive'] });
    if (op?.isActive && op.role === 'operator') return vacOpId;
  }

  return null;
}

async function assertOperatorWorkerId(userId) {
  if (!userId) return null;
  const worker = await User.findByPk(userId, { attributes: ['id', 'role', 'isActive'] });
  if (!worker || !worker.isActive || worker.role !== 'operator') {
    throw new ApiError(400, 'Işgär diňe operator bolmaly');
  }
  return worker.id;
}

/** Umumy gözleg — wakansiýanyň ähli maglumatlary */
const VACANCY_TEXT_FIELDS = [
  'companyName', 'position', 'location', 'salary', 'jobDescription',
  'experience', 'education', 'languages', 'computerPrograms',
  'ageRange', 'registration', 'gender', 'workHours', 'dayOff',
  'services', 'accommodation', 'companyDirection', 'workersNeeded',
  'contactPhone', 'contactName', 'contactEmail',
  'forumOperator', 'assignedCandidateName', 'assignmentStatus', 'closeReason',
];

const VACANCY_CAST_COLUMNS = [
  'status',
  'vacancy_number',
  'vacancy_date',
];

const VACANCY_JSON_COLUMNS = ['extra_data'];

function buildVacancySearchFilter(search) {
  const raw = String(search || '').trim();
  if (!raw) return {};

  const tokens = raw.split(/\s+/).filter(Boolean).slice(0, 8);

  const orForToken = (token) => {
    const like = `%${escapeLike(token)}%`;
    const ors = VACANCY_TEXT_FIELDS.map((field) => ({
      [field]: { [Op.iLike]: like },
    }));
    [...VACANCY_JSON_COLUMNS, ...VACANCY_CAST_COLUMNS].forEach((dbCol) => {
      ors.push(where(cast(col(dbCol), 'TEXT'), { [Op.iLike]: like }));
    });
    return ors;
  };

  if (tokens.length === 1) {
    return { [Op.or]: orForToken(tokens[0]) };
  }

  return {
    [Op.and]: tokens.map((token) => ({ [Op.or]: orForToken(token) })),
  };
}

const acceptedByInclude = {
  model: User,
  as: 'acceptedBy',
  attributes: ['id', 'username', 'fullName', 'role'],
};

const anketaLite = {
  model: Anketa,
  as: 'anketa',
  attributes: [
    'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic', 'phone',
    'desiredPosition', 'extraData', 'status', 'closedReason',
  ],
};

const assignmentCountLiteral = [
  sequelize.literal(`(
    SELECT COUNT(*)::int FROM vacancy_assignments AS va
    WHERE va.vacancy_id = "Vacancy"."id"
      AND va.deleted_at IS NULL
      AND va.status IS DISTINCT FROM 'Kabul edildi'
  )`),
  'assignmentCount',
];

const contactAnketaInclude = {
  model: Anketa,
  as: 'contactAnketa',
  attributes: ['id', 'anketaNumber', 'familyName', 'firstName', 'patronymic', 'phone', 'desiredPosition', 'status'],
  required: false,
};

const anketaFullName = (a) => [a?.familyName, a?.firstName, a?.patronymic].filter(Boolean).join(' ').trim();

class VacancyService {
  parseContactBlob(raw) {
    if (raw == null || raw === '') return { contactPhone: null, contactName: null };
    const str = String(raw).trim();
    const phoneMatch = str.match(/(?:\+?\d[\d\s\-()]{6,}\d)/);
    const digits = str.replace(/\D/g, '');
    const contactPhone = phoneMatch
      ? phoneMatch[0].replace(/\s+/g, ' ').trim()
      : (digits.length >= 8 ? digits : null);
    let contactName = str;
    if (phoneMatch) contactName = contactName.replace(phoneMatch[0], ' ');
    contactName = contactName
      .replace(/[,;|/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (contactName.length < 3) contactName = null;
    return { contactPhone, contactName };
  }

  async resolveContactAnketaId(data = {}) {
    if (data.contactAnketaId) {
      const byId = await Anketa.findByPk(Number(data.contactAnketaId));
      return byId ? byId.id : null;
    }

    let contactPhone = data.contactPhone;
    let contactName = data.contactName;

    // Excel / birleşen ýazgy: telefon + ady bile
    if (contactPhone && (!contactName || String(contactPhone).length > 20)) {
      const parsed = this.parseContactBlob(contactPhone);
      if (parsed.contactPhone) contactPhone = parsed.contactPhone;
      if (!contactName && parsed.contactName) contactName = parsed.contactName;
    }

    const phoneDigits = String(contactPhone || '').replace(/\D/g, '');
    if (phoneDigits.length >= 8) {
      const tail = phoneDigits.slice(-8);
      const byPhone = await Anketa.findOne({
        where: sequelize.where(
          sequelize.fn('regexp_replace', sequelize.col('phone'), '[^0-9]', '', 'g'),
          { [Op.like]: `%${tail}` },
        ),
        order: [['id', 'DESC']],
      });
      if (byPhone) return byPhone.id;
    }

    const name = String(contactName || '').trim();
    if (!name) return null;
    const parts = name.split(/\s+/).filter((p) => p.length > 1);
    if (!parts.length) return null;

    const byName = await Anketa.findOne({
      where: {
        [Op.and]: parts.map((p) => ({
          [Op.or]: [
            { familyName: { [Op.iLike]: `%${p}%` } },
            { firstName: { [Op.iLike]: `%${p}%` } },
            { patronymic: { [Op.iLike]: `%${p}%` } },
          ],
        })),
      },
      order: [['id', 'DESC']],
    });
    return byName ? byName.id : null;
  }

  async enrichContactFromDb(data = {}) {
    // Jogapkär = firmanyň wekili (wakansiýany tabşyran adam), anketasy däl
    let contactName = data.contactName != null ? String(data.contactName).trim() : null;
    let contactPhone = data.contactPhone != null ? String(data.contactPhone).trim() : null;
    let contactEmail = data.contactEmail != null ? String(data.contactEmail).trim() : null;

    // Birnäçe jogapkär (setir / vergül) — blob parse etmez
    const multiName = contactName && /\n/.test(contactName);
    const multiPhone = contactPhone && /[,;\n|/]/.test(contactPhone);
    if (contactPhone && !multiPhone && (!contactName || String(contactPhone).length > 24)) {
      const parsed = this.parseContactBlob(contactPhone);
      if (parsed.contactPhone) contactPhone = parsed.contactPhone;
      if (!contactName && parsed.contactName) contactName = parsed.contactName;
    }

    // Ady iki gezek bolup durmasyn (diňe ýeke setir)
    if (contactName && !multiName) {
      const parts = contactName.replace(/\s+/g, ' ').trim().split(' ');
      if (parts.length >= 2 && parts.length % 2 === 0) {
        const half = parts.length / 2;
        const a = parts.slice(0, half).join(' ');
        const b = parts.slice(half).join(' ');
        if (a.toLowerCase() === b.toLowerCase()) contactName = a;
      }
    }

    if (contactEmail) {
      const emails = String(contactEmail)
        .split(/[,;\n|/]+/)
        .map((s) => s.trim())
        .filter((e) => e.includes('@'));
      contactEmail = emails.length ? emails.join(', ') : null;
    }

    if (contactName === '') contactName = null;
    if (contactPhone === '') contactPhone = null;

    return {
      contactAnketaId: null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
    };
  }

  mergeVacancyExtraData(existing, incoming) {
    const base = (existing && typeof existing === 'object' && !Array.isArray(existing))
      ? { ...existing }
      : {};
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return base;
    const out = { ...base, ...incoming };
    if (Object.prototype.hasOwnProperty.call(incoming, 'contacts')) {
      out.contacts = Array.isArray(incoming.contacts) ? incoming.contacts : [];
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'maritalStatus')) {
      const m = incoming.maritalStatus == null ? null : String(incoming.maritalStatus).trim();
      out.maritalStatus = m || null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'hasCar')) {
      const c = incoming.hasCar == null ? null : String(incoming.hasCar).trim();
      out.hasCar = c || null;
    }
    return out;
  }

  async resolveForumOperator(data, currentUser, opts = {}) {
    // Operator hemişe özüne baglanýar — başga adyna geçmez
    if (currentUser && currentUser.role === 'operator') {
      return {
        acceptedByUserId: currentUser.id,
        forumOperator: currentUser.fullName || currentUser.username,
      };
    }

    let acceptedByUserId = data.acceptedByUserId ? Number(data.acceptedByUserId) : null;
    let forumOperator = data.forumOperator ? String(data.forumOperator).trim() : null;
    if (forumOperator) {
      forumOperator = forumOperator.replace(/\s+/g, ' ').trim();
    }

    const fold = (s) => String(s || '')
      .toLowerCase()
      .replace(/ý/g, 'y')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ň/g, 'n')
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ž/g, 'z')
      .replace(/ё/g, 'е')
      .replace(/[^a-z0-9а-яөүәңҗһ\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (acceptedByUserId) {
      const staff = await User.findByPk(acceptedByUserId);
      if (!staff || !staff.isActive || !['admin', 'operator'].includes(staff.role)) {
        throw new ApiError(400, 'Forum operator tapylmady (admin ýa-da operator bolmaly)');
      }
      // Diňe operatorlar — admin ID-sini forum operator hökmünde saklama
      if (staff.role !== 'operator') {
        throw new ApiError(400, 'Forum operator diňe operator bolmaly (admin däl)');
      }
      forumOperator = staff.fullName || staff.username;
    } else if (forumOperator) {
      const staffList = await User.findAll({
        where: {
          isActive: true,
          role: 'operator',
        },
        attributes: ['id', 'fullName', 'username', 'role', 'isActive'],
      });
      const want = fold(forumOperator);
      // Diňe takyk gabat gelme — startsWith fuzzy garyşyklyk döredýär
      const staff = staffList.find((u) => fold(u.fullName) === want || fold(u.username) === want);
      if (staff) {
        acceptedByUserId = staff.id;
        forumOperator = staff.fullName || staff.username;
      } else if (opts.requireMatch) {
        throw new ApiError(400, `Forum operator tapylmady: ${forumOperator}`);
      }
    } else if (currentUser && currentUser.role === 'admin' && opts.fallbackToCurrentUser) {
      acceptedByUserId = currentUser.id;
      forumOperator = currentUser.fullName || currentUser.username;
    }

    return { acceptedByUserId, forumOperator };
  }

  async getAll(query = {}, currentUser = null) {
    const { page, limit, offset } = buildPagination(query);
    const where = {
      ...buildVacancySearchFilter(query.search),
    };
    const andParts = Array.isArray(where[Op.and])
      ? [...where[Op.and]]
      : where[Op.and]
        ? [where[Op.and]]
        : [];
    delete where[Op.and];

    // Operator — diňe öz wakansiýalary (klient filtri üýtgedip bilmeýär)
    if (currentUser?.role === 'operator' && currentUser.id) {
      where.acceptedByUserId = currentUser.id;
    } else if (query.acceptedByUserId) {
      const uid = parseInt(query.acceptedByUserId, 10);
      if (!Number.isNaN(uid)) {
        where.acceptedByUserId = uid;
      }
    }

    if (query.status) where.status = query.status;
    if (query.closeReason) where.closeReason = query.closeReason;
    if (query.companyName) {
      where.companyName = { [Op.iLike]: `%${String(query.companyName).trim()}%` };
    }
    if (query.position) {
      where.position = { [Op.iLike]: `%${String(query.position).trim()}%` };
    }
    if (query.salary) {
      where.salary = { [Op.iLike]: `%${String(query.salary).trim()}%` };
    }
    if (query.maritalStatus) {
      const raw = String(query.maritalStatus).trim();
      const like = sequelize.escape(`%${escapeLike(raw)}%`);
      andParts.push(sequelize.literal(
        `(COALESCE("Vacancy"."extra_data"->>'maritalStatus', "Vacancy"."extra_data"->>'marital_status', '') ILIKE ${like})`,
      ));
    }
    if (query.hasCar) {
      const mode = parseBarYokFilter(query.hasCar);
      const vacCar = buildVacancyHasCarWhere(sequelize);
      if (mode === 'yok') andParts.push(vacCar.yok);
      else if (mode === 'bar') andParts.push(vacCar.bar);
    }
    if (query.contactName) {
      where.contactName = { [Op.iLike]: `%${String(query.contactName).trim()}%` };
    }
    if (query.contactPhone) {
      where.contactPhone = { [Op.iLike]: `%${String(query.contactPhone).trim()}%` };
    }
    if (query.forumOperator && currentUser?.role !== 'operator') {
      const name = String(query.forumOperator).trim();
      const staffMatches = await User.findAll({
        where: {
          role: 'operator',
          isActive: true,
          [Op.or]: [
            { fullName: { [Op.iLike]: name } },
            { username: { [Op.iLike]: name } },
          ],
        },
        attributes: ['id', 'fullName', 'username'],
      });
      const ids = staffMatches.map((u) => u.id);
      const orParts = [{ forumOperator: { [Op.iLike]: name } }];
      if (ids.length) orParts.push({ acceptedByUserId: { [Op.in]: ids } });
      andParts.push({ [Op.or]: orParts });
    }
    if (query.vacancyNumber) {
      const num = parseInt(query.vacancyNumber, 10);
      if (!Number.isNaN(num)) where.vacancyNumber = num;
    }
    if (query.companyDirection) {
      where.companyDirection = { [Op.iLike]: `%${query.companyDirection}%` };
    }

    if (query.assigned === '1' || query.assignedOnly === '1' || query.assignedOnly === 'true' || query.hasAssignments === '1') {
      andParts.push(sequelize.literal(`EXISTS (
          SELECT 1 FROM vacancy_assignments va
          WHERE va.vacancy_id = "Vacancy"."id" AND va.deleted_at IS NULL
        )`));
    }
    if (query.hasAssignments === '0') {
      andParts.push(sequelize.literal(`NOT EXISTS (
          SELECT 1 FROM vacancy_assignments va
          WHERE va.vacancy_id = "Vacancy"."id" AND va.deleted_at IS NULL
        )`));
    }
    if (andParts.length) where[Op.and] = andParts;

    if (query.search && /^\d+$/.test(String(query.search).trim())) {
      const n = parseInt(query.search, 10);
      const searchOr = where[Op.or];
      if (searchOr) {
        where[Op.or] = [...searchOr, { vacancyNumber: n }];
      } else if (where[Op.and]) {
        // multi-token: goşmaça gerek däl
      } else {
        where[Op.or] = [{ vacancyNumber: n }];
      }
    }

    const { rows, count } = await Vacancy.findAndCountAll({
      where,
      limit,
      offset,
      attributes: { include: [assignmentCountLiteral] },
      include: [
        {
          model: Anketa,
          as: 'assignedAnketa',
          attributes: ['id', 'anketaNumber', 'familyName', 'firstName', 'patronymic', 'phone', 'desiredPosition'],
        },
        contactAnketaInclude,
        acceptedByInclude,
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      distinct: true,
    });

    return {
      items: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getPublic(query = {}) {
    return this.getAll({ ...query, status: 'Acyk' });
  }

  async getById(id, currentUser = null) {
    const vacancy = await Vacancy.findByPk(id, {
      attributes: { include: [assignmentCountLiteral] },
      include: [
        { model: Anketa, as: 'assignedAnketa' },
        contactAnketaInclude,
        acceptedByInclude,
      ],
    });
    if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');
    if (
      currentUser?.role === 'operator'
      && currentUser.id
      && Number(vacancy.acceptedByUserId) !== Number(currentUser.id)
    ) {
      throw new ApiError(403, 'Bu wakansiýa size degişli däl');
    }
    return vacancy;
  }

  async create(data, currentUser = null) {
    const operator = await this.resolveForumOperator(data, currentUser);
    if (!operator.acceptedByUserId) {
      throw new ApiError(400, 'Forum operator saýlaň — wakansiýa operatora baglanmaly');
    }
    const contact = await this.enrichContactFromDb(data);
    const { maritalStatus, hasCar, contacts, extraData: incomingExtra, ...rest } = data;
    const extraData = this.mergeVacancyExtraData(
      {},
      {
        ...(incomingExtra && typeof incomingExtra === 'object' ? incomingExtra : {}),
        ...(maritalStatus !== undefined ? { maritalStatus } : {}),
        ...(hasCar !== undefined ? { hasCar } : {}),
        ...(contacts !== undefined ? { contacts } : {}),
      },
    );
    const requestedNumber = data.vacancyNumber || null;
    let vacancyNumber = requestedNumber || await getNextVacancyNumber(Vacancy);
    const vacancyDate = data.vacancyDate || new Date().toISOString().split('T')[0];
    let lastErr = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        return await Vacancy.create({
          ...rest,
          ...operator,
          ...contact,
          extraData,
          vacancyNumber,
          vacancyDate,
        });
      } catch (err) {
        lastErr = err;
        if (requestedNumber || !isUniqueConstraintError(err)) throw err;
        vacancyNumber = Number(vacancyNumber) + 1;
      }
    }
    throw lastErr || new ApiError(409, 'Wakansiýa belgesi eýýäm bar — täzeden synanyň');
  }

  async update(id, data, currentUser = null) {
    const vacancy = await this.getById(id, currentUser);
    const payload = { ...data };
    delete payload.maritalStatus;
    delete payload.hasCar;
    delete payload.contacts;

    // Operator başga operatoryň adyna üýtgedip bilmeýär
    if (currentUser && currentUser.role === 'operator') {
      delete payload.acceptedByUserId;
      delete payload.forumOperator;
    } else if (data.acceptedByUserId !== undefined || data.forumOperator !== undefined) {
      const operator = await this.resolveForumOperator(data, currentUser);
      if (!operator.acceptedByUserId) {
        throw new ApiError(400, 'Forum operator saýlaň');
      }
      payload.acceptedByUserId = operator.acceptedByUserId;
      payload.forumOperator = operator.forumOperator;
    }

    if (
      data.contactName !== undefined
      || data.contactPhone !== undefined
      || data.contactEmail !== undefined
      || data.contactAnketaId !== undefined
    ) {
      const contact = await this.enrichContactFromDb({
        contactName: data.contactName !== undefined ? data.contactName : vacancy.contactName,
        contactPhone: data.contactPhone !== undefined ? data.contactPhone : vacancy.contactPhone,
        contactEmail: data.contactEmail !== undefined ? data.contactEmail : vacancy.contactEmail,
        contactAnketaId: data.contactAnketaId !== undefined ? data.contactAnketaId : vacancy.contactAnketaId,
      });
      payload.contactAnketaId = contact.contactAnketaId;
      payload.contactName = contact.contactName;
      payload.contactPhone = contact.contactPhone;
      payload.contactEmail = contact.contactEmail;
    }

    if (
      data.extraData !== undefined
      || data.maritalStatus !== undefined
      || data.hasCar !== undefined
      || data.contacts !== undefined
    ) {
      payload.extraData = this.mergeVacancyExtraData(vacancy.extraData, {
        ...(data.extraData && typeof data.extraData === 'object' ? data.extraData : {}),
        ...(data.maritalStatus !== undefined ? { maritalStatus: data.maritalStatus } : {}),
        ...(data.hasCar !== undefined ? { hasCar: data.hasCar } : {}),
        ...(data.contacts !== undefined ? { contacts: data.contacts } : {}),
      });
    }

    await vacancy.update(payload);
    return this.getById(id);
  }

  async linkPeopleFromDb({ limit = 5000 } = {}) {
    const vacancies = await Vacancy.findAll({
      where: {
        [Op.or]: [
          { acceptedByUserId: null, forumOperator: { [Op.ne]: null } },
          { acceptedByUserId: { [Op.ne]: null } },
        ],
      },
      limit,
      order: [['id', 'ASC']],
    });

    let operators = 0;
    let contacts = 0;

    for (const v of vacancies) {
      const patch = {};

      if (!v.acceptedByUserId && v.forumOperator) {
        const op = await this.resolveForumOperator(
          { forumOperator: v.forumOperator },
          null,
          { exactNameOnly: true },
        );
        if (op.acceptedByUserId) {
          patch.acceptedByUserId = op.acceptedByUserId;
          patch.forumOperator = op.forumOperator;
          operators += 1;
        }
      } else if (v.acceptedByUserId) {
        const staff = await User.findByPk(v.acceptedByUserId);
        if (staff) {
          const name = staff.fullName || staff.username;
          if (name && name !== v.forumOperator) {
            patch.forumOperator = name;
            operators += 1;
          }
        }
      }

      // Jogapkär anketadan baglanmaýar — diňe ady/telefon saklanýar
      if (v.contactPhone && !v.contactName) {
        const contact = await this.enrichContactFromDb({
          contactName: v.contactName,
          contactPhone: v.contactPhone,
        });
        if (contact.contactName || contact.contactPhone !== v.contactPhone) {
          patch.contactName = contact.contactName;
          patch.contactPhone = contact.contactPhone;
          patch.contactAnketaId = null;
          contacts += 1;
        }
      }

      if (Object.keys(patch).length) await v.update(patch);
    }

    return { scanned: vacancies.length, operatorsLinked: operators, contactsLinked: contacts };
  }

  async remove(id, currentUser = null) {
    const vacancy = await this.getById(id, currentUser);
    await VacancyAssignment.destroy({ where: { vacancyId: vacancy.id } });
    await vacancy.destroy();
    return { message: 'Wakansiýa pozuldy' };
  }

  async syncVacancyLatestAssignment(vacancyId) {
    const latest = await VacancyAssignment.findOne({
      where: { vacancyId },
      order: [['updatedAt', 'DESC']],
    });
    const vacancy = await Vacancy.findByPk(vacancyId);
    if (!vacancy) return null;
    if (!latest) {
      await vacancy.update({
        assignedAnketaId: null,
        assignedCandidateName: null,
        assignmentStatus: null,
      });
    } else {
      await vacancy.update({
        assignedAnketaId: latest.anketaId,
        assignedCandidateName: latest.candidateName,
        assignmentStatus: latest.status,
      });
    }
    return vacancy;
  }

  async assignCandidate(id, anketaId, assignmentStatus, currentUser = null, notes = null) {
    const vacancy = await this.getById(id, currentUser);
    const anketa = await Anketa.findByPk(anketaId);
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    if (!anketa.anketaNumber) {
      throw new ApiError(400, 'Anketa belgesi (№) ýok — hödürläp bolmaz');
    }

    const name = [anketa.familyName, anketa.firstName, anketa.patronymic].filter(Boolean).join(' ');
    const candidateName = `№ ${anketa.anketaNumber} — ${name}`.trim();
    const status = assignmentStatus || 'Hödürlendi';
    const noteText = notes != null ? String(notes).trim() : '';

    let assignment = await VacancyAssignment.findOne({
      where: { vacancyId: id, anketaId },
      paranoid: false,
    });
    const wasAccepted = assignment && !assignment.deletedAt
      && isAssignmentAccepted(assignment.status);

    const patch = {
      candidateName,
      status,
      assignedByUserId: await resolveAssignmentWorkerId(
        currentUser,
        vacancy,
        assignment?.assignedByUserId,
      ),
    };
    if (isAssignmentAccepted(status)) {
      const becomingAccepted = !wasAccepted;
      patch.acceptedAt = becomingAccepted
        ? new Date().toISOString().slice(0, 10)
        : ((assignment && !assignment.deletedAt && assignment.acceptedAt)
          || new Date().toISOString().slice(0, 10));
    } else {
      patch.acceptedAt = null;
    }
    if (noteText) patch.notes = noteText;

    if (assignment && assignment.deletedAt) {
      await assignment.restore();
      const workerId = await resolveAssignmentWorkerId(
        currentUser,
        vacancy,
        assignment.assignedByUserId,
      );
      await assignment.update({
        ...patch,
        assignedByUserId: workerId ?? patch.assignedByUserId,
      });
    } else if (assignment) {
      const workerId = await resolveAssignmentWorkerId(
        currentUser,
        vacancy,
        assignment.assignedByUserId,
      );
      await assignment.update({
        ...patch,
        assignedByUserId: workerId ?? patch.assignedByUserId,
      });
    } else {
      assignment = await VacancyAssignment.create({
        vacancyId: Number(id),
        anketaId: Number(anketaId),
        candidateName,
        status,
        notes: noteText || null,
        assignedByUserId: patch.assignedByUserId,
        acceptedAt: patch.acceptedAt || null,
      });
    }

    if (noteText && assignment?.id) {
      await commentService.addAssignNote({
        assignmentId: assignment.id,
        anketaId: Number(anketaId),
        vacancy,
        body: noteText,
        userId: currentUser?.id || null,
        anketaNumber: anketa.anketaNumber,
      });
    }

    await this.syncVacancyLatestAssignment(id);
    if (isAssignmentAccepted(status) && !wasAccepted) {
      await this.markAnketaPlacedByUs(anketaId);
    } else if (wasAccepted && !isAssignmentAccepted(status)) {
      await this.clearAnketaPlacedByUsIfNeeded(anketaId);
    }
    const full = await this.getById(id);
    const json = full.toJSON ? full.toJSON() : full;
    json.assignment = assignment;
    json.assignmentCount = await VacancyAssignment.count({
      where: {
        vacancyId: id,
        status: { [Op.notIn]: INACTIVE_ASSIGNMENT_STATUSES },
      },
    });
    return json;
  }

  async listAssignments(vacancyId, query = {}) {
    await this.getById(vacancyId);
    const where = { vacancyId: Number(vacancyId) };
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where[Op.or] = [
        { candidateName: { [Op.iLike]: `%${query.search}%` } },
      ];
    }

    const items = await VacancyAssignment.findAll({
      where,
      include: [anketaLite],
      order: [['createdAt', 'DESC']],
    });
    return { items, total: items.length };
  }

  async getAnketaAssignmentCounts(anketaIds = []) {
    const ids = [...new Set(anketaIds.map(Number).filter(Boolean))];
    if (!ids.length) return {};

    const rows = await VacancyAssignment.findAll({
      attributes: [
        'anketaId',
        [sequelize.fn('COUNT', sequelize.col('VacancyAssignment.id')), 'total'],
        [sequelize.literal(
          `SUM(CASE WHEN "VacancyAssignment"."status" NOT IN (${INACTIVE_ASSIGNMENT_STATUSES.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')}) THEN 1 ELSE 0 END)`,
        ), 'active'],
      ],
      where: { anketaId: { [Op.in]: ids } },
      group: ['anketa_id'],
      raw: true,
    });

    const map = {};
    rows.forEach((row) => {
      map[row.anketaId] = {
        total: Number(row.total) || 0,
        active: Number(row.active) || 0,
      };
    });
    return map;
  }

  async listAssignmentsByAnketa(anketaId, currentUser = null) {
    const id = Number(anketaId);
    if (!id) throw new ApiError(400, 'Anketa ID gerek');

    const anketa = await Anketa.findByPk(id, {
      attributes: ['id', 'anketaNumber', 'familyName', 'firstName', 'patronymic', 'phone', 'desiredPosition'],
    });
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');

    const vacancyWhere = {};
    if (currentUser?.role === 'operator' && currentUser.id) {
      vacancyWhere.acceptedByUserId = currentUser.id;
    }

    const items = await VacancyAssignment.findAll({
      where: { anketaId: id },
      include: [{
        model: Vacancy,
        as: 'vacancy',
        attributes: ['id', 'vacancyNumber', 'companyName', 'companyDirection', 'position', 'salary', 'status', 'acceptedByUserId'],
        where: Object.keys(vacancyWhere).length ? vacancyWhere : undefined,
        required: currentUser?.role === 'operator',
        paranoid: false,
      }],
      order: [
        ['updatedAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    const plain = items.map((row) => (row.toJSON ? row.toJSON() : row));
    const total = plain.length;
    const active = plain.filter((row) => isActiveAssignmentStatus(row.status)).length;
    const latest = plain[0] || null;
    // Anketa taryhy — ähli ýagdaýlar (şol sanda «Kabul edildi»)
    return { anketa, items: plain, latest, total, active };
  }

  attachAnketaAssignmentCounts(rows, countMap) {
    return rows.map((row) => {
      const json = row.toJSON ? row.toJSON() : { ...row };
      const anketaId = json.anketaId || json.anketa?.id;
      const counts = countMap[anketaId] || { total: 0, active: 0 };
      json.anketaTotalCount = counts.total;
      json.anketaActiveCount = counts.active;
      return json;
    });
  }

  async listAllAssignments(query = {}, currentUser = null) {
    const { page, limit, offset } = buildPagination(query);
    const and = [];

    if (query.status || query.assignmentStatus) {
      and.push({ status: query.status || query.assignmentStatus });
    }
    if (query.vacancyId) and.push({ vacancyId: Number(query.vacancyId) });
    if (query.anketaId) and.push({ anketaId: Number(query.anketaId) });

    const like = (v) => ({ [Op.iLike]: `%${String(v).trim()}%` });

    const vacancyWhere = {};
    if (currentUser?.role === 'operator' && currentUser.id) {
      vacancyWhere.acceptedByUserId = currentUser.id;
    } else if (currentUser?.role === 'admin') {
      // Admin: default ählisi; islese operatora görä süz
      // Möhüm: diňe adatý string açarlar — Op.or Symbol Object.keys-de görünmeýär
      if (query.acceptedByUserId) {
        const uid = parseInt(query.acceptedByUserId, 10);
        if (uid) vacancyWhere.acceptedByUserId = uid;
      } else if (query.forumOperator) {
        const name = String(query.forumOperator).trim();
        if (name) vacancyWhere.forumOperator = { [Op.iLike]: name };
      }
    }
    if (query.vacancyStatus) vacancyWhere.status = query.vacancyStatus;
    if (query.company || query.companyName) {
      vacancyWhere.companyName = like(query.company || query.companyName);
    }
    if (query.position) vacancyWhere.position = like(query.position);
    if (query.salary) vacancyWhere.salary = like(query.salary);
    if (query.vacancyNumber) vacancyWhere.vacancyNumber = like(query.vacancyNumber);

    const anketaWhere = {};
    if (query.anketaNumber) anketaWhere.anketaNumber = like(query.anketaNumber);
    if (query.phone) anketaWhere.phone = like(query.phone);

    const faa = String(query.faa || query.candidateName || '').trim();
    if (faa) {
      and.push({
        [Op.or]: [
          { candidateName: like(faa) },
          { '$anketa.family_name$': like(faa) },
          { '$anketa.first_name$': like(faa) },
          { '$anketa.patronymic$': like(faa) },
        ],
      });
    }

    const search = String(query.search || '').trim();
    if (search) {
      const s = like(search);
      and.push({
        [Op.or]: [
          { candidateName: s },
          { status: s },
          { '$anketa.family_name$': s },
          { '$anketa.first_name$': s },
          { '$anketa.patronymic$': s },
          { '$anketa.phone$': s },
          { '$anketa.anketa_number$': s },
          { '$vacancy.company_name$': s },
          { '$vacancy.position$': s },
          { '$vacancy.salary$': s },
          { '$vacancy.vacancy_number$': s },
        ],
      });
    }

    const period = String(query.period || '').trim();
    if (['day', 'week', 'month', 'year'].includes(period)) {
      const range = resolvePeriodRange(period, query.date);
      and.push(
        where(
          sequelize.fn(
            'COALESCE',
            col('VacancyAssignment.accepted_at'),
            sequelize.fn('DATE', col('VacancyAssignment.created_at')),
          ),
          { [Op.between]: [range.from, range.to] },
        ),
      );
    }

    const assignmentWhere = and.length ? { [Op.and]: and } : {};
    const needAnketaJoin = !!(faa || search || Object.keys(anketaWhere).length);
    const needVacancyJoin = !!(search || Object.keys(vacancyWhere).length);
    const vacancyRequired = !!(
      (currentUser?.role === 'operator' && currentUser.id)
      || Object.keys(vacancyWhere).length
    );

    const { rows, count } = await VacancyAssignment.findAndCountAll({
      where: assignmentWhere,
      limit,
      offset,
      include: [
        {
          ...anketaLite,
          where: Object.keys(anketaWhere).length ? anketaWhere : undefined,
          required: !!(query.anketaNumber || query.phone),
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'username', 'fullName', 'role'],
          required: false,
        },
        {
          model: Vacancy,
          as: 'vacancy',
          paranoid: false,
          attributes: ['id', 'vacancyNumber', 'companyName', 'companyDirection', 'position', 'salary', 'status', 'contactName', 'contactPhone', 'closeReason', 'forumOperator', 'acceptedByUserId'],
          include: [{
            model: User,
            as: 'acceptedBy',
            attributes: ['id', 'username', 'fullName', 'role'],
            required: false,
          }],
          where: Object.keys(vacancyWhere).length ? vacancyWhere : undefined,
          required: vacancyRequired,
        },
      ],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      distinct: true,
      subQuery: needAnketaJoin || needVacancyJoin ? false : undefined,
    });

    const anketaIds = rows.map((r) => r.anketaId || r.anketa?.id).filter(Boolean);
    const countMap = await this.getAnketaAssignmentCounts(anketaIds);
    const items = this.attachAnketaAssignmentCounts(rows, countMap);

    return {
      items,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
      period: ['day', 'week', 'month', 'year'].includes(period)
        ? resolvePeriodRange(period, query.date)
        : null,
    };
  }

  async markAnketaPlacedByUs(anketaId, employmentDate = null) {
    if (!anketaId) return;
    const anketa = await Anketa.findByPk(anketaId);
    if (!anketa) return;
    const patch = {
      closedReason: PLACED_BY_US_REASON,
      status: 'Isleyar',
    };
    if (anketa.status !== 'Isleyar') {
      patch.statusChangedAt = new Date();
    }
    const day = String(employmentDate || '').trim().slice(0, 10);
    patch.employmentDate = /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? day
      : new Date().toISOString().slice(0, 10);
    await anketa.update(patch);
  }

  /** Başga «Kabul edildi» galmasa — biziň ýerleşdirenlerden / töleglerden çykarylýar
   *  keepClosedReason: false (default) — closedReason hem arassalanýar.
   *  keepClosedReason: true — status/employmentDate täzelenýär, emma closedReason saklanýar.
   */
  async clearAnketaPlacedByUsIfNeeded(anketaId, opts = {}) {
    const { keepClosedReason = false } = opts;
    if (!anketaId) return;
    const stillAccepted = await VacancyAssignment.findOne({
      where: { anketaId: Number(anketaId), status: 'Kabul edildi' },
      attributes: ['id'],
    });
    if (stillAccepted) return;

    const anketa = await Anketa.findByPk(anketaId);
    if (!anketa) return;
    const reason = String(anketa.closedReason || '').trim();
    if (!isPlacedByUsReason(reason)) return;

    const patch = {
      status: 'Islanok',
      employmentDate: null,
      statusChangedAt: new Date(),
    };
    if (!keepClosedReason) patch.closedReason = null;
    await anketa.update(patch);
  }

  async updateAssignmentById(assignmentId, assignmentStatus, currentUser = null, opts = {}) {
    const assignment = await VacancyAssignment.findByPk(assignmentId);
    if (!assignment) throw new ApiError(404, 'Hödürleme tapylmady');

    const hasStatus = assignmentStatus !== undefined && assignmentStatus !== null;
    const status = hasStatus
      ? String(assignmentStatus).trim()
      : String(assignment.status || '').trim();
    const wasAccepted = isAssignmentAccepted(assignment.status);
    const becameAccepted = hasStatus && isAssignmentAccepted(status) && !wasAccepted;
    const leftAccepted = hasStatus && wasAccepted && !isAssignmentAccepted(status);

    const patch = {};
    if (hasStatus) patch.status = status;
    if (hasStatus && isAssignmentAccepted(status)) {
      if (becameAccepted && opts.acceptedAt) {
        patch.acceptedAt = String(opts.acceptedAt).trim().slice(0, 10);
      } else if (becameAccepted) {
        patch.acceptedAt = new Date().toISOString().slice(0, 10);
      } else {
        patch.acceptedAt = assignment.acceptedAt || new Date().toISOString().slice(0, 10);
      }
      if (becameAccepted) {
        const vacancy = await Vacancy.findByPk(assignment.vacancyId, {
          attributes: ['id', 'acceptedByUserId'],
        });
        if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');
        const workerId = await resolveAssignmentWorkerId(
          currentUser,
          vacancy,
          assignment.assignedByUserId,
        );
        if (workerId) patch.assignedByUserId = workerId;
      }
    }
    // acceptedAt saklanýar — tölegler / işe başlan senesi üçin taryh

    if (opts.assignedByUserId !== undefined) {
      if (opts.assignedByUserId === null || opts.assignedByUserId === '') {
        patch.assignedByUserId = null;
      } else {
        patch.assignedByUserId = await assertOperatorWorkerId(Number(opts.assignedByUserId));
      }
    }

    const normStatus = normalizeAssignmentStatus(status);
    if (hasStatus && normStatus === ASSIGNMENT_STATUS.LEFT_JOB) {
      if (opts.leftAt !== undefined && opts.leftAt !== null && String(opts.leftAt).trim() !== '') {
        patch.leftAt = String(opts.leftAt).trim().slice(0, 10);
      } else if (!assignment.leftAt) {
        patch.leftAt = new Date().toISOString().slice(0, 10);
      }
    } else if (hasStatus && normStatus !== ASSIGNMENT_STATUS.LEFT_JOB && assignment.leftAt) {
      patch.leftAt = null;
    }

    if (opts.salaryReceiveAt !== undefined) {
      const salaryDay = String(opts.salaryReceiveAt || '').trim().slice(0, 10);
      patch.salaryReceiveAt = salaryDay || null;
    }

    if (!Object.keys(patch).length) {
      throw new ApiError(400, 'Üýtgeşme görkezilmedi');
    }

    await assignment.update(patch);
    await this.syncVacancyLatestAssignment(assignment.vacancyId);
    if (becameAccepted) {
      await this.markAnketaPlacedByUs(assignment.anketaId, patch.acceptedAt);
    } else if (leftAccepted) {
      // “Işden çykdy” wagty closedReason ýitirmeli däl — UI-da “Täze şertnama” gyzyl ýagdaýy saklansyn.
      await this.clearAnketaPlacedByUsIfNeeded(assignment.anketaId, { keepClosedReason: true });
    }
    try {
      require('./feePaymentService').invalidateEligibleCache();
    } catch { /* ignore */ }
    return VacancyAssignment.findByPk(assignmentId, { include: [anketaLite] });
  }

  async updateAssignmentStatus(id, assignmentStatus) {
    // köne API: wakansiýanyň soňky hödürlemesiniň ýagdaýyny üýtget
    const latest = await VacancyAssignment.findOne({
      where: { vacancyId: id },
      order: [['updatedAt', 'DESC']],
    });
    if (!latest) throw new ApiError(400, 'Bu wakansiýada hödürlenen ýok');
    return this.updateAssignmentById(latest.id, assignmentStatus);
  }

  async clearAssignment(id, assignmentId = null) {
    let anketaIds = [];
    if (assignmentId) {
      const assignment = await VacancyAssignment.findByPk(assignmentId);
      if (!assignment || Number(assignment.vacancyId) !== Number(id)) {
        throw new ApiError(404, 'Hödürleme tapylmady');
      }
      anketaIds = [assignment.anketaId];
      await assignment.destroy();
    } else {
      const rows = await VacancyAssignment.findAll({ where: { vacancyId: id } });
      anketaIds = rows.map((r) => r.anketaId);
      for (const row of rows) await row.destroy();
    }
    await this.syncVacancyLatestAssignment(id);
    for (const anketaId of [...new Set(anketaIds.filter(Boolean))]) {
      await this.clearAnketaPlacedByUsIfNeeded(anketaId);
    }
    return this.getById(id);
  }

  async removeAssignment(assignmentId) {
    const assignment = await VacancyAssignment.findByPk(assignmentId);
    if (!assignment) throw new ApiError(404, 'Hödürleme tapylmady');
    const vacancyId = assignment.vacancyId;
    const anketaId = assignment.anketaId;
    await assignment.destroy();
    await this.syncVacancyLatestAssignment(vacancyId);
    await this.clearAnketaPlacedByUsIfNeeded(anketaId);
    return { message: 'Hödürleme aýryldy', vacancyId };
  }

  async getDilHatyPrintData(assignmentId) {
    const id = Number(assignmentId);
    if (!id) throw new ApiError(400, 'Hödürleme ID gerek');

    const assignment = await VacancyAssignment.findByPk(id, {
      include: [
        {
          model: Anketa,
          as: 'anketa',
          attributes: [
            'id', 'anketaNumber', 'familyName', 'firstName', 'patronymic',
            'passportNumber', 'passportIssued', 'registrationCity', 'registrationAddress', 'currentAddress',
          ],
        },
        {
          model: Vacancy,
          as: 'vacancy',
          attributes: ['id', 'vacancyNumber', 'companyName', 'position', 'salary'],
          paranoid: false,
        },
      ],
    });
    if (!assignment) throw new ApiError(404, 'Hödürleme tapylmady');
    if (!isAssignmentAccepted(assignment.status)) {
      throw new ApiError(400, 'Dil haty diňe «Kabul edildi» ýagdaýy üçin');
    }
    const anketa = assignment.anketa;
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    if (!String(anketa.anketaNumber || '').trim()) {
      throw new ApiError(400, 'Anketa belgesi (№) ýok — dil haty çap edip bolmaz');
    }

    return buildDilHatyPrintData(
      assignment.toJSON ? assignment.toJSON() : assignment,
      anketa.toJSON ? anketa.toJSON() : anketa,
      assignment.vacancy?.toJSON ? assignment.vacancy.toJSON() : assignment.vacancy,
    );
  }

  async getStats(currentUser = null) {
    const where = {};
    if (currentUser?.role === 'operator' && currentUser.id) {
      where.acceptedByUserId = currentUser.id;
    }
    const total = await Vacancy.count({ where });
    const acyk = await Vacancy.count({ where: { ...where, status: 'Acyk' } });
    const yapyk = await Vacancy.count({ where: { ...where, status: 'Yapyk' } });
    return { total, acyk, yapyk };
  }

  async getByOperatorStats() {
    const rows = await Vacancy.findAll({
      attributes: ['acceptedByUserId', 'forumOperator', 'status', 'closeReason'],
      include: [acceptedByInclude],
      raw: false,
    });

    const map = new Map();
    rows.forEach((row) => {
      const j = row.toJSON();
      const key = j.acceptedByUserId || j.forumOperator || 'none';
      if (!map.has(key)) {
        map.set(key, {
          acceptedByUserId: j.acceptedByUserId,
          forumOperator: j.forumOperator || j.acceptedBy?.fullName || j.acceptedBy?.username || 'Bellenmedik',
          role: j.acceptedBy?.role || null,
          total: 0,
          acyk: 0,
          yapyk: 0,
          bizdenAlyndy: 0,
        });
      }
      const s = map.get(key);
      s.total += 1;
      if (j.status === 'Acyk') s.acyk += 1;
      if (j.status === 'Yapyk') s.yapyk += 1;
      if (j.closeReason === 'Bizden alyndy') s.bizdenAlyndy += 1;
    });

    return [...map.values()]
      .filter((r) => r.role !== 'admin')
      .sort((a, b) => b.total - a.total);
  }
}

module.exports = new VacancyService();
