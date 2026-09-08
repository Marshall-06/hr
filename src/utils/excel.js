const XLSX = require('xlsx');

const excelSerialToDate = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'number') {
    if (value > 1900 && value < 2100 && Number.isInteger(value)) return null;
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }
  return null;
};

const normalizeKey = (key) => String(key || '')
  .toLowerCase()
  .replace(/ý/g, 'y')
  .replace(/ä/g, 'a')
  .replace(/ö/g, 'o')
  .replace(/ü/g, 'u')
  .replace(/ň/g, 'n')
  .replace(/ş/g, 's')
  .replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, '');

const buildKeyIndex = (row) => {
  const entries = [];
  Object.keys(row || {}).forEach((k) => {
    entries.push([normalizeKey(k), row[k], k]);
  });
  return entries;
};

/** Exact match first, then fuzzy (header starts with / includes alias). */
const getCell = (row, aliases = [], keyIndex = null) => {
  const entries = keyIndex || buildKeyIndex(row);
  for (const alias of aliases) {
    const a = normalizeKey(alias);
    if (!a) continue;

    for (const [k, v] of entries) {
      if (k === a && v !== undefined && v !== null && String(v).trim() !== '') return v;
    }

    if (a.length >= 5) {
      for (const [k, v] of entries) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        // wezipesi ≠ iswezipesi1 (öňki iş wezipesi)
        const numbered = k.startsWith(a) && /^\d*$/.test(k.slice(a.length));
        const fuzzy = a.length >= 8 && k.includes(a)
          && !k.startsWith('is') && !k.startsWith('islan') && !k.startsWith('onki');
        if (k === a || numbered || fuzzy) return v;
      }
    }
  }
  return null;
};

/** Bir alias üçin ähli gabat gelýän sütünler (WEZIPESI 1 / 2 / 3) */
const getCellsAll = (row, aliases = [], keyIndex = null) => {
  const entries = keyIndex || buildKeyIndex(row);
  const found = [];
  const seenKeys = new Set();
  for (const alias of aliases) {
    const a = normalizeKey(alias);
    if (!a) continue;
    for (const [k, v, orig] of entries) {
      if (seenKeys.has(orig || k)) continue;
      const numbered = k.startsWith(a) && /^\d*$/.test(k.slice(a.length));
      const fuzzy = a.length >= 8 && k.includes(a)
        && !k.startsWith('is') && !k.startsWith('islan') && !k.startsWith('onki');
      const hit = k === a || numbered || fuzzy;
      if (!hit || v === undefined || v === null || String(v).trim() === '') continue;
      seenKeys.add(orig || k);
      found.push({ key: k, orig, value: v });
    }
  }
  return found;
};

/** Diňe takyk header — sütüner garyşmaz ýaly (kärhana / wezipe / operator) */
const getCellExact = (row, aliases = [], keyIndex = null) => {
  const entries = keyIndex || buildKeyIndex(row);
  for (const alias of aliases) {
    const a = normalizeKey(alias);
    if (!a) continue;
    for (const [k, v] of entries) {
      if (k === a && v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return null;
};

const normalizeAnketaStatus = (value) => {
  const v = normalizeKey(value);
  if (!v) return 'Islanok';
  if (v.includes('isleyar') || v.includes('isleyan')) return 'Isleyar';
  if (v.includes('islanok') || v.includes('isleman') || v.includes('islemeyar') || v.includes('islemeyan')) {
    return 'Islanok';
  }
  return 'Islanok';
};

const normalizeVacancyStatus = (value) => {
  const v = normalizeKey(value);
  if (!v) return 'Acyk';
  if (v.includes('yapyk') || v.includes('yapylan') || v.includes('closed')) return 'Yapyk';
  if (v.includes('acyk') || v.includes('open')) return 'Acyk';
  return 'Acyk';
};

const normalizeGender = (value) => {
  const v = normalizeKey(value);
  if (!v || v.includes('saylanok') || v.includes('soralanok')) return null;
  if (v.includes('erkek')) return 'Erkek';
  if (v.includes('ayal')) return 'Ayal';
  if (v.includes('gyz')) return 'Gyz';
  return null;
};

const shrinkSheetToUsedHeaders = (sheet, { maxCols = 250 } = {}) => {
  if (!sheet || !sheet['!ref']) return sheet;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headerRow = range.s.r;
  const scanTo = Math.min(range.e.c, maxCols - 1);
  let lastCol = range.s.c;

  for (let c = range.s.c; c <= scanTo; c += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (cell && cell.v != null && String(cell.v).trim() !== '') lastCol = c;
  }

  // Never exceed requested maxCols (vacancy sheets have 2000+ assignment columns)
  range.e.c = Math.min(lastCol, maxCols - 1);
  sheet['!ref'] = XLSX.utils.encode_range(range);
  return sheet;
};

/** Birleşdirilen başlyk (WEZIPESI 3 sütün) — her öýjüge adyny ýaz */
const expandMergedHeaders = (sheet) => {
  if (!sheet || !sheet['!ref']) return sheet;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headerRow = range.s.r;
  const merges = sheet['!merges'] || [];
  merges.forEach((m) => {
    if (!m || m.s.r !== headerRow || m.s.r !== m.e.r) return;
    if (m.e.c <= m.s.c) return;
    const masterAddr = XLSX.utils.encode_cell({ r: headerRow, c: m.s.c });
    const master = sheet[masterAddr];
    const name = master && master.v != null ? String(master.v).replace(/[\r\n\t]/g, ' ').trim() : '';
    if (!name) return;
    for (let c = m.s.c + 1; c <= m.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r: headerRow, c });
      const cell = sheet[addr];
      const cur = cell && cell.v != null ? String(cell.v).trim() : '';
      if (cur) continue;
      sheet[addr] = { t: 's', v: name };
    }
  });
  return sheet;
};

/** Birmeňzeş başlyklar (WEZIPESI × 3) — soňky sütün öňkileri basmaz ýaly */
const uniquifySheetHeaders = (sheet) => {
  if (!sheet || !sheet['!ref']) return sheet;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headerRow = range.s.r;
  const used = new Set();
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = sheet[addr];
    let name = cell && cell.v != null ? String(cell.v).replace(/[\r\n\t]/g, ' ').trim() : '';
    if (!name) name = `__EMPTY_${c}`;
    let out = name;
    let n = 1;
    while (used.has(out.toLowerCase())) {
      n += 1;
      out = `${name} ${n}`;
    }
    used.add(out.toLowerCase());
    if (!cell || out !== name || !cell.v) {
      sheet[addr] = { t: 's', v: out };
    }
  }
  return sheet;
};

const pickSheetName = (workbook, preferred = []) => {
  const names = workbook.SheetNames || [];
  for (const p of preferred) {
    const found = names.find((n) => normalizeKey(n) === normalizeKey(p));
    if (found) return found;
  }
  return names[0];
};

/** Başlyk setiri: WEZIPESI / FAMILIÝASY (diňe «ANKETA» atlyk setir däl) */
const looksLikeAnketaHeaderRow = (cells = []) => {
  const keys = (Array.isArray(cells) ? cells : []).map((c) => normalizeKey(c));
  const hit = (m) => keys.some((k) => k === m || k.startsWith(m));
  return hit('wezipesi') || hit('familiyasy') || hit('familiya') || hit('familiyasy');
};

const matrixToObjects = (matrix) => {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  let headerIdx = 0;
  for (let r = 0; r < Math.min(6, matrix.length); r += 1) {
    if (looksLikeAnketaHeaderRow(matrix[r])) {
      headerIdx = r;
      break;
    }
  }
  const headerCells = matrix[headerIdx] || [];
  const used = new Set();
  const headers = headerCells.map((h, c) => {
    let name = String(h == null ? '' : h).replace(/[\r\n\t]/g, ' ').trim();
    if (!name) name = `__EMPTY_${c}`;
    let out = name;
    let n = 1;
    while (used.has(out.toLowerCase())) {
      n += 1;
      out = `${name} ${n}`;
    }
    used.add(out.toLowerCase());
    return out;
  });
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const arr = matrix[r] || [];
    const obj = {};
    let any = false;
    headers.forEach((h, i) => {
      const v = arr[i] != null ? arr[i] : '';
      obj[h] = v;
      if (v !== '' && v != null) any = true;
    });
    if (any) rows.push(obj);
  }
  return rows;
};

const readSheetRows = (buffer, options = {}) => {
  const {
    preferredSheets = [],
    maxCols = 250,
  } = options;

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    dense: false,
  });

  const sheetName = pickSheetName(workbook, preferredSheets);
  let sheet = workbook.Sheets[sheetName];
  // Ilki birleşdirilen WEZIPESI sütünerini aç, soň kes — 2-nji/3-nji wezipe ýitmesin
  sheet = expandMergedHeaders(sheet);
  sheet = uniquifySheetHeaders(sheet);
  sheet = shrinkSheetToUsedHeaders(sheet, { maxCols });

  // header:1 — birmeňzeş WEZIPESI sütüneri soňky birine ýykgynmaz
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const rows = matrixToObjects(matrix);
  return rows.filter((row) => Object.values(row).some((v) => v !== '' && v != null));
};

function parseArgbChannels(argb) {
  const raw = String(argb || '').trim().replace(/^#/, '');
  if (!raw) return null;
  const hex = raw.length === 8 ? raw.slice(2) : raw.length === 6 ? raw : '';
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** Excel setir / öýjük fill: ýaşyl → biziň, gyzyl → özi */
function classifyPlacementFillColor(argb) {
  const c = parseArgbChannels(argb);
  if (!c) return null;
  // Ak / gara / boz — belgi däl
  if (c.r > 245 && c.g > 245 && c.b > 245) return null;
  if (c.r < 25 && c.g < 25 && c.b < 25) return null;
  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  if (spread < 20) return null;

  // Ýaşyl (C6EFCE, 92D050, 00B050, 9BBB59…)
  if (c.g >= c.r + 12 && c.g >= c.b + 8) return 'us';
  if (c.g >= 140 && c.r <= 220 && c.b <= 210 && c.g > c.r && c.g >= c.b) return 'us';

  // Gyzyl / çalgyldy gyzyl (FFC7CE, FF6B6B, C0504D…)
  if (c.r >= c.g + 15 && c.r >= c.b + 15) return 'self';
  if (c.r >= 170 && c.g <= 180 && c.b <= 180 && c.r > c.g) return 'self';

  return null;
}

/** Office tema reňkleri (ExcelJS diňe theme berende) */
const OFFICE_THEME_ARGB = [
  'FF000000', 'FFFFFFFF', 'FFEEECE1', 'FF1F497D',
  'FF4F81BD', 'FFC0504D', 'FF9BBB59', 'FF8064A2',
  'FF4BACC6', 'FFF79646', 'FF0000FF', 'FF800080',
];

function applyThemeTint(argb, tint) {
  if (tint == null || !Number.isFinite(Number(tint)) || Number(tint) === 0) return argb;
  const c = parseArgbChannels(argb);
  if (!c) return argb;
  const t = Number(tint);
  const mix = (ch) => {
    if (t < 0) return Math.round(ch * (1 + t));
    return Math.round(ch + (255 - ch) * t);
  };
  const r = Math.max(0, Math.min(255, mix(c.r)));
  const g = Math.max(0, Math.min(255, mix(c.g)));
  const b = Math.max(0, Math.min(255, mix(c.b)));
  return `FF${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

function cellFillArgb(cell) {
  if (!cell || !cell.fill || cell.fill.type === 'none') return null;
  const fg = cell.fill.fgColor || cell.fill.bgColor || null;
  if (!fg) return null;
  if (fg.argb) return String(fg.argb);
  if (fg.theme != null) {
    const base = OFFICE_THEME_ARGB[Number(fg.theme)] || null;
    if (base) return applyThemeTint(base, fg.tint);
  }
  return null;
}

function detectExcelRowPlacementMark(row) {
  if (!row || typeof row.getCell !== 'function') return null;
  let us = 0;
  let self = 0;
  // Diňe ilkinji sütünler — ähli 200 sütün her setirde haýaldýar
  const maxCol = Math.min(Number(row.cellCount) || 30, 30);
  for (let col = 1; col <= maxCol; col += 1) {
    const cell = row.getCell(col);
    const fillHit = classifyPlacementFillColor(cellFillArgb(cell));
    if (fillHit === 'us') us += 1;
    else if (fillHit === 'self') self += 1;
    const fontArgb = cell.font && cell.font.color && cell.font.color.argb
      ? String(cell.font.color.argb)
      : null;
    const fontHit = classifyPlacementFillColor(fontArgb);
    if (fontHit === 'us') us += 1;
    else if (fontHit === 'self') self += 1;
    if (us + self >= 4) break;
  }
  if (us === 0 && self === 0) return null;
  return us >= self ? 'us' : 'self';
}

/**
 * Anketa import: xlsx maglumat + ExcelJS setir reňki (ýaşyl/gyzyl).
 * Her setire `_placementMark`: 'us' | 'self' | null goşulýar.
 */
async function readAnketaSheetRowsWithColors(buffer, options = {}) {
  const rows = readSheetRows(buffer, options);
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const preferred = options.preferredSheets || ['BAZA'];
  let sheet = null;
  for (const name of preferred) {
    sheet = workbook.getWorksheet(name)
      || workbook.worksheets.find((ws) => normalizeKey(ws.name) === normalizeKey(name));
    if (sheet) break;
  }
  if (!sheet) sheet = workbook.worksheets[0];
  if (!sheet) {
    return rows.map((row) => ({ ...row, _placementMark: null }));
  }

  const headerRow = sheet.getRow(1);
  const headerNorm = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headerNorm[col] = normalizeKey(cell.value);
  });
  let numCols = headerNorm
    .map((h, col) => ({ h, col }))
    .filter(({ h }) => h && (
      h === 'faa'
      || h === 'n'
      || h === 'anketanumber'
      || h === 'anketano'
      || h.includes('anketano')
      || h === 'no'
    ))
    .map(({ col }) => col);
  // FAA / № sütüni tapylmasa — A sütüni syna
  if (!numCols.length) numCols = [1];

  const markByNumber = new Map();
  const marksInOrder = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return;
    const mark = detectExcelRowPlacementMark(row);
    marksInOrder.push(mark);
    if (!mark) return;
    numCols.forEach((col) => {
      const cell = row.getCell(col);
      let raw = cell.value;
      if (raw && typeof raw === 'object') {
        raw = raw.text != null ? raw.text : (raw.result != null ? raw.result : raw);
      }
      const num = String(raw == null ? '' : raw).trim();
      if (!num) return;
      markByNumber.set(num, mark);
      markByNumber.set(num.replace(/\s+/g, ''), mark);
      // 26/05/117 we 26/5/117
      const m = num.match(/^(\d{2,4})[\/.\-](\d{1,2})[\/.\-](\d+)$/);
      if (m) {
        const yy = m[1].length === 4 ? m[1].slice(-2) : m[1];
        markByNumber.set(`${Number(yy)}/${Number(m[2])}/${Number(m[3])}`, mark);
        markByNumber.set(`${yy}/${m[2]}/${m[3]}`, mark);
      }
    });
  });

  return rows.map((row, idx) => {
    const keys = buildKeyIndex(row);
    const num = String(getCell(row, ['FAA', '№', 'N', 'anketaNumber', 'Anketa №', 'NO'], keys) || '').trim();
    let mark = null;
    if (num) {
      mark = markByNumber.get(num)
        || markByNumber.get(num.replace(/\s+/g, ''))
        || null;
      if (!mark) {
        const m = num.match(/^(\d{2,4})[\/.\-](\d{1,2})[\/.\-](\d+)$/);
        if (m) {
          const yy = m[1].length === 4 ? m[1].slice(-2) : m[1];
          mark = markByNumber.get(`${Number(yy)}/${Number(m[2])}/${Number(m[3])}`) || null;
        }
      }
    }
    if (!mark && idx < marksInOrder.length) mark = marksInOrder[idx] || null;
    return { ...row, _placementMark: mark };
  });
}

const headerFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
};
const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
const stripeFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD6EAF8' },
};

/** Bir list — akylly Excel Table (filter, gök başlyk) */
function addSmartTableSheet(workbook, rows, sheetName = 'Data', options = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('Excel export: setir ýok — boş faýl döredilmez');
  }
  const dataRows = rows;
  const firstKeys = Object.keys(dataRows[0] || {});
  const extraKeys = [];
  dataRows.forEach((row) => {
    Object.keys(row || {}).forEach((k) => {
      if (!firstKeys.includes(k) && !extraKeys.includes(k)) extraKeys.push(k);
    });
  });
  let origKeys = firstKeys.concat(extraKeys);
  const wanted = Array.isArray(options.columnOrder) ? options.columnOrder.filter(Boolean) : [];
  if (wanted.length) {
    const rest = origKeys.filter((k) => !wanted.includes(k));
    origKeys = wanted.filter((k) => origKeys.includes(k)).concat(rest);
  }
  if (!origKeys.length) {
    throw new Error('Excel export: sütüner ýok');
  }

  const safeName = String(sheetName || 'Data').slice(0, 31) || 'Data';
  const sheet = workbook.addWorksheet(safeName, {
    views: options.freezeHeader === false ? [] : [{ state: 'frozen', ySplit: 1 }],
  });

  let headers = origKeys.slice();
  const seen = new Map();
  headers = headers.map((raw) => {
    let name = String(raw == null ? '' : raw).replace(/[\r\n\t]/g, ' ').trim() || 'Col';
    name = name.slice(0, 255);
    const key = name.toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return n === 1 ? name : `${name}_${n}`;
  });

  const tableRows = dataRows.map((row) => origKeys.map((k) => {
    const v = row[k];
    return v == null ? '' : v;
  }));

  // A1 = birinji sütün (wakansiýa: Operator). Göni öýjük ýazýarys.
  headers.forEach((h, i) => {
    sheet.getCell(1, i + 1).value = h;
  });
  dataRows.forEach((row, r) => {
    origKeys.forEach((k, i) => {
      const v = row[k];
      sheet.getCell(r + 2, i + 1).value = v == null ? '' : v;
    });
  });

  const lastRow = dataRows.length + 1;
  const lastCol = origKeys.length;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
  sheet.views = wanted.length
    ? [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    : [{ state: 'frozen', ySplit: 1 }];

  headers.forEach((h, i) => {
    const col = sheet.getColumn(i + 1);
    const origKey = origKeys[i] || h;
    let max = String(h).length;
    dataRows.forEach((row) => {
      const v = row[origKey];
      const s = v == null ? '' : String(v);
      s.split(/\r?\n/).forEach((line) => {
        if (line.length > max) max = line.length;
      });
    });
    // Filter ok + padding; Excel birligi ≈ harp sany
    const fitted = Math.min(Math.max(max + 3.5, 10), 80);
    const custom = options.colWidths?.[origKey] || options.colWidths?.[h];
    col.width = custom ? Math.max(custom, fitted) : fitted;
  });

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1F4E79' } },
      left: { style: 'thin', color: { argb: 'FF1F4E79' } },
      bottom: { style: 'thin', color: { argb: 'FF1F4E79' } },
      right: { style: 'thin', color: { argb: 'FF1F4E79' } },
    };
  });

  for (let r = 2; r <= tableRows.length + 1; r += 1) {
    if (r % 2 !== 0) continue;
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = stripeFill;
    });
  }

  return sheet;
}

async function finalizeWorkbookBuffer(workbook) {
  let buf = Buffer.from(await workbook.xlsx.writeBuffer());
  try {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buf);
    const tableFiles = Object.keys(zip.files).filter((n) => /^xl\/tables\/table\d+\.xml$/i.test(n));
    for (const p of tableFiles) {
      let xml = await zip.file(p).async('string');
      xml = xml
        .replace(/totalsRowShown="1"/g, 'totalsRowShown="0"')
        .replace(/\s+totalsRowLabel="Total"/g, '');
      zip.file(p, xml);
    }
    buf = Buffer.from(await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }));
  } catch (_) { /* keep original */ }
  return buf;
}

/**
 * Excel export — hakyky Table (ListObject), erkin diapazon däl.
 * Excel-de: Table Design / filter oklary / gök başlyk görünmeli.
 */
const buildWorkbookBuffer = async (rows, sheetName = 'Data', options = {}) => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kerwen Kadr';
  workbook.created = new Date();
  addSmartTableSheet(workbook, rows, sheetName, options);
  return finalizeWorkbookBuffer(workbook);
};

/** Birnäçe list — her biri akylly tablisa */
const buildWorkbookBufferMulti = async (sheets = []) => {
  if (!Array.isArray(sheets) || !sheets.length) {
    throw new Error('Excel export: list ýok');
  }
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kerwen Kadr';
  workbook.created = new Date();
  sheets.forEach((def, idx) => {
    const opts = { ...(def.options || {}) };
    if (!opts.tableName) opts.tableName = `KerwenTable${idx + 1}`;
    addSmartTableSheet(workbook, def.rows, def.sheetName, opts);
  });
  return finalizeWorkbookBuffer(workbook);
};

module.exports = {
  excelSerialToDate,
  normalizeKey,
  getCell,
  getCellExact,
  getCellsAll,
  buildKeyIndex,
  normalizeAnketaStatus,
  normalizeVacancyStatus,
  normalizeGender,
  readSheetRows,
  readAnketaSheetRowsWithColors,
  classifyPlacementFillColor,
  buildWorkbookBuffer,
  buildWorkbookBufferMulti,
};
