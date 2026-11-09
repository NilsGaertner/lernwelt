import { h, starRow, toast, prefs, speak, canSpeak, rankMeter, sfx, renderExplain, ask, closeDialogs, weekStrip, weekHint } from './ui.js';
import { api } from './api.js';
import { runRide, collectCard } from './player.js';
import { runBlitz, runChart, familyBoard } from './blitz.js';
import { parentView } from './parent.js';
import { lootbox, openedBox, rarityLegend } from './lootbox.js';
import { faceOf } from './avatar.js';
import { avatarSvg, PERSONAS } from './avatar-data.js';
import { companion } from './companion.js';
import { W, cap, applyTheme, THEMES } from './themes.js';

const app = document.getElementById('app');
const state = { meta: null };

async function loadMeta(force = false) {
  if (!state.meta || force) state.meta = await api('/meta');
  return state.meta;
}

/** Lädt die Daten des Kindes und schaltet auf sein Thema um – vor dem Zeichnen, damit Worte und Farben gleich stimmen. */
async function kidOverview(id) {
  const ov = await api(`/children/${id}/overview`);
  applyTheme(ov.child.theme);
  return ov;
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
  [/^kid\/(\d+)$/, (id) => dashboardView(id)],
  [/^kid\/(\d+)\/s\/([\w-]+)$/, (id, subject) => subjectView(id, subject)],
  [/^kid\/(\d+)\/station\/([\w-]+)\/([\w-]+)$/, stationView],
  [/^kid\/(\d+)\/badges$/, (id) => collectionView(id, 'abzeichen')],
  [/^kid\/(\d+)\/sammlung(?:\/(\w+))?$/, (id, tab) => collectionView(id, tab ?? 'rang')],
  [/^kid\/(\d+)\/blitz\/([\w-]+)\/([\w-]+)$/, blitzView],
  [/^kid\/(\d+)\/tickets$/, ticketsView],
  [/^kid\/(\d+)\/boxen$/, boxesView],
  [/^kid\/(\d+)\/werkstatt$/, werkstattView],
  [/^parent(?:\/(.*))?$/, (rest) => parentView(app, rest ?? '', { reloadMeta: () => loadMeta(true) })],
];

async function route() {
  window.speechSynthesis?.cancel();
  closeDialogs();
  document.querySelectorAll('.sheet, .dock, .card-view').forEach((el) => el.remove());
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (!path.startsWith('kid/')) applyTheme();
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
    h('a.roundel', { href: `#/kid/${id}`, title: 'Zur Übersicht' },
      h('span.ring', { 'aria-hidden': 'true' }, faceOf(ov.child)),
      h('span.bar', ov.child.name)),
    h('.spacer'),
    ov.week?.count > 0 && !ov.child.adult
      ? h('span.streak', { title: `Wochenkarte: diese Woche an ${ov.week.count === 1 ? 'einem Tag' : `${ov.week.count} Tagen`} dabei` },
          '📅 ', `${ov.week.count}/7`)
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
    const length = mode === 'exam' ? null : prefs.rideLength;
    session = await api('/sessions', { method: 'POST', body: { childId, subject, unit, line, mode, length } });
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
  icon: '🏆', title: W.lineName(line), color: line.color,
  text: `${W.say.terminusDone}: Du hast alle ${W.station.p} ${W.lineOf(line)} (${subject.name}) gemeistert!`,
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
      h('h2', '💡 Ideen für heute'),
      h('a.plan-stamps', { href: `#/kid/${id}/sammlung/stempel`, title: 'Zum Stempelheft' }, `🔖 ${plan.stamps} Stempel`)),
    h('ol.missions', plan.missions.map((m) => {
      const href = !m.done && missionHref(id, m, meta);
      const body = [h('span.check', { 'aria-hidden': 'true' }, m.done ? '✔' : ''), h('span.m-icon', { 'aria-hidden': 'true' }, m.icon), h('span.m-label', m.label)];
      return h('li', { class: m.done ? 'done' : '' },
        href ? h('a', { href }, body) : h('span.m-row', body),
        h('span.sr-only', m.done ? ' (erledigt)' : ' (offen)'));
    })),
    plan.done
      ? h('p.plan-msg', 'Alle drei geschafft – der Stempel für heute ist dir sicher! 🎉')
      : h('p.plan-msg.muted', 'Nur Ideen, kein Muss. Wer alle drei schafft, bekommt einen Stempel und +50 XP.'));
}

// ================================================================ Profilauswahl

async function profilesView() {
  const children = await api('/children');
  render(
    h('section.welcome',
      h('h1', 'Lernwelt'),
      h('p', children.length ? 'Wer ist heute dabei?' : 'Willkommen!')),
    children.length
      ? h('.profiles', children.map((c) =>
          h('a.profile', { href: `#/kid/${c.id}` }, h('span.face', { 'aria-hidden': 'true' }, faceOf(c)), h('span.name', c.name))))
      : h('.empty',
          h('p', 'Es gibt noch kein Profil. Lege im Elternbereich ein Profil für dein Kind an.'),
          h('a.btn.big', { href: '#/parent' }, 'Elternbereich öffnen')),
    children.length ? h('p.parent-link', h('a.btn.ghost.small', { href: '#/parent' }, '🔒 Elternbereich')) : null
  );
}

// ================================================================ Übersicht (Startseite)

async function dashboardView(id) {
  const [meta, ov] = await Promise.all([loadMeta(), kidOverview(id)]);
  prefs.lastChild = Number(id);
  if (!meta.subjects.length) {
    render(kidBar(ov), h('.empty', 'Es sind noch keine Fächer eingerichtet.'));
    return;
  }
  const stats = meta.subjects.map((s) => subjectStats(s, ov));
  // Weiter geht’s im zuletzt geübten Fach – ist dort heute schon alles gefahren, im nächsten
  const recentFirst = [...stats].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''));
  const cont = recentFirst.map((st) => continueCard(id, st.subject, ov.progress[st.subject.id] ?? {})).find(Boolean);

  render(
    kidBar(ov),
    ov.child.adult ? null : boostBanner(id, meta, ov.boost, null),
    lootNote(id, ov),
    helloCard(id, ov),
    cont,
    planCard(id, ov.plan, meta),
    werkstattCard(id, ov),
    h('h2.section-title', '📚 Deine Fächer'),
    h('section.subject-grid', stats.map((st) => subjectCard(id, st, ov))),
    recentRides(id, meta, ov));
}

function lootNote(id, ov) {
  const boxes = ov.lootboxes.closed.length;
  if (!boxes) return null;
  const gifts = ov.lootboxes.closed.filter((b) => b.source === 'gift').length;
  return h('p.loot-note', { class: gifts ? 'gift' : '' },
    gifts
      ? `💌 Deine Eltern haben dir ${gifts === 1 ? 'eine Lootbox' : `${gifts} Lootboxen`} geschenkt! `
      : `🎁 Du hast ${boxes === 1 ? 'eine ungeöffnete Lootbox' : `${boxes} ungeöffnete Lootboxen`}! `,
    h('a', { href: `#/kid/${id}/boxen` }, 'Jetzt öffnen →'));
}

/** Begrüßung mit Companion und den Sternen von heute. */
function helloCard(id, ov) {
  const { child } = ov;
  const hour = new Date().getHours();
  const hi = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const limit = ov.dailyLimit;
  const cat = companion(child, { awake: true, className: 'greet' });
  const stars = child.adult ? null : h('.hello-stars',
    h('.hs-text',
      h('p', limit > 0 ? `Heute verdient: ${ov.earnedToday} von ${limit} ★` : `Heute verdient: ${ov.earnedToday} ★`),
      ov.limitRaised ? h('p.muted.small', '🎁 Heute gibt es ein Extra-Limit von deinen Eltern!') : null,
      ov.week ? weekStrip(ov.week) : null,
      ov.week ? h('p.muted.small', weekHint(ov.week)) : null,
      limit > 0 ? h('.meter', { role: 'img', 'aria-label': `${ov.earnedToday} von ${limit}` },
        h('span', { style: { width: `${Math.min(100, (ov.earnedToday / limit) * 100)}%` } })) : null),
    h('a.btn.ghost.small', { href: `#/kid/${id}/tickets` }, '🎟️ Eintauschen'));
  return h('section.hello',
    h('.hello-text',
      h('h1', `${hi}, ${child.name}!`),
      h('p.muted', ov.plan.done
        ? `${cap(W.plan.dein())} für heute ist geschafft – stark! 🎉`
        : ov.week?.count > 1 ? `Diese Woche schon an ${ov.week.count} Tagen dabei – stark!` : `Schön, dass du da bist. ${W.say.where}`),
      knownLine(ov.known),
      stars),
    cat?.el);
}

/**
 * „Das sitzt“: Wörter und Aufgaben, die das Kind an mehreren Tagen mit Pausen richtig hatte.
 * Sterne zeigen, wie eine Fahrt lief – das hier zeigt, was wirklich im Kopf geblieben ist.
 */
function knownLine(known) {
  if (!known?.total) {
    return h('p.known-line.muted.small', '🧠 Hier siehst du bald, was richtig sitzt: alles, was du an mehreren Tagen richtig hattest.');
  }
  return h('p.known-line', { title: 'Wörter und Aufgaben, die du an mehreren Tagen richtig hattest, mit Pausen dazwischen' },
    '🧠 Das sitzt schon: ', h('strong', known.total),
    known.week ? h('span.known-week', ` +${known.week} diese Woche`) : null);
}

/** Stand eines Fachs: Sterne, gemeisterte Stationen, nächster Halt, letzte Fahrt, offene Übungen. */
function subjectStats(subject, ov) {
  const progress = ov.progress[subject.id] ?? {};
  const units = subject.units.filter((u) => !progress[u.id]?.archived);
  const best = (u) => progress[u.id]?.best ?? 0;
  return {
    subject,
    units: units.length,
    stars: units.reduce((n, u) => n + best(u), 0),
    mastered: units.filter((u) => best(u) === 3).length,
    next: nextUnit(subject, progress),
    last: units.map((u) => progress[u.id]?.last).filter(Boolean).sort().at(-1) ?? null,
    due: ov.due?.[subject.id] ?? 0,
    review: ov.review[subject.id] ?? 0,
    known: ov.known?.bySubject[subject.id] ?? 0,
  };
}

/** Kachel eines Fachs auf der Übersicht – antippen öffnet den Netzplan. */
function subjectCard(id, st, ov) {
  const { subject } = st;
  const max = st.units * 3;
  const chip = (cls, text, sr) => h(`span.chip.${cls}`, text, h('span.sr-only', sr));
  return h('a.subject-card', { href: `#/kid/${id}/s/${subject.id}`, style: { '--line': subject.lines[0]?.color ?? 'var(--focus)' } },
    h('span.sc-icon', { 'aria-hidden': 'true' }, subject.icon),
    h('span.sc-body',
      h('span.sc-head',
        h('strong.sc-name', subject.name),
        st.due ? chip('due', `🔁 ${st.due}`, ' zum Wiederholen') : null,
        st.review ? chip('review', `🔧 ${st.review}`, ' im Fehler-Training') : null,
        !ov.child.adult && ov.boost?.subject === subject.id ? chip('boost', '🎉 ×2', ' Sterne') : null),
      h('span.meter', { role: 'img', 'aria-label': `${st.stars} von ${max} Sternen` },
        h('span', { style: { width: `${max ? (st.stars / max) * 100 : 0}%` } })),
      h('span.sc-meta', `★ ${st.stars} von ${max}`, st.known ? ` · 🧠 ${st.known} sitzen` : '',
        st.last ? ` · zuletzt ${ago(st.last)}` : ` · noch nicht ${W.say.done}`),
      h('span.sc-next', st.next
        ? [`${W.say.next}: `, h('strong', `${st.next.icon} ${st.next.title}`)]
        : st.mastered === st.units ? '🏆 Alles gemeistert!' : `✔ Für heute alles ${W.say.done}`)),
    h('span.sc-go', { 'aria-hidden': 'true' }, '›'));
}

/** Die letzten Stationen über alle Fächer – zum schnellen Wiederfinden. */
function recentRides(id, meta, ov) {
  const rides = meta.subjects
    .flatMap((s) => s.units.map((u) => ({ s, u, p: ov.progress[s.id]?.[u.id] })))
    .filter(({ p }) => p?.last && !p.archived)
    .sort((a, b) => b.p.last.localeCompare(a.p.last))
    .slice(0, 4);
  if (!rides.length) return null;
  return h('section.panel.recent',
    h('h2', `🕘 Zuletzt ${W.say.done}`),
    h('ul.recent-list', rides.map(({ s, u, p }) =>
      h('li', h('a', { href: `#/kid/${id}/station/${s.id}/${u.id}`, style: { '--line': lineOf(s, u.line).color } },
        h('span.r-icon', { 'aria-hidden': 'true' }, u.icon),
        h('span.r-text', h('strong', u.title), h('span.muted.small', `${s.icon} ${s.name} · ${ago(p.last)}`)),
        starRow(p.best))))));
}

/** „heute“, „gestern“, „vor 3 Tagen“ … */
function ago(iso) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(new Date()) - day(new Date(iso))) / 864e5);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 14) return `vor ${days} Tagen`;
  if (days < 60) return `vor ${Math.round(days / 7)} Wochen`;
  return `am ${new Date(iso).toLocaleDateString('de-DE')}`;
}

// ================================================================ Fach: Übungen und Netzplan

async function subjectView(id, subjectId) {
  const [meta, ov] = await Promise.all([loadMeta(), kidOverview(id)]);
  prefs.lastChild = Number(id);
  const subject = meta.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    location.hash = `#/kid/${id}`;
    return;
  }
  const progress = ov.progress[subject.id] ?? {};
  const hash = `#/kid/${id}/s/${subject.id}`;
  const st = subjectStats(subject, ov);
  const retireAfter = ov.settings.retireAfter;

  const head = h('div', { style: { '--line': subject.lines[0]?.color ?? 'var(--focus)' } },
    h('a.back', { href: `#/kid/${id}` }, '← Alle Fächer'),
    h('header.sign.subject-sign',
      h('span.icon', { 'aria-hidden': 'true' }, subject.icon),
      h('div',
        h('h1', subject.name),
        h('p', `${st.mastered} von ${st.units} ${W.station.p} gemeistert · ★ ${st.stars} von ${st.units * 3}${st.known ? ` · 🧠 ${st.known} sitzen` : ''}`))));

  // Extra-Training als Kacheln nebeneinander: Wiederholen (Gelerntes, das nach ein paar Tagen Pause wieder dran ist),
  // Fehler-Training und die Blitzrunden.
  const ride = (mode, lineColor) => (e) => {
    e.currentTarget.disabled = true;
    startRide({ childId: Number(id), subject: subject.id, mode, lineColor, backHash: hash, train: ov.train });
  };
  const tile = (tag, icon, title, sub, attrs) => h(tag, attrs,
    h('span.b-icon', { 'aria-hidden': 'true' }, icon),
    h('span.b-text', h('strong', title), h('span.muted.small', sub)),
    h('span.b-go', { 'aria-hidden': 'true' }, '▶'));
  const tiles = [
    st.due
      ? tile('button.blitz-tile.due', '🔁', 'Wiederholen',
          st.due === 1 ? 'Eine Aufgabe ist heute wieder dran' : `${st.due} Aufgaben sind heute wieder dran`,
          { type: 'button', onclick: ride('due', '#0B7A75') })
      : null,
    st.review
      ? tile('button.blitz-tile.review', '🔧', 'Fehler-Training',
          st.review === 1 ? 'Eine Aufgabe ist noch wackelig' : `${st.review} Aufgaben sind noch wackelig`,
          { type: 'button', onclick: ride('review', '#D7263D') })
      : null,
    ...(subject.blitz ?? []).map((t) => {
      const best = ov.blitz[`${subject.id}/${t.id}`];
      return tile('a.blitz-tile', t.icon, t.title, best ? `Dein Rekord: ⚡ ${best}` : '60 Sekunden – wie viele schaffst du?',
        { href: `#/kid/${id}/blitz/${subject.id}/${t.id}` });
    }),
  ].filter(Boolean);
  const training = tiles.length ? h('section.blitz-row', tiles) : null;

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
                  h('span.st-name', `${W.icons.terminus} ${W.terminus.s}`),
                  h('span.st-sub', exam.passed ? `Bestanden (bestes Ergebnis ${exam.best} %) – ${W.say.again.toLowerCase()}?` : `Alle ${W.station.p} ${W.line.der('gen')} gemischt.`),
                  exam.passed ? null : h('span.st-flag', 'Jetzt offen')),
                h('span.term-icon', { 'aria-hidden': 'true' }, exam.passed ? '🏆' : '🎯'))
            : h('span.term-locked',
                h('span.stop', { 'aria-hidden': 'true' }),
                h('span.st-text',
                  h('span.st-name', `🔒 ${W.terminus.s}`),
                  h('span.st-sub', `Öffnet, wenn alle ${W.station.p} mindestens 2 Sterne haben.`))))
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
            u === next ? h('span.st-flag', W.say.next) : null,
            p?.parked ? h('span.st-flag.parked', `${W.icons.parked} ${W.say.parkedFlag}`) : null,
            p?.retired && !p.parked ? h('span.st-flag.back', `🔄 Noch ${p.extraRides}× mit Sternen`) : null,
            !ov.child.adult && retireAfter > 0 && p?.perfect > 0 && !p.retired
              ? h('span.loot-tag', { title: `An ${p.perfect} von ${retireAfter} Tagen 3 Sterne – dann gibt es eine Lootbox` }, `🎁 ${p.perfect}/${retireAfter}`)
              : null,
            boosted ? h('span.boost-tag', '🎉 ×2 Sterne') : null),
          starRow(p?.best ?? 0)));
    }), terminus].filter(Boolean));
    return h('div.line-col', { style: { '--line': line.color } },
      h('.line-head', h('span.line-pill', W.lineName(line)),
        ov.boost?.subject === subject.id && ov.boost.line === line.id ? h('span.boost-tag', '🎉 ×2 Sterne') : null,
        h('span.count', `${doneCount} / ${units.length} gemeistert`)),
      list);
  }));

  render(
    kidBar(ov),
    head,
    ov.child.adult ? null : boostBanner(id, meta, ov.boost, subject.id),
    continueCard(id, subject, progress),
    training,
    h('h2.section-title', `${W.icons.map} ${W.map.s}`),
    map);
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
    name.textContent = folded ? `✔ ${n} geschaffte ${W.station.p}` : `✔ Geschaffte ${W.station.p} ausblenden`;
    sub.textContent = folded ? 'Antippen, um sie zu zeigen' : 'Sie bleiben in deinem Album';
    if (remember) prefs.setFolded(key, folded);
  };
  set(list.classList.contains('folded'), false);
  return h('li.station.fold', btn);
}

/**
 * Die erste Station eines Fachs, auf der es heute noch volle Sterne gibt –
 * am liebsten eine, die noch nicht sitzt.
 */
function nextUnit(subject, progress) {
  const units = subject.lines.flatMap((l) => subject.units.filter((u) => u.line === l.id));
  const open = units.filter((u) => {
    const p = progress[u.id];
    return !p?.archived && !p?.parked && !p?.today;
  });
  const best = (u) => progress[u.id]?.best ?? 0;
  return open.find((x) => best(x) < 2) ?? open.find((x) => best(x) < 3) ?? open[0] ?? null;
}

/** Großer „Weiter geht’s“-Knopf auf der Übersicht und über dem Netzplan. */
function continueCard(id, subject, progress) {
  const u = nextUnit(subject, progress);
  if (!u) return null;
  const line = lineOf(subject, u.line);
  return h('a.continue', { href: `#/kid/${id}/station/${subject.id}/${u.id}`, style: { '--line': line.color } },
    h('span.c-icon', { 'aria-hidden': 'true' }, u.icon),
    h('span.c-text',
      h('span.c-label', 'Weiter geht’s'),
      h('strong.c-title', u.title),
      h('span.c-sub', `${subject.icon} ${subject.name} · ${W.lineName(line)}`)),
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
  if (boost.unit) return `${W.station.on} „${sub.units.find((u) => u.id === boost.unit)?.title ?? boost.unit}“`;
  if (boost.line) {
    const line = sub.lines.find((l) => l.id === boost.line);
    return `${W.line.on} „${line ? W.lineName(line) : boost.line}“`;
  }
  return `in ${sub.name}`;
}

/** Banner fürs laufende Event – mit Link dorthin, wenn es nur für einen Teil gilt. */
function boostBanner(id, meta, boost, currentSubject) {
  if (!boost) return null;
  const where = boostWhere(meta, boost);
  const time = new Date(boost.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const text = boost.once
    ? `🎉 ${cap(W.ride.dein('nom', 'nächst'))}${where ? ` ${where}` : ''} bringt doppelte Sterne!`
    : `🎉 Doppelte Sterne${where ? ` ${where}` : ''}! ${cap(W.ride.jed())}${where ? ' dort' : ''}, ${W.ride.art('der', 'acc')} du bis ${time} Uhr startest, bringt doppelt so viele Sterne.`;
  const href = boost.unit ? `#/kid/${id}/station/${boost.subject}/${boost.unit}`
    : boost.subject && boost.subject !== currentSubject ? `#/kid/${id}/s/${boost.subject}` : null;
  return h('p.boost-note', text, href ? [' ', h('a', { href }, `${W.say.goThere} →`)] : null);
}

// ================================================================ Aufgaben-Werkstatt

/** Karte auf der Startseite: Hier stellt das Kind die Fragen, die anderen rechnen. */
function werkstattCard(id, ov) {
  const w = ov.werkstatt ?? { open: 0, solved: 0, mine: 0 };
  const text = ov.child.adult
    ? w.open ? `${w.open === 1 ? 'Eine Aufgabe wartet' : `${w.open} Aufgaben warten`} auf dich.` : 'Hier landen die Aufgaben, die dir gestellt werden.'
    : w.open
      ? `Hier stellst du die Fragen. Und ${w.open === 1 ? 'eine Aufgabe wartet' : `${w.open} Aufgaben warten`} auf dich.`
      : w.solved ? `Hier stellst du die Fragen. ${w.solved === 1 ? 'Eine Antwort ist schon da – stimmt sie?' : `${w.solved} Antworten sind schon da – stimmen sie?`}`
        : 'Hier stellst du die Fragen – und die Großen müssen rechnen.';
  return h('a.werkstatt-card', { href: `#/kid/${id}/werkstatt` },
    h('span.w-icon', { 'aria-hidden': 'true' }, '✏️'),
    h('p', h('strong', 'Aufgaben-Werkstatt: '), text),
    h('span.sc-go', { 'aria-hidden': 'true' }, '›'));
}

async function werkstattView(id) {
  const [ov, w] = await Promise.all([kidOverview(id), api(`/children/${id}/werkstatt`)]);
  const reload = () => werkstattView(id);
  const adult = !!ov.child.adult;

  // Eine neue Aufgabe stellen
  const text = h('textarea.type-in.w-text', {
    rows: 4, maxlength: 500, placeholder: 'Zum Beispiel: Steve hat 5 Kisten mit je 27 Diamanten. Wie viele Diamanten sind das?',
    'aria-label': 'Deine Aufgabe',
  });
  const answer = h('input.type-in.w-answer', {
    type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Lösung (geheim)', 'aria-label': 'Die richtige Lösung',
  });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/children/${id}/werkstatt`, { method: 'POST', body: { text: text.value, answer: answer.value } });
      toast('Aufgabe gestellt! Jetzt sind die anderen dran.');
      reload();
    } catch (err) {
      toast(err.message);
    }
  };
  const form = h('form.panel.w-form', { onsubmit: save },
    h('h2', adult ? '✏️ Selbst eine Aufgabe stellen' : '✏️ Eine Aufgabe stellen'),
    h('p.muted', adult
      ? 'Auch Erwachsene dürfen Aufgaben stellen.'
      : 'Du denkst dir eine Aufgabe aus – Mathe, Englisch oder was du willst. Die anderen lösen sie, und du siehst, ob sie richtig liegen.'),
    text, answer,
    h('button.btn.line.big', { type: 'submit' }, 'Aufgabe stellen'));

  // Aufgaben, die mir gestellt wurden
  const forMe = w.forMe.length
    ? h('section.panel',
        h('h2', '📬 Aufgaben für dich'),
        h('ul.w-list', w.forMe.map((p) => {
          const head = h('p.w-from', faceOf(p.author), ` ${p.author.name} fragt:`);
          const q = h('p.w-q', p.text);
          if (p.tried) {
            return h('li', { class: p.tried.correct ? 'ok' : 'bad' }, head, q,
              h('p.w-result', p.tried.correct ? `✔ Richtig: ${p.tried.given}` : `✘ Du hattest ${p.tried.given}, richtig ist ${p.tried.answer}.`));
          }
          const input = h('input.type-in', { type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Deine Antwort', 'aria-label': 'Deine Antwort' });
          const send = async (e) => {
            e.preventDefault();
            try {
              const r = await api(`/children/${id}/werkstatt/${p.id}/try`, { method: 'POST', body: { given: input.value } });
              toast(r.correct ? 'Richtig!' : `Leider nicht – richtig ist ${r.answer}.`);
              reload();
            } catch (err) {
              toast(err.message);
            }
          };
          return h('li', head, q, h('form.w-try', { onsubmit: send }, input, h('button.btn', { type: 'submit' }, 'Antworten')));
        })))
    : null;

  // Meine Aufgaben und wer sie wie gelöst hat
  const remove = async (p) => {
    if (!(await ask('Aufgabe löschen?', { text: p.text, ok: 'Löschen', cancel: 'Behalten', danger: true }))) return;
    try {
      await api(`/children/${id}/werkstatt/${p.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      toast(err.message);
    }
  };
  const mine = w.mine.length
    ? h('section.panel',
        h('h2', '🧾 Deine Aufgaben'),
        h('ul.w-list', w.mine.map((p) => h('li',
          h('p.w-q', p.text),
          h('p.w-answer', `Deine Lösung: ${p.answer}`),
          p.tries.length
            ? h('ul.w-tries', p.tries.map((t) => h('li', { class: t.correct ? 'ok' : 'bad' },
                faceOf(t.solver), ` ${t.solver.name}: ${t.given} ${t.correct ? '✔' : '✘'}`)))
            : h('p.muted', 'Noch hat niemand geantwortet.'),
          h('button.btn.ghost.small', { type: 'button', onclick: () => remove(p) }, 'Löschen')))))
    : null;

  render(kidBar(ov), h('a.back', { href: `#/kid/${id}` }, '← Zur Startseite'), forMe, form, mine);
}

// ================================================================ Station

async function stationView(id, subjectId, unitId) {
  const [meta, ov, unit, { next }] = await Promise.all([
    loadMeta(), kidOverview(id), api(`/subjects/${subjectId}/units/${unitId}`), api(`/children/${id}/next/${subjectId}/${unitId}`),
  ]);
  const subject = meta.subjects.find((s) => s.id === subjectId);
  const line = lineOf(subject, unit.line);
  const p = ov.progress[subjectId]?.[unitId];
  const mapHash = `#/kid/${id}/s/${subjectId}`;
  const n = ov.settings.questionsPerSession;
  const retireAfter = ov.settings.retireAfter;
  const sign = h('header.sign',
    h('span.icon', { 'aria-hidden': 'true' }, unit.icon),
    h('div', h('h1', unit.title), h('p', `${unit.subtitle} · ${W.lineName(line)}`)));

  if (p?.archived) {
    render(kidBar(ov), h('div', { style: { '--line': line.color } },
      h('a.back', { href: mapHash }, `← ${W.map.zu}`),
      sign,
      h('p.parked-note', `🚧 ${cap(W.station.dies())} ist gerade ${W.say.closed}.`)));
    return;
  }

  const nextHref = next ? `#/kid/${id}/station/${next.subject}/${next.unit}` : null;
  const otherSubject = next && next.subject !== subjectId ? ` (${next.subjectName})` : '';
  // Heute schon geschafft oder auf dem Abstellgleis: lieber weiter zum nächsten Halt
  const moveOn = nextHref && (p?.parked || (p?.today > 0 && p.best >= 2));
  const status = p?.parked
    ? h('p.parked-note', `${W.icons.parked} ${W.say.parkedFlag}: ${cap(W.station.dies('acc'))} hast du oft genug mit 3 Sternen geschafft. Hier gibt es keine Sterne mehr – üben darfst du trotzdem.`)
    : p?.retired
      ? h('p.parked-note.back', `🔄 Deine Eltern haben ${W.station.dies('acc')} zurückgeholt: ${p.extraRides === 1 ? `${cap(W.ride.der('nom', 'nächst'))} bringt` : `Die nächsten ${p.extraRides} ${W.ride.p} bringen`} wieder Sterne.`)
      : !ov.child.adult && retireAfter > 0
        ? h('p.loot-progress',
            `🎁 An ${p?.perfect ?? 0} von ${retireAfter} Tagen 3 Sterne. Schaffst du ${W.station.pronAcc} an ${retireAfter} verschiedenen Tagen, kommt ${W.station.der()} ${W.say.parkedTo}, und du bekommst eine Lootbox.`,
            p?.perfectToday ? ` Heute hat hier schon ${W.ride.ein()} gezählt – an einem anderen Tag zählt ${W.ride.art('der', 'nom')} nächste.` : '')
        : null;

  const page = h('div', { style: { '--line': line.color } },
    h('a.back', { href: mapHash }, `← ${W.map.zu}`),
    sign,
    !ov.child.adult && !p?.parked && boostHere(ov.boost, subjectId, unit.line, unitId)
      ? h('p.boost-note', ov.boost.once ? `🎉 ${cap(W.ride.dein('nom', 'nächst'))} hier bringt doppelte Sterne!` : '🎉 Hier gibt es gerade doppelte Sterne!')
      : null,
    h('.record',
      starRow(p?.best ?? 0),
      h('span', p?.runs ? `${p.runs}× ${W.say.done} · im Schnitt ${p.avg} % richtig` : 'Hier warst du noch nie – los geht’s!')),
    status,
    moveOn
      ? h('p.next-note',
          p.parked ? `Neue Sterne gibt es ${W.say.nextDat}: ` : `Hier warst du heute schon. ${cap(W.say.nextDat)} gibt es wieder volle Sterne: `,
          h('a', { href: nextHref }, `${next.icon} ${next.title}${otherSubject} →`))
      : null,
    unit.explain.length
      ? h('section.panel.merke', h('h2', '📌 Merke'), renderExplain(unit.explain, subject.speechLang))
      : null,
    unit.vocab.length
      ? h('section.panel',
          h('h2', `📖 Wörter ${W.station.dies('gen')} (${unit.vocab.length})`),
          h('ul.vocab-list', unit.vocab.map((v) =>
            h('li',
              subject.speechLang && canSpeak()
                ? h('button.say', { type: 'button', 'aria-label': `Vorlesen: ${v.en}`, onclick: () => speak(v.en, subject.speechLang) }, '🔊')
                : null,
              h('span.en', v.en),
              h('span.de', v.de)))))
      : null
  );

  // Das Kind bestimmt, wie lang die Fahrt wird. Kurze Fahrten bringen anteilig weniger Sterne.
  // Kleine Stationen ohne Wörter haben eine kürzere ganze Fahrt (rideCap, z. B. die Kontinente: 7) – der Knopf für die
  // ganze Fahrt zeigt dann diese Zahl.
  const most = unit.rideCap ? Math.min(n, unit.rideCap) : n;
  const rideLabel = () => (moveOn ? '🔁 Nochmal' : `${W.icons.ride} ${W.say.start} · ${Math.min(prefs.rideLength ?? n, most)} Aufgaben`);
  const lengths = [...new Set([3, 5, n])].filter((x) => x === n || x < most);
  const lenNote = h('span.len-note');
  const lenPick = h('.ride-length', { role: 'radiogroup', 'aria-label': `Wie lang soll ${W.ride.der()} sein?` },
    h('span.len-label', 'Wie lang?'),
    lengths.map((x) => h('button', {
      type: 'button', role: 'radio', 'data-len': x,
      onclick: () => { prefs.rideLength = x === n ? null : x; syncLength(); },
    }, String(x === n ? most : x))),
    lenNote);
  const syncLength = () => {
    const cur = prefs.rideLength ?? n;
    lenPick.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.len) === cur)));
    lenNote.textContent = Math.min(cur, most) < most ? 'weniger ★' : 'volle ★';
    ride.textContent = rideLabel();
  };
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
  }, rideLabel());
  syncLength();
  const dock = h('.dock', { style: { '--line': line.color } },
    p?.parked || ov.child.adult ? null : lenPick,
    h('.dock-inner',
      moveOn ? h('a.btn.line.big', { href: nextHref }, `${W.icons.next} ${W.say.next} →`) : null,
      ride));

  render(kidBar(ov), page);
  document.body.append(dock);
}

// ================================================================ Sammlung: Rang & Züge, Album, Stempelheft, Abzeichen

const collectionTabs = (ov) => [
  ['rang', `${W.icons.tab} Rang & ${W.item.p}`],
  ['album', '🃏 Album'],
  ['avatar', '🐱 Companion'],
  ['stempel', '🔖 Stempel'],
  ['abzeichen', '🏅 Abzeichen'],
  // Haben die Eltern das Thema festgelegt, gibt es hier nichts zu wählen.
  ...(ov.child.theme_locked ? [] : [['thema', '🎨 Thema']]),
];

async function collectionView(id, tab) {
  const [meta, ov] = await Promise.all([loadMeta(), kidOverview(id)]);
  const tabs = collectionTabs(ov);
  if (!tabs.some(([t]) => t === tab)) tab = 'rang';
  const nav = h('nav.subject-tabs', { 'aria-label': 'Sammlung' }, tabs.map(([t, label]) =>
    h('a', { href: `#/kid/${id}/sammlung/${t}`, 'aria-current': t === tab ? 'page' : null }, label)));
  const body = { rang: rankPanel, album: albumPanel, avatar: avatarPanel, stempel: stampPanel, abzeichen: badgePanel, thema: themePanel }[tab](id, meta, ov);
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
        h('p.muted', `Diese Katze begleitet dich bei ${W.ride.jed('dat')} und freut sich mit dir über richtige Antworten.`),
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
      h('p.muted', `Skins findest du, wenn du ${W.terminus.ein('acc')} zum ersten Mal schaffst. Manche gibt es nur als Geschenk.`),
      h('.trains', [
        pick('Ohne Skin', avatarSvg(base), () => change({ skin: '' }), !ov.child.skin, false, !ov.child.skin ? 'Getragen' : 'Ausziehen'),
        ...skins.map((s) => {
          const has = owned.includes(s.id);
          const current = ov.child.skin === s.id;
          return pick(has ? s.name : '???', avatarSvg(base, s.id), () => change({ skin: s.id }), current, !has,
            current ? 'Getragen' : has ? 'Anziehen' : s.pool === 'line' ? `${W.terminus.s} schaffen` : 'Besonderer Anlass');
        }),
      ])),
  ];
}

function rankPanel(id, meta, ov) {
  const pick = async (level, train) => {
    try {
      await api(`/children/${id}/train`, { method: 'POST', body: { level } });
      sfx.right();
      toast(`${train} ist jetzt ${W.item.dein()}!`);
      collectionView(id, 'rang');
    } catch (err) {
      toast(err.message);
    }
  };
  return [
    h('section.panel',
      h('h2', `⭐ Dein Rang (${ov.rank.level} von ${ov.ranks.length})`),
      rankMeter(ov.rank),
      h('p.muted.small', `XP gibt es für jede richtige Antwort (10 XP), für jeden ${W.plan.s}-Stempel (50 XP) und für ${W.terminus.jed('acc')} (100 XP).`)),
    h('section.panel',
      h('h2', `${W.icons.next} ${cap(W.item.dein())}`),
      h('p.muted', `Mit ${W.item.dies('dat')} ${W.say.through}. Jeder neue Rang schaltet ${W.item.ein('acc', 'neu')} frei.`),
      h('.trains', ov.ranks.map((r, i) => {
        const unlocked = ov.trains.includes(r.train);
        const current = ov.train === r.train;
        return h('button.train-pick', {
          type: 'button',
          class: [unlocked ? '' : 'locked', current ? 'current' : ''].filter(Boolean).join(' '),
          disabled: !unlocked || current,
          'aria-pressed': String(current),
          onclick: () => pick(i + 1, r.train),
        },
          h('span.t-emoji', { 'aria-hidden': 'true' }, unlocked ? r.train : '🔒'),
          h('span.t-name', r.name),
          h('span.t-sub', current ? cap(W.item.dein()) : unlocked ? 'Auswählen' : `ab ${r.min} XP`));
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
          hint: `Besteh die ${W.say.exam} ${W.line.dies('gen')}, dann bekommst du die Goldkarte.`,
        });
        return h('div.album-line', { style: { '--line': line.color } },
          h('h3.line-pill', W.lineName(line)),
          h('.album', gold, cards));
      }),
      formerGold(subject, ov.lines[subject.id] ?? {}, () => { owned++; total++; }));
  });
  return [
    h('section.panel',
      h('h2', `🃏 Sammelalbum – ${owned} von ${total} Karten`),
      h('p.muted', `Für ${W.station.jed('acc')}, ${W.station.art('der', 'acc')} du mit 3 Sternen schaffst, bekommst du eine Karte. Für ${W.terminus.jed('acc')} gibt es eine Goldkarte.`),
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
    h('h3.line-pill', `Frühere ${W.line.p}`),
    h('.album', passed.map((line) => albumCard({ ...lineCard(subject, line), owned: true, gold: true }))));
}

/** Kleine Karte im Album; antippen zeigt sie groß. */
function themePanel(id, meta, ov) {
  const pick = async (theme) => {
    try {
      await api(`/children/${id}/theme`, { method: 'POST', body: { theme } });
      sfx.right();
      collectionView(id, 'thema');
    } catch (err) {
      toast(err.message);
    }
  };
  return h('section.panel',
    h('h2', '🎨 Wie soll deine Lernwelt aussehen?'),
    h('p.muted', 'Du kannst jederzeit wechseln. Deine Sterne und alles, was du gesammelt hast, bleiben.'),
    h('.trains', Object.values(THEMES).map((t) =>
      h('button.train-pick', {
        type: 'button', class: t.id === W.id ? 'current' : '', disabled: t.id === W.id, 'aria-pressed': String(t.id === W.id),
        onclick: () => pick(t.id),
      },
        h('span.t-emoji', { 'aria-hidden': 'true' }, t.icon),
        h('span.t-name', t.name),
        h('span.t-sub', t.id === W.id ? 'Gerade an' : t.desc)))));
}

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
      h('p.muted', 'An Tagen, an denen du alle drei Ideen geschafft hast, gibt es einen Stempel.'),
      h('.stamp-grid',
        ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => h('span.sg-head', d)),
        days.map((d) => h('span.sg-day', { class: [stamped.has(d.iso) ? 'stamped' : '', d.future ? 'future' : '', d.today ? 'today' : ''].filter(Boolean).join(' ') },
          stamped.has(d.iso) ? h('span.sg-stamp', { 'aria-label': `${d.day}.: Stempel` }, '✔') : h('span', d.day))))),
    planCard(id, ov.plan, meta),
    h('section.panel',
      h('h2', `📅 Deine Wochenkarte – ${ov.week.count} von 7 Tagen`),
      weekStrip(ov.week, { big: true }),
      h('p', `Ein Tag kommt auf deine Wochenkarte, wenn du an ihm mindestens ${ov.week.minStars} ★ mit ${W.ride.pDat} verdienst (Boni zählen nicht mit). Die Tage müssen nicht hintereinander sein. Für jeden Tag gibt es Bonuszeit:`),
      h('ul',
        h('li', '1. Tag der Woche: der Start'),
        h('li', '2. bis 4. Tag: je 5 Minuten'),
        h('li', `5. bis 7. Tag: je 10 Minuten – und am ${ov.week.lootboxDays}. Tag die Lootbox der Woche 🎁`)),
      h('p.muted', 'Lässt du einen Tag aus, geht nichts verloren. Jeden Montag fängt eine neue Wochenkarte an. Die Bonuszeit zählt nicht zum Tageslimit.')),
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
        h('.medal', { 'aria-hidden': 'true' }, W.badge(b).icon),
        h('.bname', W.badge(b).name),
        h('.bdesc', W.badge(b).desc),
        earned.has(b.id) ? h('.bdesc', `✓ ${new Date(earned.get(b.id)).toLocaleDateString('de-DE')}`) : null))),
  ];
}

// ================================================================ Blitzrunde

async function blitzView(id, subjectId, topicId) {
  const [meta, ov, rec] = await Promise.all([loadMeta(), kidOverview(id), api(`/children/${id}/blitz/${subjectId}/${topicId}`)]);
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
      h('a.back', { href: backHash }, `← ${W.map.zu}`),
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
  const ov = await kidOverview(id);
  const { closed, opened } = ov.lootboxes;
  const retireAfter = ov.settings.retireAfter;
  const how = retireAfter > 0
    ? `Eine Lootbox bekommst du, wenn du ${W.station.ein('acc')} an ${retireAfter} verschiedenen Tagen mit 3 Sternen schaffst (dann kommt ${W.station.Pron.toLowerCase()} ${W.say.parkedTo}), wenn du zum ersten Mal ${W.terminus.der('acc')} ${W.line.ein('gen')} bestehst und am 5. Tag einer Woche auf deiner Wochenkarte. Manchmal schenken dir auch deine Eltern eine.`
    : `Eine Lootbox bekommst du, wenn du zum ersten Mal ${W.terminus.der('acc')} ${W.line.ein('gen')} bestehst und am 5. Tag einer Woche auf deiner Wochenkarte. Manchmal schenken dir auch deine Eltern eine.`;
  render(
    kidBar(ov),
    h('section.panel',
      h('h2', '🎁 Deine Lootboxen'),
      h('p', 'In jeder Lootbox steckt Medienzeit, als Sterne auf dein Konto. Wie viel? Das verrät sie erst beim Öffnen: Sie dreht durch die Farben hoch – je weiter, desto seltener und desto mehr Minuten!'),
      rarityLegend(),
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
  const ov = await kidOverview(id);
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
