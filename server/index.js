import express from 'express';
import path from 'node:path';
import { db, getSetting, setSetting, getPublicSettings } from './db.js';
import { loadContent, publicSubjects, publicUnit, subjects, itemLabel } from './content.js';
import { publicBadges } from './badges.js';
import { startSession, answerQuestion, finishSession, reviewCounts } from './session.js';
import {
  balance, earnedOn, streak, unitProgress, earnedBadges, requestTicket, decideTicket, tickets, adjustStars,
} from './rewards.js';
import { localDay, addDays, nowIso, randomId, hashPin, verifyPin } from './util.js';

const PORT = Number(process.env.PORT) || 8080;
const problems = await loadContent();
for (const p of problems) console.warn(`[Inhalt] ${p}`);

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.resolve(import.meta.dirname, '..', 'public'), { extensions: ['html'] }));

const fail = (status, message) => Object.assign(new Error(message), { status });

function childOr404(id) {
  const child = db.prepare('SELECT id, name, avatar FROM children WHERE id = ?').get(Number(id));
  if (!child) throw fail(404, 'Dieses Profil gibt es nicht.');
  return child;
}

// ================================================================ Kinder-Bereich

app.get('/api/meta', (req, res) => {
  res.json({ subjects: publicSubjects(), badges: publicBadges(), settings: getPublicSettings() });
});

app.get('/api/children', (req, res) => {
  res.json(db.prepare('SELECT id, name, avatar FROM children ORDER BY id').all());
});

app.get('/api/children/:id/overview', (req, res) => {
  const child = childOr404(req.params.id);
  const settings = getPublicSettings();
  res.json({
    child,
    balance: balance(child.id),
    earnedToday: earnedOn(child.id),
    dailyLimit: settings.dailyStarLimit,
    streak: streak(child.id),
    progress: unitProgress(child.id),
    review: reviewCounts(child.id),
    badges: earnedBadges(child.id),
    tickets: tickets(child.id, 10),
    settings,
  });
});

app.get('/api/subjects/:subject/units/:unit', (req, res) => {
  const unit = publicUnit(req.params.subject, req.params.unit);
  if (!unit) throw fail(404, 'Diese Station gibt es nicht.');
  res.json(unit);
});

app.post('/api/sessions', (req, res) => {
  const { childId, subject, unit, mode } = req.body ?? {};
  const child = childOr404(childId);
  const count = getPublicSettings().questionsPerSession;
  res.json(startSession({ childId: child.id, subjectId: subject, unitId: unit, mode: mode === 'review' ? 'review' : 'unit', count }));
});

app.post('/api/sessions/:id/answer', (req, res) => {
  res.json(answerQuestion(req.params.id, Number(req.body?.qid), req.body?.answer));
});

app.post('/api/sessions/:id/finish', (req, res) => {
  res.json(finishSession(req.params.id));
});

app.post('/api/children/:id/tickets', (req, res) => {
  const child = childOr404(req.params.id);
  res.json(requestTicket(child.id, Number(req.body?.minutes)));
});

app.post('/api/children/:id/tickets/:ticket/cancel', (req, res) => {
  const child = childOr404(req.params.id);
  res.json(decideTicket(Number(req.params.ticket), 'cancelled', { childId: child.id }));
});

// ================================================================ Eltern-Bereich

const parentTokens = new Map();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
let failedLogins = 0;
let lockedUntil = 0;

app.post('/api/parent/login', (req, res) => {
  if (Date.now() < lockedUntil) throw fail(429, 'Zu viele Versuche. Bitte eine Minute warten.');
  if (!verifyPin(String(req.body?.pin ?? ''), getSetting('pinHash'))) {
    if (++failedLogins >= 5) {
      lockedUntil = Date.now() + 60_000;
      failedLogins = 0;
    }
    throw fail(401, 'Die PIN stimmt nicht.');
  }
  failedLogins = 0;
  const token = randomId(24);
  parentTokens.set(token, Date.now() + TOKEN_TTL_MS);
  res.json({ token });
});

const parent = express.Router();
parent.use((req, res, next) => {
  const token = req.get('x-parent-token');
  const exp = token && parentTokens.get(token);
  if (!exp || exp < Date.now()) {
    if (token) parentTokens.delete(token);
    throw fail(401, 'Bitte erneut mit der Eltern-PIN anmelden.');
  }
  next();
});

parent.post('/logout', (req, res) => {
  parentTokens.delete(req.get('x-parent-token'));
  res.json({ ok: true });
});

parent.get('/overview', (req, res) => {
  const today = localDay();
  const weekStart = addDays(today, -6);
  const children = db.prepare('SELECT id, name, avatar FROM children ORDER BY id').all().map((c) => {
    const t = db
      .prepare(
        `SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_sec), 0) AS secs, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(total), 0) AS total
         FROM sessions WHERE child_id = ? AND day = ?`
      )
      .get(c.id, today);
    const w = db
      .prepare('SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_sec), 0) AS secs FROM sessions WHERE child_id = ? AND day >= ?')
      .get(c.id, weekStart);
    const last = db.prepare('SELECT MAX(finished_at) AS last FROM sessions WHERE child_id = ?').get(c.id).last;
    return {
      ...c,
      balance: balance(c.id),
      earnedToday: earnedOn(c.id, today),
      streak: streak(c.id),
      today: { sessions: t.sessions, minutes: Math.round(t.secs / 60), accuracy: t.total ? Math.round((t.correct * 100) / t.total) : null },
      week: { sessions: w.sessions, minutes: Math.round(w.secs / 60) },
      lastActive: last,
    };
  });
  const pending = db
    .prepare(
      `SELECT r.*, c.name AS child_name, c.avatar FROM redemptions r JOIN children c ON c.id = r.child_id
       WHERE r.status = 'pending' ORDER BY r.created_at`
    )
    .all();
  res.json({ children, pending, settings: getPublicSettings(), pinIsDefault: getSetting('pinIsDefault') === '1' });
});

parent.get('/children/:id', (req, res) => {
  const child = childOr404(req.params.id);
  const today = localDay();
  const from = addDays(today, -13);
  const perDay = new Map(
    db
      .prepare(
        `SELECT day, COUNT(*) AS sessions, SUM(duration_sec) AS secs, SUM(correct) AS correct, SUM(total) AS total
         FROM sessions WHERE child_id = ? AND day >= ? GROUP BY day`
      )
      .all(child.id, from)
      .map((r) => [r.day, r])
  );
  const starsPerDay = new Map(
    db
      .prepare("SELECT day, SUM(amount) AS stars FROM star_ledger WHERE child_id = ? AND day >= ? AND amount > 0 AND kind IN ('session','bonus','badge') GROUP BY day")
      .all(child.id, from)
      .map((r) => [r.day, r.stars])
  );
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    const d = perDay.get(day);
    days.push({
      day,
      sessions: d?.sessions ?? 0,
      minutes: Math.round((d?.secs ?? 0) / 60),
      accuracy: d?.total ? Math.round((d.correct * 100) / d.total) : null,
      stars: starsPerDay.get(day) ?? 0,
    });
  }

  const progress = unitProgress(child.id);
  const units = [];
  for (const [sid, { meta, units: us }] of subjects) {
    for (const u of us.values()) {
      const p = progress[sid]?.[u.id];
      units.push({ subject: sid, subjectName: meta.name, id: u.id, title: u.title, subtitle: u.subtitle ?? '', line: u.line, best: p?.best ?? 0, runs: p?.runs ?? 0, avg: p?.avg ?? null, last: p?.last ?? null });
    }
  }

  const unitTitle = (sid, uid) => subjects.get(sid)?.units.get(uid)?.title ?? uid ?? 'Fehler-Training';
  const weak = db
    .prepare(
      `SELECT * FROM item_stats WHERE child_id = ? AND wrong > 0 AND box < 3
       ORDER BY (wrong - correct * 0.5) DESC, box ASC LIMIT 20`
    )
    .all(child.id)
    .map((r) => ({ label: itemLabel(r.item_key), unit: unitTitle(r.subject, r.unit_id), correct: r.correct, wrong: r.wrong, box: r.box }));
  const mastered = db.prepare('SELECT COUNT(*) AS n FROM item_stats WHERE child_id = ? AND box >= 3').get(child.id).n;
  const seen = db.prepare('SELECT COUNT(*) AS n FROM item_stats WHERE child_id = ?').get(child.id).n;

  const sessions = db
    .prepare('SELECT * FROM sessions WHERE child_id = ? ORDER BY finished_at DESC LIMIT 25')
    .all(child.id)
    .map((s) => ({ ...s, title: s.mode === 'review' ? 'Fehler-Training' : unitTitle(s.subject, s.unit_id) }));
  const ledger = db.prepare('SELECT * FROM star_ledger WHERE child_id = ? ORDER BY id DESC LIMIT 40').all(child.id);

  res.json({
    child,
    balance: balance(child.id),
    streak: streak(child.id),
    badges: earnedBadges(child.id),
    days,
    units,
    weak,
    mastered,
    seen,
    sessions,
    ledger,
    tickets: tickets(child.id, 20),
  });
});

parent.post('/children', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) throw fail(400, 'Bitte einen Namen eingeben.');
  const avatar = String(req.body?.avatar ?? '🦊').slice(0, 8);
  const { lastInsertRowid } = db.prepare('INSERT INTO children (name, avatar, created_at) VALUES (?, ?, ?)').run(name, avatar, nowIso());
  res.json({ id: Number(lastInsertRowid), name, avatar });
});

parent.put('/children/:id', (req, res) => {
  const child = childOr404(req.params.id);
  const name = String(req.body?.name ?? child.name).trim().slice(0, 40) || child.name;
  const avatar = String(req.body?.avatar ?? child.avatar).slice(0, 8);
  db.prepare('UPDATE children SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, child.id);
  res.json({ ...child, name, avatar });
});

parent.delete('/children/:id', (req, res) => {
  const child = childOr404(req.params.id);
  db.prepare('DELETE FROM children WHERE id = ?').run(child.id);
  res.json({ ok: true });
});

parent.post('/children/:id/stars', (req, res) => {
  const child = childOr404(req.params.id);
  const amount = Math.trunc(Number(req.body?.amount));
  if (!amount || Math.abs(amount) > 500) throw fail(400, 'Bitte eine Zahl zwischen -500 und 500 (nicht 0) eingeben.');
  res.json({ balance: adjustStars(child.id, amount, String(req.body?.note ?? '').trim().slice(0, 80)) });
});

parent.post('/tickets/:id', (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) throw fail(400, 'Unbekannte Entscheidung.');
  res.json(decideTicket(Number(req.params.id), status));
});

parent.put('/settings', (req, res) => {
  const b = req.body ?? {};
  const int = (v, min, max) => {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n) || n < min || n > max) throw fail(400, `Wert muss zwischen ${min} und ${max} liegen.`);
    return n;
  };
  if (b.minutesPerStar != null) setSetting('minutesPerStar', int(b.minutesPerStar, 1, 60));
  if (b.dailyStarLimit != null) setSetting('dailyStarLimit', int(b.dailyStarLimit, 0, 1000));
  if (b.questionsPerSession != null) setSetting('questionsPerSession', int(b.questionsPerSession, 5, 30));
  if (b.ticketMinutes != null) {
    const list = String(b.ticketMinutes).split(',').map((m) => int(m.trim(), 1, 600));
    if (!list.length) throw fail(400, 'Bitte mindestens eine Ticket-Dauer angeben.');
    setSetting('ticketMinutes', [...new Set(list)].sort((a, c) => a - c).join(','));
  }
  res.json(getPublicSettings());
});

parent.put('/pin', (req, res) => {
  const { current, next } = req.body ?? {};
  if (!verifyPin(String(current ?? ''), getSetting('pinHash'))) throw fail(400, 'Die aktuelle PIN stimmt nicht.');
  if (!/^\d{4,8}$/.test(String(next ?? ''))) throw fail(400, 'Die neue PIN muss aus 4 bis 8 Ziffern bestehen.');
  setSetting('pinHash', hashPin(String(next)));
  setSetting('pinIsDefault', '0');
  res.json({ ok: true });
});

parent.post('/reload-content', async (req, res) => {
  const issues = await loadContent();
  res.json({ ok: true, problems: issues });
});

app.use('/api/parent', parent);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannte Adresse.' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Da ist auf dem Server etwas schiefgelaufen.' : err.message });
});

app.listen(PORT, () => console.log(`Lernwelt läuft auf http://localhost:${PORT}`));
