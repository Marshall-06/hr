const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');

const hashPassword = async (password) => bcrypt.hash(password, 10);

const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

const generateToken = (user) => jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  env.jwt.secret,
  { expiresIn: env.jwt.expiresIn },
);

/** Her API-da DB soragyny azaltmak — 30s cache */
const authUserCache = new Map();
const AUTH_USER_TTL_MS = 30 * 1000;

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Giriş talap edilýär');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwt.secret);

    const cacheKey = Number(decoded.id);
    const cached = authUserCache.get(cacheKey);
    let user = cached && (Date.now() - cached.at) < AUTH_USER_TTL_MS
      ? cached.user
      : null;

    if (!user) {
      user = await User.findByPk(decoded.id);
      if (user) authUserCache.set(cacheKey, { user, at: Date.now() });
    }

    if (!user || !user.isActive) {
      authUserCache.delete(cacheKey);
      throw new ApiError(401, 'Ulanyjy tapylmady');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      next(new ApiError(401, 'Nädogry ýa-da möhleti gutaran token'));
    } else {
      next(err);
    }
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ApiError(403, 'Diňe admin bu hereketi edip biler'));
  }
  return next();
};

const canDeleteAnketa = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.canDeleteAnketa) {
    return next();
  }
  return next(new ApiError(403, 'Anketa pozmak üçin rugsat ýok'));
};

const staffOnly = (req, res, next) => {
  if (!['admin', 'operator'].includes(req.user.role)) {
    return next(new ApiError(403, 'Rugsat ýok'));
  }
  return next();
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware,
  adminOnly,
  canDeleteAnketa,
  staffOnly,
};
