# Eingabe neu und das breite Layout (iPad, Desktop) – Designdokument

Stand: 11.10.2026 · Im Brainstorming freigegeben (Weg A, Animation „Tafeln
klappen nach rechts auf", Desktop wie iPad) · Zieldokument für den
Umsetzungsplan

Schließt zwei offene Stellen aus [`design/DESIGN.md`](../../../design/DESIGN.md)
§8: **1. den Eingabe-Bildschirm**, für den es nie einen Entwurf gab, und **5. das
iPad-Layout**, hier zunächst nur für die Eingabe. Grundlage sind
[`BRIEF.md`](../../../BRIEF.md) §4 („Eingabe — kürzer, nicht schöner") und §6.3
(App-Store-Richtlinie 2.4.1: „eigenes Layout, keine vergrößerte Telefon-App").

---

## 1. Ziel und Abgrenzung

**Ziel:** Die Eingabe trägt nur noch, was Pflicht ist – Bahnhof, Ankunftsgleis,
Abfahrtsgleis –, und alles andere steht eingeklappt oder am Rand. Ab einer
Breite von 700 px bekommt sie einen eigenen Aufbau, in dem die Live-Tafeln von
Ankunft und Abfahrt offen neben dem Formular stehen: Wer im Zug vorab plant,
tippt seinen Zug an, statt ein Gleis zu tippen.

**Für wen das breite Layout ist:** Planen im Zug, Querformat auf dem Klapptisch,
Zeit vorhanden. Desktop bekommt dasselbe Layout – es richtet sich nach der
**Breite**, nicht nach dem Gerät.

**Ausdrücklich nicht das Ziel:**

- Die übrigen vier Bildschirme. Sie bleiben auf breiten Schirmen vorerst die
  430-px-Spalte.
- Änderungen am Backend. Die Tafel liefert schon heute die laufende und die
  nächste Stunde (`backend/src/clients/timetables.ts`).
- Stitch. Entworfen wird in diesem Dokument; das Stitch-Projekt bleibt
  unberührt (Entscheidung vom 11.10.2026).
- Seitenübergänge und die übrige Bewegung aus `DESIGN.md` §6 – eigene Vorhaben.

## 2. Festgelegte Entscheidungen

| Entscheidung | Festlegung | Begründung |
|---|---|---|
| Layout nach Breite | unter 700 px Handy · 700–899 px gestapelt · ab 900 px drei Spalten | iPad hoch hat 768–834 px, quer 1024–1366 px; iPad Pro 13″ hoch (1032 px) bekommt die drei Spalten. Desktop wie iPad |
| Weg A | Formular links, Ankunfts- und Abfahrtstafel offen rechts | Der breite Schirm gibt dem Platz, was das Handy einklappen muss. B (Umschalter) ließ den Platz halb leer, C war die „vergrößerte Telefon-App" |
| Tafelfenster breit | −5 Minuten bis Ende der **nächsten** Stunde | Wer eine Stunde vor der Ankunft plant, fand seinen Zug im Fenster −5/+45 nicht. Das Backend liefert die zwei Stunden schon |
| Tafelfenster Handy | bleibt −5/+45 | ToDo 3f: auf dem Handy bewusst gekappt |
| Standort-Knopf | **kein** Knopf „Standort verwenden" | Die Erkennung läuft auf der Eingabe ohnehin (`starteVerfolgung` in `App.tsx`); ein Knopf hätte nichts zu tun |
| Animation | Tafeln klappen nach rechts auf, nur auf eine Handlung hin | Wunsch vom 11.10.; `DESIGN.md` §6 erlaubt Bewegung nur als Antwort auf eine Handlung |

## 3. Abgleich mit DESIGN.md und der heutigen Ansicht

Der freigegebene Entwurf wurde gegen `design/DESIGN.md` und das bestehende
`App.css` geprüft. Folgendes ist **gegenüber dem Entwurf im Gespräch
angepasst**, damit die Eingabe zur übrigen App passt:

| Stelle | Im Gespräch | Festgelegt | Regel |
|---|---|---|---|
| Größe der Gleisnummer in der Kachel | 40 px | ~~56 px, ab vier Zeichen 28 px~~ – **seit dem 11.10.2026 abends beide 28 px** (`--schrift-titel`): Mit „2 A - D" links und „1" rechts standen zwei ungleich hohe Felder nebeneinander (im Browser gesehen, auf Wunsch angeglichen) | §3: Staffel 56/28/22/18/15, „nichts darunter" – 40 px gibt es nicht. Teilgleise wie „7A-D" passen auf 320 px nur in 28 px |
| Beschriftung der Kacheln | „Ankunft" / „Abfahrt" | **„Du kommst an" / „Dein Anschluss"** als `.kicker`, darunter „Gleis" | Dieselben Wörter wie die Karten der Übersicht: Die Kachel *wird* auf dem nächsten Bildschirm zur Karte. §3: Kicker in normaler Schreibweise |
| Farbe der Kacheln | offen | Ankunft wie `.dashboard-block`, Abfahrt wie `.dashboard-block.ziel` (roter Rand, Rotschleier, Nummer in Rotschrift) | Rot ist Sekundärfarbe (§2); dieselbe Rolle wie auf der Übersicht |
| Rundung | offen | Kachel und Tafelspalte **mittel** (20 px), das Feld in der Kachel **klein** (14 px), Platzhalter **mittel** | §4: Karten/Tafelblöcke mittel, verschachtelt eine Stufe kleiner |
| Pfeil im Hauptknopf | stand | **entfällt** | §4: „Kein Pfeil → hinter dem Text". „Umstieg starten" trug ihn noch |
| Laden der offenen Tafeln | „Tafel wird geladen …" | **Skelettzeilen** in den Maßen der Tafelzeilen, ohne Bewegung | §4: Skelettflächen statt Kreisel; §6: kein Schimmern. Die Handy-Tafel bleibt beim heutigen Text |
| Dauer der Animation | 320 ms je Tafel, 120 ms versetzt | **200 ms je Tafel** (`--dauer-normal`), die zweite **120 ms** (`--dauer-schnell`) später – zusammen 320 ms (`--dauer-ruhig`) | §6: Aufklappen läuft 200 ms; die ganze Bewegung dauert so lang wie ein Seitenwechsel |
| Auslöser der Animation | „sobald ein Bahnhof gewählt ist" | **nur, wenn der Nutzer gewählt hat** (einen Vorschlag oder einen „Bahnhof in deiner Nähe" angetippt). Setzt die Standorterkennung oder der gespeicherte Entwurf den Bahnhof, stehen die Tafeln ohne Bewegung da | §1/§6: „Bewegung, die von selbst Aufmerksamkeit fordert, ist verboten." Die Erkennung trifft verzögert ein – eine Tafel, die dann aufklappt, bewegt sich von selbst |
| Tafel nach der Wahl | blieb offen | **bleibt offen**, die gewählte Zeile ist markiert; ein zweiter Tipp darauf hebt die Wahl auf | Heute ersetzt `Zugauswahl` die Tafel nach der Wahl durch „gewählt · Ändern" – im breiten Layout stünde die Spalte dann leer |
| Rollen der Tafel | – | im breiten Layout rollt die **ganze Spalte**, die Kategorietitel bleiben stehen; die Kappung je Kategorie (`max-height: 216px`) gilt dort nicht | Die Kappung sorgt auf dem Handy dafür, dass alle Kategorien zugleich sichtbar bleiben; in einer bildschirmhohen Spalte schnitte sie nur ab |

**Bekannt und hier nicht gelöst:** `DESIGN.md` §4 verlangt „keine Kreisel", der
Code behält `.lade-kreisel` im Hauptknopf mit Begründung (`App.css`, Abschnitt
reduzierte Bewegung). Diese Spec ändert daran nichts.

## 4. Die Handy-Eingabe (unter 700 px)

Von oben nach unten, alles in einem Rollbereich; der Hauptknopf steht fest
darunter, über der Leiste – derselbe Aufbau wie auf der Übersicht seit dem
07.10.2026.

```
Umstieg.                      ← Lockup wie heute (Kopf aus App.tsx)
Vom Ankunftsgleis zum Anschlusszug – Schritt für Schritt.
[Standorthinweise wie heute]
Wo steigst du um?             ← Bildschirmtitel, --schrift-titel
Umstiegsbahnhof
[ Berlin Hbf              ]
✓ Berlin Hbf · automatisch erkannt
Verbindung einfügen           ← Textknopf am Rand
┌ Du kommst an ┐ ┌ Dein Anschluss ┐
│ Gleis        │ │ Gleis          │
│ [ 6 ]        │ │ [ 14 ]         │   ← 56 px, ab vier Zeichen 28 px
│ RE 3 · an 14:22 │ ICE 1006 · ab 14:38  ← nur mit gewähltem Zug
└──────────────┘ └────────────────┘
▸ Züge und Wagennummer · optional
▸ Einstellungen
Impressum · Datenschutz
──────────────────────────────
[ Umstieg starten ]           ← fest, ohne Pfeil
[Eingabe][Übersicht][Weg][Meldungen]
```

- **Bahnhof:** unverändert – Suche mit Vervollständigung, Abzeichen
  `.bahnhof-gewaehlt`, „Bahnhöfe in deiner Nähe", Ersatz über die EVA-Nummer bei
  fehlendem DB-Zugang, Hinweis bei fehlendem Netz. Die Beschriftung bleibt
  „Umstiegsbahnhof".
- **„Verbindung einfügen"** ersetzt den breiten Knopf „Reise importieren": ein
  Textknopf unter dem Bahnhofsfeld, rechtsbündig. Er öffnet denselben Dialog
  (`ReiseImport`). Der Name folgt dem DB Navigator („Verbindung teilen").
- **Gleiskacheln** (`.gleiskachel`, Abfahrt zusätzlich `.ziel`): zwei Kacheln
  nebeneinander. Je Kachel Kicker, die sichtbare Beschriftung „Gleis" über dem
  Feld und das Feld selbst. Der zugängliche Name des Felds bleibt **„Ankunft:
  Gleis"** bzw. **„Anschluss: Gleis"** – er enthält die sichtbare Beschriftung
  „Gleis" (WCAG 2.5.3) und hält die bestehenden Tests. Ist ein Zug gewählt,
  steht unter dem Feld „RE 3 · an 14:22" bzw. „ICE 1006 · ab 14:38", bei einem
  Gleiswechsel mit dem roten Zusatz wie heute.
- **„Züge und Wagennummer · optional"** (`<details>`, zu): darin für die Ankunft
  `Zugauswahl` („Ankunftszug wählen") und „Ankunft: Wagen (optional)", für die
  Abfahrt ebenso. `Zugauswahl` verhält sich hier wie heute (Knopf, Fenster
  −5/+45, „gewählt · Ändern").
- **Einstellungen:** unverändert.
- **Impressum · Datenschutz** (`Fusszeile`) am Ende des Rollbereichs.
- **„Umstieg starten"** fest unter dem Rollbereich, ohne Pfeil; „Wird berechnet
  …" mit Kreisel wie heute.

## 5. Das breite Layout (ab 700 px)

### 5.1 Drei Spalten (ab 900 px)

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Umstieg.         │ Ankunft · Berlin Hbf  │ Abfahrt · Berlin Hbf  │
│ Wo steigst du um?│ Stand 14:20           │ Stand 14:20           │
│ Umstiegsbahnhof  │ Regionalverkehr       │ Fernverkehr           │
│ [Berlin Hbf    ] │ 14:22 RE 3 aus … Gl.6 │ 14:38 ICE 1006 … Gl.14│
│ Verbindung einf. │ 14:25 RB 23 …   Gl.15 │ 14:41 RE 1 …    Gl.11 │
│ ┌Du kommst an┐┌Dein Anschluss┐         │   …   (rollt)         │
│ │ 6          ││ 14           │         │                       │
│ └────────────┘└──────────────┘         │                       │
│ Ankunft: Wagen   Anschluss: Wagen      │                       │
│ ▸ Einstellungen  │                       │                       │
│ [Umstieg starten]│                       │                       │
└──────────────────┴───────────────────────┴───────────────────────┘
          [Eingabe] [Übersicht] [Weg] [Meldungen]
```

- Spalten `minmax(340px, 400px) 1fr 1fr`, Inhalt höchstens 1280 px breit und
  mittig. Die Spalte ist so hoch wie das Sichtfeld (`100dvh`); jede der drei
  Spalten rollt für sich.
- **Formularspalte:** dieselben Teile wie auf dem Handy, aber ohne den
  Aufklapper „Züge und Wagennummer": Die Wagenfelder stehen offen unter den
  Kacheln, die Züge wählt man rechts. „Umstieg starten" steht fest am Fuß der
  Formularspalte.
- **Tafelspalten** (`.tafel-spalte`): Kopf mit „Ankunft · {Bahnhof}" bzw.
  „Abfahrt · {Bahnhof}" und „Stand {Uhrzeit des Abrufs}", darunter die Tafel mit
  ihren Kategorien. Die Zeilen sind dieselben wie heute (Zeit, Zug, Ziel, Gleis,
  Gleiswechsel rot).
- **Leiste:** bleibt unten über die ganze Breite; ihre vier Knöpfe stehen mittig
  in einer Gruppe von höchstens 560 px.

### 5.2 Gestapelt (700–899 px, iPad hoch)

Formularteil wie in 5.1 in voller Breite, darunter die beiden Tafelspalten
nebeneinander, je 420 px hoch und in sich rollend. Alles zusammen rollt in
einem Rollbereich; „Umstieg starten" steht fest darunter, über der Leiste.

### 5.3 Verhalten der Tafeln

- Sie sind **immer offen** – kein Knopf „Zug wählen". Sie stehen, sobald ein
  Bahnhof **gewählt** ist (`gewaehlt` in `Eingabe`), geladen wird sofort und neu,
  wenn der Bahnhof wechselt; eine Antwort für einen inzwischen verlassenen
  Bahnhof wird verworfen.
- **Nicht** an der EVA-Ersatzeingabe: Die gibt es nur ohne DB-Zugang, und dort
  kann auch die Tafel nicht laden. Die Platzhalter bleiben dann stehen und sagen
  es („Ohne DB-Zugang keine Live-Tafel – Gleise bitte von Hand eingeben.").
  „Verbindung einfügen" setzt ebenfalls keinen Bahnhof, nur den Suchtext;
  gewählt wird danach über einen Vorschlag.
- **Fenster:** von 5 Minuten vor dem Abruf bis zum Ende der nächsten vollen
  Stunde (Abruf 14:20 → bis 16:00). Ohne Züge darin: „Keine Züge bis 16:00."
- **Antippen** einer Zeile setzt Zug und Gleis in die Kachel links (wie heute
  `onAuswahl`). Die gewählte Zeile trägt `aria-pressed="true"` und ist markiert;
  ein zweiter Tipp darauf hebt die Wahl auf, die Kachel behält das Gleis.
- **Welche Zeile gewählt ist,** entscheiden Zugname und Sollzeit – so findet
  auch ein Zug aus „Verbindung einfügen" oder aus dem gespeicherten Entwurf
  seine Zeile, sofern er im Fenster liegt.
- **Laden:** sechs Skelettzeilen in Zeilenhöhe, ohne Bewegung.
- **Fehler:** dieselben Texte wie heute („Live-Tafel derzeit nicht erreichbar.",
  bei fehlendem DB-Zugang mit dem Hinweis, das Gleis von Hand einzugeben).

### 5.4 Vor der Wahl: Platzhalter

Ohne Bahnhof stehen an Stelle der Tafeln zwei ruhige Platzhalter
(`.tafel-platzhalter`): gestrichelter Rand in `--color-divider`, Rundung mittel,
Titel „Ankunft" bzw. „Abfahrt", darunter „Wähle einen Bahnhof – dann stehen hier
die Züge bis zum Ende der nächsten Stunde." (`DESIGN.md` §4: Leere Zustände
sagen, was fehlt und was zu tun ist.)

## 6. Die Animation: Tafeln klappen nach rechts auf

| | Festlegung |
|---|---|
| Auslöser | Der **Nutzer** wählt einen Bahnhof (Vorschlag oder „Bahnhof in deiner Nähe" antippen) oder hebt die Wahl auf (tippt ins Bahnhofsfeld). Nicht: Standorterkennung, gespeicherter Entwurf, erstes Rendern |
| Aufklappen | Jede Tafelspalte öffnet sich von ihrer linken Kante nach rechts: `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, dazu `translateX(-16px)` → `0` und Deckkraft 0 → 1. `--dauer-normal`, `--verlauf-ein`. Die Abfahrtstafel beginnt `--dauer-schnell` später |
| Zuklappen | umgekehrte Reihenfolge – erst Abfahrt, dann Ankunft –, `--dauer-normal`, `--verlauf-aus`. Danach stehen die Platzhalter wieder |
| Layout | Die Spalten sind vor, während und nach der Bewegung gleich breit. Nichts verschiebt sich; das Formular links steht still (`DESIGN.md` §6: „nie nur Deckkraft, sonst springt das Layout" – hier springt nichts, weil der Platz reserviert ist) |
| Ohne Auslöser | Steht der Bahnhof schon beim ersten Rendern fest oder setzt ihn die Erkennung, erscheinen die Tafeln ohne Übergang |
| Reduzierte Bewegung | sofort – die pauschale Regel in `App.css` setzt jeden Übergang auf 0,01 ms. Umgesetzt wird deshalb mit `transition`, nicht mit `@keyframes` |
| Handy | keine solche Animation; dort klappt `<details>` wie heute |

## 7. Architektur

| Teil | Änderung |
|---|---|
| `src/aufbau/breite.ts` (neu) | `useBreitesLayout(): boolean` über `matchMedia('(min-width: 700px)')`, folgt Änderungen (Drehen des iPads). Ohne `matchMedia` (jsdom) `false` |
| `api/tafelauswahl.ts` | `gruppiereTafel` nimmt ein Fensterende; neue reine Funktion `endeNaechsteStunde(abruf: Date): Date` |
| `components/Zugauswahl.tsx` | neue Angabe `immerOffen?: boolean`: kein Knopf, lädt bei EVA-Wechsel, Fenster bis `endeNaechsteStunde`, Skelett beim Laden, gewählte Zeile markiert statt „gewählt · Ändern", Kopf mit Titel und „Stand". Ohne die Angabe verhält sie sich wie heute |
| `components/Eingabe.tsx` | baut den Aufbau selbst: Rollbereich, fester Hauptknopf, im breiten Layout die Tafelspalten samt Platzhalter und Animation. Neue Angaben `kopf?: ReactNode` und `fuss?: ReactNode` – wie `zusatz` am `Schrittsheet` – für Lockup/Standorthinweise und `Fusszeile`. Merkt sich, ob der letzte Bahnhofswechsel vom Nutzer kam (`bewegung: boolean`) |
| `App.tsx` | Eingabe-Zweig: `main` bekommt `app app-eingabe`; Kopf und Hinweise gehen als `kopf`, `Fusszeile` als `fuss` an `Eingabe`. Die Live-Meldungen (`{meldung}`) bleiben davor, wie auf allen Bildschirmen |
| `App.css` | neue Klassen `app-eingabe`, `eingabe-rollbereich`, `eingabe-flaeche`, `eingabe-titel`, `gleiskachel`, `tafel-spalte`, `tafel-spalte-kopf`, `tafel-platzhalter`, `tafel-skelett`; Breakpoints 700 und 900 px; die Leiste in `.app-eingabe` mit der 560-px-Gruppe |

Keine neue Komponente: Kacheln und Platzhalter sind Markup in `Eingabe`, die
Tafel bleibt `Zugauswahl` (`DESIGN.md` §8: Findet sich kein bestehendes Bauteil,
ist das die Frage, ob der Entwurf zu weit geht).

**Datenfluss unverändert:** `Eingabe` meldet weiter `onBerechnen(werte,
entwurf)`; `EingabeWerte` und `EingabeEntwurf` behalten ihre Felder. Der
gespeicherte Entwurf stellt die Maske wie heute wieder her.

## 8. Fehlerbehandlung

- Bahnhofssuche, fehlender DB-Zugang, fehlendes Netz: wie heute, in der
  Formularspalte.
- Tafel nicht erreichbar: Text in der Tafelspalte, die Gleiskacheln bleiben
  tippbar – der Weg über das getippte Gleis funktioniert immer.
- `matchMedia` fehlt: Handy-Layout.

## 9. Testbarkeit

Zuerst rot, dann der Code (TDD):

- `tafelauswahl.test.ts`: `endeNaechsteStunde` (14:20 → 16:00, 14:00 → 16:00,
  23:40 → 01:00 am Folgetag); `gruppiereTafel` mit langem Fenster nimmt einen
  Zug um 15:50 auf, den das kurze verwirft.
- `Zugauswahl.test.tsx`: mit `immerOffen` kein Knopf, Abruf ohne Klick, beim
  EVA-Wechsel neu, verspätete Antwort der alten EVA verworfen, gewählte Zeile
  `aria-pressed`, zweiter Tipp hebt auf, Skelett beim Laden.
- `Eingabe.test.tsx`: Kacheln mit „Du kommst an"/„Dein Anschluss"; Feldnamen
  „Ankunft: Gleis"/„Anschluss: Gleis"; Nummer ab vier Zeichen in der kleinen
  Stufe; „Verbindung einfügen" öffnet den Dialog; auf dem Handy Züge und Wagen
  im zugeklappten Aufklapper; Hauptknopf außerhalb des Rollbereichs und ohne
  Pfeil; breites Layout (gemocktes `matchMedia`): Platzhalter ohne Bahnhof,
  zwei offene Tafeln mit Bahnhof, Bewegung nur nach Nutzerwahl, nicht nach
  Erkennung.
- `App.test.tsx`: der ganze Ablauf klickt weiter durch (Labels bleiben).
- CSS-Test (`eingabe-css.test.ts`): Breakpoints 700/900, `.app-eingabe` auf
  Sichtfeldhöhe, Rollbereiche rollen, Animation über `transition` und Token;
  die bestehenden `bewegung-css`- und `schriftfarben`-Tests bleiben grün.
- **Im Browser** (Rahmen gleicher Herkunft wie bisher): 360 × 740 und 320 px,
  820 × 1180, 1180 × 820, 1440 × 900 – je hell und dunkel; gemessen: kein
  waagerechtes Rollen, Knopf über der Leiste, Spalten gleich breit vor und nach
  der Animation, Kontrast der neuen Schrift.

## 10. Was sich NICHT ändert

- Die fünf Bildschirme, ihre Schlüssel und der Fluss Eingabe → Übersicht → Weg
  → Angekommen.
- `EingabeWerte`, `EingabeEntwurf`, `onBerechnen`, der Sitzungsspeicher.
- Die Bahnhofssuche samt Standorterkennung und EVA-Ersatz.
- `ReiseImport` (nur der Knopf davor heißt anders).
- Übersicht, Weg, Meldungen, Angekommen – auch auf breiten Schirmen.
- Das Backend.
