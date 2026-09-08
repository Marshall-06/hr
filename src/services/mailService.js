const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

let nodemailer = null;
function loadNodemailer() {
  if (nodemailer) return nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    nodemailer = null;
  }
  return nodemailer;
}
try {
  loadNodemailer();
} catch {
  nodemailer = null;
}

const MAIL_LOGIN_PATH = path.join(__dirname, '../../data/mail-login.json');
const ENV_PATH = path.join(__dirname, '../../.env');

function ensureDataDir() {
  const dir = path.dirname(MAIL_LOGIN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSavedLogin() {
  try {
    if (!fs.existsSync(MAIL_LOGIN_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(MAIL_LOGIN_PATH, 'utf8'));
    const user = String(raw.user || raw.email || '').trim().toLowerCase();
    const pass = String(raw.pass || raw.password || '').replace(/\s+/g, '').trim();
    if (!user || !pass || !user.includes('@')) return null;
    return {
      user,
      pass,
      from: String(raw.from || '').trim() || companyFromDisplay(user),
      host: String(raw.host || 'smtp.gmail.com').trim(),
      port: Number(raw.port || 587),
      savedAt: raw.savedAt || null,
    };
  } catch {
    return null;
  }
}

function companyFromDisplay(user) {
  const name = String(env.company.name || 'HR')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'HR';
  const short = name.length > 48 ? `${name.slice(0, 45)}…` : name;
  return `${short} <${user}>`;
}

/** .env setiri — boşluk / <> / # üçin durnukly dırnak */
function quoteEnvValue(val) {
  const s = String(val ?? '');
  if (!s) return '';
  if (/[\s#"'$\\<>]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** .env içinde SMTP_* täzele — başga PC-de .env göçürilse işleýär */
function persistEnvMail({ user, pass, host, port }) {
  try {
    let text = '';
    try {
      text = fs.readFileSync(ENV_PATH, 'utf8');
    } catch {
      text = '';
    }
    const set = (key, val) => {
      const line = `${key}=${quoteEnvValue(val)}`;
      const re = new RegExp(`^${key}=.*$`, 'm');
      if (re.test(text)) text = text.replace(re, line);
      else text = `${text.trimEnd()}\n${line}\n`;
    };
    set('MAIL_ENABLED', '1');
    set('SMTP_HOST', host || 'smtp.gmail.com');
    set('SMTP_PORT', String(port || 587));
    set('SMTP_USER', user || '');
    set('SMTP_PASS', pass || '');
    set('SMTP_FROM', user ? companyFromDisplay(user) : '');
    set('SMTP_SECURE', Number(port) === 465 ? '1' : '0');
    fs.writeFileSync(ENV_PATH, text, 'utf8');
  } catch {
    /* .env ýazylmasa hem mail-login.json ýeter */
  }
}

function writeSavedLogin({ user, pass, from, host, port }) {
  ensureDataDir();
  const u = String(user || '').trim().toLowerCase();
  const p = String(pass || '').replace(/\s+/g, '').trim();
  const h = String(host || 'smtp.gmail.com').trim();
  const po = Number(port || 587);
  const payload = {
    user: u,
    pass: p,
    from: String(from || '').trim() || companyFromDisplay(u),
    host: h,
    port: po,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MAIL_LOGIN_PATH, JSON.stringify(payload, null, 2), 'utf8');
  process.env.MAIL_ENABLED = '1';
  process.env.SMTP_USER = u;
  process.env.SMTP_PASS = p;
  process.env.SMTP_HOST = h;
  process.env.SMTP_PORT = String(po);
  process.env.SMTP_FROM = payload.from;
  process.env.SMTP_SECURE = po === 465 ? '1' : '0';
  persistEnvMail(payload);
  return payload;
}

function clearSavedLogin() {
  try {
    if (fs.existsSync(MAIL_LOGIN_PATH)) fs.unlinkSync(MAIL_LOGIN_PATH);
  } catch { /* ignore */ }
  try {
    persistEnvMail({ user: '', pass: '', host: 'smtp.gmail.com', port: 587 });
  } catch { /* */ }
  process.env.SMTP_PASS = '';
}

function mailConfig() {
  const saved = readSavedLogin();
  const envEnabled = String(process.env.MAIL_ENABLED || '').trim() === '1';
  const host = (saved?.host || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(saved?.port || process.env.SMTP_PORT || 587);
  const user = (saved?.user || process.env.SMTP_USER || '').trim().toLowerCase();
  const pass = String(saved?.pass || process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
  const fromRaw = (saved?.from || process.env.SMTP_FROM || '').trim();
  const from = (fromRaw.includes('@') ? fromRaw : '')
    || (user ? companyFromDisplay(user) : '');

  // user+pass bar bolsa taýýar (verify garaşmaz — tiz)
  const enabled = Boolean(loadNodemailer() && user && pass && user.includes('@') && pass.length >= 16);

  return {
    enabled,
    nodemailerInstalled: Boolean(loadNodemailer()),
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '') === '1' || port === 465,
    user,
    pass,
    from,
    missingPass: Boolean(user && !pass),
    missingUser: Boolean(pass && !user),
    hasPass: Boolean(pass),
    loginSaved: Boolean(saved),
    envEnabled,
    defaultUser: (process.env.SMTP_USER || env.company.email || '').trim() || '',
  };
}

function isConfigured() {
  return mailConfig().enabled;
}

function setupHint() {
  return 'Kompaniýa poçtasy: bir gezek Gmail + App Password saklaň (Sazlamalar ýa-da ugratma formasy).';
}

function getStatus() {
  const c = mailConfig();
  return {
    enabled: c.enabled,
    ready: c.enabled,
    nodemailerInstalled: c.nodemailerInstalled,
    host: c.host || null,
    user: c.enabled ? c.user : null,
    defaultUser: c.defaultUser,
    from: c.enabled ? c.from : null,
    missingPass: Boolean(c.missingPass),
    missingUser: Boolean(c.missingUser),
    hasPass: Boolean(c.hasPass),
    loginSaved: Boolean(c.loginSaved),
    hint: c.enabled ? null : setupHint(),
  };
}

let transporter = null;

function resetTransporter() {
  if (transporter) {
    try { transporter.close(); } catch { /* */ }
  }
  transporter = null;
}

function parseRecipients(raw) {
  const list = String(raw || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((e) => e.includes('@'));
  return [...new Set(list)];
}

function fromField(c) {
  const raw = String(c.from || '').trim();
  const m = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (m && m[2].includes('@')) {
    return { name: m[1].replace(/^"|"$/g, '').trim() || 'HR', address: m[2].trim() };
  }
  if (c.user) return { name: 'HR', address: c.user };
  return raw || undefined;
}

function createTransport(c, port) {
  const nm = loadNodemailer();
  const p = Number(port || c.port || 587);
  const secure = p === 465;
  return nm.createTransport({
    host: 'smtp.gmail.com',
    port: p,
    secure,
    requireTLS: !secure,
    family: 4,
    auth: { user: c.user, pass: c.pass },
    pool: false,
    connectionTimeout: 25000,
    greetingTimeout: 20000,
    socketTimeout: 180000,
    tls: { minVersion: 'TLSv1.2', servername: 'smtp.gmail.com' },
  });
}

function getTransporter() {
  const c = mailConfig();
  if (!loadNodemailer()) {
    throw new ApiError(503, 'nodemailer gurnalmadyk. Terminalda: npm.cmd install nodemailer');
  }
  if (!c.enabled) {
    throw new ApiError(503, setupHint());
  }
  return createTransport(c, c.port || 587);
}

/**
 * Çalt sakla (verify ýok) — her gezek haýal synag etmeýär.
 * Baglanyşyk ilkinji Ugrat-da barlanýar.
 */
async function loginAndVerify({ email, password }) {
  if (!loadNodemailer()) {
    throw new ApiError(503, 'nodemailer gurnalmadyk');
  }
  const cfg = mailConfig();
  const user = String(email || cfg.user || '').trim().toLowerCase();
  let pass = String(password || '').replace(/\s+/g, '').trim();
  // Frontend pass meýdanyny gizlände ýa-da boş — saklanan App Password ulan
  if (!pass || /^x{8,}$/i.test(pass)) pass = cfg.pass || '';
  if (!user.includes('@')) {
    throw new ApiError(400, 'Ugradýan Gmail ýazyň');
  }
  if (pass.length !== 16) {
    throw new ApiError(400, 'App Password 16 harp bolmaly. Adaty Gmail paroly işlemez.');
  }

  writeSavedLogin({
    user,
    pass,
    from: companyFromDisplay(user),
    host: 'smtp.gmail.com',
    port: 587,
  });
  resetTransporter();
  return getStatus();
}

async function sendVia(c, port, payload) {
  const transport = createTransport(c, port);
  try {
    return await transport.sendMail(payload);
  } finally {
    try { transport.close(); } catch { /* */ }
  }
}

async function sendMail(opts) {
  const c = mailConfig();
  if (!loadNodemailer()) {
    throw new ApiError(503, 'nodemailer gurnalmadyk. Terminalda: npm.cmd install nodemailer');
  }
  if (!c.enabled) {
    throw new ApiError(503, setupHint());
  }
  const recipients = parseRecipients(opts.to);
  if (!recipients.length) {
    throw new ApiError(400, 'Alyjy e-poçta dogry däl');
  }
  const payload = {
    from: fromField(c),
    to: recipients.join(', '),
    subject: opts.subject || env.company.name || 'HR',
    html: opts.html,
    text: opts.text || undefined,
    replyTo: opts.replyTo || c.user || undefined,
    attachments: Array.isArray(opts.attachments) ? opts.attachments : undefined,
  };

  const ports = [];
  const preferred = Number(c.port || 587);
  ports.push(preferred);
  if (preferred !== 465) ports.push(465);
  if (preferred !== 587) ports.push(587);

  let lastErr = null;
  for (const port of ports) {
    try {
      const info = await sendVia(c, port, payload);
      console.log(`[mail] ugradyldy → ${recipients.join(', ')} (${info.accepted || []}) port=${port}`);
      return {
        mode: 'sent',
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        to: recipients.join(', '),
        attachmentCount: Array.isArray(opts.attachments) ? opts.attachments.length : 0,
      };
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || '');
      if (/Invalid login|Username and Password not accepted|EAUTH|535|BadCredentials/i.test(msg)) {
        throw new ApiError(401, 'Gmail kabul etmedi — App Password ýa-da email nädogry. Sazlamalar → Poçta täzeläň.');
      }
      console.warn(`[mail] port ${port} şowsuz:`, msg.slice(0, 160));
    }
  }
  const msg = String(lastErr?.message || lastErr || '');
  if (/ECONNECTION|ETIMEDOUT|closed unexpectedly|ECONNRESET|timeout/i.test(msg)) {
    throw new ApiError(502, 'Gmail baglanyşyk haýal/üzülýär. VPN synap görüň, soň täzeden Ugrat.');
  }
  throw new ApiError(502, `E-poçta ugradylmady: ${msg.slice(0, 160)}`);
}

function buildComposeLinks({ to, subject, body }) {
  const toAddr = String(to || '').trim();
  const su = String(subject || '').trim();
  const bodyText = String(body || '').slice(0, 900);
  const q = new URLSearchParams();
  q.set('view', 'cm');
  q.set('fs', '1');
  q.set('tf', '1');
  if (toAddr) q.set('to', toAddr);
  if (su) q.set('su', su);
  if (bodyText) q.set('body', bodyText);
  const gmailUrl = `https://mail.google.com/mail/?${q.toString()}`;
  return {
    gmailUrl,
    mailtoUrl: `mailto:${toAddr ? encodeURIComponent(toAddr) : ''}?subject=${encodeURIComponent(su)}&body=${encodeURIComponent(bodyText)}`,
    to: toAddr,
    subject: su,
    body: bodyText,
  };
}

module.exports = {
  isConfigured,
  getStatus,
  sendMail,
  mailConfig,
  buildComposeLinks,
  setupHint,
  loginAndVerify,
  clearSavedLogin,
  resetTransporter,
  readSavedLogin,
  writeSavedLogin,
  persistEnvMail,
};
