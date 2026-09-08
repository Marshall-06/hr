const { normalizeKey } = require('./excel');

function splitDesiredPositionList(raw) {
  return String(raw || '')
    .split(/\s*\/\s*|\r?\n+|[,;|]+|\s+we\s+|\s+hem\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function uniqueDesiredPositions(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((p) => {
    const s = String(p || '').trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  return out;
}

/** Sütün indeksi — Object.keys tertibi (Excel çepden saga) */
function buildOrderedKeyIndex(row) {
  const entries = [];
  let colIdx = 0;
  Object.keys(row || {}).forEach((origKey) => {
    if (!origKey || origKey === '_placementMark' || origKey.startsWith('_placement')) return;
    entries.push({
      nk: normalizeKey(origKey),
      orig: origKey,
      val: row[origKey],
      colIdx,
    });
    colIdx += 1;
  });
  return entries;
}

function isWorkExperienceWezipeKey(nk) {
  return /^iswezipesi\d*$/.test(nk)
    || /^islanwezipe/.test(nk)
    || /^islanwezipesi/.test(nk)
    || /^onkiwezipe/.test(nk)
    || /^onkwezipesi/.test(nk)
    || /^wezipe(?:si)?tejribe/.test(nk)
    || /^istejribe/.test(nk);
}

function isEmptyExcelHeaderKey(nk) {
  return !nk || /^empty\d*$/.test(nk);
}

function parseWezipeSlot(nk) {
  if (!nk || isWorkExperienceWezipeKey(nk) || isEmptyExcelHeaderKey(nk)) return undefined;

  const numbered = nk.match(/^(?:dalasgar)?wezipesi(\d+)$/)
    || nk.match(/^wezipe(?:si)?(\d+)$/)
    || nk.match(/^desiredposition(\d+)$/)
    || nk.match(/^(?:gozlenyan|talap|dalasgar).*wezipesi(\d+)$/)
    || nk.match(/^(\d+)(?:nji|nci|nji)?wezipe(?:si)?$/);
  if (numbered) {
    const slot = parseInt(numbered[1], 10);
    return Number.isFinite(slot) && slot > 0 ? slot : undefined;
  }

  if (
    nk === 'wezipesi'
    || nk === 'wezipe'
    || nk === 'desiredposition'
    || nk === 'dalasgarwezipesi'
    || nk === 'dalasgarwezipe'
    || (/wezipesi$/.test(nk) && !isWorkExperienceWezipeKey(nk))
  ) {
    return null;
  }
  return undefined;
}

/**
 * Excel wezipe sütünerini 1 → 2 → 3 tertipde al
 * (WEZIPESI / WEZIPESI 2 / WEZIPESI 3 ýa-da birmeňzeş başlyklar).
 */
function collectDesiredPositionsOrdered(row, keyIndex = null) {
  const entries = Array.isArray(keyIndex) ? keyIndex : buildOrderedKeyIndex(row);
  const parts = [];
  const seen = new Set();
  const addVal = (value) => {
    splitDesiredPositionList(value).forEach((p) => {
      const k = p.toLowerCase();
      if (!p || seen.has(k)) return;
      seen.add(k);
      parts.push(p);
    });
  };

  const STOP_NEXT = /^(familiyasy|familiya|ady|atasy|firstname|telefon|sene|anketa|jynsy|doglan|pasport|email)/;
  entries.forEach((e, idx) => {
    if (isWorkExperienceWezipeKey(e.nk)) return;
    const isWezipeCol = parseWezipeSlot(e.nk) !== undefined
      || (e.nk.includes('wezipe') && !isWorkExperienceWezipeKey(e.nk));
    if (!isWezipeCol) return;
    addVal(e.val);
    for (let j = idx + 1; j < entries.length && j <= idx + 5; j += 1) {
      const n = entries[j];
      if (isWorkExperienceWezipeKey(n.nk)) break;
      if (STOP_NEXT.test(n.nk)) break;
      const nextWezipe = parseWezipeSlot(n.nk) !== undefined
        || (n.nk.includes('wezipe') && !isWorkExperienceWezipeKey(n.nk));
      if (nextWezipe) break;
      if (!isEmptyExcelHeaderKey(n.nk) && !/^\d+$/.test(n.nk)) break;
      addVal(n.val);
    }
  });
  return parts.slice(0, 8);
}

/** Excel / API payload-dan tertibli wezipe sanawy */
function extractOrderedPositions(payload = {}) {
  let extra = payload.extraData;
  if (typeof extra === 'string') {
    try { extra = JSON.parse(extra); } catch { extra = {}; }
  }
  if (!extra || typeof extra !== 'object') extra = {};
  const fromExtra = Array.isArray(extra.desiredPositions)
    ? extra.desiredPositions.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const fromField = splitDesiredPositionList(payload.desiredPosition);
  if (fromField.length > fromExtra.length) return uniqueDesiredPositions(fromField);
  if (fromExtra.length) return uniqueDesiredPositions(fromExtra);
  return uniqueDesiredPositions(fromField);
}

/**
 * desiredPosition meýdanyndaky « / » tertibini esasy al
 * (extraData.desiredPositions ýalňyş bolsa düzedýär).
 */
function reconcileDesiredPositions(desiredPosition, extraData = null) {
  const extra = extraData && typeof extraData === 'object' ? { ...extraData } : {};
  const fromField = splitDesiredPositionList(desiredPosition);
  const fromExtra = Array.isArray(extra.desiredPositions)
    ? extra.desiredPositions.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  let list;
  if (fromField.length >= 2) {
    list = uniqueDesiredPositions(fromField);
  } else if (fromExtra.length) {
    list = uniqueDesiredPositions(fromExtra);
  } else if (fromField.length) {
    list = uniqueDesiredPositions(fromField);
  } else {
    return null;
  }

  extra.desiredPositions = list.slice(0, 8);
  extra.positionOrderV = 2;
  return {
    desiredPosition: list.join(' / '),
    extraData: extra,
  };
}

/** Köne bazada extraData we desiredPosition arasyndaky tertip tapawutyny düzet */
async function backfillDesiredPositionOrder(models, { log = console.log } = {}) {
  const { Anketa } = models;
  const rows = await Anketa.findAll({
    attributes: ['id', 'desiredPosition', 'extraData'],
  });
  let updated = 0;

  for (const row of rows) {
    const fixed = reconcileDesiredPositions(row.desiredPosition, row.extraData);
    if (!fixed) continue;

    const prevExtra = row.extraData && typeof row.extraData === 'object' ? row.extraData : {};
    const prevList = Array.isArray(prevExtra.desiredPositions) ? prevExtra.desiredPositions : [];
    const sameExtra = JSON.stringify(prevList) === JSON.stringify(fixed.extraData.desiredPositions);
    const sameField = String(row.desiredPosition || '').trim() === fixed.desiredPosition;
    if (sameExtra && sameField) continue;

    await row.update({
      desiredPosition: fixed.desiredPosition,
      extraData: fixed.extraData,
    });
    updated += 1;
  }

  if (updated > 0 && log) {
    log(`Wezipe tertibi täzelendi: ${updated} anketa`);
  }
  return updated;
}

module.exports = {
  splitDesiredPositionList,
  uniqueDesiredPositions,
  buildOrderedKeyIndex,
  collectDesiredPositionsOrdered,
  extractOrderedPositions,
  reconcileDesiredPositions,
  backfillDesiredPositionOrder,
  isWorkExperienceWezipeKey,
  parseWezipeSlot,
};
