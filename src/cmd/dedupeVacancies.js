/**
 * Ikinji Excel ýüklemeden galan dublikat wakansiýalary soft-delete edýär.
 * Saklanýar: her topar boýunça iň köne (iň kiçi id).
 * Açary: operator + firma + wezipe + sene + aýlyk + ýer
 *
 * Dry-run:  node src/cmd/dedupeVacancies.js
 * Apply:    node src/cmd/dedupeVacancies.js --yes
 */
require('dotenv').config({ override: true });
const sequelize = require('../config/database');
const { Vacancy, VacancyAssignment } = require('../models');

const norm = (v) => String(v || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const fingerprint = (v) => {
  const j = v.toJSON ? v.toJSON() : v;
  const excelNo = j.extraData?.excelVacancyNumber;
  if (j.acceptedByUserId && excelNo != null && excelNo !== '') {
    return `e:${j.acceptedByUserId}:${excelNo}`;
  }
  const date = j.vacancyDate ? String(j.vacancyDate).slice(0, 10) : '';
  return `f:${j.acceptedByUserId || 0}:${norm(j.companyName)}|${norm(j.position)}|${date}|${norm(j.salary)}|${norm(j.location)}`;
};

const run = async () => {
  const apply = process.argv.includes('--yes');
  await sequelize.authenticate();

  const all = await Vacancy.findAll({
    attributes: [
      'id', 'vacancyNumber', 'acceptedByUserId', 'forumOperator',
      'companyName', 'position', 'salary', 'location', 'vacancyDate',
      'extraData', 'createdAt',
    ],
    order: [['id', 'ASC']],
  });

  const groups = new Map();
  all.forEach((v) => {
    const key = fingerprint(v);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  });

  const toDelete = [];
  const keep = [];
  groups.forEach((list) => {
    if (list.length < 2) return;
    const [first, ...rest] = list;
    keep.push(first);
    rest.forEach((v) => toDelete.push(v));
  });

  console.log(`Jemi wakansiýa: ${all.length}`);
  console.log(`Dublikat topar: ${[...groups.values()].filter((g) => g.length > 1).length}`);
  console.log(`Saklanjak: ${keep.length} | Pozuljak (soft): ${toDelete.length}`);
  console.log(`Galjak jemi: ${all.length - toDelete.length}`);

  if (!toDelete.length) {
    console.log('Dublikat ýok.');
    process.exit(0);
  }

  if (!apply) {
    console.log('\nMysal pozuljaklar (ilkinji 15):');
    toDelete.slice(0, 15).forEach((v) => {
      console.log(
        `  id=${v.id} №${v.vacancyNumber} | ${v.companyName || '-'} / ${v.position || '-'} | op=${v.acceptedByUserId || v.forumOperator}`,
      );
    });
    console.log('\nHakykatdan pozmak üçin: node src/cmd/dedupeVacancies.js --yes');
    process.exit(0);
  }

  let removedAsg = 0;
  for (const v of toDelete) {
    removedAsg += await VacancyAssignment.destroy({ where: { vacancyId: v.id } });
    await v.destroy();
  }

  console.log(`Tamam: ${toDelete.length} wakansiýa soft-delete, ${removedAsg} hödürleme aýryldy.`);
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
