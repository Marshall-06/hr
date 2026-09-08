const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fullName: {
    type: DataTypes.STRING(200),
    field: 'full_name',
  },
  role: {
    type: DataTypes.STRING(20),
    defaultValue: 'operator',
    validate: {
      isIn: [['admin', 'operator']],
    },
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  canDeleteAnketa: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'can_delete_anketa',
  },
}, {
  tableName: 'users',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = User;
