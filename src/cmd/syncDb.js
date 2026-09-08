require('dotenv').config();
const sequelize = require('../config/database');
require('../models');

const sync = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: process.argv.includes('--force') });
    console.log('Maglumat bazasy üstünlikli sinhronlaşdyryldy');
    process.exit(0);
  } catch (err) {
    console.error('Sinhronlaşdyryş ýalňyşlygy:', err.message);
    process.exit(1);
  }
};

sync();
