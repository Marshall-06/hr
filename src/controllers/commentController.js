const commentService = require('../services/commentService');
const { asyncHandler, successResponse } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const result = await commentService.list(req.query.entityType, req.query.entityId, req.query.limit);
  successResponse(res, result);
});

const create = asyncHandler(async (req, res) => {
  const item = await commentService.create(req.body, req.user);
  successResponse(res, item, 'Komentariýa goşuldy', 201);
});

const remove = asyncHandler(async (req, res) => {
  const result = await commentService.remove(req.params.id, req.user);
  successResponse(res, result, 'Komentariýa pozuldy');
});

module.exports = { list, create, remove };
