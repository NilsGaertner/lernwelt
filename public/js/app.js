import { h, starRow, toast, prefs, speak, canSpeak, rankMeter, sfx, renderExplain, ask, closeDialogs } from './ui.js';
import { api } from './api.js';
import { runRide, collectCard } from './player.js';
import { runBlitz, runChart, familyBoard } from './blitz.js';
import { parentView } from './parent.js';
import { lootbox, openedBox } from './lootbox.js';
import { faceOf } from './avatar.js';
import { avatarSvg, PERSONAS } from './avatar-data.js';
import { companion } from './companion.js';

const app = document.getElementById('app');
const state = { meta: null };

async function loadMeta(force = false) {
  if (!state.meta || force) state.meta = await api('/meta');
  return state.meta;
}

function render(...nodes) {
  app.replaceChildren(...nodes.filter((n) => n != null && n !== false));
  window.scrollTo(0, 0);
}

function showError(err) {
  render(
    h('.empty',
      h('p', { style: { fontSize: '2.5rem', margin: 0 } }, '🚧'),
      h('h2', 'Hier hakt gerade etwas.'),
      h('p', err.message),
      h('a.btn', { href: '#/' }, 'Zur Startseite')
    )
  );
}

// ================================================================ Router

const routes = [
  [/^$/, profilesView],
  [/^kid\/(\d+)$/, (id) => homeView(id)],
  [/^kid\/(\d+)\/s\/([\w-]+)$/, (id, subject) => homeView(id, subject)],
  [/^kid\/(\d+)\/station\/([\w-]+)\/([\w-]+)$/, stationView],
  [/^kid\/(\d+)\/badges$/, (id) => collectionView(id, 'abzeichen')],
  [/^kid\/(\d+)\/sammlung(?:\/(\w+))?$/, (id, tab) => collectionView(id, tab ?? 'rang')],
  [/^kid\/(\d+)\/blitz\/([\w-]+)\/([\w-]+)$/, blitzView],
  [/^kid\/(\d+)\/tickets$/, ticketsView],
  [/^kid\/(\d+)\/boxen$/, boxesView],
  [/^parent(?:\/(.*))?$/, (rest) => parentView(app, rest ?? '', { reloadMeta: () => loadMeta(true) })],
];

async function route() {
  window.speechSynthesis?.cancel();
  closeDialogs();
  document.querySelectorAll('.sheet, .dock, .card-view').forEach((el) => el.remove());
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try {
      await fn(...m.slice(1));
    } catch (err) {
      showError(err);
    }
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);
route();

// Service Worker: Voraussetzung, damit Chrome die Seite als App installieren kann.
// Klappt nur über HTTPS (oder localhost), sonst still ignorieren.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ================================================================ Bausteine

function soundToggle() {
  const btn = h('button.icon-btn', {
    type: 'button',
    'aria-pressed': String(prefs.sound),
    title: 'Töne an/aus',
    onclick: () => {
      prefs.sound = !prefs.sound;
      btn.textContent = prefs.sound ? '🔔' : '🔕';
      btn.setAttribute('aria-pressed', String(prefs.sound));
    },
  }, prefs.sound ? '🔔' : '🔕');
  return btn;
}

function kidBar(ov) {
  const id = ov.child.id;
  return h('header.topbar',
    h('a.roundel', { href: `#/kid/${id}`, title: 'Zum Netzplan' },
      h('span.ring', { 'aria-hidden': 'true' }, faceOf(ov.child)),
      h('span.bar', ov.child.name)),
    h('.spacer'),
    ov.streak > 0
      ? h('span.streak', {
          title: `${ov.streak} Tage am Stück geübt.${ov.streakInfo.shieldReady ? ' Serienschutz bereit: Einmal pro Woche darf ein Tag ausfallen.' : ' Serienschutz diese Woche schon benutzt.'}`,
        }, '🔥 ', ov.streak, ov.streakInfo.shieldReady ? h('span.shield', { 'aria-label': 'Serienschutz bereit' }, '🛡️') : null)
      : null,
    ov.child.adult
      ? null
      : h('a.fare', { href: `#/kid/${id}/tickets`, title: 'Deine Sterne – hier gegen Medienzeit eintauschen' },
          h('span.star', { 'aria-hidden': 'true' }, '★'), h('span.num', ov.balance), h('span.sr-only', ' Sterne')),
    ov.lootboxes.closed.length
      ? h('a.icon-btn.rank-btn.box-btn', { href: `#/kid/${id}/boxen`, title: 'Deine Lootboxen – antippen zum Öffnen' },
          '🎁', h('span.lvl', ov.lootboxes.closed.length))
      : null,
    h('a.icon-btn.rank-btn', { href: `#/kid/${id}/sammlung`, title: `Deine Sammlung · ${ov.rank.name} (Rang ${ov.rank.level})` },
      ov.train, h('span.lvl', ov.rank.level)),
    soundToggle(),
    h('a.icon-btn', { href: '#/', title: 'Profil wechseln' }, '👥')
  );
}

function lineOf(subject, lineId) {
  return subject.lines.find((l) => l.id === lineId) ?? subject.lines[0];
}

/** backHash: hierhin nach einem Abbruch · mapHash: der Netzplan des Fachs */
async function startRide(opts) {
  const { childId, subject, unit, line, mode = 'unit', lineColor, backHash, mapHash = backHash, train, card } = opts;
  let session;
  try {
    session = await api('/sessions', { method: 'POST', body: { childId, subject, unit, line, mode } });
  } catch (err) {
    toast(err.message);
    return;
  }
  document.querySelectorAll('.dock').forEach((el) => el.remove());
  const go = (hash) => {
    if (location.hash === hash) route();
    else location.hash = hash;
  };
  runRide(app, session, {
    childId,
    subject,
    lineColor,
    train,
    card,
    onExit: () => go(backHash),
    onMap: () => go(mapHash),
    onAgain: () => startRide(opts),
    onNext: (next) => go(`#/kid/${childId}/station/${next.subject}/${next.unit}`),
  });
}

/** Karte einer Station fürs Sammelalbum. */
const unitCard = (subject, u, number) => ({
  icon: u.icon, title: u.title, text: u.card, color: lineOf(subject, u.line).color, number,
});
/** Goldkarte einer ganzen Linie (nach bestandener Endbahnhof-Prüfung). */
const lineCard = (subject, line) => ({
  icon: '🏆', title: line.name, color: line.color,
  text: `Endbahnhof erreicht: Du hast alle Stationen der ${line.name} (${subject.name}) gemeistert!`,
});

function missionHref(id, m, meta) {
  if (m.type === 'subject' || m.type === 'due') return `#/kid/${id}/s/${m.subject}`;
  if (m.type === 'blitz') {
    const s = meta.subjects.find((x) => x.blitz?.length);
    return s ? `#/kid/${id}/blitz/${s.id}/${s.blitz[0].id}` : null;
  }
  return null;
}

function planCard(id, plan, meta) {
  return h('section.plan', { class: plan.done ? 'done' : '' },
    h('.plan-head',
      h('h2', '📋 Tagesfahrplan'),
      h('a.plan-stamps', { href: `#/kid/${id}/sammlung/stempel`, title: 'Zum Stempelheft' }, `🔖 ${plan.stamps} Stempel`)),
    h('ol.missions', plan.missions.map((m) => {
      const href = !m.done && missionHref(id, m, meta);
      const body = [h('span.check', { 'aria-hidden': 'true' }, m.done ? '✔' : ''), h('span.m-icon', { 'aria-hidden': 'true' }, m.icon), h('span.m-label', m.label)];
      return h('li', { class: m.done ? 'done' : '' },
        href ? h('a', { href }, body) : h('span.m-row', body),
        h('span.sr-only', m.done ? ' (erledigt)' : ' (offen)'));
    })),
    plan.done
      ? h('p.plan-msg', 'Alles erledigt – der Stempel für heute ist dir sicher! 🎉')
      : h('p.plan-msg.muted', `Schaffst du alle drei, gibt es einen Stempel und +50 XP.`));
}

// ================================================================ Profilauswahl

async function profilesView() {
  const children = await api('/children');
  render(
    h('section.welcome',
      h('h1', 'Lernwelt'),
      h('p', children.length ? 'Wer fährt heute mit?' : 'Willkommen!')),
    children.length
      ? h('.profiles', children.map((c) =>
          h('a.profile', { href: `#/kid/${c.id}` }, h('span.face', { 'aria-hidden': 'true' }, faceOf(c)), h('span.name', c.name))))
      : h('.empty',
          h('p', 'Es gibt noch kein Profil. Lege im Elternbereich ein Profil für dein Kind an.'),
          h('a.btn.big', { href: '#/parent' }, 'Elternbereich öffnen')),
    children.length ? h('p.parent-link', h('a.btn.ghost.small', { href: '#/parent' }, '🔒 Elternbereich')) : null
  );
}

// ================================================================ Netzplan

async function homeView(id, subjectId) {
  const [meta, ov] = await Promise.all([loadMeta(), api(`/children/${id}/overview`)]);
  prefs.lastChild = Number(id);
  const subject = meta.subjects.find((s) => s.id === subjectId) ?? meta.subjects[0];
  if (!subject) {
    render(kidBar(ov), h('.empty', 'Es sind noch keine Fächer eingerichtet.'));
    return;
  }
  const progress = ov.progress[subject.id] ?? {};
  const hash = `#/kid/${id}${subjectId ? `/s/${subject.id}` : ''}`;

  const limit = ov.dailyLimit;
  const shieldNote = ov.streakInfo.shieldUsedOn && ov.streakInfo.shieldUsedOn >= addDaysIso(-2)
    ? h('p.shield-note', `🛡️ Dein Serienschutz hat deine Serie gerettet! Du bist jetzt ${ov.streak} Tage dabei. Der nächste Schutz ist in einer Woche wieder bereit.`)
    : null;
  const boostNote = ov.child.adult ? null : boostBanner(id, meta, ov.boost, subject.id);
  const boxes = ov.lootboxes.closed.length;
  const gifts = ov.lootboxes.closed.filter((b) => b.source === 'gift').length;
  const lootNote = boxes
    ? h('p.loot-note', { class: gifts ? 'gift' : '' },
        gifts
          ? `💌 Deine Eltern haben dir ${gifts === 1 ? 'eine Lootbox' : `${gifts} Lootboxen`} geschenkt! `
          : `🎁 Du hast ${boxes === 1 ? 'eine ungeöffnete Lootbox' : `${boxes} ungeöffnete Lootboxen`}! `,
        h('a', { href: `#/kid/${id}/boxen` }, 'Jetzt öffnen →'))
    : null;
  const retireAfter = ov.settings.retireAfter;
  const today = ov.child.adult ? null : h('section.today',
    h('div',
      h('h2', limit > 0 ? `Heute verdient: ${ov.earnedToday} von ${limit} Sternen` : `Heute verdient: ${ov.earnedToday} Sterne`),
      ov.limitRaised ? h('p.muted.small', '🎁 Heute gibt es ein Extra-Limit von deinen Eltern!') : null,
      limit > 0 ? h('.meter', { role: 'img', 'aria-label': `${ov.earnedToday} von ${limit}` },
        h('span', { style: { width: `${Math.min(100, (ov.earnedToday / limit) * 100)}%` } })) : null),
    h('a.btn.ghost', { href: `#/kid/${id}/tickets` }, '🎟️ Sterne eintauschen'));

  // Wiederholung: Gelerntes, das nach ein paar Tagen Pause wieder dran ist – damit es nicht vergessen wird.
  const dueN = ov.due?.[subject.id] ?? 0;
  const due = dueN > 0
    ? h('section.review-card.due-card',
        h('span', { style: { fontSize: '1.8rem' }, 'aria-hidden': 'true' }, '🔁'),
        h('p', h('strong', 'Wiederholen: '),
          dueN === 1 ? 'Eine Aufgabe ist heute wieder dran' : `${dueN} Aufgaben sind heute wieder dran`,
          ' – damit du nichts vergisst.'),
        h('button.btn', {
          type: 'button',
          onclick: (e) => {
            e.currentTarget.disabled = true;
            startRide({ childId: Number(id), subject: subject.id, mode: 'due', lineColor: '#0B7A75', backHash: hash, train: ov.train });
          },
        }, 'Wiederholen'))
    : null;

  const reviewN = ov.review[subject.id] ?? 0;
  const review = reviewN > 0
    ? h('section.review-card',
        h('span', { style: { fontSize: '1.8rem' }, 'aria-hidden': 'true' }, '🔧'),
        h('p', h('strong', 'Fehler-Training: '),
          reviewN === 1 ? 'Eine Aufgabe will nochmal geübt werden.' : `${reviewN} Aufgaben wollen nochmal geübt werden.`),
        h('button.btn', {
          type: 'button',
          onclick: () => startRide({ childId: Number(id), subject: subject.id, mode: 'review', lineColor: '#D7263D', backHash: hash, train: ov.train }),
        }, 'Jetzt üben'))
    : null;

  const tabs = meta.subjects.length > 1
    ? h('nav.subject-tabs', { 'aria-label': 'Fächer' }, meta.subjects.map((s) =>
        h('a', { href: `#/kid/${id}/s/${s.id}`, 'aria-current': s.id === subject.id ? 'page' : null },
          `${s.icon} ${s.name}${ov.boost?.subject === s.id ? ' 🎉' : ''}`)))
    : null;

  const blitz = subject.blitz?.length
    ? h('section.blitz-row', subject.blitz.map((t) => {
        const best = ov.blitz[`${subject.id}/${t.id}`];
        return h('a.blitz-tile', { href: `#/kid/${id}/blitz/${subject.id}/${t.id}` },
          h('span.b-icon', { 'aria-hidden': 'true' }, t.icon),
          h('span.b-text', h('strong', t.title), h('span.muted.small', best ? `Dein Rekord: ⚡ ${best}` : '60 Sekunden – wie viele schaffst du?')),
          h('span.b-go', { 'aria-hidden': 'true' }, '▶'));
      }))
    : null;

  const map = h('section.map', subject.lines.map((line) => {
    // Archivierte Stationen haben die Eltern aus dem Fahrplan genommen.
    const units = subject.units.filter((u) => u.line === line.id && !progress[u.id]?.archived);
    if (!units.length) return null;
    const next = units.find((u) => (progress[u.id]?.best ?? 0) < 2 && !progress[u.id]?.parked);
    const doneCount = units.filter((u) => (progress[u.id]?.best ?? 0) === 3).length;
    const exam = ov.lines[subject.id]?.[line.id];
    const lineCardData = lineCard(subject, line);
    const terminus = exam
      ? h('li.station.terminus', { class: exam.passed ? 'mastered' : exam.unlocked ? 'next' : 'locked' },
          exam.unlocked
            ? h('button', {
                type: 'button',
                onclick: (e) => {
                  e.currentTarget.disabled = true;
                  startRide({ childId: Number(id), subject: subject.id, line: line.id, mode: 'exam', lineColor: line.color, backHash: hash, train: ov.train, card: lineCardData });
                },
              },
                h('span.stop', { 'aria-hidden': 'true' }),
                h('span.st-text',
                  h('span.st-name', `🏁 Endbahnhof`),
                  h('span.st-sub', exam.passed ? `Bestanden (bestes Ergebnis ${exam.best} %) – nochmal fahren?` : 'Die große Prüfung über die ganze Linie!'),
                  exam.passed ? null : h('span.st-flag', 'Jetzt offen')),
                h('span.term-icon', { 'aria-hidden': 'true' }, exam.passed ? '🏆' : '🎯'))
            : h('span.term-locked',
                h('span.stop', { 'aria-hidden': 'true' }),
                h('span.st-text',
                  h('span.st-name', '🔒 Endbahnhof'),
                  h('span.st-sub', 'Öffnet, wenn alle Stationen mindestens 2 Sterne haben.'))))
      : null;
    const boostedUnit = (u) => ov.boost?.subject === subject.id && ov.boost.unit === u.id && !progress[u.id]?.parked;
    // Geschafft = 3 Sterne oder Abstellgleis. Zurückgeholte Stationen und Event-Stationen bleiben sichtbar.
    const isDone = (u) => {
      const p = progress[u.id];
      return (p?.parked || p?.best === 3) && !(p.retired && !p.parked) && !boostedUnit(u) && u !== next;
    };
    const doneN = units.filter(isDone).length;
    const foldKey = `${subject.id}/${line.id}`;
    const list = h('ol.stations', { class: doneN >= 2 && prefs.isFolded(foldKey) ? 'folded' : '' });
    const fold = doneN >= 2 ? foldToggle(list, foldKey, doneN) : null;
    list.append(...[fold, ...units.map((u) => {
      const p = progress[u.id];
      const cls = [p?.parked ? 'parked' : p?.best === 3 ? 'mastered' : p?.runs ? 'visited' : '', u === next ? 'next' : '', isDone(u) ? 'done' : ''].filter(Boolean).join(' ');
      const boosted = boostedUnit(u);
      return h('li.station', { class: cls },
        h('a', { href: `#/kid/${id}/station/${subject.id}/${u.id}` },
          h('span.stop', { 'aria-hidden': 'true' }),
          h('span.st-text',
            h('span.st-name', `${u.icon} ${u.title}`),
            h('span.st-sub', u.subtitle),
            u === next ? h('span.st-flag', 'Nächster Halt') : null,
            p?.parked ? h('span.st-flag.parked', '🅿️ Abstellgleis') : null,
            p?.retired && !p.parked ? h('span.st-flag.back', `🔄 Noch ${p.extraRides}× mit Sternen`) : null,
            !ov.child.adult && retireAfter > 0 && p?.perfect > 0 && !p.retired
              ? h('span.loot-tag', { title: `${p.perfect} von ${retireAfter} Fahrten mit 3 Sternen – dann gibt es eine Lootbox` }, `🎁 ${p.perfect}/${retireAfter}`)
              : null,
            boosted ? h('span.boost-tag', '🎉 ×2 Sterne') : null),
          starRow(p?.best ?? 0)));
    }), terminus].filter(Boolean));
    return h('div.line-col', { style: { '--line': line.color } },
      h('.line-head', h('span.line-pill', line.name),
        ov.boost?.subject === subject.id && ov.boost.line === line.id ? h('span.boost-tag', '🎉 ×2 Sterne') : null,
        h('span.count', `${doneCount} / ${units.length} gemeistert`)),
      list);
  }));

  render(kidBar(ov), shieldNote, boostNote, lootNote, continueCard(id, subject, progress), planCard(id, ov.plan, meta), tabs, today, due, review, blitz, map);
}

/** Klappt die geschafften Stationen einer Linie ein und aus. */
function foldToggle(list, key, n) {
  const name = h('span.st-name');
  const sub = h('span.st-sub');
  const btn = h('button', { type: 'button', onclick: () => set(!list.classList.contains('folded')) },
    h('span.stop', { 'aria-hidden': 'true' }), h('span.st-text', name, sub));
  const set = (folded, remember = true) => {
    list.classList.toggle('folded', folded);
    btn.setAttribute('aria-expanded', String(!folded));
    name.textContent = folded ? `✔ ${n} geschaffte Stationen` : '✔ Geschaffte Stationen ausblenden';
    sub.textContent = folded ? 'Antippen, um sie zu zeigen' : 'Sie bleiben in deinem Album';
    if (remember) prefs.setFolded(key, folded);
  };
  set(list.classList.contains('folded'), false);
  return h('li.station.fold', btn);
}

/**
 * Großer „Weiter geht’s“-Knopf oben im Netzplan: die erste Station dieses Fachs,
 * auf der es heute noch volle Sterne gibt – am liebsten eine, die noch nicht sitzt.
 */
function continueCard(id, subject, progress) {
  const units = subject.lines.flatMap((l) => subject.units.filter((u) => u.line === l.id));
  const open = units.filter((u) => {
    const p = progress[u.id];
    return !p?.archived && !p?.parked && !p?.today;
  });
  const best = (u) => progress[u.id]?.best ?? 0;
  const u = open.find((x) => best(x) < 2) ?? open.find((x) => best(x) < 3) ?? open[0];
  if (!u) return null;
  const line = lineOf(subject, u.line);
  return h('a.continue', { href: `#/kid/${id}/station/${subject.id}/${u.id}`, style: { '--line': line.color } },
    h('span.c-icon', { 'aria-hidden': 'true' }, u.icon),
    h('span.c-text',
      h('span.c-label', 'Weiter geht’s'),
      h('strong.c-title', u.title),
      h('span.c-sub', `${subject.icon} ${subject.name} · ${line.name}`)),
    h('span.c-go', { 'aria-hidden': 'true' }, '▶'));
}

function boostHere(boost, subjectId, lineId, unitId) {
  if (!boost) return false;
  if (!boost.subject) return true;
  if (boost.subject !== subjectId) return false;
  if (boost.unit) return boost.unit === unitId;
  return !boost.line || boost.line === lineId;
}

/** Wofür das „Doppelte Sterne“-Event gilt, in Kindersprache. */
function boostWhere(meta, boost) {
  const sub = meta.subjects.find((x) => x.id === boost.subject);
  if (!sub) return null;
  if (boost.unit) return `auf der Station „${sub.units.find((u) => u.id === boost.unit)?.title ?? boost.unit}“`;
  if (boost.line) return `auf der Linie „${sub.lines.find((l) => l.id === boost.line)?.name ?? boost.line}“`;
  return `in ${sub.name}`;
}

/** Banner fürs laufende Event – mit Link dorthin, wenn es nur für einen Teil gilt. */
function boostBanner(id, meta, boost, currentSubject) {
  if (!boost) return null;
  const where = boostWhere(meta, boost);
  const time = new Date(boost.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const text = boost.once
    ? `🎉 Deine nächste Fahrt${where ? ` ${where}` : ''} bringt doppelte Sterne!`
    : `🎉 Doppelte Sterne${where ? ` ${where}` : ''}! Jede Fahrt${where ? ' dort' : ''}, die du bis ${time} Uhr startest, bringt doppelt so viele Sterne.`;
  const href = boost.unit ? `#/kid/${id}/station/${boost.subject}/${boost.unit}`
    : boost.subject && boost.subject !== currentSubject ? `#/kid/${id}/s/${boost.subject}` : null;
  return h('p.boost-note', text, href ? [' ', h('a', { href }, 'Hinfahren →')] : null);
}

function addDaysIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ================================================================ Station

async function stationView(id, subjectId, unitId) {
  const [meta, ov, unit, { next }] = await Promise.all([
    loadMeta(), api(`/children/${id}/overview`), api(`/subjects/${subjectId}/units/${unitId}`), api(`/children/${id}/next/${subjectId}/${unitId}`),
  ]);
  const subject = meta.subjects.find((s) => s.id === subjectId);
  const line = lineOf(subject, unit.line);
  const p = ov.progress[subjectId]?.[unitId];
  const mapHash = `#/kid/${id}${meta.subjects[0]?.id === subjectId ? '' : `/s/${subjectId}`}`;
  const n = ov.settings.questionsPerSession;
  const retireAfter = ov.settings.retireAfter;
  const sign = h('header.sign',
    h('span.icon', { 'aria-hidden': 'true' }, unit.icon),
    h('div', h('h1', unit.title), h('p', `${unit.subtitle} · ${line.name}`)));

  if (p?.archived) {
    render(kidBar(ov), h('div', { style: { '--line': line.color } },
      h('a.back', { href: mapHash }, '← Zum Netzplan'),
      sign,
      h('p.parked-note', '🚧 Diese Station ist gerade außer Betrieb.')));
    return;
  }

  const nextHref = next ? `#/kid/${id}/station/${next.subject}/${next.unit}` : null;
  const otherSubject = next && next.subject !== subjectId ? ` (${next.subjectName})` : '';
  // Heute schon geschafft oder auf dem Abstellgleis: lieber weiter zum nächsten Halt
  const moveOn = nextHref && (p?.parked || (p?.today > 0 && p.best >= 2));
  const status = p?.parked
    ? h('p.parked-note', `🅿️ Abstellgleis: Du hast diese Station ${p.perfect}× mit 3 Sternen geschafft. Hier gibt es keine Sterne mehr – üben darfst du trotzdem.`)
    : p?.retired
      ? h('p.parked-note.back', `🔄 Deine Eltern haben diese Station zurückgeholt: ${p.extraRides === 1 ? 'Die nächste Fahrt bringt' : `Die nächsten ${p.extraRides} Fahrten bringen`} wieder Sterne.`)
      : !ov.child.adult && retireAfter > 0
        ? h('p.loot-progress', `🎁 ${p?.perfect ?? 0} von ${retireAfter} Fahrten mit 3 Sternen. Bei ${retireAfter} kommt die Station aufs Abstellgleis, und du bekommst eine Lootbox.`)
        : null;

  const page = h('div', { style: { '--line': line.color } },
    h('a.back', { href: mapHash }, '← Zum Netzplan'),
    sign,
    !ov.child.adult && !p?.parked && boostHere(ov.boost, subjectId, unit.line, unitId)
      ? h('p.boost-note', ov.boost.once ? '🎉 Deine nächste Fahrt hier bringt doppelte Sterne!' : '🎉 Hier gibt es gerade doppelte Sterne!')
      : null,
    h('.record',
      starRow(p?.best ?? 0),
      h('span', p?.runs ? `${p.runs}× gefahren · im Schnitt ${p.avg} % richtig` : 'Hier warst du noch nie – los geht’s!')),
    status,
    moveOn
      ? h('p.next-note',
          p.parked ? 'Neue Sterne gibt es beim nächsten Halt: ' : 'Hier warst du heute schon. Beim nächsten Halt gibt es wieder volle Sterne: ',
          h('a', { href: nextHref }, `${next.icon} ${next.title}${otherSubject} →`))
      : null,
    unit.explain.length
      ? h('section.panel.merke', h('h2', '📌 Merke'), renderExplain(unit.explain, subject.speechLang))
      : null,
    unit.vocab.length
      ? h('section.panel',
          h('h2', `📖 Wörter dieser Station (${unit.vocab.length})`),
          h('ul.vocab-list', unit.vocab.map((v) =>
            h('li',
              subject.speechLang && canSpeak()
                ? h('button.say', { type: 'button', 'aria-label': `Vorlesen: ${v.en}`, onclick: () => speak(v.en, subject.speechLang) }, '🔊')
                : null,
              h('span.en', v.en),
              h('span.de', v.de)))))
      : null
  );

  const ride = h('button.btn.big', {
    type: 'button',
    class: moveOn ? 'ghost' : 'line',
    onclick: (e) => {
      e.currentTarget.disabled = true;
      const u = subject.units.find((x) => x.id === unitId);
      startRide({
        childId: Number(id), subject: subjectId, unit: unitId, lineColor: line.color, backHash: location.hash, mapHash,
        train: ov.train, card: u ? unitCard(subject, u, subject.units.indexOf(u) + 1) : null,
      });
    },
  }, moveOn ? '🔁 Nochmal' : `🚆 Losfahren · ${n} Aufgaben`);
  const dock = h('.dock', { style: { '--line': line.color } },
    h('.dock-inner',
      moveOn ? h('a.btn.line.big', { href: nextHref }, '🚉 Nächster Halt →') : null,
      ride));

  render(kidBar(ov), page);
  document.body.append(dock);
}

// ================================================================ Sammlung: Rang & Züge, Album, Stempelheft, Abzeichen

const TABS = [
  ['rang', '🚂 Rang & Züge'],
  ['album', '🃏 Album'],
  ['avatar', '🐱 Companion'],
  ['stempel', '🔖 Stempel'],
  ['abzeichen', '🏅 Abzeichen'],
];

async function collectionView(id, tab) {
  const [meta, ov] = await Promise.all([loadMeta(), api(`/children/${id}/overview`)]);
  if (!TABS.some(([t]) => t === tab)) tab = 'rang';
  const nav = h('nav.subject-tabs', { 'aria-label': 'Sammlung' }, TABS.map(([t, label]) =>
    h('a', { href: `#/kid/${id}/sammlung/${t}`, 'aria-current': t === tab ? 'page' : null }, label)));
  const body = { rang: rankPanel, album: albumPanel, avatar: avatarPanel, stempel: stampPanel, abzeichen: badgePanel }[tab](id, meta, ov);
  render(kidBar(ov), nav, ...[body].flat());
}

function avatarPanel(id, meta, ov) {
  const { owned, skins, cats } = ov.avatarState;
  const change = async (body) => {
    try {
      await api(`/children/${id}/avatar`, { method: 'POST', body });
      sfx.right();
      collectionView(id, 'avatar');
    } catch (err) {
      toast(err.message);
    }
  };
  const pick = (label, svg, on, current, locked, sub) =>
    h('button.train-pick.skin-pick', {
      type: 'button', class: [locked ? 'locked' : '', current ? 'current' : ''].filter(Boolean).join(' '),
      disabled: locked || current, 'aria-pressed': String(current), onclick: on,
    }, h('span.skin-art', { 'aria-hidden': 'true', html: locked ? '🔒' : svg }), h('span.t-name', label), h('span.t-sub', sub));
  const base = ov.child.companion;
  const persona = PERSONAS[base?.slice(4)];
  // Wach und zum Antippen: Die Katze zeigt, wie sie sich freut.
  const hero = companion(ov.child, { awake: true, className: 'hero' });
  if (hero) setTimeout(() => hero.cheer(), 500);
  return [
    h('section.panel.avatar-stage',
      hero?.el,
      h('div',
        h('h2', persona ? `Dein Companion: ${persona.trait}` : 'Dein Companion'),
        h('p.muted', 'Diese Katze begleitet dich bei jeder Fahrt und freut sich mit dir über richtige Antworten.'),
        persona ? h('p', persona.about) : null,
        h('p.muted.small', 'Tipp sie an! Such dir eine Katze und einen Skin aus.'))),
    h('section.panel',
      h('h2', '🐱 Dein Companion'),
      h('.trains', cats.map((c) => {
        const current = base === c.id;
        const trait = PERSONAS[c.id.slice(4)]?.trait;
        return pick(c.name, avatarSvg(c.id), () => change({ companion: c.id }), current, false,
          current ? `${trait} · dein Companion` : `${trait} · auswählen`);
      }))),
    h('section.panel',
      h('h2', `🎩 Skins (${owned.length} von ${skins.length})`),
      h('p.muted', 'Skins findest du, wenn du einen Endbahnhof zum ersten Mal schaffst. Manche gibt es nur als Geschenk.'),
      h('.trains', [
        pick('Ohne Skin', avatarSvg(base), () => change({ skin: '' }), !ov.child.skin, false, !ov.child.skin ? 'Getragen' : 'Ausziehen'),
        ...skins.map((s) => {
          const has = owned.includes(s.id);
          const current = ov.child.skin === s.id;
          return pick(has ? s.name : '???', avatarSvg(base, s.id), () => change({ skin: s.id }), current, !has,
            current ? 'Getragen' : has ? 'Anziehen' : s.pool === 'line' ? 'Endbahnhof schaffen' : 'Besonderer Anlass');
        }),
      ])),
  ];
}

function rankPanel(id, meta, ov) {
  const pick = async (train) => {
    try {
      await api(`/children/${id}/train`, { method: 'POST', body: { train } });
      sfx.right();
      toast(`${train} ist jetzt dein Zug!`);
      collectionView(id, 'rang');
    } catch (err) {
      toast(err.message);
    }
  };
  return [
    h('section.panel',
      h('h2', `⭐ Dein Rang (${ov.rank.level} von ${ov.ranks.length})`),
      rankMeter(ov.rank),
      h('p.muted.small', 'XP gibt es für jede richtige Antwort (10 XP), für jeden Fahrplan-Stempel (50 XP) und für jeden Endbahnhof (100 XP).')),
    h('section.panel',
      h('h2', '🚉 Dein Zug'),
      h('p.muted', 'Mit diesem Zug fährst du durch die Übungen. Jeder neue Rang schaltet einen neuen Zug frei.'),
      h('.trains', ov.ranks.map((r, i) => {
        const unlocked = ov.trains.includes(r.train);
        const current = ov.train === r.train;
        return h('button.train-pick', {
          type: 'button',
          class: [unlocked ? '' : 'locked', current ? 'current' : ''].filter(Boolean).join(' '),
          disabled: !unlocked || current,
          'aria-pressed': String(current),
          onclick: () => pick(r.train),
        },
          h('span.t-emoji', { 'aria-hidden': 'true' }, unlocked ? r.train : '🔒'),
          h('span.t-name', r.name),
          h('span.t-sub', current ? 'Dein Zug' : unlocked ? 'Auswählen' : `ab ${r.min} XP`));
      }))),
  ];
}

function albumPanel(id, meta, ov) {
  let owned = 0;
  let total = 0;
  const sections = meta.subjects.map((subject) => {
    const progress = ov.progress[subject.id] ?? {};
    return h('section.panel',
      h('h2', `${subject.icon} ${subject.name}`),
      subject.lines.map((line) => {
        // Archivierte Stationen nur, wenn die Karte schon gesammelt ist
        const units = subject.units.filter((u) => u.line === line.id && (!progress[u.id]?.archived || progress[u.id].best === 3));
        if (!units.length) return null;
        const exam = ov.lines[subject.id]?.[line.id];
        total += units.length + 1;
        const cards = units.map((u) => {
          const has = (progress[u.id]?.best ?? 0) === 3;
          if (has) owned++;
          return albumCard({ ...unitCard(subject, u, subject.units.indexOf(u) + 1), owned: has });
        });
        if (exam?.passed) owned++;
        const gold = albumCard({
          ...lineCard(subject, line), owned: !!exam?.passed, gold: true,
          hint: 'Besteh die Endbahnhof-Prüfung dieser Linie, dann bekommst du die Goldkarte.',
        });
        return h('div.album-line', { style: { '--line': line.color } },
          h('h3.line-pill', line.name),
          h('.album', gold, cards));
      }),
      formerGold(subject, ov.lines[subject.id] ?? {}, () => { owned++; total++; }));
  });
  return [
    h('section.panel',
      h('h2', `🃏 Sammelalbum – ${owned} von ${total} Karten`),
      h('p.muted', 'Für jede Station, die du mit 3 Sternen schaffst, bekommst du eine Karte. Für jeden Endbahnhof gibt es eine Goldkarte.'),
      h('.meter', h('span', { style: { width: `${total ? (owned / total) * 100 : 0}%` } }))),
    ...sections,
  ];
}

/** Goldkarten von Linien, die es nach einer Neuaufteilung nicht mehr gibt – einmal verdient, bleiben sie im Album. */
function formerGold(subject, status, count) {
  const passed = (subject.formerLines ?? []).filter((l) => status[l.id]?.passed);
  if (!passed.length) return null;
  passed.forEach(count);
  return h('div.album-line', { style: { '--line': '#8A6D1F' } },
    h('h3.line-pill', 'Frühere Linien'),
    h('.album', passed.map((line) => albumCard({ ...lineCard(subject, line), owned: true, gold: true }))));
}

/** Kleine Karte im Album; antippen zeigt sie groß. */
function albumCard(data) {
  return h('button.card-btn', {
    type: 'button',
    'aria-label': `${data.title}${data.owned ? '' : ' (noch nicht gesammelt)'}`,
    onclick: () => {
      const view = h('.card-view', { role: 'dialog', 'aria-modal': 'true', onclick: () => view.remove() }, collectCard({ ...data, fresh: data.owned }));
      document.body.append(view);
    },
  }, collectCard(data));
}

function stampPanel(id, meta, ov) {
  const stamped = new Set(ov.stampDays);
  const days = [];
  const start = new Date();
  // 4 Wochen, beginnend am Montag
  start.setDate(start.getDate() - 27 - ((start.getDay() + 6) % 7));
  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ iso, day: d.getDate(), future: d > new Date(), today: iso === ov.plan.day });
  }
  return [
    h('section.panel',
      h('h2', `🔖 Stempelheft – ${ov.plan.stamps} Stempel`),
      h('p.muted', 'Jeden Tag, an dem du alle drei Aufgaben vom Tagesfahrplan schaffst, bekommst du einen Stempel.'),
      h('.stamp-grid',
        ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => h('span.sg-head', d)),
        days.map((d) => h('span.sg-day', { class: [stamped.has(d.iso) ? 'stamped' : '', d.future ? 'future' : '', d.today ? 'today' : ''].filter(Boolean).join(' ') },
          stamped.has(d.iso) ? h('span.sg-stamp', { 'aria-label': `${d.day}.: Stempel` }, '✔') : h('span', d.day))))),
    planCard(id, ov.plan, meta),
    h('section.panel',
      h('h2', '🛡️ Serienschutz'),
      h('p', ov.streakInfo.shieldReady
        ? 'Dein Serienschutz ist bereit: Wenn du mal einen Tag nicht übst, bleibt deine Serie trotzdem erhalten. Das geht einmal pro Woche.'
        : 'Dein Serienschutz wurde in den letzten 7 Tagen schon benutzt. Also heute lieber üben, damit deine Serie weiterläuft!')),
  ];
}

function badgePanel(id, meta, ov) {
  const earned = new Map(ov.badges.map((b) => [b.id, b.earned_at]));
  return [
    h('section.panel',
      h('h2', `🏅 Deine Abzeichen – ${earned.size} von ${meta.badges.length}`),
      h('p.muted', 'Für jedes neue Abzeichen bekommst du 6 Extra-Sterne.')),
    h('.badges', meta.badges.map((b) =>
      h('.badge', { class: earned.has(b.id) ? '' : 'locked' },
        h('.medal', { 'aria-hidden': 'true' }, b.icon),
        h('.bname', b.name),
        h('.bdesc', b.desc),
        earned.has(b.id) ? h('.bdesc', `✓ ${new Date(earned.get(b.id)).toLocaleDateString('de-DE')}`) : null))),
  ];
}

// ================================================================ Blitzrunde

async function blitzView(id, subjectId, topicId) {
  const [meta, ov, rec] = await Promise.all([loadMeta(), api(`/children/${id}/overview`), api(`/children/${id}/blitz/${subjectId}/${topicId}`)]);
  const subject = meta.subjects.find((s) => s.id === subjectId);
  const color = subject?.lines[0]?.color ?? '#D9631E';
  const backHash = `#/kid/${id}/s/${subjectId}`;
  const start = () => {
    document.querySelectorAll('.dock').forEach((el) => el.remove());
    runBlitz(app, {
      childId: Number(id), subject: subjectId, topic: rec.topic, lineColor: color,
      onExit: () => { if (location.hash === backHash) route(); else location.hash = backHash; },
      onAgain: () => (location.hash === `#/kid/${id}/blitz/${subjectId}/${topicId}` ? start() : null),
    });
  };
  render(
    kidBar(ov),
    h('div', { style: { '--line': color } },
      h('a.back', { href: backHash }, '← Zum Netzplan'),
      h('header.sign',
        h('span.icon', { 'aria-hidden': 'true' }, rec.topic.icon),
        h('div', h('h1', rec.topic.title), h('p', rec.topic.subtitle || subject?.name))),
      h('section.panel',
        h('h2', '⏱️ So geht’s'),
        h('p', 'Du hast ', h('strong', '60 Sekunden'), '. Beantworte so viele Aufgaben wie möglich. Falsche Antworten kosten nur Zeit – also schnell, aber genau!'),
        h('p.blitz-record', rec.best ? `Dein Rekord: ⚡ ${rec.best}` : 'Du hast hier noch keinen Rekord. Leg los!')),
      rec.runs.length > 1 ? h('section.panel', h('h2', '📈 Deine letzten Runden'), runChart(rec.runs)) : null,
      familyBoard(rec.family, id)));
  document.body.append(h('.dock', { style: { '--line': color } },
    h('.dock-inner', h('button.btn.line.big', { type: 'button', onclick: start }, '⚡ Blitzrunde starten'))));
}

// ================================================================ Lootboxen

async function boxesView(id) {
  const ov = await api(`/children/${id}/overview`);
  const { closed, opened } = ov.lootboxes;
  const retireAfter = ov.settings.retireAfter;
  const how = retireAfter > 0
    ? `Eine Lootbox bekommst du, wenn du eine Station ${retireAfter}× mit 3 Sternen schaffst (dann kommt sie aufs Abstellgleis) und wenn du zum ersten Mal den Endbahnhof einer Linie bestehst. Manchmal schenken dir auch deine Eltern eine.`
    : 'Eine Lootbox bekommst du, wenn du zum ersten Mal den Endbahnhof einer Linie bestehst. Manchmal schenken dir auch deine Eltern eine.';
  render(
    kidBar(ov),
    h('section.panel',
      h('h2', '🎁 Deine Lootboxen'),
      h('p', 'In jeder Lootbox steckt Medienzeit, als Sterne auf dein Konto. Wie viel? Das verrät sie erst beim Öffnen!'),
      h('p.muted.small', how)),
    closed.length
      ? h('.lootboxes', closed.map((b) => lootbox(id, b)))
      : h('section.panel', h('p.muted', 'Gerade hast du keine ungeöffnete Lootbox.')),
    opened.length ? h('section.panel', h('h2', 'Schon geöffnet'), h('ul.lb-list', opened.map(openedBox))) : null
  );
}

// ================================================================ Fahrkarten (Medienzeit)

const STATUS = { pending: 'wartet auf OK', approved: 'genehmigt', rejected: 'abgelehnt', cancelled: 'zurückgegeben' };

async function ticketsView(id) {
  const ov = await api(`/children/${id}/overview`);
  const { minutesPerStar, ticketMinutes } = ov.settings;

  const buy = async (minutes, stars) => {
    if (!(await ask(`${minutes} Minuten Medienzeit eintauschen?`, { text: `Das kostet ${stars} Sterne. Danach müssen deine Eltern das Ticket noch bestätigen.`, ok: 'Eintauschen', cancel: 'Lieber nicht' }))) return;
    try {
      await api(`/children/${id}/tickets`, { method: 'POST', body: { minutes } });
      toast('Ticket gelöst! Jetzt müssen deine Eltern es noch bestätigen.');
      ticketsView(id);
    } catch (err) {
      toast(err.message);
    }
  };
  const cancel = async (tid) => {
    try {
      await api(`/children/${id}/tickets/${tid}/cancel`, { method: 'POST' });
      toast('Ticket zurückgegeben – die Sterne sind wieder da.');
      ticketsView(id);
    } catch (err) {
      toast(err.message);
    }
  };

  render(
    kidBar(ov),
    h('section.panel',
      h('h2', '🎟️ Sterne gegen Medienzeit tauschen'),
      h('p.muted', `${minutesPerStar < 1
        ? `${1 / minutesPerStar} Sterne sind 1 Minute wert.`
        : `Ein Stern ist ${String(minutesPerStar).replace('.', ',')} ${minutesPerStar === 1 ? 'Minute' : 'Minuten'} wert.`} Deine Eltern bestätigen das Ticket, dann geht’s los.`)),
    h('.tickets', ticketMinutes.map((m) => {
      const stars = Math.ceil(m / minutesPerStar);
      const missing = stars - ov.balance;
      return h('.ticket',
        h('span.t-label', 'Medienzeit'),
        h('span.t-min', `${m} Min.`),
        h('span.t-price', `${stars} ★`),
        h('button.btn', { type: 'button', disabled: missing > 0, onclick: () => buy(m, stars) },
          missing > 0 ? `Noch ${missing} ★ sammeln` : 'Eintauschen'));
    })),
    h('section.panel', { style: { marginTop: '20px' } },
      h('h2', 'Deine Tickets'),
      ov.tickets.length
        ? h('ul.ticket-list', ov.tickets.map((t) =>
            h('li',
              h('strong', `${t.minutes} Minuten`),
              h('span.muted', `${t.stars} ★ · ${new Date(t.created_at).toLocaleDateString('de-DE')}`),
              h('span.status', { class: t.status }, STATUS[t.status] ?? t.status),
              t.status === 'pending' ? h('button.btn.ghost.small', { type: 'button', onclick: () => cancel(t.id) }, 'Zurückgeben') : null)))
        : h('p.muted', 'Du hast noch keine Tickets gelöst.'))
  );
}
