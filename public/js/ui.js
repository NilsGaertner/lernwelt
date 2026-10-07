// Kleine Helfer für DOM, Text, Ton und Sprache.

/** h('div.cls#id', {attrs}, ...children) – erzeugt DOM-Elemente. */
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(name || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  // attrs != null statt attrs: sonst verschwindet eine 0 als erstes Kind (z. B. Kontostand 0).
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'class') el.className += ` ${v}`;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Mini-Markdown: nur **fett**. */
export function md(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Lückentext: ___ wird zu einer sichtbaren Lücke. */
export function gapText(s, fill = '') {
  return md(s).replace(/_{3,}/g, `<span class="gap">${escapeHtml(fill) || '&nbsp;'}</span>`);
}

// ---------------------------------------------------------------- Schriftliches Rechnen

const PLACES = ['E', 'Z', 'H', 'T', 'ZT', 'HT', 'M', 'ZM', 'HM'];
export const OP_SIGN = { add: '+', sub: '−', mul: '·' };

/**
 * Rechnet eine schriftliche Rechnung Spalte für Spalte durch. Spalte 0 ist ganz links.
 * op 'add': alle Zeilen werden addiert. op 'sub': von der ersten Zeile werden die anderen abgezogen –
 * im Ergänzungsverfahren: Die untere Ziffer (plus Übertrag) wird bis zur oberen ergänzt, nötigenfalls bis 10 mehr.
 * width: so viele Spalten (Standard: so breit wie die längste Zahl bzw. das Ergebnis).
 */
export function columnMath(rows, { width = null, op = 'add' } = {}) {
  const [top, ...rest] = rows.map(Number);
  const total = String(op === 'sub' ? top - rest.reduce((a, b) => a + b, 0) : rows.reduce((a, r) => a + Number(r), 0));
  width ??= Math.max(total.length, ...rows.map((r) => r.length));
  const digit = (r, col) => r[r.length - width + col] ?? '';
  const carries = new Array(width).fill(0);
  const steps = [];
  let carry = 0;
  for (let col = width - 1; col >= 0; col--) {
    carries[col] = carry;
    const place = PLACES[width - 1 - col] ?? '';
    if (op === 'sub') {
      const m = Number(digit(rows[0], col) || 0);
      const parts = rows.slice(1).map((r) => digit(r, col)).filter(Boolean).map(Number);
      if (!digit(rows[0], col) && !parts.length && !carry) continue;
      const lower = parts.reduce((a, b) => a + b, 0) + carry;
      const k = Math.max(0, Math.ceil((lower - m) / 10));
      steps.push({ place, parts, carryIn: carry, lower, target: m + 10 * k, write: m + 10 * k - lower, carryOut: k, first: col === 0 });
      carry = k;
    } else {
      const parts = rows.map((r) => digit(r, col)).filter(Boolean).map(Number);
      if (!parts.length && !carry) continue;
      const sum = parts.reduce((a, b) => a + b, 0) + carry;
      steps.push({ place, parts, carryIn: carry, write: sum % 10, carryOut: Math.floor(sum / 10), sum });
      carry = Math.floor(sum / 10);
    }
  }
  return { width, op, total: total.padStart(width, ' '), carries, steps, digit };
}

/**
 * Zahlen stellengerecht untereinander auf Karopapier, Überträge klein über dem Strich.
 * Ohne Optionen ist alles schon ausgerechnet (Beispiel auf der Merke-Seite).
 * carryCell(col) / resultCell(col) liefern eigene Kästchen zum Eintippen.
 */
export function columnSum(rows, { op = 'add', width = null, carryCell = null, resultCell = null, carries: showCarries = null } = {}) {
  if (op === 'mul') return mulGrid(rows);
  const m = columnMath(rows, { width, op });
  const cell = (cls, text = '') => h(`span.${cls}`, text);
  const cells = [];
  rows.forEach((r, i) => {
    cells.push(cell('cs-op', i === rows.length - 1 ? OP_SIGN[op] : ''));
    for (let col = 0; col < m.width; col++) cells.push(cell('cs-d', m.digit(r, col)));
  });
  if (carryCell || (showCarries ?? m.carries.some(Boolean))) {
    cells.push(cell('cs-op'));
    for (let col = 0; col < m.width; col++) {
      cells.push(carryCell ? carryCell(col) : cell('cs-carry', m.carries[col] ? String(m.carries[col]) : ''));
    }
  }
  cells.push(cell('cs-op.cs-line'));
  for (let col = 0; col < m.width; col++) cells.push(resultCell ? resultCell(col) : cell('cs-r.cs-line', m.total[col].trim()));
  const word = op === 'sub' ? ' minus ' : ' plus ';
  return h('.colsum', { style: { '--cols': m.width + 1 }, role: 'img', 'aria-label': `${rows.join(word)} gleich ${m.total.trim()}` }, cells);
}

/**
 * Der Rechenweg in Worten, Spalte für Spalte.
 * Plus: „Z: 6 + 7 + 1 = 14 → schreib 4, Übertrag 1“ · Minus: „Z: 7 + 1 = 8, 8 + 2 = 10 → schreib 2, Übertrag 1“
 */
export function columnSteps(rows, { op = 'add', width = null } = {}) {
  if (op === 'mul') return mulSteps(rows);
  const { steps } = columnMath(rows, { width, op });
  const carryText = (k) => (k ? `, Übertrag **${k}**` : '');
  return h('ol.cs-steps', steps.map((st) => {
    let text;
    if (op === 'sub') {
      const below = [...st.parts.map(String), st.carryIn ? String(st.carryIn) : null].filter(Boolean);
      const add = below.length > 1 ? `${below.join(' + ')} = ${st.lower}, ` : '';
      text = `${add}${st.lower} + **${st.write}** = ${st.target} → `;
      text += st.first && st.write === 0 && st.lower > 0
        ? 'fertig, die 0 vorne schreibst du nicht'
        : `schreib ${st.write}${carryText(st.carryOut)}`;
    } else {
      const terms = [...st.parts.map(String), st.carryIn ? `**${st.carryIn}**` : null].filter(Boolean);
      text = `${terms.length > 1 ? `${terms.join(' + ')} = ${st.sum}` : `Übertrag ${st.sum}`} → schreib ${st.write}${carryText(st.carryOut)}`;
    }
    return h('li', h('b', st.place), h('span', { html: md(text) }));
  }));
}

/**
 * Schriftlich mal wie im Heft: Die Aufgabe steht in einer Zeile (3597 · 19). Für jede Ziffer des zweiten Faktors
 * kommt ein Teilprodukt darunter, das unter dieser Ziffer endet – also jedes eine Stelle weiter rechts.
 * Die Teilprodukte werden zusammengezählt; das Ergebnis endet unter der letzten Ziffer.
 * Spalte 0 ist ganz links (die erste Ziffer des ersten Faktors).
 */
export function mulMath([a, b]) {
  const la = a.length;
  const lb = b.length;
  const width = la + 1 + lb;
  const partials = [...b].map((d, i) => ({ digit: Number(d), value: String(Number(a) * Number(d)), end: la + 1 + i, start: i + 1 }));
  const total = String(Number(a) * Number(b));
  /** Ziffer einer Zahl, die in Spalte end aufhört, in Spalte col ('' wenn dort keine steht). */
  const at = (str, end, col) => (col <= end ? str[str.length - 1 - (end - col)] ?? '' : '');
  // Überträge beim Zusammenzählen der Teilprodukte (gibt es nur bei mehrstelligem zweiten Faktor)
  const carries = new Array(width).fill(0);
  if (lb > 1) {
    let carry = 0;
    for (let col = width - 1; col >= 0; col--) {
      carries[col] = carry;
      carry = Math.floor((partials.reduce((s, p) => s + Number(at(p.value, p.end, col) || 0), 0) + carry) / 10);
    }
  }
  return { la, lb, width, partials, total, carries, at, maxCarry: lb - 1 };
}

/**
 * Das Gitter fürs schriftliche Malnehmen. Ohne Optionen ist alles ausgerechnet (Beispiel auf der Merke-Seite).
 * partialCell(i, col) / carryCell(col) / resultCell(col) liefern eigene Kästchen zum Eintippen.
 * Jedes Teilprodukt bekommt eine Stelle mehr Platz als der erste Faktor, das Ergebnis so viele Stellen wie beide
 * Faktoren zusammen – so verrät die Breite nicht, ob vorne noch eine Ziffer kommt.
 */
export function mulGrid(rows, { partialCell = null, carryCell = null, resultCell = null } = {}) {
  const m = mulMath(rows);
  const [a, b] = rows;
  const multi = m.lb > 1;
  const cell = (cls, text = '') => h(`span.${cls}`, text);
  const cells = [];
  for (let col = 0; col < m.width; col++) {
    if (col < m.la) cells.push(cell('cs-d', a[col]));
    else if (col === m.la) cells.push(cell('cs-op', '·'));
    else cells.push(cell('cs-d', b[col - m.la - 1]));
  }
  if (multi) {
    m.partials.forEach((p, i) => {
      for (let col = 0; col < m.width; col++) {
        // Der Strich unter der Aufgabe läuft über die erste Zeile.
        const line = i === 0 ? '.cs-line' : '';
        if (col >= p.start && col <= p.end) {
          cells.push(partialCell ? partialCell(i, col) : cell(`cs-d${line}`, m.at(p.value, p.end, col)));
        } else {
          cells.push(cell(`cs-op${line}`, i === m.lb - 1 && col === p.start - 1 ? '+' : ''));
        }
      }
    });
    if (carryCell || m.carries.some(Boolean)) {
      for (let col = 0; col < m.width; col++) {
        const own = col >= 1 && col < m.width - 1;
        cells.push(own && carryCell ? carryCell(col) : cell('cs-carry', own && m.carries[col] ? String(m.carries[col]) : ''));
      }
    }
  }
  for (let col = 0; col < m.width; col++) {
    if (col === 0) cells.push(cell('cs-op.cs-line'));
    else cells.push(resultCell ? resultCell(col) : cell('cs-r.cs-line', m.at(m.total, m.width - 1, col)));
  }
  return h('.colsum.mul', { style: { '--cols': m.width }, role: 'img', 'aria-label': `${a} mal ${b} gleich ${m.total}` }, cells);
}

/** Große Zahlen in Dreierpäckchen: 68343 → 68 343 (vierstellige bleiben zusammen). */
const groupDigits = (n) => (String(n).length > 4 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(n));

/** Überschlag: jeden Faktor auf seine erste Stelle runden (421 → 400, 17 → 20). */
function roughly(n) {
  const p = 10 ** (String(n).length - 1);
  return Math.round(n / p) * p;
}

/**
 * Der Rechenweg beim Malnehmen: Überschlag, jede Zeile Ziffer für Ziffer mit „merke“, dann zusammenzählen.
 * „· 9: 7 · 9 = 63 → schreib 3, merke 6 / 9 · 9 = 81, + 6 = 87 → schreib 7, merke 8 / … / Zeile: 32 373“ (je Schritt eine Zeile)
 */
export function mulSteps(rows) {
  const m = mulMath(rows);
  const [a, b] = rows;
  const ra = roughly(Number(a));
  const rb = roughly(Number(b));
  const items = [h('li', h('b', '≈'), h('span', { html: md(`Überschlag: ${groupDigits(ra)} · ${groupDigits(rb)} = ${groupDigits(ra * rb)}`) }))];
  for (const p of m.partials) {
    let carry = 0;
    const parts = [];
    [...a].reverse().forEach((x, k) => {
      const prod = Number(x) * p.digit;
      const sum = prod + carry;
      let text = `${x} · ${p.digit} = ${prod}${carry ? `, + ${carry} = ${sum}` : ''}`;
      if (k === a.length - 1) text += ` → schreib ${sum}`;
      else text += ` → schreib ${sum % 10}${sum >= 10 ? `, merke ${Math.floor(sum / 10)}` : ''}`;
      parts.push(text);
      carry = Math.floor(sum / 10);
    });
    items.push(h('li', h('b', `· ${p.digit}`), h('span', { html: [...parts, `Zeile: **${groupDigits(p.value)}**`].map(md).join('<br>') })));
  }
  if (m.lb > 1) {
    items.push(h('li', h('b', '+'), h('span', { html: md(`Die Zeilen untereinander zusammenzählen (jede eine Stelle weiter rechts): **${groupDigits(m.total)}**`) })));
  }
  return h('ol.cs-steps', items);
}

// ---------------------------------------------------------------- Karten

const svgCache = new Map();

/**
 * Zeigt eine SVG-Karte. mark: Gebiet, das in der Aufgabe hervorgehoben wird.
 * legend: [[id, Name], …] – diese Gebiete werden bunt gefärbt und darunter erklärt.
 */
export function mapFigure(src, { mark = null, legend = null } = {}) {
  const box = h('.geo-map', { class: legend ? 'colored' : '' });
  const fig = h('figure.map-figure', box);
  if (!svgCache.has(src)) {
    svgCache.set(src, fetch(src).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))));
  }
  svgCache.get(src).then(
    (svg) => {
      box.innerHTML = svg;
      if (mark) box.querySelector(`#${CSS.escape(mark)}`)?.classList.add('mark');
      if (!legend) return;
      const items = legend.map(([id, name]) => {
        const el = box.querySelector(`#${CSS.escape(id)}`);
        el?.classList.add('show');
        return h('li', h('span.swatch', { style: { background: el?.style.getPropertyValue('--c') || 'var(--muted)' } }), name);
      });
      fig.append(h('figcaption', h('ul.legend', items)));
    },
    () => {
      svgCache.delete(src);
      box.replaceChildren(h('p.muted', 'Die Karte konnte nicht geladen werden.'));
    });
  return fig;
}

/** Die „Merke“-Erklärung einer Station (Absätze, Tipps, Beispiele, Tabellen, Karten, Rechenbeispiele). */
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
    if (b.column) return h('figure.colsum-figure', columnSum(b.column.rows, { op: b.column.op }), b.column.caption ? h('figcaption', { html: md(b.column.caption) }) : null);
    if (b.table) {
      return h('.table-wrap', h('table',
        b.table.head ? h('thead', h('tr', b.table.head.map((c) => h('th', { html: md(c) })))) : null,
        h('tbody', b.table.rows.map((r) => h('tr', r.map((c) => h('td', { html: md(c) })))))));
    }
    return null;
  });
}

export function starRow(n, max = 3) {
  return h('span.stars', { 'aria-label': `${n} von ${max} Sternen` },
    Array.from({ length: max }, (_, i) => h(`span.${i < n ? 'on' : 'off'}`, { 'aria-hidden': 'true' }, '★')));
}

/**
 * Fängt die Zurück-Geste (Android) bzw. den Zurück-Knopf ab, solange eine Fahrt läuft:
 * Statt die Seite still zu verlassen, wird onBack gefragt.
 * Gibt release(then) zurück: gibt den Verlauf wieder frei und ruft danach then auf.
 */
export function guardBack(onBack) {
  history.pushState({ lwGuard: true }, '');
  let after = null;
  let active = true;
  const onPop = () => {
    if (after) {
      window.removeEventListener('popstate', onPop);
      const then = after;
      after = null;
      then();
      return;
    }
    history.pushState({ lwGuard: true }, '');
    onBack();
  };
  window.addEventListener('popstate', onPop);
  return function release(then = () => {}) {
    if (!active) return then();
    active = false;
    if (history.state?.lwGuard) {
      after = then;
      history.back();
    } else {
      window.removeEventListener('popstate', onPop);
      then();
    }
  };
}

// ---------------------------------------------------------------- Dialoge (statt confirm/alert)

let openDialog = null;

/**
 * Ein eigenes Fenster im Stil der Lernwelt. buttons: [{ label, value, cls }].
 * Ist schon eins offen (z. B. zweimal Zurück gewischt), kommt dessen Antwort zurück statt eines zweiten Fensters.
 */
function dialog(title, body, buttons, { cancelValue = false, wide = false } = {}) {
  if (openDialog) return openDialog.promise;
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const close = (value) => {
    if (openDialog?.dlg !== dlg) return;
    openDialog = null;
    if (dlg.open) dlg.close();
    dlg.remove();
    resolve(value);
  };
  const dlg = h('dialog.dlg', { class: wide ? 'wide' : '', 'aria-labelledby': 'dlg-title' },
    h('h2#dlg-title', title),
    body ? h('.dlg-body', body) : null,
    h('.dlg-actions', buttons.map((b) =>
      h('button.btn', { type: 'button', class: b.cls ?? '', autofocus: b.focus || null, onclick: () => close(b.value) }, b.label))));
  // Esc bzw. Zurück-Taste schließt wie „Abbrechen“
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(cancelValue); });
  document.body.append(dlg);
  openDialog = { dlg, promise, close };
  dlg.showModal();
  return promise;
}

/** Ja/Nein-Frage. Die sichere Antwort (cancel) hat den Fokus. → Promise<boolean> */
export function ask(title, { text = null, ok = 'Ja', cancel = 'Nein', danger = false } = {}) {
  return dialog(title, text ? h('p', text) : null, [
    { label: cancel, value: false, cls: 'ghost', focus: true },
    { label: ok, value: true, cls: danger ? 'danger' : 'line' },
  ]);
}

/** Eine Meldung mit OK. */
export function notify(title, { text = null, ok = 'OK' } = {}) {
  return dialog(title, text ? h('p', text) : null, [{ label: ok, value: true, cls: 'line', focus: true }], { cancelValue: true });
}

/** Ein Fenster mit beliebigem Inhalt (z. B. die Merke-Seite während der Fahrt). */
export function showPanel(title, content) {
  return dialog(title, content, [{ label: 'Schließen', value: true, cls: 'line', focus: true }], { cancelValue: true, wide: true });
}

export const dialogOpen = () => !!openDialog;

/** Schließt ein offenes Fenster (z. B. wenn die Blitzrunde abläuft oder die Seite wechselt). */
export function closeDialogs() {
  openDialog?.close(false);
}

/** Punkte mit halben Punkten fürs Verbessern: 8.5 → „8½“. */
export function fmtScore(n) {
  const whole = Math.floor(n);
  return n % 1 ? `${whole || ''}½` : String(n);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------------------------------------------------------------- Einstellungen pro Gerät

function store(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – egal */
  }
}
export const prefs = {
  get sound() { return store('lw.sound', true); },
  set sound(v) { save('lw.sound', v); },
  get lastChild() { return store('lw.lastChild', null); },
  set lastChild(v) { save('lw.lastChild', v); },
  /** Geschaffte Stationen einer Linie sind eingeklappt, bis das Kind sie aufklappt (gemerkt pro Gerät). */
  isFolded(key) { return store('lw.unfolded', {})[key] !== true; },
  setFolded(key, folded) {
    const open = store('lw.unfolded', {});
    if (folded) delete open[key];
    else open[key] = true;
    save('lw.unfolded', open);
  },
};

// ---------------------------------------------------------------- Sprache (Vorlesen)

let voices = [];
function loadVoices() {
  voices = window.speechSynthesis?.getVoices() ?? [];
}
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export const canSpeak = () => 'speechSynthesis' in window;

/** slow: deutlich langsamer (🐢), z. B. beim Diktat. */
export function speak(text, lang = 'en-GB', { slow = false } = {}) {
  if (!canSpeak() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\*\*/g, ''));
  u.lang = lang;
  u.rate = slow ? 0.55 : 0.88;
  const base = lang.slice(0, 2);
  u.voice =
    voices.find((v) => v.lang === lang && /natural|online|google/i.test(v.name)) ||
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang?.startsWith(base)) ||
    null;
  synth.speak(u);
}

// ---------------------------------------------------------------- Töne

let ctx;
function tone(freqs, { dur = 0.12, type = 'sine', gap = 0.09, vol = 0.18 } = {}) {
  if (!prefs.sound) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      const t = t0 + i * gap;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  } catch {
    /* Audio nicht verfügbar */
  }
}
export const sfx = {
  right: () => tone([660, 880], { type: 'triangle' }),
  wrong: () => tone([220, 180], { type: 'sawtooth', vol: 0.07, dur: 0.16 }),
  arrive: () => tone([523, 659, 784, 1047], { type: 'triangle', gap: 0.12, dur: 0.25 }),
  /** Serie: je länger, desto höher */
  combo: (n) => tone([660, 880, 880 * 2 ** (Math.min(n, 12) / 12)], { type: 'triangle', gap: 0.07 }),
  tick: () => tone([880], { type: 'square', vol: 0.06, dur: 0.08 }),
  go: () => tone([1175], { type: 'square', vol: 0.08, dur: 0.25 }),
  fanfare: () => tone([523, 659, 784, 1047, 784, 1047], { type: 'triangle', gap: 0.1, dur: 0.22 }),
  stamp: () => tone([196, 147], { type: 'square', vol: 0.1, gap: 0.05, dur: 0.12 }),
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Konfetti-Regen über der ganzen Seite (ohne Bibliothek). */
export function confetti({ count = 120, duration = 2600 } = {}) {
  if (reducedMotion()) return;
  const canvas = h('canvas.confetti', { 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx2d = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const colors = ['#F5A800', '#D7263D', '#1F6FD1', '#15834F', '#8B3FA3', '#0B7A75', '#FF7AB6'];
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 16 * dpr,
    vy: (-Math.random() * 14 - 6) * dpr,
    r: (4 + Math.random() * 5) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const k = (t - t0) / duration;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
    for (const p of parts) {
      p.vy += 0.45 * dpr;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(p.rot);
      ctx2d.fillStyle = p.c;
      ctx2d.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx2d.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Zählt eine Zahl in einem Element hoch (z. B. den Sterne-Kontostand). */
export function countUp(el, from, to, { duration = 900, delay = 0 } = {}) {
  el.textContent = from;
  if (from === to || reducedMotion()) {
    el.textContent = to;
    return;
  }
  setTimeout(() => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

/** Fortschrittsbalken zum nächsten Rang. */
export function rankMeter(rank) {
  const next = rank.next;
  const pct = next ? Math.round(((rank.xp - rank.min) / (next.min - rank.min)) * 100) : 100;
  return h('.rank-meter',
    h('.rank-row',
      h('span.rank-name', `${rank.train} ${rank.name}`),
      h('span.muted.small', next ? `noch ${next.min - rank.xp} XP bis ${next.name}` : 'Höchster Rang!')),
    h('.meter.xp', { role: 'img', 'aria-label': `${pct} % bis zum nächsten Rang` }, h('span', { style: { width: `${pct}%` } })));
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const opts = { day: '2-digit', month: '2-digit' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('de-DE', opts);
}

export function relDay(iso) {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `heute, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}
