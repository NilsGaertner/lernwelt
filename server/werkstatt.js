// Aufgaben-Werkstatt: Das Kind stellt selbst Aufgaben, die anderen Profile (z. B. Mama und Papa) lösen sie.
// Rollentausch: Hier ist das Kind der Experte, der kontrolliert. Es gibt dafür keine Sterne – der Spaß ist,
// dass die Erwachsenen rechnen müssen (und sich auch mal verrechnen).
import { db } from './db.js';
import { nowIso } from './util.js';

db.exec(`
CREATE TABLE IF NOT EXISTS puzzles (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- Jeder darf jede Aufgabe einmal lösen
CREATE TABLE IF NOT EXISTS puzzle_tries (
  puzzle_id INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  solver_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  given TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (puzzle_id, solver_id)
);
`);

const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * Vergleich wie beim Kind: Enthält die Lösung eine Zahl, zählt nur die Zahl (Leerzeichen, Tausenderpunkte und
 * Einheiten wie € oder km sind egal). Sonst zählt der Text ohne Groß/klein und Satzzeichen.
 */
export function sameAnswer(given, answer) {
  const num = (s) => String(s).replace(/(\d)[.\s](?=\d{3}\b)/g, '$1').match(/\d+(?:,\d+)?/g)?.join('|') ?? null;
  if (/\d/.test(answer)) return num(given) === num(answer);
  const plain = (s) => String(s).toLowerCase().replace(/[.!?,;:"'„“]/g, '').replace(/\s+/g, ' ').trim();
  return plain(given) === plain(answer);
}

const person = (row, prefix) => ({ id: row[`${prefix}_id`], name: row[`${prefix}_name`], avatar: row[`${prefix}_avatar`] });

export function werkstatt(childId) {
  const mine = db.prepare('SELECT id, text, answer, created_at FROM puzzles WHERE author_id = ? ORDER BY id DESC').all(childId);
  const tries = db.prepare(
    `SELECT t.puzzle_id, t.given, t.correct, c.id AS solver_id, c.name AS solver_name, c.avatar AS solver_avatar
     FROM puzzle_tries t JOIN children c ON c.id = t.solver_id JOIN puzzles p ON p.id = t.puzzle_id
     WHERE p.author_id = ? ORDER BY t.created_at`
  ).all(childId);
  const forMe = db.prepare(
    `SELECT p.id, p.text, p.answer, p.created_at, a.id AS author_id, a.name AS author_name, a.avatar AS author_avatar,
            t.given, t.correct
     FROM puzzles p JOIN children a ON a.id = p.author_id
     LEFT JOIN puzzle_tries t ON t.puzzle_id = p.id AND t.solver_id = ?
     WHERE p.author_id != ? ORDER BY (t.given IS NOT NULL), p.id DESC`
  ).all(childId, childId);
  return {
    mine: mine.map((p) => ({
      id: p.id, text: p.text, answer: p.answer, createdAt: p.created_at,
      tries: tries.filter((t) => t.puzzle_id === p.id).map((t) => ({ solver: person(t, 'solver'), given: t.given, correct: !!t.correct })),
    })),
    forMe: forMe.map((p) => ({
      id: p.id, text: p.text, createdAt: p.created_at, author: person(p, 'author'),
      // Die Lösung gibt es erst nach dem eigenen Versuch.
      tried: p.given != null ? { given: p.given, correct: !!p.correct, answer: p.answer } : null,
    })),
  };
}

/** Für die Startseite: wie viele Aufgaben auf mich warten, und wie viele meiner Aufgaben schon jemand gelöst hat. */
export function werkstattCounts(childId) {
  const open = db.prepare(
    `SELECT COUNT(*) AS n FROM puzzles p WHERE p.author_id != ?
     AND NOT EXISTS (SELECT 1 FROM puzzle_tries t WHERE t.puzzle_id = p.id AND t.solver_id = ?)`
  ).get(childId, childId).n;
  const solved = db.prepare('SELECT COUNT(*) AS n FROM puzzle_tries t JOIN puzzles p ON p.id = t.puzzle_id WHERE p.author_id = ?').get(childId).n;
  const mine = db.prepare('SELECT COUNT(*) AS n FROM puzzles WHERE author_id = ?').get(childId).n;
  return { open, solved, mine };
}

export function addPuzzle(childId, { text, answer }) {
  const t = String(text ?? '').trim().slice(0, 500);
  const a = String(answer ?? '').trim().slice(0, 60);
  if (t.length < 3) throw fail(400, 'Die Aufgabe ist noch ein bisschen kurz.');
  if (!a) throw fail(400, 'Was ist die richtige Lösung? Die brauchst du zum Kontrollieren.');
  const { lastInsertRowid } = db.prepare('INSERT INTO puzzles (author_id, text, answer, created_at) VALUES (?, ?, ?, ?)')
    .run(childId, t, a, nowIso());
  return { id: Number(lastInsertRowid) };
}

export function deletePuzzle(childId, puzzleId) {
  const r = db.prepare('DELETE FROM puzzles WHERE id = ? AND author_id = ?').run(puzzleId, childId);
  if (!r.changes) throw fail(404, 'Diese Aufgabe gibt es nicht.');
  return { ok: true };
}

export function tryPuzzle(childId, puzzleId, given) {
  const p = db.prepare('SELECT id, author_id, answer FROM puzzles WHERE id = ?').get(puzzleId);
  if (!p) throw fail(404, 'Diese Aufgabe gibt es nicht mehr.');
  if (p.author_id === childId) throw fail(400, 'Die eigene Aufgabe lösen die anderen.');
  const g = String(given ?? '').trim().slice(0, 60);
  if (!g) throw fail(400, 'Da fehlt noch die Antwort.');
  const done = db.prepare('SELECT given, correct FROM puzzle_tries WHERE puzzle_id = ? AND solver_id = ?').get(puzzleId, childId);
  if (done) return { correct: !!done.correct, given: done.given, answer: p.answer, already: true };
  const correct = sameAnswer(g, p.answer);
  db.prepare('INSERT INTO puzzle_tries (puzzle_id, solver_id, given, correct, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(puzzleId, childId, g, correct ? 1 : 0, nowIso());
  return { correct, given: g, answer: p.answer };
}
