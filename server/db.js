import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPin, localDay, nowIso } from './util.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve(import.meta.dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function openDatabase(file) {
  try {
    return new DatabaseSync(file);
  } catch (err) {
    console.error(`Die Datenbank ${file} lässt sich nicht öffnen. Darf die App in ${DATA_DIR} schreiben?`);
    throw err;
  }
}

export const db = openDatabase(path.join(DATA_DIR, 'lernwelt.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🦊',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  unit_id TEXT,
  mode TEXT NOT NULL,
  day TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  total INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_child ON sessions(child_id, day);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  unit_id TEXT,
  item_key TEXT,
  qtype TEXT NOT NULL,
  correct INTEGER NOT NULL,
  first_try INTEGER NOT NULL,
  given TEXT,
  expected TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_child ON answers(child_id);

CREATE TABLE IF NOT EXISTS item_stats (
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT,
  PRIMARY KEY (child_id, item_key)
);

CREATE TABLE IF NOT EXISTS star_ledger (
  id INTEGER PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_child ON star_ledger(child_id, day);

CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS badges (
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (child_id, badge_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_limits (
  day TEXT PRIMARY KEY,
  star_limit INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_plans (
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  missions TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (child_id, day)
);

-- Einstellungen der Eltern pro Kind und Station: archiviert (ausgeblendet) oder
-- vom Abstellgleis für ein paar Fahrten zurückgeholt (extra_rides = so viele Fahrten bringen wieder Sterne)
CREATE TABLE IF NOT EXISTS unit_state (
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  extra_rides INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (child_id, subject, unit_id)
);

-- Lootboxen: source 'station' (Station aufs Abstellgleis gebracht), 'line' (Endbahnhof bestanden) oder 'gift' (Geschenk der Eltern),
-- ref = Station, Linie bzw. eine Zufalls-ID.
-- Der Inhalt wird erst beim Öffnen ausgelost.
CREATE TABLE IF NOT EXISTS lootboxes (
  id INTEGER PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  subject TEXT NOT NULL,
  ref TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  opened_at TEXT,
  minutes INTEGER,
  stars INTEGER,
  UNIQUE (child_id, source, subject, ref)
);

-- Gesammelte Avatar-Skins (source: 'line' = Endbahnhof bestanden, 'gift' = Geschenk der Eltern)
CREATE TABLE IF NOT EXISTS avatar_skins (
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  skin_id TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (child_id, skin_id)
);
`);

// Spalten, die nach der ersten Version dazugekommen sind
function addColumn(table, column, definition) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('sessions', 'best_combo', 'INTEGER NOT NULL DEFAULT 0');
addColumn('sessions', 'run_today', 'INTEGER NOT NULL DEFAULT 1');
addColumn('sessions', 'boosted', 'INTEGER NOT NULL DEFAULT 0');
addColumn('sessions', 'parked', 'INTEGER NOT NULL DEFAULT 0');
addColumn('children', 'train', 'TEXT');
addColumn('children', 'adult', 'INTEGER NOT NULL DEFAULT 0');
addColumn('children', 'skin', 'TEXT');
// Companion (Katze + Skin) ist vom Profilbild getrennt; wer bisher eine Katze als Bild hatte, behält sie als Companion
if (!db.prepare('PRAGMA table_info(children)').all().some((c) => c.name === 'companion')) {
  db.exec("ALTER TABLE children ADD COLUMN companion TEXT NOT NULL DEFAULT 'cat:black'");
  db.exec("UPDATE children SET companion = avatar WHERE avatar LIKE 'cat:%'");
}

/** Sterne-Arten, die als „verdient“ zählen (für Tageslimit und Statistik). */
export const EARN_KINDS = ['session', 'bonus', 'badge'];

const DEFAULT_SETTINGS = {
  minutesPerStar: '1',
  dailyStarLimit: '60',
  questionsPerSession: '10',
  ticketMinutes: '15,30,60',
  starScale: '2',
  retireAfter: '5',
};

const freshDatabase = !db.prepare("SELECT 1 FROM settings WHERE key = 'minutesPerStar'").get();
if (!freshDatabase && !getSetting('starScale')) doubleStarScale();
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Einmalige Umstellung auf die gestaffelten Sterne (1. Fahrt am Tag zählt doppelt): Alle Sterne sind ab jetzt
 * halb so viel Medienzeit wert. Damit nichts verloren geht, werden Konto, Tickets und Einstellungen umgerechnet.
 */
function doubleStarScale() {
  transaction(() => {
    db.exec('UPDATE star_ledger SET amount = amount * 2');
    db.exec('UPDATE redemptions SET stars = stars * 2');
    db.exec('UPDATE sessions SET stars = stars * 2');
    setSetting('minutesPerStar', Number(getSetting('minutesPerStar') ?? 2) / 2);
    setSetting('dailyStarLimit', Number(getSetting('dailyStarLimit') ?? 30) * 2);
    db.prepare(
      `INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at)
       SELECT DISTINCT child_id, 0, 'system', 'Umstellung: alle Sterne verdoppelt, ein Stern ist jetzt halb so viel Zeit wert', ?, ?
       FROM star_ledger`
    ).run(localDay(), nowIso());
    setSetting('starScale', '2');
  });
  console.log('Sterne auf die neue Staffelung umgestellt (Konto verdoppelt, Minuten pro Stern halbiert).');
}
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'pinHash'").get()) {
  const pin = process.env.PARENT_PIN || '1234';
  db.prepare("INSERT INTO settings (key, value) VALUES ('pinHash', ?)").run(hashPin(pin));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pinIsDefault', ?)").run(process.env.PARENT_PIN ? '0' : '1');
}

export function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getPublicSettings() {
  return {
    minutesPerStar: Number(getSetting('minutesPerStar')),
    dailyStarLimit: Number(getSetting('dailyStarLimit')),
    questionsPerSession: Number(getSetting('questionsPerSession')),
    retireAfter: Number(getSetting('retireAfter')),
    ticketMinutes: getSetting('ticketMinutes')
      .split(',')
      .map((m) => Number(m.trim()))
      .filter((m) => m > 0),
  };
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
