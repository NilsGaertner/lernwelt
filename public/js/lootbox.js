import { h, sfx, confetti, toast } from './ui.js';
import { api } from './api.js';

const minutesText = (m) => `${m} ${m === 1 ? 'Minute' : 'Minuten'}`;

/**
 * Eine geschlossene Lootbox zum Antippen. Beim Öffnen wackelt sie, dann zeigt sie die gewonnene Medienzeit.
 * onOpened(result) bekommt { minutes, stars, balance }.
 */
export function lootbox(childId, box, { onOpened } = {}) {
  const wrap = h('.lootbox');
  const btn = h('button.lb-closed', { type: 'button', 'aria-label': `Lootbox öffnen: ${box.note}`, onclick: open },
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
        new Promise((r) => setTimeout(r, 1100)),
      ]);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.classList.remove('opening');
      return;
    }
    sfx.fanfare();
    if (res.minutes >= 15) setTimeout(() => confetti(), 200);
    wrap.replaceChildren(h('.lb-open', { class: res.minutes >= 15 ? 'lb-big' : '', role: 'status' },
      h('span.lb-icon', { 'aria-hidden': 'true' }, res.minutes >= 20 ? '💎' : res.minutes >= 15 ? '🌟' : '✨'),
      h('span.lb-min', minutesText(res.minutes)),
      h('span.lb-stars', `+${res.stars} ★ für Medienzeit`),
      h('span.lb-note', box.note)));
    updateTopbar(res.balance);
    onOpened?.(res);
  }
  return wrap;
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
  return h('li',
    h('span', { 'aria-hidden': 'true' }, '🎁'),
    h('span.what', h('strong', minutesText(b.minutes)), h('span.muted.small', ` · ${b.note}`)),
    h('span.amt', `+${b.stars} ★`));
}
