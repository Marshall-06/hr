const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vacancy = sequelize.define('Vacancy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  vacancyNumber: {
    type: DataTypes.INTEGER,
    field: 'vacancy_number',
  },
  vacancyDate: {
    type: DataTypes.DATEONLY,
    field: 'vacancy_date',
  },
  status: {
    type: DataTypes.ENUM('Acyk', 'Yapyk'),
    defaultValue: 'Acyk',
  },
  closeReason: {
    type: DataTypes.STRING(200),
    field: 'close_reason',
  },
  companyName: {
    type: DataTypes.STRING(300),
    field: 'company_name',
  },
  position: {
    type: DataTypes.STRING(200),
  },
  salary: {
    type: DataTypes.STRING(100),
  },
  jobDescription: {
    type: DataTypes.TEXT,
    field: 'job_description',
  },
  location: {
    type: DataTypes.TEXT,
  },
  experience: {
    type: DataTypes.STRING(100),
  },
  education: {
    type: DataTypes.STRING(100),
  },
  languages: {
    type: DataTypes.STRING(200),
  },
  computerPrograms: {
    type: DataTypes.STRING(300),
    field: 'computer_programs',
  },
  ageRange: {
    type: DataTypes.STRING(50),
    field: 'age_range',
  },
  registration: {
    type: DataTypes.STRING(100),
  },
  gender: {
    type: DataTypes.STRING(50),
  },
  workHours: {
    type: DataTypes.STRING(100),
    field: 'work_hours',
  },
  dayOff: {
    type: DataTypes.STRING(100),
    field: 'day_off',
  },
  services: {
    type: DataTypes.STRING(100),
  },
  accommodation: {
    type: DataTypes.STRING(100),
  },
  companyDirection: {
    type: DataTypes.STRING(100),
    field: 'company_direction',
  },
  workersNeeded: {
    type: DataTypes.STRING(50),
    field: 'workers_needed',
  },
  contactPhone: {
    type: DataTypes.STRING(500),
    field: 'contact_phone',
  },
  contactName: {
    type: DataTypes.STRING(500),
    field: 'contact_name',
  },
  contactEmail: {
    type: DataTypes.STRING(500),
    field: 'contact_email',
  },
  contactAnketaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'contact_anketa_id',
  },
  assignedAnketaId: {
    type: DataTypes.INTEGER,
    field: 'assigned_anketa_id',
  },
  assignedCandidateName: {
    type: DataTypes.STRING(200),
    field: 'assigned_candidate_name',
  },
  assignmentStatus: {
    type: DataTypes.STRING(100),
    field: 'assignment_status',
  },
  acceptedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'accepted_by_user_id',
  },
  forumOperator: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'forum_operator',
  },
  extraData: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'extra_data',
  },
}, {
  tableName: 'vacancies',
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    { name: 'vacancies_status_idx', fields: ['status'] },
    { name: 'vacancies_vacancy_date_idx', fields: ['vacancy_date'] },
    { name: 'vacancies_created_at_idx', fields: ['created_at'] },
    { name: 'vacancies_accepted_by_user_id_idx', fields: ['accepted_by_user_id'] },
    { name: 'vacancies_position_idx', fields: ['position'] },
    { name: 'vacancies_status_created_idx', fields: ['status', 'created_at'] },
  ],
});

module.exports = Vacancy;
