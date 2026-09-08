/** Hödürleme ýagdaýlary — backend + sanawlar üçin ortak */

const ASSIGNMENT_STATUS = {
  OFFERED: 'Hödürlendi',
  SENT: 'Ugradyldy',
  WILL_COME: 'Barjak diýdi',
  ACCEPTED: 'Kabul edildi',
  REJECTED_BY_THEM: 'Olar atkaz etdiler',
  REJECTED: 'Kabul edilmedi',
  SELF_WITHDREW: 'Özi otkaz etdi',
  LEFT_JOB: 'Işden çykdy',
};

const DEFAULT_ASSIGNMENT_STATUSES = [
  ASSIGNMENT_STATUS.OFFERED,
  ASSIGNMENT_STATUS.SENT,
  ASSIGNMENT_STATUS.WILL_COME,
  ASSIGNMENT_STATUS.ACCEPTED,
  ASSIGNMENT_STATUS.REJECTED_BY_THEM,
  ASSIGNMENT_STATUS.REJECTED,
  ASSIGNMENT_STATUS.SELF_WITHDREW,
  ASSIGNMENT_STATUS.LEFT_JOB,
];

/** Aktiv hödürleme hasabyndan çykarylýar */
const INACTIVE_ASSIGNMENT_STATUSES = [
  ASSIGNMENT_STATUS.REJECTED_BY_THEM,
  ASSIGNMENT_STATUS.ACCEPTED,
  ASSIGNMENT_STATUS.REJECTED,
  ASSIGNMENT_STATUS.SELF_WITHDREW,
  ASSIGNMENT_STATUS.LEFT_JOB,
];

function normalizeAssignmentStatus(status) {
  return String(status || '').trim();
}

function isAcceptedAssignmentStatus(status) {
  return normalizeAssignmentStatus(status) === ASSIGNMENT_STATUS.ACCEPTED;
}

function isActiveAssignmentStatus(status) {
  return !INACTIVE_ASSIGNMENT_STATUSES.includes(normalizeAssignmentStatus(status));
}

function isRejectedAssignmentStatus(status) {
  const s = normalizeAssignmentStatus(status);
  return s === ASSIGNMENT_STATUS.REJECTED
    || s === ASSIGNMENT_STATUS.REJECTED_BY_THEM
    || s === ASSIGNMENT_STATUS.SELF_WITHDREW
    || s === ASSIGNMENT_STATUS.LEFT_JOB;
}

module.exports = {
  ASSIGNMENT_STATUS,
  DEFAULT_ASSIGNMENT_STATUSES,
  INACTIVE_ASSIGNMENT_STATUSES,
  normalizeAssignmentStatus,
  isAcceptedAssignmentStatus,
  isActiveAssignmentStatus,
  isRejectedAssignmentStatus,
};
