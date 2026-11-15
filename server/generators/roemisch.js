// Römische Zahlen: lesen, schreiben, die richtige Schreibweise auswählen, zusammenzählen und Jahreszahlen.
// Eine Einheit nutzt ihn mit  "generator": "roemisch", "params": { "min": 1, "max": 20, "kinds": ["lesen", "schreiben", "waehlen", "plus"] }
// Mit "years": [1500, 2030] kommen Jahreszahlen dazu (Art "jahr").
// Die ids sind  <art>:<zahl>  bzw.  plus:<a>:<b>. Alles andere (auch die falschen Auswahl-Möglichkeiten) folgt fest aus der id.

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const TABLE = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n) {
  let out = '';
  for (const [v, s] of TABLE) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Ohne Minus-Regel, so wie es Kinder oft zuerst versuchen: 4 = IIII, 90 = LXXXX. */
function additive(n) {
  let out = '';
  for (const [v, s] of TABLE.filter(([, s]) => s.length === 1)) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Die Minus-Paare vertauscht: XIV wird zu XVI. */
const swapped = (r) => r.replace(/CM|CD|XC|XL|IX|IV/g, (p) => p[1] + p[0]);

/** Verbotene Abkürzungen: 49 als IL, 99 als IC, 8 als IIX. */
function shortcut(n) {
  const SHORT = { 45: 'VL', 49: 'IL', 95: 'VC', 99: 'IC' };
  const rest = n % 100;
  if (SHORT[rest]) return toRoman(n - rest) + SHORT[rest];
  if (n % 10 === 8) return toRoman(n - 8) + 'IIX';
  return null;
}

/** 1984 → M + CM + LXXX + IV = 1000 + 900 + 80 + 4 */
function breakdown(n) {
  const parts = [1000, 100, 10, 1].map((p) => Math.floor(n / p) % 10 * p).filter(Boolean);
  if (n >= 1000) parts[0] = Math.floor(n / 1000) * 1000;
  if (parts.length < 2) return `**${toRoman(n)}** = **${n}**`;
  return `${parts.map((p) => `**${toRoman(p)}**`).join(' + ')} = ${parts.join(' + ')} = **${n}**`;
}

function distractors(n) {
  const r = toRoman(n);
  const cands = [shortcut(n), swapped(r), additive(n), toRoman(n + 1), toRoman(n - 1), toRoman(n + 10), toRoman(n - 10), toRoman(n + 5)];
  const out = [];
  for (const c of cands) if (c && c !== r && !out.includes(c) && out.length < 3) out.push(c);
  return out;
}

function build(kind, a, b) {
  const r = toRoman(a);
  switch (kind) {
    case 'lesen':
      return { id: `lesen:${a}`, type: 'input', task: 'Welche Zahl ist das?', q: `**${r}** = ___`, answer: String(a), numeric: true, placeholder: 'Zahl', explain: breakdown(a) };
    case 'jahr':
      return { id: `jahr:${a}`, type: 'input', task: 'Welches Jahr ist das?', q: `Über der Tür eines alten Hauses steht **${r}**. Das ist das Jahr ___.`, answer: String(a), numeric: true, placeholder: 'Jahr', explain: breakdown(a) };
    case 'schreiben':
      return { id: `schreiben:${a}`, type: 'input', task: 'Wie schreibt man das römisch?', q: `${a} = ___`, answer: r, placeholder: 'römisch', explain: breakdown(a) };
    case 'waehlen':
      return { id: `waehlen:${a}`, type: 'choice', task: 'Welche römische Zahl stimmt?', q: `${a} = ___`, options: [r, ...distractors(a)], answer: r, explain: breakdown(a) };
    case 'plus':
      return {
        id: `plus:${a}:${b}`, type: 'input', task: 'Was kommt heraus?', q: `**${r}** + **${toRoman(b)}** = ___`, answer: String(a + b), numeric: true, placeholder: 'Zahl',
        explain: `**${r}** = ${a} und **${toRoman(b)}** = ${b}. Zusammen **${a + b}**, römisch **${toRoman(a + b)}**.`,
      };
    default:
      return null;
  }
}

export function generate(count, unit) {
  const p = unit.params ?? {};
  const min = p.min ?? 1;
  const max = p.max ?? 20;
  const kinds = p.kinds ?? ['lesen', 'schreiben', 'waehlen'];
  const out = new Map();
  for (let tries = 0; out.size < count && tries < count * 20; tries++) {
    const kind = kinds[rand(0, kinds.length - 1)];
    let ex;
    if (kind === 'jahr') ex = build(kind, rand(...(p.years ?? [1500, 2030])));
    else if (kind === 'plus') {
      const a = rand(min, Math.max(min, Math.floor(max / 2)));
      ex = build(kind, a, rand(1, Math.max(1, max - a)));
    } else {
      // Zum Auswählen lieber Zahlen mit Falle (IV, IX, 8, 49 …), sonst wären die falschen Antworten nur ±1.
      let n = rand(min, max);
      for (let i = 0; kind === 'waehlen' && i < 5 && toRoman(n) === additive(n) && !shortcut(n); i++) n = rand(min, max);
      ex = build(kind, n);
    }
    if (ex) out.set(ex.id, ex);
  }
  return [...out.values()];
}

export function byId(id) {
  const [kind, a, b] = id.split(':');
  return build(kind, Number(a), Number(b));
}
