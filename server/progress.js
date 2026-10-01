// Spiel-Fortschritt: Ränge (XP), Tage-Serie mit Serienschutz, Tagesfahrplan, Endbahnhöfe, Blitz-Rekorde,
// Abstellgleis und Archiv. Alles wird aus den gespeicherten Übungen berechnet – nur der Tagesfahrplan
// und die Eltern-Einstellungen pro Station (unit_state) haben eigene Tabellen.
import { db, getPublicSettings } from './db.js';
import { subjects } from './content.js';
import { localDay, addDays, nowIso } from './util.js';

// ---------------------------------------------------------------- Ränge

/** Jeder Rang schaltet einen Zug frei, mit dem das Kind durch die Übungen fährt. */
export const RANKS = [
  { min: 0, name: 'Fahrgast', train: '🚆' },
  { min: 300, name: 'Schaffner-Azubi', train: '🚋' },
  { min: 1000, name: 'Schaffner', train: '🚃' },
  { min: 2000, name: 'Rangierer', train: '🚂' },
  { min: 3500, name: 'Lokführer-Azubi', train: '🚇' },
  { min: 5500, name: 'Lokführer', train: '🚝' },
  { min: 8000, name: 'Zugchef', train: '🚄' },
  { min: 12000, name: 'ICE-Kapitän', train: '🚅' },
  { min: 17000, name: 'Streckenlegende', train: '🚀' },
];
export const XP = { answer: 10, stamp: 50, exam: 100 };

export function xpOf(childId) {
  const answers = db.prepare('SELECT COALESCE(SUM(correct), 0) AS n FROM sessions WHERE child_id = ?').get(childId).n;
  const stamps = db.prepare('SELECT COUNT(*) AS n FROM daily_plans WHERE child_id = ? AND completed_at IS NOT NULL').get(childId).n;
  return answers * XP.answer + stamps * XP.stamp + examsPassed(childId) * XP.exam;
}

export function rankInfo(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  return { level: i + 1, ...RANKS[i], xp, next: next ? { name: next.name, min: next.min, train: next.train } : null };
}

export const unlockedTrains = (xp) => RANKS.filter((r) => xp >= r.min).map((r) => r.train);

// ---------------------------------------------------------------- Tage-Serie mit Serienschutz

const dayGap = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);

/**
 * Tage am Stück geübt. Einmal pro Woche darf ein einzelner Tag fehlen, ohne dass die Serie reißt
 * (der Tag zählt dann nicht mit, rettet aber die Serie).
 */
export function streakInfo(childId) {
  const days = new Set(
    db.prepare('SELECT DISTINCT day FROM sessions WHERE child_id = ? ORDER BY day DESC LIMIT 400').all(childId).map((r) => r.day)
  );
  const today = localDay();
  let expected = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  const shields = [];
  for (;;) {
    if (days.has(expected)) {
      n++;
      expected = addDays(expected, -1);
      continue;
    }
    const prev = addDays(expected, -1);
    const last = shields[shields.length - 1];
    if (days.has(prev) && (!last || dayGap(last, expected) >= 7)) {
      shields.push(expected);
      expected = prev;
      continue;
    }
    break;
  }
  const lastShield = n > 0 ? shields[0] ?? null : null;
  return {
    days: n,
    shieldUsedOn: lastShield,
    shieldReady: !lastShield || dayGap(today, lastShield) >= 7,
    practicedToday: days.has(today),
  };
}

export const streak = (childId) => streakInfo(childId).days;

// ---------------------------------------------------------------- Abstellgleis und Archiv

/**
 * Eine Station, die so oft mit 3 Sternen geschafft wurde, kommt aufs Abstellgleis und bringt keine Sterne mehr
 * (0 = nie). Die Eltern können sie für ein paar Fahrten zurückholen (unit_state.extra_rides).
 */
export const retireAfter = () => getPublicSettings().retireAfter;

/** SQL-Bedingung: die Station der Zeile (subject, unit_id) ist für das Kind nicht archiviert. */
export const notArchivedSql = (t) =>
  `NOT EXISTS (SELECT 1 FROM unit_state us WHERE us.child_id = ${t}.child_id AND us.subject = ${t}.subject AND us.unit_id = ${t}.unit_id AND us.archived = 1)`;

export function archivedUnits(childId) {
  return new Set(
    db.prepare("SELECT subject || '/' || unit_id AS k FROM unit_state WHERE child_id = ? AND archived = 1").all(childId).map((r) => r.k)
  );
}

/** Stand einer Station vor der nächsten Fahrt: Fahrten mit 3 Sternen, Abstellgleis, Extra-Fahrten, archiviert. */
export function stationState(childId, subjectId, unitId) {
  const perfect = db
    .prepare("SELECT COALESCE(SUM(rating = 3), 0) AS n FROM sessions WHERE child_id = ? AND subject = ? AND unit_id = ? AND mode = 'unit'")
    .get(childId, subjectId, unitId).n;
  const s = db.prepare('SELECT archived, extra_rides FROM unit_state WHERE child_id = ? AND subject = ? AND unit_id = ?').get(childId, subjectId, unitId);
  const limit = retireAfter();
  const retired = limit > 0 && perfect >= limit;
  const extraRides = s?.extra_rides ?? 0;
  return { perfect, limit, retired, extraRides, parked: retired && extraRides === 0, archived: !!s?.archived };
}

/** Eltern: Station archivieren bzw. zurückholen, oder vom Abstellgleis für `extraRides` Fahrten zurückholen. */
export function setStationState(childId, subjectId, unitId, { archived, extraRides }) {
  db.prepare('INSERT OR IGNORE INTO unit_state (child_id, subject, unit_id) VALUES (?, ?, ?)').run(childId, subjectId, unitId);
  if (archived != null) db.prepare('UPDATE unit_state SET archived = ? WHERE child_id = ? AND subject = ? AND unit_id = ?').run(archived ? 1 : 0, childId, subjectId, unitId);
  if (extraRides != null) db.prepare('UPDATE unit_state SET extra_rides = ? WHERE child_id = ? AND subject = ? AND unit_id = ?').run(extraRides, childId, subjectId, unitId);
}

/** Eine Extra-Fahrt auf einer zurückgeholten Station ist verbraucht. */
export function useExtraRide(childId, subjectId, unitId) {
  db.prepare('UPDATE unit_state SET extra_rides = extra_rides - 1 WHERE child_id = ? AND subject = ? AND unit_id = ? AND extra_rides > 0')
    .run(childId, subjectId, unitId);
}

// ---------------------------------------------------------------- Stationen und Linien

/**
 * Pro Einheit: beste Bewertung (1–3), Durchgänge (insgesamt, heute, mit 3 Sternen) und der Stand
 * von Abstellgleis und Archiv. Einheiten ohne Fahrten und ohne Eltern-Einstellung fehlen.
 */
export function unitProgress(childId) {
  const rows = db
    .prepare(
      `SELECT subject, unit_id, MAX(rating) AS best, COUNT(*) AS runs, SUM(rating = 3) AS perfect, SUM(day = ?) AS today,
              ROUND(AVG(correct * 100.0 / total)) AS avg, MAX(finished_at) AS last
       FROM sessions WHERE child_id = ? AND mode = 'unit' GROUP BY subject, unit_id`
    )
    .all(localDay(), childId);
  const states = db.prepare('SELECT subject, unit_id, archived, extra_rides FROM unit_state WHERE child_id = ?').all(childId);
  const out = {};
  const entry = (sid, uid) => ((out[sid] ??= {})[uid] ??= { best: 0, runs: 0, perfect: 0, today: 0, avg: null, last: null });
  for (const r of rows) {
    Object.assign(entry(r.subject, r.unit_id), { best: r.best, runs: r.runs, perfect: r.perfect, today: r.today, avg: r.avg, last: r.last });
  }
  const stateOf = new Map(states.map((s) => [`${s.subject}/${s.unit_id}`, s]));
  for (const s of states) entry(s.subject, s.unit_id);
  const limit = retireAfter();
  for (const [sid, units] of Object.entries(out)) {
    for (const [uid, p] of Object.entries(units)) {
      const s = stateOf.get(`${sid}/${uid}`);
      p.archived = !!s?.archived;
      p.extraRides = s?.extra_rides ?? 0;
      p.retired = limit > 0 && p.perfect >= limit;
      p.parked = p.retired && p.extraRides === 0;
    }
  }
  return out;
}

/**
 * Wohin als Nächstes? Eine Station, die heute noch nicht gefahren wurde – am liebsten eine ohne 3 Sterne.
 * Gesucht wird erst weiter hinten auf derselben Linie, dann ab deren Anfang, dann auf den anderen Linien des Fachs
 * und zuletzt in den anderen Fächern. Archivierte Stationen und das Abstellgleis zählen nicht.
 */
export function nextStation(childId, subjectId, fromUnitId = null) {
  const subject = subjects.get(subjectId);
  if (!subject) return null;
  const progress = unitProgress(childId);
  const usable = (sid, units) =>
    units.filter((u) => u.id !== fromUnitId || sid !== subjectId).filter((u) => {
      const p = progress[sid]?.[u.id];
      return !p?.archived && !p?.parked && !p?.today;
    });
  const pick = (sid, units) => {
    const open = usable(sid, units);
    const u = open.find((x) => (progress[sid]?.[x.id]?.best ?? 0) < 3) ?? open[0];
    return u ? { subject: sid, subjectName: subjects.get(sid).meta.name, unit: u.id, title: u.title, icon: u.icon ?? '•' } : null;
  };

  const all = [...subject.units.values()];
  const from = subject.units.get(fromUnitId);
  const fromLine = from ? from.line ?? 'main' : null;
  const sameLine = all.filter((u) => (u.line ?? 'main') === fromLine);
  const i = sameLine.indexOf(from);
  const order = [...sameLine.slice(i + 1), ...sameLine.slice(0, Math.max(i, 0)), ...all.filter((u) => (u.line ?? 'main') !== fromLine)];
  const hit = pick(subjectId, order);
  if (hit) return hit;
  for (const meta of orderedSubjects()) {
    const other = meta.id !== subjectId && pick(meta.id, [...subjects.get(meta.id).units.values()]);
    if (other) return other;
  }
  return null;
}

/** Eine Endbahnhof-Prüfung gilt ab 80 % als bestanden. */
export const PASSED_SQL = 'correct * 5 >= total * 4';

export function examsPassed(childId) {
  return db
    .prepare(`SELECT COUNT(DISTINCT subject || '/' || unit_id) AS n FROM sessions WHERE child_id = ? AND mode = 'exam' AND ${PASSED_SQL}`)
    .get(childId).n;
}

export function lineUnits(subjectId, lineId) {
  return [...(subjects.get(subjectId)?.units.values() ?? [])].filter((u) => (u.line ?? 'main') === lineId);
}

/** Pro Fach und Linie: ist der Endbahnhof freigeschaltet (alle Stationen mind. 2 Sterne), bestanden, Bestwert? */
export function lineStatus(childId) {
  const progress = unitProgress(childId);
  const exams = db
    .prepare(
      `SELECT subject, unit_id AS line, MAX(ROUND(correct * 100.0 / total)) AS best, MAX(${PASSED_SQL}) AS passed
       FROM sessions WHERE child_id = ? AND mode = 'exam' GROUP BY subject, unit_id`
    )
    .all(childId);
  const out = {};
  for (const [sid, { meta }] of subjects) {
    out[sid] = {};
    for (const line of meta.lines ?? [{ id: 'main' }]) {
      const units = lineUnits(sid, line.id).filter((u) => !progress[sid]?.[u.id]?.archived);
      if (!units.length) continue;
      const e = exams.find((x) => x.subject === sid && x.line === line.id);
      out[sid][line.id] = {
        unlocked: units.every((u) => (progress[sid]?.[u.id]?.best ?? 0) >= 2),
        passed: !!e?.passed,
        best: e?.best ?? null,
      };
    }
    // Frühere Linien (nach einer Neuaufteilung): nur, wenn der Endbahnhof dort schon bestanden war
    for (const line of meta.formerLines ?? []) {
      const e = exams.find((x) => x.subject === sid && x.line === line.id);
      if (e?.passed) out[sid][line.id] = { unlocked: false, passed: true, best: e.best, former: true };
    }
  }
  return out;
}

// ---------------------------------------------------------------- Blitzrunde

export function blitzTopics(subjectId) {
  return subjects.get(subjectId)?.meta.blitz ?? [];
}

export function blitzRecords(childId, subjectId, topicId) {
  const q = `SELECT correct AS score, total, day FROM sessions WHERE child_id = ? AND mode = 'blitz' AND subject = ? AND unit_id = ?`;
  const runs = db.prepare(`${q} ORDER BY finished_at DESC LIMIT 12`).all(childId, subjectId, topicId).reverse();
  const best = db.prepare(`SELECT COALESCE(MAX(correct), 0) AS b FROM sessions WHERE child_id = ? AND mode = 'blitz' AND subject = ? AND unit_id = ?`)
    .get(childId, subjectId, topicId).b;
  const family = db
    .prepare(
      `SELECT c.id, c.name, c.avatar, c.adult, MAX(s.correct) AS best
       FROM sessions s JOIN children c ON c.id = s.child_id
       WHERE s.mode = 'blitz' AND s.subject = ? AND s.unit_id = ?
       GROUP BY c.id ORDER BY best DESC`
    )
    .all(subjectId, topicId);
  return { best, runs, family };
}

export function blitzBests(childId) {
  const rows = db
    .prepare("SELECT subject, unit_id, MAX(correct) AS best FROM sessions WHERE child_id = ? AND mode = 'blitz' GROUP BY subject, unit_id")
    .all(childId);
  return Object.fromEntries(rows.map((r) => [`${r.subject}/${r.unit_id}`, r.best]));
}

// ---------------------------------------------------------------- Tagesfahrplan

function seeded(seed) {
  let s = (Math.abs(seed) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const orderedSubjects = () => [...subjects.values()].sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0)).map((s) => s.meta);

function createMissions(childId, day) {
  const archived = archivedUnits(childId);
  const open = (sid) => [...(subjects.get(sid)?.units.keys() ?? [])].filter((uid) => !archived.has(`${sid}/${uid}`));
  // Fächer, in denen alles archiviert ist, kommen im Fahrplan nicht vor.
  const list = orderedSubjects().filter((m) => open(m.id).length);
  if (!list.length) return [];
  const dayNum = Math.round(Date.parse(`${day}T12:00:00Z`) / 86400000);
  const rnd = seeded(dayNum * 31 + childId * 7);
  const first = list[(dayNum + childId) % list.length];
  const second = list[(dayNum + childId + 1) % list.length];

  const played = new Set(
    db.prepare("SELECT DISTINCT subject || '/' || unit_id AS k FROM sessions WHERE child_id = ? AND mode = 'unit'").all(childId).map((r) => r.k)
  );
  const hasNew = list.some((m) => open(m.id).some((uid) => !played.has(`${m.id}/${uid}`)));
  const hasReview = !!db
    .prepare(`SELECT 1 FROM item_stats WHERE child_id = ? AND wrong > 0 AND box < 3 AND ${notArchivedSql('item_stats')} LIMIT 1`)
    .get(childId);
  const hasBlitz = list.some((m) => m.blitz?.length);

  const pool = [{ type: 'perfect' }, { type: 'combo' }];
  if (hasReview) pool.push({ type: 'review' });
  if (hasNew) pool.push({ type: 'new' });
  if (hasBlitz) pool.push({ type: 'blitz' });
  if (second.id !== first.id) pool.push({ type: 'subject', subject: second.id });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [{ type: 'subject', subject: first.id }, ...pool.slice(0, 2)];
}

function describe(m) {
  switch (m.type) {
    case 'subject': {
      const meta = subjects.get(m.subject)?.meta;
      return { icon: meta?.icon ?? '🚉', label: `Fahr eine Station in ${meta?.name ?? m.subject}` };
    }
    case 'review': return { icon: '🔧', label: 'Mach ein Fehler-Training' };
    case 'new': return { icon: '🆕', label: 'Probier eine Station aus, bei der du noch nie warst' };
    case 'perfect': return { icon: '⭐', label: 'Hol 3 Sterne bei einer Fahrt' };
    case 'blitz': return { icon: '⚡', label: 'Mach eine Blitzrunde' };
    case 'combo': return { icon: '🔥', label: 'Schaff 5 richtige Antworten hintereinander' };
    default: return { icon: '🚉', label: m.type };
  }
}

function missionDone(childId, day, m) {
  const has = (where, ...args) => !!db.prepare(`SELECT 1 FROM sessions WHERE child_id = ? AND day = ? AND ${where} LIMIT 1`).get(childId, day, ...args);
  switch (m.type) {
    case 'subject': return has("subject = ? AND mode IN ('unit', 'exam')", m.subject);
    case 'review': return has("mode = 'review'");
    case 'perfect': return has("mode IN ('unit', 'review', 'exam') AND rating = 3");
    case 'blitz': return has("mode = 'blitz'");
    case 'combo': return has('best_combo >= 5');
    case 'new':
      return has(
        `mode = 'unit' AND NOT EXISTS (SELECT 1 FROM sessions p WHERE p.child_id = sessions.child_id AND p.mode = 'unit'
           AND p.subject = sessions.subject AND p.unit_id = sessions.unit_id AND p.day < sessions.day)`
      );
    default: return false;
  }
}

/** Holt (oder erstellt) den heutigen Fahrplan. Sind alle drei Aufgaben erledigt, gibt es einen Stempel. */
export function dailyPlan(childId) {
  const day = localDay();
  let row = db.prepare('SELECT * FROM daily_plans WHERE child_id = ? AND day = ?').get(childId, day);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO daily_plans (child_id, day, missions) VALUES (?, ?, ?)')
      .run(childId, day, JSON.stringify(createMissions(childId, day)));
    row = db.prepare('SELECT * FROM daily_plans WHERE child_id = ? AND day = ?').get(childId, day);
  }
  const missions = JSON.parse(row.missions).map((m) => ({ ...m, ...describe(m), done: missionDone(childId, day, m) }));
  const done = missions.length > 0 && missions.every((m) => m.done);
  let justCompleted = false;
  if (done && !row.completed_at) {
    db.prepare('UPDATE daily_plans SET completed_at = ? WHERE child_id = ? AND day = ?').run(nowIso(), childId, day);
    justCompleted = true;
  }
  return { day, missions, done, justCompleted, stamps: stampCount(childId) };
}

export function stampCount(childId) {
  return db.prepare('SELECT COUNT(*) AS n FROM daily_plans WHERE child_id = ? AND completed_at IS NOT NULL').get(childId).n;
}

/** Stempel der letzten Wochen fürs Stempelheft. */
export function stampDays(childId, limit = 60) {
  return db
    .prepare('SELECT day FROM daily_plans WHERE child_id = ? AND completed_at IS NOT NULL ORDER BY day DESC LIMIT ?')
    .all(childId, limit)
    .map((r) => r.day);
}
