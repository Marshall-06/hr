const optionListService = require('../services/optionListService');
const { asyncHandler, successResponse } = require('../utils/response');

const listAll = asyncHandler(async (req, res) => {
  successResponse(res, { lists: optionListService.listMeta() });
});

const getOne = asyncHandler(async (req, res) => {
  successResponse(res, optionListService.getList(req.params.key));
});

const replace = asyncHandler(async (req, res) => {
  const items = req.body?.items;
  successResponse(res, optionListService.setItems(req.params.key, items), 'Sanaw täzelendi');
});

const add = asyncHandler(async (req, res) => {
  const value = req.body?.value ?? req.body?.item ?? req.body?.reason;
  const data = optionListService.addItem(req.params.key, value);
  successResponse(res, data, data.alreadyExists ? 'Eýýäm bar' : 'Goşuldy', data.alreadyExists ? 200 : 201);
});

const update = asyncHandler(async (req, res) => {
  const from = req.body?.from ?? req.body?.oldValue;
  const to = req.body?.to ?? req.body?.newValue ?? req.body?.value;
  successResponse(res, optionListService.updateItem(req.params.key, from, to), 'Üýtgedildi');
});

const remove = asyncHandler(async (req, res) => {
  const value = req.body?.value ?? req.body?.item ?? req.query?.value;
  successResponse(res, optionListService.removeItem(req.params.key, value), 'Pozuldy');
});

const reset = asyncHandler(async (req, res) => {
  successResponse(res, optionListService.resetList(req.params.key), 'Deslapky ýagdaýa gaýtaryldy');
});

module.exports = {
  listAll,
  getOne,
  replace,
  add,
  update,
  remove,
  reset,
};
