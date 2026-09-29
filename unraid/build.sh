#!/bin/bash
# Notlösung: Baut das Lernwelt-Image direkt auf dem Unraid-Server, legt das Docker-Template an
# und aktualisiert einen schon laufenden Container auf die neue Version.
# Normalerweise kommen Updates fertig gebaut von GitHub (Docker-Liste → „apply update“), siehe README.
# Aufruf im Unraid-Terminal:  bash /mnt/user/appdata/lernwelt/app/unraid/build.sh
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR="${TEMPLATE_DIR:-/boot/config/plugins/dockerMan/templates-user}"
TEMPLATE="$TEMPLATE_DIR/my-lernwelt.xml"
NAME=lernwelt
# Gleicher Name wie das Image aus der GitHub Container Registry, damit Template und Container passen
IMAGE=ghcr.io/nilsgaertner/lernwelt:latest

manual_steps() {
  echo "Bitte von Hand aktualisieren:"
  echo "  1. Docker → auf „$NAME“ klicken → Edit"
  echo "  2. Irgendein Feld ändern und wieder zurücksetzen (z. B. beim Port eine Ziffer anhängen und löschen),"
  echo "     denn Unraid schaltet „Apply“ erst nach einer Änderung frei."
  echo "  3. Apply"
}

# Liest die Einstellungen des laufenden Containers aus (Ports, Ordner, Variablen, Netzwerk,
# Unraid-Labels) und erstellt ihn damit auf dem neuen Image neu. Geht etwas schief,
# bleibt der alte Container erhalten bzw. wird wiederhergestellt.
recreate_container() {
  local old_image="$1"
  local tpl='--network={{.HostConfig.NetworkMode}}{{"\n"}}'
  tpl+='{{range $n, $c := .NetworkSettings.Networks}}{{if $c.IPAMConfig}}{{if $c.IPAMConfig.IPv4Address}}--ip={{$c.IPAMConfig.IPv4Address}}{{"\n"}}{{end}}{{end}}{{end}}'
  tpl+='{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}--publish={{if .HostIp}}{{.HostIp}}:{{end}}{{.HostPort}}:{{$p}}{{"\n"}}{{end}}{{end}}'
  tpl+='{{range .HostConfig.Binds}}--volume={{.}}{{"\n"}}{{end}}'
  tpl+='{{range .HostConfig.Devices}}--device={{.PathOnHost}}:{{.PathInContainer}}{{"\n"}}{{end}}'
  tpl+='{{with .HostConfig.RestartPolicy.Name}}{{if ne . "no"}}--restart={{.}}{{"\n"}}{{end}}{{end}}'
  tpl+='{{range $k, $v := .HostConfig.LogConfig.Config}}--log-opt={{$k}}={{$v}}{{"\n"}}{{end}}'
  tpl+='{{with .HostConfig.CpusetCpus}}--cpuset-cpus={{.}}{{"\n"}}{{end}}'
  tpl+='{{if .HostConfig.Memory}}--memory={{.HostConfig.Memory}}{{"\n"}}{{end}}'
  local env_tpl='{{range .Config.Env}}{{.}}{{"\n"}}{{end}}'
  local label_tpl='{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}'

  local args=() line
  while IFS= read -r line; do [ -n "$line" ] && args+=("$line"); done < <(docker container inspect -f "$tpl" "$NAME")
  # Nur Variablen und Labels übernehmen, die nicht schon aus dem (alten) Image stammen
  while IFS= read -r line; do [ -n "$line" ] && args+=(--env "$line"); done < <(
    grep -vxF -f <(docker image inspect -f "$env_tpl" "$old_image") <(docker container inspect -f "$env_tpl" "$NAME") || true)
  while IFS= read -r line; do [ -n "$line" ] && args+=(--label "$line"); done < <(
    grep -vxF -f <(docker image inspect -f "$label_tpl" "$old_image") <(docker container inspect -f "$label_tpl" "$NAME") || true)

  local was_running
  was_running=$(docker container inspect -f '{{.State.Running}}' "$NAME")

  docker rm -f "$NAME-neu" >/dev/null 2>&1 || true
  if ! docker create --name "$NAME-neu" "${args[@]}" "$IMAGE" >/dev/null; then
    echo "Der neue Container ließ sich nicht anlegen. Der alte läuft unverändert weiter."
    return 1
  fi

  docker stop "$NAME" >/dev/null 2>&1 || true
  docker rm -f "$NAME-alt" >/dev/null 2>&1 || true
  docker rename "$NAME" "$NAME-alt"
  docker rename "$NAME-neu" "$NAME"
  if [ "$was_running" != "true" ] || docker start "$NAME" >/dev/null; then
    docker rm "$NAME-alt" >/dev/null
    docker rmi "$old_image" >/dev/null 2>&1 || true   # altes Image aufräumen (falls unbenutzt)
    return 0
  fi

  echo "Der neue Container startet nicht – der alte wird wiederhergestellt."
  docker logs --tail 20 "$NAME" 2>&1 | sed 's/^/    /' || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker rename "$NAME-alt" "$NAME"
  docker start "$NAME" >/dev/null || true
  return 1
}

cd "$APP_DIR"
if [ -d .git ]; then
  echo "==> Neueste Version von GitHub holen"
  git pull --ff-only
fi

echo "==> Image „$IMAGE“ lokal bauen"
docker build -t "$IMAGE" "$APP_DIR"

# Ein bereits vorhandenes Template wird nicht überschrieben,
# damit in der Unraid-Oberfläche geänderte Einstellungen (Port, Pfade) erhalten bleiben.
if [ ! -f "$TEMPLATE" ]; then
  mkdir -p "$TEMPLATE_DIR"
  cp "$APP_DIR/unraid/lernwelt.xml" "$TEMPLATE"
  echo "==> Template angelegt: $TEMPLATE"
elif grep -q '<Repository>lernwelt</Repository>' "$TEMPLATE"; then
  # Älteres Template mit dem nur lokal gebauten Image: auf das Image von GitHub umstellen
  sed -i "s#<Repository>lernwelt</Repository>#<Repository>$IMAGE</Repository>#" "$TEMPLATE"
  echo "==> Template auf $IMAGE umgestellt"
fi

if ! docker container inspect "$NAME" >/dev/null 2>&1; then
  echo
  echo "Fertig. Weiter in Unraid: Docker → Add Container → Template „lernwelt“ wählen → Apply"
  exit 0
fi

NEW_IMAGE=$(docker image inspect -f '{{.Id}}' "$IMAGE")
CURRENT_IMAGE=$(docker container inspect -f '{{.Image}}' "$NAME")
echo
if [ "$NEW_IMAGE" = "$CURRENT_IMAGE" ]; then
  echo "Fertig. Der Container „$NAME“ nutzt bereits die neueste Version."
  exit 0
fi

echo "==> Container „$NAME“ auf die neue Version umstellen"
if recreate_container "$CURRENT_IMAGE"; then
  echo "Fertig. „$NAME“ läuft jetzt mit der neuen Version. Daten und Einstellungen bleiben erhalten."
else
  echo
  manual_steps
  exit 1
fi
