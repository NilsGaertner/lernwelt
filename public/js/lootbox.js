import { h, sfx, confetti, toast, reducedMotion } from './ui.js';
import { api } from './api.js';

const minutesText = (m) => `${m} ${m === 1 ? 'Minute' : 'Minuten'}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seltenheitsstufen von unten nach oben – wie LOOT in server/lootbox.js. */
export const RARITIES = [
  { id: 'normal', name: 'Normal', icon: '✨', minutes: 5 },
  { id: 'selten', name: 'Selten', icon: '💠', minutes: 10 },
  { id: 'episch', name: 'Episch', icon: '🌟', minutes: 15 },
  { id: 'legendaer', name: 'Legendär', icon: '💎', minutes: 20 },
  { id: 'mythisch', name: 'Mythisch', icon: '👑', minutes: 30 },
];
export const rarityLevel = (id) => Math.max(0, RARITIES.findIndex((r) => r.id === id));

/**
 * Eine geschlossene Lootbox zum Antippen. Beim Öffnen wackelt sie und dreht dann Stufe für Stufe durch die
 * Seltenheitsfarben hoch, bis sie bei ihrer eigenen ankommt – je seltener, desto länger die Spannung.
 * Danach zeigt sie die gewonnene Medienzeit. onOpened(result) bekommt { minutes, stars, rarity, balance }.
 */
export function lootbox(childId, box, { onOpened } = {}) {
  const wrap = h('.lootbox');
  const btn = h('button.lb-closed', { type: 'button', class: box.source === 'gift' ? 'gift' : '', 'aria-label': `Lootbox öffnen: ${box.note}`, onclick: open },
    h('span.lb-icon', { 'aria-hidden': 'true' }, '🎁'),
    h('span.lb-note', box.note),
    h('span.lb-cta', 'Antippen zum Öffnen'));
  wrap.append(btn);

  async function open() {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('opening');
    sfx.tick();
    let res;
    try {
      [res] = await Promise.all([
        api(`/children/${childId}/lootboxes/${box.id}/open`, { method: 'POST' }),
        wait(900),
      ]);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.classList.remove('opening');
      return;
    }
    const level = rarityLevel(res.rarity);
    await climb(level);
    reveal(res, level);
    updateTopbar(res.balance);
    onOpened?.(res);
  }

  /** Hochdrehen: jede Stufe blitzt auf, und vor der nächsten wird die Pause länger und das Ticken schneller. */
  async function climb(level) {
    if (reducedMotion()) return;
    const cta = btn.querySelector('.lb-cta');
    for (let i = 0; i <= level; i++) {
      btn.dataset.rarity = RARITIES[i].id;
      cta.textContent = `${RARITIES[i].name}${'!'.repeat(i)}`;
      btn.classList.remove('lb-up');
      void btn.offsetWidth; // Animation neu starten
      btn.classList.add('lb-up');
      sfx.rarity(i);
      const pause = 650 + i * 220;
      const beat = Math.max(110, 260 - i * 40);
      for (let t = beat * 2; t < pause; t += beat) setTimeout(() => sfx.tick(), t);
      await wait(pause);
    }
  }

  function reveal(res, level) {
    const r = RARITIES[level];
    // Je seltener, desto größer die Feier; Mythisch ist der Hauptgewinn (1 %) mit doppeltem Konfetti.
    if (level >= 2) sfx.fanfare();
    else sfx.arrive();
    if (level >= 2) setTimeout(() => confetti({ count: level >= 3 ? 180 : 120 }), 200);
    if (level >= 4) setTimeout(() => { sfx.fanfare(); confetti({ count: 240 }); }, 1300);
    wrap.replaceChildren(h('.lb-open', { 'data-rarity': r.id, role: 'status' },
      h('span.lb-icon', { 'aria-hidden': 'true' }, r.icon),
      h('span.lb-rarity', level >= 4 ? `${r.name} – Hauptgewinn!` : r.name),
      h('span.lb-min', minutesText(res.minutes)),
      h('span.lb-stars', `+${res.stars} ★ für Medienzeit`),
      h('span.lb-note', box.note)));
  }
  return wrap;
}

/** Die Seltenheitsstufen als kleine Farbleiste – damit das Kind weiß, worauf es hofft. */
export function rarityLegend() {
  return h('ul.lb-legend', { 'aria-label': 'Seltenheitsstufen' },
    RARITIES.map((r) => h('li', { 'data-rarity': r.id }, h('span', { 'aria-hidden': 'true' }, r.icon), ` ${r.name} · ${r.minutes} Min`)));
}

/** Kopfzeile nach dem Öffnen aktualisieren: Kontostand und Zahl der ungeöffneten Boxen. */
function updateTopbar(balance) {
  const num = document.querySelector('.topbar .fare .num');
  if (num) num.textContent = balance;
  const count = document.querySelector('.topbar .box-btn .lvl');
  if (!count) return;
  const left = Number(count.textContent) - 1;
  if (left > 0) count.textContent = left;
  else count.closest('.box-btn').remove();
}

/** Eine schon geöffnete Box für die Liste. */
export function openedBox(b) {
  const r = RARITIES[rarityLevel(b.rarity)];
  return h('li',
    h('span.lb-dot', { 'data-rarity': r.id, 'aria-hidden': 'true' }, r.icon),
    h('span.what', h('strong', minutesText(b.minutes)), ' ', h('span.lb-tag', { 'data-rarity': r.id }, r.name), h('span.muted.small', ` · ${b.note}`)),
    h('span.amt', `+${b.stars} ★`));
}
