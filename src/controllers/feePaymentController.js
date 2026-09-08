const feePaymentService = require('../services/feePaymentService');
const { asyncHandler, successResponse } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const result = await feePaymentService.list(req.query);
  successResponse(res, result);
});

const getByAnketa = asyncHandler(async (req, res) => {
  const result = await feePaymentService.getByAnketa(req.params.anketaId);
  successResponse(res, result);
});

const addPayment = asyncHandler(async (req, res) => {
  const result = await feePaymentService.addPayment(req.params.anketaId, req.body, req.user);
  successResponse(res, result, 'Töleg ýazyldy', 201);
});

const removePayment = asyncHandler(async (req, res) => {
  const result = await feePaymentService.removePayment(req.params.id, req.user);
  successResponse(res, result, 'Töleg pozuldy');
});

module.exports = { list, getByAnketa, addPayment, removePayment };
