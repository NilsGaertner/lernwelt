import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPin } from './util.js';

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
`);

/** Sterne-Arten, die als „verdient“ zählen (für Tageslimit und Statistik). */
export const EARN_KINDS = ['session', 'bonus', 'badge'];

const DEFAULT_SETTINGS = {
  minutesPerStar: '2',
  dailyStarLimit: '30',
  questionsPerSession: '10',
  ticketMinutes: '15,30,60',
};

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
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
