const matchService = require('../services/matchService');
const { asyncHandler, successResponse } = require('../utils/response');

const forVacancy = asyncHandler(async (req, res) => {
  const minScore = req.query.minScore != null ? parseInt(req.query.minScore, 10) : 15;
  const status = req.query.status || 'Islanok';
  const limit = parseInt(req.query.limit, 10) || 50;
  const result = await matchService.matchForVacancy(
    req.params.vacancyId,
    minScore,
    status,
    { limit, currentUser: req.user },
  );
  successResponse(res, result);
});

const forAnketa = asyncHandler(async (req, res) => {
  // minScore=0 → anyk wezipe gabat gelýänleriň hemmesi
  const minScore = req.query.minScore != null ? parseInt(req.query.minScore, 10) : 0;
  const limit = parseInt(req.query.limit, 10) || 80;
  const vacancyStatus = req.query.vacancyStatus || req.query.status || 'Acyk';
  const result = await matchService.matchForAnketa(req.params.anketaId, minScore, {
    limit,
    vacancyStatus,
    currentUser: req.user,
  });
  successResponse(res, result);
});

const recommend = asyncHandler(async (req, res) => {
  const result = await matchService.recommendAll(
    parseInt(req.query.limit, 10) || 20,
    req.user,
  );
  successResponse(res, result);
});

module.exports = { forVacancy, forAnketa, recommend };
