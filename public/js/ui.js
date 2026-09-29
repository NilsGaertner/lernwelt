// Kleine Helfer für DOM, Text, Ton und Sprache.

/** h('div.cls#id', {attrs}, ...children) – erzeugt DOM-Elemente. */
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(name || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
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

export function starRow(n, max = 3) {
  return h('span.stars', { 'aria-label': `${n} von ${max} Sternen` },
    Array.from({ length: max }, (_, i) => h(`span.${i < n ? 'on' : 'off'}`, { 'aria-hidden': 'true' }, '★')));
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

export function speak(text, lang = 'en-GB') {
  if (!canSpeak() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\*\*/g, ''));
  u.lang = lang;
  u.rate = 0.88;
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
