const User = require('./User');
const Anketa = require('./Anketa');
const Vacancy = require('./Vacancy');
const Contract = require('./Contract');
const VacancyAssignment = require('./VacancyAssignment');
const Comment = require('./Comment');
const AgencyFeePayment = require('./AgencyFeePayment');

Anketa.hasMany(Contract, { foreignKey: 'anketaId', as: 'contracts' });
Contract.belongsTo(Anketa, { foreignKey: 'anketaId', as: 'anketa' });

Anketa.hasMany(Vacancy, { foreignKey: 'assignedAnketaId', as: 'assignedVacancies' });
Vacancy.belongsTo(Anketa, { foreignKey: 'assignedAnketaId', as: 'assignedAnketa' });

Anketa.hasMany(Vacancy, { foreignKey: 'contactAnketaId', as: 'contactVacancies' });
Vacancy.belongsTo(Anketa, { foreignKey: 'contactAnketaId', as: 'contactAnketa' });

User.hasMany(Vacancy, { foreignKey: 'acceptedByUserId', as: 'acceptedVacancies' });
Vacancy.belongsTo(User, { foreignKey: 'acceptedByUserId', as: 'acceptedBy' });

Vacancy.hasMany(VacancyAssignment, { foreignKey: 'vacancyId', as: 'assignments' });
VacancyAssignment.belongsTo(Vacancy, { foreignKey: 'vacancyId', as: 'vacancy' });

Anketa.hasMany(VacancyAssignment, { foreignKey: 'anketaId', as: 'vacancyAssignments' });
VacancyAssignment.belongsTo(Anketa, { foreignKey: 'anketaId', as: 'anketa' });

User.hasMany(VacancyAssignment, { foreignKey: 'assignedByUserId', as: 'madeAssignments' });
VacancyAssignment.belongsTo(User, { foreignKey: 'assignedByUserId', as: 'assignedBy' });

User.hasMany(Comment, { foreignKey: 'createdByUserId', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'createdByUserId', as: 'author' });

Anketa.hasMany(AgencyFeePayment, { foreignKey: 'anketaId', as: 'feePayments' });
AgencyFeePayment.belongsTo(Anketa, { foreignKey: 'anketaId', as: 'anketa' });

User.hasMany(AgencyFeePayment, { foreignKey: 'createdByUserId', as: 'feePaymentsCreated' });
AgencyFeePayment.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });

module.exports = {
  User,
  Anketa,
  Vacancy,
  Contract,
  VacancyAssignment,
  Comment,
  AgencyFeePayment,
};
