const { Op } = require('sequelize');
const { Comment, User, Anketa, Vacancy, VacancyAssignment } = require('../models');
const ApiError = require('../utils/ApiError');

const ALLOWED = new Set(['anketa', 'vacancy', 'assignment']);

const authorInclude = {
  model: User,
  as: 'author',
  attributes: ['id', 'fullName', 'username', 'role'],
};

async function assertEntityExists(entityType, entityId) {
  let row = null;
  if (entityType === 'anketa') row = await Anketa.findByPk(entityId, { attributes: ['id'] });
  else if (entityType === 'vacancy') row = await Vacancy.findByPk(entityId, { attributes: ['id'] });
  else if (entityType === 'assignment') row = await VacancyAssignment.findByPk(entityId, { attributes: ['id'] });
  if (!row) throw new ApiError(404, 'Obýekt tapylmady');
}

class CommentService {
  async list(entityType, entityId, limit = 100) {
    if (!ALLOWED.has(entityType)) throw new ApiError(400, 'Nädogry entityType');
    const id = Number(entityId);
    if (!id) throw new ApiError(400, 'entityId gerek');

    const items = await Comment.findAll({
      where: { entityType, entityId: id },
      include: [authorInclude],
      order: [['createdAt', 'ASC']],
      limit: Math.min(Math.max(Number(limit) || 100, 1), 200),
    });
    return { items, total: items.length };
  }

  async create(payload, currentUser) {
    const entityType = String(payload.entityType || '').trim();
    const entityId = Number(payload.entityId);
    const body = String(payload.body || '').trim();

    if (!ALLOWED.has(entityType)) throw new ApiError(400, 'Nädogry entityType');
    if (!entityId) throw new ApiError(400, 'entityId gerek');
    if (!body || body.length < 1) throw new ApiError(400, 'Tekst boş bolmaly däl');
    if (body.length > 4000) throw new ApiError(400, 'Tekst gaty uzyn (max 4000)');

    await assertEntityExists(entityType, entityId);

    const row = await Comment.create({
      entityType,
      entityId,
      body,
      createdByUserId: currentUser?.id || null,
    });

    // Hödürleme belligini assignment.notes-da hem sakla (tiz görkezmek üçin)
    if (entityType === 'assignment') {
      await VacancyAssignment.update({ notes: body }, { where: { id: entityId } });
    }

    return Comment.findByPk(row.id, { include: [authorInclude] });
  }

  /** Hödürleme wagtynda: assignment + anketa + vacancy taryhy */
  async addAssignNote({ assignmentId, anketaId, vacancy, body, userId, anketaNumber }) {
    const text = String(body || '').trim();
    if (!text) return null;

    const firm = vacancy?.companyName || '';
    const pos = vacancy?.position || '';
    const ctx = [firm, pos].filter(Boolean).join(' / ');
    const who = anketaNumber ? `№ ${anketaNumber}` : '';

    const assignmentComment = await Comment.create({
      entityType: 'assignment',
      entityId: assignmentId,
      body: text,
      createdByUserId: userId || null,
    });
    await VacancyAssignment.update({ notes: text }, { where: { id: assignmentId } });

    await Comment.create({
      entityType: 'anketa',
      entityId: anketaId,
      body: ctx ? `[Hödürleme · ${ctx}] ${text}` : `[Hödürleme] ${text}`,
      createdByUserId: userId || null,
    });

    if (vacancy?.id) {
      await Comment.create({
        entityType: 'vacancy',
        entityId: vacancy.id,
        body: who ? `[${who}] ${text}` : text,
        createdByUserId: userId || null,
      });
    }

    return assignmentComment;
  }

  async remove(id, currentUser) {
    const row = await Comment.findByPk(id);
    if (!row) throw new ApiError(404, 'Komentariýa tapylmady');

    const isAdmin = currentUser?.role === 'admin';
    const isAuthor = currentUser?.id && Number(row.createdByUserId) === Number(currentUser.id);
    if (!isAdmin && !isAuthor) {
      throw new ApiError(403, 'Diňe öz komentariýaňyzy ýa-da admin pozup bilýär');
    }

    await row.destroy();
    return { id: Number(id), deleted: true };
  }

  async latestForEntities(entityType, ids = []) {
    const list = [...new Set((ids || []).map(Number).filter(Boolean))];
    if (!ALLOWED.has(entityType) || !list.length) return {};

    const rows = await Comment.findAll({
      where: { entityType, entityId: { [Op.in]: list } },
      attributes: ['id', 'entityId', 'body', 'createdAt', 'createdByUserId'],
      order: [['createdAt', 'DESC']],
      limit: list.length * 3,
    });

    const map = {};
    rows.forEach((r) => {
      if (!map[r.entityId]) map[r.entityId] = r;
    });
    return map;
  }
}

module.exports = new CommentService();
