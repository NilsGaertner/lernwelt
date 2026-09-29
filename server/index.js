import express from 'express';
import path from 'node:path';
import { db, getSetting, setSetting, getPublicSettings } from './db.js';
import { loadContent, publicSubjects, publicUnit, subjects, itemLabel, CONTENT_DIR } from './content.js';
import { publicBadges } from './badges.js';
import { startSession, answerQuestion, finishSession, reviewCounts } from './session.js';
import {
  balance, earnedOn, streak, unitProgress, earnedBadges, requestTicket, decideTicket, tickets, adjustStars,
  starLimitFor, upcomingDayLimits, activeBoost, startBoost, stopBoost,
} from './rewards.js';
import { localDay, addDays, nowIso, randomId, hashPin, verifyPin } from './util.js';
import {
  streakInfo, xpOf, rankInfo, unlockedTrains, RANKS, dailyPlan, stampDays, stampCount, lineStatus, blitzBests, blitzRecords, blitzTopics,
  lineUnits,
} from './progress.js';

const PORT = Number(process.env.PORT) || 8080;
const problems = await loadContent();
for (const p of problems) console.warn(`[Inhalt] ${p}`);

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.resolve(import.meta.dirname, '..', 'public'), { extensions: ['html'] }));

// Karten und Bilder der Fächer (content/<fach>/media/…)
app.get('/media/:subject/:file', (req, res, next) => {
  const { subject, file } = req.params;
  if (!/^[\w-]+$/.test(subject) || !/^[\w-]+\.(svg|png|jpg|webp)$/.test(file)) return next();
  res.sendFile(path.join(CONTENT_DIR, subject, 'media', file), { maxAge: '1h' }, (err) => err && next());
});

const fail = (status, message) => Object.assign(new Error(message), { status });

function childOr404(id) {
  const child = db.prepare('SELECT id, name, avatar, train, adult FROM children WHERE id = ?').get(Number(id));
  if (!child) throw fail(404, 'Dieses Profil gibt es nicht.');
  return child;
}

// ================================================================ Kinder-Bereich

app.get('/api/meta', (req, res) => {
  res.json({ subjects: publicSubjects(), badges: publicBadges(), settings: getPublicSettings() });
});

app.get('/api/children', (req, res) => {
  res.json(db.prepare('SELECT id, name, avatar, adult FROM children ORDER BY adult, id').all());
});

/** Der gewählte Zug – falls (noch) nicht freigeschaltet, der beste freigeschaltete. */
function trainOf(child, xp) {
  const trains = unlockedTrains(xp);
  return trains.includes(child.train) ? child.train : trains[trains.length - 1];
}

app.get('/api/children/:id/overview', (req, res) => {
  const child = childOr404(req.params.id);
  const xp = xpOf(child.id);
  const settings = getPublicSettings();
  res.json({
    child,
    balance: balance(child.id),
    earnedToday: earnedOn(child.id),
    dailyLimit: starLimitFor(),
    // Nur ein höheres Sonder-Limit wird dem Kind als Geschenk angezeigt (0 = unbegrenzt)
    limitRaised: settings.dailyStarLimit > 0 && (starLimitFor() === 0 || starLimitFor() > settings.dailyStarLimit),
    boost: activeBoost(),
    streak: streak(child.id),
    streakInfo: streakInfo(child.id),
    progress: unitProgress(child.id),
    lines: lineStatus(child.id),
    plan: dailyPlan(child.id),
    blitz: blitzBests(child.id),
    rank: rankInfo(xp),
    ranks: RANKS,
    train: trainOf(child, xp),
    trains: unlockedTrains(xp),
    stampDays: stampDays(child.id),
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
  const { childId, subject, unit, line, topic, mode } = req.body ?? {};
  const child = childOr404(childId);
  const count = getPublicSettings().questionsPerSession;
  res.json(startSession({
    childId: child.id, subjectId: subject, unitId: unit, line, topic,
    mode: ['review', 'exam', 'blitz'].includes(mode) ? mode : 'unit', count,
  }));
});

app.get('/api/children/:id/blitz/:subject/:topic', (req, res) => {
  const child = childOr404(req.params.id);
  const topic = blitzTopics(req.params.subject).find((t) => t.id === req.params.topic);
  if (!topic) throw fail(404, 'Diese Blitzrunde gibt es nicht.');
  res.json({ topic: { id: topic.id, title: topic.title, icon: topic.icon ?? '⚡', subtitle: topic.subtitle ?? '' }, ...blitzRecords(child.id, req.params.subject, topic.id) });
});

app.post('/api/children/:id/train', (req, res) => {
  const child = childOr404(req.params.id);
  const train = String(req.body?.train ?? '');
  if (!unlockedTrains(xpOf(child.id)).includes(train)) throw fail(400, 'Diesen Zug hast du noch nicht freigeschaltet.');
  db.prepare('UPDATE children SET train = ? WHERE id = ?').run(train, child.id);
  res.json({ train });
});

app.post('/api/sessions/:id/answer', (req, res) => {
  res.json(answerQuestion(req.params.id, Number(req.body?.qid), req.body?.answer));
});

app.post('/api/sessions/:id/finish', (req, res) => {
  res.json(finishSession(req.params.id));
});

app.post('/api/children/:id/tickets', (req, res) => {
  const child = childOr404(req.params.id);
  if (child.adult) throw fail(400, 'Erwachsenen-Profile können keine Medienzeit eintauschen.');
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
  const children = db.prepare('SELECT id, name, avatar, adult FROM children ORDER BY adult, id').all().map((c) => {
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
      rank: rankInfo(xpOf(c.id)),
      planDone: dailyPlan(c.id).done,
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
  res.json({
    children, pending, settings: getPublicSettings(), pinIsDefault: getSetting('pinIsDefault') === '1',
    today, todayLimit: starLimitFor(today), dayLimits: upcomingDayLimits(), boost: activeBoost(),
    recent: logEntries({ limit: 8 }).entries,
    subjects: publicSubjects().map(({ id, name, icon, lines, units }) => ({
      id, name, icon, lines: lines.map(({ id, name }) => ({ id, name })), units: units.map(({ id, title, line }) => ({ id, title, line })),
    })),
  });
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

  const weak = db
    .prepare(
      `SELECT * FROM item_stats WHERE child_id = ? AND wrong > 0 AND box < 3
       ORDER BY (wrong - correct * 0.5) DESC, box ASC LIMIT 20`
    )
    .all(child.id)
    .map((r) => ({ label: itemLabel(r.item_key), unit: unitTitle(r.subject, r.unit_id), correct: r.correct, wrong: r.wrong, box: r.box }));
  const mastered = db.prepare('SELECT COUNT(*) AS n FROM item_stats WHERE child_id = ? AND box >= 3').get(child.id).n;
  const seen = db.prepare('SELECT COUNT(*) AS n FROM item_stats WHERE child_id = ?').get(child.id).n;

  const sessions = logEntries({ childId: child.id, limit: 15 }).entries;
  const ledger = db.prepare('SELECT * FROM star_ledger WHERE child_id = ? ORDER BY id DESC LIMIT 40').all(child.id);

  res.json({
    child,
    balance: balance(child.id),
    streak: streak(child.id),
    rank: rankInfo(xpOf(child.id)),
    stamps: stampCount(child.id),
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
  const adult = req.body?.adult ? 1 : 0;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO children (name, avatar, adult, created_at) VALUES (?, ?, ?, ?)')
    .run(name, avatar, adult, nowIso());
  res.json({ id: Number(lastInsertRowid), name, avatar, adult });
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
  if (b.minutesPerStar != null) {
    const n = Math.round(Number(String(b.minutesPerStar).replace(',', '.')) * 2) / 2;
    if (!Number.isFinite(n) || n < 0.5 || n > 60) throw fail(400, 'Minuten pro Stern: bitte einen Wert zwischen 0,5 und 60 eingeben.');
    setSetting('minutesPerStar', n);
  }
  if (b.dailyStarLimit != null) setSetting('dailyStarLimit', int(b.dailyStarLimit, 0, 2000));
  if (b.questionsPerSession != null) setSetting('questionsPerSession', int(b.questionsPerSession, 5, 30));
  if (b.ticketMinutes != null) {
    const list = String(b.ticketMinutes).split(',').map((m) => int(m.trim(), 1, 600));
    if (!list.length) throw fail(400, 'Bitte mindestens eine Ticket-Dauer angeben.');
    setSetting('ticketMinutes', [...new Set(list)].sort((a, c) => a - c).join(','));
  }
  res.json(getPublicSettings());
});

// Sonder-Limit für einen Tag, z. B. am Wochenende mehr Sterne erlauben
parent.put('/day-limits/:day', (req, res) => {
  const { day } = req.params;
  if (!/^d{4}-d{2}-d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw fail(400, 'Bitte ein gültiges Datum wählen.');
  if (day < localDay()) throw fail(400, 'Für vergangene Tage lässt sich kein Limit mehr festlegen.');
  const limit = Math.trunc(Number(req.body?.limit));
  if (!Number.isFinite(limit) || limit < 0 || limit > 2000) throw fail(400, 'Das Limit muss zwischen 0 und 2000 liegen.');
  db.prepare('INSERT OR REPLACE INTO day_limits (day, star_limit) VALUES (?, ?)').run(day, limit);
  res.json({ dayLimits: upcomingDayLimits() });
});

parent.delete('/day-limits/:day', (req, res) => {
  db.prepare('DELETE FROM day_limits WHERE day = ?').run(req.params.day);
  res.json({ dayLimits: upcomingDayLimits() });
});

// „Doppelte Sterne“-Event: gilt für alle Fahrten, die in den nächsten Minuten gestartet werden (oder nur die nächste),
// wahlweise nur für ein Fach, eine Linie oder eine Station
parent.post('/boost', (req, res) => {
  const b = req.body ?? {};
  const once = !!b.once;
  const minutes = Math.trunc(Number(b.minutes));
  if (!once && (!minutes || minutes < 5 || minutes > 720)) throw fail(400, 'Die Dauer muss zwischen 5 und 720 Minuten liegen.');
  const scope = {};
  if (b.subject) {
    const subject = subjects.get(String(b.subject));
    if (!subject) throw fail(400, 'Dieses Fach gibt es nicht.');
    scope.subject = subject.meta.id;
    if (b.unit) {
      if (!subject.units.has(String(b.unit))) throw fail(400, 'Diese Station gibt es nicht.');
      scope.unit = String(b.unit);
    } else if (b.line) {
      if (!lineUnits(scope.subject, String(b.line)).length) throw fail(400, 'Diese Linie gibt es nicht.');
      scope.line = String(b.line);
    }
  }
  res.json({ boost: startBoost({ minutes, once, scope }) });
});

parent.delete('/boost', (req, res) => {
  stopBoost();
  res.json({ boost: null });
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

// ---------------------------------------------------------------- Fahrtenbuch

const unitTitle = (sid, uid) => subjects.get(sid)?.units.get(uid)?.title ?? uid ?? 'Fehler-Training';

function sessionTitle(s) {
  if (s.mode === 'review') return '🔧 Fehler-Training';
  if (s.mode === 'blitz') return `⚡ ${blitzTopics(s.subject).find((t) => t.id === s.unit_id)?.title ?? 'Blitzrunde'}`;
  if (s.mode === 'exam') {
    const line = subjects.get(s.subject)?.meta.lines?.find((l) => l.id === s.unit_id);
    return `🏁 Endbahnhof ${line?.name ?? s.unit_id}`;
  }
  return unitTitle(s.subject, s.unit_id);
}

function logEntry(s) {
  const subject = subjects.get(s.subject);
  const unit = s.mode === 'unit' ? subject?.units.get(s.unit_id) : null;
  const line = unit ? subject.meta.lines?.find((l) => l.id === (unit.line ?? 'main')) : null;
  return {
    id: s.id,
    childId: s.child_id,
    childName: s.child_name,
    avatar: s.avatar,
    day: s.day,
    finishedAt: s.finished_at,
    mode: s.mode,
    title: sessionTitle(s),
    subject: subject ? `${subject.meta.icon ?? ''} ${subject.meta.name}`.trim() : s.subject,
    line: line?.name ?? null,
    correct: s.correct,
    total: s.total,
    percent: s.total ? Math.round((s.correct * 100) / s.total) : 0,
    rating: s.rating,
    stars: s.stars,
    minutes: Math.max(1, Math.round(s.duration_sec / 60)),
    runToday: s.run_today,
    boosted: !!s.boosted,
  };
}

/** Abgeschlossene Fahrten, neueste zuerst. before: finished_at der letzten geladenen Fahrt (zum Nachladen). */
function logEntries({ childId, days, before, limit = 50 }) {
  const where = [];
  const args = [];
  if (childId) { where.push('s.child_id = ?'); args.push(childId); }
  if (days > 0) { where.push('s.day >= ?'); args.push(addDays(localDay(), -(days - 1))); }
  if (before) { where.push('s.finished_at < ?'); args.push(before); }
  const rows = db
    .prepare(
      `SELECT s.*, c.name AS child_name, c.avatar FROM sessions s JOIN children c ON c.id = s.child_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.finished_at DESC LIMIT ?`
    )
    .all(...args, limit + 1);
  return { entries: rows.slice(0, limit).map(logEntry), more: rows.length > limit };
}

parent.get('/log', (req, res) => {
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(req.query.limit)) || 50));
  res.json({
    ...logEntries({ childId: Number(req.query.child) || null, days: Number(req.query.days) || 0, before: req.query.before ? String(req.query.before) : null, limit }),
    children: db.prepare('SELECT id, name, avatar FROM children ORDER BY adult, id').all(),
  });
});

app.use('/api/parent', parent);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannte Adresse.' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Da ist auf dem Server etwas schiefgelaufen.' : err.message });
});

app.listen(PORT, () => console.log(`Lernwelt läuft auf http://localhost:${PORT}`));
