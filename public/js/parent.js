import { h, toast, starRow, fmtDate, relDay } from './ui.js';
import { api, parentToken } from './api.js';

const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🐧', '🐨', '🦖', '🐱', '🐶', '🚀', '⚽', '🎮'];
const KIND = { session: 'Übung', bonus: 'Bonus', badge: 'Abzeichen', ticket: 'Ticket', refund: 'Rückgabe', manual: 'Eltern', system: 'Hinweis', lootbox: 'Lootbox' };

const papi = (path, opts = {}) => api(`/parent${path}`, { ...opts, parent: true });

export async function parentView(root, rest, { reloadMeta }) {
  const render = (...nodes) => { root.replaceChildren(...nodes.filter((n) => n != null && n !== false)); };
  if (!parentToken.get()) return loginView(root, rest, reloadMeta);
  try {
    const m = rest.match(/^child\/(\d+)$/);
    const log = rest.match(/^log(?:\/(\d+))?$/);
    if (m) await childView(root, Number(m[1]), render);
    else if (log) await logView(render, Number(log[1]) || null);
    else await dashboard(root, render, reloadMeta);
  } catch (err) {
    if (err.status === 401) return loginView(root, rest, reloadMeta);
    throw err;
  }
  window.scrollTo(0, 0);
}

function head(title, ...extra) {
  return h('header.parent-head',
    h('h1', title),
    h('.spacer'),
    ...extra,
    h('a.btn.ghost.small', { href: '#/' }, '← Zur Lernwelt'),
    h('button.btn.ghost.small', {
      type: 'button',
      onclick: async () => {
        await papi('/logout', { method: 'POST' }).catch(() => {});
        parentToken.set(null);
        location.hash = '#/';
      },
    }, 'Abmelden'));
}

// ================================================================ Anmeldung

function loginView(root, rest, reloadMeta) {
  const input = h('input.input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 8, 'aria-label': 'Eltern-PIN', placeholder: '••••' });
  const error = h('p.neg', { role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { token } = await api('/parent/login', { method: 'POST', body: { pin: input.value } });
      parentToken.set(token);
      parentView(root, rest, { reloadMeta });
    } catch (err) {
      error.textContent = err.message;
      input.select();
    }
  };
  root.replaceChildren(
    h('form.panel.pin-box', { onsubmit: submit },
      h('h1', { style: { fontSize: '1.5rem', marginBottom: '8px' } }, '🔒 Elternbereich'),
      h('p.muted', 'Bitte die Eltern-PIN eingeben.'),
      input,
      error,
      h('button.btn.block', { type: 'submit', style: { marginTop: '12px' } }, 'Anmelden'),
      h('p', h('a.muted.small', { href: '#/' }, 'Zurück zur Lernwelt'))));
  input.focus();
}

// ================================================================ Übersicht

async function dashboard(root, render, reloadMeta) {
  const data = await papi('/overview');
  const refresh = () => dashboard(root, render, reloadMeta);

  const decide = async (id, status) => {
    try {
      await papi(`/tickets/${id}`, { method: 'POST', body: { status } });
      toast(status === 'approved' ? 'Ticket genehmigt.' : 'Ticket abgelehnt, Sterne zurückgebucht.');
      refresh();
    } catch (err) { toast(err.message); }
  };

  const pending = data.pending.length
    ? h('section.panel',
        h('h2', `🎟️ Offene Tickets (${data.pending.length})`),
        h('ul.pending-list', data.pending.map((t) =>
          h('li',
            h('span', { style: { fontSize: '1.6rem' } }, t.avatar),
            h('.what', h('strong', `${t.child_name}: ${t.minutes} Minuten Medienzeit`), h('div.muted.small', `${t.stars} Sterne · ${relDay(t.created_at)}`)),
            h('button.btn.go.small', { type: 'button', onclick: () => decide(t.id, 'approved') }, 'Genehmigen'),
            h('button.btn.danger.small', { type: 'button', onclick: () => decide(t.id, 'rejected') }, 'Ablehnen')))))
    : null;

  const kids = data.children.length
    ? h('.kids', data.children.map((c) =>
        h('section.panel.kid-card',
          h('.who', h('span.face', c.avatar), h('div', h('h2', c.name), h('span.muted.small', `zuletzt aktiv: ${relDay(c.lastActive)}`))),
          h('.kpis',
            kpi(`${c.balance} ★`, 'Guthaben'),
            kpi(`${c.earnedToday} ★`, `heute verdient${data.todayLimit ? ` (max. ${data.todayLimit})` : ''}`),
            kpi(`${c.today.sessions}`, `Übungen heute · ${c.today.minutes} Min.`),
            kpi(c.today.accuracy == null ? '–' : `${c.today.accuracy} %`, 'richtig heute'),
            kpi(`${c.week.sessions}`, `Übungen in 7 Tagen · ${c.week.minutes} Min.`),
            kpi(`${c.streak}`, 'Tage am Stück'),
            kpi(`${c.rank.train} ${c.rank.level}`, c.rank.name),
            kpi(c.planDone ? '✔' : '–', 'Tagesfahrplan heute')),
          h('a.btn.small', { href: `#/parent/child/${c.id}` }, 'Details und Fortschritt →'))))
    : h('section.panel', h('p', 'Noch kein Kinderprofil angelegt. Lege unten eins an.'));

  // Neues Profil
  let avatar = AVATARS[0];
  const nameInput = h('input.input', { id: 'new-name', maxlength: 40, required: true, placeholder: 'z. B. Leon' });
  const adultBox = h('input', { type: 'checkbox' });
  const addForm = h('form.panel', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await papi('/children', { method: 'POST', body: { name: nameInput.value, avatar, adult: adultBox.checked } });
        toast('Profil angelegt.');
        refresh();
      } catch (err) { toast(err.message); }
    },
  },
    h('h2', '➕ Kinderprofil anlegen'),
    h('.field', h('label', { for: 'new-name' }, 'Name'), nameInput),
    h('.field', h('label', 'Bild'), avatarPicker(avatar, (a) => { avatar = a; })),
    h('.field', h('label.check', adultBox, ' Erwachsenen-Profil'),
      h('span.help', 'Zum Mitspielen und Herausfordern in der Blitzrunde. Sammelt keine Sterne und kann keine Medienzeit eintauschen.')),
    h('button.btn', { type: 'submit' }, 'Profil anlegen'));

  const s = data.settings;
  const f = (id, label, value, help, attrs = {}) =>
    h('.field', h('label', { for: id }, label), h('input.input', { id, name: id, value, ...attrs }), help ? h('span.help', help) : null);
  const settingsForm = h('form.panel', {
    onsubmit: async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        await papi('/settings', { method: 'PUT', body: Object.fromEntries(fd) });
        toast('Einstellungen gespeichert.');
        refresh();
      } catch (err) { toast(err.message); }
    },
  },
    h('h2', '⚙️ Regeln für Sterne und Medienzeit'),
    h('.form-grid',
      f('minutesPerStar', 'Minuten Medienzeit pro Stern', s.minutesPerStar, 'Die erste Fahrt einer Station am Tag bringt bis zu 6 Sterne, die zweite bis zu 3, jede weitere 1. Dazu kommen Boni.', { type: 'number', min: 0.5, max: 60, step: 0.5 }),
      f('dailyStarLimit', 'Maximale Sterne pro Tag', s.dailyStarLimit, '0 = unbegrenzt. Üben geht auch danach, nur ohne Sterne.', { type: 'number', min: 0, max: 2000 }),
      f('questionsPerSession', 'Aufgaben pro Übung', s.questionsPerSession, 'Empfohlen: 8–12.', { type: 'number', min: 5, max: 30 }),
      f('retireAfter', 'Abstellgleis nach … Fahrten mit 3 Sternen', s.retireAfter, 'Danach bringt die Station keine Sterne mehr, dafür gibt es einmal eine Lootbox. 0 = nie.', { type: 'number', min: 0, max: 50 }),
      f('ticketMinutes', 'Ticket-Größen in Minuten', s.ticketMinutes.join(', '), 'Mit Komma getrennt, z. B. 15, 30, 60.')),
    h('button.btn', { type: 'submit' }, 'Speichern'));

  const pinForm = h('form.panel', {
    onsubmit: async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        await papi('/pin', { method: 'PUT', body: Object.fromEntries(fd) });
        toast('PIN geändert.');
        refresh();
      } catch (err) { toast(err.message); }
    },
  },
    h('h2', '🔑 Eltern-PIN ändern'),
    h('.form-grid',
      f('current', 'Aktuelle PIN', '', null, { type: 'password', inputmode: 'numeric', autocomplete: 'current-password' }),
      f('next', 'Neue PIN (4–8 Ziffern)', '', null, { type: 'password', inputmode: 'numeric', autocomplete: 'new-password', pattern: '\\d{4,8}' })),
    h('button.btn', { type: 'submit' }, 'PIN ändern'));

  const contentPanel = h('section.panel',
    h('h2', '📚 Lerninhalte'),
    h('p.muted', 'Nach Änderungen an den Dateien im Ordner „content“ hier neu einlesen – ohne Neustart.'),
    h('button.btn.ghost', {
      type: 'button',
      onclick: async () => {
        try {
          const r = await papi('/reload-content', { method: 'POST' });
          await reloadMeta();
          toast(r.problems.length ? `Eingelesen, aber ${r.problems.length} Problem(e) – siehe Server-Log.` : 'Inhalte neu eingelesen.');
        } catch (err) { toast(err.message); }
      },
    }, 'Inhalte neu einlesen'));

  render(
    head('Elternbereich'),
    data.pinIsDefault ? h('p.alert', '⚠️ Die Eltern-PIN ist noch „1234“. Bitte unten eine eigene PIN festlegen.') : null,
    pending,
    kids,
    h('section.panel',
      h('h2', '📖 Letzte Fahrten'),
      data.recent.length ? logTable(data.recent, { showChild: true }) : h('p.muted', 'Noch keine Fahrten.'),
      h('a.btn.ghost.small', { href: '#/parent/log' }, 'Ganzes Fahrtenbuch →')),
    boostPanel(data, refresh),
    dayLimitPanel(data, refresh),
    settingsForm,
    addForm,
    pinForm,
    contentPanel
  );
}

// ================================================================ Fahrtenbuch

const PERIODS = [[1, 'Heute'], [7, 'Letzte 7 Tage'], [30, 'Letzte 30 Tage'], [0, 'Alles']];

function dayLabel(day) {
  const d = new Date();
  const today = localIso(d);
  d.setDate(d.getDate() - 1);
  if (day === today) return `Heute · ${weekday(day)}`;
  if (day === localIso(d)) return `Gestern · ${weekday(day)}`;
  return weekday(day);
}

/** Tabelle der Fahrten, nach Tagen gruppiert. */
function logTable(entries, { showChild }) {
  const cols = showChild ? 7 : 6;
  const rows = [];
  let lastDay = null;
  for (const e of entries) {
    if (e.day !== lastDay) {
      rows.push(h('tr.log-day', h('th', { colspan: cols, scope: 'rowgroup' }, dayLabel(e.day))));
      lastDay = e.day;
    }
    const blitz = e.mode === 'blitz';
    rows.push(h('tr',
      h('td', clock(e.finishedAt)),
      showChild ? h('td', `${e.avatar} ${e.childName}`) : null,
      h('td',
        h('strong', e.title),
        h('div.muted.small', [e.subject, e.line ? `Linie ${e.line}` : null].filter(Boolean).join(' · ')),
        e.runToday > 1 && !blitz ? h('span.log-tag', `${e.runToday}. Fahrt heute`) : null,
        e.boosted ? h('span.log-tag.boost', '🎉 ×2') : null,
        e.parked ? h('span.log-tag', '🅿️ Abstellgleis') : null),
      h('td', blitz
        ? `⚡ ${e.correct} Treffer`
        : [h(`span.${e.percent >= 90 ? 'pos' : e.percent < 70 ? 'neg' : 'mid'}`, `${e.percent} %`), h('div.muted.small', `${e.correct} von ${e.total}`)]),
      h('td', blitz ? '–' : starRow(e.rating)),
      h('td', e.stars ? `+${e.stars} ★` : '–'),
      h('td', `${e.minutes} Min.`)));
  }
  return h('.table-wrap', h('table.data.log',
    h('thead', h('tr',
      h('th', 'Uhrzeit'), showChild ? h('th', 'Kind') : null, h('th', 'Fahrt'), h('th', 'Richtig'),
      h('th', 'Bewertung'), h('th', 'Sterne'), h('th', 'Dauer'))),
    h('tbody', rows)));
}

async function logView(render, childId) {
  let days = 7;
  let child = childId;
  let entries = [];
  const body = h('div');
  const moreBtn = h('button.btn.ghost', { type: 'button', hidden: true, onclick: () => load(true) }, 'Weitere laden');
  const childSel = h('select.input', { id: 'log-child', onchange: () => { child = Number(childSel.value) || null; load(); } });
  const periodSel = h('select.input', { id: 'log-days', onchange: () => { days = Number(periodSel.value); load(); } },
    PERIODS.map(([v, l]) => h('option', { value: v, selected: v === days }, l)));

  async function load(append = false) {
    const q = new URLSearchParams({ days, limit: 50 });
    if (child) q.set('child', child);
    if (append && entries.length) q.set('before', entries[entries.length - 1].finishedAt);
    try {
      const r = await papi(`/log?${q}`);
      entries = append ? entries.concat(r.entries) : r.entries;
      moreBtn.hidden = !r.more;
      body.replaceChildren(entries.length
        ? logTable(entries, { showChild: !child })
        : h('p.muted', 'In diesem Zeitraum gab es keine Fahrten.'));
      if (!childSel.options.length) {
        childSel.append(h('option', { value: '' }, 'Alle Kinder'),
          ...r.children.map((c) => h('option', { value: c.id, selected: c.id === child }, `${c.avatar} ${c.name}`)));
      }
    } catch (err) { toast(err.message); }
  }

  render(
    head('📖 Fahrtenbuch', h('a.btn.ghost.small', { href: '#/parent' }, '← Übersicht')),
    h('section.panel',
      h('.row-actions',
        h('.field', h('label', { for: 'log-child' }, 'Kind'), childSel),
        h('.field', h('label', { for: 'log-days' }, 'Zeitraum'), periodSel)),
      body,
      moreBtn));
  await load();
}

// ================================================================ Extra-Sterne: Event und Sonder-Limits

const clock = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
const limitText = (n) => (n > 0 ? `${n} Sterne` : 'unbegrenzt');

function boostPanel(data, refresh) {
  const call = async (method, body) => {
    try {
      await papi('/boost', { method, body });
      toast(method === 'POST' ? 'Doppelte Sterne gestartet!' : 'Event beendet.');
      refresh();
    } catch (err) { toast(err.message); }
  };
  const limitNote = h('span.help', `Das Tageslimit gilt weiterhin (heute: ${limitText(data.todayLimit)}). Heb es unten für heute an, wenn die doppelten Sterne nicht daran scheitern sollen.`);
  const b = data.boost;
  if (b) {
    const where = b.label ? ` für ${b.label}` : '';
    return h('section.panel.boost-panel.on',
      h('h2', '🎉 Doppelte Sterne laufen'),
      h('p', b.once
        ? `Die nächste Fahrt${where} bringt doppelte Sterne (gilt bis heute Abend).`
        : `Jede Fahrt${where}, die bis ${clock(b.until)} Uhr gestartet wird, bringt doppelte Sterne.`),
      limitNote,
      h('.row-actions', h('button.btn.danger.small', { type: 'button', onclick: () => call('DELETE') }, 'Event beenden')));
  }

  // Bereich: alles, ein Fach, eine Linie oder eine Station (Wert z. B. "english|grammar|" oder "english||w03")
  const scope = h('select.input', { id: 'boost-scope' },
    h('option', { value: '' }, 'Alle Fächer'),
    data.subjects.map((sub) =>
      h('optgroup', { label: `${sub.icon} ${sub.name}` },
        h('option', { value: `${sub.id}||` }, `${sub.name}: alles`),
        sub.lines.map((line) => {
          const units = sub.units.filter((u) => u.line === line.id);
          if (!units.length) return null;
          return [
            h('option', { value: `${sub.id}|${line.id}|` }, `Linie ${line.name}`),
            units.map((u) => h('option', { value: `${sub.id}||${u.id}` }, `   Station ${u.title}`)),
          ];
        }))));
  const duration = h('select.input', { id: 'boost-minutes' },
    [['once', 'Nur die nächste Fahrt'], [30, '30 Minuten'], [60, '1 Stunde'], [120, '2 Stunden'], [180, '3 Stunden']]
      .map(([v, l]) => h('option', { value: v, selected: v === 60 }, l)));
  const start = () => {
    const [subject, line, unit] = scope.value.split('|');
    const once = duration.value === 'once';
    call('POST', { subject: subject || null, line: line || null, unit: unit || null, once, minutes: once ? null : Number(duration.value) });
  };
  return h('section.panel.boost-panel',
    h('h2', '🎉 Doppelte Sterne'),
    h('p.muted', 'Starte ein Event: Fahrten, die dein Kind in dieser Zeit beginnt, bringen doppelte Sterne. Du kannst es auf ein Fach, eine Linie oder eine Station beschränken, um dein Kind gezielt dorthin zu locken. Die Kinder sehen das Event auf ihrem Netzplan.'),
    h('.row-actions',
      h('.field', h('label', { for: 'boost-scope' }, 'Wofür'), scope),
      h('.field', h('label', { for: 'boost-minutes' }, 'Wie lange'), duration),
      h('button.btn.go', { type: 'button', onclick: start }, 'Event starten')),
    limitNote);
}

function localIso(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Samstag und Sonntag dieses Wochenendes (ab heute). */
function weekendDays() {
  const d = new Date();
  const out = [];
  for (let i = 0; i < 7 && out.length < 2; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if (day.getDay() === 6 || day.getDay() === 0) out.push(localIso(day));
    else if (out.length) break;
  }
  return out;
}

function dayLimitPanel(data, refresh) {
  const today = localIso(new Date());
  const normal = data.settings.dailyStarLimit;
  const dateInput = h('input.input', { id: 'dl-day', type: 'date', min: today, value: today });
  const limitInput = h('input.input', { id: 'dl-limit', type: 'number', min: 0, max: 2000, value: normal ? normal * 2 : 0 });
  const save = async (days) => {
    try {
      for (const day of days) await papi(`/day-limits/${day}`, { method: 'PUT', body: { limit: Number(limitInput.value) } });
      toast(days.length === 1 ? 'Sonder-Limit gespeichert.' : 'Sonder-Limit fürs Wochenende gespeichert.');
      refresh();
    } catch (err) { toast(err.message); }
  };
  const remove = async (day) => {
    try {
      await papi(`/day-limits/${day}`, { method: 'DELETE' });
      toast('Sonder-Limit entfernt.');
      refresh();
    } catch (err) { toast(err.message); }
  };
  return h('section.panel',
    h('h2', '📅 Tageslimit für einzelne Tage'),
    h('p.muted', `Normalerweise gibt es höchstens ${limitText(normal)} pro Tag. Hier kannst du das Limit für bestimmte Tage ändern – höher, z. B. am Wochenende, oder niedriger. 0 = unbegrenzt. Das Limit begrenzt, wie viele Sterne dein Kind an dem Tag verdienen kann; gesparte Sterne kann es trotzdem eintauschen.`),
    h('form', {
      onsubmit: (e) => { e.preventDefault(); save([dateInput.value]); },
    },
      h('.form-grid',
        h('.field', h('label', { for: 'dl-day' }, 'Tag'), dateInput),
        h('.field', h('label', { for: 'dl-limit' }, 'Sterne an diesem Tag'), limitInput)),
      h('.row-actions',
        h('button.btn', { type: 'submit' }, 'Für diesen Tag festlegen'),
        h('button.btn.ghost', { type: 'button', onclick: () => save(weekendDays()) }, 'Für dieses Wochenende'))),
    data.dayLimits.length
      ? h('ul.pending-list', data.dayLimits.map((d) =>
          h('li',
            h('.what', h('strong', d.day === today ? `Heute (${weekday(d.day)})` : weekday(d.day)), h('div.muted.small', `Limit: ${limitText(d.limit)}`)),
            h('button.btn.danger.small', { type: 'button', onclick: () => remove(d.day) }, 'Entfernen'))))
      : null);
}

function kpi(v, l) {
  return h('.kpi', h('.v', v), h('.l', l));
}

function avatarPicker(current, onPick) {
  const wrap = h('.avatar-pick', { role: 'group', 'aria-label': 'Bild wählen' });
  for (const a of AVATARS) {
    const b = h('button', {
      type: 'button', 'aria-pressed': String(a === current), 'aria-label': a,
      onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(a);
      },
    }, a);
    wrap.append(b);
  }
  return wrap;
}

// ================================================================ Detailansicht Kind

async function childView(root, id, render) {
  const d = await papi(`/children/${id}`);
  const refresh = () => childView(root, id, render);

  // Aktivität: Übungsminuten pro Tag (eine Reihe, Details im Tooltip)
  const maxMin = Math.max(10, ...d.days.map((x) => x.minutes));
  const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2);
  const chart = h('section.panel',
    h('h2', '📈 Übungszeit der letzten 14 Tage (Minuten)'),
    h('.chart',
      h('.chart-bars', d.days.map((x) => {
        const label = `${fmtDate(x.day)}: ${x.minutes} Min., ${x.sessions} Übungen${x.accuracy == null ? '' : `, ${x.accuracy} % richtig`}, ${x.stars} ★`;
        return h('.chart-col', { tabindex: 0, 'aria-label': label },
          h('.chart-bar', { style: { height: `${(x.minutes / maxMin) * 100}%` } }),
          h('span.chart-tip', label));
      })),
      h('.chart-axis', d.days.map((x) => h('span', weekday(x.day))))),
    h('p.muted.small', `Höchster Wert: ${Math.max(...d.days.map((x) => x.minutes))} Min. · Summe: ${d.days.reduce((a, x) => a + x.minutes, 0)} Min. in ${d.days.reduce((a, x) => a + x.sessions, 0)} Übungen`));

  const weak = h('section.panel',
    h('h2', '🧩 Das fällt noch schwer'),
    d.weak.length
      ? h('ul.weak-list', d.weak.map((w) =>
          h('li', h('span.lbl', w.label), h('span.meta', `${w.unit} · `, h('span.neg', `${w.wrong}× falsch`), ` · ${w.correct}× richtig`))))
      : h('p.muted', 'Aktuell nichts Auffälliges – prima!'),
    h('p.muted.small', `Sicher gelernt: ${d.mastered} von ${d.seen} geübten Wörtern/Aufgaben (3× in Folge richtig).`));

  const bySubject = new Map();
  for (const u of d.units) {
    if (!bySubject.has(u.subjectName)) bySubject.set(u.subjectName, []);
    bySubject.get(u.subjectName).push(u);
  }
  const setUnit = async (u, body, msg) => {
    try {
      await papi(`/children/${id}/units/${u.subject}/${u.id}`, { method: 'PUT', body });
      toast(msg);
      refresh();
    } catch (err) { toast(err.message); }
  };
  const setLine = async (u, archived) => {
    try {
      await papi(`/children/${id}/lines/${u.subject}/${u.line}`, { method: 'PUT', body: { archived } });
      toast(archived ? `${u.lineName} archiviert.` : `${u.lineName} ist wieder im Fahrplan.`);
      refresh();
    } catch (err) { toast(err.message); }
  };
  const limit = d.retireAfter;
  const statusCell = (u) => {
    if (u.archived) {
      return h('td', h('span.log-tag', '📦 Archiviert'),
        h('div', h('button.btn.ghost.small', { type: 'button', onclick: () => setUnit(u, { archived: false }, `„${u.title}“ ist wieder im Fahrplan.`) }, 'Zurückholen')));
    }
    const archive = h('button.btn.ghost.small', { type: 'button', onclick: () => setUnit(u, { archived: true }, `„${u.title}“ archiviert.`) }, 'Archivieren');
    if (u.parked) {
      const rides = h('input.input.tiny', { type: 'number', min: 1, max: 50, value: 3, 'aria-label': `Fahrten mit Sternen für ${u.title}` });
      return h('td', h('span.log-tag', '🅿️ Abstellgleis'),
        h('.unit-actions',
          rides,
          h('button.btn.small', {
            type: 'button',
            onclick: () => setUnit(u, { extraRides: Number(rides.value) }, `„${u.title}“ bringt wieder Sterne für ${rides.value} Fahrten.`),
          }, 'Reaktivieren'),
          archive));
    }
    if (u.retired) {
      return h('td', h('span.log-tag', `🔄 noch ${u.extraRides} ${u.extraRides === 1 ? 'Fahrt' : 'Fahrten'} mit Sternen`),
        h('.unit-actions',
          h('button.btn.ghost.small', { type: 'button', onclick: () => setUnit(u, { extraRides: 0 }, `„${u.title}“ steht wieder auf dem Abstellgleis.`) }, 'Wieder abstellen'),
          archive));
    }
    return h('td', h('span.muted.small', 'in Betrieb'), h('.unit-actions', archive));
  };
  const units = h('section.panel',
    h('h2', '🗺️ Stationen'),
    h('p.muted', `Archivierte Stationen sieht dein Kind nicht mehr: nicht auf dem Netzplan, nicht im Fehler-Training, in der Blitzrunde oder im Endbahnhof. Der Fortschritt bleibt gespeichert. ${limit > 0 ? `Nach ${limit} Fahrten mit 3 Sternen kommt eine Station aufs Abstellgleis und bringt keine Sterne mehr. Mit „Reaktivieren“ bringt sie für ein paar Fahrten wieder Sterne.` : 'Das Abstellgleis ist ausgeschaltet (siehe Regeln in der Übersicht).'}`),
    [...bySubject].map(([name, list]) => h('div',
      bySubject.size > 1 ? h('h3', { style: { margin: '12px 0 4px' } }, name) : null,
      h('.table-wrap', h('table.data.units',
        h('thead', h('tr', h('th', 'Station'), h('th', 'Bestes'), h('th', '3 ★'), h('th', 'Fahrten'), h('th', 'Ø richtig'), h('th', 'Zuletzt'), h('th', 'Status'))),
        h('tbody', list.flatMap((u, i) => {
          const rows = [];
          if (u.line !== list[i - 1]?.line) {
            const lineUnits = list.filter((x) => x.line === u.line);
            const allArchived = lineUnits.every((x) => x.archived);
            rows.push(h('tr.log-day', h('th', { colspan: 7, scope: 'rowgroup' },
              h('.line-row',
                h('span', u.lineName),
                h('button.btn.ghost.small', { type: 'button', onclick: () => setLine(u, !allArchived) },
                  allArchived ? 'Ganze Linie zurückholen' : 'Ganze Linie archivieren')))));
          }
          rows.push(h('tr', { class: u.archived ? 'archived' : '' },
            h('td', h('strong', u.title), h('div.muted.small', u.subtitle)),
            h('td', starRow(u.best)),
            h('td', limit > 0 ? `${u.perfect} / ${limit}` : u.perfect || '–'),
            h('td', u.runs || '–'),
            h('td', u.avg == null ? '–' : `${u.avg} %`),
            h('td', u.last ? fmtDate(u.last) : '–'),
            statusCell(u)));
          return rows;
        })))))));

  const loot = d.lootboxes;
  const lootPanel = loot.closed.length || loot.opened.length
    ? h('section.panel',
        h('h2', '🎁 Lootboxen'),
        h('p.muted', `Noch ungeöffnet: ${loot.closed.length}${loot.closed.length ? ` (${loot.closed.map((b) => b.note).join(', ')})` : ''}. Die Sterne aus einer Box zählen nicht zum Tageslimit.`),
        loot.opened.length
          ? h('ul.pending-list', loot.opened.map((b) =>
              h('li', h('.what', h('strong', `${b.minutes} Minuten · +${b.stars} ★`), h('div.muted.small', `${b.note} · geöffnet ${relDay(b.opened_at)}`)))))
          : null)
    : null;

  const sessions = h('section.panel',
    h('h2', '📖 Letzte Fahrten'),
    d.sessions.length ? logTable(d.sessions, { showChild: false }) : h('p.muted', 'Noch keine Fahrten.'),
    d.sessions.length ? h('a.btn.ghost.small', { href: `#/parent/log/${id}` }, 'Alle Fahrten →') : null);

  const amount = h('input.input', { type: 'number', id: 'adj-amount', min: -500, max: 500, required: true, placeholder: 'z. B. 5 oder -3' });
  const note = h('input.input', { id: 'adj-note', maxlength: 80, placeholder: 'z. B. Vokabeltest gut gemacht' });
  const adjust = h('form.panel', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await papi(`/children/${id}/stars`, { method: 'POST', body: { amount: Number(amount.value), note: note.value } });
        toast('Gebucht.');
        refresh();
      } catch (err) { toast(err.message); }
    },
  },
    h('h2', '⭐ Sterne gutschreiben oder abziehen'),
    h('.form-grid',
      h('.field', h('label', { for: 'adj-amount' }, 'Anzahl (negativ = abziehen)'), amount),
      h('.field', h('label', { for: 'adj-note' }, 'Grund (sieht das Kind nicht)'), note)),
    h('button.btn', { type: 'submit' }, 'Buchen'));

  const ledger = h('section.panel',
    h('h2', '📒 Sterne-Konto'),
    h('.table-wrap', h('table.data',
      h('thead', h('tr', h('th', 'Wann'), h('th', 'Art'), h('th', 'Grund'), h('th', { style: { textAlign: 'right' } }, 'Sterne'))),
      h('tbody', d.ledger.map((l) => h('tr',
        h('td', fmtDate(l.created_at, true)),
        h('td', KIND[l.kind] ?? l.kind),
        h('td', l.note ?? ''),
        h('td', { style: { textAlign: 'right' } }, h(`span.${l.amount >= 0 ? 'pos' : 'neg'}`, `${l.amount > 0 ? '+' : ''}${l.amount}`))))))));

  let avatar = d.child.avatar;
  const nameInput = h('input.input', { id: 'edit-name', value: d.child.name, maxlength: 40 });
  const edit = h('form.panel', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await papi(`/children/${id}`, { method: 'PUT', body: { name: nameInput.value, avatar } });
        toast('Gespeichert.');
        refresh();
      } catch (err) { toast(err.message); }
    },
  },
    h('h2', '✏️ Profil bearbeiten'),
    h('.field', h('label', { for: 'edit-name' }, 'Name'), nameInput),
    h('.field', h('label', 'Bild'), avatarPicker(avatar, (a) => { avatar = a; })),
    h('.actions', { style: { justifyContent: 'flex-start' } },
      h('button.btn', { type: 'submit' }, 'Speichern'),
      h('button.btn.danger', {
        type: 'button',
        onclick: async () => {
          if (!confirm(`Profil „${d.child.name}“ mit allen Sternen und dem gesamten Lernfortschritt endgültig löschen?`)) return;
          await papi(`/children/${id}`, { method: 'DELETE' });
          toast('Profil gelöscht.');
          location.hash = '#/parent';
        },
      }, 'Profil löschen')));

  render(
    head(`${d.child.avatar} ${d.child.name}`, h('a.btn.ghost.small', { href: '#/parent' }, '← Übersicht')),
    h('section.panel', h('.kpis',
      kpi(`${d.balance} ★`, 'Guthaben'),
      kpi(`${d.streak}`, 'Tage am Stück'),
      kpi(`${d.rank.train} ${d.rank.level}`, `${d.rank.name} · ${d.rank.xp} XP`),
      kpi(`${d.stamps}`, 'Fahrplan-Stempel'),
      kpi(`${d.mastered}`, 'sicher gelernt'),
      kpi(`${d.badges.length}`, 'Abzeichen'))),
    chart,
    weak,
    units,
    lootPanel,
    sessions,
    adjust,
    ledger,
    edit
  );
}
