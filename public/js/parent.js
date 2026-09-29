import { h, toast, starRow, fmtDate, relDay } from './ui.js';
import { api, parentToken } from './api.js';

const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🐧', '🐨', '🦖', '🐱', '🐶', '🚀', '⚽', '🎮'];
const KIND = { session: 'Übung', bonus: 'Bonus', badge: 'Abzeichen', ticket: 'Ticket', refund: 'Rückgabe', manual: 'Eltern' };

const papi = (path, opts = {}) => api(`/parent${path}`, { ...opts, parent: true });

export async function parentView(root, rest, { reloadMeta }) {
  const render = (...nodes) => { root.replaceChildren(...nodes.filter((n) => n != null && n !== false)); };
  if (!parentToken.get()) return loginView(root, rest, reloadMeta);
  try {
    const m = rest.match(/^child\/(\d+)$/);
    if (m) await childView(root, Number(m[1]), render);
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
            kpi(`${c.earnedToday} ★`, `heute verdient${data.settings.dailyStarLimit ? ` (max. ${data.settings.dailyStarLimit})` : ''}`),
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
      f('minutesPerStar', 'Minuten Medienzeit pro Stern', s.minutesPerStar, 'Eine Übung bringt 1–3 Sterne, dazu Boni.', { type: 'number', min: 1, max: 60 }),
      f('dailyStarLimit', 'Maximale Sterne pro Tag', s.dailyStarLimit, '0 = unbegrenzt. Üben geht auch danach, nur ohne Sterne.', { type: 'number', min: 0, max: 1000 }),
      f('questionsPerSession', 'Aufgaben pro Übung', s.questionsPerSession, 'Empfohlen: 8–12.', { type: 'number', min: 5, max: 30 }),
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
    settingsForm,
    addForm,
    pinForm,
    contentPanel
  );
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
  const units = h('section.panel',
    h('h2', '🗺️ Stationen'),
    [...bySubject].map(([name, list]) => h('div',
      bySubject.size > 1 ? h('h3', { style: { margin: '12px 0 4px' } }, name) : null,
      h('.table-wrap', h('table.data',
        h('thead', h('tr', h('th', 'Station'), h('th', 'Bestes'), h('th', 'Fahrten'), h('th', 'Ø richtig'), h('th', 'Zuletzt'))),
        h('tbody', list.map((u) => h('tr',
          h('td', h('strong', u.title), h('div.muted.small', u.subtitle)),
          h('td', starRow(u.best)),
          h('td', u.runs || '–'),
          h('td', u.avg == null ? '–' : `${u.avg} %`),
          h('td', u.last ? fmtDate(u.last) : '–')))))))));

  const sessions = h('section.panel',
    h('h2', '🕑 Letzte Übungen'),
    d.sessions.length
      ? h('.table-wrap', h('table.data',
          h('thead', h('tr', h('th', 'Wann'), h('th', 'Station'), h('th', 'Richtig'), h('th', 'Sterne'), h('th', 'Dauer'))),
          h('tbody', d.sessions.map((s) => h('tr',
            h('td', fmtDate(s.finished_at, true)),
            h('td', s.title),
            h('td', `${s.correct}/${s.total}`),
            h('td', `+${s.stars}`),
            h('td', `${Math.max(1, Math.round(s.duration_sec / 60))} Min.`))))))
      : h('p.muted', 'Noch keine Übungen.'));

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
    sessions,
    adjust,
    ledger,
    edit
  );
}
