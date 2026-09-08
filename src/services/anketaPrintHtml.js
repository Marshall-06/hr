/**
 * E-poçta goşundy üçin doly anketa HTML (anketa-view / anketa-print bilen deň format).
 */
const { buildAnketaPrintDocument, fullName, safeFileName } = require('../utils/anketaPrintRender');

function buildAnketaHtmlAttachment(anketa) {
  return buildAnketaPrintDocument(anketa);
}

module.exports = {
  buildAnketaHtmlAttachment,
  fullName,
  safeFileName,
};
