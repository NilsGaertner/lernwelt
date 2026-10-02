import { h } from './ui.js';
import { avatarSvg } from './avatar-data.js';

/** Inhalt für ein Profilbild: die Katze als SVG, bei alten Profilen das Emoji. c braucht { avatar, skin }. */
export function faceOf({ avatar, skin }) {
  const svg = avatarSvg(avatar, skin);
  return svg ? h('span.cat', { 'aria-hidden': 'true', html: svg }) : avatar;
}
