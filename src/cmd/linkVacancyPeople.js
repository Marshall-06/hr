require('dotenv').config();
const sequelize = require('../config/database');
const vacancyService = require('../services/vacancyService');

const run = async () => {
  try {
    await sequelize.authenticate();
    const result = await vacancyService.linkPeopleFromDb({ limit: 8000 });
    console.log(
      `Baglandy: ${result.scanned}. `
      + `Forum operator: ${result.operatorsLinked}. `
      + `Jogapkär: ${result.contactsLinked}.`,
    );
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
