/**
 * Ulanyjy ýok bolsa — ilkinji admin/operator döredýär.
 * El bilen: npm run db:seed
 * Swagger: POST /api/auth/bootstrap (diňe DB boş bolsa)
 */
const { User } = require('../models');
const { hashPassword } = require('../middlewares/auth');

async function ensureBootstrapUsers() {
  const count = await User.count();
  if (count > 0) return { created: false, count };

  const adminPassword = await hashPassword('admin123');
  const operatorPassword = await hashPassword('operator123');

  await User.create({
    username: 'admin',
    password: adminPassword,
    fullName: 'Administrator',
    role: 'admin',
    isActive: true,
  });
  await User.create({
    username: 'operator',
    password: operatorPassword,
    fullName: 'Operator',
    role: 'operator',
    isActive: true,
  });

  return { created: true, count: 2 };
}

module.exports = { ensureBootstrapUsers };
