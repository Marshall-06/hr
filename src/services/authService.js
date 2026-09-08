const { Op } = require('sequelize');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword, generateToken } = require('../middlewares/auth');

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
  canDeleteAnketa: Boolean(user.canDeleteAnketa),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

function parseFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

class AuthService {
  /** DB-de ulanyjy barmy? */
  async getSetupStatus() {
    const count = await User.count();
    return {
      needsSetup: count === 0,
      userCount: count,
    };
  }

  /**
   * Diňe ulanyjy ýok bolsa — ilkinji admin döredýär (Swagger / täze serwer).
   * Soňky gezekler 403.
   */
  async bootstrapAdmin(data = {}) {
    const count = await User.count();
    if (count > 0) {
      throw new ApiError(403, 'Setup eýýäm tamam. Ilkinji admin döredilen. Login ulanyň.');
    }

    const username = String(data.username || 'admin').trim() || 'admin';
    const password = String(data.password || 'admin123');
    const fullName = String(data.fullName || 'Administrator').trim() || 'Administrator';

    if (username.length < 3) {
      throw new ApiError(400, 'Ulanyjy ady iň azyndan 3 harp bolmaly');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Parol iň azyndan 6 harp bolmaly');
    }

    const hashed = await hashPassword(password);
    const user = await User.create({
      username,
      password: hashed,
      fullName,
      role: 'admin',
      isActive: true,
    });

    const token = generateToken(user);
    return {
      token,
      user: publicUser(user),
      message: 'Ilkinji admin döredildi. Token bilen Authorize ediň.',
    };
  }

  async login(username, password) {
    const user = await User.findOne({ where: { username } });
    if (!user || !user.isActive) {
      throw new ApiError(401, 'Ulanyjy ady ýa-da parol nädogry');
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      throw new ApiError(401, 'Ulanyjy ady ýa-da parol nädogry');
    }

    const token = generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        canDeleteAnketa: Boolean(user.canDeleteAnketa),
      },
    };
  }

  async createUser(data) {
    const username = String(data.username || '').trim();
    const password = String(data.password || '');
    const fullName = String(data.fullName || '').trim();
    const role = data.role === 'admin' ? 'admin' : 'operator';

    if (!username || username.length < 3) {
      throw new ApiError(400, 'Ulanyjy ady iň azyndan 3 harp bolmaly');
    }
    if (!password || password.length < 6) {
      throw new ApiError(400, 'Parol iň azyndan 6 harp bolmaly');
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      throw new ApiError(400, 'Bu ulanyjy ady eýýäm bar');
    }

    const hashed = await hashPassword(password);
    const user = await User.create({
      username,
      password: hashed,
      fullName: fullName || username,
      role,
      isActive: parseFlag(data.isActive, true),
      canDeleteAnketa: role === 'admin' ? false : parseFlag(data.canDeleteAnketa, false),
    });

    return publicUser(user);
  }

  async getProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
    });
    if (!user) throw new ApiError(404, 'Ulanyjy tapylmady');
    return publicUser(user);
  }

  async listStaff(filters = {}) {
    const where = { isActive: true };
    if (filters.role) {
      where.role = filters.role;
    } else {
      where.role = { [Op.in]: ['admin', 'operator'] };
    }

    return User.findAll({
      where,
      attributes: ['id', 'username', 'fullName', 'role'],
      order: [['fullName', 'ASC'], ['username', 'ASC']],
    });
  }

  async listUsers(filters = {}) {
    const where = {};
    if (filters.role) where.role = filters.role;
    if (filters.active === 'true') where.isActive = true;
    if (filters.active === 'false') where.isActive = false;
    if (filters.search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${filters.search}%` } },
        { fullName: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
    });

    return users.map(publicUser);
  }

  async getUserById(id) {
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
    });
    if (!user) throw new ApiError(404, 'Ulanyjy tapylmady');
    return publicUser(user);
  }

  async updateUser(id, data, currentUserId) {
    const user = await User.findByPk(id);
    if (!user) throw new ApiError(404, 'Ulanyjy tapylmady');

    if (data.username && data.username !== user.username) {
      const username = String(data.username).trim();
      if (username.length < 3) throw new ApiError(400, 'Ulanyjy ady iň azyndan 3 harp bolmaly');
      const exists = await User.findOne({ where: { username, id: { [Op.ne]: id } } });
      if (exists) throw new ApiError(400, 'Bu ulanyjy ady eýýäm bar');
      user.username = username;
    }

    if (data.fullName !== undefined) {
      user.fullName = String(data.fullName || '').trim() || user.username;
    }

    if (data.role !== undefined) {
      const role = data.role === 'admin' ? 'admin' : 'operator';
      if (user.id === currentUserId && role !== 'admin') {
        throw new ApiError(400, 'Öz admin hukuklaryňyzy aýryp bilmersiňiz');
      }
      user.role = role;
    }

    if (data.isActive !== undefined) {
      const active = data.isActive === true || data.isActive === 'true';
      if (user.id === currentUserId && !active) {
        throw new ApiError(400, 'Özüňizi ýapyk edip bilmersiňiz');
      }
      user.isActive = active;
    }

    if (data.canDeleteAnketa !== undefined) {
      user.canDeleteAnketa = user.role === 'admin'
        ? false
        : parseFlag(data.canDeleteAnketa, false);
    } else if (data.role !== undefined && user.role === 'admin') {
      user.canDeleteAnketa = false;
    }

    if (data.password) {
      if (String(data.password).length < 6) {
        throw new ApiError(400, 'Parol iň azyndan 6 harp bolmaly');
      }
      user.password = await hashPassword(String(data.password));
    }

    await user.save();
    return publicUser(user);
  }

  async deleteUser(id, currentUserId) {
    const user = await User.findByPk(id);
    if (!user) throw new ApiError(404, 'Ulanyjy tapylmady');
    if (user.id === currentUserId) {
      throw new ApiError(400, 'Özüňizi öçürip bilmersiňiz');
    }

    await user.destroy();
    return { message: 'Ulanyjy pozuldy' };
  }
}

module.exports = new AuthService();
