// Avatare: Katzen als SVG, dazu Skins (Accessoires), die man bei Ereignissen sammelt.
// Reine Daten und Zeichnung ohne DOM, damit Server (Prüfung, Vergabe) und Browser dasselbe Verzeichnis benutzen.

/** Fellfarben. Der Avatar eines Profils ist 'cat:<id>' (alles andere ist ein Emoji aus der alten Auswahl). */
export const CATS = {
  black: { name: 'Schwarze Katze', fur: '#2d2d34', line: '#16161a', muzzle: '#4a4a54', earIn: '#8a5a70', eye: '#f1c933', stripes: null },
  white: { name: 'Weiße Katze', fur: '#fbfbfb', line: '#b9bec6', muzzle: '#ffffff', earIn: '#f6b8c4', eye: '#5aa9e6', stripes: null },
  brown: { name: 'Braune Katze', fur: '#8b5a3c', line: '#4e301d', muzzle: '#b8845c', earIn: '#e8a2a2', eye: '#6dbb5a', stripes: null },
  tabby: { name: 'Getigerte Katze', fur: '#c99a68', line: '#5a3a22', muzzle: '#ecd2ae', earIn: '#e8a2a2', eye: '#e0a82e', stripes: '#6e4627' },
};

/**
 * Skins. pool: wo er herkommt – 'line' fällt beim ersten Bestehen eines Endbahnhofs (zufällig, was noch fehlt),
 * 'special' gibt es nur als Geschenk der Eltern oder bei besonderen Anlässen.
 */
export const SKINS = {
  party: {
    name: 'Partyhut', pool: 'line',
    svg: `<path d="M100 8 L70 64 L130 64 Z" fill="#ef5da8" stroke="#a02a6a" stroke-width="3" stroke-linejoin="round"/>
      <path d="M86 38 L114 38 M78 52 L122 52" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/>
      <circle cx="100" cy="10" r="8" fill="#ffe27a" stroke="#c9a227" stroke-width="2"/>`,
  },
  sunglasses: {
    name: 'Sonnenbrille', pool: 'line',
    svg: `<g fill="#1c1c22" stroke="#000" stroke-width="3" stroke-linejoin="round">
        <rect x="48" y="92" width="44" height="30" rx="12"/><rect x="108" y="92" width="44" height="30" rx="12"/>
      </g>
      <path d="M92 102 Q100 96 108 102" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
      <path d="M56 100 L66 100 M116 100 L126 100" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>`,
  },
  scarf: {
    name: 'Schal', pool: 'line',
    svg: `<path d="M42 158 Q100 186 158 158 L162 178 Q100 206 38 178 Z" fill="#e0483e" stroke="#8e231c" stroke-width="3" stroke-linejoin="round"/>
      <path d="M124 184 L136 200 L156 194 L146 172 Z" fill="#e0483e" stroke="#8e231c" stroke-width="3" stroke-linejoin="round"/>
      <path d="M62 172 L66 186 M86 180 L88 194 M110 182 L110 196" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  },
  crown: {
    name: 'Krone', pool: 'special',
    svg: `<path d="M62 64 L68 28 L86 50 L100 20 L114 50 L132 28 L138 64 Z" fill="#f6c431" stroke="#a87a0c" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="100" cy="46" r="5" fill="#e0483e"/><circle cx="76" cy="52" r="4" fill="#5aa9e6"/><circle cx="124" cy="52" r="4" fill="#5aa9e6"/>`,
  },
};

export const isCat = (value) => typeof value === 'string' && value.startsWith('cat:') && value.slice(4) in CATS;
export const isSkin = (id) => typeof id === 'string' && id in SKINS;

const catParts = (c, closed = false) => {
  const st = c.stripes;
  const stripes = st
    ? `<g stroke="${st}" stroke-width="6" stroke-linecap="round" fill="none">
        <path d="M100 52 L100 74"/><path d="M82 56 L87 74"/><path d="M118 56 L113 74"/>
        <path d="M36 108 L56 112"/><path d="M36 124 L56 124"/><path d="M164 108 L144 112"/><path d="M164 124 L144 124"/>
      </g>
      <path d="M48 36 L58 56 M152 36 L142 56" stroke="${st}" stroke-width="5" stroke-linecap="round"/>`
    : '';
  const eye = (x) => closed
    ? `<path d="M${x - 13} 108 Q${x} 121 ${x + 13} 108" fill="none" stroke="${c.line}" stroke-width="6" stroke-linecap="round"/>`
    : `<ellipse cx="${x}" cy="108" rx="13" ry="16" fill="${c.eye}" stroke="${c.line}" stroke-width="2"/>
    <ellipse cx="${x}" cy="108" rx="5" ry="12" fill="#111"/><circle cx="${x + 4}" cy="101" r="3.5" fill="#fff"/>`;
  return `<g stroke="${c.line}" stroke-width="4" stroke-linejoin="round">
      <path d="M36 104 L38 26 Q39 20 45 23 L98 54 Z" fill="${c.fur}"/>
      <path d="M164 104 L162 26 Q161 20 155 23 L102 54 Z" fill="${c.fur}"/>
      <ellipse cx="100" cy="112" rx="70" ry="62" fill="${c.fur}"/>
    </g>
    <path d="M50 86 L51 44 L82 62 Z" fill="${c.earIn}"/><path d="M150 86 L149 44 L118 62 Z" fill="${c.earIn}"/>
    ${stripes}
    <ellipse cx="100" cy="140" rx="26" ry="17" fill="${c.muzzle}"/>
    ${eye(70)}${eye(130)}
    <path d="M93 127 L107 127 L100 136 Z" fill="#f08a9c" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M100 136 Q100 146 90 148 M100 136 Q100 146 110 148" fill="none" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>
    <g stroke="${c.line}" stroke-width="2" stroke-linecap="round" opacity=".7">
      <path d="M72 138 L36 132"/><path d="M72 144 L38 148"/><path d="M128 138 L164 132"/><path d="M128 144 L162 148"/>
    </g>`;
};

/** SVG-Text für einen Avatar (mit optionalem Skin) oder null, wenn der Avatar ein Emoji ist. */
export function avatarSvg(avatar, skin) {
  if (!isCat(avatar)) return null;
  const cat = CATS[avatar.slice(4)];
  return `<svg viewBox="0 0 200 204" role="img" aria-label="${cat.name}${isSkin(skin) ? ` mit ${SKINS[skin].name}` : ''}">${catParts(cat)}${isSkin(skin) ? SKINS[skin].svg : ''}</svg>`;
}

/**
 * Zusammengerollt schlafende Katze (mit optionalem Skin) für den Companion bei der Fahrt.
 * Körper und Kopf tragen die Klassen breath-body/breath-head, die das CSS langsam atmen lässt.
 */
export function sleepSvg(avatar, skin) {
  if (!isCat(avatar)) return null;
  const c = CATS[avatar.slice(4)];
  const st = c.stripes;
  const stripes = st
    ? `<path d="M112 54 L114 72 M142 52 L144 70 M172 58 L172 76" stroke="${st}" stroke-width="6" stroke-linecap="round" fill="none"/>`
    : '';
  const tail = 'M220 104 Q228 150 140 148 Q96 148 78 136';
  return `<svg viewBox="0 -22 240 194" role="img" aria-label="${c.name}, schlafend${isSkin(skin) ? ` mit ${SKINS[skin].name}` : ''}">
    <g class="breath-body">
      <ellipse cx="130" cy="98" rx="96" ry="48" fill="${c.fur}" stroke="${c.line}" stroke-width="4"/>
      <path d="${tail}" fill="none" stroke="${c.line}" stroke-width="26" stroke-linecap="round"/>
      <path d="${tail}" fill="none" stroke="${c.fur}" stroke-width="18" stroke-linecap="round"/>
      ${stripes}
    </g>
    <g class="breath-head"><g transform="translate(14 44) scale(.62)">${catParts(c, true)}${isSkin(skin) ? SKINS[skin].svg : ''}</g></g>
    <ellipse cx="122" cy="146" rx="17" ry="9" fill="${c.fur}" stroke="${c.line}" stroke-width="3"/>
    <g class="zzz" fill="${c.line === '#16161a' ? '#8a8aa0' : c.line}" font-family="sans-serif" font-weight="700">
      <text x="104" y="42" font-size="20">z</text><text x="124" y="28" font-size="26">z</text><text x="148" y="12" font-size="32">Z</text>
    </g>
  </svg>`;
}

/** Text für Stellen, an denen kein SVG möglich ist (Auswahllisten). */
export const avatarText = (avatar) => (isCat(avatar) ? '🐱' : avatar);
