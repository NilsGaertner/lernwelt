// Lootboxen: Überraschungs-Medienzeit für besondere Erfolge – eine Station aufs Abstellgleis gebracht
// oder eine ganze Linie geschafft (Endbahnhof bestanden) – oder als Geschenk der Eltern. Das Kind sammelt die Boxen und öffnet sie selbst;
// was drin ist, wird erst beim Öffnen ausgelost. Die Sterne daraus zählen nicht zum Tageslimit.
import { db, getPublicSettings, transaction } from './db.js';
import { localDay, nowIso, randomId } from './util.js';

/** Möglicher Inhalt in Minuten Medienzeit, mit Wahrscheinlichkeit. */
export const LOOT = [
  { minutes: 5, chance: 0.49 },
  { minutes: 10, chance: 0.3 },
  { minutes: 15, chance: 0.15 },
  { minutes: 20, chance: 0.05 },
  { minutes: 30, chance: 0.01 }, // der Hauptgewinn
];

function roll() {
  let r = Math.random();
  for (const l of LOOT) {
    r -= l.chance;
    if (r < 0) return l.minutes;
  }
  return LOOT[0].minutes;
}

/** Legt eine Box an. Jede Station und jede Linie gibt höchstens eine; sonst null. */
export function grantLootbox(childId, { source, subject, ref, note }) {
  const r = db
    .prepare('INSERT OR IGNORE INTO lootboxes (child_id, source, subject, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(childId, source, subject, ref, note, nowIso());
  return r.changes ? { id: Number(r.lastInsertRowid), source, note } : null;
}

/** Geschenk der Eltern als Ansporn. Davon darf es beliebig viele geben, darum bekommt jede Box eine eigene ref. */
export function giftLootbox(childId, message) {
  const note = message ? `Geschenk von deinen Eltern: „${message}“` : 'Geschenk von deinen Eltern';
  return grantLootbox(childId, { source: 'gift', subject: '', ref: randomId(8), note });
}

/** Ungeöffnete Boxen und die zuletzt geöffneten. */
export function lootboxes(childId, openedLimit = 10) {
  return {
    closed: db.prepare('SELECT id, source, note, created_at FROM lootboxes WHERE child_id = ? AND opened_at IS NULL ORDER BY id').all(childId),
    opened: db
      .prepare('SELECT id, source, note, minutes, stars, opened_at FROM lootboxes WHERE child_id = ? AND opened_at IS NOT NULL ORDER BY opened_at DESC LIMIT ?')
      .all(childId, openedLimit),
  };
}

/** Öffnet eine Box: lost die Minuten aus und schreibt die passenden Sterne gut (am Tageslimit vorbei). */
export function openLootbox(childId, boxId) {
  return transaction(() => {
    const box = db.prepare('SELECT * FROM lootboxes WHERE id = ? AND child_id = ?').get(boxId, childId);
    if (!box) throw Object.assign(new Error('Diese Lootbox gibt es nicht.'), { status: 404 });
    if (box.opened_at) throw Object.assign(new Error('Diese Lootbox ist schon offen.'), { status: 409 });
    const minutes = roll();
    // Aufgerundet wie beim Ticket-Preis, damit die Sterne wirklich für die Minuten reichen
    const stars = Math.ceil(minutes / getPublicSettings().minutesPerStar);
    const now = nowIso();
    db.prepare('UPDATE lootboxes SET opened_at = ?, minutes = ?, stars = ? WHERE id = ?').run(now, minutes, stars, box.id);
    db.prepare('INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      childId, stars, 'lootbox', `🎁 Lootbox (${box.note}): ${minutes} Minuten`, localDay(), now
    );
    return { id: box.id, note: box.note, minutes, stars };
  });
}
