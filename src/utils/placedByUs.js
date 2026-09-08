const { Op } = require('sequelize');

const PLACED_BY_US_REASON = 'Biziň ýerleşdirenlerimiz';
const SELF_PLACED_REASON = 'Özi işe ýerleşenler';

/** Türkmen harplaryny ASCII-de deňeşdirmek üçin */
function normalizeTmText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ý/g, 'y')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ň/g, 'n')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlacedByUsReason(closedReason) {
  const n = normalizeTmText(closedReason);
  return n.includes('bizin yerlesdiren');
}

function isSelfPlacedReason(closedReason) {
  const n = normalizeTmText(closedReason);
  return n.includes('ozi ise yerles') || n.includes('ozi yerles');
}

/** Excel reňk ýok bolsa — sebäp tekstinden belgi */
function placementMarkFromReason(closedReason) {
  if (isPlacedByUsReason(closedReason)) return 'us';
  if (isSelfPlacedReason(closedReason)) return 'self';
  return null;
}

function isAcceptedAssignmentStatus(status) {
  return String(status || '').trim() === 'Kabul edildi';
}

/** Sequelize where — ýapylma sebäbi boýunça biziň ýerleşdirenler */
function placedByUsReasonWhere() {
  return {
    [Op.or]: [
      { closedReason: PLACED_BY_US_REASON },
      { closedReason: { [Op.iLike]: '%Biziň ýerleşdiren%' } },
      { closedReason: { [Op.iLike]: '%bizin%yerlesdiren%' } },
    ],
  };
}

module.exports = {
  PLACED_BY_US_REASON,
  SELF_PLACED_REASON,
  normalizeTmText,
  isPlacedByUsReason,
  isSelfPlacedReason,
  placementMarkFromReason,
  isAcceptedAssignmentStatus,
  placedByUsReasonWhere,
};
