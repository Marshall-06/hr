require('dotenv').config();
const sequelize = require('../config/database');

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE users ALTER COLUMN role DROP DEFAULT');
    await sequelize.query("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::text");
    await sequelize.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'operator'");
    await sequelize.query('DROP TYPE IF EXISTS "enum_users_role"');
    console.log('users.role VARCHAR boldy');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
