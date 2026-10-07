// Wiederholen mit wachsenden Abständen (Leitner-Boxen).
// Jede Aufgabe liegt in einer Box von 0 (neu oder wacklig) bis 5 (sitzt richtig). Eine richtige Antwort hebt sie
// nur dann eine Box höher, wenn sie wieder „fällig“ war – wer eine Station dreimal am selben Tag fährt, lernt
// die Wörter dadurch nicht schneller „sicher“. Fällig wird eine Aufgabe nach INTERVAL_DAYS[box] Tagen.
import { db, getSetting, setSetting, transaction } from './db.js';
import { subjects, resolveItem } from './content.js';
import { notArchivedSql } from './progress.js';
import { localDay, addDays } from './util.js';

/** Nach so vielen Tagen ist eine Aufgabe in Box 0 … 5 wieder dran. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

/**
 * Neue Box und neues Fälligkeitsdatum nach einer Antwort.
 * outcome: 'right' | 'half' (erst nach dem Verbessern richtig) | 'wrong'
 * blitz: In der Blitzrunde wird nur angetippt – das darf eine Box senken, aber nicht heben.
 */
export function nextBox(prev, outcome, { today = localDay(), blitz = false } = {}) {
  const box = prev?.box ?? 0;
  const due = prev?.due ?? null;
  if (outcome === 'wrong') return { box: Math.max(box - 2, 0), due: addDays(today, 1) };
  if (outcome === 'half') return { box, due: addDays(today, 1) };
  if (blitz) return { box, due };
  if (box > 0 && due && due > today) return { box, due };
  const next = Math.min(box + 1, 5);
  return { box: next, due: addDays(today, INTERVAL_DAYS[next]) };
}

/** Speichert eine Antwort (nur der erste Versuch einer Aufgabe zählt). */
export function recordAnswer({ childId, key, subject, unitId, outcome, blitz, at }) {
  const prev = db.prepare('SELECT box, due FROM item_stats WHERE child_id = ? AND item_key = ?').get(childId, key);
  const { box, due } = nextBox(prev, outcome, { blitz });
  db.prepare(
    `INSERT INTO item_stats (child_id, item_key, subject, unit_id, box, correct, wrong, last_seen, due)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (child_id, item_key) DO UPDATE SET
       box = excluded.box, correct = correct + excluded.correct, wrong = wrong + excluded.wrong,
       last_seen = excluded.last_seen, due = excluded.due`
  ).run(childId, key, subject, unitId, box, outcome === 'right' ? 1 : 0, outcome === 'right' ? 0 : 1, at, due);
}

// ---------------------------------------------------------------- Fehler-Training und Wiederholung

// Fehler-Training: war schon mal falsch und sitzt noch nicht.
const SHAKY = 'wrong > 0 AND box < 3';

/**
 * Aufgaben fürs Üben über alle Stationen eines Fachs (oder aller Fächer), schon aufgelöst.
 * kind 'review': das Fehler-Training · kind 'due': heute fällige Aufgaben, die eigentlich schon sitzen
 * (ohne die aus dem Fehler-Training – so überschneiden sich die beiden nicht).
 * Berechnete Aufgaben (schriftlich rechnen) kommen nicht in die Wiederholung: Dort gibt es jedes Mal neue Zahlen.
 */
export function practiceItems(childId, kind, subjectId = null, limit = 500) {
  const today = localDay();
  const where = kind === 'due'
    ? `box >= 1 AND (due IS NULL OR due <= ?) AND NOT (${SHAKY}) AND item_key NOT LIKE '%/g/%'`
    : SHAKY;
  const order = kind === 'due' ? 'due ASC, box ASC' : 'box ASC, last_seen ASC';
  const rows = db
    .prepare(
      `SELECT item_key, subject, box FROM item_stats
       WHERE child_id = ? AND ${where} ${subjectId ? 'AND subject = ?' : ''} AND ${notArchivedSql('item_stats')}
       ORDER BY ${order} LIMIT ?`
    )
    .all(childId, ...(kind === 'due' ? [today] : []), ...(subjectId ? [subjectId] : []), limit);
  const out = [];
  for (const r of rows) {
    const item = resolveItem(r.item_key);
    const unit = item && subjects.get(r.subject)?.units.get(item.unitId);
    if (unit) out.push({ key: r.item_key, kind: item.kind, data: item.data, unit, subject: r.subject });
  }
  return out;
}

/** Wie viele Aufgaben pro Fach im Fehler-Training bzw. in der Wiederholung warten. */
export function practiceCounts(childId, kind) {
  const counts = {};
  for (const it of practiceItems(childId, kind)) counts[it.subject] = (counts[it.subject] ?? 0) + 1;
  return counts;
}

// ---------------------------------------------------------------- Umstellung bestehender Daten

/**
 * Einmalig: Boxen und Fälligkeit aus allen bisherigen Antworten neu berechnen.
 * Vorher stieg eine Box bei jeder richtigen Antwort, auch mehrmals am Tag und in der Blitzrunde.
 */
export function migrateSpacing() {
  if (getSetting('spacingVersion') === '1') return;
  const rows = db
    .prepare(
      `SELECT a.child_id, a.item_key, a.correct, a.created_at, s.mode
       FROM answers a LEFT JOIN sessions s ON s.id = a.session_id
       WHERE a.item_key IS NOT NULL AND a.first_try = 1 ORDER BY a.id`
    )
    .all();
  const state = new Map();
  for (const r of rows) {
    const k = `${r.child_id}|${r.item_key}`;
    state.set(k, nextBox(state.get(k), r.correct ? 'right' : 'wrong', { today: localDay(new Date(r.created_at)), blitz: r.mode === 'blitz' }));
  }
  transaction(() => {
    const upd = db.prepare('UPDATE item_stats SET box = ?, due = ? WHERE child_id = ? AND item_key = ?');
    for (const [k, s] of state) {
      const i = k.indexOf('|');
      upd.run(s.box, s.due, Number(k.slice(0, i)), k.slice(i + 1));
    }
    setSetting('spacingVersion', '1');
  });
  if (state.size) console.log(`Wiederholung mit Abständen: ${state.size} Aufgaben neu eingeordnet.`);
}
