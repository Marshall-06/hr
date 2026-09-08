const vacancyService = require('../services/vacancyService');
const { asyncHandler, successResponse } = require('../utils/response');

const getAll = asyncHandler(async (req, res) => {
  const result = await vacancyService.getAll(req.query, req.user);
  successResponse(res, result);
});

const getPublic = asyncHandler(async (req, res) => {
  const result = await vacancyService.getPublic(req.query);
  successResponse(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const vacancy = await vacancyService.getById(req.params.id, req.user);
  successResponse(res, vacancy);
});

const create = asyncHandler(async (req, res) => {
  const vacancy = await vacancyService.create(req.body, req.user);
  successResponse(res, vacancy, 'Wakansiýa döredildi', 201);
});

const update = asyncHandler(async (req, res) => {
  const vacancy = await vacancyService.update(req.params.id, req.body, req.user);
  successResponse(res, vacancy, 'Wakansiýa täzelendi');
});

const remove = asyncHandler(async (req, res) => {
  const result = await vacancyService.remove(req.params.id, req.user);
  successResponse(res, result);
});

const assignCandidate = asyncHandler(async (req, res) => {
  const { anketaId, assignmentStatus, notes, comment } = req.body;
  const vacancy = await vacancyService.assignCandidate(
    req.params.id,
    anketaId,
    assignmentStatus,
    req.user,
    notes || comment || null,
  );
  successResponse(res, vacancy, 'Dalaşgär hödürlendi');
});

const listAssignments = asyncHandler(async (req, res) => {
  const result = await vacancyService.listAssignments(req.params.id, req.query);
  successResponse(res, result);
});

const listAllAssignments = asyncHandler(async (req, res) => {
  const result = await vacancyService.listAllAssignments(req.query, req.user);
  successResponse(res, result);
});

const listAssignmentsByAnketa = asyncHandler(async (req, res) => {
  const result = await vacancyService.listAssignmentsByAnketa(req.params.anketaId, req.user);
  successResponse(res, result);
});

const getAnketaAssignmentCounts = asyncHandler(async (req, res) => {
  const raw = String(req.query.ids || req.query.anketaIds || '').trim();
  const ids = raw ? raw.split(',').map((x) => Number(x.trim())).filter(Boolean) : [];
  const counts = await vacancyService.getAnketaAssignmentCounts(ids);
  successResponse(res, counts);
});

const updateAssignmentStatus = asyncHandler(async (req, res) => {
  const vacancy = await vacancyService.updateAssignmentStatus(req.params.id, req.body.assignmentStatus);
  successResponse(res, vacancy, 'Ugradyş ýagdaýy täzelendi');
});

const getDilHatyPrintData = asyncHandler(async (req, res) => {
  const data = await vacancyService.getDilHatyPrintData(req.params.assignmentId);
  successResponse(res, data);
});

const getDilHatyDocx = asyncHandler(async (req, res) => {
  const dilHatyDocxService = require('../services/dilHatyDocxService');
  const { buffer, data } = await dilHatyDocxService.generateDocxBuffer(req.params.assignmentId);
  const fileName = dilHatyDocxService.buildFileName(data);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(buffer);
});

const updateAssignmentById = asyncHandler(async (req, res) => {
  const item = await vacancyService.updateAssignmentById(
    req.params.assignmentId,
    req.body.assignmentStatus || req.body.status,
    req.user,
    {
      assignedByUserId: req.body.assignedByUserId,
      leftAt: req.body.leftAt,
      companyDirection: req.body.companyDirection,
      acceptedAt: req.body.acceptedAt,
      salaryReceiveAt: req.body.salaryReceiveAt,
    },
  );
  successResponse(res, item, 'Ugradyş täzelendi');
});

const sendCandidatesEmail = asyncHandler(async (req, res) => {
  const candidateMailService = require('../services/candidateMailService');
  const result = await candidateMailService.sendCandidatesToContact(
    req.params.id,
    {
      anketaIds: req.body.anketaIds || req.body.ids || [],
      to: req.body.to || req.body.email,
      note: req.body.note || req.body.message,
      scores: req.body.scores || {},
    },
    req.user,
  );
  const msg = result.mode === 'sent'
    ? `${result.count} dalaşgär e-poçta ugradyldy${result.assignedCount ? `, ${result.assignedCount} hödürlendi` : ''}`
    : 'E-poçta ugradylmady';
  successResponse(res, result, msg);
});

const prepareGmailCompose = asyncHandler(async (req, res) => {
  const candidateMailService = require('../services/candidateMailService');
  const result = await candidateMailService.prepareGmailCompose(
    req.params.id,
    {
      anketaIds: req.body.anketaIds || req.body.ids || [],
      to: req.body.to || req.body.email,
      note: req.body.note || req.body.message,
    },
    req.user,
  );
  successResponse(res, result, 'Gmail compose taýýar');
});

const downloadComposeAttachment = asyncHandler(async (req, res) => {
  const candidateMailService = require('../services/candidateMailService');
  const file = await candidateMailService.getComposeAttachment(
    req.params.id,
    req.params.anketaId,
  );
  res.setHeader('Content-Type', file.contentType || 'image/jpeg');
  const safeName = String(file.filename || 'anketa.jpg').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(file.content);
});

/** Köne ýol — täze: /api/mail/* */
const mailController = require('./mailController');
const mailStatus = mailController.status;
const mailLogin = mailController.login;
const mailLogout = mailController.logout;

const clearAssignment = asyncHandler(async (req, res) => {
  const vacancy = await vacancyService.clearAssignment(req.params.id, req.query.assignmentId || req.body.assignmentId);
  successResponse(res, vacancy, 'Hödürleme aýryldy');
});

const removeAssignment = asyncHandler(async (req, res) => {
  const result = await vacancyService.removeAssignment(req.params.assignmentId);
  successResponse(res, result, 'Hödürleme aýryldy');
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await vacancyService.getStats(req.user);
  successResponse(res, stats);
});

const getByOperator = asyncHandler(async (req, res) => {
  const stats = await vacancyService.getByOperatorStats();
  successResponse(res, stats);
});

const getCloseReasons = asyncHandler(async (req, res) => {
  const vacancyCloseReasonService = require('../services/vacancyCloseReasonService');
  const data = await vacancyCloseReasonService.listCloseReasons();
  successResponse(res, data);
});

const addCloseReason = asyncHandler(async (req, res) => {
  const vacancyCloseReasonService = require('../services/vacancyCloseReasonService');
  const data = await vacancyCloseReasonService.addCloseReason(req.body?.reason || req.body?.closeReason);
  successResponse(
    res,
    data,
    data.alreadyExists ? 'Bu sebäp eýýäm bar' : 'Sebäp goşuldy',
    data.alreadyExists ? 200 : 201,
  );
});

module.exports = {
  getAll,
  getPublic,
  getById,
  create,
  update,
  remove,
  assignCandidate,
  listAssignments,
  listAllAssignments,
  listAssignmentsByAnketa,
  getAnketaAssignmentCounts,
  getDilHatyPrintData,
  getDilHatyDocx,
  updateAssignmentStatus,
  updateAssignmentById,
  clearAssignment,
  removeAssignment,
  getStats,
  getByOperator,
  getCloseReasons,
  addCloseReason,
  sendCandidatesEmail,
  prepareGmailCompose,
  downloadComposeAttachment,
  mailStatus,
  mailLogin,
  mailLogout,
};
