#!/bin/sh
# Übernimmt den Datenordner und startet die App als PUID:PGID
# (Unraid-Standard 99:100 = nobody:users), damit die Datenbank beschreibbar ist.
set -e

PUID="${PUID:-99}"
PGID="${PGID:-100}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
