/**
 * Eigene Grafiken der Themen: alles wird im Browser gezeichnet, es gibt keine Bilddateien.
 * Block-Welt: Pixel-Landschaften und Blöcke. Ruhig: eine Pflanze, die mit dem Fortschritt wächst.
 * Das Bahn-Thema braucht nichts davon: Dort geben alle Funktionen null zurück und die Seite bleibt, wie sie ist.
 */
import { h } from './ui.js';
import { W } from './themes.js';

const art = (cls, svg) => h(`span.art.${cls}`, { 'aria-hidden': 'true', html: svg });

function hash(text) {
  let n = 2166136261;
  for (const ch of String(text)) n = Math.imul(n ^ ch.codePointAt(0), 16777619);
  return n >>> 0;
}

/** Zufall, der für dieselbe Linie immer gleich ausfällt: Die Landschaft sieht bei jedem Besuch gleich aus. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ein Pixelraster. Am Ende werden gleichfarbige Pixel zu je einem Pfad zusammengefasst, das hält die Seite schlank. */
function pixels(width, height) {
  const cells = new Array(width * height).fill(null);
  const set = (x, y, color) => { if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = color; };
  const rect = (x, y, w, h2, color) => { for (let j = 0; j < h2; j++) for (let i = 0; i < w; i++) set(x + i, y + j, color); };
  const sprite = (rows, x, y, palette) => rows.forEach((row, j) => [...row].forEach((ch, i) => { if (palette[ch]) set(x + i, y + j, palette[ch]); }));
  const svg = (fit = 'xMidYMid meet') => {
    const paths = new Map();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width;) {
        const color = cells[y * width + x];
        let run = 1;
        while (x + run < width && cells[y * width + x + run] === color) run++;
        if (color) paths.set(color, `${paths.get(color) ?? ''}M${x} ${y}h${run}v1h-${run}z`);
        x += run;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${fit}" shape-rendering="crispEdges">${
      [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('')}</svg>`;
  };
  return { set, rect, sprite, svg };
}

// ---------------------------------------------------------------- Block-Welt: Motive

const GEM = ['..aaaa..', '.abbbcc.', 'aabbbccc', '.abbbcc.', '..abcc..', '...bc...'];
const GEM_COLORS = { a: '#b8f5ec', b: '#4fd1c0', c: '#1f9c94' };
const PICK = ['....www.', '..wwwww.', '.www.hww', 'ww..h.ww', '...h..w.', '..h.....', '.h......', 'h.......'];
const PICK_COLORS = { w: '#59616b', h: '#6b4426' };
const CRACK = ['..k.....', '..kk....', '...k.k..', '...kkk..', '.....k..', '.....kk.'];
const CHECK = ['......cc', '.....cc.', 'c...cc..', 'cc.cc...', '.ccc....', '..c.....'];
const BAND = ['bbbbbbbb', '........', '........', 'bbbbbbbb', '........', '........', 'bbbbbbbb'];
const CHEST = ['bbbbbbbbbb', 'bmmmmmmmmb', 'bmmmmmmmmb', 'bbbbggbbbb', 'bmmmggmmmb', 'bmmmmmmmmb', 'bmmmmmmmmb', 'bbbbbbbbbb'];
const CHEST_OPEN = ['.bbbbbbbb.', 'bddddddddb', 'bddddddddb', 'bbbbbbbbbb', 'bmmmggmmmb', 'bmmmmmmmmb', 'bmmmmmmmmb', 'bbbbbbbbbb'];
const WOOD = { b: '#5f3d20', m: '#a9713c', g: '#f2c94c', d: '#2a1a10' };
const IRON = { b: '#41464d', m: '#737a84', g: '#a7aeb8', d: '#23262b' };

const STONE = ['#9a9ea3', '#b7bbc0', '#74787d'];
const TILES = {
  todo: { base: STONE },
  visited: { base: STONE, draw: (p) => p.sprite(CRACK, 2, 3, { k: '#4b4e52' }) },
  next: { base: ['#e0bc6a', '#f0d48f', '#b8923f'], draw: (p) => p.sprite(PICK, 2, 2, PICK_COLORS) },
  mastered: { base: ['#1f5f66', '#2f8088', '#143f45'], draw: (p) => p.sprite(GEM, 2, 3, GEM_COLORS) },
  parked: { base: ['#a9794a', '#c49766', '#7d5630'], draw: (p) => p.sprite(BAND, 2, 2, { b: '#6b4426' }) },
  fold: { base: ['#1f5f66', '#2f8088', '#143f45'], draw: (p) => p.sprite(CHECK, 2, 3, { c: '#b8f5ec' }) },
  'chest-locked': { base: ['#3b3f46', '#4a4f57', '#2b2e33'], draw: (p) => p.sprite(CHEST, 1, 2, IRON) },
  chest: { base: ['#4b2f63', '#654283', '#352145'], draw: (p) => p.sprite(CHEST, 1, 2, WOOD) },
  'chest-open': {
    base: ['#4b2f63', '#654283', '#352145'],
    draw: (p) => {
      p.sprite(CHEST_OPEN, 1, 3, WOOD);
      p.rect(3, 1, 2, 2, '#4fd1c0');
      p.rect(7, 1, 2, 2, '#f2c94c');
    },
  },
};

const tileCache = new Map();
function tileSvg(kind) {
  if (!tileCache.has(kind)) {
    const { base: [fill, light, dark], draw } = TILES[kind];
    const p = pixels(12, 12);
    const r = seeded(hash(kind));
    p.rect(0, 0, 12, 12, fill);
    for (let i = 0; i < 9; i++) p.set(1 + Math.floor(r() * 10), 1 + Math.floor(r() * 10), r() < 0.5 ? light : dark);
    p.rect(0, 0, 12, 1, light);
    p.rect(0, 0, 1, 12, light);
    p.rect(0, 11, 12, 1, dark);
    p.rect(11, 0, 1, 12, dark);
    draw?.(p);
    tileCache.set(kind, p.svg());
  }
  return tileCache.get(kind);
}

// ---------------------------------------------------------------- Block-Welt: Biome

const roundTree = (leaf, trunk = '#6b4426') => (p, x, y) => {
  p.rect(x + 2, y - 3, 1, 3, trunk);
  p.rect(x, y - 6, 5, 3, leaf);
  p.rect(x + 1, y - 7, 3, 1, leaf);
};
const pine = (leaf, tip = leaf) => (p, x, y) => {
  p.rect(x + 2, y - 2, 1, 2, '#5a3d24');
  p.rect(x, y - 4, 5, 2, leaf);
  p.rect(x + 1, y - 6, 3, 2, leaf);
  p.rect(x + 2, y - 8, 1, 2, tip);
};
const cactus = (p, x, y) => {
  p.rect(x + 2, y - 6, 1, 6, '#4f8f4a');
  p.rect(x, y - 4, 2, 1, '#4f8f4a');
  p.rect(x, y - 5, 1, 1, '#4f8f4a');
  p.rect(x + 3, y - 3, 2, 1, '#4f8f4a');
  p.rect(x + 4, y - 5, 1, 2, '#4f8f4a');
};
const rock = (p, x, y) => { p.rect(x, y - 2, 4, 2, '#6f747c'); p.rect(x + 1, y - 3, 2, 1, '#8a9099'); };
const crystal = (color) => (p, x, y) => { p.rect(x + 1, y - 6, 1, 6, color); p.rect(x, y - 3, 1, 3, color); p.rect(x + 2, y - 4, 1, 4, color); };
const mushroom = (cap) => (p, x, y) => { p.rect(x + 2, y - 3, 1, 3, '#efe3cf'); p.rect(x, y - 5, 5, 2, cap); p.rect(x + 1, y - 6, 3, 1, cap); p.set(x + 1, y - 5, '#ffffff'); p.set(x + 3, y - 5, '#ffffff'); };
const palm = (p, x, y) => {
  p.rect(x + 2, y - 7, 1, 7, '#8a6238');
  p.rect(x, y - 8, 5, 1, '#3f9a55');
  p.set(x - 1, y - 7, '#3f9a55');
  p.set(x + 5, y - 7, '#3f9a55');
};

const BIOMES = [
  { sky: ['#8fd0e8', '#c9ebf2'], far: '#8cb98a', top: '#6fae4f', ground: '#8a6a45', spots: '#74583a', sun: '#fff1a8', decor: [roundTree('#3f8f3f')] },
  { sky: ['#a8d8c8', '#d6efd8'], far: '#4f7f5a', top: '#3f7d3a', ground: '#5f4a32', spots: '#4e3c28', sun: '#fff7c8', decor: [pine('#2f6b3a'), pine('#3f7f45')], dense: true },
  { sky: ['#f3d9a0', '#fbeccb'], far: '#d9b36a', top: '#e3c078', ground: '#c79a55', spots: '#b08645', sun: '#fff3b0', decor: [cactus] },
  { sky: ['#bcd6ea', '#e4eff6'], far: '#9fb6c9', top: '#f2f6fa', ground: '#8fa3b5', spots: '#7d90a2', sun: '#ffffff', decor: [pine('#4d7a70', '#f2f6fa')] },
  { sky: ['#9fc3e0', '#d2e4f0'], far: '#7a7f8c', top: '#8d9199', ground: '#6a6e76', spots: '#5a5e66', sun: '#fff7c8', decor: [rock], peaks: true },
  { sky: ['#2f2a45', '#45395f'], far: '#3a3358', top: '#5a4f7d', ground: '#2b2740', spots: '#231f35', cave: true, decor: [crystal('#62e0d0'), crystal('#e07ad8')] },
  { sky: ['#f1c89a', '#f8e3c6'], far: '#c98a4b', top: '#b9722e', ground: '#6b4a2f', spots: '#5a3d26', sun: '#ffe9a8', decor: [roundTree('#d9622b'), roundTree('#e0a02f')] },
  { sky: ['#8fd6f0', '#d5f1f7'], far: '#a9dcea', top: '#edd7a0', ground: '#cfb27a', spots: '#b89a64', sun: '#fff1a8', decor: [palm], sea: true },
  { sky: ['#4a2430', '#7a3a30'], far: '#5a2c2c', top: '#4d4148', ground: '#322a30', spots: '#e0602b', cave: true, decor: [rock] },
  { sky: ['#c8b6e8', '#e7dcf5'], far: '#9c86c4', top: '#8a6bb0', ground: '#5c4478', spots: '#4d3866', sun: '#fff1d6', decor: [mushroom('#d9483b'), mushroom('#3f9fd0')] },
];

function drawLandscape(biome, seed, width, height) {
  const p = pixels(width, height);
  const r = seeded(seed);
  const split = Math.floor(height * 0.4);
  p.rect(0, 0, width, split, biome.sky[0]);
  p.rect(0, split, width, height - split, biome.sky[1]);
  for (let x = 0; x < width; x++) if (x % 2 === 0) p.set(x, split, biome.sky[0]);

  if (biome.sun) { const sx = 10 + Math.floor(r() * (width - 24)); p.rect(sx, 2, 5, 5, biome.sun); }
  if (biome.cave) for (let x = 0; x < width; x += 3 + Math.floor(r() * 5)) p.rect(x, 0, 2, 1 + Math.floor(r() * 4), biome.far);
  else for (let i = 0; i < 2; i++) { const cx = Math.floor(r() * (width - 14)); const cy = 2 + Math.floor(r() * 4); p.rect(cx, cy, 10, 2, '#ffffff'); p.rect(cx + 3, cy - 1, 4, 1, '#ffffff'); }

  // Hügel im Hintergrund
  let far = height - 11;
  for (let x = 0; x < width; x += 2) {
    far += Math.floor(r() * 3) - 1;
    if (biome.peaks) far = height - 12 + Math.abs(((x + (seed % 23)) % 24) - 12) - 5;
    far = Math.max(5, Math.min(height - 7, far));
    p.rect(x, far, 2, height - far, biome.far);
  }

  // Boden
  const ground = [];
  let y = height - 6;
  for (let x = 0; x < width; x += 3) {
    y = Math.max(height - 8, Math.min(height - 4, y + Math.floor(r() * 3) - 1));
    for (let i = 0; i < 3; i++) ground[x + i] = y;
  }
  const shore = biome.sea ? Math.floor(width * 0.68) : width;
  for (let x = 0; x < width; x++) {
    if (x >= shore) {
      p.rect(x, height - 5, 1, 5, '#3f9fd0');
      if ((x + seed) % 7 < 2) p.set(x, height - 5, '#bfe8f5');
      continue;
    }
    p.rect(x, ground[x], 1, height - ground[x], biome.ground);
    p.rect(x, ground[x], 1, 2, biome.top);
    if (r() < 0.14) p.set(x, Math.min(height - 1, ground[x] + 3), biome.spots);
  }

  const groundAt = (x) => ground[Math.max(0, Math.min(shore - 1, x))];
  return { p, r, groundAt, shore };
}

/** Landschaft einer Linie: Für jede gemeisterte Station steht ein Wimpel, nach der Prüfung eine offene Truhe. */
function biomeSvg(index, seedText, done = 0, passed = false, width = 120, height = 24) {
  const biome = BIOMES[index % BIOMES.length];
  const { p, r, groundAt, shore } = drawLandscape(biome, hash(seedText), width, height);
  for (let x = 3 + Math.floor(r() * 5); x < Math.min(shore, width) - 6; x += (biome.dense ? 7 : 12) + Math.floor(r() * 8)) {
    biome.decor[Math.floor(r() * biome.decor.length)](p, x, groundAt(x + 2));
  }
  for (let i = 0; i < done; i++) {
    const x = 16 + i * 14;
    const y = groundAt(x);
    p.rect(x, y - 8, 1, 8, '#efe3cf');
    p.sprite(['rrrr', 'rrr.', 'rr..'], x + 1, y - 8, { r: '#d9383a' });
  }
  if (passed) {
    const x = Math.min(shore, width) - 16;
    p.sprite(CHEST_OPEN, x, groundAt(x + 5) - 8, WOOD);
    p.rect(x + 2, groundAt(x + 5) - 10, 2, 2, '#4fd1c0');
    p.rect(x + 6, groundAt(x + 5) - 10, 2, 2, '#f2c94c');
  }
  return p.svg('xMidYMax slice');
}

function arrivalChest(rating, passed) {
  const p = pixels(40, 18);
  const gems = passed ? 5 : rating;
  p.rect(0, 15, 40, 3, '#6b4a2f');
  p.rect(0, 15, 40, 1, '#6fae4f');
  p.sprite(CHEST_OPEN, 15, 7, WOOD);
  for (let i = 0; i < gems; i++) {
    const x = [17, 22, 19, 14, 24][i];
    const y = [4, 4, 1, 2, 1][i];
    p.rect(x, y, 2, 2, i % 2 ? '#f2c94c' : '#4fd1c0');
    p.set(x, y, '#ffffff');
  }
  return p.svg();
}

// ---------------------------------------------------------------- Ruhig: Pflanze

/** Für jeden Schritt ein Blatt, am Ende (bloom) eine Blüte. */
function plantSvg(stage, max, bloom) {
  const progress = Math.min(stage / Math.max(max, 1), 1);
  const base = 50;
  const top = base - (10 + 30 * progress);
  const count = Math.min(stage, 6);
  const leaves = Array.from({ length: count }, (_, i) => {
    const y = base - ((i + 1) / (count + 1)) * (base - top);
    const side = i % 2 ? -1 : 1;
    const size = 0.85 - i * 0.05;
    return `<path class="leaf" transform="translate(32 ${y.toFixed(1)}) scale(${(side * size).toFixed(2)} ${size.toFixed(2)})" d="M0 0C3-6 10-7 15-5C13 1 6 4 0 0Z"/>`;
  }).join('');
  const crown = bloom
    ? `<g transform="translate(32 ${top})">${[0, 72, 144, 216, 288].map((a) => `<ellipse class="petal" rx="3.6" ry="6" cy="-6" transform="rotate(${a})"/>`).join('')}<circle class="heart" r="3.4"/></g>`
    : `<path class="leaf" transform="translate(32 ${top}) scale(0.5)" d="M0 0C-6-4-7-11-4-16C2-13 5-6 0 0Z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path class="stem" d="M32 ${base}Q34 ${((base + top) / 2).toFixed(1)} 32 ${top}"/>${leaves}${crown}<path class="pot" d="M21 50h22l-3 11H24z"/></svg>`;
}

// ---------------------------------------------------------------- Für die Seiten

/** Landschafts-Band oben an einer Linie (nur Block-Welt). */
export function lineBanner(index, line, done, passed) {
  return W.id === 'block' ? art('art-banner', biomeSvg(index, line.id, done, passed)) : null;
}

/** Symbol neben dem Namen einer Linie (nur Ruhig). */
export function lineIcon(done, total, passed) {
  return W.id === 'ruhig' ? art('art-plant', plantSvg(done, total, passed)) : null;
}

/** Inhalt eines Haltepunkts: todo, visited, next, mastered, parked, fold, chest-locked, chest, chest-open (nur Block-Welt). */
export function stopArt(kind) {
  return W.id === 'block' ? art('art-tile', tileSvg(kind)) : null;
}

/** Landschaft über der Begrüßung (nur Block-Welt). */
export function helloBanner(child) {
  return W.id === 'block' ? art('art-banner.art-hello', biomeSvg(child.id, `hello-${child.id}`, 0, false, 120, 18)) : null;
}

/** Bild auf der Ankunftskarte. */
export function arrivalArt(rating, passed) {
  if (W.id === 'block') return art('art-arrival', arrivalChest(rating, passed));
  if (W.id === 'ruhig') return art('art-arrival.art-plant', plantSvg(rating, 3, passed || rating === 3));
  return null;
}
