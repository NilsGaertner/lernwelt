// Schriftliches Addieren, Subtrahieren und Multiplizieren: Die Zahlen stehen stellengerecht untereinander, das Kind rechnet
// Spalte für Spalte von rechts nach links und trägt Ziffern (und Überträge) ein.
// Subtrahiert wird im Ergänzungsverfahren: untere Ziffer (plus Übertrag) bis zur oberen ergänzen.
// Beim Malnehmen steht die Aufgabe in einer Zeile (3597 · 19), darunter für jede Ziffer des zweiten Faktors
// ein Teilprodukt, jedes eine Stelle weiter rechts, und darunter die Summe.
// Eine Einheit nutzt ihn mit  "generator": "schriftlich", "params": { ... }
//   op:        "add" (Standard), "sub" oder "mul"
//   terms:     wie viele Zahlen addiert werden (Standard 2, nur beim Plus)
//   digits:    [min, max] Stellen je Zahl (Standard [2, 3]); beim Minus gilt das für die untere Zahl,
//              die obere ist immer dreistellig (oder 1000)
//   maxSum:    das Ergebnis ist höchstens so groß (Standard 1000, nur beim Plus)
//   carry:     false = Aufgaben ganz ohne Übertrag (dann gibt es auch keine Übertrags-Kästchen)
//   minCarries: so viele Spalten müssen mindestens einen Übertrag haben (Standard 0)
//   zeros:     true = oben steht eine 0, bei der bis 10 ergänzt werden muss (z. B. 503 − 276, 1000 − 347; nur beim Minus)
//   factorDigits: [min, max] Stellen des zweiten Faktors (Standard [1, 1], nur beim Mal). Er enthält keine 0,
//              einstellig ist er mindestens 2. digits gilt dann für den ersten Faktor.

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const SEP = { add: '+', sub: '-', mul: '*' };
const SIGN = { add: '+', sub: '−', mul: '·' };
const TASK = { add: 'Rechne schriftlich.', sub: 'Rechne schriftlich minus.', mul: 'Rechne schriftlich mal.' };

function randomNumber(digits) {
  let s = String(rand(1, 9));
  for (let i = 1; i < digits; i++) s += rand(0, 9);
  return s;
}

/**
 * Geht die Spalten von rechts nach links durch.
 * carries: wie viele Spalten einen Übertrag weitergeben · zeroBorrow: oben steht eine 0, unten (mit Übertrag) mehr
 */
function analyze(rows, op) {
  const width = Math.max(...rows.map((r) => r.length));
  const at = (r, c) => Number(r[r.length - 1 - c] ?? 0);
  let carry = 0;
  let carries = 0;
  let zeroBorrow = false;
  for (let c = 0; c < width; c++) {
    if (op === 'sub') {
      const m = at(rows[0], c);
      const lower = rows.slice(1).reduce((s, r) => s + at(r, c), carry);
      if (m === 0 && lower > 0 && c < rows[0].length) zeroBorrow = true;
      carry = Math.max(0, Math.ceil((lower - m) / 10));
    } else {
      carry = Math.floor(rows.reduce((s, r) => s + at(r, c), carry) / 10);
    }
    if (carry) carries++;
  }
  return { carries, zeroBorrow };
}

function build(rows, p, op = p.op ?? 'add') {
  const [top, ...rest] = rows.map(Number);
  const value = op === 'mul' ? top * rest[0]
    : op === 'sub' ? top - rest.reduce((a, b) => a + b, 0) : top + rest.reduce((a, b) => a + b, 0);
  return {
    id: rows.join(SEP[op]),
    type: 'column',
    op,
    task: TASK[op],
    q: rows.join(` ${SIGN[op]} `),
    rows,
    carry: p.carry !== false,
    answer: String(value),
    numeric: true,
  };
}

/** Obere Zahl beim Minus mit Nullen: 1000 oder dreistellig mit einer 0 bei den Zehnern und/oder Einern. */
function topWithZero() {
  if (Math.random() < 0.2) return '1000';
  const d = randomNumber(3).split('');
  const where = rand(0, 2);
  if (where !== 1) d[1] = '0';
  if (where !== 0) d[2] = '0';
  return d.join('');
}

/** Zweiter Faktor beim Mal: ohne 0 (sonst entsteht eine Zeile nur aus Nullen), einstellig nicht 1. */
function factor(digits) {
  if (digits === 1) return String(rand(2, 9));
  return Array.from({ length: digits }, () => rand(1, 9)).join('');
}

function candidate(p) {
  const op = p.op ?? 'add';
  const [min, max] = p.digits ?? [2, 3];
  let rows;
  if (op === 'mul') {
    const [fmin, fmax] = p.factorDigits ?? [1, 1];
    rows = [randomNumber(rand(min, max)), factor(rand(fmin, fmax))];
    if (rows[0] === rows[1]) return null;
    return rows;
  }
  if (op === 'sub') {
    const top = p.zeros ? topWithZero() : randomNumber(3);
    const lower = randomNumber(Math.min(rand(min, max), top.length));
    if (Number(lower) >= Number(top)) return null;
    rows = [top, lower];
  } else {
    // Die erste Zahl ist die längste und hat die volle Stellenzahl – so sieht es auch im Schulheft meist aus.
    const lengths = [max, ...Array.from({ length: (p.terms ?? 2) - 1 }, () => rand(min, max)).sort((a, b) => b - a)];
    rows = lengths.map(randomNumber);
    if (rows.reduce((s, r) => s + Number(r), 0) > (p.maxSum ?? 1000)) return null;
  }
  const { carries, zeroBorrow } = analyze(rows, op);
  if (p.carry === false ? carries > 0 : carries < (p.minCarries ?? 0)) return null;
  if (p.zeros && !zeroBorrow) return null;
  // Keine Zahl doppelt, das sieht wie ein Fehler aus.
  if (new Set(rows).size < rows.length) return null;
  return rows;
}

export function generate(count, unit) {
  const p = unit.params ?? {};
  const out = new Map();
  for (let tries = 0; out.size < count && tries < count * 500; tries++) {
    const rows = candidate(p);
    if (!rows) continue;
    const ex = build(rows, p);
    out.set(ex.id, ex);
  }
  return [...out.values()];
}

export function byId(id, unit) {
  const op = id.includes('*') ? 'mul' : id.includes('-') ? 'sub' : 'add';
  const rows = id.split(SEP[op]);
  if (rows.length < 2 || !rows.every((r) => /^\d{1,9}$/.test(r))) return null;
  if (op === 'mul' && rows.length !== 2) return null;
  return build(rows, unit?.params ?? {}, op);
}
