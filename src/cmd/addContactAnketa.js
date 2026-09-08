require('dotenv').config();
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Vacancy, Anketa } = require('../models');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const findAnketa = async ({ contactName, contactPhone }) => {
  const phone = normalizePhone(contactPhone);
  if (phone.length >= 8) {
    const tail = phone.slice(-8);
    const rows = await Anketa.findAll({
      where: { phone: { [Op.ne]: null } },
      attributes: ['id', 'phone', 'familyName', 'firstName', 'patronymic'],
      limit: 500,
    });
    const hit = rows.find((a) => normalizePhone(a.phone).endsWith(tail) || normalizePhone(a.phone).includes(tail));
    if (hit) return hit;
  }

  const name = String(contactName || '').trim();
  if (!name) return null;

  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  const where = {
    [Op.and]: parts.map((p) => ({
      [Op.or]: [
        { familyName: { [Op.iLike]: `%${p}%` } },
        { firstName: { [Op.iLike]: `%${p}%` } },
        { patronymic: { [Op.iLike]: `%${p}%` } },
      ],
    })),
  };

  return Anketa.findOne({ where, order: [['id', 'DESC']] });
};

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE vacancies
      ADD COLUMN IF NOT EXISTS contact_anketa_id INTEGER;
    `);

    const vacancies = await Vacancy.findAll({
      where: {
        [Op.or]: [
          { contactName: { [Op.ne]: null } },
          { contactPhone: { [Op.ne]: null } },
        ],
        contactAnketaId: null,
      },
      limit: 5000,
    });

    let linked = 0;
    for (const v of vacancies) {
      const anketa = await findAnketa({
        contactName: v.contactName,
        contactPhone: v.contactPhone,
      });
      if (anketa) {
        await v.update({ contactAnketaId: anketa.id });
        linked += 1;
      }
    }

    console.log(`contact_anketa_id goşuldy. Baglanan: ${linked} / ${vacancies.length}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
