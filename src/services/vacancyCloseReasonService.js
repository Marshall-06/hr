const optionListService = require('./optionListService');

/** Yza ynamsyzlyk — option-lists bilen işlenýär */
const DEFAULT_REASONS = optionListService.CATALOG.vacancy_close_reasons.defaults;

async function listCloseReasons() {
  return optionListService.getList('vacancy_close_reasons');
}

async function addCloseReason(reason) {
  return optionListService.addItem('vacancy_close_reasons', reason);
}

module.exports = {
  DEFAULT_REASONS,
  listCloseReasons,
  addCloseReason,
};
