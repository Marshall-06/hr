/**
 * Find upload files not referenced by any anketa (safe orphan cleanup report).
 * Usage: node tools/find-orphan-uploads.js [--delete]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Anketa } = require('../src/models');

const UPLOADS = path.join(__dirname, '../public/uploads');
const TEMP = path.join(UPLOADS, '_photo_link_tmp');
const doDelete = process.argv.includes('--delete');

function collectRefs(anketas) {
  const refs = new Set();
  for (const a of anketas) {
    const add = (u) => {
      if (!u) return;
      const s = String(u).replace(/\\/g, '/');
      const base = path.basename(s.split('?')[0]);
      if (base) refs.add(base);
      // also relative path under uploads
      const m = s.match(/uploads\/([^?#]+)/i);
      if (m) refs.add(path.basename(m[1]));
    };
    add(a.photoUrl);
    const extra = a.extraData && typeof a.extraData === 'object' ? a.extraData : {};
    if (Array.isArray(extra.photos)) extra.photos.forEach(add);
    if (extra.photoUrl) add(extra.photoUrl);
    if (extra.scanUrl) add(extra.scanUrl);
    if (extra.scanFile) add(extra.scanFile);
  }
  return refs;
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.gitkeep') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === '_photo_link_tmp') continue; // handled separately
      walkFiles(full, acc);
    } else {
      acc.push({ full, name, size: st.size });
    }
  }
  return acc;
}

function mb(n) {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

(async () => {
  const anketas = await Anketa.findAll({
    attributes: ['id', 'anketaNumber', 'photoUrl', 'extraData'],
    raw: true,
  });
  const refs = collectRefs(anketas);
  const files = walkFiles(UPLOADS);
  const orphans = files.filter((f) => !refs.has(f.name));
  const used = files.filter((f) => refs.has(f.name));

  let tmpSize = 0;
  let tmpCount = 0;
  if (fs.existsSync(TEMP)) {
    for (const name of fs.readdirSync(TEMP)) {
      const full = path.join(TEMP, name);
      const st = fs.statSync(full);
      if (st.isFile()) {
        tmpSize += st.size;
        tmpCount += 1;
      }
    }
  }

  const orphanSize = orphans.reduce((s, f) => s + f.size, 0);
  const usedSize = used.reduce((s, f) => s + f.size, 0);

  console.log('Anketas:', anketas.length);
  console.log('Upload files (excl tmp):', files.length, 'MB:', mb(usedSize + orphanSize));
  console.log('Referenced:', used.length, 'MB:', mb(usedSize));
  console.log('Orphans:', orphans.length, 'MB:', mb(orphanSize));
  console.log('Temp _photo_link_tmp:', tmpCount, 'MB:', mb(tmpSize));
  console.log('Safe reclaimable (orphans+tmp):', mb(orphanSize + tmpSize), 'MB');

  if (orphans.length) {
    console.log('\nOrphan samples:');
    orphans.slice(0, 15).forEach((f) => console.log(' -', f.name, mb(f.size) + 'MB'));
  }

  if (doDelete) {
    let deleted = 0;
    let freed = 0;
    for (const f of orphans) {
      try {
        fs.unlinkSync(f.full);
        deleted += 1;
        freed += f.size;
      } catch (e) {
        console.error('fail', f.name, e.message);
      }
    }
    if (fs.existsSync(TEMP)) {
      for (const name of fs.readdirSync(TEMP)) {
        const full = path.join(TEMP, name);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            fs.unlinkSync(full);
            deleted += 1;
            freed += st.size;
          }
        } catch { /* ignore */ }
      }
    }
    console.log('\nDeleted:', deleted, 'files, freed MB:', mb(freed));
  } else {
    console.log('\nDry run. To delete orphans+tmp: node tools/find-orphan-uploads.js --delete');
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
