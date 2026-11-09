# Lernwelt

Eine kleine Lern-Webseite fürs Heimnetz. Dein Kind übt Englisch, Mathe, Deutsch, Geographie, Biologie, Geschichte und Musik auf einem **Netzplan** wie bei der U-Bahn: Jede Lernlinie ist eine Bahnlinie, jede Einheit eine Station. Für jede Übung gibt es Sterne, dazu Abzeichen, und die Sterne lassen sich gegen **Fahrkarten für Medienzeit** tauschen. Du bestätigst die Tickets im Elternbereich und siehst dort auch den Lernfortschritt.

## Was drin ist

**Englisch (Klasse 5, Grundlagen): 61 Stationen, gut 1000 Wörter und Aufgaben und der Satz-Trainer mit immer neuen Sätzen**

Jede Linie hat 3 Stationen und danach den Endbahnhof. So ist eine Linie in ein paar Tagen geschafft, und die Lootbox dafür bleibt in Reichweite. Wörter und Grammatik sind nach Themen gemischt, die zusammenpassen.

| Linie | Stationen |
|---|---|
| Karteikarten-Linie | Die Vokabelkarten aus der Schule: Farben und Dinge, Verben mit „to“, kurze Sätze für jeden Tag |
| Zimmer-Linie | Weitere Vokabelkarten: Rooms, Kitchen and bathroom, Furniture |
| Glücks-Linie | Neue Vokabelblätter: You are lucky, Be quiet please, und Wörter aus dem Heft, die schwer zu schreiben sind (seagull, purple, eight …) |
| Besuchs-Linie | Der dritte Kartenstapel: do, make oder play? (do the homework, make a cake, play games, visit the grandparents), An old clock (an easy task, an important guest, a drawing on the wall, our culture – a oder an?), Lots of trees (live in an area with lots of trees, The furniture **is** new, forty, fifty) |
| Heft-Linie | Aus dem Heft: Family tree (Stammbaum vom Arbeitsblatt, wer ist wessen brother, aunt, cousin …), kurze Antworten (Yes, I am. No, there aren't. No, he can't.), Where is the ball? (die Skizzen mit Kiste und Ball) |
| Test-Linie | Test No 2 nachgeübt: Schultasche, Farben und Wortgruppen übersetzen; I am – he has (to be und to have für jede Person); Personal pronouns und to be (Emma, Sheree); my/his/her/our/your/their |
| Satz-Trainer-Linie | Immer neue Sätze statt fester Aufgaben: am/is/are und have got (mit Verneinung und Frage), he/she/it mit -s (plays, watches, flies, has), Do/Does-Fragen und don't/doesn't mit dem Verb ohne -s. Die Sätze baut `server/generators/saetze.js` bei jeder Fahrt neu (über tausend pro Station), auswendig lernen geht also nicht – nur die Regel anwenden. Auch der Grammatik-Blitz nutzt sie. |
| Hallo-Linie | Begrüßen und Vorstellen, Familie, Fragewörter |
| Ich-bin-Linie | I/you/he…, am/is/are, Verneinung und Fragen mit „to be“ |
| Zahlen-Linie | Zahlen bis 20, Zahlen bis 100, Uhrzeit |
| Nomen-Linie | a/an, Plural, this/that/these/those |
| Kalender-Linie | Wochentage und Monate, Datum und Geburtstag, Wetter und Jahreszeiten |
| Meins-Linie | have got, my/your/his…, Toms Fahrrad (’s) |
| Schul-Linie | Classroom English, Schule, wichtige Verben |
| Zuhause-Linie | Zuhause, Präpositionen, there is/are |
| Aussehen-Linie | Körper, Kleidung, Farben |
| Tier-Linie | Tiere, Adjektive, can/can’t |
| Lieblings-Linie | Essen und Trinken, Freizeit, me/him/her… |
| Simple-Present-Linie | Simple Present (-s), don’t/doesn’t, Do/Does-Fragen |
| Jetzt-oder-immer-Linie | always/often/never, Present Progressive, Simple Present oder Progressive? |

Früher gab es nur drei lange Englisch-Linien (Wörter, Grammatik, Alltag). Der Fortschritt der Stationen bleibt bei der neuen Aufteilung erhalten. Wer dort schon einen Endbahnhof bestanden hatte, behält die Goldkarte im Album unter „Frühere Linien“.

Jede Station hat eine **„Merke“-Erklärung** auf Deutsch (kindgerecht, mit Beispielen und Vorlese-Knopf) und danach eine Übung mit 10 Aufgaben. Die Wörter-Stationen (Familie, Schule, Tiere, Essen, Körper, Kleidung, Zuhause, Freizeit, Verben, Adjektive) haben dazu je vier Lückensätze, damit die Wörter auch im Satz vorkommen – mit typischen Fallen wie „take photos“ statt „make photos“ oder „hair“ ohne -s.

**Mathe: Quadratzahlen (3 Stationen)**

Die Kopfrechnen-Linie übt 11 · 11 bis 20 · 20: erst 11 bis 15, dann 16 bis 20, dann alle gemischt. Gefragt wird vorwärts (13 · 13 = ?) und rückwärts (? · ? = 169), mit Rechentricks im „Merke“.

**Mathe: Schriftlich plus (3 Stationen + Endbahnhof)**

Die Schriftlich-plus-Linie übt die schriftliche Addition bis 1000: erst ohne Übertrag, dann mit Übertrag, dann drei Zahlen untereinander. Die Zahlen stehen auf Karopapier wie im Heft. Das Kind tippt die Ergebnis-Ziffern über ein eigenes Zahlenfeld von rechts nach links ein und kann Überträge eintragen (die zählen nicht, sie helfen beim Merken). Bei einem Fehler zeigt die App die richtigen Ziffern, die Überträge und den Rechenweg Spalte für Spalte. Die Aufgaben erzeugt `server/generators/schriftlich.js` jedes Mal neu. Der Endbahnhof hat hier 10 statt 15 Aufgaben (`"examCount"` an der Linie in `subject.json`).

**Mathe: Schriftlich minus (3 Stationen + Endbahnhof)**

Die Schriftlich-minus-Linie übt die schriftliche Subtraktion bis 1000 im **Ergänzungsverfahren** („8 + 5 = 13, schreib 5, Übertrag 1“): erst ohne Übertrag, dann mit Übertrag, dann mit Nullen in der oberen Zahl (z. B. 503 − 276 oder 1000 − 347). Die Bedienung ist dieselbe wie beim Plus. Die Stationen nutzen denselben Generator mit `"op": "sub"`.

**Mathe: Schriftlich mal (3 Stationen + Endbahnhof)**

Die Schriftlich-mal-Linie übt das schriftliche Multiplizieren wie im Schulheft: Die Aufgabe steht in einer Zeile (3597 · 19), darunter kommt für jede Ziffer des zweiten Faktors ein Teilprodukt, jedes eine Stelle weiter rechts, und darunter die Summe mit Übertrags-Kästchen. Die Stationen: mal eine Ziffer (165 · 8), mal zwei Ziffern (421 · 17) und große Aufgaben mit bis zu drei Zeilen. Ist eine Zeile vorne fertig, springt „Nächste Zeile“ weiter. Gewertet wird nur das Ergebnis. Bei einem Fehler zeigt die App alle Zeilen richtig an (selbst eingetragene Ziffern grün oder rot, im Kopf gerechnete Zeilen grau) und den Rechenweg mit Überschlag und „merke“ für jede Ziffer. Die Aufgaben kommen aus demselben Generator wie Plus und Minus (`"op": "mul"`, `"factorDigits"` für die Stellen des zweiten Faktors).

**Mathe: Minecraft, Basketball und Katzen-Check (je 3 Stationen + Endbahnhof)**

Der Stoff der Klassenarbeit in den Lieblingsthemen des Kindes, ganz oben im Mathe-Netzplan. Die Minecraft-Linie rechnet mit Stacks (64), Kisten (27 Plätze), Crafting-Rezepten, Nether-Wegen (1 : 8) und der Leuchtfeuer-Pyramide (3² + 5² + 7² + 9²). Die Basketball-Linie zählt Zweier, Dreier und Freiwürfe (Punkt vor Strich), rechnet Durchschnitte und Saison-Statistiken und hat Ticket- und Trikot-Aufgaben (Einnahmen, Kosten, Gewinn). In der Katzen-Linie hat „deine Katze“ gerechnet, und das Kind prüft: Kann das per Überschlag stimmen? Wo steckt der Rechenregel-Fehler? Passt die Rechnung zur Textaufgabe? Manchmal hat die Katze auch recht.

**Mathe: Schriftlich geteilt (3 Stationen + Endbahnhof)**

Die Schriftlich-geteilt-Linie übt das schriftliche Dividieren wie im Heft: Oben steht die Aufgabe in einer Zeile (8547 : 11 = 777), darunter für jede Ergebnis-Ziffer ein Schritt mit Malaufgabe (− 77), Strich und Rest. Die heruntergeholte Ziffer steht schon da. Die Reihenfolge ist wie im Heft: Ziffer oben, dann Produkt und Rest (jeweils von rechts), dann die nächste Ziffer. Bleibt vorne ein Kästchen frei, springt „Weiter“ zur nächsten Zeile. Gewertet wird nur das Ergebnis oben. Bei einem Fehler zeigt die App alle Zeilen richtig an und den Rechenweg Schritt für Schritt mit Probe. Die Stationen: durch eine Ziffer, durch 11 bis 15 (mit Vielfachen-Tabelle), große Aufgaben mit Teilern bis 25 (Ziffern schätzen). Die Aufgaben gehen immer ohne Rest auf und haben keine 0 im Ergebnis. Sie kommen aus demselben Generator (`"op": "div"`, `"divisor"`, `"quotientDigits"`). Der Endbahnhof hat 8 Aufgaben.

**Mathe: Probearbeit (3 Stationen + Endbahnhof)**

Nach dem „Übungsteil für die Klassenarbeit“ aus der Schule, mit neuen Zahlen. Die Linie steht direkt unter den drei Themen-Linien. Die Stationen: große Zahlen schriftlich plus und minus (bis 7 Stellen, vier Zahlen untereinander oder zwei Zahlen abziehen, Generator mit `"mix"`), „Alles gemischt“ (Runden mit Z/H/T/ZT/HT/Mio., Ordnen, Lücken, Vorrangregel mit verschachtelten Klammern, vorteilhaft rechnen, Distributivgesetz, schriftlich teilen auf dem Zettel) und Textaufgaben (Eintritt, Einnahmen, Gewinn, Durchschnitt). Der Endbahnhof hat 12 Aufgaben.

**Mathe: Stoff aus der 5. Klasse, Kapitel „Rechnen mit natürlichen Zahlen“ (6 Linien, 18 Stationen)**

Nach den Heften und Arbeitsblättern aus der Schule. Bei einem Fehler zeigen viele Aufgaben den Rechenweg.

| Linie | Stationen |
|---|---|
| Klassenarbeits-Linie | Die Arbeit vom 2. Oktober nachgeübt: Kopfrechnen gemischt, Geteilt mit Klammern und Potenzen (22 : 2 + 99 : 11), geschickt rechnen mit Zwischenschritt (760 · 25 · 4, 53 · 17 + 47 · 17) |
| Textaufgaben-Linie | Textaufgaben aus dem Heft und ähnliche: Plus und minus im Text (Stadion, Mount Everest, Tabelle von Frau Gensler), Mal und geteilt im Text (Pralinen-Maschine in mehreren Schritten), Rest und mehrere Schritte (Pacific Crest Trail: Rest heißt ein Wandertag mehr; volle Kartons: Rest fällt weg) |
| Rechenregel-Linie | Fachbegriffe und Potenzen (Summe … Quotient, Basis, Exponent), Klammer vor Potenz vor Punkt vor Strich (KlaPoPuStri), Lücken und Rechenzeichen ergänzen (Umkehraufgabe, Rechnen mit 0) |
| Rechengesetz-Linie | Kommutativ- und Assoziativgesetz (geschickt rechnen), Klammer aufteilen (ausmultiplizieren), Ausklammern |
| Große-Zahlen-Linie | Million bis Billion, gemischtes Zahlwort; Vorgänger, Nachfolger, Vergleichen, Zahlenfolgen; Runden |
| Mal-und-geteilt-Linie | Mit Nullen rechnen (· 10, : 1000 …), im Kopf zerlegen (4 · 72, 228 : 12), Überschlagen und Ergebnisse prüfen |

Dazu gibt es den „Rechenregel-Blitz“. Zahlen dürfen mit Tausenderpunkt oder Leerzeichen eingetippt werden: 45.000 und 45 000 zählen wie 45000.

**Geographie: Die Erde, der Atlas, Kontinente und Meere (3 Linien, 10 Stationen)**

Die Welt-Linie hat die Stationen Die Kontinente, Kontinente-Wissen, Die Ozeane und Meere in Europa. Auf einer Welt- bzw. Europakarte wird ein Gebiet farbig markiert, und dein Kind wählt oder schreibt den Namen. Dazu kommen Wissensfragen (größter Kontinent, Sylt liegt in der …). Im „Merke“ ist jeweils eine bunte Karte mit Legende.

| Linie | Stationen |
|---|---|
| Erde-Linie | Der Globus (Pole, Erdachse, Äquator, Halbkugeln an einer Globus-Zeichnung; was Geographie ist), Die Planeten, Tag und Nacht, Sommer und Winter (Rotation und Revolution) |
| Atlas-Linie | Himmelsrichtungen an der Kompassrose, Lagebeschreibung („nördlich von“ oder „im Norden von“), Der Atlas (physische und thematische Karten, Register) |
| Welt-Linie | Die Kontinente, Kontinente-Wissen, Die Ozeane, Meere in Europa |

Dazu gibt es den „Welt-Blitz“ und den „Erde-und-Atlas-Blitz“.

**Biologie: Katze, Merkmale des Lebens, Versuche und Hund (5 Linien mit je 3 Stationen + Endbahnhof)**

Passend zum Kapitel „Haustiere“ im Biologiebuch, zu den Arbeitsblättern und zum Test über die Merkmale des Lebens:

| Linie | Stationen |
|---|---|
| Katzen-Linie | Die Katze als Schleichjäger (die vier Phasen beim Beutefang), Perfekt angepasst (Krallen, Fangzähne, Augen, Tasthaare), Fortpflanzung der Katzen (Fachwörter, Säugetier richtig begründen, Revier) |
| Lebewesen-Linie | Merkmale des Lebens, Lebewesen oder nicht? (Maus, Spielzeugmaus, Auto: Bewegung zählt nur, wenn sie selbstständig ist), Reiz und Reaktion (reizbar heißt nicht wütend) |
| Forscher-Linie | So arbeitet man in der Biologie (Versuchsprotokoll am Kresse-Versuch), Einen Versuch planen (nur eine Sache verändern, Kontrollansatz, vollständige Planung), Diagramme auswerten (Riechschleimhaut und Hyazinthe) |
| Hund-Linie | Hunde helfen dem Menschen (Blinden-, Spür-, Hüte-, Wachhund, Nasen- und Ohrentier), Das Skelett, Das Gebiss (Zahnarten, Zahnformel, Fleischfressergebiss) |
| Wolf-Linie | Vom Wolf zum Hund (Rudel, Rangordnung, Körpersprache), Hunderassen und Züchtung, Welpen und Hundehaltung (Säugetier, Nesthocker) |

Beim Skelett und beim Gebiss ist ein Knochen bzw. eine Zahnart auf einer Zeichnung markiert, und dein Kind wählt oder schreibt den Namen. Im „Merke“ sind die Zeichnungen bunt und nummeriert wie im Buch. Dazu gibt es den „Hunde-Blitz“ und den „Leben-und-Katzen-Blitz“.

**Geschichte: Quellen, Eiszeit, Höhlenmalerei und Deutschland (6 Linien, 18 Stationen)**

Nach dem Geschichtsheft, dem Buch und dem Test über Zeitstrahl und Quellen:

| Linie | Stationen |
|---|---|
| Spurensucher-Linie | Quelle oder Darstellung? (die Leitfrage: Stammt es aus der Zeit, um die es geht?), Welche Quellenart?, Was gehört in welche Epoche? (Zeitstrahl wie im Test, Jahreszahlen an den Übergängen, Funde einordnen) |
| Eiszeit-Linie | Europa in der Eiszeit (Karte nach dem Buch, Gletscher, Tundra, Steppe, schwierige Wörter aus dem Sachtext), Die Menschen ziehen nach Norden, Evolution (mit Generationen rechnen) |
| Höhlen-Linie | Warum malten die Menschen?, Sicher oder vermutet? (vermutlich, wahrscheinlich, etwa), Aus Stichworten werden Sätze (Formulierungshilfen, weil, dadurch, deshalb) |
| Deutschland-Linie | Ein Blick zurück (Familie auf dem Zeitstrahl), Deutschland seit 1871 (vom Kaiserreich bis heute), In welcher Zeit war das? (Jahre einordnen, Dauer rechnen) |
| Zeitstrahl-Linie | Der Zeitstrahl, Die Epochen, Quellen und Darstellungen |
| Vorfahren-Linie | Die Menschenarten, Fähigkeiten und Ernährung, Überleben in der Steinzeit |

Der Nationalsozialismus kommt nur als Name und Zeitraum vor, im „Merke“ steht ein kurzer Satz dazu. Die Stationen „Deutschland seit 1871“ und „In welcher Zeit war das?“ sind nicht im Geschichts-Blitz, weil die Zeit nicht in ein Tempo-Spiel passt.

**Weniger Druck, mehr Selbstbestimmung:** Die Lernwelt fordert nicht, sie lädt ein. Die Aufgaben-Überschriften sind Fragen statt Befehle („Was kommt heraus?“ statt „Rechne aus.“). Das Kind wählt die Länge einer Fahrt selbst (3, 5 oder 10 Aufgaben). Kurze Fahrten bringen anteilig weniger Sterne und höchstens 2 als Bewertung, gemeistert und Abstellgleis gibt es nur auf ganzen Fahrten. Aussteigen geht jederzeit: Ab 3 beantworteten Aufgaben zählt das als kurze Fahrt, sonst verfällt die Fahrt ohne Strafe. Abschreiben nach einem Fehler ist ein Angebot, kein Muss. Der Tagesfahrplan heißt „Ideen für heute“.

**Aufgaben-Werkstatt:** Hier stellt das Kind selbst Aufgaben (Text und Lösung), und die anderen Profile, z. B. die Erwachsenen-Profile der Eltern, lösen sie. Jeder hat einen Versuch. Das Kind sieht, wer was geantwortet hat und ob es stimmt. Zahlen werden großzügig verglichen: 135, „135 Diamanten“ und 1.728 bzw. 1728 zählen gleich. Für die Werkstatt gibt es keine Sterne.

**Musik: Klang, Stimme und Klasseninstrumente (3 Linien, 9 Stationen)**

Nach dem MusiX-Arbeitsheft 1 A, Kapitel 2 „Rund um die Stimme“:

| Linie | Stationen |
|---|---|
| Klang-Linie | Merkmale der Musik, Hör genau hin! (Merkmale mit den Ohren erkennen), Singen (wie die Stimme entsteht) |
| Stimm-Linie | Meine Stimme (die drei Versuche: Kehlkopf abtasten, Hände auf Brust und Kopf, Klangschale), Körperteile beim Singen (an einer Zeichnung: Nasenhöhle bis Zwerchfell, Resonanzrohr und Atemorgan), Der Vorgang des Singens (der Lückentext mit den Auswahlwörtern) |
| Instrumenten-Linie | Klasseninstrumente (zehn Instrumente an einer Zeichnung benennen und schreiben), Instrumente erforschen (Material, Spielweise, Klang, Tonhöhe erkennbar?), Grundbeat und kleine Schläge (Hör-Aufgaben wie im Trainingsraum 2: 🔴 = Grundbeat, • = kleiner Schlag) |

Dazu gibt es den „Musik-Blitz“.

**Deutsch: Rechtschreibung (5 Linien, 15 Stationen)**

Die Groß-und-klein-Linie übt Satzanfänge, Nomen und Verben, die zu Nomen werden (das Spielen, beim Lesen). Die Zisch-Linie übt s, ss und ß, die Verwandten-Linie e/ä, eu/äu und das Verlängern (b/p, d/t, g/k), die Vokal-Linie kurze und lange Vokale, tz/ck und das lange i. Die Wörterbuch-Linie übt das ABC, die Grundform und Stolperwörter wie Medaille oder Eishockey. In Deutsch zählen Groß- und Kleinschreibung auch beim Tippen: Stimmen alle Buchstaben und nur groß/klein nicht, darf das Kind selbst verbessern (½ Punkt). Unter dem Eingabefeld gibt es ä, ö, ü und ß zum Antippen. Lückendiktate werden vorgelesen, und viele Auswahl-Aufgaben werden später zum Diktat.

**Aufgabentypen:** Auswahl, Eintippen, Sätze aus Wortkärtchen bauen, Paare finden und Hörverstehen (die englischen Wörter werden vorgelesen).

**So lernt es mit:**
- Wörter, die gut sitzen, kommen seltener dran. Neue und wacklige kommen öfter und werden nach und nach schwieriger (erst Auswahl, dann selbst schreiben, dann nach Gehör schreiben).
- **Erst auswählen, dann selbst schreiben:** Genauso werden über 200 Auswahlfragen in Biologie, Geographie, Geschichte, Musik und Mathe (Fachbegriffe) zum Schreiben, sobald sie ein bisschen sitzen: neu antippen, ab der zweiten Box selbst schreiben. Selbst draufkommen prägt sich besser ein als wiedererkennen. Schreiben ist dabei ein Angebot, kein Muss: Mit **„Lieber auswählen?“** kommen die Antworten zurück, dann gibt es wie beim Tipp einen halben Punkt, und die Aufgabe rückt keine Box höher. Nach einem Fehler kommt wieder die Auswahl. Im Endbahnhof und in der Blitzrunde bleibt alles zum Antippen. Früher gab es viele Kartenfragen doppelt (einmal zum Auswählen, einmal zum Schreiben). Die sind jetzt eine Aufgabe, der Lernstand der Schreib-Aufgabe ist übernommen.
- **Keine Zwillinge in einer Fahrt:** Zwei Fragen zur selben markierten Stelle einer Karte (z. B. „Nordosten“ antippen und „NO“ schreiben) kommen nie in dieselbe Fahrt, in Fächern ohne Fremdsprache auch keine zwei Fragen mit derselben Antwort – sonst verrät die eine die andere. Kleine Stationen ohne Wörter haben dafür eine kürzere Fahrt (die Kontinente: 7 Aufgaben).
- **Wiederholen mit Abständen:** Jede Aufgabe liegt in einer von 8 Boxen. Eine richtige Antwort hebt sie nur eine Box höher, wenn sie wieder fällig war, also nicht mehrmals am selben Tag. Fällig wird sie nach 1, 3, 7, 14, 30, 60 und 120 Tagen. Die langen Abstände halten die tägliche Wiederholung klein, auch wenn es viele Hundert gelernte Wörter gibt. Ein Fehler wirft eine Aufgabe zwei Boxen zurück, aus den langen Abständen bis in Box 3. Was fällig ist, zeigt der Netzplan als **„Wiederholen“**, über alle Stationen hinweg, auch über die auf dem Abstellgleis. Ist etwas fällig, steht die Wiederholung bei den „Ideen für heute“. Die Blitzrunde kann eine Box nur senken, nicht heben, weil dort nur angetippt wird.
- **„Das sitzt“:** Eine Aufgabe sitzt, wenn sie an mindestens drei Tagen richtig war, mit Pausen dazwischen (ab Box 3). Die Startseite zeigt, wie viel schon sitzt und wie viel diese Woche dazugekommen ist, jede Fach-Kachel die Zahl fürs Fach. Am Ziel einer Fahrt steht, was durch diese Fahrt neu sitzt. Sterne zeigen, wie eine Fahrt lief – diese Zahl zeigt, was im Kopf geblieben ist. Sie sinkt nie: Wackelt eine Aufgabe später wieder, holt sie das Fehler-Training, gezählt bleibt sie trotzdem. Eine Zahl, die schrumpft, fühlt sich wie Verlieren an – aus demselben Grund wie bei der Wochenkarte.
- Falsch beantwortete Aufgaben kommen am Ende der Übung noch einmal, mit neu gemischten Antworten. Gewertet wird aber nur der erste Versuch.
- **Fast richtig:** Ist nur ein Buchstabe falsch, darf dein Kind die Antwort einmal selbst verbessern, bevor die Lösung kommt. Klappt das, gibt es einen **halben Punkt** (z. B. „8½ von 10“). Das gilt für Vokabeln und für alles, was in Biologie, Geographie, Geschichte, Musik und Mathe geschrieben wird (in Biologie zählt das Wissen, nicht der eine Buchstabe). Nicht bei Zahlen (3120 statt 3720 ist ein Rechenfehler) und nicht in Englisch-Lücken, wo der eine Buchstabe oft genau das Geübte ist (he like → likes).
- **Tipp-Knopf:** Bei Aufgaben zum Schreiben zeigt „💡 Tipp“ den ersten Buchstaben und für jeden weiteren ein leeres Kästchen (E _ _ _ _ _). Mit Tipp gibt es höchstens einen halben Punkt. Die Serie in der Fahrt bleibt dabei stehen, sie reißt nicht – Hilfe holen soll nichts kosten, was das Kind sich erarbeitet hat. So bleibt dein Kind beim Erinnern, statt aufzugeben. Bei der Wiederholung am Ende der Fahrt kostet der Tipp nichts, in der Blitzrunde gibt es keinen, und bei Antworten unter drei Buchstaben auch nicht.
- **Abschreiben:** Ist eine Vokabel falsch geschrieben, tippt dein Kind die Lösung einmal richtig ab, bevor es weitergeht.
- Nach einem Fehler gibt es eine kurze Erklärung (bei allen Englisch-Grammatikaufgaben) und den Knopf **„📌 Merke ansehen“** mit der Erklärung der Station. Am Ziel listet **„Das übst du noch“** alle Fehler der Fahrt mit Lösung und Vorlese-Knopf auf.
- Die Vokabelkarten aus der Schule (Karteikarten-Linie, `"typePhrases": true`) werden auch als ganze Wendung abgefragt, so wie im Vokabeltest. Das „to“ vorne darf fehlen.
- Das **Fehler-Training** sammelt alles, was noch nicht sitzt, über alle Stationen hinweg.
- Typische Fehler deutscher Kinder werden freundlich angesprochen, zum Beispiel großgeschriebene Nomen („Dog“) oder kleingeschriebene Wochentage. Bei einem einzelnen falschen Buchstaben kommt „Fast!“.
- Neben jedem 🔊 gibt es einen 🐢-Knopf, der deutlich langsamer vorliest.

## Sterne, Abzeichen und Medienzeit

Jede Fahrt wird mit 1 bis 3 Sternen bewertet (unter 70 % richtig: 1 Stern, ab 70 %: 2 Sterne, ab 90 %: 3 Sterne). Wie viele Sterne es dafür aufs Konto gibt, hängt davon ab, wie oft dein Kind **dieselbe Station heute schon gefahren** ist:

| Fahrt auf derselben Station am selben Tag | Sterne |
|---|---|
| 1. Fahrt | Bewertung × 2 (2, 4 oder 6) |
| 2. Fahrt | Bewertung × 1 (1, 2 oder 3) |
| ab der 3. Fahrt | 1 |

So lohnt sich Wiederholen weiterhin, aber eine leichte Station immer wieder abzufahren bringt kaum etwas. Die Endbahnhof-Prüfung ist genauso gestaffelt (pro Linie). Das Fehler-Training und die Wiederholung bringen immer Bewertung × 2: Sie enthalten nur Aufgaben, die noch nicht sitzen oder gerade fällig sind.

| Bonus | Sterne |
|---|---|
| Station zum ersten Mal mit 3 Sternen | +4 |
| erste Übung des Tages | +2 |
| Endbahnhof-Prüfung einer Linie zum ersten Mal bestanden | +6 |
| neues Abzeichen (30 Stück, z. B. 3 Tage am Stück, 10 fehlerfreie Übungen) | +6 |

Die Blitzrunde selbst bringt keine Sterne, nur Rekorde und XP.

### Wochenkarte

Ein Tag kommt auf die **Wochenkarte** (📅 oben in der Leiste und auf der Startseite, Montag bis Sonntag), wenn dein Kind an ihm mindestens **3 Sterne mit Fahrten** verdient, zum Beispiel eine Fahrt mit mindestens 70 % oder zwei Fahrten. Kurze Fahrten zählen mit ihren anteiligen Sternen. Boni, Abzeichen und doppelte Sterne zählen dafür nicht mit, das Tageslimit spielt keine Rolle. Für jeden Tag auf der Karte gibt es Bonuszeit, sobald er zählt:

| Tag auf der Wochenkarte | Bonus |
|---|---|
| 1. Tag | – |
| 2. bis 4. Tag | je 5 Minuten |
| 5. bis 7. Tag | je 10 Minuten, am 5. Tag dazu die Lootbox der Woche |

Die Tage müssen **nicht hintereinander** liegen: Ein ausgelassener Tag kostet nur seinen eigenen Bonus, es reißt nichts. Das ist Absicht, denn eine Serie, die reißt, kann bei Kindern mit Anforderungs-Vermeidung in „jetzt ist eh alles egal“ kippen. Jeden Montag fängt eine neue Karte an. Die Minuten werden als Sterne gutgeschrieben (Minuten ÷ Minuten pro Stern, aufgerundet) und **zählen nicht zum Tageslimit**. Erwachsenen-Profile bekommen keinen Bonus.

Im Hintergrund zählt die Lernwelt weiter die Tage am Stück (mit Serienschutz: einmal pro Woche darf ein Tag fehlen). Daraus kommen die Serien-Abzeichen (3, 7 und 21 Tage) und die Zahl „Tage am Stück“ im Elternbereich. Dem Kind wird sie nicht mehr angezeigt.

### Abstellgleis und Lootboxen

Hat dein Kind eine Station **an 5 verschiedenen Tagen mit 3 Sternen** geschafft, kommt sie aufs **Abstellgleis**: Sie ist auf dem Netzplan grau markiert und bringt keine Sterne mehr (auch keine doppelten). Üben geht dort weiterhin. Pro Tag zählt nur eine Fahrt mit 3 Sternen: Fünfmal hintereinander am selben Nachmittag zeigt nur das Kurzzeitgedächtnis, fünf verschiedene Tage zeigen, dass die Station sitzt (und die Lootbox lässt sich nicht an einem Nachmittag abholen). Bis dahin zeigt der Netzplan den Stand, z. B. „🎁 3/5“, und die Station sagt, wenn heute schon eine Fahrt gezählt hat. Fahrten von vor der Umstellung zählen weiter einzeln, damit kein Stand zurückgeht. Die Zahl stellst du im Elternbereich unter den Regeln ein (0 = kein Abstellgleis). Beim Kind unter **Stationen** kannst du eine Station mit „Reaktivieren“ für ein paar Fahrten zurückholen. Danach steht sie wieder auf dem Abstellgleis.

Eine **Lootbox** gibt es einmalig, wenn eine Station aufs Abstellgleis kommt und wenn der Endbahnhof einer Linie zum ersten Mal bestanden ist, und am 5. Tag jeder Wochenkarte. Außerdem kannst du deinem Kind im Elternbereich (beim Kind unter **Lootboxen**) als Ansporn bis zu 5 Boxen auf einmal schenken, mit einer kurzen Nachricht, die es auf der Box liest. Geschenkte Boxen haben eine eigene Farbe, und der Netzplan sagt „Deine Eltern haben dir eine Lootbox geschenkt!“. Dein Kind sammelt die Boxen (🎁 oben in der Leiste) und öffnet sie, wann es will. Erst beim Öffnen wird ausgelost, was drin ist:

| Seltenheit | Medienzeit | Wahrscheinlichkeit |
|---|---|---|
| Normal (grau) | 5 Minuten | 49 % |
| Selten (blau) | 10 Minuten | 30 % |
| Episch (lila) | 15 Minuten | 15 % |
| Legendär (gold) | 20 Minuten | 5 % |
| Mythisch (Regenbogen, Hauptgewinn) | 30 Minuten | 1 % |

Beim Öffnen wackelt die Box und dreht dann Stufe für Stufe durch die Farben hoch, bis sie bei ihrer Seltenheit ankommt. Jede Stufe blitzt auf, und die Box leuchtet stärker, wackelt schneller und tickt schneller. Je seltener die Box, desto länger dauert also die Spannung. Ab Episch gibt es Konfetti, ab Legendär Strahlen. Bei „Bewegung reduzieren“ zeigt die Box gleich das Ergebnis.

Die Minuten werden als Sterne gutgeschrieben (Minuten ÷ Minuten pro Stern, aufgerundet) und **zählen nicht zum Tageslimit**. Das gilt auch für geschenkte Boxen. Erwachsenen-Profile bekommen keine Boxen.

Nach einer geschafften Fahrt (ab 2 Sternen) schlägt die Ankunft den **nächsten Halt** vor: eine Station, die heute noch nicht dran war, am liebsten eine ohne 3 Sterne. „Nochmal fahren“ gibt es weiterhin, aber nur als zweite Wahl. Auch auf einer Station, die heute schon geschafft wurde oder auf dem Abstellgleis steht, zeigt die Seite den Weg zum nächsten Halt.

Im **Elternbereich** stellst du ein:
- wie viele Minuten Medienzeit ein Stern wert ist (Standard: 1 Minute, auch 0,5er-Schritte möglich)
- wie viele Sterne es höchstens pro Tag gibt (Standard: 60). Üben geht danach weiter, nur ohne Sterne.
- welche Ticket-Größen es gibt (Standard: 15, 30 und 60 Minuten)

Für besondere Tage gibt es im Elternbereich zwei Extras (sie gelten für alle Kinder):
- **Tageslimit für einzelne Tage:** ein eigenes Tageslimit für ein bestimmtes Datum, höher (z. B. am Wochenende) oder niedriger. Ein Knopf legt es gleich für Samstag und Sonntag fest.
- **Doppelte Sterne:** ein Event für 30 Minuten bis 3 Stunden oder nur für die nächste Fahrt. Jede Fahrt, die in dieser Zeit gestartet wird, bringt doppelte Sterne (Boni und Abzeichen zählen normal). Du kannst das Event auf ein Fach, eine Linie oder eine einzelne Station beschränken, um dein Kind gezielt zu Aufgaben zu locken, die es gerade braucht. Die Kinder sehen das Event auf ihrem Netzplan, mit Link dorthin; die betroffenen Stationen sind markiert. Das Tageslimit gilt weiter, heb es also bei Bedarf für den Tag an.

Hattest du die Lernwelt schon vor der Staffelung im Einsatz, stellt sie beim ersten Start einmal um: Kontostände, Sterne-Verlauf und offene Tickets werden verdoppelt, die Minuten pro Stern halbiert und das Tageslimit verdoppelt. Die Medienzeit, die dein Kind schon gespart hat, bleibt also gleich.

Löst dein Kind ein Ticket, werden die Sterne sofort abgezogen und das Ticket wartet auf dein OK. Lehnst du ab (oder gibt dein Kind es zurück), kommen die Sterne zurück. Du kannst außerdem von Hand Sterne gutschreiben oder abziehen, etwa für einen guten Vokabeltest.

## Spiel-Elemente

Diese Elemente sollen die Aufmerksamkeit halten, ohne zusätzliche Medienzeit zu verteilen:

- **Serie in der Fahrt:** Ab 3 richtigen Antworten hintereinander wird der Zug zum Schnellzug, ab 5 zum ICE. Am Ziel steht die längste Serie, mit Hinweis auf einen neuen Rekord.
- **Tagesfahrplan:** Jeden Tag gibt es 3 kleine Aufgaben, z. B. „Fahr eine Station in Mathe“, „Mach deine Wiederholung von heute“, „Mach ein Fehler-Training“ oder „Mach eine Blitzrunde“. Sind alle erledigt, gibt es einen Stempel im Stempelheft.
- **Blitzrunde:** 60 Sekunden, so viele Aufgaben wie möglich. Es gibt einen persönlichen Rekord, eine Kurve der letzten Runden und **Familien-Rekorde**. Wenn du mitspielen willst, lege im Elternbereich ein **Erwachsenen-Profil** an. Das sammelt keine Sterne und kann keine Tickets lösen.
- **Endbahnhof:** Haben alle Stationen einer Linie mindestens 2 Sterne, öffnet sich eine gemischte Prüfung über die ganze Linie. Ab 80 % ist sie bestanden, und es gibt eine Goldkarte.
- **Sammelalbum:** Jede Station mit 3 Sternen bringt eine Sammelkarte mit einem „Wusstest du?“-Text oder dem Merksatz der Station.
- **Ränge und Züge:** XP gibt es für richtige Antworten (10), Stempel (50) und Endbahnhöfe (100). Der Weg führt über 9 Ränge vom Fahrgast bis zur Streckenlegende, und jeder Rang schaltet einen Zug frei, mit dem das Kind fährt.
- **Wochenkarte:** Bonuszeit für jeden Tag, an dem geübt wurde, und eine Lootbox bei 5 Tagen in einer Woche (siehe [Wochenkarte](#wochenkarte)).
- **Companion:** Eine Katze begleitet jede Fahrt. Jede der vier Katzen hat ihre eigene Art: Die schwarze („Geheimnisvoll“) dreht bei richtigen Antworten eine Pirouette mit Sternen, die weiße („Verträumt“) schwebt mit Herzen, die braune („Gemütlich“) hüpft schnurrend mit Noten, die getigerte („Wild“) springt wie auf Mäusejagd. Auch im Schlaf unterscheiden sie sich (Schwanzspitze, Ohrenzucken, Strecken, Schnarchblase). Nach einem Fehler schauen sie kurz auf und machen Mut, ab 5 richtigen Antworten in Folge bleiben sie wach und fiebern mit, und am Ziel feiern sie mit. Antippen geht auch. Katze und Skins wählt das Kind in der Sammlung unter „Companion“.
- **Effekte:** Konfetti, Fanfare und hochzählende Sterne bei besonderen Momenten. Bei „Bewegung reduzieren“ in den Geräteeinstellungen fallen die Animationen weg.

Im Elternbereich siehst du pro Kind: Übungszeit der letzten 14 Tage, was noch schwerfällt (konkrete Wörter und Sätze), wie viel sicher sitzt (und wie viel davon diese Woche dazugekommen ist), den Stand jeder Station, die Lootboxen, die letzten Fahrten und das komplette Sterne-Konto.

**Stationen archivieren:** Ist ein Thema vom Stoff her nicht mehr dran, archivierst du die Station (oder gleich die ganze Linie) beim Kind unter **Stationen**. Sie verschwindet dann vom Netzplan, aus dem Fehler-Training, aus der Blitzrunde und aus dem Endbahnhof. Der Endbahnhof braucht dann nur noch die übrigen Stationen. Der Fortschritt bleibt gespeichert, und mit „Zurückholen“ ist die Station wieder da. Das gilt pro Kind.

Das **Fahrtenbuch** listet jede abgeschlossene Fahrt aller Kinder: Uhrzeit, Station mit Fach und Linie, wie viel Prozent richtig war, die Bewertung (1–3 Sterne) und wie viele Sterne es dafür gab. Wiederholungen am selben Tag und Fahrten mit doppelten Sternen sind markiert. Filtern lässt es sich nach Kind und Zeitraum; die letzten Fahrten stehen auch direkt auf der Übersicht.

**Die Eltern-PIN ist am Anfang `1234`.** Bitte gleich im Elternbereich ändern (oder vor dem ersten Start `PARENT_PIN` setzen).

---

## Installation auf Unraid

Das Image wird bei jedem Push auf `main` automatisch von GitHub gebaut und als `ghcr.io/nilsgaertner/lernwelt:latest` veröffentlicht. Auf dem Server musst du nichts bauen.

### 1. Template holen

Im Unraid-Terminal (Symbol `>_` oben rechts):
```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-lernwelt.xml \
  https://raw.githubusercontent.com/NilsGaertner/lernwelt/main/unraid/lernwelt.xml
```

### 2. Container in Unraid anlegen

1. Reiter **Docker** → **Add Container**.
2. Oben bei **Template** unter „User templates“ **lernwelt** auswählen.
3. Port und Datenordner prüfen (Standard: `8080` und `/mnt/user/appdata/lernwelt/data`), optional eine Start-PIN eintragen → **Apply**. Unraid lädt das Image dabei von GitHub.
4. In der Docker-Liste bei „lernwelt“ **Autostart** einschalten.

Die Lernwelt läuft dann unter **`http://DEIN-UNRAID:8080`**. Über das Symbol in der Docker-Liste kommst du mit **WebUI** direkt hin.

> Falls schon ein Container `lernwelt` läuft (z. B. per `docker run` gestartet), entferne ihn vorher mit `docker rm -f lernwelt`. Die Daten in `appdata/lernwelt/data` bleiben dabei erhalten.

### 3. Einrichten

1. `http://DEIN-UNRAID:8080` öffnen und auf **Elternbereich** klicken.
2. Mit PIN `1234` (oder der Start-PIN aus dem Template) anmelden, **eigene PIN festlegen** und ein **Kinderprofil anlegen**.
3. Auf dem Tablet oder Laptop deines Kindes die Seite öffnen und „Zum Startbildschirm hinzufügen“ wählen. Dann sieht sie aus wie eine App. Für eine echte App-Installation auf Android siehe unten.

### Als App auf Android installieren

Chrome kann die Lernwelt als eigene App installieren (Menü ⋮ → **„App installieren“**). Sie hat dann ein eigenes Symbol, läuft ohne Adressleiste und taucht in der App-Liste auf. Die Seite bringt dafür alles mit (Manifest, Service Worker, Icons).

**Voraussetzung ist HTTPS.** Über `http://DEIN-UNRAID:8080` bietet Chrome nur eine Verknüpfung an, die im normalen Chrome öffnet. Ein Weg ohne Portfreigabe:

1. Bei [DuckDNS](https://www.duckdns.org) eine kostenlose Adresse anlegen (z. B. `lernwelt-familie.duckdns.org`) und als IP die **Heimnetz-IP** des Unraid-Servers eintragen (z. B. `192.168.178.20`). Die Adresse funktioniert dadurch nur zu Hause.
2. In Unraid den Container **Nginx Proxy Manager** installieren, einen Proxy Host für die Adresse anlegen (Ziel: Unraid-IP, Port 8080) und unter **SSL** ein Let's-Encrypt-Zertifikat mit **„DNS Challenge“ → DuckDNS** anfordern (Token von der DuckDNS-Seite).
3. Bei einer **FRITZ!Box**: Heimnetz → Netzwerk → Netzwerkeinstellungen → **DNS-Rebind-Schutz**, dort die DuckDNS-Adresse als Ausnahme eintragen. Sonst löst die Box die Adresse nicht auf.
4. Auf dem Handy `https://lernwelt-familie.duckdns.org` öffnen → ⋮ → **App installieren**.

**Family Link:** Die installierte App erscheint in Family Link als eigene App. Ob sie auch funktioniert, wenn Chrome gesperrt oder die Chrome-Zeit aufgebraucht ist, hängt von Android- und Chrome-Version ab (die App läuft intern mit Chrome). Bitte einmal ausprobieren, bevor du dich darauf verlässt.

### Updates

Neue Versionen erkennt Unraid selbst:

1. Reiter **Docker** → unten **Check for Updates** (Unraid prüft das auch regelmäßig von sich aus).
2. Bei „lernwelt“ steht dann **update ready** → darauf klicken → **apply update**.

Mit dem Plugin **Auto Update Applications** (aus den Community Applications) geht das auch automatisch, z. B. jede Nacht.

Fortschritt, Sterne und Einstellungen liegen in `appdata/lernwelt/data` und bleiben bei Updates erhalten. Dieser Ordner ist auch das, was gesichert werden sollte (das Plugin „Appdata Backup“ erledigt das automatisch).

**Neue Version veröffentlichen:** Neue Funktionen und Inhalte entstehen auf einem eigenen Branch. Auf Branches und in Pull Requests prüft GitHub nur, ob die Inhalte in Ordnung sind und das Image baut und startet. Erst ein Push (bzw. Merge) auf `main` veröffentlicht das Image und löst in Unraid das Update aus. Den Stand siehst du im Repo unter **Actions**.

### Umstieg vom selbst gebauten Image

Hast du die Lernwelt früher mit `build.sh` gebaut, steht im Container noch das Image `lernwelt`. Einmal umstellen:

1. **Docker** → auf **lernwelt** klicken → **Edit**.
2. Bei **Repository** `ghcr.io/nilsgaertner/lernwelt:latest` eintragen → **Apply**.

Einstellungen und Daten bleiben erhalten. Danach kommen Updates wie oben beschrieben. Das alte Image kannst du danach im Terminal mit `docker rmi lernwelt` entfernen.

### Notlösung: selbst bauen

Falls GitHub einmal nicht erreichbar ist oder du eine Version testen willst, die noch nicht auf `main` liegt, kannst du das Image auch auf dem Server bauen:

```bash
git clone https://github.com/NilsGaertner/lernwelt.git /mnt/user/appdata/lernwelt/app   # nur beim ersten Mal
bash /mnt/user/appdata/lernwelt/app/unraid/build.sh
```
Das Skript holt die neueste Version, baut das Image unter demselben Namen (`ghcr.io/nilsgaertner/lernwelt:latest`) und stellt den laufenden Container gleich darauf um. Port, Datenordner und die übrigen Einstellungen bleiben erhalten. Startet die neue Version nicht, stellt es automatisch die alte wieder her. Ein älteres Template stellt es dabei auch gleich auf das Image von GitHub um.

Mit **Force Update** in der Docker-Liste kommst du danach wieder auf die Version von GitHub.

### Alternative: Docker Compose

Mit dem Plugin **Docker Compose Manager** geht statt des Templates auch `docker compose up -d` im Projektordner (siehe `docker-compose.yml`). Updates holst du dann mit `docker compose pull && docker compose up -d`. Ohne das Plugin kennt Unraid den Befehl `docker compose` nicht.

### Eigene Aufgaben (z. B. für andere Familien oder Klassen)

Beim Start legt die App im Datenordner den Ordner **`aufgaben`** an (auf Unraid: `/mnt/user/appdata/lernwelt/data/aufgaben`). Darin liegen:

- `LIESMICH.txt` – eine kurze Anleitung,
- `_beispiel/` – ein kleines Englisch-Fach mit einer Linie und drei Stationen zum Abschauen,
- `_mitgeliefert/` – eine Kopie aller mitgelieferten Fächer. Sie wird bei jedem Start neu geschrieben, darin also nichts ändern.

Solange dort kein Fach-Ordner liegt (ein Ordner mit `subject.json`), laufen die mitgelieferten Aufgaben. **Sobald dort ein Fach-Ordner liegt, zeigt die App nur noch die Fächer aus `aufgaben`.** Ordner mit `_` vorn zählen nicht mit. Wer z. B. Mathe behalten und nur Englisch austauschen will, kopiert `_mitgeliefert/mathe` nach `aufgaben/mathe` und legt daneben ein eigenes `englisch`. Wie die Dateien aufgebaut sind, steht unten unter [Inhalte ändern und erweitern](#inhalte-ändern-und-erweitern).

Nach einer Änderung im Elternbereich unter „Lerninhalte“ auf **„Inhalte neu einlesen“** tippen. Dort steht auch, welche Aufgaben gerade laufen, und Fehler in den Dateien werden angezeigt. Zurück zu den mitgelieferten Aufgaben: die Fach-Ordner aus `aufgaben` entfernen (oder ein `_` davorsetzen) und neu einlesen.

Updates des Images ändern an den eigenen Aufgaben nichts. Ein anderer Ort für den Ordner geht mit der Umgebungsvariablen `CUSTOM_CONTENT_DIR`.

### Themen

Jedes Profil hat ein Thema, einstellbar im Elternbereich beim Profil unter **„Thema“**. Dort lässt sich auch festlegen, ob das Kind selbst wechseln darf (dann in der Sammlung unter „🎨 Thema“). Das Thema ändert Farben, Schrift, Ränge, Abzeichen-Namen und die Wörter. Sterne, Lootboxen und Lernstand bleiben beim Wechsel erhalten.

| Thema | Plan | Linie | Station | Fahrt | Endbahnhof | Abstellgleis |
|---|---|---|---|---|---|---|
| 🚆 Bahn | Netzplan | Linie | Station | Fahrt | Endbahnhof | Abstellgleis |
| ⛏️ Block-Welt | Weltkarte | Biom | Level | Expedition | Schatzkammer | Truhe |
| 🌿 Ruhig | Lernplan | Kurs | Lektion | Runde | Abschluss | Ablage |

Ein neues Thema steht in `public/js/themes.js` (Wörter mit Geschlecht, Ränge, Symbole) und in `public/css/app.css` im Abschnitt „Themen“ (Farben). Eigene Grafiken zeichnet `public/js/theme-art.js`: In der Block-Welt bekommt jede Linie eine Pixel-Landschaft mit einem Wimpel pro gemeisterter Station, und die Stationen sind Blöcke auf dem Weg in die Schatzkammer. In „Ruhig“ wächst pro Kurs eine Pflanze, die nach dem Abschluss blüht.

### Hinweise

- Die Seite ist fürs **Heimnetz** gedacht. Bitte nicht per Portfreigabe ins Internet stellen, denn der Container selbst kann kein HTTPS und es gibt nur eine einfache PIN.
- Das Vorlesen nutzt die Stimmen des Geräts. Auf iPad, Android, Windows und in Chrome/Edge klappt das gut. Falls nichts zu hören ist: Lautstärke prüfen und in den Geräteeinstellungen eine englische und eine deutsche Stimme installieren.
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

Alle Lerninhalte liegen als JSON-Dateien in `content/<fach>/`. Nach einer Änderung `npm run check` ausführen und die Änderung wie jede andere über einen Branch auf `main` bringen. Das neue Image enthält dann die neuen Inhalte (Update in Unraid wie oben). Lokal beim Ausprobieren reicht es, im Elternbereich **„Inhalte neu einlesen“** zu klicken.

### Eine Station (eine Datei pro Station)

```json
{
  "id": "colours",
  "line": "aussehen",
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
- **`exercises`**: `choice` (Auswahl), `input` (Eintippen, `___` markiert die Lücke) und `order` (Satz bauen). Weitere Felder: `accept` für weitere richtige Antworten, `task` für einen eigenen Aufgabentext, `de` für eine deutsche Übersetzung als Hilfe, `"numeric": true` für eine Zahlentastatur, `"speak": false`, wenn der Satz nicht vorgelesen werden soll, und `"strict": true`, wenn Kurz- und Langform (don't / do not) nicht beide gelten sollen.
- **`"recall": true`** an einer `choice`-Aufgabe: Sie kommt erst zum Auswählen und ab der zweiten Box zum Schreiben (siehe „Erst auswählen, dann selbst schreiben“). Für die Schreib-Form gelten `answer` und `accept`, optional `placeholder`. Statt `true` geht auch ein eigener Aufgabentext für die Schreib-Form, z. B. `"recall": "Lückentext: Welches Wort fehlt?"`. Eine zweite Aufgabe zum Schreiben derselben Sache ist dann überflüssig – `npm run check` meldet sie. In Englisch braucht eine recall-Aufgabe `de` oder `hint`, sonst weiß das Kind beim Schreiben nicht, welches Wort gemeint ist. Passt nur für Fragen, die man auch ohne Auswahl beantworten kann (nicht für „Was gehört **nicht** dazu?“).
- **`"say"`** an einer `input`-Aufgabe oder einer `choice`-Aufgabe mit `recall`: Diktat. Beim Schreiben wird vorgelesen, bei `true` der Satz samt fehlendem Wort, sonst der angegebene Text. Das Fach braucht dafür `speechLang`.
- **`"formerIds": ["…"]`**: Ersetzt eine Aufgabe andere Aufgaben derselben Station (z. B. den gelöschten Schreib-Zwilling), geht deren Lernstand beim nächsten Start auf sie über.
- **Karten und Bilder**: `"map": "welt", "mark": "afrika"` zeigt in einer Aufgabe die Karte `content/<fach>/media/welt.svg` und hebt das Gebiet mit der id `afrika` hervor. Im „Merke“ zeigt `{ "map": "welt", "legend": [["afrika", "Afrika"], …] }` die Karte mit bunt gefärbten Gebieten und Legende. `npm run check` meldet fehlende Karten und Gebiete. Das geht genauso mit Zeichnungen, z. B. `content/biologie/media/hund-skelett.svg`: Dort sind Knochen (`class="bone"`) in Gruppen mit id zusammengefasst, und Nummern in `<g class="labels">` erscheinen nur im „Merke“. In `content/musik/media/klasseninstrumente.svg` hat jedes Instrument ein Feld (`class="slot"`), das markiert bzw. eingefärbt wird, damit das Instrument selbst seine Farben behält.
- **`"enabled": false`** in einer Stationsdatei blendet diese Station aus.
- **`"card"`**: eigener Text für die Sammelkarte der Station. Ohne dieses Feld steht der erste Merksatz auf der Karte.
- **Blitzrunden** stehen in der `subject.json` des Fachs, z. B. `"blitz": [{ "id": "quadrate", "title": "Quadratzahlen-Blitz", "units": ["quadrat-11-15"] }]`. Statt `units` geht auch `"line": "zahlen"` für eine ganze Linie. Mit `"types": ["choice"]` kommen nur Auswahlaufgaben dran.

### Ein neues Fach (z. B. Französisch)

1. Ordner `content/franzoesisch/` anlegen.
2. Darin eine `subject.json` mit Name und Linien:
   ```json
   {
     "id": "franzoesisch", "name": "Französisch", "icon": "🇫🇷", "order": 8,
     "lines": [ { "id": "start", "name": "Start-Linie", "color": "#C2410C" } ]
   }
   ```
   Für Fremdsprachen zusätzlich `"speechLang": "fr-FR"` (o. Ä.) angeben, dann wird vorgelesen. Mit `"spelling": true` (wie in Deutsch) zählt beim Tippen auch Groß- und Kleinschreibung, und es gibt die Tasten ä, ö, ü und ß.
3. Stationen wie oben als eigene Dateien daneben legen.

Am besten hat jede Linie 3 Stationen: Dann ist der Endbahnhof (mit Lootbox) schnell erreicht. Teilst du die Linien eines Fachs später neu auf, trag die alten unter `"formerLines": [{ "id": "…", "name": "…" }]` ein. Dann behalten schon bestandene Endbahnhöfe ihre Goldkarte, und das Fahrtenbuch zeigt weiter den Namen der Linie.

Sobald es mehr als ein Fach gibt, erscheinen oben auf dem Netzplan Reiter zum Umschalten. Sterne, Abzeichen und Tickets gelten fächerübergreifend.

### Mathe: berechnete Aufgaben

Unter `content/mathe/` liegen außerdem drei Beispiel-Stationen (Einmaleins, Geteilt, Minus bis 1000), die noch **ausgeschaltet** sind. Zum Einschalten in der jeweiligen Datei die Zeile `"enabled": false` löschen.

Diese Stationen haben keine festen Aufgaben. Sie werden von `server/generators/rechnen.js` jedes Mal neu erzeugt:
```json
{ "id": "einmaleins", "line": "kopfrechnen", "title": "Das kleine Einmaleins",
  "generator": "rechnen", "params": { "op": "mul", "min": 2, "max": 10 }, "itemCount": 90 }
```
Genauso funktioniert `server/generators/schriftlich.js` für die schriftliche Addition (Aufgabentyp `column`). Auf der Merke-Seite zeigt ein Block `{ "column": { "rows": ["367", "258"] } }` eine fertig gerechnete Aufgabe mit Überträgen.

Für neue Aufgabenarten (z. B. Brüche, Uhrzeiten) legst du einen weiteren Generator in `server/generators/` an. Wie der aufgebaut ist, steht oben in `rechnen.js`. `npm run check` erzeugt von jedem Generator ein paar Proben und prüft sie, auch dass `byId` aus der id wieder genau dieselbe Aufgabe baut (das braucht das Fehler-Training).

Auch der Satz-Trainer in Englisch ist ein Generator: `server/generators/saetze.js` mit `"params": { "rules": ["be", "have"] }` (am/is/are, have got), `["s"]` (he/she/it mit -s) oder `["do"]` (do/does, don't/doesn't). Alle Verbformen stehen dort ausgeschrieben in Listen. Neue Wörter oder Personen hängst du dort an, eine vorhandene id bekommt nie eine andere Bedeutung, sonst passen die gespeicherten Fehler nicht mehr.

## Aufbau (für Neugierige)

```
server/        Node.js-Server (Express, SQLite über das eingebaute node:sqlite)
  index.js       API-Routen für Kinder und Eltern
  session.js     Aufgaben auswählen, Antworten prüfen, Wiederholungs-Logik
  rewards.js     Sterne, Tageslimit, Abzeichen, Tickets
  progress.js    Ränge, Serie, Wochenkarte, Tagesfahrplan, Endbahnhöfe, Abstellgleis und Archiv
  lootbox.js     Lootboxen
  content.js     liest die Inhalte ein
  srs.js         Wiederholen mit Abständen, „Das sitzt“
  generators/    berechnete Aufgaben (Mathe, Englisch-Sätze)
public/        Oberfläche (reines HTML/CSS/JS, kein Build-Schritt)
unraid/        Docker-Template und Build-Skript für Unraid
content/       Lerninhalte als JSON (Karten in content/<fach>/media/, Kartendaten: Natural Earth)
vorlage/       Anleitung und Beispiel für eigene Aufgaben (wird nach data/aufgaben kopiert)
data/          Datenbank und eigene Aufgaben (wird automatisch angelegt, im Container: /data)
```
