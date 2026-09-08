require('dotenv').config();
const sequelize = require('../config/database');

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE anketas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);
    console.log('Soft delete (deleted_at) sütüneri goşuldy: anketas, vacancies, contracts, users');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

run();
