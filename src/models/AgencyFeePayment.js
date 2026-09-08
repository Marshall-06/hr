const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Işe ýerleşdirilen anketadan agentstwa 50% töleg — bölek-bölek ýazgylar */
const AgencyFeePayment = sequelize.define('AgencyFeePayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  anketaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'anketa_id',
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  paymentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'payment_date',
  },
  note: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by_user_id',
  },
}, {
  tableName: 'agency_fee_payments',
  updatedAt: false,
  indexes: [
    { fields: ['anketa_id'] },
    { fields: ['payment_date'] },
  ],
});

module.exports = AgencyFeePayment;
