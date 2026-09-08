/** Sanany türkmen dilinde ýazgy (aýlyk / töleg üçin) */
const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'bäş', 'alty', 'ýedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'on bir', 'on iki', 'on üç', 'on dört', 'on bäş', 'on alty', 'on ýedi', 'on sekiz', 'on dokuz'];
const TIES = ['', '', 'on', 'otuz', 'elli', 'altmyş', 'ýetmiş', 'segsen', 'togsan'];

function intWords(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0) return '';
  if (num === 0) return 'nol';

  const parts = [];
  const million = Math.floor(num / 1000000);
  const thousand = Math.floor((num % 1000000) / 1000);
  const rest = num % 1000;

  if (million) {
    parts.push(million === 1 ? 'bir million' : `${intWords(million)} million`);
  }
  if (thousand) {
    parts.push(thousand === 1 ? 'bir müň' : `${intWords(thousand)} müň`);
  }
  if (rest) {
    const h = Math.floor(rest / 100);
    const t = Math.floor((rest % 100) / 10);
    const o = rest % 10;
    const chunk = [];
    if (h) chunk.push(h === 1 ? 'yüz' : `${ONES[h]} yüz`);
    if (t >= 2) chunk.push(TIES[t]);
    else if (t === 1) chunk.push(TENS[o]);
    else if (o) chunk.push(ONES[o]);
    parts.push(chunk.join(' ').trim());
  }
  return parts.join(' ').trim();
}

function manatWords(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100);
  let text = intWords(whole);
  if (frac > 0) {
    text += ` ${intWords(frac)} teňňe`;
  }
  return `${text} manat`;
}

module.exports = { intWords, manatWords };
