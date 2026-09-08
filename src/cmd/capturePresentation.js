const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '../public/assets/presentation');
const BASE = 'http://localhost:8000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const puppeteer = require('puppeteer-core');

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();

  await page.goto(`${BASE}/admin/login.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '01-login.png'), fullPage: false });

  await page.type('input[name="username"]', 'admin');
  await page.type('input[name="password"]', 'admin123');
  await page.click('#login-form button[type="submit"]');
  await page.waitForFunction(() => location.pathname.includes('dashboard'), { timeout: 60000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '02-dashboard.png'), fullPage: false });

  async function openTab(tab) {
    await page.evaluate((t) => {
      const link = document.querySelector(`[data-tab="${t}"]`);
      if (link) link.click();
    }, tab);
    await sleep(1400);
  }

  await openTab('anketas');
  await page.screenshot({ path: path.join(OUT, '03-anketas.png'), fullPage: false });

  await openTab('vacancies');
  await page.screenshot({ path: path.join(OUT, '04-vacancies.png'), fullPage: false });

  await openTab('match');
  await page.screenshot({ path: path.join(OUT, '05-match.png'), fullPage: false });

  await openTab('assigned');
  await page.screenshot({ path: path.join(OUT, '06-assigned.png'), fullPage: false });

  await openTab('reports');
  await page.screenshot({ path: path.join(OUT, '07-reports.png'), fullPage: false });

  await openTab('excel');
  await page.screenshot({ path: path.join(OUT, '08-excel.png'), fullPage: false });

  await page.goto(`${BASE}/admin/anketa-new.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, '09-anketa-new.png'), fullPage: false });

  await page.goto(`${BASE}/admin/vacancy-new.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, '10-vacancy-new.png'), fullPage: false });

  await browser.close();
  console.log('OK', OUT);
  console.log(fs.readdirSync(OUT).join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
