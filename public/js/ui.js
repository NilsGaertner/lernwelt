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
};

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
