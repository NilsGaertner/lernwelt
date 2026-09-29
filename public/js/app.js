import { h, md, starRow, toast, prefs, speak, canSpeak, mapFigure, rankMeter, sfx } from './ui.js';
import { api } from './api.js';
import { runRide, collectCard } from './player.js';
import { runBlitz, runChart, familyBoard } from './blitz.js';
import { parentView } from './parent.js';

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
  [/^parent(?:\/(.*))?$/, (rest) => parentView(app, rest ?? '', { reloadMeta: () => loadMeta(true) })],
];

async function route() {
  window.speechSynthesis?.cancel();
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
      h('span.ring', { 'aria-hidden': 'true' }, ov.child.avatar),
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
    h('a.icon-btn.rank-btn', { href: `#/kid/${id}/sammlung`, title: `Deine Sammlung · ${ov.rank.name} (Rang ${ov.rank.level})` },
      ov.train, h('span.lvl', ov.rank.level)),
    soundToggle(),
    h('a.icon-btn', { href: '#/', title: 'Profil wechseln' }, '👥')
  );
}

function lineOf(subject, lineId) {
  return subject.lines.find((l) => l.id === lineId) ?? subject.lines[0];
}

export function renderExplain(blocks, speechLang) {
  const sayBtn = (text) =>
    speechLang && canSpeak()
      ? h('button.say', { type: 'button', title: 'Vorlesen', 'aria-label': `Vorlesen: ${text}`, onclick: () => speak(text.replace(/\s*\/.*$/, ''), speechLang) }, '🔊')
      : null;
  return blocks.map((b) => {
    if (b.p) return h('p', { html: md(b.p) });
    if (b.tip) return h('p.tip', { html: md(b.tip) });
    if (b.ex) {
      return h('ul.examples', b.ex.map(([en, de]) =>
        h('li', sayBtn(en.replace(/\*\*/g, '')) ?? h('span'), h('span.en', { html: md(en) }), h('span.de', de))));
    }
    if (b.map) return mapFigure(b.map, { legend: b.legend ?? [] });
    if (b.table) {
      return h('.table-wrap', h('table',
        b.table.head ? h('thead', h('tr', b.table.head.map((c) => h('th', { html: md(c) })))) : null,
        h('tbody', b.table.rows.map((r) => h('tr', r.map((c) => h('td', { html: md(c) })))))));
    }
    return null;
  });
}

async function startRide(opts) {
  const { childId, subject, unit, line, mode = 'unit', lineColor, backHash, train, card } = opts;
  let session;
  try {
    session = await api('/sessions', { method: 'POST', body: { childId, subject, unit, line, mode } });
  } catch (err) {
    toast(err.message);
    return;
  }
  document.querySelectorAll('.dock').forEach((el) => el.remove());
  runRide(app, session, {
    lineColor,
    train,
    card,
    onExit: () => {
      if (location.hash === backHash) route();
      else location.hash = backHash;
    },
    onAgain: () => startRide(opts),
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
  if (m.type === 'subject') return `#/kid/${id}/s/${m.subject}`;
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
          h('a.profile', { href: `#/kid/${c.id}` }, h('span.face', { 'aria-hidden': 'true' }, c.avatar), h('span.name', c.name))))
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
  const boostNote = ov.boost && !ov.child.adult
    ? h('p.boost-note', `🎉 Doppelte Sterne! Jede Fahrt, die du bis ${new Date(ov.boost.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr startest, bringt doppelt so viele Sterne.`)
    : null;
  const today = ov.child.adult ? null : h('section.today',
    h('div',
      h('h2', limit > 0 ? `Heute verdient: ${ov.earnedToday} von ${limit} Sternen` : `Heute verdient: ${ov.earnedToday} Sterne`),
      ov.specialLimit ? h('p.muted.small', '🎁 Heute gibt es ein Extra-Limit von deinen Eltern!') : null,
      limit > 0 ? h('.meter', { role: 'img', 'aria-label': `${ov.earnedToday} von ${limit}` },
        h('span', { style: { width: `${Math.min(100, (ov.earnedToday / limit) * 100)}%` } })) : null),
    h('a.btn.ghost', { href: `#/kid/${id}/tickets` }, '🎟️ Sterne eintauschen'));

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
        h('a', { href: `#/kid/${id}/s/${s.id}`, 'aria-current': s.id === subject.id ? 'page' : null }, `${s.icon} ${s.name}`)))
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
    const units = subject.units.filter((u) => u.line === line.id);
    const next = units.find((u) => (progress[u.id]?.best ?? 0) < 2);
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
    return h('div.line-col', { style: { '--line': line.color } },
      h('.line-head', h('span.line-pill', line.name), h('span.count', `${doneCount} / ${units.length} gemeistert`)),
      h('ol.stations', units.map((u) => {
        const p = progress[u.id];
        const cls = [p?.best === 3 ? 'mastered' : p ? 'visited' : '', u === next ? 'next' : ''].filter(Boolean).join(' ');
        return h('li.station', { class: cls },
          h('a', { href: `#/kid/${id}/station/${subject.id}/${u.id}` },
            h('span.stop', { 'aria-hidden': 'true' }),
            h('span.st-text',
              h('span.st-name', `${u.icon} ${u.title}`),
              h('span.st-sub', u.subtitle),
              u === next ? h('span.st-flag', 'Nächster Halt') : null),
            starRow(p?.best ?? 0)));
      }), terminus));
  }));

  render(kidBar(ov), shieldNote, boostNote, planCard(id, ov.plan, meta), tabs, today, review, blitz, map);
}

function addDaysIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ================================================================ Station

async function stationView(id, subjectId, unitId) {
  const [meta, ov, unit] = await Promise.all([loadMeta(), api(`/children/${id}/overview`), api(`/subjects/${subjectId}/units/${unitId}`)]);
  const subject = meta.subjects.find((s) => s.id === subjectId);
  const line = lineOf(subject, unit.line);
  const p = ov.progress[subjectId]?.[unitId];
  const backHash = `#/kid/${id}${meta.subjects[0]?.id === subjectId ? '' : `/s/${subjectId}`}`;
  const n = ov.settings.questionsPerSession;

  const page = h('div', { style: { '--line': line.color } },
    h('a.back', { href: backHash }, '← Zum Netzplan'),
    h('header.sign',
      h('span.icon', { 'aria-hidden': 'true' }, unit.icon),
      h('div', h('h1', unit.title), h('p', `${unit.subtitle} · ${line.name}`))),
    h('.record',
      starRow(p?.best ?? 0),
      h('span', p ? `${p.runs}× gefahren · im Schnitt ${p.avg} % richtig` : 'Hier warst du noch nie – los geht’s!')),
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

  const dock = h('.dock', { style: { '--line': line.color } },
    h('.dock-inner',
      h('button.btn.line.big', {
        type: 'button',
        onclick: (e) => {
          e.currentTarget.disabled = true;
          const u = subject.units.find((x) => x.id === unitId);
          startRide({
            childId: Number(id), subject: subjectId, unit: unitId, lineColor: line.color, backHash: location.hash,
            train: ov.train, card: u ? unitCard(subject, u, subject.units.indexOf(u) + 1) : null,
          });
        },
      }, `🚆 Losfahren · ${n} Aufgaben`)));

  render(kidBar(ov), page);
  document.body.append(dock);
}

// ================================================================ Sammlung: Rang & Züge, Album, Stempelheft, Abzeichen

const TABS = [
  ['rang', '🚂 Rang & Züge'],
  ['album', '🃏 Album'],
  ['stempel', '🔖 Stempel'],
  ['abzeichen', '🏅 Abzeichen'],
];

async function collectionView(id, tab) {
  const [meta, ov] = await Promise.all([loadMeta(), api(`/children/${id}/overview`)]);
  if (!TABS.some(([t]) => t === tab)) tab = 'rang';
  const nav = h('nav.subject-tabs', { 'aria-label': 'Sammlung' }, TABS.map(([t, label]) =>
    h('a', { href: `#/kid/${id}/sammlung/${t}`, 'aria-current': t === tab ? 'page' : null }, label)));
  const body = { rang: rankPanel, album: albumPanel, stempel: stampPanel, abzeichen: badgePanel }[tab](id, meta, ov);
  render(kidBar(ov), nav, ...[body].flat());
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
        const units = subject.units.filter((u) => u.line === line.id);
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
      }));
  });
  return [
    h('section.panel',
      h('h2', `🃏 Sammelalbum – ${owned} von ${total} Karten`),
      h('p.muted', 'Für jede Station, die du mit 3 Sternen schaffst, bekommst du eine Karte. Für jeden Endbahnhof gibt es eine Goldkarte.'),
      h('.meter', h('span', { style: { width: `${total ? (owned / total) * 100 : 0}%` } }))),
    ...sections,
  ];
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

// ================================================================ Fahrkarten (Medienzeit)

const STATUS = { pending: 'wartet auf OK', approved: 'genehmigt', rejected: 'abgelehnt', cancelled: 'zurückgegeben' };

async function ticketsView(id) {
  const ov = await api(`/children/${id}/overview`);
  const { minutesPerStar, ticketMinutes } = ov.settings;

  const buy = async (minutes, stars) => {
    if (!confirm(`${minutes} Minuten Medienzeit für ${stars} Sterne eintauschen?`)) return;
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
