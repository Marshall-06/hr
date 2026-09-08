require('dotenv').config();
const sequelize = require('../config/database');
const { User } = require('../models');
const { hashPassword } = require('../middlewares/auth');

const seed = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });

    const adminPassword = await hashPassword('admin123');
    const operatorPassword = await hashPassword('operator123');

    const [admin] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        username: 'admin',
        password: adminPassword,
        fullName: 'Administrator',
        role: 'admin',
      },
    });
    await admin.update({ password: adminPassword, role: 'admin', isActive: true });

    const [operator] = await User.findOrCreate({
      where: { username: 'operator' },
      defaults: {
        username: 'operator',
        password: operatorPassword,
        fullName: 'Operator',
        role: 'operator',
      },
    });
    await operator.update({ password: operatorPassword, role: 'operator', isActive: true });

    console.log('Admin: admin / admin123');
    console.log('Operator: operator / operator123');
    process.exit(0);
  } catch (err) {
    console.error('Seed ýalňyşlygy:', err.message);
    process.exit(1);
  }
};

seed();
