const { Op } = require('sequelize');
const { Vacancy, Anketa } = require('../models');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const mailService = require('./mailService');
const { fullName } = require('./anketaPrintHtml');
const { buildAnketaJpgAttachment, buildAnketaMailAttachment, jpgFileName } = require('./anketaImageService');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Operator telefonlary — e-poçta aşagynda ugradyjynyň belgisi.
 * Merjen 865242856 · Mahri 863622296 · Enejan 865124815
 */
const OPERATOR_PHONES = [
  { keys: ['merjen', 'merjen'], phone: '865242856' },
  { keys: ['mahri', 'mahri'], phone: '863622296' },
  { keys: ['enejan', 'enejan'], phone: '865124815' },
];

function foldName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ý/g, 'y').replace(/ň/g, 'n').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ž/g, 'z').replace(/ä/g, 'a')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatOperatorPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('8')) {
    return '+993 ' + d.slice(1, 3) + ' ' + d.slice(3, 5) + ' ' + d.slice(5, 7) + ' ' + d.slice(7);
  }
  if (d.length === 8) {
    return '+993 ' + d.slice(0, 2) + ' ' + d.slice(2, 4) + ' ' + d.slice(4, 6) + ' ' + d.slice(6);
  }
  if (d.length >= 11 && d.includes('993')) {
    const x = d.replace(/^.*?993/, '');
    if (x.length >= 8) {
      return '+993 ' + x.slice(0, 2) + ' ' + x.slice(2, 4) + ' ' + x.slice(4, 6) + ' ' + x.slice(6, 8);
    }
  }
  return String(raw || '').trim();
}

function resolveOperatorPhone(user) {
  if (!user) return formatOperatorPhone(env.company.phone) || '';
  const parts = [user.username, user.fullName, String(user.fullName || '').split(/\s+/)[0]]
    .map(foldName)
    .filter(Boolean);
  for (const row of OPERATOR_PHONES) {
    for (const key of row.keys) {
      const k = foldName(key);
      if (!k) continue;
      if (parts.some((p) => p === k || p.startsWith(k + ' ') || p.includes(' ' + k))) {
        return formatOperatorPhone(row.phone);
      }
    }
  }
  return formatOperatorPhone(env.company.phone) || '';
}

function senderFooter(user) {
  const senderName = (user && (user.fullName || user.username)) || (env.brand && env.brand.short) || 'Kerwen';
  const senderPhone = resolveOperatorPhone(user);
  return { senderName, senderPhone };
}



/**
 * Gysga örtük hat — anketalar JPG surat hökmünde göni görkezilýär.
 */
function buildCoverHtml({ vacancy, anketas, note, senderName, senderPhone, attachments }) {
  const company = vacancy.companyName || '—';
  const position = vacancy.position || '—';
  const contact = vacancy.contactName || '';
  const list = anketas.map((a, i) => {
    const file = attachments[i]?.filename || jpgFileName(a);
    return `<li style="margin:4px 0"><strong>№ ${esc(a.anketaNumber || '—')}</strong> — ${esc(fullName(a))}
      <span style="color:#666">(${esc(file)})</span></li>`;
  }).join('');

  const images = attachments.map((att, i) => {
    const a = anketas[i];
    const cid = att.cid || `anketa-${a?.id || i}@kerwen`;
    return `
    <div style="margin:18px 0;padding:12px;border:1px solid #e6e0d4;border-radius:10px;background:#fffcf7">
      <p style="margin:0 0 8px;font-weight:700">
        № ${esc(a?.anketaNumber || '—')} — ${esc(fullName(a || {}))}
      </p>
      <img src="cid:${esc(cid)}" alt="Anketa"
        style="display:block;width:100%;max-width:720px;height:auto;border:1px solid #ddd;border-radius:4px" />
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#222;line-height:1.45">
  <div style="max-width:760px;margin:0 auto">
    <h2 style="margin:0 0 8px;color:#2a2f36">${esc(env.brand.full)} — anketalar</h2>
    <p style="margin:0 0 12px;color:#555">
      ${contact ? `Hormatly <strong>${esc(contact)}</strong>,` : 'Hormatly alyjy,'}
      <strong>${esc(company)}</strong> / <strong>${esc(position)}</strong> üçin
      saýlanan anketalar <strong>aşakda surat (JPG)</strong> hökmünde.
    </p>
    ${note ? `<p style="background:#f7f4ee;padding:10px 12px;border-radius:8px;border:1px solid #e6e0d4"><em>${esc(note)}</em></p>` : ''}
    <p style="margin:12px 0 4px;font-weight:700">Goşundylar (${anketas.length}):</p>
    <ol style="margin:0 0 14px;padding-left:20px">${list}</ol>
    ${images}
    <p style="margin:16px 0 0;color:#555;font-size:13px">
      Habarlaşmak: ${esc(senderPhone || env.company.phone || '')}
      ${env.company.email ? ` · ${esc(env.company.email)}` : ''}
    </p>
    <p style="margin:8px 0 0;color:#888;font-size:12px">
      Ugratdy: ${esc(senderName || env.brand.short)}${senderPhone ? ` · tel: ${esc(senderPhone)}` : ''} · ${esc(env.company.name || env.brand.full)}
    </p>
  </div>
</body></html>`;
}

function buildCoverText({ vacancy, anketas, note, senderName, senderPhone, attachmentNames }) {
  const lines = [
    `${env.brand.full} — anketalar`,
    `Kärhana: ${vacancy.companyName || '—'}`,
    `Wezipe: ${vacancy.position || '—'}`,
    '',
    'Doly anketalar goşundyda (JPG surat).',
    '',
  ];
  if (note) lines.push(`Bellik: ${note}`, '');
  anketas.forEach((a, i) => {
    lines.push(`${i + 1}. № ${a.anketaNumber || '—'} — ${fullName(a)} [${attachmentNames[i] || ''}]`);
  });
  lines.push('', `Habarlaşmak: ${senderPhone || env.company.phone || ''}`, `Ugratdy: ${senderName || 'Kerwen'}${senderPhone ? ` · tel: ${senderPhone}` : ''}`);
  return lines.join('\n');
}

/**
 * Wakansiýa jogapkäriniň e-poçtasyna saýlanan anketalary ugrat (JPG surat).
 */
async function sendCandidatesToContact(vacancyId, { anketaIds, to, note, scores }, currentUser) {
  const vacancy = await Vacancy.findByPk(vacancyId);
  if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');

  const ids = [...new Set((anketaIds || []).map((x) => Number(x)).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, 'Iň azyndan 1 anketa saýlaň');

  const recipient = String(to || vacancy.contactEmail || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new ApiError(400, 'Alyjy e-poçta ýok. Modalda email ýazyň.');
  }

  const anketas = await Anketa.findAll({
    where: { id: { [Op.in]: ids } },
  });
  if (!anketas.length) throw new ApiError(404, 'Anketa tapylmady');

  const byId = new Map(anketas.map((a) => [a.id, a]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  const attachments = [];
  for (const a of ordered) {
    const file = await buildAnketaMailAttachment(a);
    attachments.push({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
      cid: file.cid,
      contentDisposition: 'inline',
    });
  }
  const attachmentNames = attachments.map((x) => x.filename);

  const { senderName, senderPhone } = senderFooter(currentUser);
  const subject = `Anketalar: ${vacancy.position || 'wezipe'} — ${vacancy.companyName || 'Kerwen'} (${ordered.length})`;

  const noteText = note ? String(note).slice(0, 2000) : '';
  const html = buildCoverHtml({
    vacancy,
    anketas: ordered,
    note: noteText,
    senderName,
    senderPhone,
    attachments,
  });
  const text = buildCoverText({
    vacancy,
    anketas: ordered,
    note: noteText,
    senderName,
    senderPhone,
    attachmentNames,
  });

  if (!mailService.isConfigured()) {
    const st = mailService.getStatus();
    throw new ApiError(
      503,
      st.hint || 'E-poçta awtomatik däl. .env: MAIL_ENABLED=1 we SMTP_PASS (Gmail App Password), soň serweri restart.',
    );
  }

  const result = await mailService.sendMail({
    to: recipient,
    subject,
    html,
    text,
    attachments,
  });

  // E-poçta ugradylyp soň — saýlanan anketalary awtomatik hödürle
  const vacancyService = require('./vacancyService');
  const assignedIds = [];
  const assignErrors = [];
  for (const a of ordered) {
    try {
      await vacancyService.assignCandidate(
        vacancyId,
        a.id,
        'Hödürlendi',
        currentUser,
        noteText || null,
      );
      assignedIds.push(a.id);
    } catch (err) {
      assignErrors.push(`№ ${a.anketaNumber || a.id}: ${err.message}`);
    }
  }

  return {
    mode: 'sent',
    ...result,
    vacancyId: vacancy.id,
    contactName: vacancy.contactName || null,
    contactEmail: recipient,
    count: ordered.length,
    anketaNumbers: ordered.map((a) => a.anketaNumber),
    attachments: attachmentNames,
    mailConfigured: true,
    assignedCount: assignedIds.length,
    assignedIds,
    assignErrors: assignErrors.slice(0, 10),
  };
}

/**
 * Gmail web compose üçin: subject/body + her anketa JPG faýlynyň maglumaty.
 */
async function prepareGmailCompose(vacancyId, { anketaIds, to, note }, currentUser) {
  const vacancy = await Vacancy.findByPk(vacancyId);
  if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');

  const ids = [...new Set((anketaIds || []).map((x) => Number(x)).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, 'Iň azyndan 1 anketa saýlaň');

  const anketas = await Anketa.findAll({
    where: { id: { [Op.in]: ids } },
  });
  if (!anketas.length) throw new ApiError(404, 'Anketa tapylmady');

  const byId = new Map(anketas.map((a) => [a.id, a]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  const files = ordered.map((a) => ({
    anketaId: a.id,
    anketaNumber: a.anketaNumber || null,
    name: fullName(a),
    filename: jpgFileName(a),
  }));

  const { senderName, senderPhone } = senderFooter(currentUser);
  const subject = `Anketalar: ${vacancy.position || 'wezipe'} — ${vacancy.companyName || 'Kerwen'} (${ordered.length})`;
  const noteText = note ? String(note).slice(0, 500) : '';
  const bodyLines = [
    vacancy.contactName ? `Hormatly ${vacancy.contactName},` : 'Hormatly alyjy,',
    '',
    `${vacancy.companyName || '—'} / ${vacancy.position || '—'} üçin saýlanan anketalar goşundyda (JPG surat).`,
    '',
    ...files.map((f, i) => `${i + 1}. № ${f.anketaNumber || '—'} — ${f.name} (${f.filename})`),
    '',
    noteText ? `Bellik: ${noteText}` : '',
    '',
    `${env.brand.full} · Habarlaşmak: ${senderPhone || env.company.phone || ''} · ${env.company.email || ''}`,
    `Ugratdy: ${senderName}${senderPhone ? ` · tel: ${senderPhone}` : ''}`,
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''));

  const body = bodyLines.join('\n');
  const recipient = String(to || vacancy.contactEmail || '').trim();
  const links = mailService.buildComposeLinks({ to: recipient, subject, body });

  return {
    mode: 'compose',
    vacancyId: vacancy.id,
    contactName: vacancy.contactName || null,
    contactEmail: recipient || null,
    count: ordered.length,
    subject,
    body,
    ...links,
    files,
  };
}

/**
 * Bir anketa JPG goşundysyny gaýdyp ber (Gmail compose ýüklemek üçin).
 */
async function getComposeAttachment(vacancyId, anketaId) {
  const vacancy = await Vacancy.findByPk(vacancyId);
  if (!vacancy) throw new ApiError(404, 'Wakansiýa tapylmady');

  const anketa = await Anketa.findByPk(Number(anketaId));
  if (!anketa) throw new ApiError(404, 'Anketa tapylmady');

  return buildAnketaJpgAttachment(anketa);
}

/**
 * Bir anketa — e-poçta ugrat (wakansiýa bar bolsa hödürleme hem).
 */
async function sendAnketaToContact(anketaId, { to, note, vacancyId }, currentUser) {
  const id = Number(anketaId);
  if (!id) throw new ApiError(400, 'Anketa ID ýok');

  const vacId = Number(vacancyId);
  if (vacId > 0) {
    return sendCandidatesToContact(vacId, {
      anketaIds: [id],
      to,
      note,
    }, currentUser);
  }

  const anketa = await Anketa.findByPk(id);
  if (!anketa) throw new ApiError(404, 'Anketa tapylmady');

  const recipient = String(to || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new ApiError(400, 'Alyjy e-poçta ýazyň');
  }

  const file = await buildAnketaMailAttachment(anketa);
  const attachments = [{
    filename: file.filename,
    content: file.content,
    contentType: file.contentType,
    cid: file.cid,
    contentDisposition: 'inline',
  }];

  const { senderName, senderPhone } = senderFooter(currentUser);
  const name = fullName(anketa);
  const subject = `Anketa № ${anketa.anketaNumber || id} — ${name}`;
  const noteText = note ? String(note).slice(0, 2000) : '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Segoe UI,Arial,sans-serif;color:#222">
    <p>Hormatly alyjy,</p>
    <p><strong>№ ${esc(anketa.anketaNumber || '—')}</strong> — ${esc(name)} (JPG surat goşundy).</p>
    ${noteText ? `<p><em>${esc(noteText)}</em></p>` : ''}
    <p style="margin-top:16px;color:#555;font-size:13px">Habarlaşmak: ${esc(senderPhone || env.company.phone || '')}</p>
    <p style="margin-top:8px;color:#888;font-size:12px">Ugratdy: ${esc(senderName)}${senderPhone ? ` · tel: ${esc(senderPhone)}` : ''} · ${esc(env.brand.full)}</p>
  </body></html>`;
  const text = [
    subject,
    '',
    noteText ? `Bellik: ${noteText}` : '',
    '',
    `Habarlaşmak: ${senderPhone || env.company.phone || ''}`,
    `Ugratdy: ${senderName}${senderPhone ? ` · tel: ${senderPhone}` : ''}`,
  ].filter(Boolean).join('\n');

  if (!mailService.isConfigured()) {
    const st = mailService.getStatus();
    throw new ApiError(503, st.hint || 'E-poçta sazlanmady');
  }

  const result = await mailService.sendMail({
    to: recipient,
    subject,
    html,
    text,
    attachments,
  });

  return {
    mode: 'sent',
    ...result,
    anketaId: id,
    anketaNumber: anketa.anketaNumber || null,
    contactEmail: recipient,
    count: 1,
    attachments: [file.filename],
    source: file.source || 'program',
    mailConfigured: true,
  };
}

module.exports = {
  sendCandidatesToContact,
  prepareGmailCompose,
  getComposeAttachment,
  sendAnketaToContact,
};
