#!/usr/bin/env node
/**
 * Täze Main PC — ähli funksiýalar geçdimi?
 *   node tools/verify-new-main-pc.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const root = path.join(__dirname, '..');
const ok = [];
const warn = [];
const fail = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function checkFile(rel, label) {
  if (exists(rel)) ok.push(label);
  else fail.push(`${label} ýok: ${rel}`);
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ý/g, 'y').replace(/ň/g, 'n').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

async function tableExists(s, name) {
  const [rows] = await s.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    { bind: [name] },
  );
  return rows.length > 0;
}

async function columnExists(s, table, col) {
  const [rows] = await s.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    { bind: [table, col] },
  );
  return rows.length > 0;
}

async function main() {
  console.log('');
  console.log('=== Kerwen — täze Main PC funksiýa barlagy ===');
  console.log(`Papka: ${root}`);
  console.log('');

  checkFile('.env', '.env');
  checkFile('src/server.js', 'Serwer kody');
  checkFile('public/js/admin.js', 'Admin UI');
  checkFile('public/js/assignment-salary-date.js', 'Aýlyk modal');
  checkFile('src/services/candidateMailService.js', 'Poçta + operator nomer');
  checkFile('src/services/feePaymentService.js', 'Tölegler hasap');
  checkFile('data/mail-login.json', 'Poçta login (mail-login.json)');
  checkFile('data/option-lists.json', 'Option lists');
  checkFile('public/uploads', 'Anketa suratlary (uploads)');
  checkFile('src/utils/localPaths.js', 'Täze PC ýol (localPaths)');
  checkFile('src/services/anketaPortraitFolderService.js', '3×4 daşarky papka');
  checkFile('src/services/mailService.js', 'Poçta (mail)');
  checkFile('src/services/excelService.js', 'Excel import/export');
  checkFile('src/services/anketaService.js', 'Anketa');
  checkFile('src/services/vacancyService.js', 'Wakansiýa');
  checkFile('src/services/matchService.js', 'Anketa ↔ wakansiýa gabat');
  checkFile('public/js/anketa-form.js', 'Anketa forma');
  checkFile('public/js/anketa-mail.js', 'Anketa poçta UI');
  checkFile('public/js/vacancy-form.js', 'Wakansiýa forma');
  checkFile('certs/kerwen.pfx', 'HTTPS sertifikat');

  try {
    const portrait = require('../src/services/anketaPortraitFolderService');
    const kici = portrait.ensureFolder();
    const inside = require('../src/utils/localPaths').isProjectPath(kici);
    if (inside) warn.push(`3×4 heniz programma içinde: ${kici} — Desktop\\anketa_kici_suratlar bolmaly`);
    else ok.push(`3×4 daşarky papka: ${kici}`);
  } catch (e) {
    warn.push(`3×4 papka: ${e.message}`);
  }

  const env = process.env;
  if (env.DB_NAME && env.DB_USER) ok.push('DB sazlama (.env)');
  else fail.push('DB_NAME / DB_USER .env-de ýok');

  if (String(env.SMTP_USER || '').includes('@') && String(env.SMTP_PASS || '').length >= 8) {
    ok.push('SMTP poçta (.env)');
  } else {
    warn.push('SMTP_USER / SMTP_PASS gowşak ýa-da ýok — poçta işlemez');
  }
  if (String(env.MAIL_ENABLED) === '1') ok.push('MAIL_ENABLED=1');
  else warn.push('MAIL_ENABLED=1 däl — Sazlamalar → Poçta saklaň');

  if (String(env.HTTPS_ENABLED) === '1') ok.push('HTTPS_ENABLED=1 (kamera)');
  else warn.push('HTTPS_ENABLED däl — operator kamera HTTPS gerek');

  try {
    const mail = JSON.parse(fs.readFileSync(path.join(root, 'data/mail-login.json'), 'utf8'));
    if (mail.user && mail.pass) ok.push('mail-login.json doldy');
    else warn.push('mail-login.json boş');
  } catch {
    /* file check already */
  }

  const s = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST || '127.0.0.1',
    port: env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await s.authenticate();
    ok.push(`PostgreSQL ${env.DB_NAME}@${env.DB_HOST}:${env.DB_PORT}`);
  } catch (e) {
    fail.push(`PostgreSQL baglanyşyk: ${e.message}`);
    printReport();
    process.exitCode = 1;
    return;
  }

  const needTables = [
    ['anketas', 'Anketalar'],
    ['vacancies', 'Wakansiýalar'],
    ['vacancy_assignments', 'Hödürlemeler'],
    ['agency_fee_payments', 'Tölegler tablisasy'],
    ['users', 'Ulanyjylar'],
  ];
  for (const [t, label] of needTables) {
    if (await tableExists(s, t)) ok.push(`Baza: ${label}`);
    else fail.push(`Baza tablisa ýok: ${t} (${label})`);
  }

  const needCols = [
    ['vacancy_assignments', 'salary_receive_at', 'Aýlyk senesi'],
    ['vacancy_assignments', 'left_at', 'Işden çykan sene'],
    ['vacancy_assignments', 'assigned_by_user_id', 'Işgär (operator)'],
    ['vacancy_assignments', 'accepted_at', 'Kabul edildi sene'],
  ];
  for (const [t, c, label] of needCols) {
    if (await columnExists(s, t, c)) ok.push(`Sütün: ${label}`);
    else fail.push(`Sütün ýok: ${t}.${c} (${label}) — npm run db:sync`);
  }

  try {
    const [[ank]] = await s.query('SELECT COUNT(*)::int AS c FROM anketas');
    const [[usr]] = await s.query('SELECT COUNT(*)::int AS c FROM users');
    const [[asg]] = await s.query('SELECT COUNT(*)::int AS c FROM vacancy_assignments WHERE deleted_at IS NULL');
    if (Number(ank.c) > 0) ok.push(`Anketa sany: ${ank.c}`);
    else warn.push('Anketa 0 — dump restore edildiňizmi?');
    if (Number(usr.c) > 0) ok.push(`Ulanyjy sany: ${usr.c}`);
    else fail.push('Ulanyjy ýok — login işlemez');
    ok.push(`Hödürleme sany: ${asg.c}`);

    const [ops] = await s.query(
      `SELECT username, full_name FROM users WHERE is_active = true`,
    );
    const names = ['merjen', 'mahri', 'enejan'];
    const found = names.filter((n) => ops.some((u) => {
      const blob = fold(`${u.username || ''} ${u.full_name || ''}`);
      return blob.includes(n);
    }));
    if (found.length) ok.push(`Operator nomer gabat: ${found.join(', ')}`);
    else warn.push('Merjen/Mahri/Enejan ulanyjyda tapylmady — poçta umumy nomer gider');
  } catch (e) {
    warn.push(`Sanaw: ${e.message}`);
  }

  await s.close();
  printReport();
  if (fail.length) process.exitCode = 1;
}

function printReport() {
  console.log('OK:');
  ok.forEach((x) => console.log(`  ✓ ${x}`));
  if (warn.length) {
    console.log('');
    console.log('Üns:');
    warn.forEach((x) => console.log(`  ! ${x}`));
  }
  if (fail.length) {
    console.log('');
    console.log('Ýalňyş:');
    fail.forEach((x) => console.log(`  ✗ ${x}`));
  }
  console.log('');
  console.log('Funksiýalar (kod + maglumat geçmeli):');
  console.log('  Login, Anketa, Surat, Wakansiýa, Hödürleme,');
  console.log('  Tölegler (gün boýunça), Aýlyk modal,');
  console.log('  Poçta + 3 operator nomer, HTTPS kamera, Excel.');
  console.log('');
  if (!fail.length) {
    console.log('✓ Esasy funksiýalar täze Main PC-de geçmeli.');
  } else {
    console.log('⚠ Ýokarky ýalňyşlyklary düzetmeseňiz kä funksiýa işlemän durar.');
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
