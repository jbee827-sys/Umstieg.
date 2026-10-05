# Umstieg. — Design-Brief

Stand: 20.09.2026 · Erarbeitet im Brainstorming · Gültig für die Gestaltung von
Frontend und geplanter iOS-App

Dieses Dokument sagt, **was** gestaltet wird und **warum**. Es ist kein
Umsetzungsplan und enthält keine Tasks. Der Plan entsteht daraus getrennt.

---

## 1. Ziel und Produktkern

**In einem Satz:** Umstieg. zeigt dir im Bahnhof den Weg von deinem
Ankunftsgleis zum Abfahrtsgleis und sagt dir ehrlich, ob du es schaffst.

Der Produktkern ist eine Kette, die sonst niemand schließt:

> Wagenposition bei Ankunft → Weg über Treppe, Aufzug, Unterführung →
> Gehprofil → Restzeit bis Abfahrt

DB Navigator kennt die Züge, aber nicht den Weg. Citymapper kennt die Stadt,
aber nicht das Bahnhofsinnere. **Die Vertikale eines Bahnhofs — Ebene −2,
Halle, Ebene +1 — zeigt keiner.** Das ist der Unterschied, den die Gestaltung
sichtbar machen muss.

---

## 2. Zielgruppe

### Die primäre Person

Jemand mit Koffer in einem Bahnhof, den er nicht kennt, unter Zeitdruck, den er
nicht selbst gewählt hat. Nicht ortskundig, nicht in Ruhe, nicht am Schreibtisch.

Die Oberfläche beantwortet für sie in dieser Reihenfolge:

1. Wo bin ich?
2. Wo muss ich hin?
3. Wie komme ich da hoch oder runter?
4. Reicht die Zeit?

**Die Zeit ist die letzte Frage — aber sie darf nie weggeklickt werden müssen,
um sie zu beantworten.** Daraus folgt die Grundentscheidung dieses Briefs:
Orientierung führt, die Zeit läuft sichtbar mit. Kein Moduswechsel, kein
Entweder-oder.

### Weitere Zielgruppen

Ältere Reisende und Reisende mit knapper Umstiegszeit sind mitgedacht, aber sie
entscheiden nicht, wenn es Konflikte gibt. Konkret heißt das: große Schrift und
ruhiger Rhythmus (von den älteren Reisenden), dauerhaft präsente Restzeit (von
den Eiligen) — beides als Eigenschaft des einen Aufbaus, nicht als zweite
Oberfläche.

### Die Situation setzt die harten Randbedingungen

Nicht der Geschmack, sondern der Ort bestimmt das Meiste:

| Bedingung | Folge für die Gestaltung |
|---|---|
| Eine Hand am Koffer | einhändig bedienbar, keine Zwei-Finger-Geste |
| Sonnenlicht auf dem Bahnsteig | hoher Kontrast, kein Grau auf Grau |
| Schlechtes Netz unter der Halle | jeder Bildschirm kommt mit Geladenem aus |
| Lesen im Gehen | große Schrift, kurze Sätze |
| Ein Blick dauert zwei Sekunden | eine Kernaussage je Bildschirm |
| Nachts im Bahnhof | Dunkelmodus ist Pflicht, nicht Kür |

---

## 3. Was die Messung hergibt — und was fehlt

Erhoben über Vercel Web Analytics, 28.08. bis 20.09.2026:

| Kennzahl | Wert |
|---|---|
| Besucher / Aufrufe | 78 / 114 |
| Gemeldete Pfade | ausschließlich `/` |
| Geräte | mobil 40 · Desktop 37 · Tablet 1 |
| Herkunft | DE 28 · US 36 · CA 7 · übrige TW, CN, NL, SA, SG |
| Verweisquelle | 70 ohne · 9 google.com · 4 vercel.com |
| Eigene Ereignisse | nicht abrufbar (HTTP 402, Pro-Tarif nötig) |

**Aus diesen Zahlen lässt sich kein Nutzerverhalten ableiten.** Drei Gründe:

1. Über die Hälfte des Verkehrs stammt aus Nicht-Zielmärkten ohne Verweisquelle
   — bei einer deutschsprachigen App für deutsche Bahnhöfe sind das fast sicher
   Crawler. Der plausible echte Kern ist „DE + iOS": 21 Besucher, 46 Aufrufe.
2. Alle Bildschirme laufen unter `/`. Die Dimension `route` ist bei **allen 114
   Aufrufen leer**. Die Messung hat noch nie einen Bildschirm gesehen.
3. Eigene Ereignisse sind tariflich gesperrt.

### Warum Raute-Adressen das nicht lösen

Die Navigation der Rechtsseiten läuft über `location.hash` und einen
`hashchange`-Lauscher (`frontend/src/App.tsx:251-256`); `schliesseRechtsseite()`
räumt die Raute per `replaceState` wieder weg. `@vercel/analytics` hängt sich an
die History-API, nicht an `hashchange` — deshalb zählt keine dieser Seiten.

**Anforderung:** echte Pfade über `pushState`. Die Umschreibung
`/(.*) → /index.html` steht bereits in `vercel.json`; es ist reine
Frontend-Arbeit.

### Was gemessen werden muss

Sobald Bildschirme eigene Adressen haben, zählen diese vier Punkte — mehr nicht:

1. Eingabe abgeschlossen
2. Navigation gestartet
3. Schritt 1 erreicht
4. Ziel erreicht

Erst daraus wird sichtbar, wo Menschen aussteigen. Solange das fehlt, ist jede
Aussage über Nutzerverhalten geraten.

---

## 4. Struktur und Fluss

### Die fünf Bildschirme bleiben

`eingabe · dashboard · navigation · meldungen · angekommen` deckt sich mit dem
Entwurf und mit der Frage-Reihenfolge der Zielperson. Was sich ändert, ist nicht
die Anzahl, sondern wo die Last liegt.

### Bildschirme bekommen Adressen

`/eingabe`, `/dashboard`, `/navigation`, `/meldungen`, `/angekommen` über
`pushState`. Das bringt drei Dinge zugleich: die Zurück-Taste tut, was sie soll;
ein Zustand ist teilbar; und die Messung sieht zum ersten Mal etwas.

### Eingabe — kürzer, nicht schöner

Tippen bleibt der Hauptweg. Einfügen (Reise-Import aus dem DB Navigator) und
Standort sind Abkürzungen am Rand, nicht der Einstieg.

**Was bleibt:** Bahnhof, Ankunftsgleis, Abfahrtsgleis.
**Was geht:** Die Routenart wandert aufs Dashboard, wo die Minutenangaben
stehen. Das Gehprofil ist eine Einstellung, keine Reiseentscheidung, und wandert
hinter „Mehr". Züge und Wagennummer bleiben optional und eingeklappt.

### Dashboard — hier liegt das eigentliche Problem

Drei Befunde aus `frontend/src/screens/Dashboard.tsx`:

**a) Zwei gleich aussehende Dreiergruppen direkt untereinander.**
„Wo stehst du auf Gleis 6?" (Anfang · Mitte · Ende) und „Route" (Schnellste ·
Barrierefrei · Mit Stopp) sind beide drei Knöpfe mit Minutenangabe rechts. Beide
verändern dieselbe Zahl — die Gehzeit —, meinen aber Verschiedenes: *wo du
stehst* gegen *welchen Weg du nimmst*.

> **Anforderung:** Die Standortwahl hört auf, eine Knopfliste zu sein, und wird
> ein Bahnsteigstreifen, auf dem man die Stelle antippt. Räumliche Frage,
> räumliche Antwort.

**b) Die Ebene fehlt, wo sie am meisten zählt.**
Der Entwurf trägt auf den beiden Karten `Ebene −2 · tief` und
`Ebene +1 · Abschnitt C`. Im Code stehen nur Zug, Gleis, Zeit.

> **Anforderung:** Die Ebenenangabe gehört auf beide Karten. Die Daten liegen
> vor — das Ebenenschema baut sein Bandmodell bereits daraus.

**c) Der Hauptknopf liegt unter dem Falz.**
Kopf, Ampel, zwei Blöcke, Standortwahl mit Hinweistext, Routenwahl,
Hinweisliste, ggf. Meldungsknopf — erst dann „Navigation starten".

> **Anforderung:** fixiert am unteren Rand über der Leiste, mit
> `env(safe-area-inset-bottom)`.

### Navigation — bleibt

Ebenenschema groß, ein Schritt unten, Zeit-Chip oben rechts, echte Karte
nachgeladen hinter dem Aufklapper (MapLibre, 944 KB, nur bei Bedarf). Dieser
Bildschirm trifft den Entwurf am saubersten.

### Die Navileiste bekommt einen Nordstern

Der Eintrag **„Übersicht" trägt die Zwei-Gleise-Marke der App** und sticht aus
der Leiste heraus: als runde, rote Scheibe leicht über der Leiste, größer als
die übrigen Einträge, die Marke in Weiß darin. Begründung: Die Übersicht ist der
Bildschirm, um den sich alles dreht — dort stehen Ampel, beide Gleise und die
Routenwahl, von dort geht jede Reise weiter, dorthin kehrt man zurück. Die
anderen drei Einträge bleiben schlicht und gleichrangig.

### Die Zeit wird ein durchgehendes Bauteil

Heute ist die Ampel ein Baustein des Dashboards und der Chip ein Baustein der
Navigationsseite — zwei Darstellungen derselben Sache.

> **Anforderung:** ein Bauteil in zwei Größen. Auf dem Dashboard ausführlich mit
> Pufferbalken und Satz, ab der Navigation als Chip am oberen Rand, immer
> sichtbar, nie wegscrollbar.

---

## 5. Visuelles System

### Farbrollen

Das Farbschema des bestehenden Designs bleibt, mit fester Rangfolge:
**Weiß primär · Rot sekundär · Grau tertiär.**

Rot ist damit eine gestaltende Farbe — Hauptknopf, Auswahlmarke, Marke,
Akzentflächen. Daraus folgt die wichtigste Regel des Systems:

> **Rot allein bedeutet nichts. Der Alarm ist Rot _und_ Gelb zusammen.**

| Rang / Rolle | Fläche | Schrift | Kontrast auf Weiß |
|---|---|---|---|
| Primär | `#ffffff` / `#faf9f9` | `#201e1d` | 16,6:1 |
| Sekundär — Aktion, Marke | `#ec3013` | Weiß ab 22 px | 4,2:1 |
| Sekundär — kleine weiße Schrift | `#c42207` | `#ffffff` | 5,9:1 |
| Sekundär — rote Schrift | — | `#ae1800` | 7,2:1 |
| Tertiär — Karten | `#eae9e9` | `#201e1d` | 13,7:1 |
| Tertiär — Nebentext | — | `#605d5d` | 6,5:1 |
| Gut | `#0f7a4f` | `#0f7a4f` | 5,4:1 |
| Warnung | `#e08a00` | `#201e1d` | 6,2:1 |
| Alarm | `#ec3013` **+** `#ffd400` | `#ae1800` auf `#fff2ef` | 7,2:1 |

**Warum die Alarmfarbe jetzt zweiteilig ist.** Solange Rot nur den Alarm trug,
reichte Rot. Als gestaltende Sekundärfarbe kommt es überall vor — dann kann es
die Ampel nicht mehr allein kennzeichnen. Der Alarm bekommt deshalb einen
**schräg gestreiften Saum in Rot und Gelb**, wie an einer Warnbake, und eine
zweigeteilte Lampe. Kein anderes Element der App hat Streifen. Die Schrift steht
nie auf den Streifen, sondern daneben — Lesbarkeit vor Dramatik.

Zwei gemessene Grenzen, die dabei gelten:

- **Weiß auf `#ec3013` erreicht 4,2:1.** Das genügt für große, fette Schrift
  (Knopfbeschriftung ab 22 px / Schnitt 600), nicht für Fließtext. Wo kleinere
  weiße Schrift auf Rot nötig ist, kommt `#c42207` zum Einsatz (5,9:1).
- **Weiß auf Gelb erreicht 1,4:1** und ist verboten. Warngelb `#ffd400` trägt
  ausschließlich tintenschwarze Schrift (11,6:1).

`#9b9797` verschwindet aus allem, was Text ist (2,6:1). `#e08a00` bleibt eine
Fläche und wird nie Schriftfarbe auf hellem Grund (2,4:1); als Warntext auf
hellem Grund dient `#9a5b00` (5,4:1).

### Rundung

Die App hat **keine spitzen Ecken.** Vier Stufen, verbindlich für alle Blöcke:
14 px für Felder und kleine Schaltflächen, 20 px für Karten und Blöcke, 28 px
für Bahnsteigstreifen, Ebenenbänder und Sheets, vollrund für Hauptknopf,
Routenzeilen, Zeit-Chip und Auswahlmarken. Verschachtelte Flächen bekommen nach
innen die nächstkleinere Stufe. Rechte Winkel gibt es nur bei Trennlinien.

### Typografie

Archivo bleibt — eine Familie, variabel, lokal ausgeliefert. Die Begründung im
Code bleibt gültig: ein `@import` von Google Fonts überträgt die IP jedes
Besuchers und ist in Deutschland ein bekannter Abmahngrund.

**Die Grundgröße steigt von 16 auf 18 px.** Lesen im Gehen, mit Koffer, mit
älteren Augen, bei Sonne — 16 px ist dafür die Untergrenze, nicht der Normalfall.

| Rolle | Größe bei Standardeinstellung | Schnitt |
|---|---|---|
| Gleisnummer | 56 px | 800 |
| Bildschirmtitel | 28 px | 700 |
| Anweisung | 22 px | 600 |
| Fließtext | 18 px | 400 |
| Beschriftung | 15 px | 500 |

Nichts darunter. Die Pixelwerte sind Bezugsgrößen bei unveränderter
Systemeinstellung — **gesetzt wird in `rem`**, damit die Staffel mitwächst, wenn
jemand große Schrift eingestellt hat. Heute stehen 81 Pixelgrößen gegen 5 in
`rem`; damit folgt die App dieser Einstellung nicht.

**Versalien-Kicker werden reduziert.** „UMSTIEG IN", „DU KOMMST AN", „DEIN
ANSCHLUSS", „ROUTE" — Großbuchstaben in kleiner, gesperrter Schrift sind für
ältere Leser der schwerste Fall, weil die Wortform verlorengeht, an der man
Wörter erkennt. Sie sind zugleich das häufigste Erkennungsmerkmal generisch
wirkender Oberflächen. Künftig: normale Schreibweise, dafür eine Stufe größer.

Versalien bleiben genau dort, wo sie zitieren statt dekorieren: auf den
Ebenenbändern (`EBENE −2 · GLEISE 1–8`), die wie am Bahnsteig beschriftet sind.

### Die Ebenen-Bänder sind das Bildmotiv

Das, was kein anderer Anbieter zeigt, ist die Vertikale des Bahnhofs. Daraus
entsteht die Bildsprache, statt aus Farbe. Das Band mit Ebenenangabe kehrt auf
jedem Bildschirm wieder:

- **Navigation:** in voller Größe mit dem gestrichelten Weg über die Etagen
- **Dashboard:** als schmale Zweizeilen-Anzeige `−2 → +1` auf den beiden Karten
- **Angekommen:** als fertig gelaufener Weg

Drei Maßstäbe, ein Motiv.

### Bewegung

Die Grenze verläuft nicht zwischen viel und wenig Bewegung, sondern zwischen
zwei Arten: **Bewegung, die auf eine Handlung antwortet, ist erwünscht und
durchgehend flüssig. Bewegung, die von selbst Aufmerksamkeit fordert, ist
verboten.** Die erste hilft beim Verstehen, die zweite kostet Aufmerksamkeit,
die unterwegs gebraucht wird.

**Erwünscht — jede Handlung bekommt eine Antwort:**

- **Seitenwechsel gerichtet entlang des Flusses.** Vorwärts kommt die neue Seite
  von rechts (24 px, 320 ms), rückwärts gespiegelt. Die Richtung sagt, wo man im
  Ablauf steht. Der Sprung über die Navileiste hat keine Richtung, weil dort
  keine Reihenfolge besteht — reine Querblende. Umgesetzt über die
  View-Transitions-Schnittstelle zusammen mit den neuen Pfad-Adressen.
- **Knöpfe mit Druckgefühl.** `scale(0.97)` in 120 ms und zurück. Kein
  Aufleuchten, keine Hover-Zustände — das Gerät hat keinen Mauszeiger.
- **Die Auswahlmarke wandert**, statt zu springen: 200 ms zur neuen Routenzeile
  oder Stelle auf dem Bahnsteigstreifen.
- **Der Schrittwechsel** bleibt der inszenierte Moment: Der Weg wächst zum
  nächsten Band, die Standortmarke wandert mit, das Sheet tauscht den Text.
- **Die Restzeit rollt beim Minutenwechsel durch** — nicht sekündlich. Eine
  Zahl, die jede Sekunde springt, ist Unruhe, kein Hinweis.

Zeitstufen: 120 ms für Druck und Fokus, 200 ms für Auswahl und Aufklappen,
320 ms für Seiten- und Schrittwechsel. Kein Überschwingen außer einem Hauch an
der Auswahlmarke — ein hüpfendes Element neben einem Countdown trifft den Ton
nicht.

**Verboten — Bewegung ohne Anlass:** Blinken, Pulsieren, Schweben, Schimmern als
Dauerzustand, beim Scrollen eingeblendete Abschnitte, gestaffelte Listenauftritte,
bewegte Hintergründe. Einzige Ausnahme: Skelettflächen dürfen schimmern, solange
wirklich geladen wird.

**Die Ampel blinkt nicht.** Ihre Farbe wandert über 320 ms, der Pufferbalken
schrumpft gleichmäßig mit. Blinken unter Zeitdruck erhöht die Anspannung und ist
für einen Teil der Nutzenden ein körperlicher Auslöser. Rot ist deutlich genug.

`prefers-reduced-motion` schaltet **alles davon** auf reine Zustandswechsel;
erlaubt bleibt eine Querblende bis 120 ms. Bewegt wird ausschließlich über
`transform` und `opacity`.

---

## 6. App-Store-Anforderungen

Geprüft gegen die App Review Guidelines in der Fassung, die diesem Brief
zugrunde liegt. Die Punkte sind Anforderungen, keine Hinweise.

### 6.1 Richtlinie 4.2 — der Punkt, der alles andere überlagert

> „Ihre App muss Features, Inhalte und eine Benutzeroberfläche umfassen, die sie
> von einer neu aufbereiteten Website abhebt."

Umstieg. ist heute eine responsive Web-App. **In einen WebView verpackt und
eingereicht wird sie nach 4.2 abgelehnt.** Die Regel zielt wörtlich auf diesen
Fall, und es ist einer der häufigsten Ablehnungsgründe überhaupt.

**Für den App Store reicht die Web-App nicht.** Es braucht Fähigkeiten, die eine
Website nicht haben kann — siehe Abschnitt 7.

### 6.2 Richtlinie 2.1 — was das Prüfteam sehen wird

Die Prüfung findet in Kalifornien statt. Jemand öffnet die App, tippt in die
Bahnhofssuche und findet nichts: nur deutsche Bahnhöfe, keine antwortende
Live-Tafel. Nach 2.1(a) ist das eine unvollständige App.

> **Anforderung — Demomodus:** eine hinterlegte Beispielreise (Berlin Hbf,
> Gleis 6 → Gleis 14), die ohne Standort, ohne Live-Daten und ohne deutsche IP
> alle Bildschirme vollständig zeigt. Die Richtlinie erlaubt das ausdrücklich
> („voll ausgestatteter Demomodus"). Nebennutzen: derselbe Modus liefert die
> Bildschirmfotos für den Store.

> **Anforderung:** Der Backend-Dienst muss während der Prüfung erreichbar sein.
> Alle Funktionen, die nicht selbsterklärend sind, gehören in die Prüfhinweise
> (2.3.1).

### 6.3 Menschliche Schnittstellen-Richtlinien

| Prüfpunkt | Heute | Anforderung |
|---|---|---|
| Dunkelmodus | fehlt vollständig, kein `prefers-color-scheme` im CSS | vollständige dunkle Palette mit denselben Kontrastregeln |
| Dynamische Schriftgröße | 81 Größen in `px`, 5 in `rem` | alle Stufen in `rem`, folgt der Systemeinstellung |
| Sichere Bereiche | nur die Navileiste (`App.css:899`) | auch der fixierte Hauptknopf |
| Reduzierte Bewegung | vorhanden | bleibt |
| Tippziele ≥ 44 px | vorhanden | bleibt |
| iPad (2.4.1) | Spalte `max-width: 430px` mittig | eigenes Layout, keine vergrößerte Telefon-App |
| Fokusringe | vorhanden | bleibt, sichtbar auf beiden Paletten |

### 6.4 Rechtliches

**5.1.5 Ortungsdienste.** Der Standort dient nur der Bahnhofs- und
Ankunftserkennung, die Erkennung schlägt vor und erzwingt nichts
(`StandortStreifen.tsx`), und die App funktioniert ohne. Das entspricht der
Richtlinie.

> **Anforderung:** Der Zweckhinweis erscheint erst, wenn der Standort gebraucht
> wird — nie beim Start. Der Text nennt den Zweck konkret, nicht allgemein.

**5.1.1 / 5.1.2 Datenschutz.** Zustandsloses Backend, keine Konten, keine
Speicherung, Reise-Import rein im Browser, `beforeSend` entfernt die
Abfragezeichenkette. Ungewöhnlich saubere Ausgangslage.

> **Anforderung:** Die Datenschutz-Etiketten in App Store Connect weisen Vercel
> Analytics ehrlich aus. Für die native Fassung ist zu entscheiden, ob das
> Messwerkzeug überhaupt mitwandert — am saubersten wäre: nicht.

**5.2 Geistiges Eigentum.**

> **Anforderung:** OSM-Daten stehen unter ODbL und müssen **sichtbar in der App**
> genannt werden, nicht nur in der `NOTICE` im Repo. Dasselbe gilt für die
> Nutzungsbedingungen der DB-Schnittstelle und die OFL-Lizenz von Archivo.
> „DB Navigator" darf als Hinweistext stehen — ohne DB-Logo, ohne DB-Farben,
> ohne den Eindruck eines Angebots der Bahn.

**1.4.4 / 1.4.5 — kein Aufruf zu gefährlichem Verhalten.** Eine App, die neben
einem Countdown „Zügig gehen" sagt, bewegt sich in die Nähe dieser Regel.

> **Anforderung:** Die App fordert nie zum Rennen auf. Reicht die Zeit nicht,
> sagt sie das ruhig und eindeutig, statt anzutreiben. Auf Treppen gilt das
> besonders. Das deckt sich ohnehin mit der Zielgruppe.

**1.5 Kontaktdaten.** Impressum ist vorhanden; die Support-URL in App Store
Connect zeigt darauf.

**Was entfällt und ein Vorteil ist:** Richtlinie 4.8 (Anmeldedienste) greift
nicht, weil es keine Anmeldung gibt. Abschnitt 3 (Geschäfte) greift nicht, weil
es keine Käufe gibt. Richtlinie 1.2 (nutzergenerierte Inhalte) greift nicht.

---

## 7. App-Fähigkeiten — Anforderungen an die native Fassung

Diese Fähigkeiten sind die Antwort auf Richtlinie 4.2 **und** auf die
inhaltliche Anforderung „Zeit gleichzeitig im Griff behalten". Sie sind keine
Zugaben, sondern der Grund, warum die App eine App ist.

### 7.1 Live-Aktivität auf Sperrbildschirm und Dynamic Island — Pflicht

Die Restzeit-Ampel läuft weiter, während das Telefon in der Hand hängt und der
Koffer gezogen wird. Angezeigt werden: Restzeit, Ampelfarbe, aktueller Schritt,
Zielgleis.

Das ist die native Umsetzung von „die Zeit läuft sichtbar mit" — und zugleich
das stärkste einzelne Argument gegen eine Ablehnung nach 4.2, weil eine Website
das nicht leisten kann. Die Live-Aktivität endet mit dem Erreichen des Ziels
oder der Abfahrt des Anschlusses, nie später.

### 7.2 Haptik beim Schrittwechsel — Pflicht

Ein Tippen am Handgelenk statt eines Blicks. Wer im Bahnhof läuft, schaut nicht
ständig hin. Haptik bestätigt außerdem den Schrittwechsel für Menschen, die den
Bildschirm gerade nicht sehen können.

Deutlich, aber sparsam: beim Schrittwechsel, beim Ampelwechsel auf Rot, bei der
Ankunft. Sonst nicht.

### 7.3 Offline-Fähigkeit — Pflicht

Unter der Bahnhofshalle bricht das Netz weg, und zwar genau dann, wenn die App
gebraucht wird. Eine einmal berechnete Route samt Schema, Schritten und
Zielangaben muss vollständig ohne Verbindung weiterlaufen. Die Restzeit läuft
lokal weiter; fehlende Live-Daten werden benannt, nicht verschwiegen.

Das ist zugleich Schutz vor einem Ablehnungsgrund: Eine App, die im Funkloch
eine leere Seite zeigt, fällt unter 2.1.

### 7.4 Lokale Mitteilung bei Gleiswechsel — Pflicht

Der Gleiswechsel ist der Fall, der die ganze Route ungültig macht. Er muss den
Menschen auch dann erreichen, wenn die App gerade nicht im Vordergrund ist.

Nach 4.5.4 gilt: Mitteilungen sind **nicht** Voraussetzung dafür, dass die App
funktioniert, und sie werden nie für Werbung verwendet. Wer sie ablehnt, verliert
keine Kernfunktion.

### 7.5 Kurzbefehl und Widget — empfohlen, nicht Pflicht

„Wie viel Zeit habe ich noch?" als Kurzbefehl, dazu ein Sperrbildschirm-Widget
mit der Restzeit. Nach 2.5.11 nur für Intents registrieren, die wirklich zur App
gehören — kein Streuen über fremde Bereiche.

### 7.6 Offene Entscheidung: die technische Basis

Zur Wahl stehen eine native Swift-App und eine gemeinsame Hülle
(React Native oder Capacitor) mit nativen Modulen.

**Empfehlung: nativ in Swift für die Hülle**, das Backend bleibt unverändert.
Begründung: Die Live-Aktivität (ActivityKit) und das Widget (WidgetKit) brauchen
ohnehin nativen Code, und die tragenden Oberflächen — Ebenenschema,
Bahnsteigstreifen, Ampel — sind durchweg selbst gezeichnet. Von einer
Web-Wiederverwendung bliebe wenig übrig, dafür trüge man das WebView-Risiko nach
4.2 mit sich.

**Die Web-App bleibt bestehen.** Sie ist der Zugang ohne Installation und für
Android. Beide teilen sich Backend, Gestaltungsregeln und Wortwahl.

---

## 8. Qualitätsboden

Gilt für jede Ansicht, ohne Ausnahme und ohne gesonderte Erwähnung:

- Tippziele mindestens 44 px, Hauptaktion einhändig im unteren Drittel erreichbar
- Sichtbarer Fokusring auf hellem und dunklem Grund
- Kein Zustand allein über Farbe unterschieden — die Ampel hat Lampe **und** Satz
- Textkontrast mindestens 4,5:1, bedeutungstragende Grafik mindestens 3:1
- `prefers-reduced-motion` respektiert
- Getestet ab 375 px Breite, dazu iPad
- Jede Ansicht funktioniert ohne Standortfreigabe und ohne Live-Daten

---

## 9. Offene Punkte

| Punkt | Status |
|---|---|
| Technische Basis der iOS-App (Swift oder gemeinsame Hülle) | Empfehlung liegt vor, Entscheidung offen |
| Vercel-Tarif für eigene Ereignisse | offen; ohne Pro bleibt die Wirkungsmessung auf Seitenaufrufe beschränkt |
| Rotes Abfahrtsgleis | **entschieden für Rot.** Rot ist Sekundärfarbe, das Abfahrtsgleis und die Karte „Dein Anschluss" dürfen es tragen. Dafür ist der Alarm zweiteilig (Rot + Gelb) — siehe Abschnitt 5 |
| „Mit Stopp: WC & Kiosk" | braucht POI-Knoten im Graphen, Backend-Arbeit, nicht Teil dieses Briefs |

---

## 10. Arbeiten mit Stitch — Bestandsschutz

Die Überarbeitung des Designs läuft über die Stitch-API. **Stitch erzeugt Bilder
für bestehende Bildschirme, keine neue Anwendung.** Die App existiert seit August
2026, ist getestet und hat eine gewachsene Struktur: 18 Bauteile, 4
Bildschirm-Dateien, rund 180 durchgehend deutsch benannte CSS-Klassen und eine
Zustandsmaschine mit fünf Bildschirmen, deren Leisteneinträge begründet sind.

Dieses Wissen hat Stitch nicht. Ohne es erfindet jeder Entwurf die App neu — und
genau dieser Fehler ist hier schon einmal passiert: Der Entwurf traf 80 Minuten
nach dem Umsetzungsplan ein, der Plan wurde nie überarbeitet, und drei Wochen
lang liefen Entwurf und App nebeneinander her (`docs/2026-08-31-design-abgleich.md`).

### Die Regeln

1. **Das Entwurfssystem trägt den Bestand mit.** `design/DESIGN.md` ist die
   Datei, die über `upload_design_md` und `create_design_system_from_design_md`
   nach Stitch geht. Ihr Abschnitt 8 listet die fünf Bildschirme, alle
   Bauteilnamen, das Klassenvokabular und eine Tabelle „fest gegen
   verhandelbar". Dieser Abschnitt hat Vorrang vor allen gestalterischen
   Regeln derselben Datei.

2. **Ein Auftrag betrifft genau einen bestehenden Bildschirm.** Nie „die ganze
   App". Der Auftragstext nennt immer, was heute auf dem Bildschirm steht und in
   welcher Reihenfolge — sonst rät das Modell.

3. **Jede Erzeugung nutzt das hinterlegte Entwurfssystem** (`designSystem` beim
   Aufruf). Ohne das greift Stitchs Standardsystem, und die Farbrollen aus
   Abschnitt 5 sind weg.

4. **Was fest ist:** die fünf Bildschirme und ihre Schlüssel, der Fluss
   Eingabe → Übersicht → Weg → Angekommen, die Namen der Bauteile und Klassen,
   das Ebenenschema als Hauptelement der Weg-Seite, Text vor Karte, deutsche
   Sprache.
   **Was verhandelbar ist:** Anordnung und Größe innerhalb eines Bildschirms,
   Farbflächen, Abstände, Schriftgrößen, die Zeichnung der Bänder, der Wortlaut
   einzelner Sätze.

5. **Ein Entwurf wird nicht umgesetzt, sondern eingeordnet.** Vor jeder
   Umsetzung wird benannt, welche bestehenden Bauteile er berührt und welche
   Klassen sich ändern. Findet sich kein bestehendes Bauteil, ist das die Frage,
   ob der Entwurf zu weit geht — nicht der Auftrag, ein neues zu bauen.

6. **Die offenen Stellen sind benannt.** Ein Entwurf wird dort wirklich
   gebraucht: Eingabe-Bildschirm (fehlt vollständig), Bahnsteigstreifen,
   Ebenenangabe auf den Dashboard-Karten, dunkle Palette, iPad-Layout. Alles
   andere ist Überarbeitung, nicht Neubau.

7. **Der von Stitch erzeugte Code wird nicht übernommen — nur das Bild.**
   Belegt an der ersten Erzeugung vom 20.09.2026: Das HTML lud Archivo über
   `fonts.googleapis.com` (genau der Weg, den `index.css` aus rechtlichen
   Gründen vermeidet), zog die Symbolschrift „Material Symbols Outlined"
   nach, statt eigene SVG zu verwenden, und band Tailwind über ein CDN ein.
   Die *Gestaltung* war dabei korrekt übernommen — Farbrollen, Schrift,
   Aufbau. Ein Entwurf ist also eine Vorlage zum Nachbauen im bestehenden
   Klassenvokabular, nie eine Datei zum Einfügen.

---

## 11. Umsetzungsstand

Stand 20.09.2026, Zweig `feat/mvp`. Nach jedem Schritt liefen die 395 Tests der
Frontend-Suite grün.

| Schritt | Stand | Was dabei gefunden wurde |
|---|---|---|
| Token-Ebene (`index.css`) | **fertig** | Dunkelmodus fehlte vollständig; Grundgröße von 16 auf 18 px |
| Rundung, alle Blöcke | **fertig** | 46 Radien auf vier Stufen; Kreise und Trennstriche bewusst ausgenommen |
| Rot als Sekundärfarbe | **fertig** | Weiße Schrift auf Rot stand bei 17 px (4,2:1) — jetzt 22 px; Auswahlmarken waren schwarz |
| Alarm aus Rot und Gelb | **fertig** | Die Alarmlampe **pulsierte** entgegen der eigenen Regel; drei Ampelfarben waren als Schrift unlesbar (Bernstein 2,4:1) |
| Schriftstaffel in `rem` | **fertig** | 81 Pixelgrößen ersetzt, 32 davon unter der Mindestgröße; vier Versalien-Regeln entfernt |
| Nordstern in der Navileiste | **entfernt 05.10.2026** | Am 21.09. gebaut (Inline-SVG über `currentColor`), am 05.10. auf Wunsch wieder herausgenommen – die vier Einträge sind gleichrangig |
| Dunkelmodus-Durchgang | **fertig 26.09., ergänzt 05.10.2026** | 26.09.: zwölf feste Farbwerte in `App.css` über Token. 05.10.: Die Wortmarke im Lockup blieb nachts dunkel; dazu die Wahl Hell/Dunkel unter „Einstellungen“ |
| Bewegung anschließen | **offen** | Die Token stehen, `App.css` nutzt noch eigene `transition`-Werte; Seitenübergänge brauchen die Pfad-Adressen |

**Am 05.10.2026 im Browser angesehen** (Chrome, Rahmen 360 × 740, hell und
dunkel). Dabei kam heraus, dass die Grundgröße 18 px nie gegriffen hatte: Sie
stand an `body`, `rem` rechnet aber mit `html` – die ganze Staffel lag 11 %
unter Plan, die Beschriftung bei 13,3 statt 15 px. Dazu 13 Schriftfarben in
`neutral-500/600` unter 4,5:1. Beides behoben, Einzelheiten im README.

**Bekannte Abweichung:** Acht Beschriftungen im Ebenenschema bleiben unter der
Mindestgröße von 15 px, weil die Geometrie des Schemas sonst bricht. Das ist in
`design/DESIGN.md` Abschnitt 3 festgehalten und braucht eine Maßänderung, keine
Schriftänderung.

---

## 12. Was dieses Dokument nicht ist

Kein Umsetzungsplan, keine Task-Liste, keine Komponenten-Spezifikation. Der
Entwurf mit den sechs Screens (`design/Umstieg mobile app design.zip`) bleibt die
Bildvorlage; dieser Brief sagt, welche Regeln über dem Bild stehen, wenn beide
sich widersprechen.

**Hinweis zum Entwurf:** `01-onboarding.png` und `02-dashboard.png` sind
dasselbe Bild, bis auf die Uhrzeit. Ein gestalteter Eingabe-Bildschirm existiert
nicht — der gesamte erste Schritt lebt nur im Code. Genau dort steigt ein neuer
Mensch aber ein. Abschnitt 4 setzt die Regeln dafür; ein Bild dazu fehlt
weiterhin.
