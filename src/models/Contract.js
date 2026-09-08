const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contract = sequelize.define('Contract', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  contractNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'contract_number',
  },
  contractDate: {
    type: DataTypes.DATEONLY,
    field: 'contract_date',
  },
  anketaId: {
    type: DataTypes.INTEGER,
    field: 'anketa_id',
  },
  jobSeekerName: {
    type: DataTypes.STRING(300),
    field: 'job_seeker_name',
  },
  jobSeekerDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'job_seeker_details',
  },
  executorName: {
    type: DataTypes.STRING(300),
    field: 'executor_name',
  },
  executorDirector: {
    type: DataTypes.STRING(300),
    field: 'executor_director',
  },
  content: {
    type: DataTypes.TEXT,
  },
  status: {
    type: DataTypes.ENUM('Taslama', 'Gol cekildi', 'Yatyryldy'),
    defaultValue: 'Taslama',
  },
  signedAt: {
    type: DataTypes.DATE,
    field: 'signed_at',
  },
  serviceFeePercent: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    field: 'service_fee_percent',
  },
}, {
  tableName: 'contracts',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Contract;
