// Beispiel-Generator für Fächer, deren Aufgaben berechnet statt aufgeschrieben werden.
// Eine Einheit nutzt ihn mit  "generator": "rechnen", "params": { "op": "mul", ... }
//
// Jeder Generator exportiert:
//   generate(count, unit) -> Liste von Aufgaben (gleiches Format wie "exercises" in den JSON-Dateien, plus "id")
//   byId(id, unit)        -> dieselbe Aufgabe wieder aus ihrer id (fürs Fehler-Training und die Eltern-Übersicht)

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const OPS = {
  add: { sign: '+', calc: (a, b) => a + b },
  sub: { sign: '−', calc: (a, b) => a - b },
  mul: { sign: '·', calc: (a, b) => a * b },
  div: { sign: ':', calc: (a, b) => a / b },
};

function numbers(p) {
  switch (p.op) {
    case 'mul':
      return [rand(p.min ?? 2, p.max ?? 10), rand(1, 10)];
    case 'div': {
      const b = rand(p.min ?? 2, p.max ?? 10);
      return [b * rand(1, 10), b];
    }
    case 'sub': {
      const a = rand(p.min ?? 10, p.max ?? 100);
      return [a, rand(1, a)];
    }
    default:
      return [rand(p.min ?? 1, p.max ?? 100), rand(p.min ?? 1, p.max ?? 100)];
  }
}

function build(op, a, b) {
  const o = OPS[op];
  if (!o) return null;
  return {
    id: `${op}:${a}:${b}`,
    type: 'input',
    task: 'Rechne im Kopf.',
    q: `${a} ${o.sign} ${b} = ___`,
    answer: String(o.calc(a, b)),
    numeric: true,
  };
}

export function generate(count, unit) {
  const p = unit.params ?? {};
  const out = new Map();
  for (let tries = 0; out.size < count && tries < count * 20; tries++) {
    const [a, b] = numbers(p);
    const ex = build(p.op, a, b);
    out.set(ex.id, ex);
  }
  return [...out.values()];
}

export function byId(id) {
  const [op, a, b] = id.split(':');
  return build(op, Number(a), Number(b));
}
