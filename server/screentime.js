// Medienzeit für den PC: Tickets mit dem Ziel „pc“ bucht die Lernwelt beim Genehmigen als Extra-Zeit
// beim Bildschirmzeit-Relay (Projekt FamilySafety). Dort zählt und sperrt ein Dienst auf dem PC des Kindes.
//
// Eingeschaltet über drei Umgebungsvariablen, sonst ändert sich nichts:
//   SCREENTIME_URL    Adresse des Relays, z. B. http://10.0.0.5:8765
//   SCREENTIME_KEY    LERNWELT_KEY aus der Konfiguration des Relays
//   SCREENTIME_CHILD  Name des Kinderprofils, dessen PC-Zeit das Relay verwaltet (z. B. Paul)

const BASE = (process.env.SCREENTIME_URL || '').trim().replace(/\/+$/, '').replace(/\/status$/, '');
const KEY = (process.env.SCREENTIME_KEY || '').trim();
const CHILD = (process.env.SCREENTIME_CHILD || '').trim().toLowerCase();

// expose: Die Eltern sollen sehen, warum das Buchen nicht klappt, auch bei einem 502.
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

export const pcTimeConfigured = !!(BASE && KEY && CHILD);

/** Kann dieses Profil Tickets für den PC lösen? */
export function pcTimeFor(child) {
  return pcTimeConfigured && !child?.adult && String(child?.name ?? '').trim().toLowerCase() === CHILD;
}

/**
 * Bucht die Minuten eines Tickets beim Relay. Die ref macht das Buchen wiederholbar: Dasselbe Ticket
 * bucht das Relay nur einmal, auch bei einem Doppelklick oder einem zweiten Versuch nach einem Fehler.
 * Liefert { booked, account } (account: Stand beim Relay, u. a. remaining_seconds, ends_at).
 */
export async function bookPcTime(ticket) {
  if (!pcTimeConfigured) throw fail(400, 'Die PC-Zeit ist nicht eingerichtet. Ablehnen gibt die Sterne zurück.');
  let res;
  try {
    res = await fetch(`${BASE}/api/bonus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: ticket.minutes, ref: `lernwelt-ticket-${ticket.id}`, note: `Lernwelt, ${ticket.stars} Sterne` }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw fail(502, `Das Bildschirmzeit-Relay antwortet nicht (${err.cause?.code ?? err.name}). Das Ticket bleibt offen.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(502, `Die PC-Zeit ließ sich nicht buchen: ${data.error || `Fehler ${res.status}`}. Das Ticket bleibt offen.`);
  return data;
}
