require('dotenv').config();

/**
 * Agentlik (white-label) sazlamasy.
 * Kerwen — default. Başga HR agentlik: diňe .env üýtgedýär, kod galýar.
 */
function pick(key, fallback) {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

const brandShort = pick('BRAND_SHORT', 'Kerwen');
const brandFull = pick('BRAND_FULL', 'Kerwen Agenstwa');

module.exports = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5433,
    name: process.env.DB_NAME || 'kerwen_kadr',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'kerwen_kadr_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  /** Açyk (user) sahypa üçin gizlin açar: /open/<key> */
  publicSiteKey: process.env.PUBLIC_SITE_KEY || 'kerwen-open',
  publicCookie: pick('PUBLIC_COOKIE_NAME', 'kerwen_public'),

  /** UI / paneliň markasy (başga agentlik üçin üýtgediň) */
  brand: {
    short: brandShort,
    full: brandFull,
    panelTitle: pick('BRAND_PANEL_TITLE', `${brandShort} Panel`),
    tagline: pick('BRAND_TAGLINE', 'Kadrlar Agentligi'),
    heroText: pick(
      'BRAND_HERO_TEXT',
      `${brandFull} — işe ýerleşmek üçin ygtybarly hyzmat. Anketa dolduryň, wakansiýalary gözden geçiriň.`,
    ),
    logoUrl: pick('BRAND_LOGO_URL', '/assets/logo.png'),
    faviconUrl: pick('BRAND_FAVICON_URL', '/assets/favicon.png'),
  },

  company: {
    name: process.env.COMPANY_NAME || '"Täjir Kerweni" Hojalyk Jemgyýeti',
    director: process.env.COMPANY_DIRECTOR || 'Gurbanow Omar Baýramgeldiýewiç',
    directorShort: process.env.COMPANY_DIRECTOR_SHORT || 'Gurbanow O.B.',
    email: process.env.COMPANY_EMAIL || 'kadr.kerwen@gmail.com',
    phone: process.env.COMPANY_PHONE || '+993 65 24 28 56',
    address: process.env.COMPANY_ADDRESS || 'Aşgabat ş. B.Amanow köç. jaý №50',
    directorPassportSeries: process.env.COMPANY_DIRECTOR_PASSPORT_SERIES || 'I-AH',
    directorPassportNumber: process.env.COMPANY_DIRECTOR_PASSPORT_NUMBER || '089111',
    directorPassportDate: process.env.COMPANY_DIRECTOR_PASSPORT_DATE || '17.11.1999',
    directorPassportIssuedBy: process.env.COMPANY_DIRECTOR_PASSPORT_ISSUED_BY || 'Ahal wel. Gäwers etr. PB.',
    bank: process.env.COMPANY_BANK || '"Rysgal" PTB, ş. Aşgabat',
    account: process.env.COMPANY_ACCOUNT || '232029341738628092 85 000',
    mfo: process.env.COMPANY_MFO || '390101738',
    ssb: process.env.COMPANY_SSB || '102211003337',
  },
};
