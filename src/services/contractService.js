const { Contract, Anketa } = require('../models');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSearchFilter, generateContractNumber } = require('../utils/helpers');
const { getContractTemplate } = require('../utils/contractTemplate');
const env = require('../config/env');
const anketaService = require('./anketaService');

class ContractService {
  async getAll(query = {}) {
    const { page, limit, offset } = buildPagination(query);
    const where = buildSearchFilter(
      ['contractNumber', 'jobSeekerName'],
      query.search,
    );

    if (query.status) where.status = query.status;

    const { rows, count } = await Contract.findAndCountAll({
      where,
      limit,
      offset,
      include: [{ model: Anketa, as: 'anketa', attributes: ['id', 'anketaNumber', 'familyName', 'firstName', 'patronymic'] }],
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  async getById(id) {
    const contract = await Contract.findByPk(id, {
      include: [{ model: Anketa, as: 'anketa' }],
    });
    if (!contract) throw new ApiError(404, 'Şertnama tapylmady');
    return contract;
  }

  async createFromAnketa(anketaId, extra = {}) {
    const anketa = await anketaService.getById(anketaId);

    const jobSeekerDetails = {
      familyName: anketa.familyName,
      firstName: anketa.firstName,
      patronymic: anketa.patronymic,
      phone: anketa.phone,
      desiredPosition: anketa.desiredPosition,
      anketaNumber: anketa.anketaNumber,
      address: anketa.registrationAddress || anketa.currentAddress,
      passportNumber: anketa.passportNumber,
      passportIssued: anketa.passportIssued,
    };

    if (!extra.forceNew) {
      const existing = await Contract.findOne({
        where: { anketaId },
        order: [['id', 'DESC']],
      });
      if (existing) {
        // Passport / FAA täzelenen bolsa şertnama maglumatyny hem täzele
        await existing.update({
          jobSeekerName: anketaService.formatName(anketa),
          jobSeekerDetails,
        });
        return this.getById(existing.id);
      }
    }

    const jobSeekerName = anketaService.formatName(anketa);
    const contractNumber = extra.contractNumber || await generateContractNumber(Contract, anketa.anketaNumber);
    const contractDate = extra.contractDate || new Date().toISOString().split('T')[0];

    const content = getContractTemplate({
      contractNumber,
      contractDate,
      jobSeekerName,
      anketaNumber: anketa.anketaNumber,
      executorName: env.company.name,
      executorDirector: env.company.director,
      serviceFeePercent: extra.serviceFeePercent || 50,
    });

    return Contract.create({
      contractNumber,
      contractDate,
      anketaId,
      jobSeekerName,
      jobSeekerDetails,
      executorName: env.company.name,
      executorDirector: env.company.director,
      content,
      status: 'Taslama',
      serviceFeePercent: extra.serviceFeePercent || 50,
    });
  }

  async update(id, data) {
    const contract = await this.getById(id);
    await contract.update(data);
    return contract;
  }

  async sign(id) {
    const contract = await this.getById(id);
    await contract.update({ status: 'Gol cekildi', signedAt: new Date() });
    return contract;
  }

  async remove(id) {
    const contract = await this.getById(id);
    await contract.destroy();
    return { message: 'Şertnama pozuldy' };
  }
}

module.exports = new ContractService();
