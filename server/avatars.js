// Avatar-Skins: Das Kind sammelt sie bei Ereignissen (Linie geschafft) oder bekommt sie von den Eltern geschenkt.
// Der Avatar selbst (Katze) steht in children.avatar, der getragene Skin in children.skin.
import { db } from './db.js';
import { nowIso } from './util.js';
import { CATS, SKINS, isCat, isSkin } from '../public/js/avatar-data.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Schenkt einen Skin. Gibt es ihn schon, passiert nichts (null), sonst { id, name, source }. */
export function grantSkin(childId, skinId, source) {
  if (!isSkin(skinId)) throw fail(400, 'Diesen Skin gibt es nicht.');
  const r = db
    .prepare('INSERT OR IGNORE INTO avatar_skins (child_id, skin_id, source, created_at) VALUES (?, ?, ?, ?)')
    .run(childId, skinId, source, nowIso());
  return r.changes ? { id: skinId, name: SKINS[skinId].name, source } : null;
}

/** Zufälliger Skin aus einem Topf, den das Kind noch nicht hat. Null, wenn alle schon da sind. */
export function grantRandomSkin(childId, pool, source) {
  const have = new Set(ownedSkins(childId));
  const free = Object.keys(SKINS).filter((id) => SKINS[id].pool === pool && !have.has(id));
  if (!free.length) return null;
  return grantSkin(childId, free[Math.floor(Math.random() * free.length)], source);
}

export function ownedSkins(childId) {
  return db.prepare('SELECT skin_id FROM avatar_skins WHERE child_id = ? ORDER BY created_at, skin_id').all(childId).map((r) => r.skin_id);
}

/** Alles, was das Frontend für die Avatar-Seite braucht. */
export function avatarState(childId) {
  return {
    owned: ownedSkins(childId),
    skins: Object.entries(SKINS).map(([id, s]) => ({ id, name: s.name, pool: s.pool })),
    cats: Object.entries(CATS).map(([id, c]) => ({ id: `cat:${id}`, name: c.name })),
  };
}

/** Katze und/oder Skin wechseln. skin '' = keinen tragen. Skins muss das Kind besitzen. */
export function equip(child, { avatar, skin }) {
  let nextAvatar = child.avatar;
  let nextSkin = child.skin ?? null;
  if (avatar != null) {
    if (!isCat(avatar)) throw fail(400, 'Diese Katze gibt es nicht.');
    nextAvatar = avatar;
  }
  if (skin != null) {
    if (skin === '') nextSkin = null;
    else if (!ownedSkins(child.id).includes(skin)) throw fail(400, 'Diesen Skin hast du noch nicht.');
    else nextSkin = skin;
  }
  db.prepare('UPDATE children SET avatar = ?, skin = ? WHERE id = ?').run(nextAvatar, nextSkin, child.id);
  return { avatar: nextAvatar, skin: nextSkin };
}

/** Profilbild aus dem Elternbereich: eine Katze oder ein Emoji (höchstens 8 Zeichen). */
export function cleanAvatar(value, fallback) {
  const v = String(value ?? fallback);
  if (v.startsWith('cat:')) return isCat(v) ? v : fallback;
  return v.slice(0, 8);
}
