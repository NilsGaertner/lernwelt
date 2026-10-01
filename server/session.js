import { db } from './db.js';
import { subjects, vocabKey, exerciseKey, resolveItem, getGenerator, mediaUrl } from './content.js';
import { completeSession, activeBoost, boostApplies } from './rewards.js';
import { lineStatus, lineUnits, blitzTopics, archivedUnits, notArchivedSql } from './progress.js';
import { normalize, levenshtein, shuffle, pick, randomId, nowIso } from './util.js';

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

/** Neue und wacklige Aufgaben kommen öfter dran, sichere seltener – mit etwas Zufall. */
function priority(stat) {
  if (!stat) return 3 + Math.random() * 1.5;
  return (5 - Math.min(stat.box, 5)) * 0.6 + Math.min(stat.wrong, 5) * 0.2 + Math.random() * 1.5;
}

function choose(candidates, stats, n) {
  const ranked = candidates
    .map((c) => ({ c, p: priority(stats.get(c.key)) }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.c);
  const out = ranked.slice(0, n);
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
  const canType = unit.typing !== false && wordCount <= 2;
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
  switch (variant) {
    case 'en2de':
      return {
        pub: { type: 'choice', prompt: 'Was bedeutet das auf Deutsch?', text: v.en, audio: canSpeak ? v.en : null, options: shuffle([v.de, ...vocabDistractors(subject, unit, v, 'de')]) },
        expected: [v.de], qtype: 'choice',
      };
    case 'listen2de':
      return {
        pub: { type: 'choice', prompt: 'Hör genau hin: Was bedeutet das?', audio: v.en, autoplay: true, options: shuffle([v.de, ...vocabDistractors(subject, unit, v, 'de')]) },
        expected: [v.de], qtype: 'listen', reveal: v.en,
      };
    case 'type':
      return {
        pub: { type: 'input', prompt: 'Schreib es auf Englisch.', text: v.de, placeholder: 'auf Englisch …' },
        expected: accept, qtype: 'input', speak: v.en,
      };
    case 'dictation':
      return {
        pub: { type: 'input', prompt: 'Hör zu und schreib das englische Wort.', audio: v.en, autoplay: true, hint: v.de, placeholder: 'Was hörst du?' },
        expected: accept, qtype: 'listen',
      };
    case 'order':
      return {
        pub: { type: 'order', prompt: 'Bau den Satz auf Englisch.', text: v.de, words: scrambled(tokens(v.en)) },
        expected: [v.en], qtype: 'order', speak: v.en,
      };
    default:
      return {
        pub: { type: 'choice', prompt: 'Wie heißt das auf Englisch?', text: v.de, options: shuffle([v.en, ...vocabDistractors(subject, unit, v, 'en')]) },
        expected: [v.en], qtype: 'choice', speak: v.en,
      };
  }
}

function exerciseQuestion(subjectId, cand, canSpeak) {
  const ex = cand.data;
  const map = ex.map ? { src: mediaUrl(subjectId, ex.map), mark: ex.mark ?? null } : null;
  const filled = (ex.q ? ex.q.replace(/_{3,}/, ex.answer) : ex.answer)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\*\*/g, '');
  const speakable = ex.type === 'order' || /_{3,}/.test(ex.q ?? '');
  const speak = canSpeak && speakable && ex.speak !== false ? filled : null;
  const base = { explain: ex.explain ?? null, speak, strict: !!ex.strict };
  if (ex.type === 'column') {
    return {
      ...base,
      speak: null,
      pub: { type: 'column', prompt: ex.task ?? 'Rechne schriftlich.', op: ex.op ?? 'add', rows: ex.rows, carry: ex.carry !== false },
      expected: [ex.answer], qtype: 'column',
    };
  }
  if (ex.type === 'choice') {
    return {
      ...base,
      pub: { type: 'choice', prompt: ex.task ?? 'Was passt?', text: ex.q, textDe: ex.de ?? null, map, options: shuffle(ex.options) },
      expected: [ex.answer], qtype: 'choice',
    };
  }
  if (ex.type === 'order') {
    return {
      ...base,
      pub: { type: 'order', prompt: ex.task ?? 'Bring die Wörter in die richtige Reihenfolge.', text: ex.de ?? ex.q, words: scrambled(tokens(ex.answer)) },
      expected: [ex.answer, ...(ex.accept ?? [])], qtype: 'order',
    };
  }
  return {
    ...base,
    pub: { type: 'input', prompt: ex.task ?? 'Schreib das fehlende Wort.', text: ex.q, textDe: ex.de ?? null, map, hint: ex.hint ?? null, placeholder: ex.placeholder ?? '…', numeric: !!ex.numeric },
    expected: [ex.answer, ...(ex.accept ?? [])], qtype: 'input',
  };
}

function matchQuestion(unit) {
  const pairs = shuffle(unit.vocab).slice(0, 5).map((v) => [v.en, v.de]);
  return { pub: { type: 'match', prompt: 'Finde die Paare!', pairs }, expected: [], qtype: 'match', key: null };
}

// ---------------------------------------------------------------- Sitzung

export function startSession({ childId, subjectId, unitId, line: lineId, topic: topicId, mode = 'unit', count = 10 }) {
  const subject = subjects.get(subjectId);
  if (!subject) throw httpError(404, 'Dieses Fach gibt es nicht.');
  const canSpeak = !!subject.meta.speechLang;
  // Archivierte Stationen sind für das Kind aus dem Fahrplan genommen – auch im Fehler-Training, Endbahnhof und Blitz.
  const archived = archivedUnits(childId);
  const inService = (u) => !archived.has(`${subjectId}/${u.id}`);

  let candidates;
  let title;
  let unit = null;
  let refId = null;
  if (mode === 'review') {
    const rows = db
      .prepare(
        `SELECT item_key FROM item_stats WHERE child_id = ? AND subject = ? AND wrong > 0 AND box < 3 AND ${notArchivedSql('item_stats')}
         ORDER BY box ASC, last_seen ASC LIMIT ?`
      )
      .all(childId, subjectId, count * 3);
    candidates = rows
      .map((r) => {
        const item = resolveItem(r.item_key);
        const u = item && subject.units.get(item.unitId);
        return u ? { key: r.item_key, kind: item.kind, data: item.data, unit: u } : null;
      })
      .filter(Boolean);
    if (!candidates.length) throw httpError(400, 'Gerade gibt es nichts zu wiederholen. Super!');
    title = 'Fehler-Training';
    count = Math.min(count, candidates.length);
  } else if (mode === 'exam') {
    const line = (subject.meta.lines ?? []).find((l) => l.id === lineId);
    const status = lineStatus(childId)[subjectId]?.[lineId];
    if (!line || !status) throw httpError(404, 'Diesen Endbahnhof gibt es nicht.');
    if (!status.unlocked) throw httpError(400, 'Der Endbahnhof öffnet, wenn alle Stationen der Linie mindestens 2 Sterne haben.');
    candidates = lineUnits(subjectId, lineId).filter(inService).flatMap((u) => unitCandidates(subjectId, u, count));
    title = `Endbahnhof ${line.short ?? line.name}`;
    refId = line.id;
    count = line.examCount ?? Math.max(12, Math.round(count * 1.5));
  } else if (mode === 'blitz') {
    const topic = blitzTopics(subjectId).find((t) => t.id === topicId);
    if (!topic) throw httpError(404, 'Diese Blitzrunde gibt es nicht.');
    const units = [...subject.units.values()].filter((u) =>
      inService(u) && (topic.units ? topic.units.includes(u.id) : topic.line ? u.line === topic.line : true));
    candidates = units
      .flatMap((u) => unitCandidates(subjectId, u, 60))
      .filter((c) => c.kind === 'vocab' || !topic.types || topic.types.includes(c.data.type));
    if (!candidates.length) throw httpError(400, 'Für diese Blitzrunde gibt es noch keine Aufgaben.');
    title = topic.title;
    refId = topic.id;
    count = 80;
  } else {
    unit = subject.units.get(unitId);
    if (!unit) throw httpError(404, 'Diese Station gibt es nicht.');
    if (!inService(unit)) throw httpError(400, 'Diese Station ist gerade außer Betrieb.');
    candidates = unitCandidates(subjectId, unit, count);
    title = unit.title;
    refId = unit.id;
  }

  const withMatch = mode === 'unit' && unit.vocab.length >= 5 && count >= 8;
  const stats = statsFor(childId, [...new Set(candidates.map((c) => c.key))]);
  const chosen =
    mode === 'blitz' ? chooseForBlitz(candidates, stats, count)
    : mode === 'exam' ? shuffle(candidates).slice(0, count) // Prüfung: bunt gemischt über die ganze Linie
    : choose(candidates, stats, withMatch ? count - 1 : count);

  const questions = chosen.map((c) => {
    const q = c.kind === 'vocab'
      ? vocabQuestion(subject, c, stats.get(c.key), canSpeak && mode !== 'blitz', mode === 'blitz')
      : exerciseQuestion(subjectId, c, canSpeak && mode !== 'blitz');
    return { ...q, key: c.key, unitId: c.unit.id };
  });
  if (withMatch) questions.splice(Math.floor(questions.length / 2), 0, { ...matchQuestion(unit), unitId: unit.id });

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
    combo: 0,
    bestCombo: 0,
    questions: questions.map((q) => ({ ...q, answered: false, firstCorrect: false })),
  };
  active.set(id, session);

  return {
    sessionId: id,
    title,
    mode,
    seconds: mode === 'blitz' ? BLITZ_SECONDS : null,
    boosted: session.boosted,
    speechLang: mode === 'blitz' ? null : subject.meta.speechLang ?? null,
    questions: session.questions.map((q, i) => ({ id: i, ...q.pub })),
  };
}

function checkAnswer(q, given) {
  const strictOpt = { expand: !q.strict };
  const g = normalize(given, strictOpt);
  if (!g) return { correct: false };
  const correct = q.expected.some((e) => normalize(e, strictOpt) === g);
  const result = { correct };
  if (q.pub.type !== 'input') return result;

  const raw = String(given).trim();
  const main = q.expected[0];
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
  const target = normalize(main, strictOpt);
  if (target.length >= 4 && levenshtein(g, target) === 1) result.almost = true;
  return result;
}

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
  }

  const firstTry = !q.answered;
  if (firstTry) {
    q.answered = true;
    q.firstCorrect = result.correct;
  }
  s.combo = result.correct ? s.combo + 1 : 0;
  s.bestCombo = Math.max(s.bestCombo, s.combo);

  const now = nowIso();
  db.prepare(
    `INSERT INTO answers (session_id, child_id, subject, unit_id, item_key, qtype, correct, first_try, given, expected, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.id, s.childId, s.subject, q.unitId, q.key, q.qtype, result.correct ? 1 : 0, firstTry ? 1 : 0, givenText.slice(0, 200), q.expected[0] ?? '', now);

  if (q.key && firstTry) {
    const prev = db.prepare('SELECT box FROM item_stats WHERE child_id = ? AND item_key = ?').get(s.childId, q.key);
    const box = result.correct ? Math.min((prev?.box ?? 0) + 1, 5) : Math.max((prev?.box ?? 0) - 2, 0);
    db.prepare(
      `INSERT INTO item_stats (child_id, item_key, subject, unit_id, box, correct, wrong, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (child_id, item_key) DO UPDATE SET
         box = excluded.box, correct = correct + excluded.correct, wrong = wrong + excluded.wrong, last_seen = excluded.last_seen`
    ).run(s.childId, q.key, s.subject, q.unitId, box, result.correct ? 1 : 0, result.correct ? 0 : 1, now);
  }

  return {
    ...result,
    firstTry,
    combo: s.combo,
    solution: q.pub.type === 'match' ? null : q.expected[0],
    reveal: q.reveal ?? null,
    explain: q.explain ?? null,
    speak: q.speak ?? null,
  };
}

export function finishSession(sessionId) {
  const s = active.get(sessionId);
  if (!s) throw httpError(404, 'Diese Übung ist abgelaufen.');
  const answered = s.questions.filter((q) => q.answered);
  if (s.mode === 'blitz') {
    if (!answered.length) {
      active.delete(sessionId);
      return { mode: 'blitz', empty: true };
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
    correct: answered.filter((q) => q.firstCorrect).length,
    bestCombo: s.bestCombo,
  });
}

export function reviewCounts(childId) {
  const rows = db
    .prepare(`SELECT subject, COUNT(*) AS n FROM item_stats WHERE child_id = ? AND wrong > 0 AND box < 3 AND ${notArchivedSql('item_stats')} GROUP BY subject`)
    .all(childId);
  return Object.fromEntries(rows.map((r) => [r.subject, r.n]));
}
