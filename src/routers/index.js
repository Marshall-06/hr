const express = require('express');
const authRouter = require('./authRouter');
const anketaRouter = require('./anketaRouter');
const vacancyRouter = require('./vacancyRouter');
const contractRouter = require('./contractRouter');
const matchRouter = require('./matchRouter');
const reportRouter = require('./reportRouter');
const excelRouter = require('./excelRouter');
const photoLinkRouter = require('./photoLinkRouter');
const commentRouter = require('./commentRouter');
const feePaymentRouter = require('./feePaymentRouter');
const docsRouter = require('./docsRouter');
const optionListRouter = require('./optionListRouter');
const mailRouter = require('./mailRouter');

const router = express.Router();

router.use('/docs', docsRouter);
router.use('/auth', authRouter);
router.use('/mail', mailRouter);
router.use('/anketas', anketaRouter);
router.use('/vacancies', vacancyRouter);
router.use('/contracts', contractRouter);
router.use('/match', matchRouter);
router.use('/reports', reportRouter);
router.use('/excel', excelRouter);
router.use('/photos', photoLinkRouter);
router.use('/comments', commentRouter);
router.use('/fee-payments', feePaymentRouter);
router.use('/option-lists', optionListRouter);

router.get('/branding', (req, res) => {
  const { getBranding } = require('../services/brandingService');
  const env = require('../config/env');
  res.json({ success: true, data: getBranding(), message: `${env.brand.short} API` });
});

router.get('/health', (req, res) => {
  const env = require('../config/env');
  res.json({
    success: true,
    message: `${env.brand.full} API işleýär`,
    apis: {
      photos: true,
      anketas: true,
      excel: true,
      mail: true,
    },
  });
});

/** /api/* tapylmady — static-e düşmän anyk JSON */
router.use((req, res) => {
  const path = String(req.originalUrl || '');
  const isMail = /\/mail|send-email|send-candidates|gmail-compose|mail-status|mail-login/i.test(path);
  res.status(404).json({
    success: false,
    message: isMail
      ? `E-poçta ýoly tapylmady (${req.method} ${path}). Main PC-de serweri togtadyp täzeden başladyň — Gmail adresine harp goşmaň.`
      : `API tapylmady: ${req.method} ${path}`,
    hint: 'Main PC: serweri restart. Operatorlar: brauzerde Ctrl+F5. Synag: GET /api/mail/ping',
  });
});

module.exports = router;
