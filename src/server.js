require('dotenv').config({ override: true });
const http = require('http');
const https = require('https');
const app = require('./app');
const sequelize = require('./config/database');
const env = require('./config/env');
const { loadHttpsOptions, lanIpv4 } = require('./utils/httpsCert');
require('./models');

process.on('uncaughtException', (err) => {
  console.error('Garaşylmadyk ýalňyşlyk:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Promise ýalňyşlygy:', err?.message || err);
});

function printUrls(protocol, port) {
  const host = require('os').hostname();
  console.log(`${protocol}://localhost:${port}`);
  console.log(`  Durnukly at: ${protocol}://KerwenKadr:${port}/admin/login.html`);
  if (host && host !== 'KerwenKadr') {
    console.log(`  PC ady:     ${protocol}://${host}:${port}/admin/login.html`);
  }
  lanIpv4().forEach((ip) => {
    if (ip === 'localhost' || ip === '127.0.0.1' || ip === 'KerwenKadr') return;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return;
    console.log(`  IP (üýtgäp bilýär): ${protocol}://${ip}:${port}/anketa.html`);
  });
}

const start = async () => {
  try {
    try {
      const { sanitizeLocalConfig } = require('./utils/sanitizeLocalConfig');
      const s = sanitizeLocalConfig();
      if (s.fixed.length) {
        console.log(`Täze PC ýol düzedildi: ${s.fixed.join('; ')}`);
      }
    } catch (e) {
      console.warn('Ýol sanitize:', e?.message || e);
    }

    // Windows awtostart: Postgres käwagt 10–40 s soň açylýar — derrew çykma
    {
      const maxMs = 90_000;
      const stepMs = 2000;
      let lastErr = null;
      const t0 = Date.now();
      while (true) {
        try {
          await sequelize.authenticate();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const waited = Date.now() - t0;
          if (waited >= maxMs) break;
          if (waited === 0 || waited % 10_000 < stepMs) {
            console.warn(`PostgreSQL garaşylýar… (${Math.round(waited / 1000)}s) ${e?.message || e}`);
          }
          await new Promise((r) => setTimeout(r, stepMs));
        }
      }
      if (lastErr) throw lastErr;
    }
    console.log('PostgreSQL baglanyşyk üstünlikli');

    await sequelize.sync();
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS can_delete_anketa BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await sequelize.query(`
      DO $body$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'anketas'::regclass
            AND contype = 'u'
            AND (
              conname ILIKE '%anketa_number%'
              OR conname ~ '^anketas_anketa_number_key'
            )
        LOOP
          EXECUTE format('ALTER TABLE anketas DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
        FOR r IN
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'anketas'
            AND indexname ILIKE '%anketa_number%key%'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
        END LOOP;
      END
      $body$;
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS anketas_anketa_number_active_key
      ON anketas (anketa_number)
      WHERE deleted_at IS NULL
    `);
    await sequelize.query(`
      DO $body$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'vacancies'::regclass
            AND contype = 'u'
            AND conname ILIKE '%vacancy_number%'
        LOOP
          EXECUTE format('ALTER TABLE vacancies DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END
      $body$;
    `);
    // Ýagdaý üýtgeýän wagt sütüni (synс alter ýok)
    await sequelize.query(`
      ALTER TABLE anketas
      ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ
    `);
    // Şahsy awtoulagy — erkin tekst (öň Bar/Ýok select)
    await sequelize.query(`
      ALTER TABLE anketas
      ALTER COLUMN has_car TYPE VARCHAR(100)
    `);
    await sequelize.query(`
      ALTER TABLE anketas
      ALTER COLUMN desired_position TYPE VARCHAR(500)
    `);
    await sequelize.query(`
      ALTER TABLE vacancy_assignments
      ADD COLUMN IF NOT EXISTS accepted_at DATE
    `);
    await sequelize.query(`
      ALTER TABLE vacancy_assignments
      ADD COLUMN IF NOT EXISTS left_at DATE
    `);
    await sequelize.query(`
      ALTER TABLE vacancy_assignments
      ADD COLUMN IF NOT EXISTS salary_receive_at DATE
    `);
    await sequelize.query(`
      UPDATE vacancy_assignments
      SET left_at = COALESCE(left_at, updated_at::date)
      WHERE status = 'Işden çykdy'
        AND left_at IS NULL
        AND deleted_at IS NULL
    `);
    await sequelize.query(`
      UPDATE vacancy_assignments va
      SET accepted_at = COALESCE(
        va.accepted_at,
        va.updated_at::date,
        va.created_at::date
      )
      WHERE va.status = 'Kabul edildi'
        AND va.accepted_at IS NULL
        AND va.deleted_at IS NULL
    `);
    // Köne employment_date bilen ýalňyş accepted_at — hödürlenenler tertibini bozýar
    await sequelize.query(`
      UPDATE vacancy_assignments va
      SET accepted_at = va.updated_at::date
      WHERE va.status = 'Kabul edildi'
        AND va.deleted_at IS NULL
        AND va.accepted_at IS NOT NULL
        AND va.accepted_at < va.created_at::date
    `);
    // Göçürilen bazada «Kabul edildi» bar, ýöne closed_reason ýok — statistikany düzet
    const [backfillRows] = await sequelize.query(`
      UPDATE anketas a
      SET closed_reason = 'Biziň ýerleşdirenlerimiz',
          status = 'Isleyar'
      WHERE EXISTS (
        SELECT 1 FROM vacancy_assignments va
        WHERE va.anketa_id = a.id
          AND va.status = 'Kabul edildi'
          AND va.deleted_at IS NULL
      )
      AND (
        a.closed_reason IS NULL
        OR (
          a.closed_reason NOT ILIKE '%Biziň ýerleşdiren%'
          AND a.closed_reason NOT ILIKE '%bizin%yerlesdiren%'
        )
      )
      RETURNING a.id
    `);
    if (backfillRows?.length) {
      console.log(`Biziň ýerleşdirenler: ${backfillRows.length} anketa täzelendi (Kabul edildi → sebäp)`);
    }
    try {
      const optionListService = require('./services/optionListService');
      const assignItems = optionListService.getItems('assignment_statuses');
      if (!assignItems.some((x) => String(x).trim().toLowerCase() === 'kabul edilmedi')) {
        optionListService.addItem('assignment_statuses', 'Kabul edilmedi');
        console.log('Hödürleme ýagdaýlary: «Kabul edilmedi» goşuldy');
      }
    } catch (e) {
      console.warn('assignment_statuses täzelenmedi:', e?.message || e);
    }
    // Wezipe tertibi — diňe bir gezek (her açylyşda ähli anketany skanirleme)
    if (String(process.env.BACKFILL_DESIRED_POSITION || '0') === '1') {
      const { backfillDesiredPositionOrder } = require('./utils/desiredPositions');
      const { Anketa } = require('./models');
      await backfillDesiredPositionOrder({ Anketa });
    } else {
      console.log('Wezipe tertibi backfill geçirildi (BACKFILL_DESIRED_POSITION=1 bilen açyp bolýar)');
    }
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agency_fee_payments (
        id SERIAL PRIMARY KEY,
        anketa_id INTEGER NOT NULL REFERENCES anketas(id),
        amount NUMERIC(12, 2) NOT NULL,
        payment_date DATE NOT NULL,
        note VARCHAR(500),
        created_by_user_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS agency_fee_payments_anketa_id_idx
        ON agency_fee_payments (anketa_id);
      CREATE INDEX IF NOT EXISTS agency_fee_payments_payment_date_idx
        ON agency_fee_payments (payment_date);
    `);

    // Gözleg / sanaw tizligi — indeksler
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS anketas_status_idx ON anketas (status);
      CREATE INDEX IF NOT EXISTS anketas_form_date_idx ON anketas (form_date);
      CREATE INDEX IF NOT EXISTS anketas_created_at_idx ON anketas (created_at);
      CREATE INDEX IF NOT EXISTS anketas_employment_date_idx ON anketas (employment_date);
      CREATE INDEX IF NOT EXISTS anketas_desired_position_idx ON anketas (desired_position);
      CREATE INDEX IF NOT EXISTS anketas_phone_idx ON anketas (phone);
      CREATE INDEX IF NOT EXISTS anketas_status_created_idx ON anketas (status, created_at);

      CREATE INDEX IF NOT EXISTS vacancies_status_idx ON vacancies (status);
      CREATE INDEX IF NOT EXISTS vacancies_vacancy_date_idx ON vacancies (vacancy_date);
      CREATE INDEX IF NOT EXISTS vacancies_created_at_idx ON vacancies (created_at);
      CREATE INDEX IF NOT EXISTS vacancies_accepted_by_user_id_idx ON vacancies (accepted_by_user_id);
      CREATE INDEX IF NOT EXISTS vacancies_position_idx ON vacancies (position);
      CREATE INDEX IF NOT EXISTS vacancies_status_created_idx ON vacancies (status, created_at);

      CREATE INDEX IF NOT EXISTS vacancy_assignments_vacancy_id_idx ON vacancy_assignments (vacancy_id);
      CREATE INDEX IF NOT EXISTS vacancy_assignments_anketa_id_idx ON vacancy_assignments (anketa_id);
      CREATE INDEX IF NOT EXISTS vacancy_assignments_status_idx ON vacancy_assignments (status);
      CREATE INDEX IF NOT EXISTS vacancy_assignments_vacancy_status_idx ON vacancy_assignments (vacancy_id, status);
      CREATE INDEX IF NOT EXISTS vacancy_assignments_anketa_status_idx ON vacancy_assignments (anketa_id, status);
      CREATE INDEX IF NOT EXISTS vacancy_assignments_accepted_at_idx ON vacancy_assignments (accepted_at);
    `);
    console.log('Maglumat bazasy taýýar');

    // 3×4: diňe papka taýýarla — doly baglama HTTP-den soň (giriş haýalamaýar)
    try {
      const portrait = require('./services/anketaPortraitFolderService');
      const kiciRoot = portrait.ensureFolder();
      console.log(`3×4 papka: ${kiciRoot}`);
    } catch (e) {
      console.warn('3×4 papka:', e?.message || e);
    }

    const { ensureBootstrapUsers } = require('./services/bootstrapUsers');
    const boot = await ensureBootstrapUsers();
    if (boot.created) {
      console.log('Ilkinji ulanyjylar döredildi:');
      console.log('  Admin:    admin / admin123');
      console.log('  Operator: operator / operator123');
    }

    const httpServer = http.createServer(app);
    httpServer.listen(env.port, '0.0.0.0', () => {
      console.log(`HTTP  → http://localhost:${env.port}`);
      printUrls('http', env.port);

      // Surat baglama — diňe PHOTO_AUTOLINK=1 (başlangyç ýüklenmesini azaltýar)
      if (String(process.env.PHOTO_AUTOLINK || '0') === '1') {
        setTimeout(() => {
          (async () => {
            try {
              const portrait = require('./services/anketaPortraitFolderService');
              const linked = await portrait.autoLinkFromKiciFolder({
                relinkIfMissing: false,
                scanPc: false,
                skipNumbered: true,
              });
              console.log(
                `3×4 awto: baglandy ${linked.linked || 0}`
                + ` · № göçürildi ${linked.numberedCopied || 0}`
                + ` · uploads rezerv ${linked.numberedReserved || 0}`
                + ` / ${linked.filesTotal || 0} faýl (${linked.folderPath})`,
              );
            } catch (e) {
              console.warn('3×4 papka baglama:', e?.message || e);
            }
          })();
        }, 2500);
      } else {
        console.log('3×4 awto-baglama öçürilen (PHOTO_AUTOLINK=1 bilen açyp bolýar)');
      }
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${env.port} eýýäm ulanylýar.`);
      } else {
        console.error('HTTP ýalňyşlygy:', err.message);
      }
      process.exit(1);
    });

    // HTTPS — operatorlar başga PC-den kamera üçin (HTTPS_ENABLED=1)
    const httpsEnabled = String(process.env.HTTPS_ENABLED || '0') === '1';
    if (!httpsEnabled) {
      console.log('');
      console.log('Kamera: şu PC (localhost) — webkamera işleýär.');
      console.log('Başga PC: HTTP-de kamera ýapyk. HTTPS_ENABLED=1 ediň ýa-da «Faýldan saýla».');
      return;
    }

    try {
      const httpsOpts = loadHttpsOptions();
      const httpsPort = Number(process.env.HTTPS_PORT || 8443);
      const httpsServer = https.createServer(httpsOpts, app);
      httpsServer.listen(httpsPort, '0.0.0.0', () => {
        console.log('');
        console.log('=== Operatorlar / webkamera (HTTPS 8443) ===');
        console.log('Main: hemişelik LAN IP + firewall 8000/8443');
        console.log('Operator BIR GEZEK (HTTP — Advanced ýok):');
        console.log('  http://LAN_IP:8000/admin/trust-https.html');
        console.log('  → kerwen-https.cer göçür → Trusted Root');
        console.log('Soň hemişe (webcam):');
        console.log('  https://LAN_IP:8443/admin/login.html');
        printUrls('https', httpsPort);
      });
      httpsServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`HTTPS port ${httpsPort} eýýäm ulanylýar — HTTPS_PORT üýtgediň.`);
        } else {
          console.error('HTTPS ýalňyşlygy:', err.message);
        }
      });
    } catch (httpsErr) {
      console.error('HTTPS başladyrylmady (kamera tor IP-de işlemez):', httpsErr.message);
      console.error('HTTP dowam edýär. Sertifikat: certs/kerwen.pfx');
    }
  } catch (err) {
    console.error('Serwer başlatylyp bilinmedi:', err.message);
    process.exit(1);
  }
};

start();
