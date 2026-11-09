/**
 * Themen: Worte, Symbole und Ränge, mit denen die App zum Kind spricht. Das Aussehen steht in app.css
 * (Abschnitt „Themen“, [data-thema='…']). Browser und Server nutzen beide diese Datei.
 *
 * Ein neues Thema: unten in THEMES eintragen und in app.css Farben ergänzen. Die Sätze stehen im Code bei ihrer
 * Verwendung und setzen die Wörter ein, z. B. `${cap(W.ride.dein('nom', 'nächst'))} bringt doppelte Sterne!`.
 * Darum braucht jedes Wort nur Einzahl, Mehrzahl, Geschlecht und die Präposition („auf der Station“, „im Level“).
 */

const ART = {
  der: { f: ['die', 'die', 'der', 'der'], m: ['der', 'den', 'dem', 'des'], n: ['das', 'das', 'dem', 'des'] },
  ein: { f: ['eine', 'eine', 'einer', 'einer'], m: ['ein', 'einen', 'einem', 'eines'], n: ['ein', 'ein', 'einem', 'eines'] },
  dies: { f: ['diese', 'diese', 'dieser', 'dieser'], m: ['dieser', 'diesen', 'diesem', 'dieses'], n: ['dieses', 'dieses', 'diesem', 'dieses'] },
  jed: { f: ['jede', 'jede', 'jeder', 'jeder'], m: ['jeder', 'jeden', 'jedem', 'jedes'], n: ['jedes', 'jedes', 'jedem', 'jedes'] },
};
const CASE = { nom: 0, acc: 1, dat: 2, gen: 3 };

/** Adjektiv-Endung: nach der/dieser/jeder (schwach), nach ein/dein (gemischt), ohne Artikel (stark, nur nom/acc). */
function ending(type, g, c) {
  if (c === 'dat' || c === 'gen') return 'en';
  if (type === 'weak') return g === 'm' && c === 'acc' ? 'en' : 'e';
  if (g === 'f') return 'e';
  if (g === 'n') return 'es';
  return c === 'acc' ? 'en' : 'er';
}

function noun(s, p, g, prep = 'auf') {
  const gen = g === 'f' ? s : `${s}${s.endsWith('s') ? 'es' : 's'}`;
  const pDat = /[ns]$/.test(p) ? p : `${p}n`;
  const article = (kind, c) => (kind === 'dein' ? `d${ART.ein[g][CASE[c]]}` : ART[kind][g][CASE[c]]);
  const phrase = (kind, c, adj) => {
    const type = kind === 'ein' || kind === 'dein' ? 'mixed' : 'weak';
    return `${article(kind, c)} ${adj ? `${adj}${ending(type, g, c)} ` : ''}${c === 'gen' ? gen : s}`;
  };
  const withPrep = (rest) => `${prep} ${rest}`;
  const dem = article('der', 'dat');
  return {
    s, p, pDat, g,
    art: article,
    der: (c = 'nom', adj) => phrase('der', c, adj),
    ein: (c = 'nom', adj) => phrase('ein', c, adj),
    dein: (c = 'nom', adj) => phrase('dein', c, adj),
    dies: (c = 'nom') => phrase('dies', c),
    jed: (c = 'nom') => phrase('jed', c),
    /** Ohne Artikel: „kurze Fahrt“, „gutes Level“ */
    bare: (adj, c = 'nom') => `${adj}${ending('strong', g, c)} ${s}`,
    /** „die“ / „das“ / „der“ als Rückbezug: „… – die sitzt!“ */
    pron: ART.der[g][0],
    /** „sie“ / „es“ / „ihn“ als Objekt: „Schaffst du sie …“ */
    pronAcc: { f: 'sie', m: 'ihn', n: 'es' }[g],
    /** „Sie“ / „Es“ / „Er“ */
    Pron: { f: 'Sie', m: 'Er', n: 'Es' }[g],
    /** „auf der Station“ / „im Level“ */
    on: prep === 'in' && dem === 'dem' ? `im ${s}` : withPrep(`${dem} ${s}`),
    onThis: withPrep(phrase('dies', 'dat')),
    onOthers: withPrep(`anderen ${pDat}`),
    onOthersThe: withPrep(`den anderen ${pDat}`),
    onEin: (adj) => withPrep(phrase('ein', 'dat', adj)),
    /** „Zum Netzplan“ / „Zur Weltkarte“ */
    zu: `${g === 'f' ? 'Zur' : 'Zum'} ${s}`,
  };
}

/** Großer Anfangsbuchstabe am Satzanfang. */
export const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function define(theme) {
  const short = (line) => line.short ?? line.name.replace(/[- ]Linie$/, '');
  return {
    ...theme,
    /** Name einer Linie: Die Zug-Welt nennt sie „Karteikarten-Linie“, die anderen nur „Karteikarten“. */
    lineName: (line) => (theme.fullLineNames ? line.name : short(line)),
    /** „der Karteikarten-Linie“ / „von „Karteikarten““ (Besitz, nach „alle Stationen“) */
    lineOf: (line) => (theme.fullLineNames ? `der ${line.name}` : `von „${short(line)}“`),
    /** Abzeichen in den Worten des Themas (badges.js enthält die Zug-Fassung). */
    badge: (b) => (theme.badges?.[b.id] ? { ...b, ...theme.badges[b.id] } : b),
  };
}

export const DEFAULT_THEME = 'zug';

export const THEMES = {
  zug: define({
    id: 'zug', name: 'Bahn', icon: '🚆', desc: 'Der Netzplan mit Linien, Stationen und Zügen.', color: '#15213B',
    fullLineNames: true,
    map: noun('Netzplan', 'Netzpläne', 'm'),
    line: noun('Linie', 'Linien', 'f'),
    station: noun('Station', 'Stationen', 'f'),
    ride: noun('Fahrt', 'Fahrten', 'f'),
    terminus: noun('Endbahnhof', 'Endbahnhöfe', 'm'),
    plan: noun('Fahrplan', 'Fahrpläne', 'm'),
    item: noun('Zug', 'Züge', 'm'),
    icons: { ride: '🚆', next: '🚉', terminus: '🏁', parked: '🅿️', map: '🗺️', tab: '🚂' },
    say: {
      where: 'Wohin fährst du heute?', done: 'gefahren', again: 'Nochmal fahren', start: 'Losfahren', goThere: 'Hinfahren',
      next: 'Nächster Halt', nextDat: 'beim nächsten Halt',
      exit: 'Hier aussteigen?', exitOk: 'Aussteigen', exitNo: 'Weiterfahren',
      eyebrow: 'Endstation', retry: 'anfahren', arriving: 'Einfahrt in den Bahnhof …', arrived: 'Angekommen!',
      terminusDone: 'Endbahnhof erreicht', exam: 'Endbahnhof-Prüfung', planDone: 'Tagesfahrplan erfüllt!',
      parkedFlag: 'Abstellgleis', parkedTo: 'aufs Abstellgleis', parkedIs: 'steht auf dem Abstellgleis', parkedTitle: 'Ab aufs Abstellgleis!',
      closed: 'außer Betrieb', open: 'in Betrieb', through: 'fährst du durch die Übungen',
    },
    combos: { 3: 'Schnellzug!', 5: 'ICE!', 8: 'Hochgeschwindigkeit!', 12: 'Rekordfahrt!' },
    ranks: [
      { name: 'Fahrgast', train: '🚆' },
      { name: 'Schaffner-Azubi', train: '🚋' },
      { name: 'Schaffner', train: '🚃' },
      { name: 'Rangierer', train: '🚂' },
      { name: 'Lokführer-Azubi', train: '🚇' },
      { name: 'Lokführer', train: '🚝' },
      { name: 'Zugchef', train: '🚄' },
      { name: 'ICE-Kapitän', train: '🚅' },
      { name: 'Streckenlegende', train: '🚀' },
    ],
  }),

  block: define({
    id: 'block', name: 'Block-Welt', icon: '⛏️', desc: 'Erkunden, graben, Schätze finden. Alles eckig.', color: '#3F5A2A',
    map: noun('Weltkarte', 'Weltkarten', 'f'),
    line: noun('Biom', 'Biome', 'n', 'in'),
    station: noun('Level', 'Level', 'n', 'in'),
    ride: noun('Expedition', 'Expeditionen', 'f'),
    terminus: noun('Schatzkammer', 'Schatzkammern', 'f', 'in'),
    plan: noun('Bauplan', 'Baupläne', 'm'),
    item: noun('Ausrüstung', 'Ausrüstung', 'f'),
    icons: { ride: '⛏️', next: '🧭', terminus: '💎', parked: '📦', map: '🗺️', tab: '⛏️' },
    say: {
      where: 'Wohin geht es heute?', done: 'erkundet', again: 'Nochmal los', start: 'Losziehen', goThere: 'Hingehen',
      next: 'Nächstes Level', nextDat: 'im nächsten Level',
      exit: 'Hier umkehren?', exitOk: 'Umkehren', exitNo: 'Weitergraben',
      eyebrow: 'Expedition beendet', retry: 'betreten', arriving: 'Die Ausbeute wird gezählt …', arrived: 'Zurück im Lager!',
      terminusDone: 'Schatzkammer geöffnet', exam: 'Schatzkammer-Probe', planDone: 'Tages-Bauplan erfüllt!',
      parkedFlag: 'In der Truhe', parkedTo: 'in die Truhe', parkedIs: 'liegt in der Truhe', parkedTitle: 'Ab in die Truhe!',
      closed: 'gesperrt', open: 'offen', through: 'gräbst du dich durch die Übungen',
    },
    combos: { 3: 'Erzader!', 5: 'Funkenregen!', 8: 'Schatzfund!', 12: 'Legendär!' },
    ranks: [
      { name: 'Holz', train: '🪵' },
      { name: 'Stein', train: '🪨' },
      { name: 'Kupfer', train: '🔨' },
      { name: 'Eisen', train: '⛏️' },
      { name: 'Silber', train: '⚒️' },
      { name: 'Gold', train: '🪙' },
      { name: 'Kristall', train: '🔮' },
      { name: 'Diamant', train: '💎' },
      { name: 'Legende', train: '👑' },
    ],
    badges: {
      start: { icon: '⛏️', name: 'Erster Schlag' },
      master1: { name: 'Erstes Level gemeistert', desc: 'Ein Level mit 3 Sternen abgeschlossen' },
      master5: { name: 'Fünf Level', desc: '5 Level mit 3 Sternen abgeschlossen' },
      master15: { name: 'Weltenkenner', desc: '15 Level mit 3 Sternen abgeschlossen' },
      plan1: { name: 'Nach Bauplan', desc: 'Zum ersten Mal den Tages-Bauplan erfüllt' },
      plan10: { name: 'Fleißig am Bau' },
      exam1: { icon: '💎', name: 'Schatzkammer', desc: 'Die erste Schatzkammer geöffnet' },
      exam3: { icon: '🏰', name: 'Schatzsuche', desc: '3 Schatzkammern geöffnet' },
      rank5: { icon: '⚒️', name: 'Gut gerüstet', desc: 'Rang „Silber“ erreicht' },
    },
  }),

  ruhig: define({
    id: 'ruhig', name: 'Ruhig', icon: '🌿', desc: 'Schlicht und übersichtlich, ohne Spielerei.', color: '#2C2A33',
    map: noun('Lernplan', 'Lernpläne', 'm'),
    line: noun('Kurs', 'Kurse', 'm', 'in'),
    station: noun('Lektion', 'Lektionen', 'f', 'in'),
    ride: noun('Runde', 'Runden', 'f', 'in'),
    terminus: noun('Abschluss', 'Abschlüsse', 'm', 'in'),
    plan: noun('Tagesplan', 'Tagespläne', 'm'),
    item: noun('Symbol', 'Symbole', 'n'),
    icons: { ride: '✏️', next: '📖', terminus: '🎓', parked: '✅', map: '📋', tab: '🌿' },
    say: {
      where: 'Was steht heute an?', done: 'geübt', again: 'Nochmal üben', start: 'Starten', goThere: 'Ansehen',
      next: 'Nächste Lektion', nextDat: 'in der nächsten Lektion',
      exit: 'Hier aufhören?', exitOk: 'Aufhören', exitNo: 'Weitermachen',
      eyebrow: 'Ergebnis', retry: 'versuchen', arriving: 'Wird ausgewertet …', arrived: 'Geschafft!',
      terminusDone: 'Abschluss geschafft', exam: 'Abschlussprüfung', planDone: 'Tagesplan erfüllt!',
      parkedFlag: 'Gemeistert', parkedTo: 'in die Ablage', parkedIs: 'liegt in der Ablage', parkedTitle: 'Gemeistert und abgelegt!',
      closed: 'pausiert', open: 'aktiv', through: 'gehst du durch die Übungen',
    },
    combos: { 3: 'Gut im Flow!', 5: 'Konzentriert!', 8: 'Sehr stark!', 12: 'Bestleistung!' },
    ranks: [
      { name: 'Neugierig', train: '🌱' },
      { name: 'Am Ball', train: '🌿' },
      { name: 'Konzentriert', train: '🪴' },
      { name: 'Sicher', train: '🌳' },
      { name: 'Routiniert', train: '📓' },
      { name: 'Fortgeschritten', train: '✒️' },
      { name: 'Souverän', train: '🔭' },
      { name: 'Expertenniveau', train: '🎓' },
      { name: 'Meisterklasse', train: '✨' },
    ],
    badges: {
      start: { icon: '🌱', name: 'Der Anfang' },
      master1: { name: 'Erste Lektion gemeistert', desc: 'Eine Lektion mit 3 Sternen abgeschlossen' },
      master5: { name: 'Fünf Lektionen', desc: '5 Lektionen mit 3 Sternen abgeschlossen' },
      master15: { name: 'Gut im Stoff', desc: '15 Lektionen mit 3 Sternen abgeschlossen' },
      plan1: { name: 'Nach Plan', desc: 'Zum ersten Mal den Tagesplan erfüllt' },
      plan10: { name: 'Verlässlich' },
      exam1: { icon: '🎓', name: 'Abschluss', desc: 'Den ersten Abschluss bestanden' },
      exam3: { icon: '📜', name: 'Drei Abschlüsse', desc: '3 Abschlüsse bestanden' },
      rank5: { icon: '📓', name: 'Auf Kurs', desc: 'Rang „Routiniert“ erreicht' },
    },
  }),
};

export const themeOf = (id) => THEMES[id] ?? THEMES[DEFAULT_THEME];

/** Browser: das aktive Thema. Der Server fragt stattdessen worldOf(childId) in progress.js. */
export let W = themeOf(DEFAULT_THEME);

/** Browser: schaltet Worte und Aussehen um (ohne id: die Standard-Welt, z. B. auf der Profilauswahl und im Elternbereich). */
export function applyTheme(id) {
  W = themeOf(id);
  document.documentElement.dataset.thema = W.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', W.color);
}
