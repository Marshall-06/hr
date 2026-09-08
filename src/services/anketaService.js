const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Anketa } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  buildPagination,
  buildSearchFilter,
  formatFullName,
  generateAnketaNumber,
} = require('../utils/helpers');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

class AnketaService {
  async getAll(query = {}) {
    const { page, limit, offset } = buildPagination(query);
    const where = {
      ...buildSearchFilter(
        [
          'familyName', 'firstName', 'patronymic', 'phone', 'desiredPosition',
          'anketaNumber', 'registrationCity', 'currentAddress', 'educationLevel',
          'closedReason', 'status', 'gender',
        ],
        query.search,
      ),
    };

    if (query.status) where.status = query.status;
    if (query.gender) where.gender = { [Op.iLike]: `%${query.gender}%` };
    if (query.desiredPosition) {
      where.desiredPosition = { [Op.iLike]: `%${query.desiredPosition}%` };
    }
    if (query.phone) {
      where.phone = { [Op.iLike]: `%${String(query.phone).trim()}%` };
    }
    if (query.anketaNumber) {
      where.anketaNumber = { [Op.iLike]: `%${String(query.anketaNumber).trim()}%` };
    }
    if (query.familyName) {
      where.familyName = { [Op.iLike]: `%${String(query.familyName).trim()}%` };
    }
    if (query.firstName) {
      where.firstName = { [Op.iLike]: `%${String(query.firstName).trim()}%` };
    }
    if (query.faa) {
      const parts = String(query.faa).trim().split(/\s+/).filter(Boolean);
      if (parts.length) {
        where[Op.and] = [
          ...(where[Op.and] || []),
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
      where.formDate = { ...(where.formDate || {}), [Op.gte]: query.dateFrom };
    }
    if (query.dateTo) {
      where.formDate = { ...(where.formDate || {}), [Op.lte]: query.dateTo };
    }

    const { rows, count } = await Anketa.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getById(id) {
    const anketa = await Anketa.findByPk(id);
    if (!anketa) throw new ApiError(404, 'Anketa tapylmady');
    return anketa;
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

    if (phone.length >= 8) {
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
    await this.assertUnique(data);
    const anketaNumber = data.anketaNumber || await generateAnketaNumber(Anketa);
    return Anketa.create({
      ...data,
      anketaNumber,
      formDate: data.formDate || new Date().toISOString().split('T')[0],
    });
  }

  async update(id, data) {
    const anketa = await this.getById(id);
    const merged = {
      familyName: data.familyName !== undefined ? data.familyName : anketa.familyName,
      firstName: data.firstName !== undefined ? data.firstName : anketa.firstName,
      patronymic: data.patronymic !== undefined ? data.patronymic : anketa.patronymic,
      birthYear: data.birthYear !== undefined ? data.birthYear : anketa.birthYear,
      phone: data.phone !== undefined ? data.phone : anketa.phone,
      passportNumber: data.passportNumber !== undefined ? data.passportNumber : anketa.passportNumber,
    };
    await this.assertUnique(merged, id);
    await anketa.update(data);
    return anketa;
  }

  async remove(id) {
    const anketa = await this.getById(id);
    await anketa.destroy();
    return { message: 'Anketa pozuldy' };
  }

  async getStats() {
    const total = await Anketa.count();
    const isleyar = await Anketa.count({ where: { status: 'Isleyar' } });
    const islanok = await Anketa.count({ where: { status: 'Islanok' } });
    return { total, isleyar, islanok };
  }

  /** Ýapylma sebäpleri — default + bazadaky goşmaça ýazgylar */
  async getClosedReasons() {
    const defaults = [
      'Işe ýerleşdi',
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
