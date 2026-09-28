# Lernwelt

Eine kleine Lern-Webseite fürs Heimnetz. Dein Kind übt Englisch auf einem **Netzplan** wie bei der U-Bahn: Jede Lernlinie ist eine Bahnlinie, jede Einheit eine Station. Für jede Übung gibt es Sterne, dazu Abzeichen, und die Sterne lassen sich gegen **Fahrkarten für Medienzeit** tauschen. Du bestätigst die Tickets im Elternbereich und siehst dort auch den Lernfortschritt.

## Was drin ist

**Englisch (Klasse 5, Grundlagen): 39 Stationen, gut 700 Wörter und Aufgaben**

| Linie | Stationen |
|---|---|
| Wörter-Linie (15) | Zahlen bis 20 und bis 100, Farben, Wochentage und Monate, Familie, Schule, Tiere, Essen, Körper, Kleidung, Zuhause, Freizeit, wichtige Verben, Adjektive, Wetter |
| Grammatik-Linie (20) | I/you/he…, am/is/are, Verneinung und Fragen mit „to be“, a/an, Plural, have got, my/your/his…, Toms Fahrrad (’s), this/that/these/those, there is/are, Präpositionen, can/can’t, Fragewörter, Simple Present (-s), don’t/doesn’t, Do/Does-Fragen, always/often/never, Present Progressive, Simple Present oder Progressive?, me/him/her… |
| Alltags-Linie (4) | Begrüßen und Vorstellen, Classroom English, Uhrzeit, Datum und Geburtstag |

Jede Station hat eine **„Merke“-Erklärung** auf Deutsch (kindgerecht, mit Beispielen und Vorlese-Knopf) und danach eine Übung mit 10 Aufgaben.

**Aufgabentypen:** Auswahl, Eintippen, Sätze aus Wortkärtchen bauen, Paare finden und Hörverstehen (die englischen Wörter werden vorgelesen).

**So lernt es mit:**
- Wörter, die gut sitzen, kommen seltener dran. Neue und wacklige kommen öfter und werden nach und nach schwieriger (erst Auswahl, dann selbst schreiben, dann nach Gehör schreiben).
- Falsch beantwortete Aufgaben kommen am Ende der Übung noch einmal. Gewertet wird aber nur der erste Versuch.
- Das **Fehler-Training** sammelt alles, was noch nicht sitzt, über alle Stationen hinweg.
- Typische Fehler deutscher Kinder werden freundlich angesprochen, zum Beispiel großgeschriebene Nomen („Dog“) oder kleingeschriebene Wochentage. Bei einem einzelnen falschen Buchstaben kommt „Fast!“.

## Sterne, Abzeichen und Medienzeit

| Wofür | Sterne |
|---|---|
| Übung beendet | 1 |
| mindestens 70 % richtig | 2 |
| mindestens 90 % richtig | 3 |
| Station zum ersten Mal mit 3 Sternen | +2 |
| erste Übung des Tages | +1 |
| neues Abzeichen (19 Stück, z. B. 3 Tage am Stück, 10 fehlerfreie Übungen) | +3 |

Im **Elternbereich** stellst du ein:
- wie viele Minuten Medienzeit ein Stern wert ist (Standard: 2 Minuten)
- wie viele Sterne es höchstens pro Tag gibt (Standard: 30). Üben geht danach weiter, nur ohne Sterne.
- welche Ticket-Größen es gibt (Standard: 15, 30 und 60 Minuten)

Löst dein Kind ein Ticket, werden die Sterne sofort abgezogen und das Ticket wartet auf dein OK. Lehnst du ab (oder gibt dein Kind es zurück), kommen die Sterne zurück. Du kannst außerdem von Hand Sterne gutschreiben oder abziehen, etwa für einen guten Vokabeltest.

Im Elternbereich siehst du pro Kind: Übungszeit der letzten 14 Tage, was noch schwerfällt (konkrete Wörter und Sätze), den Stand jeder Station, die letzten Übungen und das komplette Sterne-Konto.

**Die Eltern-PIN ist am Anfang `1234`.** Bitte gleich im Elternbereich ändern (oder vor dem ersten Start `PARENT_PIN` setzen).

---

## Installation auf Unraid

Der Ordner `/mnt/user/appdata/lernwelt/` wird im Folgenden verwendet. Du kannst auch einen anderen nehmen.

### 1. Dateien auf den Server kopieren

Kopiere diesen Projektordner (ohne `node_modules`) nach
`\\DEIN-UNRAID\appdata\lernwelt\app` (im Windows-Explorer über die Freigabe `appdata`).

### 2a. Mit dem Plugin „Docker Compose Manager“ (empfohlen)

1. In Unraid unter **Apps** das Plugin **Docker Compose Manager** installieren.
2. Das Unraid-Terminal öffnen (Symbol `>_` oben rechts) und eingeben:
   ```bash
   cd /mnt/user/appdata/lernwelt/app
   docker compose up -d --build
   ```
3. Fertig. Die Lernwelt läuft unter **`http://DEIN-UNRAID:8080`**.

Ist Port 8080 schon belegt, ändere in `docker-compose.yml` die Zeile `"8080:8080"`, z. B. zu `"8095:8080"`.

### 2b. Ohne Plugin (nur Terminal)

```bash
docker build -t lernwelt /mnt/user/appdata/lernwelt/app
docker run -d --name lernwelt --restart unless-stopped \
  -p 8080:8080 -e TZ=Europe/Berlin \
  -v /mnt/user/appdata/lernwelt/data:/data \
  lernwelt
```
Der Container erscheint dann im Unraid-Reiter **Docker**, dort kannst du ihn starten und stoppen.

### 3. Einrichten

1. `http://DEIN-UNRAID:8080` öffnen und auf **Elternbereich** klicken.
2. Mit PIN `1234` anmelden, **eigene PIN festlegen** und ein **Kinderprofil anlegen**.
3. Auf dem Tablet oder Laptop deines Kindes die Seite öffnen und am besten „Zum Startbildschirm hinzufügen“ wählen. Dann sieht sie aus wie eine App.

### Updates

Neue Dateien nach `appdata/lernwelt/app` kopieren, dann:
```bash
cd /mnt/user/appdata/lernwelt/app && docker compose up -d --build
```
(ohne Plugin: Container im Docker-Reiter entfernen und Schritt 2b wiederholen)

Fortschritt, Sterne und Einstellungen liegen in `appdata/lernwelt/data` und bleiben bei Updates erhalten. Dieser Ordner ist auch das, was gesichert werden sollte (das Plugin „Appdata Backup“ erledigt das automatisch).

### Hinweise

- Die Seite ist fürs **Heimnetz** gedacht. Bitte nicht per Portfreigabe ins Internet stellen, denn es gibt kein HTTPS und nur eine einfache PIN.
- Das Vorlesen nutzt die Stimmen des Geräts. Auf iPad, Android, Windows und in Chrome/Edge klappt das gut. Falls nichts zu hören ist: Lautstärke prüfen und in den Geräteeinstellungen eine englische Stimme installieren.
- Die Schriften kommen von Google Fonts. Ohne Internet sieht es etwas schlichter aus, funktioniert aber genauso.

---

## Auf dem PC ausprobieren

Voraussetzung: Node.js 22.13 oder neuer.
```bash
npm install
npm start          # → http://localhost:8080
npm run check      # prüft alle Inhaltsdateien auf Fehler
```

## Inhalte ändern und erweitern

Alle Lerninhalte liegen als JSON-Dateien in `content/<fach>/`. Nach einer Änderung `npm run check` ausführen und dann im Elternbereich **„Inhalte neu einlesen“** klicken (oder den Container neu bauen).

### Eine Station (eine Datei pro Station)

```json
{
  "id": "colours",
  "line": "words",
  "order": 3,
  "title": "Colours",
  "subtitle": "Farben",
  "icon": "🎨",
  "explain": [
    { "p": "Ein Absatz mit **fett** gedrucktem Text." },
    { "tip": "Ein Merksatz im gelben Kasten." },
    { "ex": [["My bike is red.", "Mein Fahrrad ist rot."]] },
    { "table": { "head": ["Englisch", "Deutsch"], "rows": [["red", "rot"]] } }
  ],
  "vocab": [
    { "en": "grey", "de": "grau", "alt": ["gray"] }
  ],
  "exercises": [
    { "type": "choice", "q": "The sky is ___.", "options": ["blue", "red", "green"], "answer": "blue", "explain": "Wird bei einer falschen Antwort angezeigt." },
    { "type": "input", "q": "She ___ ten.", "answer": "is", "hint": "am / is / are" },
    { "type": "order", "de": "Ich bin zehn.", "answer": "I am ten.", "accept": ["I'm ten."] }
  ]
}
```

- **`vocab`**: Aus Wortlisten werden die Aufgaben automatisch gebaut (Auswahl, Eintippen, Hören, Paare finden). `alt` sind weitere richtige Schreibweisen. Mit `"typing": false` auf Stationsebene muss nichts eingetippt werden, bei Sätzen wird dann aus Wortkärtchen gebaut.
- **`exercises`**: `choice` (Auswahl), `input` (Eintippen, `___` markiert die Lücke) und `order` (Satz bauen). Weitere Felder: `accept` für weitere richtige Antworten, `task` für einen eigenen Aufgabentext, `de` für eine deutsche Übersetzung als Hilfe, `"speak": false`, wenn der Satz nicht vorgelesen werden soll, und `"strict": true`, wenn Kurz- und Langform (don't / do not) nicht beide gelten sollen.

### Ein neues Fach (z. B. Deutsch)

1. Ordner `content/deutsch/` anlegen.
2. Darin eine `subject.json` mit Name und Linien:
   ```json
   {
     "id": "deutsch", "name": "Deutsch", "icon": "📝", "order": 3,
     "lines": [ { "id": "rechtschreibung", "name": "Rechtschreib-Linie", "color": "#C2410C" } ]
   }
   ```
   Für Fremdsprachen zusätzlich `"speechLang": "fr-FR"` (o. Ä.) angeben, dann wird vorgelesen.
3. Stationen wie oben als eigene Dateien daneben legen.

Sobald es mehr als ein Fach gibt, erscheinen oben auf dem Netzplan Reiter zum Umschalten. Sterne, Abzeichen und Tickets gelten fächerübergreifend.

### Mathe: berechnete Aufgaben

Unter `content/mathe/` liegt schon ein Beispiel-Fach (Einmaleins, Geteilt, Minus bis 1000), das noch **ausgeschaltet** ist. Zum Einschalten in `content/mathe/subject.json` `"enabled": false` auf `true` setzen.

Diese Stationen haben keine festen Aufgaben. Sie werden von `server/generators/rechnen.js` jedes Mal neu erzeugt:
```json
{ "id": "einmaleins", "line": "kopfrechnen", "title": "Das kleine Einmaleins",
  "generator": "rechnen", "params": { "op": "mul", "min": 2, "max": 10 }, "itemCount": 90 }
```
Für neue Aufgabenarten (z. B. Brüche, Uhrzeiten) legst du einen weiteren Generator in `server/generators/` an. Wie der aufgebaut ist, steht oben in `rechnen.js`.

## Aufbau (für Neugierige)

```
server/        Node.js-Server (Express, SQLite über das eingebaute node:sqlite)
  index.js       API-Routen für Kinder und Eltern
  session.js     Aufgaben auswählen, Antworten prüfen, Wiederholungs-Logik
  rewards.js     Sterne, Tageslimit, Abzeichen, Tickets
  content.js     liest die Inhalte ein
  generators/    berechnete Aufgaben (Mathe)
public/        Oberfläche (reines HTML/CSS/JS, kein Build-Schritt)
content/       Lerninhalte als JSON
data/          Datenbank (wird automatisch angelegt, im Container: /data)
```
