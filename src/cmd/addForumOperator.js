require('dotenv').config();
const sequelize = require('../config/database');

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE vacancies
      ADD COLUMN IF NOT EXISTS accepted_by_user_id INTEGER,
      ADD COLUMN IF NOT EXISTS forum_operator VARCHAR(200);
    `);
    console.log('Forum operator sütüneri goşuldy');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

run();
