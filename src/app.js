const express = require('express');
const path = require('path');
const cors = require('cors');
const apiRouter = require('./routers');
const { errorHandler, notFoundHandler } = require('./utils/response');
const env = require('./config/env');

const app = express();
const publicRoot = path.join(__dirname, '../public');

const PUBLIC_SITE_KEY = env.publicSiteKey;
const PUBLIC_COOKIE = env.publicCookie || 'kerwen_public';

const getCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const hasPublicAccess = (req) => getCookie(req, PUBLIC_COOKIE) === '1';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRouter);

/** Operatorlar: Root CA göçürmek (Advanced / Proceed bolmaz ýaly) */
app.get('/kerwen-https.cer', (req, res) => {
  const fsLocal = require('fs');
  const ca = path.join(__dirname, '../certs/kerwen-ca.cer');
  const leaf = path.join(__dirname, '../certs/kerwen.cer');
  const cer = fsLocal.existsSync(ca) ? ca : leaf;
  if (!fsLocal.existsSync(cer)) {
    return res.status(404).type('text').send('Sertifikat ýok — admin PC-de npm run https:fix işlediň');
  }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="kerwen-https.cer"');
  return res.sendFile(cer);
});

/** Swagger gysga ýoly */
app.get('/swagger', (req, res) => res.redirect(301, '/api/docs/'));
app.get('/docs', (req, res) => res.redirect(301, '/api/docs/'));

/** Gizlin geçelge: /open/<PUBLIC_SITE_KEY> → açyk sahypa (user panel) */
app.get('/open/:key', (req, res) => {
  if (req.params.key !== PUBLIC_SITE_KEY) {
    return res.redirect('/admin/login.html');
  }
  res.setHeader(
    'Set-Cookie',
    `${PUBLIC_COOKIE}=1; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
  );
  return res.redirect('/index.html');
});

/** Açyk sahypany ýapmak: /open-close */
app.get('/open-close', (req, res) => {
  res.setHeader('Set-Cookie', `${PUBLIC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  return res.redirect('/admin/login.html');
});

/** Adaty / → hemişe admin login (açyk sahypa diňe /open/<key> bilen) */
app.get('/', (req, res) => {
  return res.redirect('/admin/login.html');
});

/** Public HTML — diňe gizlin cookie bilen */
app.use((req, res, next) => {
  const p = req.path;
  const always = (
    p.startsWith('/api')
    || p.startsWith('/admin')
    || p.startsWith('/css')
    || p.startsWith('/js')
    || p.startsWith('/assets')
    || p.startsWith('/uploads')
    || p.startsWith('/kici-suratlar')
    || p.startsWith('/open')
    || p === '/favicon.ico'
    || p === '/favicon.png'
    || p === '/anketa-print.html'
    || p === '/presentation.html'
    || p === '/Kerwen-Prezentasiya-CEO.html'
  );
  if (always) return next();

  const guarded = (
    p === '/index.html'
    || p === '/anketa.html'
    || p === '/vacancies.html'
  );

  if (guarded && !hasPublicAccess(req)) {
    return res.redirect('/admin/login.html');
  }
  return next();
});

// Ähli PC / brauzerler täze JS/CSS alsyn (köne keş galmasyn)
app.use((req, res, next) => {
  const p = req.path || '';
  if (/\.html?$/i.test(p)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  } else if (/\.(js|css)$/i.test(p)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

app.use(express.static(publicRoot));

/** 3×4 suratlar — programma daşynda anketa_kici_suratlar */
app.use('/kici-suratlar', (req, res, next) => {
  try {
    const portrait = require('./services/anketaPortraitFolderService');
    const root = portrait.ensureFolder();
    express.static(root)(req, res, next);
  } catch (e) {
    next();
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
