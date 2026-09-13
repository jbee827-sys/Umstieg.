# Anforderungen: Schematische Navigation (Screen 3)

Stand: 13.09.2026 · Adressat: Gestaltung (Claude Design) · Vorgänger:
`design/Umstieg.dc.html` Screen 3 · Datengrundlage:
`docs/spike-schema-geometrie-ergebnis.md`

Dieses Dokument beschreibt, **was gezeichnet werden soll, womit es belegt ist
und was es nicht behaupten darf**. Alle genannten Felder existieren seit dem
13.09.2026 in der Antwort von `GET /api/route`; die Beispielwerte sind ein
echter Lauf, kein Entwurfstext.

---

## 1. Der Auftrag

Eine Bildschirmseite, die einem Reisenden **während** des Umstiegs zeigt, wo
er ist und wohin er geht. Sie ersetzt die heutige Landkarte.

Warum keine Karte: Der Weg führt durch eine geschlossene Halle über fünf
Stockwerke. Eine Straßenkarte zeigt dort ein Dach. Gebraucht wird nicht
„wo auf der Erde", sondern „wie liegt es zueinander" — ein Schema.

Die Seite hat drei Zonen (aus dem Vorgängerentwurf, Aufteilung bleibt):

| Zone | Inhalt |
|---|---|
| Kopf | Zielgleis · Abschnitt · Zug · Restzeit-Ampel |
| **Mitte** | **das Schema — Gegenstand dieses Auftrags** |
| Fuß (Sheet) | ein Schritt zur Zeit, Fortschrittsbalken, „Weiter" |

Neu zu gestalten ist die **Mitte**. Kopf und Fuß dürfen angepasst werden, wo
das Schema es verlangt.

---

## 2. Zielgruppe und Rahmen

- **Wer:** Urlaubsreisende, Reisende mit knapper Umstiegszeit, ältere
  Personen. Ortsunkundig, unter Zeitdruck, oft mit Gepäck.
- **Situation:** im Gehen, einhändig, auf einem Telefon, in Eile.
- **Daraus folgt:** große Schrift, hoher Kontrast, keine Gesten-Abhängigkeit
  (kein Pinch, kein Drag als einziger Weg), keine Farbe als einziger Träger
  einer Aussage, deutschsprachig.
- **Bildschirm:** 402 × 874 px als Bezug (wie der Vorgängerentwurf), von
  320 px aufwärts benutzbar. Mobil zuerst.
- **Technik:** SVG im Browser, keine Kartenbibliothek. Das Schema muss ohne
  externe Kacheln, ohne Netzabruf und ohne Animationspflicht funktionieren.

---

## 3. Die Datenlage

### 3.1 Vertrag

`GET /api/route` liefert in `schema`:

```ts
interface BahnhofSchema {
  ebenen: SchemaEbene[]        // von oben nach unten
  anlagen: SchemaAnlage[]      // NUR die, die die Route nutzt
  pois: SchemaPoi[]
  wechsel: SchemaWechsel[]     // Ebenenwechsel in Reihenfolge des Wegs
  kreuzungswinkelGrad?: number // Winkel Ankunfts- zu Abfahrtsebene, 0–90
  vorbehalte: string[]         // was das Bild NICHT belegt
}

interface SchemaEbene {
  level: number                // 2, 1, 0, -1, -2 … auch 0.5 möglich
  art: 'gleise' | 'verbindung' // trägt Bahnsteige / Halle, Unterführung, Steg
  richtungGrad?: number        // Gleisrichtung 0–180, nur bei art='gleise'
  richtungLokalGrad?: number   // Lage IM Bezugsrahmen; 0 = wie die Ankunftsebene
  bahnsteige: SchemaBahnsteig[]
  aufRoute: boolean            // berührt die Route diese Ebene?
  weg?: SchemaPunkt[]          // der Weg auf dieser Ebene, Linienzug in Metern
  netz?: SchemaWegstueck[]     // begehbares Netz in Routennähe, NUR bei art='verbindung'
  elemente?: SchemaElement[]   // Ebenenwechsel als sichtbare Bezugspunkte
}

interface SchemaWegstueck { punkte: SchemaPunkt[] }

interface SchemaElement {
  typ: 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe'
  punkte: SchemaPunkt[]        // zwei bei Treppe/Rolltreppe/Rampe, EINER beim Aufzug
  aufRoute: boolean
  beiM?: number                // Meter entlang des Bahnsteigs, wenn sie an einem liegt
}

interface SchemaBahnsteig {
  bahnsteigId: string
  gleise: string[]             // ["5","6"] – ein Bahnsteig, zwei Gleise
  laengeM?: number             // FEHLT, wenn keine Achse bekannt ist
  querM?: number               // Lage quer zur Gleisrichtung; kleinster = 0
  rolle?: 'start' | 'ziel'
  anlagen?: { aufzug: number; rolltreppe: number; treppe: number }
  von?: SchemaPunkt            // Bahnsteigenden im Bezugsrahmen
  bis?: SchemaPunkt
  zugaenge?: SchemaZugang[]    // nur am Ankunfts- und Abfahrtsbahnsteig
}

/** Meter. Ursprung = Startpunkt der Route, x-Achse = Gleisrichtung der Ankunftsebene. */
interface SchemaPunkt { x: number; y: number }

/** Alle Anlagen, die an derselben Stelle den Bahnsteig verlassen. */
interface SchemaZugang {
  beiM: number                 // Meter entlang des Bahnsteigs, 0 = Anfang
  pos: SchemaPunkt
  aufzug: number
  rolltreppe: number
  treppe: number
  aufRoute: boolean            // nutzt die Route genau diesen Zugang?
}

interface SchemaAnlage {
  typ: 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe'
  vonLevel: number
  nachLevel: number
  beiGleisen?: string[]
  pos?: SchemaPunkt
  beiM?: number
}

interface SchemaPoi { art: 'wc' | 'kiosk'; level: number; beiGleisen?: string[] }
interface SchemaWechsel { vonLevel: number; nachLevel: number; typ: KantenTyp }
```

Dazu aus derselben Antwort, für Kopf und Fuß:

```ts
schritte: { text, typ, distanzM?, sekunden?, level?, knotenVon?, knotenBis? }[]
gehzeitSek: number
stufe: 1 | 2 | 3            // 3 = Standardmodell, Angaben geschätzt
hinweise: string[]          // Degradationshinweise im Klartext
```

### 3.2 Ein echter Datensatz: Berlin Hbf, Gleis 14 → 6

`stufe: 1 · gehzeitSek: 575 · hinweise: []`

**Ebene +2** · `art: gleise` · `richtungGrad: 76`

| Gleise | Länge | querM | Rolle | Aufzug/Rolltreppe/Treppe |
|---|---|---|---|---|
| 15/16 | 170 m | 0 | | – |
| 13/14 | 428 m | 50 | **start** | 6 / 12 / 7 |
| 11/12 | 426 m | 69 | | – |

**Ebene +1** · `verbindung` · keine Bahnsteige
**Ebene 0** · `verbindung` · keine Bahnsteige
**Ebene −1** · `verbindung` · keine Bahnsteige

**Ebene −2** · `art: gleise` · `richtungGrad: 157`

| Gleise | Länge | querM | Rolle | Aufzug/Rolltreppe/Treppe |
|---|---|---|---|---|
| 22 | 77 m | 0 | | – |
| 7/8 | 430 m | 48 | | 2 / 7 / 9 |
| 5/6 | 430 m | 72 | **ziel** | 3 / 6 / 4 |
| 3/4 | 430 m | 86 | | 3 / 6 / 4 |
| 1/2 | 430 m | 111 | | 1 / 6 / 4 |

`wechsel`: 2→1, 1→0, 0→−1, −1→−2 — **viermal Rolltreppe**
`kreuzungswinkelGrad`: **81**
`vorbehalte`: „Bahnsteigabschnitte (A–G) sind in den Quellen nicht verortet."

Die vollständige JSON-Antwort steht in `docs/beispiel-schema-berlin-14-6.json` (1,7 kB).

---

## 4. Was gezeichnet werden darf — und was nicht

Das ist die wichtigste Tabelle dieses Dokuments. Der Vorgängerentwurf zeigt
mehrere Dinge, für die es keinen Beleg gibt.

| Bildelement | Beleg | Auflage |
|---|---|---|
| Ebenenband je Stockwerk | `ebenen[]` | **Zahl kommt aus den Daten**, nicht aus dem Layout. Berlin: fünf. |
| Bandbeschriftung „GLEISE 11–16" | `bahnsteige[].gleise` | ja |
| Bandbeschriftung „HAUPTHALLE" | — | **nein.** Ebene 0 heißt so per Konvention, nicht laut Daten. Zulässig: „EBENE 0". |
| Gleislinien nebeneinander | `querM` | **Reihenfolge und Abstände sind echt.** Nicht nach Gleisnummer sortieren — Gleis 22 liegt neben 7/8. |
| Welche Seite links ist | — | **willkürlich.** Das Schema hat keinen Kompass. Spiegeln ist erlaubt, aber nicht „Norden ist oben" behaupten. |
| Bahnsteigbalken mit Länge | `laengeM` | ja, **wenn vorhanden**. Fehlt es, darf der Balken keinen Maßstab suggerieren. |
| Aufzüge/Rolltreppen am Bahnsteig | `bahnsteige[].anlagen` · `zugaenge` | Am Ankunfts- und Abfahrtsbahnsteig **verortet** (siehe unten), an den übrigen als Anzahl. |
| Ebenenwechsel-Symbol auf der Route | `anlagen[]`, `wechsel[]` | ja, mit richtigem Typ (Treppe ≠ Rolltreppe ≠ Aufzug). |
| Routenlinie über die Bänder | `ebenen[].weg` | **ja, als gemessener Linienzug** — Kurven und Kehren inbegriffen. Nur bei Stufe 3 fehlt er. |
| Zugänge am Bahnsteig (Stelle) | `bahnsteige[].zugaenge` | **ja**, an ihrer gemessenen Stelle. Gebündelt: an einer Stelle stehen oft 4–6 Anlagen. |
| Gänge, Kurven, Ringe einer Übergangsebene | `ebenen[].netz` | **ja**, aus dem Kartenmaterial, 80 m um den Weg. Nur bei `art: 'verbindung'`. |
| Einzelne Anlage als Bezugspunkt | `ebenen[].elemente` | **ja**, mit Grundriss. Form aus dem Typ: Rolltreppe durchgezogen, Treppe gestrichelt, Aufzug als Kasten. |
| Kiosk / WC | `pois[]` | ja, mit Ebene. Oft leer — muss ohne sie funktionieren. |
| Orientierungspunkt „Anzeige" | — | **nein.** Nicht in den Daten (25 von 26 OSM-Treffern sind Fremdtafeln). |
| Abschnittsmarker „C" | — | **nein, vorerst.** Siehe 5.4. |
| Positionspunkt | `schritte`-Fortschritt | ja, als Fortschritt entlang der Schrittfolge. **Nicht** als GPS-Ort — in der Halle unzuverlässig. |
| Kreuzungswinkel der Ebenen | `kreuzungswinkelGrad` | siehe 5.2 — eine bewusste Entscheidung, keine Nebensache. |

**Grundsatz:** Das Bild darf grob sein. Es darf nicht falsch sein. Wo ein
Wert fehlt, ist Weglassen besser als Schätzen — und `vorbehalte` gehört
sichtbar an die Darstellung, nicht in ein Impressum.

---

## 5. Die harten Fälle

### 5.1 Fünf Bänder, nicht drei

Der Vorgängerentwurf hat drei Bänder fest verdrahtet. Berlin 14 → 6 berührt
**fünf** Ebenen, davon **drei ohne einen einzigen Bahnsteig**. Ein Band ohne
Gleise braucht eine eigene Gestalt — es ist eine Halle oder eine
Unterführung, kein leeres Gleisband.

Gleichzeitig gilt: kleine Bahnhöfe haben **ein** Band. Das Bild muss von
1 bis ~6 Bändern tragen, ohne dass eines der beiden Extreme kaputt aussieht.

### 5.2 Berlin ist ein Kreuzungsbahnhof (81°)

Oben laufen die Gleise auf 76°, unten auf 157°. Die Ebenen stehen fast
senkrecht zueinander. Der Vorgängerentwurf zeichnet alle Bänder parallel —
das ist eine **Abstraktion, keine Abbildung**.

Beides ist vertretbar, aber es ist eine Entscheidung:

- **parallel:** ruhiger, leichter zu lesen, verschweigt die Drehung
- **gedreht:** ehrlicher, erklärt das Gefühl „ich bin um die Ecke gelaufen",
  kostet Platz und Ruhe

Der Wert steht als `kreuzungswinkelGrad` zur Verfügung. Wenn parallel
gezeichnet wird, sollte die Drehung wenigstens **benannt** werden.

### 5.3 Ein Bahnsteig ist 430 m lang — und hat acht Zugänge

Das ist keine Randnotiz: Der letzte Schritt in Berlin lautet „210 m links zu
Gleis 6" — zweieinhalb Minuten Gehen **auf dem Bahnsteig**, nachdem man ihn
erreicht hat. Ein Schema, das den Bahnsteig als kurzen Strich zeigt,
unterschlägt den längsten Einzelabschnitt des Wegs.

Und die Zugänge liegen nicht irgendwo, sondern an gemessenen Stellen:

```
13/14 (428 m)   116 m: 4 Rolltreppen, 2 Treppen
                154 m: 4 Aufzüge
                193 m: 3 Rolltreppen, 2 Treppen   ← die Route nimmt diesen
5/6   (430 m)   33 · 119 ← Route · 133 · 165 · 198 · 242 · 260 · 330 m
```

Die Frage „wie weit bis zum nächsten Abgang" ist damit beantwortbar — und
sie ist die Frage, die auf einem Bahnsteig wirklich zählt.

### 5.2a Zwei Bildsprachen, nicht eine

Eine **Gleisebene** und eine **Übergangsebene** brauchen verschiedene Bilder,
weil sie verschiedene Fragen beantworten:

- **Gleisebene:** „Wo am Bahnsteig bin ich, und wo ist der nächste Abgang?"
  Der Bahnsteig trägt die Orientierung — waagerechte Balken in echter
  Reihenfolge und maßstäblicher Länge, die Anlagen an ihrer gemessenen
  Stelle. Eine Drehung nach der wahren Gleisrichtung macht das Bild hier nur
  schief, ohne etwas zu beantworten.
- **Übergangsebene:** „Woran biege ich ab?" Dort gibt es keinen Bahnsteig,
  also muss der Grundriss selbst tragen: Gänge, Kurven, Ringe aus `netz`,
  darauf der Weg, dazu die Anlagen als Bezugspunkte. Berlins Ebene 1 ist ein
  Ring; das zu sehen beantwortet die Frage von selbst.

**Symbolregel, für beide gleich:** Rolltreppe als durchgezogene Linie,
Treppe gestrichelt, Aufzug als kleiner Kasten. Die Form kommt aus der Sache:
Eine Treppe läuft waagerecht mit und ist im Grundriss eine Strecke, ein
Aufzug steht still und ist ein Punkt.

### 5.3a Der Weg hat eine Form, und sie ist belegt

`ebenen[].weg` ist der gemessene Linienzug. Auf Berlins Ebene 0 läuft er
26 m hinaus und kommt fast an derselben Stelle zurück: **die beiden
Rolltreppen liegen hintereinander, man muss sich umdrehen.** Eine
Darstellung, die dort nur „geradeaus weiter" zeigt, schickt den Reisenden in
die falsche Richtung.

### 5.4 Abschnitte A–G sind nicht verortet — vorerst nicht zeichnen

Der Vorgängerentwurf zeigt einen Marker „Abschnitt C". Dafür gibt es heute
keine Grundlage:

- OSM kennt für Berlin **null** Abschnittsmarker.
- FaSta nennt Abschnitte nur an **4 von 8** untersuchten Großbahnhöfen, dort
  nur an einzelnen Bahnsteigen.
- Wo es Belege gibt, stimmt eine gleichmäßige Einteilung **in der Mitte** auf
  13 m genau (bei 61 m Abschnittsbreite) — die **Richtung**, also welches
  Bahnsteigende A ist, ist unbelegt.
- Die Eingangsquelle, die „Wagen 26 → Abschnitt C" liefern würde, ist **nicht
  mehr erreichbar** (Host existiert nicht mehr).

**Auflage:** Der Abschnitt wird nicht gezeichnet. Das Bild soll aber einen
**vorgesehenen Platz** dafür haben, damit er später ohne Umbau eingesetzt
werden kann — mit einer Darstellung, die Ungefährheit sichtbar macht
(unscharfer Bereich statt scharfer Marke).

### 5.5 Degradation

| Fall | Daten | Das Bild muss |
|---|---|---|
| Standardmodell (`stufe: 3`) | `laengeM` und `querM` fehlen überall | ohne Maßstab auskommen, Vorbehalt zeigen |
| Einzelner Bahnsteig ohne Achse | `laengeM` fehlt bei einem | diesen Balken anders zeichnen als die belegten |
| Gleicher Bahnsteig | keine Route, `schritte` fast leer | „Gleis 6 gegenüber, kein Ebenenwechsel" — kein Bänderbild |
| Keine POIs | `pois: []` | ohne Orientierungspunkte tragen (Normalfall!) |
| Gleiswechsel während der Fahrt | neue Route ersetzt die alte | den Wechsel sichtbar machen, nicht still austauschen |

---

## 6. Zustände und Interaktion

- **Schrittfortschritt:** Der Reisende tippt „Weiter". Das Schema muss den
  Fortschritt zeigen — zurückgelegter Teil gegen kommenden Teil. Die aktive
  Ebene ist die des aktuellen Schritts (`schritte[i].level`).
- **Kein Zoom-Zwang:** Alles Wesentliche muss ohne Vergrößern lesbar sein.
- **Zurückblättern** muss möglich sein (der Vorgängerentwurf hat es).
- **Ampel im Kopf:** grün ≥ 2 min Puffer · gelb 0–2 min · rot < 0. Farbe nie
  allein — immer mit Zahl und Wort.
- **Zeitstempel:** Jede Live-Angabe trägt „Stand: HH:MM". Keine vorgetäuschte
  Aktualität.

---

## 7. Gestaltungsmittel (vorhanden, beizubehalten)

```
--color-bg          #f3f2f2      --color-neutral-100  #f8f4f4
--color-surface     #eae9e9      --color-neutral-300  #d7d3d3
--color-text        #201e1d      --color-neutral-500  #9b9797
--color-accent      #ec3013      --color-neutral-600  #7d7979
--color-accent-300  #ffc4b8      --color-neutral-700  #605d5d
--color-accent-700  #ae1800      --color-neutral-800  #444141
--color-gruen       #0f7a4f      --color-gelb         #e08a00
--color-rot         #ec3013
Schrift: Archivo (Überschrift 800, Fließtext 400/700)
```

Rot (`#ec3013`) ist die Route und die Aktion. Es ist **auch** die Ampelfarbe
Rot — dieser Konflikt besteht heute schon und sollte im neuen Entwurf gelöst
werden.

---

## 8. Wofür der Vorgängerentwurf nicht reicht

Screen 3 in `design/Umstieg.dc.html` ist der Ausgangspunkt und in Haltung
richtig: Schema statt Karte, ein Schritt zur Zeit, große Ziffern. Er scheitert
an vier Stellen an der Wirklichkeit:

1. drei feste Bänder, Berlin braucht fünf
2. Gleisnummern frei gesetzt statt aus der echten Querlage
3. Orientierungspunkte, die es in den Daten nicht gibt („Anzeige")
4. ein Abschnittsmarker ohne Datengrundlage

Die heutige Umsetzung (`frontend/src/components/Ebenenschema.tsx`) ist noch
weiter davon entfernt: Sie leitet ihr Bild aus den **Schritttexten** ab und
kennt deshalb nur Ebenen und die zwei eingegebenen Gleise — keine
Nachbargleise, keine Längen, keine Reihenfolge. Genau das liefert der
Endpunkt jetzt.

---

## 9. Offene Gestaltungsfragen

Diese Fragen sind Gestaltung, nicht Daten — sie gehören in den Entwurf
beantwortet:

1. **Parallel oder gedreht** bei kreuzenden Ebenen (5.2)?
2. Wie unterscheidet sich ein **Verbindungsband** (Halle, Unterführung)
   sichtbar von einem Gleisband?
3. Wie wird die **Bahnsteiglänge** spürbar, ohne dass ein 430-m-Balken das
   Bild sprengt — und wie sieht ein Balken **ohne** belegte Länge anders aus?
4. Wohin mit den **Anlagenzahlen** (3 Aufzüge, 6 Rolltreppen)? Chip am
   Bahnsteig, Randspalte, oder nur beim aktiven Bahnsteig?
5. Wie zeigt das Bild **Fortschritt**, ohne den kommenden Weg zu verstecken?
6. Wie sieht der **reservierte Platz für den Abschnitt** aus, solange er leer
   ist (5.4)?
7. Wie werden **Vorbehalte** sichtbar, ohne die Seite zu belasten?
8. Wie löst der Entwurf den **Rot-Konflikt** zwischen Route und Ampel (7)?

---

## 10. Abnahmekriterien

Ein Entwurf ist brauchbar, wenn er:

- [ ] mit **1, 3 und 5 Bändern** gezeigt wird und in allen dreien trägt
- [ ] den Berlin-Datensatz aus 3.2 **unverändert** abbildet — fünf Bänder,
      acht Bahnsteige, vier Rolltreppen, Start 13/14, Ziel 5/6
- [ ] den Fall `stufe: 3` ohne Maßstabsangaben zeigt
- [ ] kein Element enthält, das in Abschnitt 4 als „nein" geführt ist
- [ ] die `vorbehalte` an der Darstellung sichtbar macht
- [ ] bei 320 px Breite ohne waagerechtes Scrollen lesbar bleibt
- [ ] ohne Farbe als alleinigen Bedeutungsträger auskommt
