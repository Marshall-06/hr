const env = require('../config/env');
const { formatFullName } = require('./helpers');
const { formatContractDate } = require('./contractTemplate');
const { manatWords } = require('./turkmenMoneyWords');

function parseMoney(raw) {
  if (raw == null || raw === '') return 0;
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return 0;
  const mul = /(müň|myn|тыс)/i.test(s) ? 1000 : 1;
  s = (s.split(/[+/]/)[0] || s).replace(/\s+/g, '').replace(/%/g, '').replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  let n;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = parseFloat(s.replace(/\./g, ''));
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) n = parseFloat(s.replace(/,/g, ''));
  else {
    const nums = s.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
    n = nums && nums.length ? parseFloat(nums[0]) : 0;
  }
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * mul * 100) / 100;
}

function splitPassport(passportNumber = '', passportIssued = '') {
  const raw = String(passportNumber || '').trim();
  let series = '';
  let number = '';
  const m = raw.match(/^([A-Za-zА-Яа-яЁёİıŞşÄäÖöÜüÝýŇňÇç\-]+(?:\s+[A-Za-zА-Яа-яЁёİıŞşÄäÖöÜüÝýŇňÇç\-]+)*)\s+(.+)$/);
  if (m) {
    series = m[1].trim();
    number = m[2].trim();
  } else if (raw) {
    number = raw;
  }
  const issued = String(passportIssued || '').trim();
  let issuedDate = '';
  let issuedBy = issued;
  const dm = issued.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (dm) {
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
    issuedDate = `${String(dm[1]).padStart(2, '0')}.${String(dm[2]).padStart(2, '0')}.${y}`;
    issuedBy = issued.replace(dm[0], '').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
  }
  return { series, number, issuedDate, issuedBy, issuedFull: issued };
}

function splitContractNumber(anketaNumber = '') {
  const parts = String(anketaNumber || '').trim().split('/').map((p) => p.trim()).filter(Boolean);
  return {
    part1: parts[0] || '',
    part2: parts[1] || '',
    part3: parts[2] || '',
    full: String(anketaNumber || '').trim(),
  };
}

function formatAddress(city, address) {
  const parts = [String(city || '').trim(), String(address || '').trim()].filter(Boolean);
  return parts.join(' ').trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeIsoDay(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

function addMonthsIsoDay(isoDay, months = 1) {
  const s = normalizeIsoDay(isoDay);
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = dt.getDate();
  dt.setMonth(dt.getMonth() + months);
  // “x aý” goşlanda, 30-njy / 31-nji bolup gidse “0” usul bilen ýola düşmek
  if (dt.getDate() !== day) dt.setDate(0);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function moneyWordsText(amount) {
  const full = manatWords(amount);
  // `manatWords()` içinde “manat” sözi bar — HTML/şablonda soňundan “manat” aýdylýandy üçin aýyrýarys.
  return String(full || '').replace(/\s*manat\s*$/i, '').trim();
}

function buildDilHatyPrintData(assignment, anketa, vacancy, opts = {}) {
  const todayIso = opts.documentDate || new Date().toISOString().slice(0, 10);
  const docDate = formatContractDate(todayIso);
  const acceptedIso = String(assignment?.acceptedAt || '').slice(0, 10);
  const workDate = formatContractDate(acceptedIso || todayIso);
  const validUntilIso = addMonthsIsoDay(todayIso, 3) || todayIso;
  const validDate = formatContractDate(validUntilIso);

  const familyName = anketa?.familyName || '';
  const firstName = anketa?.firstName || '';
  const patronymic = anketa?.patronymic || '';
  const fullName = formatFullName(familyName, firstName, patronymic);
  const passport = splitPassport(anketa?.passportNumber, anketa?.passportIssued);

  const registrationAddress = formatAddress(anketa?.registrationCity, anketa?.registrationAddress);
  const currentAddress = String(anketa?.currentAddress || '').trim() || registrationAddress;

  const contract = splitContractNumber(anketa?.anketaNumber);
  const salaryAmount = parseMoney(vacancy?.salary);
  const feeAmount = Math.round(salaryAmount * 0.5 * 100) / 100;
  const salaryDisplay = salaryAmount > 0
    ? String(salaryAmount).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
    : String(vacancy?.salary || '').trim();
  const feeDisplay = feeAmount > 0 ? String(feeAmount).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') : '';

  const companyName = String(vacancy?.companyName || '').trim();
  const position = String(vacancy?.position || '').trim();
  const agencyShort = '"Täjir Kerweni" H.J.';

  return {
    documentDate: todayIso,
    docDay: docDate.day,
    docMonth: docDate.month,
    docYear: docDate.year,
    city: 'Aşgabat',
    contractNumber: contract.full,
    contractPart1: contract.part1,
    contractPart2: contract.part2,
    contractPart3: contract.part3,
    familyName,
    firstName,
    patronymic,
    fullName,
    shortName: [
      familyName,
      firstName ? `${firstName[0]}.` : '',
      patronymic ? `${patronymic[0]}.` : '',
    ].filter(Boolean).join(' '),
    passportSeries: passport.series,
    passportNumber: passport.number,
    passportIssuedBy: passport.issuedBy,
    passportIssuedDate: passport.issuedDate,
    passportIssued: passport.issuedFull,
    registrationAddress,
    currentAddress,
    agencyName: env.company.name,
    agencyShort,
    workDay: workDate.day,
    workMonth: workDate.month,
    workYear: workDate.year,
    acceptedAt: acceptedIso,
    companyName,
    position,
    salary: salaryDisplay,
    salaryAmount,
    salaryWords: salaryAmount > 0 ? moneyWordsText(salaryAmount) : '',
    feeAmount,
    feeDisplay,
    feeWords: feeAmount > 0 ? moneyWordsText(feeAmount) : '',
    feePercent: 50,
    directorName: env.company.director,
    directorPassportSeries: env.company.directorPassportSeries,
    directorPassportNumber: env.company.directorPassportNumber,
    directorPassportDate: env.company.directorPassportDate,
    directorPassportIssuedBy: env.company.directorPassportIssuedBy,
    agencyAddress: env.company.address,
    validDay: validDate.day,
    validMonth: validDate.month,
    validYear: validDate.year,
    assignmentId: assignment?.id,
    anketaId: anketa?.id,
    vacancyId: vacancy?.id,
  };
}

module.exports = {
  buildDilHatyPrintData,
  parseMoney,
  splitPassport,
  splitContractNumber,
};
