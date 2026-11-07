// Wiederholen mit wachsenden Abständen (Leitner-Boxen).
// Jede Aufgabe liegt in einer Box von 0 (neu oder wacklig) bis 7 (sitzt richtig). Eine richtige Antwort hebt sie
// nur dann eine Box höher, wenn sie wieder „fällig“ war – wer eine Station dreimal am selben Tag fährt, lernt
// die Wörter dadurch nicht schneller „sicher“. Fällig wird eine Aufgabe nach INTERVAL_DAYS[box] Tagen.
import { db, getSetting, setSetting, transaction } from './db.js';
import { subjects, resolveItem, itemIndex, exerciseKey } from './content.js';
import { notArchivedSql } from './progress.js';
import { localDay, addDays } from './util.js';

/**
 * Nach so vielen Tagen ist eine Aufgabe in Box 0 … 7 wieder dran. Die langen Abstände am Ende (60 und 120 Tage)
 * halten die tägliche Wiederholung klein, auch wenn es viele Hundert gelernte Wörter und Aufgaben gibt.
 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
const MAX_BOX = INTERVAL_DAYS.length - 1;

/** Ab dieser Box „sitzt“ eine Aufgabe: Sie war an mindestens drei Tagen richtig, mit Pausen dazwischen. */
export const KNOWN_BOX = 3;

/**
 * Neue Box und neues Fälligkeitsdatum nach einer Antwort.
 * outcome: 'right' | 'half' (erst nach dem Verbessern oder mit Tipp richtig) | 'wrong'
 * blitz: In der Blitzrunde wird nur angetippt – das darf eine Box senken, aber nicht heben.
 */
export function nextBox(prev, outcome, { today = localDay(), blitz = false } = {}) {
  const box = prev?.box ?? 0;
  const due = prev?.due ?? null;
  // Falsch: zwei Boxen zurück, aus den langen Abständen höchstens bis Box 3 – ein Wort, das nach 120 Tagen
  // vergessen war, soll nicht gleich wieder für zwei Monate verschwinden.
  if (outcome === 'wrong') return { box: Math.max(Math.min(box - 2, KNOWN_BOX), 0), due: addDays(today, 1) };
  if (outcome === 'half') return { box, due: addDays(today, 1) };
  if (blitz) return { box, due };
  if (box > 0 && due && due > today) return { box, due };
  const next = Math.min(box + 1, MAX_BOX);
  return { box: next, due: addDays(today, INTERVAL_DAYS[next]) };
}

/**
 * Speichert eine Antwort (nur der erste Versuch einer Aufgabe zählt).
 * known_at merkt sich, wann die Aufgabe zum ersten Mal in Box 3 gekommen ist („Das sitzt“). Es bleibt stehen, auch
 * wenn die Aufgabe später wieder wackelt: Die Zahl, die das Kind sieht, soll nie kleiner werden – eine Zahl, die
 * schrumpft, fühlt sich wie Verlieren an (siehe „Weniger Druck“ in der README). Was wackelt, holt das Fehler-Training.
 * Gibt zurück, ob die Aufgabe mit dieser Antwort zum ersten Mal „sitzt“.
 */
export function recordAnswer({ childId, key, subject, unitId, outcome, blitz, at }) {
  const prev = db.prepare('SELECT box, due, known_at FROM item_stats WHERE child_id = ? AND item_key = ?').get(childId, key);
  const { box, due } = nextBox(prev, outcome, { blitz });
  const becameKnown = box >= KNOWN_BOX && !prev?.known_at;
  const knownAt = prev?.known_at ?? (box >= KNOWN_BOX ? at : null);
  db.prepare(
    `INSERT INTO item_stats (child_id, item_key, subject, unit_id, box, correct, wrong, last_seen, due, known_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (child_id, item_key) DO UPDATE SET
       box = excluded.box, correct = correct + excluded.correct, wrong = wrong + excluded.wrong,
       last_seen = excluded.last_seen, due = excluded.due, known_at = excluded.known_at`
  ).run(childId, key, subject, unitId, box, outcome === 'right' ? 1 : 0, outcome === 'right' ? 0 : 1, at, due, knownAt);
  return { box, becameKnown };
}

/** known_at für Aufgaben, die schon saßen, bevor die Lernwelt das mitgeschrieben hat – zählen mit, aber nicht als neu. */
const KNOWN_BEFORE = '2000-01-01T00:00:00.000Z';

/**
 * Aufgaben in Box 3 oder höher ohne known_at (aus der Zeit, bevor es das gab, oder nach dem Zusammenlegen früherer
 * Aufgaben) bekommen ein frühes Datum. So bleiben sie für „Das sitzt“ gezählt, auch wenn sie später wackeln, und
 * erscheinen nicht als „neu“ oder „diese Woche“. Läuft bei jedem Start; ändert nur, was noch fehlt.
 */
export function markKnownItems() {
  const r = db.prepare('UPDATE item_stats SET known_at = ? WHERE known_at IS NULL AND box >= ?').run(KNOWN_BEFORE, KNOWN_BOX);
  if (r.changes) console.log(`„Das sitzt“: ${r.changes} Aufgaben, die schon vorher saßen, übernommen.`);
  return Number(r.changes);
}

/** Montag der Woche eines Tages (YYYY-MM-DD). */
function weekStart(day) {
  const d = new Date(`${day}T12:00:00`);
  return addDays(day, -((d.getDay() + 6) % 7));
}

/**
 * „Das sitzt“: Wörter und Aufgaben, die schon einmal in Box 3 waren – also an mehreren Tagen mit Pausen richtig.
 * Sterne zeigen nur, wie eine Fahrt lief; das hier zeigt, was im Kopf geblieben ist. Die Zahl sinkt nicht (siehe recordAnswer).
 * Inhalte, die es nicht mehr gibt, zählen nicht mit. week: seit Montag zum ersten Mal dazugekommen.
 */
export function knownCounts(childId) {
  const monday = weekStart(localDay());
  const rows = db
    .prepare('SELECT item_key, subject, known_at FROM item_stats WHERE child_id = ? AND (known_at IS NOT NULL OR box >= ?)')
    .all(childId, KNOWN_BOX);
  const out = { total: 0, week: 0, bySubject: {} };
  for (const r of rows) {
    if (!resolveItem(r.item_key)) continue;
    out.total++;
    out.bySubject[r.subject] = (out.bySubject[r.subject] ?? 0) + 1;
    if (r.known_at && localDay(new Date(r.known_at)) >= monday) out.week++;
  }
  return out;
}

/**
 * Frühere Aufgaben übernehmen: Eine Aufgabe kann mit "formerIds" sagen, welche Aufgaben ihrer Station sie ersetzt –
 * z. B. den Schreib-Zwilling, seit sie selbst mit "recall" vom Auswählen zum Schreiben wechselt (siehe session.js).
 * Gibt es die frühere Aufgabe nicht mehr, geht ihr Lernstand auf die neue über; haben beide einen, zählt die höhere Box.
 * Läuft bei jedem Einlesen der Inhalte und ändert nur etwas, wenn es noch etwas zu übernehmen gibt.
 */
export function foldFormerItems() {
  const twins = new Map(); // Schlüssel der früheren Aufgabe -> Schlüssel der Aufgabe, die sie ersetzt
  for (const [sid, { units }] of subjects) {
    for (const unit of units.values()) {
      for (const ex of unit.exercises) {
        for (const id of ex.formerIds ?? []) {
          const old = `${sid}/${unit.id}/x/${id}`;
          if (!itemIndex.has(old)) twins.set(old, exerciseKey(sid, unit.id, ex));
        }
      }
    }
  }
  if (!twins.size) return 0;
  const rows = db.prepare('SELECT * FROM item_stats').all().filter((r) => twins.has(r.item_key));
  if (!rows.length) return 0;
  transaction(() => {
    const own = db.prepare('SELECT * FROM item_stats WHERE child_id = ? AND item_key = ?');
    const rename = db.prepare('UPDATE item_stats SET item_key = ? WHERE child_id = ? AND item_key = ?');
    const merge = db.prepare(
      'UPDATE item_stats SET box = ?, due = ?, known_at = ?, correct = ?, wrong = ?, last_seen = ? WHERE child_id = ? AND item_key = ?'
    );
    const drop = db.prepare('DELETE FROM item_stats WHERE child_id = ? AND item_key = ?');
    for (const t of rows) {
      const key = twins.get(t.item_key);
      const o = own.get(t.child_id, key);
      if (!o) {
        rename.run(key, t.child_id, t.item_key);
        continue;
      }
      const better = t.box > o.box ? t : o;
      const last = [o.last_seen, t.last_seen].filter(Boolean).sort().at(-1) ?? null;
      const known = [o.known_at, t.known_at].filter(Boolean).sort()[0] ?? null; // das erste Mal „sitzt“
      merge.run(better.box, better.due, known, o.correct + t.correct, o.wrong + t.wrong, last, t.child_id, key);
      drop.run(t.child_id, t.item_key);
    }
  });
  console.log(`Frühere Aufgaben zusammengelegt: Lernstand von ${rows.length} Einträgen übernommen.`);
  return rows.length;
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
