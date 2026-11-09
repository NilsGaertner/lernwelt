import { db } from './db.js';
import { subjects, vocabKey, exerciseKey, getGenerator, mediaUrl, publicUnit, rideCap } from './content.js';
import { completeSession, activeBoost, boostApplies } from './rewards.js';
import { lineStatus, lineUnits, blitzTopics, archivedUnits, worldOf } from './progress.js';
import { practiceItems, recordAnswer } from './srs.js';
import { normalize, levenshtein, shuffle, pick, randomId, nowIso, localDay } from './util.js';

const active = new Map();
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const BLITZ_SECONDS = 60;

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of active) if (new Date(s.startedAt).getTime() < cutoff) active.delete(id);
}, 30 * 60 * 1000).unref();

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------- Auswahl

function statsFor(childId, keys) {
  if (!keys.length) return new Map();
  const rows = db
    .prepare(`SELECT * FROM item_stats WHERE child_id = ? AND item_key IN (${keys.map(() => '?').join(',')})`)
    .all(childId, ...keys);
  return new Map(rows.map((r) => [r.item_key, r]));
}

/** Neue, wacklige und heute fällige Aufgaben kommen öfter dran, sichere seltener – mit etwas Zufall. */
function priority(stat, today) {
  if (!stat) return 3 + Math.random() * 1.5;
  const due = !stat.due || stat.due <= today;
  return (5 - Math.min(stat.box, 5)) * 0.6 + Math.min(stat.wrong, 5) * 0.2 + (due ? 1.5 : 0) + Math.random() * 1.5;
}

/**
 * Zwillinge: Aufgaben, die sich in derselben Fahrt gegenseitig verraten – Fragen zur selben markierten Stelle einer
 * Karte oder Zeichnung (Nordosten auswählen, NO schreiben) und, in Fächern ohne Fremdsprache, Aufgaben mit derselben
 * Antwort (Rudel antippen, später „Wölfe leben im ___“ schreiben). In Englisch kommen is, are, has … absichtlich oft dran.
 */
function twinKeys(c, byAnswer) {
  if (c.kind !== 'exercise') return [];
  const d = c.data;
  const keys = [];
  if (d.map && d.mark) keys.push(`@${d.map}:${d.mark}`);
  if (byAnswer && d.answer != null) keys.push(`=${normalize(d.answer)}`);
  return keys;
}

/** Die ersten n aus der Liste, aber keine zwei Zwillinge in derselben Fahrt – außer es gibt sonst zu wenig Aufgaben. */
function takeDistinct(list, n, byAnswer) {
  const out = [];
  const later = [];
  const seen = new Set();
  for (const c of list) {
    const keys = twinKeys(c, byAnswer);
    if (out.length < n && !keys.some((k) => seen.has(k))) {
      out.push(c);
      keys.forEach((k) => seen.add(k));
    } else later.push(c);
  }
  for (const c of later) if (out.length < n) out.push(c);
  return out;
}

function choose(candidates, stats, n, byAnswer) {
  const today = localDay();
  const ranked = candidates
    .map((c) => ({ c, p: priority(stats.get(c.key), today) }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.c);
  const out = takeDistinct(ranked, n, byAnswer);
  // Kleine Einheiten: Aufgaben dürfen (in anderer Form) wiederkommen.
  while (out.length < n && ranked.length) out.push(ranked[out.length % ranked.length]);
  return shuffle(out);
}

/** Blitzrunde: Sicheres zuerst (es geht um Tempo), dann der Rest; bei Bedarf wiederholt. */
function chooseForBlitz(candidates, stats, n) {
  const ranked = shuffle(candidates)
    .map((c) => ({ c, p: Math.min(stats.get(c.key)?.box ?? 0, 3) + Math.random() * 1.5 }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.c);
  const out = [...ranked];
  while (out.length < n && ranked.length) out.push(...shuffle(ranked));
  return out.slice(0, n);
}

function unitCandidates(subjectId, unit, count) {
  if (unit.generator) {
    const gen = getGenerator(unit.generator);
    return gen.generate(count, unit).map((ex) => ({
      key: `${subjectId}/${unit.id}/g/${ex.id}`,
      kind: 'exercise',
      data: ex,
      unit,
    }));
  }
  return [
    ...unit.vocab.map((v) => ({ key: vocabKey(subjectId, unit.id, v), kind: 'vocab', data: v, unit })),
    ...unit.exercises.map((ex) => ({ key: exerciseKey(subjectId, unit.id, ex), kind: 'exercise', data: ex, unit })),
  ];
}

// ---------------------------------------------------------------- Aufgaben bauen

function tokens(sentence) {
  return sentence.trim().split(/\s+/);
}

function scrambled(words) {
  if (words.length < 2) return words;
  for (let i = 0; i < 8; i++) {
    const s = shuffle(words);
    if (s.join(' ') !== words.join(' ')) return s;
  }
  return [...words].reverse();
}

function vocabDistractors(subject, unit, v, field) {
  const same = (w) => w[field] === v[field] || w.en === v.en || w.de === v.de;
  let pool = unit.vocab.filter((w) => !same(w));
  if (pool.length < 3) {
    const more = [...subject.units.values()].filter((u) => u.line === unit.line && u !== unit).flatMap((u) => u.vocab);
    pool = pool.concat(more.filter((w) => !same(w)));
  }
  const values = [...new Set(shuffle(pool).map((w) => w[field]))];
  return values.slice(0, 3);
}

function vocabQuestion(subject, cand, stat, canSpeak, onlyChoice = false) {
  const v = cand.data;
  const unit = cand.unit;
  const box = stat?.box ?? 0;
  const wordCount = tokens(v.en).length;
  // Längere Wendungen werden sonst nur zusammengesetzt. Die Vokabelkarten aus der Schule (typePhrases)
  // kommen aber im Vokabeltest dran – da muss das Kind die ganze Wendung schreiben können.
  const canType = unit.typing !== false && (wordCount <= 2 || !!unit.typePhrases);
  const canOrder = wordCount >= 3;

  let variants;
  if (box === 0) variants = ['en2de', 'de2en', 'listen2de'];
  else if (box === 1) variants = ['de2en', 'listen2de', canType ? 'type' : canOrder ? 'order' : 'en2de'];
  else variants = canType ? ['type', 'dictation', 'type'] : canOrder ? ['order', 'order', 'listen2de'] : ['de2en', 'listen2de'];
  if (onlyChoice) variants = ['en2de', 'de2en'];
  if (!canSpeak) variants = variants.filter((x) => !x.startsWith('listen') && x !== 'dictation');
  if (!variants.length) variants = ['de2en'];
  const variant = pick(variants);

  const accept = [v.en, ...(v.alt ?? [])];
  // „to learn words“ – das „to“ vorne darf beim Schreiben fehlen.
  if (/^to\s/i.test(v.en)) accept.push(v.en.replace(/^to\s+/i, ''));
  switch (variant) {
    case 'en2de':
      return {
        pub: { type: 'choice', prompt: 'Was bedeutet das auf Deutsch?', text: v.en, audio: canSpeak ? v.en : null, options: shuffle([v.de, ...vocabDistractors(subject, unit, v, 'de')]) },
        expected: [v.de], qtype: 'choice',
      };
    case 'listen2de':
      return {
        pub: { type: 'choice', prompt: 'Was bedeutet das?', audio: v.en, autoplay: true, options: shuffle([v.de, ...vocabDistractors(subject, unit, v, 'de')]) },
        expected: [v.de], qtype: 'listen', reveal: v.en,
      };
    case 'type':
      return {
        pub: { type: 'input', prompt: 'Wie heißt das auf Englisch?', text: v.de, placeholder: 'auf Englisch …' },
        expected: accept, qtype: 'input', speak: v.en,
      };
    case 'dictation':
      return {
        pub: { type: 'input', prompt: 'Welches englische Wort ist das?', audio: v.en, autoplay: true, hint: v.de, placeholder: 'Was hörst du?' },
        expected: accept, qtype: 'listen',
      };
    case 'order':
      return {
        pub: { type: 'order', prompt: 'Wie heißt der Satz auf Englisch?', text: v.de, words: scrambled(tokens(v.en)) },
        expected: [v.en], qtype: 'order', speak: v.en,
      };
    default:
      return {
        pub: { type: 'choice', prompt: 'Wie heißt das auf Englisch?', text: v.de, options: shuffle([v.en, ...vocabDistractors(subject, unit, v, 'en')]) },
        expected: [v.en], qtype: 'choice', speak: v.en,
      };
  }
}

/**
 * "recall": Eine Auswahl-Aufgabe wird zum Schreiben, sobald sie ein bisschen sitzt – wie bei den Vokabeln.
 * Box 0: auswählen · Box 1: ab und zu schreiben · ab Box 2: schreiben. Selbst darauf kommen (statt wiedererkennen)
 * prägt sich besser ein. Ein Fehler bringt die Aufgabe zwei Boxen zurück, dann kommt wieder die Auswahl.
 * Schreiben ist ein Angebot, kein Muss: Mit „Lieber auswählen?“ kommen die Antworten zurück (½ Punkt, siehe chooseQuestion).
 * In der Blitzrunde wird immer angetippt, und der Endbahnhof bleibt, wie er war – er soll nicht unbemerkt schwerer werden.
 */
function recallTyped(ex, stat, mode) {
  if (ex.type !== 'choice' || !ex.recall || ex.sound || mode === 'blitz' || mode === 'exam') return false;
  const box = stat?.box ?? 0;
  return box >= 2 || (box === 1 && Math.random() < 1 / 3);
}

function exerciseQuestion(subjectId, cand, canSpeak, stat = null, mode = 'unit') {
  const ex = cand.data;
  const map = ex.map ? { src: mediaUrl(subjectId, ex.map), mark: ex.mark ?? null } : null;
  const filled = (ex.q ? ex.q.replace(/_{3,}/, ex.answer) : ex.answer)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\*\*/g, '');
  const speakable = ex.type === 'order' || /_{3,}/.test(ex.q ?? '');
  const speak = canSpeak && speakable && ex.speak !== false ? filled : null;
  const base = { explain: ex.explain ?? null, speak, strict: !!ex.strict };
  // Diktat ("say"): Vorgelesen wird der Satz samt fehlendem Wort oder der Text aus "say". Nur beim Schreiben –
  // in der Auswahl stehen die Schreibweisen ja schon da.
  const dictation = canSpeak && ex.say ? { audio: ex.say === true ? filled : ex.say, autoplay: true } : null;
  if (recallTyped(ex, stat, mode)) {
    const gap = /_{3,}/.test(ex.q ?? '');
    return {
      ...base,
      pub: {
        type: 'input',
        prompt: typeof ex.recall === 'string' ? ex.recall : ex.task ?? (gap ? 'Welches Wort fehlt?' : 'Was ist die Antwort?'),
        text: ex.q, textDe: ex.de ?? null, map, hint: ex.hint ?? null,
        placeholder: ex.placeholder ?? (gap ? '…' : ex.say ? 'Was hörst du?' : 'Deine Antwort …'), numeric: /^\d+$/.test(ex.answer),
        canChoose: true, ...dictation,
      },
      expected: [ex.answer, ...(ex.accept ?? [])], qtype: 'input',
      // Die Antworten zum Auswählen, falls das Kind lieber auswählt
      choices: shuffle(ex.options),
    };
  }
  if (ex.type === 'column') {
    return {
      ...base,
      speak: null,
      pub: { type: 'column', prompt: ex.task ?? 'Schriftlich:', op: ex.op ?? 'add', rows: ex.rows, carry: ex.carry !== false },
      expected: [ex.answer], qtype: 'column',
    };
  }
  if (ex.type === 'choice') {
    return {
      ...base,
      pub: { type: 'choice', prompt: ex.task ?? 'Was passt?', text: ex.q, textDe: ex.de ?? null, map, options: shuffle(ex.options), sound: ex.sound ?? null },
      expected: [ex.answer], qtype: 'choice',
    };
  }
  if (ex.type === 'order') {
    return {
      ...base,
      pub: { type: 'order', prompt: ex.task ?? 'Welche Reihenfolge ergibt den Satz?', text: ex.de ?? ex.q, words: scrambled(tokens(ex.answer)) },
      expected: [ex.answer, ...(ex.accept ?? [])], qtype: 'order',
    };
  }
  return {
    ...base,
    pub: { type: 'input', prompt: ex.task ?? 'Welches Wort fehlt?', text: ex.q, textDe: ex.de ?? null, map, hint: ex.hint ?? null, placeholder: ex.placeholder ?? '…', numeric: !!ex.numeric, ...dictation },
    expected: [ex.answer, ...(ex.accept ?? [])], qtype: 'input',
  };
}

function matchQuestion(unit) {
  const pairs = shuffle(unit.vocab).slice(0, 5).map((v) => [v.en, v.de]);
  return { pub: { type: 'match', prompt: 'Was gehört zusammen?', pairs }, expected: [], qtype: 'match', key: null };
}

// ---------------------------------------------------------------- Sitzung

export function startSession({ childId, subjectId, unitId, line: lineId, topic: topicId, mode = 'unit', count = 10, full = count }) {
  const subject = subjects.get(subjectId);
  if (!subject) throw httpError(404, 'Dieses Fach gibt es nicht.');
  const canSpeak = !!subject.meta.speechLang;
  // Rechtschreibung (Deutsch): Groß und klein zählen, und wer sich verschreibt, darf selbst verbessern.
  const spelling = !!subject.meta.spelling;
  // Archivierte Stationen sind für das Kind aus dem Fahrplan genommen – auch im Fehler-Training, Endbahnhof und Blitz.
  const archived = archivedUnits(childId);
  const inService = (u) => !archived.has(`${subjectId}/${u.id}`);

  let candidates;
  let title;
  let unit = null;
  let refId = null;
  if (mode === 'review' || mode === 'due') {
    // Fehler-Training: was noch wackelt · Wiederholung: was heute nach ein paar Tagen Pause wieder dran ist
    candidates = practiceItems(childId, mode, subjectId, full * 3);
    if (!candidates.length) {
      throw httpError(400, mode === 'due' ? 'Heute ist nichts mehr zu wiederholen. Super!' : 'Gerade gibt es nichts zu wiederholen. Super!');
    }
    title = mode === 'due' ? 'Wiederholung' : 'Fehler-Training';
    count = Math.min(count, candidates.length);
  } else if (mode === 'exam') {
    const line = (subject.meta.lines ?? []).find((l) => l.id === lineId);
    const status = lineStatus(childId)[subjectId]?.[lineId];
    if (!line || !status) throw httpError(404, 'Diese Prüfung gibt es nicht.');
    if (!status.unlocked) throw httpError(400, 'Das öffnet sich, wenn alle Übungen hier mindestens 2 Sterne haben.');
    candidates = lineUnits(subjectId, lineId).filter(inService).flatMap((u) => unitCandidates(subjectId, u, count));
    title = `${worldOf(childId).terminus.s} ${line.short ?? line.name}`;
    refId = line.id;
    count = line.examCount ?? Math.max(12, Math.round(count * 1.5));
  } else if (mode === 'blitz') {
    const topic = blitzTopics(subjectId).find((t) => t.id === topicId);
    if (!topic) throw httpError(404, 'Diese Blitzrunde gibt es nicht.');
    const units = [...subject.units.values()].filter((u) =>
      inService(u) && (topic.units ? topic.units.includes(u.id) : topic.line ? u.line === topic.line : true));
    candidates = units
      .flatMap((u) => unitCandidates(subjectId, u, 60))
      // Hör-Aufgaben (Musik) brauchen Zeit zum Zuhören – nichts für die Blitzrunde.
      .filter((c) => c.kind === 'vocab' || ((!topic.types || topic.types.includes(c.data.type)) && !c.data.sound));
    if (!candidates.length) throw httpError(400, 'Für diese Blitzrunde gibt es noch keine Aufgaben.');
    title = topic.title;
    refId = topic.id;
    count = 80;
  } else {
    unit = subject.units.get(unitId);
    if (!unit) throw httpError(404, 'Diese Übung gibt es nicht.');
    if (!inService(unit)) throw httpError(400, 'Diese Übung ist gerade ausgeschaltet.');
    candidates = unitCandidates(subjectId, unit, count);
    title = unit.title;
    refId = unit.id;
  }
  // Eine ganze Fahrt hat full Aufgaben – beim Wiederholen weniger, wenn es nicht mehr gibt, und auf kleinen Stationen
  // ohne Wörter so viele, wie es gibt (rideCap). Nur wer weniger wählt oder früher aussteigt, macht eine kurze Fahrt.
  const available = mode === 'unit' ? rideCap(unit) ?? Infinity : candidates.length;
  full = Math.min(full, available);
  if (mode === 'unit') count = Math.min(count, full);

  const withMatch = mode === 'unit' && unit.vocab.length >= 5 && count >= 8;
  const stats = statsFor(childId, [...new Set(candidates.map((c) => c.key))]);
  const chosen =
    mode === 'blitz' ? chooseForBlitz(candidates, stats, count)
    : mode === 'exam' ? takeDistinct(shuffle(candidates), count, !canSpeak) // Prüfung: bunt gemischt über die ganze Linie
    : choose(candidates, stats, withMatch ? count - 1 : count, !canSpeak);

  const questions = chosen.map((c) => {
    const q = c.kind === 'vocab'
      ? vocabQuestion(subject, c, stats.get(c.key), canSpeak && mode !== 'blitz', mode === 'blitz')
      : exerciseQuestion(subjectId, c, canSpeak && mode !== 'blitz', stats.get(c.key), mode);
    // Getippte Wörter (keine Zahlen): Dafür gibt es den Tipp-Knopf und bei einem einzelnen falschen Buchstaben „Fast!“.
    const typedWord = q.pub.type === 'input' && !q.pub.numeric && !q.expected.some((e) => /\d/.test(e));
    const letters = String(q.expected[0] ?? '').replace(/[^\p{L}]/gu, '').length;
    return {
      ...q, key: c.key, kind: c.kind, unitId: c.unit.id,
      // „Fast!“ mit zweitem Versuch: bei Vokabeln und in Fächern ohne Fremdsprache – in Biologie zählt das Wissen,
      // nicht der eine Buchstabe. In Englisch-Lücken ist der eine Buchstabe oft genau das Geübte (he like → likes).
      lenient: c.kind === 'vocab' || ((!canSpeak || spelling) && typedWord),
      exactCase: spelling,
      // Tipp erst ab drei Buchstaben – bei „O“ oder „an“ würde er die ganze Lösung verraten.
      hintable: mode !== 'blitz' && typedWord && letters >= 3,
    };
  });
  if (withMatch) questions.splice(Math.floor(questions.length / 2), 0, { ...matchQuestion(unit), unitId: unit.id });

  // Die Merke-Seiten der beteiligten Stationen: Nach einem Fehler kann das Kind dort nachschauen.
  const units = {};
  if (mode !== 'blitz') {
    for (const uid of new Set(questions.map((q) => q.unitId))) {
      const pu = publicUnit(subjectId, uid);
      if (pu?.explain.length) units[uid] = { title: pu.title, explain: pu.explain };
    }
  }

  const id = randomId();
  const startedAt = nowIso();
  const session = {
    id,
    childId,
    subject: subjectId,
    unitId: refId,
    title,
    mode,
    startedAt,
    boosted: boostApplies(activeBoost(), { subject: subjectId, mode, line: mode === 'exam' ? refId : unit?.line ?? 'main', unit: refId }),
    deadline: mode === 'blitz' ? Date.now() + (BLITZ_SECONDS + 3) * 1000 : null,
    // So viele Aufgaben hat eine normale Fahrt. Kürzere Fahrten (gewählt oder früh ausgestiegen) bringen anteilig Sterne.
    full,
    combo: 0,
    bestCombo: 0,
    // Diese Aufgaben „sitzen“ seit dieser Fahrt (Box 3 erreicht)
    newlyKnown: [],
    // credit: Punkte für den ersten Versuch – 1, ½ (selbst verbessert) oder 0
    questions: questions.map((q) => ({ ...q, answered: false, credit: 0 })),
  };
  active.set(id, session);

  return {
    sessionId: id,
    title,
    mode,
    seconds: mode === 'blitz' ? BLITZ_SECONDS : null,
    boosted: session.boosted,
    speechLang: mode === 'blitz' ? null : subject.meta.speechLang ?? null,
    spelling,
    // copy: nach einem Fehler die Lösung einmal abschreiben – bei Vokabeln und Schulkarten, wo es um die Schreibweise geht
    // canHint: es gibt den Tipp-Knopf (erster Buchstabe und Länge, dann höchstens ½ Punkt)
    questions: session.questions.map((q, i) => ({
      id: i, unit: q.unitId, copy: q.kind === 'vocab' || !!subject.units.get(q.unitId)?.typePhrases || (spelling && q.hintable), canHint: q.hintable, ...q.pub,
    })),
    units,
  };
}

function checkAnswer(q, given) {
  // Auswahl: die Option kommt wörtlich zurück. Ohne normalize, sonst würde z. B. ":" zu "".
  if (q.pub.type === 'choice') return { correct: q.expected.includes(String(given)) };
  // Zahlen dürfen mit Tausenderpunkten oder Leerzeichen getippt werden: 45.000 und 45 000 zählen wie 45000.
  if (q.pub.numeric) given = String(given ?? '').trim().replace(/(\d)[\s.](?=\d{3}(?!\d))/g, '$1');
  const strictOpt = { expand: !q.strict, keepCase: !!q.exactCase };
  const g = normalize(given, strictOpt);
  if (!g) return { correct: false };
  const correct = q.expected.some((e) => normalize(e, strictOpt) === g);
  const result = { correct };
  if (q.pub.type !== 'input') return result;

  const raw = String(given).trim();
  if (correct) {
    // Groß-/Kleinschreibung wird nicht als Fehler gezählt, aber freundlich angemerkt.
    const exact = q.expected.find((e) => normalize(e, strictOpt) === g);
    if (exact && /^[A-Z]/.test(exact) && /^[a-z]/.test(raw)) {
      result.note = `Denk an den großen Anfangsbuchstaben: ${exact}`;
    } else if (exact && /^[a-z]/.test(exact) && /^[A-Z]/.test(raw) && !exact.includes(' ') && !q.pub.text?.includes('___')) {
      result.note = 'Tipp: Im Englischen schreibt man Nomen klein – nur Namen, Wochentage, Monate und Sprachen groß.';
    }
    return result;
  }
  // Rechtschreibung: Alle Buchstaben stimmen, nur groß und klein noch nicht – auch das darf das Kind selbst verbessern.
  if (q.exactCase && q.expected.some((e) => normalize(e) === normalize(given))) {
    result.almost = true;
    result.caseOnly = true;
    return result;
  }
  // „Fast!“: nur ein Buchstabe anders als die Lösung (oder eine erlaubte Variante davon)
  result.almost = q.expected.some((e) => {
    const target = normalize(e, strictOpt);
    return target.length >= 4 && levenshtein(g, target) === 1;
  });
  return result;
}

const logAnswer = db.prepare(
  `INSERT INTO answers (session_id, child_id, subject, unit_id, item_key, qtype, correct, first_try, given, expected, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

export function answerQuestion(sessionId, qid, given) {
  const s = active.get(sessionId);
  if (!s) throw httpError(404, 'Diese Übung ist abgelaufen. Starte sie einfach neu.');
  const q = s.questions[qid];
  if (!q) throw httpError(400, 'Unbekannte Aufgabe.');
  if (s.deadline && Date.now() > s.deadline) throw httpError(409, 'Die Zeit ist um.');

  let result;
  let givenText;
  if (q.pub.type === 'match') {
    const mistakes = Math.max(0, Number(given?.mistakes) || 0);
    result = { correct: mistakes <= 1, mistakes };
    givenText = `${mistakes} Fehler`;
  } else {
    givenText = Array.isArray(given) ? given.join(' ') : String(given ?? '');
    result = checkAnswer(q, givenText);
    // Angetippt statt geschrieben: Ein Buchstabe Unterschied ist dann kein Vertipper, sondern eine andere Antwort.
    if (q.switched) delete result.almost;
  }
  const now = nowIso();
  const log = (correct, firstTry) =>
    logAnswer.run(s.id, s.childId, s.subject, q.unitId, q.key, q.qtype, correct ? 1 : 0, firstTry ? 1 : 0, givenText.slice(0, 200), q.expected[0] ?? '', now);

  // Ein Wort mit nur einem falschen Buchstaben darf das Kind einmal selbst verbessern, bevor es die Lösung sieht.
  // Klappt das, gibt es einen halben Punkt. (Nicht in Englisch-Lücken und nicht bei Zahlen, siehe lenient in startSession.)
  if (!q.answered && !q.secondChance && result.almost && q.lenient && s.mode !== 'blitz') {
    q.secondChance = true;
    s.combo = 0;
    log(false, true);
    return { correct: false, almost: true, caseOnly: !!result.caseOnly, tryAgain: true, firstTry: true, combo: 0 };
  }

  const firstTry = !q.answered;
  // Mit Hilfe (selbst verbessert, mit Tipp oder ausgewählt statt geschrieben) gibt es einen halben Punkt.
  const assisted = firstTry && (!!q.hinted || !!q.switched);
  const helped = assisted || (firstTry && !!q.secondChance);
  const credit = result.correct ? (helped ? 0.5 : 1) : 0;
  if (firstTry) {
    q.answered = true;
    q.credit = credit;
  }
  // Serie in der Fahrt: Ein Fehler beendet sie (auch der Vertipper vor dem Verbessern). Hilfe holen hält sie nur an –
  // wer einen Tipp nimmt, soll dafür nicht seine Serie verlieren.
  if (!result.correct || (firstTry && q.secondChance)) s.combo = 0;
  else if (!assisted) s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);

  log(result.correct, firstTry && !helped);
  if (q.key && firstTry) {
    const { becameKnown } = recordAnswer({
      childId: s.childId, key: q.key, subject: s.subject, unitId: q.unitId, at: now, blitz: s.mode === 'blitz',
      outcome: credit === 1 ? 'right' : credit ? 'half' : 'wrong',
    });
    if (becameKnown) s.newlyKnown.push(q.key);
  }

  return {
    ...result,
    half: firstTry && credit === 0.5,
    hinted: firstTry && !!q.hinted,
    switched: firstTry && !!q.switched,
    firstTry,
    combo: s.combo,
    solution: q.pub.type === 'match' ? null : q.expected[0],
    reveal: q.reveal ?? null,
    explain: q.explain ?? null,
    speak: q.speak ?? null,
  };
}

/** Ab so vielen beantworteten Aufgaben zählt ein früher Ausstieg als (kurze) Fahrt. */
export const MIN_EARLY = 3;

/**
 * early: Das Kind steigt vor dem Ziel aus. Was es bis dahin beantwortet hat, zählt als kurze Fahrt
 * (ab MIN_EARLY Aufgaben, nicht beim Endbahnhof). Sonst verfällt die Fahrt still – ohne Strafe.
 */
export function finishSession(sessionId, { early = false } = {}) {
  const s = active.get(sessionId);
  if (!s) throw httpError(404, 'Diese Übung ist abgelaufen.');
  const answered = s.questions.filter((q) => q.answered);
  if (s.mode === 'blitz') {
    if (!answered.length) {
      active.delete(sessionId);
      return { mode: 'blitz', empty: true };
    }
  } else if (early) {
    if (s.mode === 'exam' || answered.length < MIN_EARLY) {
      active.delete(sessionId);
      return { mode: s.mode, empty: true };
    }
  } else if (answered.length < s.questions.length) {
    throw httpError(400, 'Es sind noch Aufgaben offen.');
  }
  active.delete(sessionId);
  return completeSession({
    sessionId: s.id,
    childId: s.childId,
    subject: s.subject,
    unitId: s.unitId,
    unitTitle: s.title,
    mode: s.mode,
    startedAt: s.startedAt,
    boosted: s.boosted,
    total: answered.length,
    // halbe Punkte fürs Verbessern zählen mit (z. B. 8½ von 10)
    correct: answered.reduce((sum, q) => sum + q.credit, 0),
    bestCombo: s.bestCombo,
    full: s.mode === 'unit' || s.mode === 'review' || s.mode === 'due' ? s.full : null,
    newlyKnown: s.newlyKnown,
  });
}

/** „Eckzähne“ → „E_______“, „get up“ → „g__ u_“: der erste Buchstabe jedes Worts, der Rest als Lücken. */
export function hintMask(answer) {
  return String(answer ?? '').replace(/\*\*/g, '').replace(/\p{L}+/gu, (w) => w[0] + '_'.repeat(w.length - 1));
}

/**
 * Tipp-Knopf: verrät den ersten Buchstaben und die Länge. Wer ihn beim ersten Versuch nimmt, bekommt höchstens einen
 * halben Punkt (wie beim Selbst-Verbessern) – so bleibt das Kind beim Erinnern, statt aufzugeben und abzuschreiben.
 * Bei der Wiederholung am Ende der Fahrt kostet er nichts mehr.
 */
export function hintQuestion(sessionId, qid) {
  const s = active.get(sessionId);
  if (!s) throw httpError(404, 'Diese Übung ist abgelaufen. Starte sie einfach neu.');
  const q = s.questions[qid];
  if (!q) throw httpError(400, 'Unbekannte Aufgabe.');
  if (!q.hintable) throw httpError(400, 'Für diese Aufgabe gibt es keinen Tipp.');
  if (!q.answered) q.hinted = true;
  return { mask: hintMask(q.expected[0]) };
}

/**
 * „Lieber auswählen?“: Eine recall-Aufgabe, die zum Schreiben gekommen ist, wird wieder zur Auswahl. Schreiben ist ein
 * Angebot, kein Muss. Wie beim Tipp gibt es dann höchstens einen halben Punkt (bei der Wiederholung am Ende kostet es
 * nichts), und die Aufgabe rückt keine Box höher – Wiedererkennen ist noch nicht Erinnern.
 */
export function chooseQuestion(sessionId, qid) {
  const s = active.get(sessionId);
  if (!s) throw httpError(404, 'Diese Übung ist abgelaufen. Starte sie einfach neu.');
  const q = s.questions[qid];
  if (!q) throw httpError(400, 'Unbekannte Aufgabe.');
  if (!q.choices) throw httpError(400, 'Für diese Aufgabe gibt es keine Auswahl.');
  if (!q.answered) q.switched = true;
  return { options: q.choices };
}
