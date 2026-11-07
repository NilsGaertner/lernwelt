// Satz-Trainer: englische Grammatik mit immer neuen Sätzen – wie die Mathe-Generatoren, nur mit Wörtern.
// Die festen Sätze einer Station kennt ein Kind nach ein paar Fahrten auswendig; hier muss es die Regel anwenden.
// Eine Station nutzt ihn mit  "generator": "saetze", "params": { "rules": ["be", "have"] }
//   be:   am / is / are – Aussage, Verneinung (am not, isn't, aren't) und Frage (Is Tom …?)
//   have: have got / has got – Aussage, Verneinung (hasn't got) und Frage (Has Lisa got …?)
//   s:    Simple Present – he, she, it: das -s muss mit (plays, watches, flies, has)
//   do:   Do/Does-Fragen, don't/doesn't – und danach das Verb ohne -s (Does Tom play …?)
// Die id einer Aufgabe ist Regel.Form.Wer.Was.Art (Art: c = Auswahl, i = schreiben); byId baut daraus genau
// dieselbe Aufgabe wieder (fürs Fehler-Training). Neue Einträge in den Listen unten also nur anhängen oder
// mit neuer id einfügen, nie eine id für etwas anderes verwenden.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * Wer? p: 1 = I, 2 = you, 3 = he/she/it, 4 = we/they · as: das Pronomen dazu (für die Erklärung)
 * ask: so heißt es in einer Frage (my mum → your mum); ohne ask kommt die Person in keiner Frage vor
 * onlyBe: fragt nur mit am (Am I late?) – „Do I …?“ oder „Have I got …?“ fragt man sich selbst kaum
 * pet: ein Tier – passt nur zu Sätzen, die auch für Tiere gehen
 */
const WHO = {
  i: { en: 'I', p: 1, as: 'I', ask: 'I', onlyBe: true },
  you: { en: 'you', p: 2, as: 'you', ask: 'you' },
  he: { en: 'he', p: 3, as: 'he', ask: 'he' },
  she: { en: 'she', p: 3, as: 'she', ask: 'she' },
  we: { en: 'we', p: 4, as: 'we', ask: 'we' },
  they: { en: 'they', p: 4, as: 'they', ask: 'they' },
  tom: { en: 'Tom', p: 3, as: 'he', ask: 'Tom' },
  lisa: { en: 'Lisa', p: 3, as: 'she', ask: 'Lisa' },
  mum: { en: 'my mum', p: 3, as: 'she', ask: 'your mum' },
  dad: { en: 'my dad', p: 3, as: 'he', ask: 'your dad' },
  sister: { en: 'my sister', p: 3, as: 'she', ask: 'your sister' },
  brother: { en: 'my brother', p: 3, as: 'he', ask: 'your brother' },
  friends: { en: 'my friends', p: 4, as: 'they', ask: 'your friends' },
  parents: { en: 'my parents', p: 4, as: 'they', ask: 'your parents' },
  tl: { en: 'Tom and Lisa', p: 4, as: 'they', ask: 'Tom and Lisa' },
  dog: { en: 'the dog', p: 3, as: 'it', ask: 'the dog', pet: true },
  cat: { en: 'our cat', p: 3, as: 'it', ask: 'your cat', pet: true },
  it: { en: 'it', p: 3, as: 'it', ask: 'it', pet: true },
};

/** to be: was nach am/is/are kommt. who: 'person' (keine Tiere), 'both' */
const BE = {
  hungry: { en: 'hungry', who: 'both' },
  tired: { en: 'tired', who: 'both' },
  happy: { en: 'happy', who: 'both' },
  ill: { en: 'ill', who: 'both' },
  garden: { en: 'in the garden', who: 'both' },
  home: { en: 'at home', who: 'both' },
  kitchen: { en: 'in the kitchen', who: 'both' },
  school: { en: 'at school', who: 'person' },
  late: { en: 'late', who: 'person' },
  ten: { en: 'ten years old', who: 'person' },
  england: { en: 'from England', who: 'person' },
  zoo: { en: 'at the zoo', who: 'person' },
};

/** have got: was jemand hat. who: 'person', 'pet', 'both' */
const HAVE = {
  bike: { en: 'a new bike', who: 'person' },
  pet: { en: 'a pet', who: 'person' },
  brothers: { en: 'two brothers', who: 'person' },
  bag: { en: 'a red bag', who: 'person' },
  garden: { en: 'a big garden', who: 'person' },
  phone: { en: 'a new phone', who: 'person' },
  cold: { en: 'a cold', who: 'both' },
  eyes: { en: 'blue eyes', who: 'both' },
  ears: { en: 'big ears', who: 'both' },
  tail: { en: 'a long tail', who: 'pet' },
  fur: { en: 'soft fur', who: 'pet' },
};

/**
 * Verben fürs Simple Present, alle Formen ausgeschrieben (nichts wird geraten).
 * s: he/she/it-Form · ing: für die Auswahl · wrong: ein typischer Schreibfehler als Auswahl (falls es einen gibt)
 * why: 'es' (-s, -sh, -ch, -x, -o), 'ies' (Konsonant + y), 'y' (Vokal + y, nur -s), 'has' (have → has)
 */
const VERBS = {
  play: { base: 'play', s: 'plays', ing: 'playing', wrong: 'playes', why: 'y', rest: 'football after school', who: 'person' },
  buy: { base: 'buy', s: 'buys', ing: 'buying', wrong: 'buies', why: 'y', rest: 'sweets at the kiosk', who: 'person' },
  like: { base: 'like', s: 'likes', ing: 'liking', rest: 'pizza', who: 'both' },
  read: { base: 'read', s: 'reads', ing: 'reading', rest: 'comics in bed', who: 'person' },
  live: { base: 'live', s: 'lives', ing: 'living', rest: 'in a small house', who: 'both' },
  eat: { base: 'eat', s: 'eats', ing: 'eating', rest: 'a lot of apples', who: 'both' },
  sleep: { base: 'sleep', s: 'sleeps', ing: 'sleeping', rest: 'on the sofa', who: 'both' },
  run: { base: 'run', s: 'runs', ing: 'running', rest: 'in the park', who: 'both' },
  swim: { base: 'swim', s: 'swims', ing: 'swimming', rest: 'in the lake', who: 'person' },
  speak: { base: 'speak', s: 'speaks', ing: 'speaking', rest: 'English very well', who: 'person' },
  ride: { base: 'ride', s: 'rides', ing: 'riding', rest: 'a bike to school', who: 'person' },
  getup: { base: 'get up', s: 'gets up', ing: 'getting up', rest: "at seven o'clock", who: 'person' },
  watch: { base: 'watch', s: 'watches', ing: 'watching', wrong: 'watchs', why: 'es', rest: 'TV in the evening', who: 'person' },
  catch: { base: 'catch', s: 'catches', ing: 'catching', wrong: 'catchs', why: 'es', rest: 'the ball', who: 'both' },
  go: { base: 'go', s: 'goes', ing: 'going', wrong: 'gos', why: 'es', rest: 'to school by bus', who: 'person' },
  do: { base: 'do', s: 'does', ing: 'doing', wrong: 'dos', why: 'es', rest: 'the washing-up after dinner', who: 'person' },
  brush: { base: 'brush', s: 'brushes', ing: 'brushing', wrong: 'brushs', why: 'es', rest: 'the dog every morning', who: 'person' },
  wash: { base: 'wash', s: 'washes', ing: 'washing', wrong: 'washs', why: 'es', rest: 'the car on Saturdays', who: 'person' },
  finish: { base: 'finish', s: 'finishes', ing: 'finishing', wrong: 'finishs', why: 'es', rest: "school at one o'clock", who: 'person' },
  fix: { base: 'fix', s: 'fixes', ing: 'fixing', wrong: 'fixs', why: 'es', rest: 'old bikes', who: 'person' },
  miss: { base: 'miss', s: 'misses', ing: 'missing', why: 'es', rest: 'the bus on Mondays', who: 'person' },
  fly: { base: 'fly', s: 'flies', ing: 'flying', wrong: 'flys', why: 'ies', rest: 'to London every summer', who: 'person' },
  cry: { base: 'cry', s: 'cries', ing: 'crying', wrong: 'crys', why: 'ies', rest: 'at sad films', who: 'person' },
  tidy: { base: 'tidy', s: 'tidies', ing: 'tidying', wrong: 'tidys', why: 'ies', rest: 'the kitchen on Sundays', who: 'person' },
  carry: { base: 'carry', s: 'carries', ing: 'carrying', wrong: 'carrys', why: 'ies', rest: 'the heavy bags', who: 'person' },
  have: { base: 'have', s: 'has', ing: 'having', wrong: 'haves', why: 'has', rest: 'breakfast at seven', who: 'person' },
};

/** Formen je Regel, mit Gewicht (wie oft sie drankommen) */
const FORMS = {
  be: { pos: 2, neg: 1, q: 1 },
  have: { pos: 2, neg: 1, q: 1 },
  s: { pos: 1 },
  do: { q: 2, neg: 2, base: 1 },
};
const ITEMS = { be: BE, have: HAVE, s: VERBS, do: VERBS };

const fits = (who, item) => (item.who === 'person' ? !who.pet : item.who === 'pet' ? who.pet : true);
const third = (who) => who.p === 3;

/** „Lisa = she“ bzw. nur „She“ – so beginnt jede Erklärung. asked: so, wie die Person in der Frage heißt (your mum). */
function subjectNote(who, asked = false) {
  const en = asked ? who.ask : who.en;
  return en === who.as ? cap(who.as) : `${cap(en)} = ${who.as}`;
}

function verbRule(v) {
  switch (v.why) {
    case 'es': return `${v.base} endet auf -${v.base.match(/(ch|sh|ss|x|o)$/)[1]} → **-es**: ${v.s}`;
    case 'ies': return `${v.base} endet auf Konsonant + y → **-ies**: ${v.s}`;
    case 'y': return `${v.base} endet auf Vokal + y → nur **-s**: ${v.s}`;
    case 'has': return 'have wird zu **has**';
    default: return `Verb + **s**: ${v.s}`;
  }
}

function build(rule, form, whoId, itemId, kind) {
  const who = WHO[whoId];
  const item = ITEMS[rule]?.[itemId];
  if (!who || !item || !FORMS[rule]?.[form] || !['c', 'i'].includes(kind) || !fits(who, item)) return null;
  const asks = form === 'q' || (rule === 'do' && form === 'base');
  if (asks && (!who.ask || (who.onlyBe && rule !== 'be'))) return null;
  const S = cap(who.en);
  const id = `${rule}.${form}.${whoId}.${itemId}.${kind}`;
  const ex = (task, q, answer, options, explain, hint = null) => ({
    id,
    type: kind === 'c' ? 'choice' : 'input',
    task,
    q,
    answer,
    ...(kind === 'c' ? { options } : hint ? { hint } : {}),
    explain,
  });

  if (rule === 'be') {
    const be = who.p === 1 ? 'am' : third(who) ? 'is' : 'are';
    if (form === 'pos') {
      return ex('am, is oder are?', `${S} ___ ${item.en}.`, be, ['am', 'is', 'are'],
        `${subjectNote(who)} → **${be}**.`, 'am / is / are');
    }
    if (form === 'neg') {
      const not = { am: 'am not', is: "isn't", are: "aren't" }[be];
      return ex('Wie heißt es verneint: am not, isn’t oder aren’t?', `${S} ___ ${item.en}. (not)`, not, ['am not', "isn't", "aren't"],
        `${subjectNote(who)} → **${not}**${be === 'am' ? ' (Kurzform: I’m not)' : ` (lang: ${be} not)`}.`);
    }
    return ex('Frage: Am, Is oder Are?', `___ ${who.ask} ${item.en}?`, cap(be), ['Am', 'Is', 'Are'],
      `${subjectNote(who, true)} → **${cap(be)}** ${who.ask} …? In der Frage steht am/is/are vorne.`, 'am / is / are');
  }

  if (rule === 'have') {
    const has = third(who);
    if (form === 'pos') {
      const a = has ? 'has got' : 'have got';
      return ex('have got oder has got?', `${S} ___ ${item.en}.`, a, ['have got', 'has got'],
        `${subjectNote(who)} → **${a}**.`, 'have got / has got');
    }
    if (form === 'neg') {
      const a = has ? "hasn't got" : "haven't got";
      return ex('Wie heißt es verneint: haven’t got oder hasn’t got?', `${S} ___ ${item.en}. (not)`, a, ["haven't got", "hasn't got"],
        `${subjectNote(who)} → **${a}** (lang: ${has ? 'has' : 'have'} not got).`);
    }
    const a = has ? 'Has' : 'Have';
    return ex('Frage: Have oder Has?', `___ ${who.ask} got ${item.en}?`, a, ['Have', 'Has'],
      `${subjectNote(who, true)} → **${a}** ${who.ask} got …?`, 'have / has');
  }

  if (rule === 's') {
    const answer = third(who) ? item.s : item.base;
    const options = [item.s, item.base, item.ing, item.wrong].filter(Boolean);
    const explain = third(who) ? `${subjectNote(who)} → ${verbRule(item)}.` : `${subjectNote(who)} → kein -s: **${item.base}**.`;
    return ex(kind === 'c' ? 'Welche Form passt?' : 'Welche Form hat das Verb hier?', `${S} ___ ${item.rest}. (${item.base})`,
      answer, options, explain);
  }

  // rule === 'do'
  if (form === 'q') {
    const a = third(who) ? 'Does' : 'Do';
    return ex('Frage: Do oder Does?', `___ ${who.ask} ${item.base} ${item.rest}?`, a, ['Do', 'Does'],
      third(who)
        ? `${subjectNote(who, true)} → **Does** …? Das -s steckt schon in does, darum bleibt das Verb ohne -s: Does ${who.ask} **${item.base}** …?`
        : `${subjectNote(who, true)} → **Do** …?`,
      'do / does');
  }
  if (form === 'neg') {
    const a = third(who) ? "doesn't" : "don't";
    return ex('Wie heißt es verneint: don’t oder doesn’t?', `${S} ___ ${item.base} ${item.rest}. (not)`, a, ["don't", "doesn't"],
      third(who)
        ? `${subjectNote(who)} → **doesn't** (does not) + Verb ohne -s.`
        : `${subjectNote(who)} → **don't** (do not) + Verb.`);
  }
  // form === 'base': das Verb nach does/doesn't – nur bei he/she/it, dort ist es die typische Falle
  if (!third(who)) return null;
  // Frage oder Verneinung – fest aus der id abgeleitet, damit byId immer denselben Satz baut
  const question = [...whoId + itemId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) % 2 === 0;
  return ex(kind === 'c' ? 'Welche Form passt?' : 'Welche Form kommt nach does/doesn’t?',
    question ? `Does ${who.ask} ___ ${item.rest}? (${item.base})` : `${S} doesn't ___ ${item.rest}. (${item.base})`,
    item.base, [item.base, item.s],
    `Nach **${question ? 'does' : "doesn't"}** steht das Verb ohne -s: **${item.base}**. Das -s steckt schon in does.`);
}

function randomId(rules) {
  const rule = pick(rules);
  const forms = Object.entries(FORMS[rule] ?? {}).flatMap(([f, w]) => Array(w).fill(f));
  if (!forms.length) return null;
  const form = pick(forms);
  const itemId = pick(Object.keys(ITEMS[rule]));
  const whoId = pick(Object.keys(WHO));
  return `${rule}.${form}.${whoId}.${itemId}.${Math.random() < 0.4 ? 'c' : 'i'}`;
}

export function generate(count, unit) {
  const rules = (unit.params?.rules ?? ['s']).filter((r) => FORMS[r]);
  const out = new Map();
  for (let tries = 0; out.size < count && tries < count * 100; tries++) {
    const id = randomId(rules);
    const ex = id && byId(id, unit);
    if (ex) out.set(ex.id, ex);
  }
  return [...out.values()];
}

export function byId(id) {
  const [rule, form, whoId, itemId, kind] = String(id).split('.');
  return build(rule, form, whoId, itemId, kind);
}
