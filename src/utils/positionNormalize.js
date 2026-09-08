/**
 * Wezipe atlaryny birleşdirmek: uly/kiçi harp, Kirill/Latyn, ýazylyş tapawudy.
 */

// Türkmen Latyn bilen gabat gelsin diýip (менеджер → menejer, сатыжы → satyjy)
const CYR_TO_LAT = {
  а: 'a', б: 'b', в: 'w', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'c', ш: 's', щ: 's', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ә: 'a', ө: 'o', ү: 'u', ң: 'n', һ: 'h', ғ: 'g', қ: 'k',
  і: 'i', ї: 'i', є: 'e', ґ: 'g',
};

function stripInvisible(str) {
  return String(str || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
}

function foldTurkmen(str) {
  let s = stripInvisible(str).trim().toLocaleLowerCase('tr');

  // Kirill → Latyn (kiçi harp)
  s = s.replace(/[а-яёәөүңһғқіїєґ]/g, (ch) => CYR_TO_LAT[ch] || ch);

  return s
    .replace(/ý/g, 'y')
    .replace(/ň/g, 'n')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ĝ/g, 'g')
    .replace(/ẑ/g, 'z');
}

function normalizePositionKey(raw) {
  return foldTurkmen(raw)
    .replace(/['"`´‘’“”«»]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitPositions(raw) {
  if (raw == null || String(raw).trim() === '') return ['Görkezilmedik'];
  return String(raw)
    .split(/[,;/|]+|\s+we\s+|\s+&\s+/i)
    .map((p) => stripInvisible(p).trim())
    .filter(Boolean)
    .map((p) => p.replace(/\s+/g, ' '))
    .slice(0, 8);
}

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const row = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) row[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const tmp = row[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[t.length];
}

function similarKeys(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // Biri beýlekiniň içinde (gysga görnüş)
  if (a.length >= 4 && b.length >= 4) {
    if (a.includes(b) || b.includes(a)) {
      const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      if (ratio >= 0.7) return true;
    }
  }
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 3) return a === b;
  const dist = levenshtein(a, b);
  if (maxLen <= 6) return dist <= 1;
  if (maxLen <= 12) return dist <= 2;
  return dist <= 3 && dist / maxLen <= 0.25;
}

function pickCanonicalLabel(variants) {
  if (!variants?.length) return '';
  // Iň köp ulanylan; deň bolsa — baş harp bilen (Title Case ýaly)
  const best = [...variants].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aCap = /^[A-ZÝŇÄÖÜŞÇĞА-ЯЁ]/.test(a.label) ? 1 : 0;
    const bCap = /^[A-ZÝŇÄÖÜŞÇĞА-ЯЁ]/.test(b.label) ? 1 : 0;
    if (bCap !== aCap) return bCap - aCap;
    return a.label.length - b.label.length;
  })[0];
  return best.label;
}

/**
 * 1) Birmeňzeş key (uly/kiçi harp / kirill) — bir cluster
 * 2) Meňzeş ýazylyş (typo) — bir cluster
 */
function clusterPositions(frequencyMap) {
  const byKey = new Map();

  Object.entries(frequencyMap).forEach(([label, count]) => {
    const cleaned = stripInvisible(label).trim().replace(/\s+/g, ' ');
    const key = normalizePositionKey(cleaned);
    if (!key) return;
    const n = Number(count) || 0;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        variants: new Map([[cleaned, n]]),
        totalRaw: n,
      });
    } else {
      const g = byKey.get(key);
      g.variants.set(cleaned, (g.variants.get(cleaned) || 0) + n);
      g.totalRaw += n;
    }
  });

  let clusters = [...byKey.values()].map((g) => ({
    key: g.key,
    position: pickCanonicalLabel([...g.variants.entries()].map(([l, c]) => ({ label: l, count: c }))),
    variants: [...g.variants.entries()]
      .map(([label, c]) => ({ label, count: c }))
      .sort((a, b) => b.count - a.count),
    totalRaw: g.totalRaw,
  }));

  const merged = [];
  clusters.sort((a, b) => b.totalRaw - a.totalRaw);

  clusters.forEach((entry) => {
    let found = null;
    for (const c of merged) {
      if (similarKeys(entry.key, c.key)) {
        found = c;
        break;
      }
    }
    if (!found) {
      merged.push({
        key: entry.key,
        position: entry.position,
        variants: [...entry.variants],
        totalRaw: entry.totalRaw,
      });
    } else {
      entry.variants.forEach((v) => {
        const ex = found.variants.find((x) =>
          normalizePositionKey(x.label) === normalizePositionKey(v.label)
          || x.label === v.label);
        if (ex) {
          ex.count += v.count;
          // Canonical görnüş üçin iň gowy ýazylyşy sakla
          if (v.count > 0 && normalizePositionKey(ex.label) === normalizePositionKey(v.label)) {
            // uly/kiçi harp — iň köp ulanylany
          }
        } else {
          found.variants.push({ ...v });
        }
      });
      found.totalRaw += entry.totalRaw;
      found.position = pickCanonicalLabel(found.variants);
      found.key = normalizePositionKey(found.position) || found.key;
    }
  });

  // Diňe uly/kiçi harp tapawudy — bir ýazylyş; Kirill/Latyn aýry görnüş hökmünde galsyn
  return merged.map((c) => {
    const collapsed = [];
    c.variants.forEach((v) => {
      const lower = stripInvisible(v.label).toLocaleLowerCase('tr');
      const ex = collapsed.find((x) =>
        stripInvisible(x.label).toLocaleLowerCase('tr') === lower);
      if (ex) {
        ex.count += v.count;
        // Baş harp / köp ulanylan ýazylyşy sakla
        if (v.count > ex.count - v.count) {
          const preferCap = /^[A-ZÝŇÄÖÜŞÇĞА-ЯЁ]/.test(v.label);
          const hadCap = /^[A-ZÝŇÄÖÜŞÇĞА-ЯЁ]/.test(ex.label);
          if (preferCap || !hadCap) ex.label = v.label;
        }
      } else {
        collapsed.push({ label: v.label, count: v.count });
      }
    });
    const variants = collapsed.sort((a, b) => b.count - a.count);
    return {
      key: c.key,
      position: pickCanonicalLabel(variants) || c.position,
      variants,
      totalRaw: c.totalRaw,
    };
  }).sort((a, b) => b.totalRaw - a.totalRaw);
}

function positionMatchesCluster(rawDesired, cluster) {
  const parts = splitPositions(rawDesired);
  const keys = new Set(
    (cluster.variants || []).map((v) => normalizePositionKey(typeof v === 'string' ? v : v.label)),
  );
  if (cluster.key) keys.add(cluster.key);
  if (cluster.position) keys.add(normalizePositionKey(cluster.position));

  return parts.some((p) => {
    const k = normalizePositionKey(p);
    if (!k) return false;
    if (keys.has(k)) return true;
    for (const ck of keys) {
      if (similarKeys(k, ck)) return true;
    }
    return false;
  });
}

module.exports = {
  foldTurkmen,
  normalizePositionKey,
  splitPositions,
  levenshtein,
  similarKeys,
  clusterPositions,
  positionMatchesCluster,
  pickCanonicalLabel,
};
