const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  entityType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'entity_type',
    validate: {
      isIn: [['anketa', 'vacancy', 'assignment']],
    },
  },
  entityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'entity_id',
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  createdByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by_user_id',
  },
}, {
  tableName: 'comments',
  updatedAt: false,
  indexes: [
    { fields: ['entity_type', 'entity_id', 'created_at'] },
  ],
});

module.exports = Comment;
