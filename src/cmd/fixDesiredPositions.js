require('dotenv').config();
const { Anketa } = require('../models');
const { backfillDesiredPositionOrder } = require('../utils/desiredPositions');

async function run() {
  const updated = await backfillDesiredPositionOrder({ Anketa });
  const total = await Anketa.count();
  console.log(`Wezipe tertibi düzedildi: ${updated} / ${total}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
