const excelService = require('../services/excelService');
const { asyncHandler, successResponse } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const parseExportFilters = (req) => ({
  year: req.query.year ? Number(req.query.year) : undefined,
  month: req.query.month ? Number(req.query.month) : undefined,
  dateFrom: req.query.dateFrom || undefined,
  dateTo: req.query.dateTo || undefined,
  anketaId: req.query.anketaId ? Number(req.query.anketaId) : undefined,
  anketaNumber: req.query.anketaNumber || undefined,
  acceptedByUserId: req.query.acceptedByUserId
    ? Number(req.query.acceptedByUserId)
    : undefined,
  forumOperator: req.query.forumOperator
    ? String(req.query.forumOperator)
    : undefined,
  acceptedByUserIds: String(req.query.acceptedByUserIds || '')
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => n > 0),
  withPhotos: ['1', 'true', 'yes', 'on'].includes(
    String(req.query.withPhotos || '').trim().toLowerCase(),
  ),
});

const periodFilenameSuffix = (filters) => {
  if (filters.anketaId) return `_id${filters.anketaId}`;
  if (filters.anketaNumber) {
    const safe = String(filters.anketaNumber).replace(/[^\d/]+/g, '_').replace(/\//g, '-');
    return `_${safe || 'anketa'}`;
  }
  const y = filters.year ? String(filters.year) : '';
  const m = filters.month ? String(filters.month).padStart(2, '0') : '';
  if (y && m) return `_${y}_${m}`;
  if (y) return `_${y}`;
  return '';
};

const periodLabel = (filters, kind = 'anketa') => {
  const y = filters.year ? Number(filters.year) : null;
  const m = filters.month ? Number(filters.month) : null;
  const months = [
    '', 'Ýanwar', 'Fewral', 'Mart', 'Aprel', 'Maý', 'Iýun',
    'Iýul', 'Awgust', 'Sentýabr', 'Oktýabr', 'Noýabr', 'Dekabr',
  ];
  if (y && m) {
    const yy = String(y).slice(-2);
    return kind === 'vacancy'
      ? `${months[m] || m} ${y}`
      : `${months[m] || m} ${y} (№ ${yy}/${m}/…)`;
  }
  if (y) return `${y} ýyly`;
  if (m) return `${months[m] || m} aýy (ähli ýyllar)`;
  return 'ähli ýazgylar';
};

const assertExportNotEmpty = (count, filters, kind) => {
  if (count > 0) return;
  const label = periodLabel(filters, kind);
  const hint = kind === 'anketa'
    ? ' Başga ýyl/aý synap görüň (mysal: 2025 + Awgust → 25/8/…).'
    : ' Başga döwür ýa-da operator synap görüň.';
  throw new ApiError(404, `Saýlanan döwürde ${kind === 'anketa' ? 'anketa' : 'wakansiýa'} tapylmady: ${label}.${hint}`);
};

const importAnketas = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Excel faýl saýlaň');
  const result = await excelService.importAnketas(req.file.buffer);
  successResponse(res, result, 'Anketalar Excel-den ýüklendi');
});

const importVacancies = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Excel faýl saýlaň');
  const operatorMode = String(req.body?.operatorMode || 'force').toLowerCase() === 'excel'
    ? 'excel'
    : 'force';
  const acceptedByUserId = req.body?.acceptedByUserId
    ? Number(req.body.acceptedByUserId)
    : null;
  if (operatorMode === 'force' && !acceptedByUserId) {
    throw new ApiError(400, 'Forum operator saýlaň');
  }
  const result = await excelService.importVacancies(req.file.buffer, {
    acceptedByUserId,
    operatorMode,
  });
  successResponse(res, result, 'Wakansiýalar Excel-den ýüklendi');
});

const exportAnketas = asyncHandler(async (req, res) => {
  req.setTimeout(20 * 60 * 1000);
  res.setTimeout(20 * 60 * 1000);
  const filters = parseExportFilters(req);
  const {
    buffer,
    count,
    photoCount = 0,
    folderCopied = 0,
    folderPath = '',
    format = 'xlsx',
  } = await excelService.exportAnketas(filters);
  assertExportNotEmpty(count, filters, 'anketa');
  const suffix = periodFilenameSuffix(filters);
  if (format === 'zip') {
    const filename = suffix ? `ANKETA_BAZA${suffix}.zip` : 'ANKETA_BAZA.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Count', String(count));
    res.setHeader('X-Export-Photos', String(photoCount));
    res.setHeader('X-Export-Folder-Copied', String(folderCopied));
    if (folderPath) res.setHeader('X-Export-Folder-Path', encodeURIComponent(folderPath));
    res.setHeader('X-Export-Format', 'zip');
    res.send(buffer);
    return;
  }
  const filename = suffix ? `ANKETA_BAZA${suffix}.xlsx` : 'ANKETA_BAZA.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Export-Count', String(count));
  res.setHeader('X-Export-Photos', '0');
  res.setHeader('X-Export-Format', 'xlsx');
  res.send(buffer);
});

const listExportPeriods = asyncHandler(async (req, res) => {
  const data = await excelService.listExportPeriods();
  successResponse(res, data);
});

const exportVacancies = asyncHandler(async (req, res) => {
  const filters = parseExportFilters(req);
  const { buffer, count } = await excelService.exportVacancies(filters);
  assertExportNotEmpty(count, filters, 'vacancy');

  let filename = 'Mahri_wakansiyalar.xlsx';
  if (filters.acceptedByUserId || filters.acceptedByUserIds.length === 1) {
    filename = 'wakansiyalar_operator.xlsx';
  } else if (filters.forumOperator) {
    const safe = filters.forumOperator.replace(/[^\w\-]+/g, '_').slice(0, 40);
    filename = `wakansiyalar_${safe || 'operator'}.xlsx`;
  }
  const periodSuffix = periodFilenameSuffix(filters);
  if (periodSuffix) {
    filename = filename.replace(/\.xlsx$/i, `${periodSuffix}.xlsx`);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Export-Count', String(count));
  res.send(buffer);
});

const parseFeeExportFilters = (req) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;
  let period = req.query.period;
  let date = req.query.date;
  if (!period && year && month) {
    period = 'month';
    date = `${year}-${String(month).padStart(2, '0')}-01`;
  } else if (!period && year) {
    period = 'year';
    date = `${year}-01-01`;
  }
  return {
    period,
    date,
    year,
    month,
    search: req.query.search,
    anketaNumber: req.query.anketaNumber,
    payStatus: req.query.payStatus,
    workStatus: req.query.workStatus,
    operatorId: req.query.operatorId,
  };
};

const exportFees = asyncHandler(async (req, res) => {
  const filters = parseFeeExportFilters(req);
  const { buffer, count, paymentCount, periodSuffix } = await excelService.exportFees(filters);
  if (!buffer) {
    throw new ApiError(500, 'Töleg Excel taýýarlanmady');
  }
  const filename = periodSuffix ? `Tolegler${periodSuffix}.xlsx` : 'Tolegler.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Export-Count', String(count || 0));
  res.setHeader('X-Export-Payments', String(paymentCount || 0));
  res.send(buffer);
});

const importFees = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Excel faýl saýlaň');
  const result = await excelService.importFees(req.file.buffer, req.user);
  successResponse(res, result, 'Tölegler Excel-den ýüklendi');
});

module.exports = {
  importAnketas,
  importVacancies,
  importFees,
  exportAnketas,
  exportVacancies,
  exportFees,
  listExportPeriods,
};
