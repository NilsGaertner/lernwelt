import crypto from 'node:crypto';

/** Lokales Datum als YYYY-MM-DD (Zeitzone über die Umgebungsvariable TZ). */
export function localDay(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function nowIso() {
  return new Date().toISOString();
}

export function shortHash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);
}

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Punkte mit halben Punkten fürs Verbessern: 8.5 → „8½“. */
export function fmtScore(n) {
  const whole = Math.floor(n);
  return n % 1 ? `${whole || ''}½` : String(n);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CONTRACTIONS = [
  [/\bi'm\b/g, 'i am'],
  [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bwasn't\b/g, 'was not'],
  [/\bweren't\b/g, 'were not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'],
  [/\bhaven't\b/g, 'have not'],
  [/\bhasn't\b/g, 'has not'],
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
  [/\b(i|you|we|they)'ve\b/g, '$1 have'],
  // he's, what's … (nur bei Pronomen und Fragewörtern – Tom's ist der Genitiv); he's got = he has got
  [/\b(it|he|she|who|what)'s got\b/g, '$1 has got'],
  [/\b(it|he|she|that|what|where|who|there|here)'s\b/g, '$1 is'],
];

/** Vereinheitlicht eine Antwort für den Vergleich. */
export function normalize(s, { expand = true } = {}) {
  let t = String(s ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[„“”"]/g, '')
    .replace(/[-–]/g, ' ')
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (expand) for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
