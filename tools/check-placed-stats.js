require('dotenv').config();
const { Sequelize } = require('sequelize');

const s = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  logging: false,
});

(async () => {
  try {
    await s.authenticate();
    const [kabul] = await s.query(`
      SELECT COUNT(*)::int AS c
      FROM vacancy_assignments
      WHERE status = 'Kabul edildi' AND deleted_at IS NULL
    `);
    const [bizin] = await s.query(`
      SELECT COUNT(*)::int AS c
      FROM anketas
      WHERE status = 'Isleyar'
        AND (
          closed_reason = 'Biziň ýerleşdirenlerimiz'
          OR closed_reason ILIKE '%Biziň ýerleşdiren%'
          OR closed_reason ILIKE '%bizin%yerlesdiren%'
        )
    `);
    const [reasons] = await s.query(`
      SELECT closed_reason, COUNT(*)::int AS c
      FROM anketas
      WHERE status = 'Isleyar' AND closed_reason IS NOT NULL
      GROUP BY closed_reason
      ORDER BY c DESC
      LIMIT 15
    `);
    const [total] = await s.query('SELECT COUNT(*)::int AS c FROM anketas');
    const [isleyar] = await s.query(`
      SELECT COUNT(*)::int AS c FROM anketas WHERE status = 'Isleyar'
    `);

    const placedByUs = Math.max(Number(kabul[0].c || 0), Number(bizin[0].c || 0));
    const ok = Number(total[0].c || 0) > 0 && (Number(bizin[0].c || 0) > 0 || Number(kabul[0].c || 0) > 0);

    console.log('');
    console.log('=== Kerwen — Biziň ýerleşdirenler barlagy ===');
    console.log(`Baza: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`Jemi anketa:              ${total[0].c}`);
    console.log(`Işleýär (Isleyar):        ${isleyar[0].c}`);
    console.log(`Kabul edildi (hödürleme): ${kabul[0].c}`);
    console.log(`Sebäp «biziň ýerleşdiren»: ${bizin[0].c}`);
    console.log(`Stat (takmynan):          ${placedByUs}+`);
    console.log('');
    if (!ok) {
      console.log('⚠ DIKKAT: Maglumat az ýa-da ýok!');
      console.log('  Täze Main PC-de db\\kerwen_dump.sql restore edildiňizmi?');
      console.log('  .env-de DB_HOST / DB_PORT / DB_NAME / parol dogrymy?');
      console.log('  npm run dev bir gezek işlediň (migrasiýa/backfill).');
    } else {
      console.log('✓ Baza maglumaty bar — panel statistikasy işlemeli.');
    }
    console.log('');
    console.log('Işleýän sebäpler (ilkinji 15):');
    reasons.forEach((r) => console.log(`  ${r.c} × ${r.closed_reason}`));
    console.log('');
  } catch (e) {
    console.error('Baglanyşyk ýalňyşlygy:', e.message);
    console.error('.env we PostgreSQL gurnawyny barlaň.');
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
