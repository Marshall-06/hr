const reportService = require('../services/reportService');
const { asyncHandler, successResponse } = require('../utils/response');

const overview = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.overview());
});

const anketas = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.anketasByPeriod(req.query.from, req.query.to));
});

const vacancies = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.vacanciesByPeriod(req.query.from, req.query.to));
});

const employed = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.employedReport(req.query.from, req.query.to));
});

const contracts = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.contractsReport(req.query.from, req.query.to));
});

const byPosition = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.byPosition());
});

const byPositionDetails = asyncHandler(async (req, res) => {
  successResponse(
    res,
    await reportService.byPositionDetails(req.query.position || '', req.query.status || ''),
  );
});

const anketasByStatus = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.anketasByStatus(req.query.status || ''));
});

const analytics = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.analytics({
    period: req.query.period || 'month',
    date: req.query.date || '',
    from: req.query.from || '',
    to: req.query.to || '',
  }));
});

const latestAnchor = asyncHandler(async (req, res) => {
  successResponse(res, await reportService.latestActivityDate());
});

module.exports = {
  overview,
  anketas,
  vacancies,
  employed,
  contracts,
  byPosition,
  byPositionDetails,
  anketasByStatus,
  analytics,
  latestAnchor,
};
