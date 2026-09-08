#!/usr/bin/env node
/**
 * Anketa № boýunça 3×4 surat berkidiň (görkeziş skany üçin gerek däl).
 *
 *   node src/cmd/linkAnketaPhotos.js --dir="D:\suratlar"
 *   node src/cmd/linkAnketaPhotos.js --dir="D:\suratlar" --dry
 *   node src/cmd/linkAnketaPhotos.js --dir="D:\suratlar" --overwrite
 */
require('dotenv').config();
const path = require('path');
const { sequelize } = require('../config/database');
const { linkPhotosFromFolder } = require('../services/linkAnketaPhotosService');

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  return true;
}

async function main() {
  const dir = arg('dir') || arg('folder');
  if (!dir || dir === true) {
    console.error('Ulanyş: node src/cmd/linkAnketaPhotos.js --dir="C:\\suratlar" [--dry] [--overwrite]');
    process.exit(1);
  }
  const dryRun = Boolean(arg('dry'));
  const overwrite = Boolean(arg('overwrite'));
  const folderPath = path.resolve(String(dir));

  console.log('Papka:', folderPath);
  console.log(dryRun ? 'Synag (ýazylmaýar)' : 'Berkitme');

  await sequelize.authenticate();
  const r = await linkPhotosFromFolder({
    folderPath,
    dryRun,
    overwrite,
    crop3x4: true,
    extractFromScan: true,
  });

  console.log('Faýl:', r.filesTotal);
  console.log('Berkidilen / gabat:', r.linked);
  console.log('Tapylmady:', r.unmatched);
  console.log('Birnäçe:', r.ambiguous);
  console.log('Ýalňyşlyk:', r.errors);
  if (r.samples.linked?.length) {
    console.log('Mysal:', JSON.stringify(r.samples.linked[0], null, 2));
  }
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
