/**
 * Bazadaky iş maglumatyny doly arassalaýar (boşadýar):
 * anketalar, wakansiýalar, hödürlemeler, şertnamalar, komentler, tölegler.
 *
 * Ulanyjylar (admin/operator) deslapky saklanýar.
 * Ähli ulanyjylary hem pozmak üçin: --users
 *
 * Ulanyş:
 *   node src/cmd/clearAllData.js --yes
 *   node src/cmd/clearAllData.js --yes --users
 *   npm run db:clear-all -- --yes
 */
require('dotenv').config({ override: true });
const sequelize = require('../config/database');
const {
  User,
  Anketa,
  Vacancy,
  Contract,
  VacancyAssignment,
  Comment,
  AgencyFeePayment,
} = require('../models');

async function resetSequence(table, column = 'id') {
  try {
    await sequelize.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', '${column}'),
        COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
        true
      );
    `);
  } catch (_) { /* SQLite / sequence ýok */ }
}

async function safeDestroy(Model, label) {
  try {
    const n = await Model.destroy({ where: {}, force: true });
    return { label, n: Number(n) || 0, ok: true };
  } catch (err) {
    return { label, n: 0, ok: false, error: err.message };
  }
}

const run = async () => {
  const yes = process.argv.includes('--yes');
  const withUsers = process.argv.includes('--users');

  if (!yes) {
    console.log('ÜNS: bu ähli anketalar, wakansiýalar, hödürlemeler, şertnamalar,');
    console.log('komentler we tölegleri DOLY pozýar. Yzyna gaýtarmak mümkin däl.');
    console.log('');
    console.log('Dowam etmek üçin:');
    console.log('  npm run db:clear-all -- --yes');
    console.log('');
    console.log('Ulanyjylary hem pozmak (soň seed gerek):');
    console.log('  npm run db:clear-all -- --yes --users');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log('Baza baglandy. Arassalanýar...');

    // FK tertibi: çagalary ilki
    const steps = [
      await safeDestroy(AgencyFeePayment, 'tölegler'),
      await safeDestroy(Comment, 'komentler'),
      await safeDestroy(VacancyAssignment, 'hödürlemeler'),
      await safeDestroy(Contract, 'şertnamalar'),
      await safeDestroy(Vacancy, 'wakansiýalar'),
      await safeDestroy(Anketa, 'anketalar'),
    ];

    if (withUsers) {
      steps.push(await safeDestroy(User, 'ulanyjylar'));
    }

    for (const s of steps) {
      if (s.ok) console.log(`  ✓ ${s.label}: ${s.n}`);
      else console.log(`  ✗ ${s.label}: ${s.error}`);
    }

    await resetSequence('agency_fee_payments');
    await resetSequence('comments');
    await resetSequence('vacancy_assignments');
    await resetSequence('contracts');
    await resetSequence('vacancies');
    await resetSequence('anketas');
    if (withUsers) await resetSequence('users');

    console.log('');
    console.log('Baza boşadyldy.');
    if (withUsers) {
      console.log('Ulanyjylar hem pozuldy. Täzeden: npm run db:seed');
    } else {
      console.log('Ulanyjylar saklandy (giriş şol bir).');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
