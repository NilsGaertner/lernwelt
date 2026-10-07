import { db, EARN_KINDS, getPublicSettings, getSetting, setSetting, transaction } from './db.js';
import { BADGES, BADGE_BONUS } from './badges.js';
import { subjects } from './content.js';
import { localDay, nowIso, fmtScore } from './util.js';
import {
  streak, dailyPlan, stampCount, examsPassed, xpOf, rankInfo, PASSED_SQL, stationState, useExtraRide, nextStation,
} from './progress.js';
import { grantLootbox } from './lootbox.js';
import { grantRandomSkin } from './avatars.js';

export { streak, unitProgress } from './progress.js';

const earnList = EARN_KINDS.map((k) => `'${k}'`).join(',');

export function balance(childId) {
  return db.prepare('SELECT COALESCE(SUM(amount), 0) AS b FROM star_ledger WHERE child_id = ?').get(childId).b;
}

export function earnedOn(childId, day = localDay()) {
  return db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM star_ledger WHERE child_id = ? AND day = ? AND kind IN (${earnList})`)
    .get(childId, day).s;
}

export function earnedBadges(childId) {
  return db.prepare('SELECT badge_id AS id, earned_at FROM badges WHERE child_id = ? ORDER BY earned_at').all(childId);
}

function badgeStats(childId) {
  const s = db
    .prepare(
      `SELECT COALESCE(SUM(mode != 'blitz'), 0) AS sessions,
              COALESCE(SUM(correct = total AND mode != 'blitz'), 0) AS perfect,
              COALESCE(SUM(mode = 'review'), 0) AS reviews,
              COALESCE(MAX(best_combo), 0) AS bestCombo,
              COALESCE(SUM(mode = 'blitz'), 0) AS blitzRuns,
              COALESCE(MAX(CASE WHEN mode = 'blitz' THEN correct END), 0) AS blitzBest
       FROM sessions WHERE child_id = ?`
    )
    .get(childId);
  return {
    ...s,
    streak: streak(childId),
    mastered: db.prepare('SELECT COUNT(*) AS n FROM item_stats WHERE child_id = ? AND box >= 3').get(childId).n,
    unitsMastered: db
      .prepare("SELECT COUNT(DISTINCT subject || '/' || unit_id) AS n FROM sessions WHERE child_id = ? AND mode = 'unit' AND rating = 3")
      .get(childId).n,
    listen: db
      .prepare("SELECT COUNT(*) AS n FROM answers WHERE child_id = ? AND qtype = 'listen' AND correct = 1 AND first_try = 1")
      .get(childId).n,
    starsEarned: db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM star_ledger WHERE child_id = ? AND kind IN (${earnList})`)
      .get(childId).n,
    stamps: stampCount(childId),
    exams: examsPassed(childId),
    level: rankInfo(xpOf(childId)).level,
  };
}

/** Sterne-Limit für einen Tag: ein Sonder-Limit aus dem Elternbereich, sonst die normale Einstellung (0 = unbegrenzt). */
export function starLimitFor(day = localDay()) {
  const special = db.prepare('SELECT star_limit FROM day_limits WHERE day = ?').get(day);
  return special ? special.star_limit : getPublicSettings().dailyStarLimit;
}

/** Sonder-Limits ab heute. */
export function upcomingDayLimits() {
  return db.prepare('SELECT day, star_limit AS "limit" FROM day_limits WHERE day >= ? ORDER BY day').all(localDay());
}

// ---------------------------------------------------------------- „Doppelte Sterne“-Event

/**
 * Das laufende Event, falls es eins gibt. Es gilt für alle Fahrten, die bis `until` gestartet werden –
 * wahlweise nur in einem Fach, auf einer Linie oder einer Station (scope). Bei `once` endet es nach der ersten Fahrt.
 */
export function activeBoost() {
  const until = getSetting('boostUntil');
  if (!until || until <= nowIso()) return null;
  const scope = JSON.parse(getSetting('boostScope') ?? '{}');
  return { until, once: getSetting('boostOnce') === '1', ...scope, label: boostLabel(scope) };
}

function boostLabel({ subject, line, unit }) {
  const s = subjects.get(subject);
  if (!s) return null;
  if (unit) return `Station „${s.units.get(unit)?.title ?? unit}“ (${s.meta.name})`;
  if (line) return `Linie „${s.meta.lines?.find((l) => l.id === line)?.name ?? line}“ (${s.meta.name})`;
  return s.meta.name;
}

/** minutes: Dauer; once: nur die nächste passende Fahrt (bis Tagesende). scope: { subject?, line?, unit? } */
export function startBoost({ minutes, once = false, scope = {} }) {
  const end = new Date();
  if (once) end.setHours(23, 59, 59, 0);
  else end.setTime(end.getTime() + minutes * 60_000);
  setSetting('boostUntil', end.toISOString());
  setSetting('boostScope', JSON.stringify(scope));
  setSetting('boostOnce', once ? '1' : '0');
  return activeBoost();
}

export function stopBoost() {
  db.prepare("DELETE FROM settings WHERE key IN ('boostUntil', 'boostScope', 'boostOnce')").run();
}

/** Gehört eine Fahrt zum Event? Blitzrunden nie; das Fehler-Training nur, wenn das Event ein ganzes Fach (oder alles) umfasst. */
export function boostApplies(boost, { subject, mode, line, unit }) {
  if (!boost || mode === 'blitz') return false;
  if (!boost.subject) return true;
  if (boost.subject !== subject) return false;
  if (boost.unit) return mode === 'unit' && unit === boost.unit;
  if (boost.line) return (mode === 'unit' || mode === 'exam') && line === boost.line;
  return true;
}

/** Einmalige Boni in Sternen. */
export const BONUS = { mastered: 4, exam: 6, firstToday: 2 };

/**
 * Sterne für eine Fahrt. Wer dieselbe Station (bzw. denselben Endbahnhof) am selben Tag wiederholt,
 * bekommt weniger: 1. Fahrt Bewertung × 2, 2. Fahrt Bewertung × 1, danach 1 Stern.
 * Das Fehler-Training zählt immer als erste Fahrt – es begrenzt sich selbst, weil es nur Fehler übt.
 */
export function sessionStars(rating, runToday) {
  if (runToday <= 1) return rating * 2;
  if (runToday === 2) return rating;
  return 1;
}

/**
 * Schließt eine Übung ab: speichert sie, vergibt Sterne (mit Tageslimit), Abzeichen, Fahrplan-Stempel, XP und Lootboxen.
 * mode: 'unit' | 'review' | 'due' | 'exam' (unitId = Linie) | 'blitz' (unitId = Blitz-Thema, keine Sterne für die Runde selbst)
 * boosted: die Fahrt wurde während eines „Doppelte Sterne“-Events gestartet
 * Eine Station auf dem Abstellgleis bringt keine Sterne; die Fahrt, die sie dorthin bringt, gibt eine Lootbox.
 */
export function completeSession({ sessionId, childId, subject, unitId, unitTitle, mode, startedAt, total, correct, bestCombo = 0, boosted = false }) {
  return transaction(() => {
    const day = localDay();
    const now = nowIso();
    const adult = !!db.prepare('SELECT adult FROM children WHERE id = ?').get(childId)?.adult;
    const xpBefore = xpOf(childId);
    const ratio = total ? correct / total : 0;
    const rating = mode === 'blitz' ? 0 : ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;

    const prevBest =
      mode === 'unit'
        ? db
            .prepare("SELECT COALESCE(MAX(rating), 0) AS b FROM sessions WHERE child_id = ? AND subject = ? AND unit_id = ? AND mode = 'unit'")
            .get(childId, subject, unitId).b
        : 0;
    const prevCombo = db.prepare("SELECT COALESCE(MAX(best_combo), 0) AS b FROM sessions WHERE child_id = ? AND mode != 'blitz'").get(childId).b;
    const prevExamPassed =
      mode === 'exam' &&
      !!db.prepare(`SELECT 1 FROM sessions WHERE child_id = ? AND mode = 'exam' AND subject = ? AND unit_id = ? AND ${PASSED_SQL}`)
        .get(childId, subject, unitId);
    const prevBlitz =
      mode === 'blitz'
        ? db.prepare("SELECT COALESCE(MAX(correct), 0) AS b, COUNT(*) AS n FROM sessions WHERE child_id = ? AND mode = 'blitz' AND subject = ? AND unit_id = ?")
            .get(childId, subject, unitId)
        : null;
    // Abstellgleis: Stand vor dieser Fahrt. Auf einer zurückgeholten Station verbraucht die Fahrt eine Extra-Fahrt.
    const station = mode === 'unit' ? stationState(childId, subject, unitId) : null;
    const parked = !!station?.parked;
    const justRetired = !!station && !station.retired && rating === 3 && station.limit > 0 && station.perfect + 1 >= station.limit;
    if (station?.retired && !parked) useExtraRide(childId, subject, unitId);
    // Der Tagesbonus gehört zur ersten Fahrt, die Sterne bringt.
    const firstToday = !parked && !db.prepare('SELECT 1 FROM sessions WHERE child_id = ? AND day = ? AND parked = 0').get(childId, day);
    const runToday =
      mode === 'unit' || mode === 'exam'
        ? db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE child_id = ? AND day = ? AND mode = ? AND subject = ? AND unit_id = ?')
            .get(childId, day, mode, subject, unitId).n + 1
        : 1;

    const duration = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    db.prepare(
      `INSERT INTO sessions (id, child_id, subject, unit_id, mode, day, started_at, finished_at, total, correct, rating, stars, duration_sec, best_combo, run_today, boosted, parked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, childId, subject, unitId ?? null, mode, day, startedAt, now, total, correct, rating, duration, bestCombo, runToday,
      boosted && mode !== 'blitz' && !parked ? 1 : 0, parked ? 1 : 0
    );

    const rewards = [];
    if (mode !== 'blitz' && !parked) {
      const repeat = runToday > 1 ? ` (${runToday}. Fahrt heute)` : '';
      const stars = sessionStars(rating, runToday);
      rewards.push({ kind: 'session', amount: stars, note: `${unitTitle}: ${fmtScore(correct)} von ${total} richtig${repeat}` });
      if (boosted) {
        rewards.push({ kind: 'bonus', amount: stars, note: '🎉 Doppelte Sterne' });
        if (activeBoost()?.once) stopBoost();
      }
    }
    if (mode === 'unit' && rating === 3 && prevBest < 3) rewards.push({ kind: 'bonus', amount: BONUS.mastered, note: 'Station gemeistert' });
    const examPassed = mode === 'exam' && correct * 5 >= total * 4;
    if (examPassed && !prevExamPassed) rewards.push({ kind: 'bonus', amount: BONUS.exam, note: `${unitTitle} geschafft` });
    if (firstToday) rewards.push({ kind: 'bonus', amount: BONUS.firstToday, note: 'Erste Übung heute' });

    // Lootboxen (nicht für Erwachsenen-Profile): Station aufs Abstellgleis gebracht, Linie geschafft
    const newBoxes = [];
    const newSkins = [];
    if (!adult && justRetired) {
      newBoxes.push(grantLootbox(childId, { source: 'station', subject, ref: unitId, note: `${unitTitle} aufs Abstellgleis gebracht` }));
    }
    if (!adult && examPassed && !prevExamPassed) {
      const line = subjects.get(subject)?.meta.lines?.find((l) => l.id === unitId);
      const box = grantLootbox(childId, { source: 'line', subject, ref: unitId, note: `${line?.name ?? unitTitle} geschafft` });
      newBoxes.push(box);
      // Zum ersten Bestehen einer Linie gehört auch ein neuer Avatar-Skin (falls noch einer fehlt)
      if (box) newSkins.push(grantRandomSkin(childId, 'line', 'line'));
    }

    const plan = dailyPlan(childId);

    const have = new Set(earnedBadges(childId).map((b) => b.id));
    const stats = badgeStats(childId);
    const newBadges = BADGES.filter((b) => !have.has(b.id) && b.test(stats));
    for (const b of newBadges) {
      db.prepare('INSERT INTO badges (child_id, badge_id, earned_at) VALUES (?, ?, ?)').run(childId, b.id, now);
      rewards.push({ kind: 'badge', amount: BADGE_BONUS, note: `Abzeichen: ${b.name}` });
    }

    // Erwachsenen-Profile (z. B. für die Blitz-Herausforderung) sammeln keine Sterne.
    const dailyStarLimit = starLimitFor(day);
    let room = adult ? 0 : dailyStarLimit > 0 ? Math.max(0, dailyStarLimit - earnedOn(childId, day)) : Infinity;
    let awarded = 0;
    let capped = 0;
    const insert = db.prepare('INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of rewards) {
      const give = Math.min(r.amount, room);
      r.given = give;
      capped += r.amount - give;
      if (give > 0) {
        insert.run(childId, give, r.kind, r.note, day, now);
        room -= give;
        awarded += give;
      }
    }
    db.prepare('UPDATE sessions SET stars = ? WHERE id = ?').run(awarded, sessionId);

    const xpAfter = xpOf(childId);
    const rankBefore = rankInfo(xpBefore);
    const rank = rankInfo(xpAfter);

    return {
      mode,
      total,
      correct,
      rating,
      awarded,
      capped,
      adult,
      rewards: rewards.map(({ note, amount, given, kind }) => ({ note, amount, given, kind })),
      newBadges: newBadges.map(({ test, ...b }) => b),
      balance: balance(childId),
      earnedToday: earnedOn(childId, day),
      dailyLimit: dailyStarLimit,
      streak: stats.streak,
      bestCombo,
      comboRecord: mode !== 'blitz' && bestCombo >= 3 && bestCombo > prevCombo,
      newCard: mode === 'unit' && rating === 3 && prevBest < 3,
      runToday,
      boosted: boosted && mode !== 'blitz' && !parked,
      station: station
        ? {
            parked,
            justRetired,
            perfect: station.perfect + (rating === 3 ? 1 : 0),
            limit: station.limit,
            extraRidesLeft: station.retired && !parked ? station.extraRides - 1 : null,
          }
        : null,
      lootboxes: newBoxes.filter(Boolean),
      skins: newSkins.filter(Boolean),
      next: mode === 'unit' || mode === 'exam' ? nextStation(childId, subject, mode === 'unit' ? unitId : null) : null,
      exam: mode === 'exam' ? { passed: examPassed, first: examPassed && !prevExamPassed, percent: Math.round(ratio * 100) } : null,
      blitz: prevBlitz ? { score: correct, answered: total, prevBest: prevBlitz.b, newRecord: prevBlitz.n > 0 && correct > prevBlitz.b } : null,
      plan,
      xp: { gained: xpAfter - xpBefore, total: xpAfter, rank, rankUp: rank.level > rankBefore.level ? rank : null },
    };
  });
}

export function requestTicket(childId, minutes) {
  const { minutesPerStar, ticketMinutes } = getPublicSettings();
  if (!ticketMinutes.includes(minutes)) throw Object.assign(new Error('Dieses Ticket gibt es nicht.'), { status: 400 });
  const stars = Math.ceil(minutes / minutesPerStar);
  return transaction(() => {
    if (balance(childId) < stars) throw Object.assign(new Error('Dafür reichen deine Sterne noch nicht.'), { status: 400 });
    const now = nowIso();
    db.prepare('INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      childId, -stars, 'ticket', `Ticket: ${minutes} Minuten`, localDay(), now
    );
    const { lastInsertRowid } = db
      .prepare('INSERT INTO redemptions (child_id, stars, minutes, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(childId, stars, minutes, 'pending', now);
    return { id: Number(lastInsertRowid), stars, minutes };
  });
}

/** status: 'approved' | 'rejected' | 'cancelled' — bei rejected/cancelled gibt es die Sterne zurück. */
export function decideTicket(id, status, { childId } = {}) {
  return transaction(() => {
    const r = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(id);
    if (!r || (childId && r.child_id !== childId)) throw Object.assign(new Error('Ticket nicht gefunden.'), { status: 404 });
    if (r.status !== 'pending') throw Object.assign(new Error('Über dieses Ticket wurde schon entschieden.'), { status: 409 });
    const now = nowIso();
    db.prepare('UPDATE redemptions SET status = ?, decided_at = ? WHERE id = ?').run(status, now, id);
    if (status !== 'approved') {
      const note = status === 'cancelled' ? 'Ticket zurückgegeben' : 'Ticket abgelehnt – Sterne zurück';
      db.prepare('INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        r.child_id, r.stars, 'refund', note, localDay(), now
      );
    }
    return { ...r, status };
  });
}

export function tickets(childId, limit = 20) {
  return db.prepare('SELECT * FROM redemptions WHERE child_id = ? ORDER BY id DESC LIMIT ?').all(childId, limit);
}

export function adjustStars(childId, amount, note) {
  db.prepare('INSERT INTO star_ledger (child_id, amount, kind, note, day, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    childId, amount, 'manual', note || (amount > 0 ? 'Extra-Sterne von den Eltern' : 'Sterne abgezogen'), localDay(), nowIso()
  );
  return balance(childId);
}
