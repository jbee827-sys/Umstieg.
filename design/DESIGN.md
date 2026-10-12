# Design System: Umstieg.

Vorlage für die Bildschirm-Erzeugung mit Google Stitch.
Stand 20.09.2026 · abgeleitet aus `BRIEF.md` im Projektstamm.

**Diese Datei hat Vorrang vor jeder Stitch-Voreinstellung.** Abschnitt 8 hat
Vorrang vor allen anderen Abschnitten dieser Datei.

---

## 1. Stimmung und Dichte

Eine ruhige, kontraststarke Oberfläche für jemanden mit Koffer in einem fremden
Bahnhof unter Zeitdruck. Die Atmosphäre ist die einer guten Bahnhofsbeschilderung:
sachlich, laut genug zum Lesen im Gehen, ohne jeden Schmuck. Nichts blinkt,
nichts pulsiert, nichts lenkt ab — es gibt draußen schon genug Reize.

| Regler | Wert | Bedeutung |
|---|---|---|
| Dichte | 4 | ausgewogen, eine Kernaussage je Bildschirm |
| Varianz | **2** | vorhersehbar und symmetrisch |
| Bewegung | **5** | flüssig auf jede Handlung, still von selbst |

**Bewusste Abweichung von den Stitch-Standardwerten (Varianz 8, Bewegung 6):**
Wer diese App benutzt, ist unter Zeitdruck in einer fremden Umgebung. Jede
Überraschung im Aufbau kostet Sekunden, die er nicht hat. Vorhersehbarkeit ist
hier eine Funktion, kein Mangel an Mut. Ein Bildschirm, der jedes Mal anders
gegliedert ist, ist für diese Zielgruppe ein Fehler.

Bei der Bewegung verläuft die Grenze nicht zwischen viel und wenig, sondern
zwischen zwei Arten: **Bewegung, die auf eine Handlung antwortet, ist erwünscht
und durchgehend flüssig. Bewegung, die von selbst Aufmerksamkeit fordert, ist
verboten.** Siehe Abschnitt 6.

---

## 2. Farbpalette und Rollen

Die App hat drei Grundfarben in fester Rangfolge:
**Weiß primär · Rot sekundär · Grau tertiär.**

Rot ist damit eine gestaltende Farbe, kein Notsignal — es trägt den Hauptknopf,
die Auswahlmarke und die Marke selbst. Genau deshalb gilt die wichtigste Regel
dieses Abschnitts:

> **Rot allein bedeutet nichts. Der Alarm ist Rot _und_ Gelb zusammen.**

Grundregel für Schrift: **Fläche hell, Schrift dunkel.** Alle Werte sind
gemessen, nicht geschätzt.

### Helle Palette

**Primär — Weiß**
- **Reinweiß** (`#ffffff`) — Grundfläche des Bildschirms
- **Papierweiß** (`#faf9f9`) — ruhige Variante für große Flächen

**Sekundär — Rot**
- **Signalrot** (`#ec3013`) — Hauptknopf, Auswahlmarke, Marke, Akzentflächen.
  Weiß darauf erreicht 4,2:1 und ist deshalb **nur für große, fette Schrift**
  erlaubt (ab 22 px / Schnitt 600) — also Knopfbeschriftungen, nie Fließtext.
  **Ausnahme seit dem 12.10.2026: die Hauptknöpfe** mit 18 px / Schnitt 800 –
  auf Wunsch kleiner, und bewusst mit dem Wissen, dass 4,2:1 für diese Größe
  unter der WCAG-Grenze von 4,5:1 liegt (als große Schrift zählt fett erst
  ab 18,66 px). Die Alternative wäre Druckrot gewesen.
- **Druckrot** (`#c42207`) — gedrückter Zustand und überall sonst, wo weiße
  Schrift kleiner als 22 px auf Rot stehen muss (5,9:1)
- **Rotschrift** (`#ae1800`) — rote Schrift auf hellem Grund (7,2:1)
- **Rotschleier** (`#fff2ef`) — sehr helle rote Tönung für Akzentflächen

**Tertiär — Grau**
- **Kartengrau** (`#eae9e9`) — Karten, Felder, eingefasste Blöcke
- **Tintenschwarz** (`#201e1d`) — Haupttext (16,6:1 auf Weiß)
- **Nebelgrau** (`#605d5d`) — Nebentext, Beschriftungen (6,5:1)
- **Linienstrich** (`#d7d3d3`) — Trennlinien, Feldränder

**Status**
- **Gut** — Bahngrün (`#0f7a4f`), Fläche und Schrift (5,4:1)
- **Warnung** — Bernstein (`#e08a00`) als Fläche mit tintenschwarzer Schrift
  (6,2:1); als Schriftfarbe auf hellem Grund stattdessen `#9a5b00` (5,4:1)
- **Alarm** — Signalrot **plus** Warngelb (`#ffd400`), siehe unten

### Der Alarm: Rot und Gelb, nie Rot allein

Weil Rot in dieser App überall vorkommt, kann es die Ampel nicht mehr allein
tragen. Der Alarmzustand wird deshalb durch die **Kombination** kenntlich
gemacht — dieselbe Konvention wie an einer Warnbake oder einem Absperrband:

- Die Alarmfläche trägt an ihrer Kante einen **schräg gestreiften Saum in
  Rot und Gelb**, 6 px hoch, 45 Grad. Kein anderes Element der App hat Streifen.
- Die Alarmlampe der Ampel ist **zweigeteilt**: rote Hälfte, gelbe Hälfte.
- Die Schrift steht **nicht** auf den Streifen, sondern daneben oder darunter —
  auf `#fff2ef` in `#ae1800` (7,2:1). Lesbarkeit geht vor Dramatik.
- Dazu wie immer der Satz. Der Zustand ist nie allein über Farbe erkennbar.

Warngelb `#ffd400` trägt tintenschwarze Schrift mit 11,6:1. **Weiß auf Gelb
(1,4:1) ist verboten.**

### Dunkle Palette — Pflicht, nicht optional

Nachts im Bahnhof ist ein weißer Bildschirm eine Blendgranate.

- **Nachtgrund** (`#17161a`) — Grundfläche
- **Nachtfläche** (`#221f24`) — Karten und Felder
- **Lichtschrift** (`#f3f2f2`) — Haupttext (16,1:1)
- **Dämmergrau** (`#b4b0ae`) — Nebentext (8,4:1)
- **Nachtrot** (`#ff5233`) — Sekundärfarbe und Alarm (5,6:1)
- **Nachtbernstein** (`#f0a832`) — Warnung (8,9:1)
- **Nachtgelb** (`#ffd400`) — der gelbe Anteil des Alarmsaums (12,6:1)
- **Nachtgrün** (`#3cc98a`) — „Zeit reicht" (8,5:1)

Der Hauptknopf bleibt im Dunkelmodus rot (`#ff5233` mit tintenschwarzer
Schrift), damit die Rangfolge Weiß–Rot–Grau auch nachts erkennbar bleibt.

### Verbotene Farbverwendungen

- **Rot ohne Gelb als Alarm.** Eine rein rote Fläche ist in dieser App ein
  Knopf, keine Warnung.
- **Gelb als Schriftfarbe** oder als Fläche mit weißer Schrift.
- **Gelb in Sichtweite der Bernstein-Warnung**, außer als Teil des Alarmsaums.
- `#9b9797` und jedes hellere Grau als Textfarbe (2,6:1 — unlesbar).
- `#e08a00` als Schriftfarbe auf hellem Grund (2,4:1 — unter jeder Grenze).
- Weiße Schrift unter 22 px auf `#ec3013`. Dafür gibt es Druckrot. Einzige
  Ausnahme: die Beschriftung der Hauptknöpfe (18 px / 800, Entscheidung vom
  12.10.2026, siehe oben).
- Reines Schwarz `#000000`. Es gibt Tintenschwarz.
- Neon, Außenschein, Leuchtschatten, Verlaufsflächen als Schmuck.
- Eine vierte Grundfarbe. Es gibt Weiß, Rot, Grau — und drei Statusfarben.

---

## 3. Typografie

**Archivo** für alles — eine Familie, variabler Schnitt 400 bis 800, lokal
ausgeliefert. Kein Google-Fonts-Einbau: Das überträgt die IP jedes Besuchers und
ist in Deutschland ein bekannter Abmahngrund.

*(Die Stitch-Regel „Inter verboten, nimm Geist oder Satoshi" gilt hier nicht.
Die Schriftwahl ist aus rechtlichen und funktionalen Gründen gesetzt.)*

| Rolle | Größe bei Standardeinstellung | Schnitt |
|---|---|---|
| Gleisnummer | 56 px | 800 |
| Bildschirmtitel | 28 px | 700 |
| Anweisung | 22 px | 600 |
| Fließtext | 18 px | 400 |
| Beschriftung | 15 px | 500 |

Nichts darunter. Gesetzt wird in `rem`, damit die Staffel mitwächst, wenn jemand
am Gerät große Schrift eingestellt hat. Zeilenlänge unter 80 Zeichen.

**Eine belegte Ausnahme, Stand 20.09.2026:** Acht Beschriftungen im
Ebenenschema (`schema-gleisname`, `schema-standort`, `schema-wechseltext`,
`schema-bandrechts`, `schema-bandfuss`, `schema-notiz`, `schema-wechsel`,
`schema-grobgleis`) stehen bei 0,5 bis 0,72 rem und damit unter der
Mindestgröße. Das sind Anschriften in einer Zeichnung mit fester Geometrie — auf
15 px gehoben laufen sie über ihre Bänder. Gelöst wird das über die Maße des
Schemas, nicht über die Schriftgröße; bis dahin gilt die Ausnahme. Ein Entwurf
darf diese Beschriftungen also klein zeigen, alle übrigen nicht.

**Großbuchstaben nur, wo sie zitieren.** Erlaubt auf den Ebenenbändern
(`EBENE −2 · GLEISE 1–8`), weil sie die Beschriftung am Bahnsteig nachbilden.
Verboten als Kicker über Überschriften („DU KOMMST AN", „ROUTE"): In kleiner,
gesperrter Schrift geht die Wortform verloren, an der man Wörter erkennt — für
ältere Leser der schwerste Fall. Solche Beschriftungen stehen in normaler
Schreibweise, dafür eine Stufe größer.

---

## 4. Bauteile

### Rundung — gilt für alle Blöcke, ohne Ausnahme

Die App hat **keine spitzen Ecken.** Jede Fläche, jedes Feld, jeder Knopf, jede
Karte, jedes Band und jedes Sheet ist gerundet. Scharfe Kanten gibt es nur bei
Trennlinien, die keine Fläche sind.

| Stufe | Radius | Gilt für |
|---|---|---|
| klein | 14 px | Eingabefelder, Vervollständigungszeilen, kleine Schaltflächen, Abzeichen |
| mittel | 20 px | Karten, Blöcke, Hinweisflächen, Live-Banner, Tafelblöcke |
| groß | 28 px | Bahnsteigstreifen, Ebenenbänder, Schritt-Sheet, Kartenrahmen, Dialoge |
| Pille | vollrund | Hauptknopf, Routenzeilen, Zeit-Chip, Auswahlmarken, Lampen |

Nichts unter 14 px. Verschachtelte Flächen bekommen nach innen die nächstkleinere
Stufe, nie dieselbe — sonst wirkt der Rand doppelt. Das Ebenenschema zeichnet
auch seine Bahnsteige und Wegstücke mit runden Enden (`stroke-linecap: round`).

### Die Bauteile

- **Knöpfe:** Flach, keine Leuchtränder, vollrund. Primäraktion in Signalrot
  mit weißer Schrift, **18 px / Schnitt 800, mittig** (seit 12.10.2026, vorher
  22 px links). Wo sie angeheftet ist („Umstieg starten" auf dem Handy,
  „Navigation starten"), ist es **nur der Knopf**: Er schwebt 14 px über dem
  unteren Rand des Rollbereichs, der Inhalt rollt darunter durch – kein
  Streifen um ihn (`.knopf-schwebend`). Den sicheren Bereich unten hält die
  Navileiste darunter. Mindestens 44 px hoch. Kein Pfeil `→` hinter dem Text.
- **Karten:** Nur, wenn die Erhebung eine Hierarchie ausdrückt. Weiche
  Abrundung, gedämpfter Schatten in der Grundfarbe getönt. Keine Karte in einer
  Karte in einer Karte.
- **Auswahlgruppen:** Höchstens **eine** Dreiergruppe gleicher Knöpfe je
  Bildschirm. Zwei gleich aussehende Dreiergruppen untereinander sind verboten —
  siehe Abschnitt 8.
- **Eingabefelder:** Beschriftung über dem Feld, Fehlermeldung darunter,
  sichtbarer Fokusring auf beiden Paletten. Keine wandernden Beschriftungen.
- **Ladezustände:** Skelettflächen in den Maßen des erwarteten Inhalts. **Keine
  Kreisel.** Die App hat heute `.lade-kreisel` — das wird ersetzt.
- **Leere Zustände:** sagen, was fehlt und was zu tun ist. Die Meldungsseite
  nennt zusätzlich den Zeitpunkt des letzten Live-Kontakts.
- **Ampel:** Drei Lampen **und** ein Satz. Der Zustand ist nie allein über die
  Farbe erkennbar. Die Alarmlampe ist zweigeteilt rot/gelb, die Alarmfläche
  trägt den schräg gestreiften Saum. Die Ampel blinkt nicht.
- **Navileiste:** Vier gleichrangige Einträge — Eingabe · Übersicht · Weg ·
  Meldungen, schlicht als Beschriftung, im aktuellen Zustand in Tintenschwarz.
  Gesperrte Einträge sind gedämpft, bleiben aber sichtbar. *(Vom 21.09. bis
  05.10.2026 trug „Übersicht" die Zwei-Gleise-Marke auf einer roten Scheibe
  über der Leiste — auf Wunsch entfernt. Kein Entwurf zeigt sie wieder.)*
- **Darstellung:** Ohne Wahl folgt die App dem Gerät (hell/dunkel). Unter
  „Einstellungen" lässt sich Hell oder Dunkel fest wählen.

---

## 5. Aufbau

Mobil zuerst, eine Spalte, Inhalt auf 430 px begrenzt, dazu ein eigenes
iPad-Layout (eine gestreckte Telefonspalte auf großem Schirm ist zu wenig).

Kein Element überlappt ein anderes. Volle Höhe über `100dvh`, nie `100vh`.
Kein waagerechtes Scrollen, unter keinen Umständen.

**Das wiederkehrende Bildmotiv sind die Ebenen-Bänder.** Die Vertikale des
Bahnhofs — Ebene −2, Halle, Ebene +1 — ist das, was kein anderer Anbieter zeigt.
Sie erscheint in drei Maßstäben: groß auf der Navigationsseite mit dem
gestrichelten Weg, als schmale Zweizeilen-Anzeige `−2 → +1` auf den
Dashboard-Karten, als fertig gelaufener Weg auf „Angekommen".

---

## 6. Bewegung

Zwei Arten, klar getrennt.

### Erwünscht: Bewegung als Antwort auf eine Handlung

Sie zeigt, was sich geändert hat, und woher es kam. Jede Handlung bekommt eine
Antwort, keine ist sprunghaft.

**Zeitstufen und Verlauf**

| Stufe | Dauer | Verwendung |
|---|---|---|
| schnell | 120 ms | Druckgefühl, Fokus, kleine Zustände |
| normal | 200 ms | Auswahlwechsel, Aufklappen, Farbwechsel |
| ruhig | 320 ms | Seitenwechsel, Schrittwechsel |

Verlauf: `cubic-bezier(0.2, 0, 0, 1)` beim Erscheinen, `cubic-bezier(0.4, 0, 1, 1)`
beim Verschwinden. **Kein Überschwingen, kein Federn** — außer bei der
Auswahlmarke (Abschnitt „Auswahl"), wo ein Hauch Nachgeben die Mechanik spürbar
macht. Ein hüpfendes Element neben einem Countdown wirkt verspielt und trifft
den Ton nicht.

**Seitenwechsel — gerichtet entlang des Flusses**

Der Fluss ist Eingabe → Übersicht → Weg → Angekommen. Die Bewegung folgt ihm:

- **Vorwärts:** die neue Seite kommt von rechts, 24 px Versatz, gleichzeitig
  Deckkraft 0 → 1, 320 ms. Die alte Seite geht 12 px nach links und blendet ab.
- **Rückwärts:** exakt gespiegelt. Die Richtung sagt, wo man im Ablauf steht.
- **Sprung über die Navileiste:** keine Richtung, weil keine Reihenfolge besteht
  — reine Querblende, 200 ms.

Umgesetzt über die View-Transitions-Schnittstelle des Browsers zusammen mit den
neuen Pfad-Adressen. **Gebaut am 11./12.10.2026**
([Spec](../docs/superpowers/specs/2026-10-11-seitenuebergaenge-design.md)):
Die Adressen heißen wie die Leiste – `/eingabe`, `/uebersicht`, `/weg`,
`/meldungen`, `/angekommen`; Leiste, Störmeldung und Echtzeit-Banner stehen
während des Wechsels still; ohne View Transitions, bei reduzierter Bewegung und
bei der Zurück-Wischgeste des iPhones (`hasUAVisualTransition`) gibt es keine
Bewegung. In der nativen Fassung übernimmt das die Navigationsschicht der
Plattform.

**Knöpfe — Druckgefühl**

Beim Drücken `scale(0.97)` in 120 ms, beim Loslassen zurück in 120 ms. Der
Hauptknopf senkt zusätzlich seinen Schatten. Kein Aufleuchten, kein Rand, der
wandert. **Keine Hover-Zustände** — das Gerät hat keinen Mauszeiger. Der
Fokusring erscheint ohne Übergang, sofort und vollständig.

**Auswahl — die Marke wandert, sie springt nicht**

Bei den Routenzeilen und auf dem Bahnsteigstreifen bewegt sich die Markierung
in 200 ms an die neue Stelle, statt an der alten zu verschwinden und an der
neuen zu erscheinen. Hier ist ein Hauch Nachgeben erlaubt. Die Minutenangaben
daneben wechseln als kurze Querblende, 120 ms.

**Zahlen — nur bei echter Änderung**

Die Restzeit rollt beim Minutenwechsel 160 ms senkrecht durch. **Nicht
sekündlich** — eine Zahl, die jede Sekunde springt, ist Unruhe, kein Hinweis.

**Ampel — Farbe wandert, Licht springt nicht**

Der Farbwechsel läuft über 320 ms, der Pufferbalken schrumpft gleichmäßig
mit. **Kein Blinken, unter keinen Umständen.**

**Der Schrittwechsel — der inszenierte Moment**

Der gestrichelte Weg wächst über 320 ms zum nächsten Band, die Standortmarke
wandert mit, das Schritt-Sheet tauscht den Text als Querblende. Das ist der eine
Moment, der mehr darf als die anderen — er trägt den Kern der App.

**Aufklappen** (Züge, „Mehr", echte Karte): Höhe und Deckkraft gemeinsam,
200 ms. Nie nur Deckkraft, sonst springt das Layout.

### Verboten: Bewegung, die von selbst Aufmerksamkeit fordert

*(Die Stitch-Regel „Perpetual Micro-Interactions — jedes aktive Bauteil braucht
eine Endlosschleife" gilt hier ausdrücklich **nicht**.)*

- Blinken, Pulsieren, Atmen, Schweben, Schimmern als Dauerzustand
- Abschnitte, die beim Scrollen eingeblendet werden
- Gestaffelte Auftritte von Listen beim Laden
- Bewegte Hintergründe, Farbverläufe in Bewegung, Körnung in Bewegung
- Alles, was sich bewegt, ohne dass jemand etwas getan hat

**Eine Ausnahme:** Skelettflächen dürfen schimmern, solange wirklich geladen
wird. Das ist kein Schmuck, sondern die Aussage „es passiert etwas". Endet mit
dem Ladevorgang.

### Technik und Rücksicht

Bewegt wird ausschließlich über `transform` und `opacity` — nie `top`, `left`,
`width` oder `height`.

`prefers-reduced-motion: reduce` schaltet **alles** oben auf reine
Zustandswechsel: keine Verschiebung, keine Skalierung, keine Rotation. Erlaubt
bleibt eine Querblende bis 120 ms. Auch der Schrittwechsel und die
Seitenübergänge fallen darunter — ohne Ausnahme.

---

## 7. Verboten

- Emojis als Symbole. Alle Symbole sind eigene SVG (`AnlagenSymbol.tsx`).
- Reines Schwarz, Neonfarben, Leuchtschatten, Schmuckverläufe.
- Rot ohne Gelb als Alarmkennzeichen. Rot allein ist in dieser App ein Knopf.
- **Spitze Ecken an Flächen.** Jeder Block ist gerundet, siehe Abschnitt 4.
  Rechte Winkel gibt es nur bei Trennlinien.
- Großbuchstaben-Kicker über Überschriften.
- Pfeile `→` im Knopftext, „Mehr erfahren"-Nebenknöpfe, Fülltexte wie
  „Nach unten wischen".
- Zwei gleich aussehende Auswahlgruppen auf einem Bildschirm.
- Kreisel als Ladeanzeige.
- Erfundene Bahnhöfe, Zugnummern oder Uhrzeiten, die es nicht geben kann.
  Beispieldaten sind immer: **Berlin Hbf, RE 3 aus Stralsund an 14:22 auf
  Gleis 6, ICE 1006 nach Hamburg ab 14:38 auf Gleis 14, Abschnitt C.**
- Englische Beschriftungen. Die App spricht durchgehend Deutsch.
- Aufforderungen zum Rennen. Reicht die Zeit nicht, sagt die App das ruhig.

---

## 8. Bestandsstruktur — was nicht neu erfunden werden darf

**Dieser Abschnitt hat Vorrang vor allen anderen.** Die App existiert seit
August 2026 und ist getestet. Stitch erzeugt **Bilder für bestehende
Bildschirme**, keine neue Anwendung. Ein Entwurf, der diese Struktur verletzt,
ist unbrauchbar, egal wie gut er aussieht.

### Die fünf Bildschirme sind abschließend

| Schlüssel | Beschriftung in der Leiste | Zweck |
|---|---|---|
| `eingabe` | Eingabe | Bahnhof, Ankunftsgleis, Abfahrtsgleis |
| `dashboard` | Übersicht | Ampel, beide Gleise, Standort- und Routenwahl |
| `navigation` | Weg | Ebenenschema und der aktuelle Schritt |
| `meldungen` | Meldungen | Gleiswechsel, Verspätungen, leerer Zustand |
| `angekommen` | *(nicht in der Leiste)* | Abschluss der Reise |

Kein sechster Bildschirm. Kein Zusammenlegen. Kein Umbenennen.

**`angekommen` fehlt in der Leiste mit Absicht:** Es ist das Ende der Reise, kein
Ort zum Nachschlagen. Als Dauereintrag lud es dazu ein, mitten im Umstieg
getroffen zu werden und die laufende Navigation zu beenden. Erreichbar ist der
Bildschirm über den Knopf auf der Weg-Seite.

**`dashboard` heißt intern `dashboard`, gelesen wird „Übersicht".** Schlüssel und
Beschriftung gehen bewusst auseinander; `App.tsx` und die Tests kennen den
Schlüssel.

### Diese Bauteile existieren und behalten ihre Namen

**Bildschirme:** `Dashboard` · `Navigation` · `Meldungen` · `Angekommen`

**Bauteile:** `Ampel` · `AnlagenSymbol` · `Bahnhofsschema` · `Datenschutz` ·
`Ebenenschema` · `Eingabe` · `Fusszeile` · `Impressum` · `Karte` · `LiveBanner` ·
`Navileiste` · `QuelleWeg` · `ReiseImport` · `Schrittliste` · `Schrittsheet` ·
`Schrittsteuerung` · `StandortStreifen` · `Stoermeldung` · `Zugauswahl`

Ein Entwurf darf sagen: „das Ebenenschema wird größer, die Bänder bekommen mehr
Luft". Ein Entwurf darf **nicht** sagen: „statt des Ebenenschemas eine Kartenansicht".

### Das Klassenvokabular ist deutsch und bestehend

Rund 180 Klassen in `frontend/src/App.css`, durchgehend deutsch benannt:
`ampel-leiste` · `dashboard-bloecke` · `schema-band` · `schema-weg` ·
`schrittsheet` · `standortwahl` · `routenwahl-zeile` · `navileiste-knopf` ·
`live-banner` · `tafel-block` · `kicker` · `knopf-primaer` · `hinweis-box`

Neue Klassen folgen diesem Vokabular. Keine englischen Namen, keine
Utility-Ketten, kein Framework-Wechsel. Wo ein Entwurf eine neue Fläche
einführt, bekommt sie einen deutschen Namen in derselben Machart.

### Was fest ist und was verhandelbar

| Fest — nicht durch einen Entwurf änderbar | Verhandelbar — dafür ist der Entwurf da |
|---|---|
| Die fünf Bildschirme und ihre Schlüssel | Anordnung und Größe innerhalb eines Bildschirms |
| Der Fluss Eingabe → Übersicht → Weg → Angekommen | Wie ein Bildschirm gegliedert wird |
| Namen der Bauteile und Klassen | Farbflächen, Abstände, Schriftgrößen |
| Das Ebenenschema als Hauptelement der Weg-Seite | Wie die Bänder gezeichnet sind |
| Text vor Karte; MapLibre bleibt nachgeladen hinter dem Aufklapper | Ob der Aufklapper oben oder unten sitzt |
| Deutsche Sprache, deutsche Klassennamen | Wortlaut einzelner Sätze |
| Ampel mit Lampe **und** Satz | Form und Größe der Ampel |
| Standortwahl und Routenwahl sind zwei verschiedene Dinge | Wie man sie unterscheidbar macht |

### Die offenen Stellen — hier wird ein Entwurf wirklich gebraucht

1. ~~**Der Eingabe-Bildschirm.**~~ **Gebaut am 11.10.2026** nach
   [`docs/superpowers/specs/2026-10-11-eingabe-und-breites-layout-design.md`](../docs/superpowers/specs/2026-10-11-eingabe-und-breites-layout-design.md):
   „Wo steigst du um?", Bahnhof, zwei Gleiskacheln mit den Wörtern der
   Übersicht („Du kommst an" / „Dein Anschluss"), Züge und Wagennummer
   eingeklappt, „Verbindung einfügen" als Textknopf am Rand, „Umstieg starten"
   fest über der Leiste. Ursprünglich: Im Entwurf vom 18.09. fehlte er
   (`01-onboarding.png` und `02-dashboard.png` sind dasselbe Bild).
   **Auf dem Handy zurückgenommen am 12.10.2026:** Eingeklappt war die
   Zugauswahl beim Aufruf nicht zu sehen. Dort stehen wieder die Blöcke
   Ankunft und Abfahrt von davor (Zugauswahl, Gleis, Wagen), „Reise
   importieren" als Knopf, kein Titel, keine Kacheln. Angeheftet ist nur noch
   der rote Knopf – er schwebt über dem Inhalt, Schrift 18 px und mittig.
   Das breite Layout bleibt wie gebaut.
2. ~~**Der Bahnsteigstreifen** als Ersatz für die Standortwahl-Knopfliste —
   räumliche Frage, räumliche Antwort.~~ **Gebaut am 07.10.2026:** ein Balken,
   drei Stellen mit Ring, EIN Standortpunkt wie im Ebenenschema, der in 200 ms
   an die neue Stelle wandert. Treppen und Aufzüge stehen (noch) nicht darauf.
3. ~~**Die Ebenenangabe auf den Dashboard-Karten**~~ **Gebaut am 07.10.2026**
   als `Ebene −2` / `Ebene +1`, im Standardmodell gar nicht. **Ohne** „tief"
   (Ebene 0 ist in OSM nicht verlässlich die Straße) und **ohne**
   „Abschnitt C" (keine Quelle, seit die Wagenreihung tot ist).
4. **Die dunkle Palette** auf allen fünf Bildschirmen.
5. **Das iPad-Layout.** Für die **Eingabe gebaut am 11.10.2026**, und zwar
   nach Breite, nicht nach Gerät – iPad und Desktop teilen es: ab 700 px
   Formular oben und beide Live-Tafeln darunter, ab 900 px drei Spalten
   (Formular · Ankunft · Abfahrt). Die Tafeln stehen offen, reichen bis zum
   Ende der nächsten Stunde und klappen auf eine Bahnhofswahl hin nach rechts
   auf. **Offen** für Übersicht, Weg, Meldungen und Angekommen – sie bleiben
   auf breiten Schirmen die 430-px-Spalte.

### Wie ein Auftrag an Stitch formuliert wird

Immer je **ein bestehender Bildschirm** pro Auftrag, nie „die ganze App", und
immer mit dem Bestand im Text. Beispiel:

> Überarbeite den Bildschirm „Übersicht" der bestehenden App Umstieg. Er zeigt
> von oben nach unten: Bahnhofsname, Ampel mit Restzeit und Pufferbalken, zwei
> Karten „Du kommst an" und „Dein Anschluss" mit Gleisnummer und Ebenenangabe,
> einen Bahnsteigstreifen für die Standortwahl, drei Routenzeilen mit
> Minutenangabe, und fixiert unten den Knopf „Navigation starten". Die
> Reihenfolge bleibt. Gesucht ist eine Gliederung, die auf einen Telefonschirm
> passt und bei der Standortwahl und Routenwahl nicht gleich aussehen.
