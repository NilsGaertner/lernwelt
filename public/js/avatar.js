import { h } from './ui.js';
import { avatarSvg } from './avatar-data.js';

/** Inhalt für ein Profilbild: die Katze als SVG (ohne Skin), sonst das Emoji. c braucht { avatar }. */
export function faceOf({ avatar }) {
  const svg = avatarSvg(avatar);
  return svg ? h('span.cat', { 'aria-hidden': 'true', html: svg }) : avatar;
}
