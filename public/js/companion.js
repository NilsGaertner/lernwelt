// Der Companion: die Katze des Kindes, die bei der Fahrt mitfährt, am Ziel mitfeiert und in der Sammlung wartet.
// Jede Katze hat ihre eigene Art (PERSONAS): eigene Freuden-Bewegung, eigene Teilchen, eigenes Verhalten im Schlaf.
// Die Bewegungen stehen im CSS unter .companion[data-cat=…].
import { h } from './ui.js';
import { CATS, PERSONAS, avatarSvg, sleepSvg, isCat } from './avatar-data.js';

/**
 * Baut den Companion und gibt eine kleine Steuerung zurück.
 * cat: { companion: 'cat:black', skin } · awake: schläft nie ein (z. B. am Ziel und in der Sammlung)
 */
export function companion({ companion: id, skin = null }, { awake = false, className = '' } = {}) {
  if (!isCat(id)) return null;
  const key = id.slice(4);
  const persona = PERSONAS[key];
  const art = h('span.cp-art');
  const el = h('.companion', { 'aria-hidden': 'true', 'data-cat': key, class: className }, art);
  let mode = null;
  let hyped = false;
  let timer = 0;

  const show = (m) => {
    if (mode === m) return;
    mode = m;
    art.innerHTML = (m === 'sleep' ? sleepSvg(id, skin) : avatarSvg(id, skin)) ?? '';
    el.classList.toggle('awake', m === 'awake');
  };
  // Eine Bewegung neu starten, auch wenn sie gerade noch läuft
  const play = (cls) => {
    el.classList.remove('cheer', 'encourage', 'poke');
    void el.offsetWidth;
    el.classList.add(cls);
  };
  // Nach einer Weile wieder einschlafen (außer im Wach-Modus oder während einer Serie)
  const settle = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.classList.remove('cheer', 'encourage', 'poke');
      show(awake || hyped ? 'awake' : 'sleep');
    }, ms);
  };
  const burst = (items, n = 3) => {
    for (let i = 0; i < n; i++) {
      const p = h('span.cp-particle', items[i % items.length]);
      p.style.setProperty('--x', `${(i - (n - 1) / 2) * 28 + (Math.random() * 10 - 5)}px`);
      p.style.setProperty('--r', `${Math.random() * 40 - 20}deg`);
      p.style.animationDelay = `${0.15 + i * 0.12}s`;
      el.append(p);
      setTimeout(() => p.remove(), 1800);
    }
  };
  const bubble = (text) => {
    el.querySelector('.cp-bubble')?.remove();
    const b = h('span.cp-bubble', text);
    el.append(b);
    setTimeout(() => b.remove(), 1700);
  };

  const ctl = {
    el,
    name: CATS[key].name,
    persona,
    /** Richtige Antwort: aufwachen und auf ihre eigene Art freuen. */
    cheer() {
      show('awake');
      play('cheer');
      burst(persona.particles);
      settle(2600);
    },
    /** Nach einem Fehler: kurz aufschauen und Mut machen – nie schimpfen. */
    encourage() {
      if (!mode) show(awake ? 'awake' : 'sleep');
      play('encourage');
      bubble(persona.encourage);
      settle(1800);
    },
    /** Ab einer langen Serie bleibt die Katze wach und fiebert mit. */
    hype(on) {
      if (hyped === on) return;
      hyped = on;
      el.classList.toggle('hyped', on);
      if (on) show('awake');
      else settle(1800);
    },
    /** Große Freude (Ziel mit 3 Sternen): zweimal hintereinander. */
    celebrate() {
      show('awake');
      play('cheer');
      burst(persona.particles, 5);
      setTimeout(() => { play('cheer'); burst(persona.particles, 4); }, 1100);
      settle(2400);
    },
    stop() { clearTimeout(timer); },
  };

  // Antippen: Die Katze reagiert – schlafend zuckt sie, wach freut sie sich.
  el.addEventListener('click', () => {
    if (mode === 'sleep') { play('poke'); settle(900); } else ctl.cheer();
  });
  show(awake ? 'awake' : 'sleep');
  return ctl;
}
