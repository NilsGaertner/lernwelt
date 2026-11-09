import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { shortHash, DATA_DIR } from './util.js';

/** Die mitgelieferten Aufgaben (im Repo gepflegt). */
const BUILTIN_DIR = process.env.CONTENT_DIR || path.resolve(import.meta.dirname, '..', 'content');
/**
 * Eigene Aufgaben, z. B. von anderen Familien: Liegt hier mindestens ein Fach-Ordner mit subject.json,
 * zeigt die App nur diese Fächer und keine mitgelieferten. Ordner mit _ oder . vorn zählen nicht
 * (dort liegen die Vorlage und die Kopie der mitgelieferten Fächer).
 */
export const CUSTOM_DIR = process.env.CUSTOM_CONTENT_DIR || path.join(DATA_DIR, 'aufgaben');
const TEMPLATE_DIR = path.resolve(import.meta.dirname, '..', 'vorlage');
const GENERATOR_DIR = path.resolve(import.meta.dirname, 'generators');

let activeDir = BUILTIN_DIR;
/** Ordner, aus dem die Fächer gerade kommen (für Karten und Bilder unter /media). */
export const contentDir = () => activeDir;
export const contentSource = () => ({ custom: activeDir !== BUILTIN_DIR, dir: activeDir, customDir: CUSTOM_DIR });

function subjectDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name) && fs.existsSync(path.join(root, d.name, 'subject.json')))
    .map((d) => d.name);
}

/**
 * Legt beim Start den Ordner für eigene Aufgaben an: eine Anleitung, ein kleines Beispiel-Fach (_beispiel)
 * und eine frische Kopie aller mitgelieferten Fächer (_mitgeliefert) zum Herauskopieren.
 */
export function prepareCustomDir() {
  try {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    for (const name of ['LIESMICH.txt', '_beispiel']) {
      const target = path.join(CUSTOM_DIR, name);
      if (!fs.existsSync(target)) fs.cpSync(path.join(TEMPLATE_DIR, name), target, { recursive: true });
    }
    const copy = path.join(CUSTOM_DIR, '_mitgeliefert');
    fs.rmSync(copy, { recursive: true, force: true });
    fs.mkdirSync(copy);
    for (const name of subjectDirs(BUILTIN_DIR)) fs.cpSync(path.join(BUILTIN_DIR, name), path.join(copy, name), { recursive: true });
  } catch (err) {
    console.warn(`[Inhalt] Der Ordner für eigene Aufgaben (${CUSTOM_DIR}) lässt sich nicht vorbereiten: ${err.message}`);
  }
}

/** subjectId -> { meta, units: Map(unitId -> unit) } */
export const subjects = new Map();
/** itemKey -> { subject, unitId, kind: 'vocab' | 'exercise', data } */
export const itemIndex = new Map();
/** Name -> Generator-Modul (für Fächer wie Mathe, deren Aufgaben berechnet werden) */
const generators = new Map();

export const vocabKey = (subject, unitId, v) => `${subject}/${unitId}/v/${v.en}`;
export const exerciseKey = (subject, unitId, ex) =>
  `${subject}/${unitId}/x/${ex.id ?? shortHash(`${ex.type}|${ex.q ?? ''}|${ex.de ?? ''}|${ex.answer}`)}`;

export async function loadContent() {
  subjects.clear();
  itemIndex.clear();
  const problems = [];

  for (const file of fs.existsSync(GENERATOR_DIR) ? fs.readdirSync(GENERATOR_DIR) : []) {
    if (!file.endsWith('.js')) continue;
    const mod = await import(pathToFileURL(path.join(GENERATOR_DIR, file)).href);
    generators.set(path.basename(file, '.js'), mod);
  }

  activeDir = subjectDirs(CUSTOM_DIR).length ? CUSTOM_DIR : BUILTIN_DIR;
  for (const name of subjectDirs(activeDir)) {
    const subjectDir = path.join(activeDir, name);
    const meta = readJson(path.join(subjectDir, 'subject.json'), problems);
    if (!meta || meta.enabled === false) continue;
    meta.id ??= name;

    const units = [];
    for (const file of fs.readdirSync(subjectDir)) {
      if (!file.endsWith('.json') || file === 'subject.json') continue;
      const unit = readJson(path.join(subjectDir, file), problems);
      if (!unit || unit.enabled === false) continue;
      unit.id ??= path.basename(file, '.json');
      unit.vocab ??= [];
      unit.exercises ??= [];
      unit.explain ??= [];
      units.push(unit);
      validateUnit(meta, unit, file, problems, subjectDir);
    }
    const lineOrder = (meta.lines ?? []).map((l) => l.id);
    units.sort((a, b) => lineOrder.indexOf(a.line) - lineOrder.indexOf(b.line) || (a.order ?? 0) - (b.order ?? 0));

    for (const t of meta.blitz ?? []) {
      if (!t.id || !t.title) problems.push(`${meta.id}/subject.json: Blitzrunde braucht "id" und "title"`);
      for (const uid of t.units ?? []) if (!units.some((u) => u.id === uid)) problems.push(`${meta.id}/subject.json: Blitzrunde "${t.id}" – Station "${uid}" gibt es nicht`);
    }

    const unitMap = new Map();
    for (const unit of units) {
      unitMap.set(unit.id, unit);
      for (const v of unit.vocab) {
        itemIndex.set(vocabKey(meta.id, unit.id, v), { subject: meta.id, unitId: unit.id, kind: 'vocab', data: v });
      }
      for (const ex of unit.exercises) {
        itemIndex.set(exerciseKey(meta.id, unit.id, ex), { subject: meta.id, unitId: unit.id, kind: 'exercise', data: ex });
      }
    }
    subjects.set(meta.id, { meta, units: unitMap });
  }
  return problems;
}

function readJson(file, problems) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${path.relative(activeDir, file)}: ${err.message}`);
    return null;
  }
}

function validateUnit(meta, unit, file, problems, subjectDir) {
  const where = `${meta.id}/${file}`;
  const svgCache = new Map();
  const checkMap = (name, marks) => {
    const svgFile = path.join(subjectDir, 'media', `${name}.svg`);
    if (!svgCache.has(name)) svgCache.set(name, fs.existsSync(svgFile) ? fs.readFileSync(svgFile, 'utf8') : null);
    const svg = svgCache.get(name);
    if (svg == null) return problems.push(`${where}: Karte "media/${name}.svg" nicht gefunden`);
    for (const m of marks) if (!svg.includes(`id="${m}"`)) problems.push(`${where}: Karte "${name}" hat kein Gebiet "${m}"`);
  };
  // Noten wie "C4", "F#5", "Bb3" oder "-" (Pause), siehe playMusic in public/js/ui.js
  const checkSound = (spec) => {
    const notes = typeof spec?.notes === 'string' ? spec.notes.trim().split(/\s+/) : spec?.notes;
    if (!Array.isArray(notes) || !notes.length) return problems.push(`${where}: Klang ohne "notes": ${JSON.stringify(spec)}`);
    for (const it of notes) {
      const n = typeof it === 'string' ? it : it?.n;
      if (n !== '-' && !/^[A-G](#|b)?\d$/.test(n ?? '')) problems.push(`${where}: unbekannte Note "${n}"`);
    }
  };
  for (const b of unit.explain) if (b.sound) checkSound(b.sound);
  for (const b of unit.explain) if (b.map) checkMap(b.map, (b.legend ?? []).map(([id]) => id));
  for (const b of unit.explain) {
    if (b.column && !(b.column.rows?.length >= 2 && b.column.rows.every((r) => /^\d+$/.test(r))))
      problems.push(`${where}: Rechen-Beispiel braucht "rows" mit mindestens zwei Zahlen: ${JSON.stringify(b.column)}`);
    else if (b.column?.op === 'mul' && b.column.rows.length !== 2)
      problems.push(`${where}: Mal-Beispiel braucht genau zwei Zahlen: ${JSON.stringify(b.column)}`);
    else if (b.column?.op === 'div' && (b.column.rows.length !== 2 || Number(b.column.rows[1]) < 2 || Number(b.column.rows[0]) % Number(b.column.rows[1])))
      problems.push(`${where}: Teil-Beispiel braucht genau zwei Zahlen und darf keinen Rest haben: ${JSON.stringify(b.column)}`);
    else if (b.column?.op === 'sub' && b.column.rows.slice(1).reduce((a, r) => a - Number(r), Number(b.column.rows[0])) < 0)
      problems.push(`${where}: Minus-Beispiel ergibt weniger als 0: ${JSON.stringify(b.column)}`);
  }
  if (!unit.title) problems.push(`${where}: "title" fehlt`);
  if (meta.lines && !meta.lines.some((l) => l.id === unit.line)) problems.push(`${where}: unbekannte Linie "${unit.line}"`);
  if (unit.generator && !generators.has(unit.generator)) problems.push(`${where}: Generator "${unit.generator}" nicht gefunden`);
  else if (unit.generator) checkGenerator(unit, where, problems);
  if (!unit.generator && unit.vocab.length + unit.exercises.length < 5) problems.push(`${where}: weniger als 5 Aufgaben`);

  const seen = new Set();
  for (const v of unit.vocab) {
    if (!v.en || !v.de) problems.push(`${where}: Vokabel ohne en/de: ${JSON.stringify(v)}`);
    if (seen.has(v.en)) problems.push(`${where}: doppelte Vokabel "${v.en}"`);
    seen.add(v.en);
  }
  const deSeen = new Set();
  for (const v of unit.vocab) {
    if (deSeen.has(v.de)) problems.push(`${where}: doppelte Übersetzung "${v.de}" (macht Auswahlfragen mehrdeutig)`);
    deSeen.add(v.de);
  }
  const keys = new Set();
  for (const ex of unit.exercises) {
    const key = exerciseKey(meta.id, unit.id, ex);
    if (keys.has(key)) problems.push(`${where}: doppelte Aufgabe ${JSON.stringify(ex)}`);
    keys.add(key);
    if (!['choice', 'input', 'order'].includes(ex.type)) problems.push(`${where}: unbekannter Aufgabentyp "${ex.type}"`);
    if (ex.answer == null) problems.push(`${where}: Aufgabe ohne "answer": ${JSON.stringify(ex)}`);
    if (ex.type === 'choice' && !ex.options?.includes(ex.answer))
      problems.push(`${where}: Antwort "${ex.answer}" steht nicht in options: ${JSON.stringify(ex)}`);
    if (ex.type === 'order' && !ex.de && !ex.q) problems.push(`${where}: order-Aufgabe braucht "de" oder "q"`);
    if (ex.map) checkMap(ex.map, ex.mark ? [ex.mark] : []);
    if (ex.sound) checkSound(ex.sound);
    if (ex.sound && ex.type !== 'choice') problems.push(`${where}: Hör-Aufgaben gibt es nur als choice: ${JSON.stringify(ex)}`);
    if (ex.accept != null && !(Array.isArray(ex.accept) && ex.accept.every((a) => typeof a === 'string'))) {
      problems.push(`${where}: "accept" muss eine Liste von Texten sein: ${JSON.stringify(ex)}`);
    }
    // recall: erst auswählen, später selbst schreiben (siehe session.js)
    if (ex.recall != null) {
      if (typeof ex.recall !== 'boolean' && typeof ex.recall !== 'string') problems.push(`${where}: "recall" ist true oder ein Aufgabentext: ${JSON.stringify(ex)}`);
      else if (ex.type !== 'choice') problems.push(`${where}: "recall" gibt es nur bei choice-Aufgaben: ${JSON.stringify(ex)}`);
      else if (ex.sound) problems.push(`${where}: Hör-Aufgaben bleiben zum Antippen, "recall" geht dort nicht: ${JSON.stringify(ex)}`);
      else if (meta.speechLang && !ex.de && !ex.hint) {
        problems.push(`${where}: "recall" braucht hier "de" oder "hint" – sonst weiß das Kind beim Schreiben nicht, welches Wort gemeint ist: ${JSON.stringify(ex)}`);
      }
    }
    // formerIds: Aufgaben dieser Station, die diese hier ersetzt – ihr Lernstand geht über (siehe srs.js)
    if (ex.formerIds != null) {
      if (!Array.isArray(ex.formerIds) || !ex.formerIds.every((id) => typeof id === 'string' && id)) {
        problems.push(`${where}: "formerIds" muss eine Liste von ids sein: ${JSON.stringify(ex)}`);
      } else {
        for (const id of ex.formerIds) {
          if (unit.exercises.some((o) => o !== ex && exerciseKey(meta.id, unit.id, o) === `${meta.id}/${unit.id}/x/${id}`)) {
            problems.push(`${where}: "formerIds" nennt „${id}“, aber diese Aufgabe gibt es noch: ${JSON.stringify(ex)}`);
          }
        }
      }
    }
  }
  // Ein Schreib-Zwilling neben einer recall-Aufgabe ist doppelt: Die recall-Aufgabe wird von selbst zum Schreiben.
  for (const ex of unit.exercises) {
    if (ex.type !== 'choice' || !ex.recall) continue;
    const same = (a, b) => (a ?? null) === (b ?? null);
    const twin = unit.exercises.find((o) =>
      o.type === 'input' && o.answer === ex.answer && same(o.q, ex.q) && same(o.map, ex.map) && same(o.mark, ex.mark));
    if (twin) problems.push(`${where}: Schreib-Aufgabe ist überflüssig, „${ex.answer}“ hat schon "recall": ${JSON.stringify(twin)}`);
  }
}

/** Berechnete Aufgaben: ein paar Proben erzeugen und prüfen – auch, ob byId wieder genau dieselbe Aufgabe liefert. */
function checkGenerator(unit, where, problems) {
  const gen = generators.get(unit.generator);
  const before = problems.length;
  const bad = (msg, ex) => problems.length - before < 3 && problems.push(`${where}: Generator "${unit.generator}" – ${msg}: ${JSON.stringify(ex)}`);
  let sample;
  try {
    sample = gen.generate(40, unit);
  } catch (err) {
    return problems.push(`${where}: Generator "${unit.generator}" stürzt ab: ${err.message}`);
  }
  if (!sample.length) return problems.push(`${where}: Generator "${unit.generator}" erzeugt keine Aufgaben`);
  for (const ex of sample) {
    if (!ex.id || ex.answer == null) bad('Aufgabe ohne id oder answer', ex);
    else if (ex.type === 'choice' && (!ex.options?.includes(ex.answer) || new Set(ex.options).size !== ex.options.length)) {
      bad('Antwort fehlt in options oder eine Option ist doppelt', ex);
    } else if (JSON.stringify(gen.byId?.(ex.id, unit)) !== JSON.stringify(ex)) bad('byId liefert nicht dieselbe Aufgabe', ex);
  }
}

/** Karten und Bilder eines Fachs liegen in content/<fach>/media/ und werden unter /media/<fach>/ ausgeliefert. */
export const mediaUrl = (subjectId, name) => `/media/${subjectId}/${name}.svg`;

export function getGenerator(name) {
  return generators.get(name);
}

/** Findet ein Item auch für Generator-Einheiten (dort steht die Aufgabe nicht im Index). */
export function resolveItem(key) {
  const hit = itemIndex.get(key);
  if (hit) return hit;
  const m = key.match(/^([^/]+)\/([^/]+)\/g\/(.+)$/);
  if (!m) return null;
  const unit = subjects.get(m[1])?.units.get(m[2]);
  const gen = unit?.generator && generators.get(unit.generator);
  const data = gen?.byId?.(m[3], unit);
  return data ? { subject: m[1], unitId: m[2], kind: 'exercise', data } : null;
}

export function itemLabel(key) {
  const item = resolveItem(key);
  if (!item) return key;
  if (item.kind === 'vocab') return `${item.data.en} = ${item.data.de}`;
  const ex = item.data;
  if (ex.type === 'order') return ex.answer;
  const q = (ex.q ?? '').replace(/\*\*/g, '');
  if (!q && ex.map) return `Karte: ${ex.answer}`;
  if (/_{3,}/.test(q)) return q.replace(/_{3,}/g, `[${ex.answer}]`);
  return q ? `${q} → ${ex.answer}` : ex.answer;
}

/**
 * Höchstens so viele Aufgaben hat eine ganze Fahrt auf dieser Station (null = keine Grenze): Stationen mit Wörtern
 * oder berechneten Aufgaben füllen mit Wiederholungen in anderer Form auf. Eine kleine Station ohne Wörter hat lieber
 * eine kürzere ganze Fahrt als dieselbe Frage zweimal (die Kontinente: 7 Aufgaben).
 */
export function rideCap(unit) {
  return unit.generator || unit.vocab.length ? null : Math.max(5, unit.exercises.length);
}

export function unitItemCount(unit) {
  if (unit.generator) return unit.itemCount ?? 0;
  return unit.vocab.length + unit.exercises.length;
}

/** Text auf der Sammelkarte: eigener "card"-Text, sonst der erste Merksatz der Station. */
function cardText(u) {
  return u.card ?? u.explain.find((b) => b.tip)?.tip ?? u.explain.find((b) => b.p)?.p ?? u.subtitle ?? '';
}

export function publicSubjects() {
  return [...subjects.values()]
    .sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0))
    .map(({ meta, units }) => ({
      id: meta.id,
      name: meta.name,
      icon: meta.icon,
      speechLang: meta.speechLang ?? null,
      lines: meta.lines ?? [{ id: 'main', name: meta.name, color: '#0072CE' }],
      // Linien, die es nicht mehr gibt – nur, damit schon bestandene Endbahnhöfe ihre Goldkarte behalten
      formerLines: meta.formerLines ?? [],
      blitz: (meta.blitz ?? []).map((t) => ({ id: t.id, title: t.title, icon: t.icon ?? '⚡', subtitle: t.subtitle ?? '' })),
      units: [...units.values()].map((u) => ({
        id: u.id,
        line: u.line ?? 'main',
        title: u.title,
        subtitle: u.subtitle ?? '',
        icon: u.icon ?? '•',
        items: unitItemCount(u),
        card: cardText(u),
      })),
    }));
}

export function publicUnit(subjectId, unitId) {
  const unit = subjects.get(subjectId)?.units.get(unitId);
  if (!unit) return null;
  return {
    id: unit.id,
    subject: subjectId,
    line: unit.line ?? 'main',
    title: unit.title,
    subtitle: unit.subtitle ?? '',
    icon: unit.icon ?? '•',
    explain: unit.explain.map((b) => (b.map ? { ...b, map: mediaUrl(subjectId, b.map) } : b)),
    vocab: unit.showVocab === false ? [] : unit.vocab.map((v) => ({ en: v.en, de: v.de })),
    items: unitItemCount(unit),
    rideCap: rideCap(unit),
  };
}
