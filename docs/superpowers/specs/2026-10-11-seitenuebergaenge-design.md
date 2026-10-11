# Seitenübergänge, Adressen und gesicherte Reise – Designdokument

Stand: 11.10.2026 · Im Brainstorming freigegeben (alle vier Empfehlungen) ·
Zieldokument für den Umsetzungsplan

Setzt [`BRIEF.md`](../../../BRIEF.md) §3 („Warum Raute-Adressen das nicht
lösen") und §4 („Bildschirme bekommen Adressen") um, dazu die Seitenwechsel aus
[`design/DESIGN.md`](../../../design/DESIGN.md) §6.

---

## 1. Ziel und Abgrenzung

**Ziel:** Jeder Bildschirm hat eine eigene Adresse, die Zurück-Taste tut, was
man erwartet, ein Neuladen verliert die Reise nicht, und der Wechsel zwischen
Bildschirmen zeigt, in welche Richtung man im Ablauf geht.

**Nebenwirkung, gewollt:** Vercel Web Analytics hängt an der History-API und
hat bisher nur `/` gesehen (114 Aufrufe, Dimension `route` immer leer). Mit
echten Pfaden sieht die Messung zum ersten Mal, wo Menschen aussteigen.

**Ausdrücklich nicht das Ziel:**

- Impressum und Datenschutz werden keine Pfade; sie bleiben `#impressum` und
  `#datenschutz` an der jeweiligen Adresse.
- Die übrige Bewegung aus `DESIGN.md` §6 (Routenwahl-Marke, Restzeit,
  Schrittwechsel) – eigenes Vorhaben.
- Backend und `vercel.json`: Die Umschreibung `/(.*) → /index.html` besteht.
- Eigene Messereignisse (`BRIEF.md` §3: tariflich gesperrt).

## 2. Festgelegte Entscheidungen

| Entscheidung | Festlegung | Begründung |
|---|---|---|
| Neuladen | Die Reise wird im `sessionStorage` des Tabs gesichert und beim Start wiederhergestellt | Ein versehentliches Neuladen im Bahnhof ohne Netz verlor bisher die Route; neu rechnen ginge dort nicht |
| Zurück-Taste | Jeder Bildschirmwechsel ist ein Verlaufseintrag | So erwartet man es vom Browser – auch nach einem Sprung über die Leiste |
| Bewegung | wie `DESIGN.md` §6: gerichtet entlang des Ablaufs, Querblende bei der Leiste | Die Richtung sagt, wo man im Ablauf steht |
| Pfadnamen | wie die Leiste: `/eingabe`, `/uebersicht`, `/weg`, `/meldungen`, `/angekommen` | Die App spricht Deutsch; Adressen sieht man, Schlüssel nicht |

## 3. Adressen und Verlauf

| Bildschirm (Schlüssel) | Adresse | Braucht eine Reise |
|---|---|---|
| `eingabe` | `/eingabe` | nein |
| `dashboard` | `/uebersicht` | ja |
| `navigation` | `/weg` | ja |
| `meldungen` | `/meldungen` | ja |
| `angekommen` | `/angekommen` | ja |

- `/`, eine unbekannte Adresse und eine Adresse mit einem abschließenden
  Schrägstrich (`/weg/`) werden gelesen wie ihr Gegenstück bzw. als Eingabe.
- **Beim Start** bestimmt die Adresse den Bildschirm. Braucht er eine Reise
  und gibt es keine brauchbare, gilt die Eingabe. Steht in der Adresse etwas
  anderes als der Bildschirm, der gilt, wird sie per `replaceState` berichtigt
  (der Hash bleibt) – ein Neuladen auf `/` landet also auf `/eingabe`.
- **Jeder Wechsel** über `setBildschirm` zu einem *anderen* Bildschirm legt
  einen Verlaufseintrag an (`pushState`, Zustand `{ bildschirm }`).
- **Zurück/Vor** (`popstate`): Der Bildschirm kommt aus der Adresse, ohne
  neuen Eintrag. Braucht er eine Reise und gibt es im Speicher keine, wird der
  Eintrag durch `/eingabe` ersetzt.
- Ein Verlaufseintrag ist ein **Ort**, kein Abzug: Wer nach einer neuen
  Berechnung zurück auf einen älteren `/weg`-Eintrag geht, sieht den Weg der
  aktuellen Reise.
- Ein `popstate`, das nur den Hash ändert (Rechtsseiten), lässt den
  Bildschirm unberührt.

## 4. Die Reise sichern

Neues Modul `sitzung/reisespeicher.ts`, gebaut wie `sitzung/eingabespeicher.ts`
(Zugriff im `try`, Form geprüft, Fassung, beschädigt → verworfen).

- **Schlüssel** `umstieg.reise`, **Fassung** 1.
- **Inhalt:** `werte` (EingabeWerte), `route` (RouteErgebnis), `variante`,
  `standort` (Bahnsteigabschnitt), `gehzeiten`, `meldungen`, `versatz`
  (Schritt auf der Wegseite), `gespeichertUm` (ms).
- **Geschrieben** bei jeder Änderung eines dieser Zustände, solange eine Reise
  besteht (`route` und `werte`) **und ein Reise-Bildschirm offen ist**
  (Übersicht, Weg, Meldungen). Nicht auf „Angekommen" und nicht auf der
  Eingabe: Sonst schriebe schon das Leeren der Meldungen beim Bestätigen der
  Ankunft die eben gelöschte Reise sofort zurück. Wer danach über die Leiste
  zurück zur Übersicht geht, setzt die Reise fort – dann wird wieder gesichert.
- **Gelöscht** beim Bestätigen von „Angekommen" – dieselbe Stelle, an der der
  Eingabe-Entwurf geleert wird; die Datenschutzerklärung sagt das so zu.
- **Gelesen** einmal beim Start. Verworfen wird sie, wenn sie unlesbar ist, die
  Fassung nicht stimmt oder sie **älter als 6 Stunden** ist – sonst landete man
  am nächsten Morgen auf der gestrigen Route.
- **Nicht gesichert:** Ladezustände, Fehlertexte, Live-Status (Banner, Stand)
  und die Ankunftserkennung. Sie stellen sich von selbst ein; der Live-Strom
  verbindet sich, sobald ein Reise-Bildschirm offen ist.
- **Datenschutzerklärung:** Der Absatz „Deine Eingabe im Browser" nennt auch
  die berechnete Route und die Meldungen dieser Reise; der Absatz zur
  Reichweitenmessung sagt, dass die Adresse den Bildschirm nennt (etwa `/weg`)
  und nie einen Bahnhof oder ein Gleis.

## 5. Die Bewegung

**Richtung aus dem Ablauf:** Eingabe (0) → Übersicht (1) → Weg (2) →
Angekommen (3). `meldungen` liegt außerhalb.

| Auslöser | Von → nach | Übergang |
|---|---|---|
| Knopf im Ablauf („Umstieg starten", „Navigation starten", „Angekommen", „Neue Reise", Gleiswechsel übernehmen …) oder Zurück/Vor | beide im Ablauf, höher | **vor** |
| dasselbe | beide im Ablauf, niedriger | **zurück** |
| dasselbe | einer davon `meldungen` | **quer** |
| Navileiste | beliebig | **quer** |

| Übergang | Neue Seite | Alte Seite |
|---|---|---|
| vor | von +24 px, Deckkraft 0 → 1, `--dauer-ruhig`, `--verlauf-ein` | nach −12 px, Deckkraft → 0, `--dauer-ruhig`, `--verlauf-aus` |
| zurück | genau gespiegelt (−24 px herein, +12 px hinaus) | |
| quer | Deckkraft 0 → 1, `--dauer-normal` | Deckkraft → 0, `--dauer-normal` |

- **Umsetzung:** `document.startViewTransition(() => flushSync(wechsel))`. Die
  Art steht als `data-uebergang` an `<html>`; die Bewegung steht in `App.css`
  (`::view-transition-old/new(root)`, Keyframes, Dauern und Verläufe nur über
  die Token). Nach dem Übergang wird `data-uebergang` entfernt.
- **Die Leiste steht still:** `view-transition-name: navileiste`; ebenso die
  Störmeldung und das Echtzeit-Banner (`stoermeldung`, `quelle-weg`). Nur die
  Seite selbst bewegt sich.
- **Keine Bewegung**
  - ohne `document.startViewTransition` (Safari < 18, Firefox < 144): der
    Wechsel geschieht sofort;
  - bei `prefers-reduced-motion: reduce` – im Code übersprungen und im CSS
    zusätzlich `animation: none` für alle `::view-transition-*`;
  - wenn der Browser schon selbst animiert (`popstate` mit
    `hasUAVisualTransition`, etwa die Zurück-Wischgeste auf dem iPhone).

## 6. Architektur

| Teil | Änderung |
|---|---|
| `navigation/adressen.ts` (neu) | `PFAD: Record<Bildschirm, string>`, `bildschirmAusPfad(pfad): Bildschirm \| null`, `brauchtReise(b): boolean` |
| `navigation/uebergang.ts` (neu) | `type Ausloeser = 'ablauf' \| 'leiste' \| 'verlauf'`, `type Uebergangsart = 'vor' \| 'zurueck' \| 'quer'`, `uebergangsart(von, nach, ausloeser)`, `mitUebergang(art, aendere, { browserAnimiert })` |
| `sitzung/reisespeicher.ts` (neu) | `interface Reise`, `liesReise(jetzt?)`, `schreibeReise(reise, jetzt?)`, `leereReise()`, `REISE_HOECHSTALTER_MS` |
| `App.tsx` | Startzustand aus Adresse + gesicherter Reise; `setBildschirm(naechster, ausloeser = 'ablauf')` mit `pushState` und Übergang; `popstate`-Lauscher; Reise schreiben (Effekt) und beim Bestätigen der Ankunft löschen; die Leiste ruft mit `'leiste'` |
| `App.css` | `::view-transition-*`, Keyframes, `view-transition-name` an `.navileiste`, `.stoermeldung`, `.quelle-weg`; reduzierte Bewegung |
| `components/Datenschutz.tsx` | zwei Sätze, siehe §4 |

Keine neue Komponente; die Bauteilliste aus `DESIGN.md` §8 bleibt.

## 7. Fehlerbehandlung

- `sessionStorage` fehlt oder ist voll: keine Sicherung, die App läuft wie
  bisher (Neuladen führt zur Eingabe).
- Gesicherte Reise beschädigt, fremde Fassung oder zu alt: verworfen, Eingabe.
- `history` nicht beschreibbar (sehr alte Umgebungen): Wechsel ohne Adresse,
  wie bisher.
- Ein Übergang, der wirft (`startViewTransition` lehnt ab, etwa bei verdecktem
  Tab): der Wechsel ist schon geschehen – das Versprechen wird abgefangen,
  `data-uebergang` entfernt.

## 8. Testbarkeit

Zuerst rot, dann der Code:

- `adressen.test.ts`: Pfad ↔ Bildschirm in beide Richtungen, `/`, `/weg/`,
  Unbekanntes, `brauchtReise`.
- `uebergang.test.ts`: die Tabelle aus §5 vollständig; `mitUebergang` ohne
  `startViewTransition` ändert sofort, mit ruft es und setzt
  `data-uebergang`, bei reduzierter Bewegung und bei `browserAnimiert` nicht.
- `reisespeicher.test.ts`: schreiben/lesen, 6-Stunden-Grenze, kaputtes JSON,
  fremde Fassung, fehlender Speicher, fasst `localStorage` nicht an.
- `App.test.tsx`: Adresse nach „Umstieg starten" ist `/uebersicht`;
  `history.back()` zeigt wieder die Eingabe; Start auf `/weg` mit gesicherter
  Reise zeigt den Weg, ohne zeigt die Eingabe und berichtigt die Adresse;
  „Angekommen" löscht die gesicherte Reise; die Leiste löst „quer" aus, der
  Ablauf „vor".
- `Datenschutz.test.tsx`: nennt Route und Meldungen im Sitzungsspeicher; sagt,
  dass die Adresse nur den Bildschirm nennt.
- CSS-Test: Keyframes und Dauern der Seitenwechsel nur über Token, die Leiste
  hat ihren `view-transition-name`, reduzierte Bewegung schaltet die
  `::view-transition-*` ab.
- **Im Browser:** Rahmen Handy und Desktop – Ablauf mit Zurück-Taste,
  Neuladen auf `/weg`, direkter Aufruf von `/weg` auf der Vercel-Vorschau.

## 9. Was sich NICHT ändert

- Die fünf Bildschirme, ihre Schlüssel und Inhalte.
- Die Rechtsseiten über den Hash.
- Backend, `vercel.json`, die Bauteilliste.
- Die Eingabe und ihr Entwurfsspeicher.
