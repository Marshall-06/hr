const mailService = require('../services/mailService');
const { asyncHandler, successResponse } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const status = asyncHandler(async (req, res) => {
  successResponse(res, mailService.getStatus());
});

/** Diňe admin kompaniýa Gmail + App Password saklap biler */
const login = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError(403, 'Poçta sazlamasy diňe admin üçin. Operatorlar taýýar poçtadan ugradýar.');
  }
  const result = await mailService.loginAndVerify({
    email: req.body.email || req.body.user || req.body.gmail,
    password: req.body.password || req.body.pass || req.body.appPassword,
  });
  successResponse(res, result, 'Gmail birikdirildi — indi ähli operatorlar Ugrat bilen ugradyp bilýär');
});

const logout = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError(403, 'Poçta sazlamasy diňe admin üçin');
  }
  mailService.clearSavedLogin();
  mailService.resetTransporter();
  successResponse(res, mailService.getStatus(), 'Gmail çykaryldy');
});

module.exports = { status, login, logout };
