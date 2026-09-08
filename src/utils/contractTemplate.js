const env = require('../config/env');

const monthNames = [
  'Ýanwar', 'Fewral', 'Mart', 'Aprel', 'Maý', 'Iýun',
  'Iýul', 'Awgust', 'Sentýabr', 'Oktýabr', 'Noýabr', 'Dekabr',
];

const formatContractDate = (dateStr) => {
  let y;
  let m;
  let day;
  const iso = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      y = d.getFullYear();
      m = d.getMonth();
      day = d.getDate();
    }
  }
  if (y == null || m == null || day == null) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
    day = now.getDate();
  }
  return { day, month: monthNames[m], year: y };
};

const getDefaultContractContent = (data) => {
  const {
    contractNumber,
    contractDate,
    jobSeekerName,
    anketaNumber,
    executorName,
    executorDirector,
    serviceFeePercent = 50,
  } = data;

  return `SERTNAMA № ${contractNumber}
${contractDate}

SERTNAMANYN TARAPLARY

Bir tarapdan ustaw esasynda hereket edýän "${executorName}", direktory ${executorDirector} wekilçiliginde mundan beýläk "Ýerine ýetiriji" diýilip atlandyryljak we beýleki tarapdan raýat ${jobSeekerName} mundan beýläk "Iş gözleýji" diýilip atlandyryljak, ikisi bilelikde bolsa "Taraplar" diýilip atlandyryljaklar öz aralarynda şu aşakdakylar hakynda şertnama baglaşdylar.

ŞERTNAMANYŇ MAZMUNY

Iş gözleýji işe ýerleşmek maksady bilen öz dolduran anketasyndaky maglumatlara we talaplara laýyk gelýän wezipäni gözläp tapyp bermek hyzmatyny Ýerine ýetirije tabşyrýar. Ýerine ýetiriji bolsa şu şertnamanyň aýrylmaz bölegi bolup durýan Iş gözleýijiniň № ${anketaNumber} anketasyna laýyklykda şol wezipä gabat gelýän elinde bar bolan boş iş ýerlerini hödürlemäge borçlanyar.

HYZMATLARYŇ TÖLEGI: ${serviceFeePercent}%`;
};

const getContractPrintData = (contract, anketa = null) => {
  const details = contract.jobSeekerDetails || {};
  const dateInfo = formatContractDate(contract.contractDate);
  const familyName = details.familyName || anketa?.familyName || '';
  const firstName = details.firstName || anketa?.firstName || '';
  const patronymic = details.patronymic || anketa?.patronymic || '';
  const shortName = [
    familyName,
    firstName ? `${firstName[0]}.` : '',
    patronymic ? `${patronymic[0]}.` : '',
  ].filter(Boolean).join(' ');

  return {
    contractNumber: contract.contractNumber,
    day: dateInfo.day,
    month: dateInfo.month,
    year: dateInfo.year,
    city: 'Aşgabat',
    executorName: contract.executorName || env.company.name,
    executorDirector: env.company.director,
    executorDirectorShort: env.company.directorShort,
    jobSeekerName: contract.jobSeekerName,
    familyName,
    firstName,
    patronymic,
    shortName,
    anketaNumber: anketa?.anketaNumber || details.anketaNumber || contract.contractNumber,
    phone: anketa?.phone || details.phone || '',
    address: anketa?.registrationAddress || anketa?.currentAddress || details.address || '',
    // Passport — hökmany anketadan (Word / şertnama rekwiziti)
    passportNumber: anketa?.passportNumber || details.passportNumber || '',
    passportIssued: anketa?.passportIssued || details.passportIssued || '',
    serviceFeePercent: contract.serviceFeePercent || 50,
    company: env.company,
  };
};

const getContractTemplate = (data) => getDefaultContractContent({
  ...data,
  executorName: data.executorName || env.company.name,
  executorDirector: data.executorDirector || env.company.director,
});

module.exports = {
  getDefaultContractContent,
  getContractTemplate,
  getContractPrintData,
  formatContractDate,
};
