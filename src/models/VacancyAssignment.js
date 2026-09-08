const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VacancyAssignment = sequelize.define('VacancyAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  vacancyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'vacancy_id',
  },
  anketaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'anketa_id',
  },
  candidateName: {
    type: DataTypes.STRING(200),
    field: 'candidate_name',
  },
  status: {
    type: DataTypes.STRING(100),
    defaultValue: 'Hödürlendi',
  },
  assignedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'assigned_by_user_id',
  },
  notes: {
    type: DataTypes.TEXT,
  },
  acceptedAt: {
    type: DataTypes.DATEONLY,
    field: 'accepted_at',
  },
  leftAt: {
    type: DataTypes.DATEONLY,
    field: 'left_at',
  },
  salaryReceiveAt: {
    type: DataTypes.DATEONLY,
    field: 'salary_receive_at',
  },
}, {
  tableName: 'vacancy_assignments',
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    { name: 'vacancy_assignments_vacancy_id_idx', fields: ['vacancy_id'] },
    { name: 'vacancy_assignments_anketa_id_idx', fields: ['anketa_id'] },
    { name: 'vacancy_assignments_status_idx', fields: ['status'] },
    { name: 'vacancy_assignments_vacancy_status_idx', fields: ['vacancy_id', 'status'] },
    { name: 'vacancy_assignments_anketa_status_idx', fields: ['anketa_id', 'status'] },
    { name: 'vacancy_assignments_accepted_at_idx', fields: ['accepted_at'] },
  ],
});

module.exports = VacancyAssignment;
