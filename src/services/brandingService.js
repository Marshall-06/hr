const env = require('../config/env');

/** Public branding — auth gerekmeýär (login / açyk sahypa) */
function getBranding() {
  return {
    brand: { ...env.brand },
    company: {
      name: env.company.name,
      email: env.company.email,
      phone: env.company.phone,
      address: env.company.address,
    },
    publicSiteKeyHint: env.publicSiteKey ? 'set' : null,
  };
}

module.exports = { getBranding };
