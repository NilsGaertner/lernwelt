import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { shortHash } from './util.js';

export const CONTENT_DIR = process.env.CONTENT_DIR || path.resolve(import.meta.dirname, '..', 'content');
const GENERATOR_DIR = path.resolve(import.meta.dirname, 'generators');

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

  for (const dir of fs.readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const subjectDir = path.join(CONTENT_DIR, dir.name);
    const metaFile = path.join(subjectDir, 'subject.json');
    if (!fs.existsSync(metaFile)) continue;
    const meta = readJson(metaFile, problems);
    if (!meta || meta.enabled === false) continue;
    meta.id ??= dir.name;

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
    problems.push(`${file}: ${err.message}`);
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
  for (const b of unit.explain) if (b.map) checkMap(b.map, (b.legend ?? []).map(([id]) => id));
  for (const b of unit.explain) {
    if (b.column && !(b.column.rows?.length >= 2 && b.column.rows.every((r) => /^\d+$/.test(r))))
      problems.push(`${where}: Rechen-Beispiel braucht "rows" mit mindestens zwei Zahlen: ${JSON.stringify(b.column)}`);
    else if (b.column?.op === 'sub' && b.column.rows.slice(1).reduce((a, r) => a - Number(r), Number(b.column.rows[0])) < 0)
      problems.push(`${where}: Minus-Beispiel ergibt weniger als 0: ${JSON.stringify(b.column)}`);
  }
  if (!unit.title) problems.push(`${where}: "title" fehlt`);
  if (meta.lines && !meta.lines.some((l) => l.id === unit.line)) problems.push(`${where}: unbekannte Linie "${unit.line}"`);
  if (unit.generator && !generators.has(unit.generator)) problems.push(`${where}: Generator "${unit.generator}" nicht gefunden`);
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
  };
}
