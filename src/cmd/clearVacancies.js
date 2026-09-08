/**
 * Ähli wakansiýalary we hödürlemeleri doly (hard) pozýar.
 * Soft-delete soň Excel import № bilen çaknyşyp bilýär — shonuň üçin force.
 *
 * Ulanyş: node src/cmd/clearVacancies.js --yes
 */
require('dotenv').config({ override: true });
const sequelize = require('../config/database');
const { Vacancy, VacancyAssignment, Comment } = require('../models');

const run = async () => {
  if (!process.argv.includes('--yes')) {
    console.log('ÜNS: bu ähli wakansiýa + hödürleme + şol komentleri pozýar.');
    console.log('Dowam etmek üçin: npm run db:clear-vacancies -- --yes');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();

    const { Op } = require('sequelize');
    const asg = await VacancyAssignment.destroy({ where: {}, force: true });
    let vacComments = 0;
    try {
      vacComments = await Comment.destroy({
        where: { entityType: { [Op.in]: ['vacancy', 'assignment'] } },
        force: true,
      });
    } catch (_) { /* table ýok bolsa */ }
    const vac = await Vacancy.destroy({ where: {}, force: true });

    // SEQUENCE reset — täze import 1-den başlap bilýär
    try {
      await sequelize.query(`
        SELECT setval(
          pg_get_serial_sequence('vacancies', 'id'),
          COALESCE((SELECT MAX(id) FROM vacancies), 1),
          true
        );
      `);
    } catch (_) { /* optional */ }

    console.log(`Pozuldy: wakansiýa=${vac}, hödürleme=${asg}, koment≈${vacComments || 0}`);
    console.log('Indi Excel-den ýükläp bilersiňiz (Excel sekmesi).');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
