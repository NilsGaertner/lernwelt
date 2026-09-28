import { h, md, starRow, toast, prefs, speak, canSpeak } from './ui.js';
import { api } from './api.js';
import { runRide } from './player.js';
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
  [/^kid\/(\d+)\/badges$/, badgesView],
  [/^kid\/(\d+)\/tickets$/, ticketsView],
  [/^parent(?:\/(.*))?$/, (rest) => parentView(app, rest ?? '', { reloadMeta: () => loadMeta(true) })],
];

async function route() {
  window.speechSynthesis?.cancel();
  document.querySelectorAll('.sheet, .dock').forEach((el) => el.remove());
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
    ov.streak > 0 ? h('span.streak', { title: `${ov.streak} Tage am Stück geübt` }, '🔥 ', ov.streak) : null,
    h('a.fare', { href: `#/kid/${id}/tickets`, title: 'Deine Sterne – hier gegen Medienzeit eintauschen' },
      h('span.star', { 'aria-hidden': 'true' }, '★'), h('span.num', ov.balance), h('span.sr-only', ' Sterne')),
    h('a.icon-btn', { href: `#/kid/${id}/badges`, title: 'Abzeichen' }, '🏅'),
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
    if (b.table) {
      return h('.table-wrap', h('table',
        b.table.head ? h('thead', h('tr', b.table.head.map((c) => h('th', { html: md(c) })))) : null,
        h('tbody', b.table.rows.map((r) => h('tr', r.map((c) => h('td', { html: md(c) })))))));
    }
    return null;
  });
}

async function startRide({ childId, subject, unit, mode = 'unit', lineColor, backHash }) {
  let session;
  try {
    session = await api('/sessions', { method: 'POST', body: { childId, subject, unit, mode } });
  } catch (err) {
    toast(err.message);
    return;
  }
  document.querySelectorAll('.dock').forEach((el) => el.remove());
  runRide(app, session, {
    lineColor,
    onExit: () => {
      if (location.hash === backHash) route();
      else location.hash = backHash;
    },
    onAgain: () => startRide({ childId, subject, unit, mode, lineColor, backHash }),
  });
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
  const today = h('section.today',
    h('div',
      h('h2', limit > 0 ? `Heute verdient: ${ov.earnedToday} von ${limit} Sternen` : `Heute verdient: ${ov.earnedToday} Sterne`),
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
          onclick: () => startRide({ childId: Number(id), subject: subject.id, mode: 'review', lineColor: '#D7263D', backHash: hash }),
        }, 'Jetzt üben'))
    : null;

  const tabs = meta.subjects.length > 1
    ? h('nav.subject-tabs', { 'aria-label': 'Fächer' }, meta.subjects.map((s) =>
        h('a', { href: `#/kid/${id}/s/${s.id}`, 'aria-current': s.id === subject.id ? 'page' : null }, `${s.icon} ${s.name}`)))
    : null;

  const map = h('section.map', subject.lines.map((line) => {
    const units = subject.units.filter((u) => u.line === line.id);
    const next = units.find((u) => (progress[u.id]?.best ?? 0) < 2);
    const doneCount = units.filter((u) => (progress[u.id]?.best ?? 0) === 3).length;
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
      })));
  }));

  render(kidBar(ov), tabs, today, review, map);
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
          startRide({ childId: Number(id), subject: subjectId, unit: unitId, lineColor: line.color, backHash: location.hash });
        },
      }, `🚆 Losfahren · ${n} Aufgaben`)));

  render(kidBar(ov), page);
  document.body.append(dock);
}

// ================================================================ Abzeichen

async function badgesView(id) {
  const [meta, ov] = await Promise.all([loadMeta(), api(`/children/${id}/overview`)]);
  const earned = new Map(ov.badges.map((b) => [b.id, b.earned_at]));
  render(
    kidBar(ov),
    h('section.panel',
      h('h2', `🏅 Deine Abzeichen – ${earned.size} von ${meta.badges.length}`),
      h('p.muted', 'Für jedes neue Abzeichen bekommst du 3 Extra-Sterne.')),
    h('.badges', meta.badges.map((b) =>
      h('.badge', { class: earned.has(b.id) ? '' : 'locked' },
        h('.medal', { 'aria-hidden': 'true' }, b.icon),
        h('.bname', b.name),
        h('.bdesc', b.desc),
        earned.has(b.id) ? h('.bdesc', `✓ ${new Date(earned.get(b.id)).toLocaleDateString('de-DE')}`) : null)))
  );
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
      h('p.muted', `Ein Stern ist ${minutesPerStar} ${minutesPerStar === 1 ? 'Minute' : 'Minuten'} wert. Deine Eltern bestätigen das Ticket, dann geht’s los.`)),
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
