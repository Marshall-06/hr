const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { parseJsonValue } = require('../utils/jsonParse');

const Anketa = sequelize.define('Anketa', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  anketaNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'anketa_number',
  },
  formDate: {
    type: DataTypes.DATEONLY,
    field: 'form_date',
  },
  desiredPosition: {
    type: DataTypes.STRING(500),
    field: 'desired_position',
  },
  familyName: {
    type: DataTypes.STRING(100),
    field: 'family_name',
  },
  firstName: {
    type: DataTypes.STRING(100),
    field: 'first_name',
  },
  patronymic: {
    type: DataTypes.STRING(100),
  },
  birthYear: {
    type: DataTypes.INTEGER,
    field: 'birth_year',
  },
  birthPlace: {
    type: DataTypes.TEXT,
    field: 'birth_place',
  },
  gender: {
    type: DataTypes.ENUM('Erkek', 'Ayal', 'Gyz'),
  },
  phone: {
    type: DataTypes.STRING(50),
  },
  email: {
    type: DataTypes.STRING(150),
  },
  registrationCity: {
    type: DataTypes.STRING(150),
    field: 'registration_city',
  },
  registrationAddress: {
    type: DataTypes.TEXT,
    field: 'registration_address',
  },
  currentAddress: {
    type: DataTypes.TEXT,
    field: 'current_address',
  },
  nationality: {
    type: DataTypes.STRING(100),
  },
  maritalStatus: {
    type: DataTypes.STRING(100),
    field: 'marital_status',
  },
  educationLevel: {
    type: DataTypes.STRING(100),
    field: 'education_level',
  },
  educationDetails: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'education_details',
    get() { return parseJsonValue(this.getDataValue('educationDetails'), []); },
  },
  workExperience: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'work_experience',
    get() { return parseJsonValue(this.getDataValue('workExperience'), []); },
  },
  languages: {
    type: DataTypes.JSONB,
    defaultValue: [],
    get() { return parseJsonValue(this.getDataValue('languages'), []); },
  },
  computerSkills: {
    type: DataTypes.JSONB,
    defaultValue: [],
    get() { return parseJsonValue(this.getDataValue('computerSkills'), []); },
    field: 'computer_skills',
  },
  drivingLicense: {
    type: DataTypes.STRING(50),
    field: 'driving_license',
  },
  hasCar: {
    type: DataTypes.STRING(100),
    field: 'has_car',
  },
  militaryService: {
    type: DataTypes.STRING(50),
    field: 'military_service',
  },
  willingToRelocate: {
    type: DataTypes.STRING(20),
    field: 'willing_to_relocate',
  },
  partTimeWork: {
    type: DataTypes.STRING(20),
    field: 'part_time_work',
  },
  workSchedule: {
    type: DataTypes.STRING(100),
    field: 'work_schedule',
  },
  currentSalary: {
    type: DataTypes.STRING(100),
    field: 'current_salary',
  },
  status: {
    type: DataTypes.ENUM('Isleyar', 'Islanok'),
    defaultValue: 'Islanok',
  },
  employmentDate: {
    type: DataTypes.DATEONLY,
    field: 'employment_date',
  },
  statusChangedAt: {
    type: DataTypes.DATE,
    field: 'status_changed_at',
    comment: 'Ýagdaý üýtgedilen / ýapylan wagt',
  },
  closedReason: {
    type: DataTypes.STRING(200),
    field: 'closed_reason',
  },
  photoUrl: {
    type: DataTypes.STRING(500),
    field: 'photo_url',
  },
  passportNumber: {
    type: DataTypes.STRING(100),
    field: 'passport_number',
  },
  passportIssued: {
    type: DataTypes.STRING(300),
    field: 'passport_issued',
  },
  extraData: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'extra_data',
    get() { return parseJsonValue(this.getDataValue('extraData'), {}); },
  },
  notes: {
    type: DataTypes.TEXT,
  },
}, {
  tableName: 'anketas',
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    {
      name: 'anketas_anketa_number_idx',
      fields: ['anketa_number'],
    },
    { name: 'anketas_status_idx', fields: ['status'] },
    { name: 'anketas_form_date_idx', fields: ['form_date'] },
    { name: 'anketas_created_at_idx', fields: ['created_at'] },
    { name: 'anketas_employment_date_idx', fields: ['employment_date'] },
    { name: 'anketas_desired_position_idx', fields: ['desired_position'] },
    { name: 'anketas_phone_idx', fields: ['phone'] },
    { name: 'anketas_status_created_idx', fields: ['status', 'created_at'] },
  ],
});

module.exports = Anketa;
