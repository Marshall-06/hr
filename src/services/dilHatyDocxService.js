/**
 * Dil haty + Ynanç haty — Word şablon (templates/dil-haty.docx) doldurmak.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const vacancyService = require('./vacancyService');

const TEMPLATE = path.join(__dirname, '../../templates/dil-haty.docx');

function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isBlankish(token) {
  const t = String(token || '');
  if (!t.trim()) return false;
  // diňe _ we boşluk / «» sanlar fragmentleri
  return /^[\s_«»"\-–—./0-9]*_[\s_«»"\-–—./0-9]*$/.test(t) || /^_{2,}$/.test(t.trim());
}

function yearTail(y) {
  const s = String(y || '').trim();
  if (/^\d{4}$/.test(s)) return s.slice(-2);
  if (/^\d{2}$/.test(s)) return s;
  return '__';
}

/**
 * Underscore setirlerini yzygiderli maglumat bilen çalyş.
 * Word şablony w:t böleklerine bölünen — boş setirleri birleşdirip doldurýarys.
 */
function fillDocumentXml(xml, data) {
  const re = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    parts.push({
      full: m[0],
      open: m[1],
      text: m[2],
      close: m[3],
      index: m.index,
      length: m[0].length,
    });
  }

  const values = [
    // ŞERTNAMA №
    data.contractPart1, data.contractPart2, data.contractPart3,
    // DIL HATY sene
    data.docDay, data.docMonth, yearTail(data.docYear),
    // Men, — ady familiýa
    data.fullName,
    // Pasport
    data.passportSeries, data.passportNumber, data.passportIssuedBy, data.passportIssuedDate,
    // Adresler
    data.registrationAddress, data.currentAddress,
    // Şertnama № (ikilenç)
    data.contractPart1, data.contractPart2, data.contractPart3,
    // Işe başlan sene
    data.workDay, data.workMonth, yearTail(data.workYear),
    // Kärhana / wezipe / aýlyk
    data.companyName, data.position, data.salary, data.salaryWords,
    // Töleg
    data.feeDisplay, data.feeWords,
    // F.A.A. (goly ýanynda) — elde ýazylar
    '',
    // YNANÇ sene
    data.docDay, data.docMonth, yearTail(data.docYear),
    // Şertnama №
    data.contractPart1, data.contractPart2, data.contractPart3,
    // Men, (ynanç) — ady familiýa
    data.fullName,
    // Kärhana / salgy
    data.companyName, data.agencyAddress || data.registrationAddress,
    // Möhlet
    data.validDay, data.validMonth, yearTail(data.validYear),
    // F.A.A. (goly ýanynda) — elde ýazylar
    '',
  ].map((v) => String(v || '').trim());

  // Blank run-lary toparyna birleşdir
  const groups = [];
  let i = 0;
  while (i < parts.length) {
    if (!isBlankish(parts[i].text)) {
      i += 1;
      continue;
    }
    const start = i;
    let end = i;
    while (end + 1 < parts.length && isBlankish(parts[end + 1].text)) end += 1;
    // gaty gysga "_" fragmentleri (ýekeçe) — goňşy bilen birleşdirilen eýýäm
    groups.push({ start, end });
    i = end + 1;
  }

  const replacements = new Map(); // partIndex -> new text
  let vi = 0;
  for (const g of groups) {
    if (vi >= values.length) break;
    const val = values[vi++];
    if (!val) continue;
    // ilkinji tokena ýaz, galanlary boşalt
    replacements.set(g.start, escXml(val));
    for (let k = g.start + 1; k <= g.end; k += 1) {
      replacements.set(k, '');
    }
  }

  // XML-i yza ýygna (öňünden soňa çalyşmak offsety bozýar)
  let out = '';
  let cursor = 0;
  for (let p = 0; p < parts.length; p += 1) {
    const part = parts[p];
    out += xml.slice(cursor, part.index);
    if (replacements.has(p)) {
      out += part.open + replacements.get(p) + part.close;
    } else {
      out += part.full;
    }
    cursor = part.index + part.length;
  }
  out += xml.slice(cursor);
  return out;
}

function buildFileName(data) {
  const num = String(data?.contractNumber || data?.assignmentId || 'x')
    .replace(/[^\w\-№./]/g, '_')
    .slice(0, 40);
  const name = String(data?.fullName || 'anketa')
    .replace(/[^\w\-а-яА-ЯёЁäÄöÖüÜňŇýÝşŞžŽçÇ\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return `Dil_haty_${num}${name ? `_${name}` : ''}.docx`;
}

async function generateDocxBuffer(assignmentId) {
  const data = await vacancyService.getDilHatyPrintData(assignmentId);
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error('templates/dil-haty.docx tapylmady');
  }
  const buf = fs.readFileSync(TEMPLATE);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Word document.xml ýok');
  const xml = await docFile.async('string');
  const filled = fillDocumentXml(xml, data);
  zip.file('word/document.xml', filled);
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  return { buffer: out, data };
}

module.exports = {
  generateDocxBuffer,
  buildFileName,
  fillDocumentXml,
};
