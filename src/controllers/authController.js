const authService = require('../services/authService');
const { asyncHandler, successResponse } = require('../utils/response');

const setupStatus = asyncHandler(async (req, res) => {
  const status = await authService.getSetupStatus();
  successResponse(res, status);
});

const bootstrap = asyncHandler(async (req, res) => {
  const result = await authService.bootstrapAdmin(req.body || {});
  successResponse(res, result, result.message || 'Ilkinji admin döredildi', 201);
});

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login(username, password);
  successResponse(res, result, 'Üstünlikli girdiňiz');
});

const profile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  successResponse(res, user);
});

const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createUser(req.body);
  successResponse(res, user, 'Ulanyjy döredildi', 201);
});

const listStaff = asyncHandler(async (req, res) => {
  const users = await authService.listStaff(req.query);
  successResponse(res, users);
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await authService.listUsers(req.query);
  successResponse(res, users);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.params.id);
  successResponse(res, user);
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await authService.updateUser(req.params.id, req.body, req.user.id);
  successResponse(res, user, 'Ulanyjy täzelendi');
});

const deleteUser = asyncHandler(async (req, res) => {
  const result = await authService.deleteUser(req.params.id, req.user.id);
  successResponse(res, result);
});

module.exports = {
  setupStatus,
  bootstrap,
  login,
  profile,
  createUser,
  listStaff,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
};
