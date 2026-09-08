require('dotenv').config();
const sequelize = require('../config/database');
const { Vacancy, VacancyAssignment } = require('../models');

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS vacancy_assignments (
        id SERIAL PRIMARY KEY,
        vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
        anketa_id INTEGER NOT NULL REFERENCES anketas(id),
        candidate_name VARCHAR(200),
        status VARCHAR(100) DEFAULT 'Hödürlendi',
        assigned_by_user_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS vacancy_assignments_vacancy_anketa_unique
        ON vacancy_assignments (vacancy_id, anketa_id)
        WHERE deleted_at IS NULL;
    `);

    const legacy = await Vacancy.findAll({
      where: { assignedAnketaId: { [require('sequelize').Op.ne]: null } },
      paranoid: true,
    });

    let migrated = 0;
    for (const v of legacy) {
      const [row, created] = await VacancyAssignment.findOrCreate({
        where: { vacancyId: v.id, anketaId: v.assignedAnketaId },
        defaults: {
          candidateName: v.assignedCandidateName,
          status: v.assignmentStatus || 'Hödürlendi',
        },
      });
      if (!created && !row.deletedAt) {
        await row.update({
          candidateName: v.assignedCandidateName || row.candidateName,
          status: v.assignmentStatus || row.status,
        });
      }
      if (created) migrated += 1;
    }

    console.log(`vacancy_assignments taýýar. Köne ýazgylar: ${migrated} goşuldy / jemi legacy ${legacy.length}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
