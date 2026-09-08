const contractService = require('../services/contractService');
const { getContractPrintData } = require('../utils/contractTemplate');
const { asyncHandler, successResponse } = require('../utils/response');

const getAll = asyncHandler(async (req, res) => {
  const result = await contractService.getAll(req.query);
  successResponse(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const contract = await contractService.getById(req.params.id);
  successResponse(res, contract);
});

const getPrintData = asyncHandler(async (req, res) => {
  const contract = await contractService.getById(req.params.id);
  const printData = getContractPrintData(contract, contract.anketa);
  successResponse(res, printData);
});

const createFromAnketa = asyncHandler(async (req, res) => {
  const contract = await contractService.createFromAnketa(req.params.anketaId, req.body);
  successResponse(res, contract, 'Şertnama döredildi', 201);
});

const update = asyncHandler(async (req, res) => {
  const contract = await contractService.update(req.params.id, req.body);
  successResponse(res, contract, 'Şertnama täzelendi');
});

const sign = asyncHandler(async (req, res) => {
  const contract = await contractService.sign(req.params.id);
  successResponse(res, contract, 'Şertnama gol çekildi');
});

const remove = asyncHandler(async (req, res) => {
  const result = await contractService.remove(req.params.id);
  successResponse(res, result);
});

module.exports = { getAll, getById, getPrintData, createFromAnketa, update, sign, remove };
