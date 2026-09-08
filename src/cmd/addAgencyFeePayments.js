require('dotenv').config();
const sequelize = require('../config/database');

const run = async () => {
  try {
    await sequelize.authenticate();
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
    console.log('agency_fee_payments taýýar');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
