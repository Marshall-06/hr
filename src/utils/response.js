const ApiError = require('./ApiError');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({ success: true, message, data });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Içerki serwer ýalňyşlygy';

  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Surat gaty uly (max 30MB). Skan JPG-ni kiçeldip ýa-da az faýl bilen synanyşyň.';
    } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Bir gezekde gaty köp faýl. Azajyk bölek bilen ýükläň.';
    } else {
      message = `Faýl ýalňyşlygy: ${err.message}`;
    }
  }

  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    const field = err.errors?.[0]?.path || '';
    if (String(field).includes('anketa') || String(err.message || '').includes('anketa_number')) {
      message = 'Bu anketa belgesi eýýäm bar. Pozulan ýazgy belgini eýelemeli däl — täzeden synanyň.';
    } else if (String(field).includes('vacancy') || String(err.message || '').includes('vacancy_number')) {
      message = 'Bu wakansiýa belgesi eýýäm bar. Täzeden synanyň.';
    } else {
      message = err.errors?.[0]?.message || message;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.data ? { data: err.data } : {}),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, 'Sahypa tapylmady'));
};

module.exports = {
  asyncHandler,
  successResponse,
  errorHandler,
  notFoundHandler,
};
