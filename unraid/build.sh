#!/bin/bash
# Baut das Lernwelt-Image auf dem Unraid-Server und legt das Docker-Template an.
# Aufruf im Unraid-Terminal:  bash /mnt/user/appdata/lernwelt/app/unraid/build.sh
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR=/boot/config/plugins/dockerMan/templates-user
TEMPLATE="$TEMPLATE_DIR/my-lernwelt.xml"

cd "$APP_DIR"
if [ -d .git ]; then
  echo "==> Neueste Version von GitHub holen"
  git pull --ff-only
fi

echo "==> Image „lernwelt“ bauen"
docker build -t lernwelt "$APP_DIR"

# Ein bereits vorhandenes Template wird nicht überschrieben,
# damit in der Unraid-Oberfläche geänderte Einstellungen (Port, Pfade) erhalten bleiben.
if [ ! -f "$TEMPLATE" ]; then
  mkdir -p "$TEMPLATE_DIR"
  cp "$APP_DIR/unraid/lernwelt.xml" "$TEMPLATE"
  echo "==> Template angelegt: $TEMPLATE"
  echo
  echo "Weiter in Unraid: Docker → Add Container → Template „lernwelt“ wählen → Apply"
else
  echo
  echo "Fertig. Damit der Container die neue Version nutzt:"
  echo "Docker → auf „lernwelt“ klicken → Edit → Apply"
fi
