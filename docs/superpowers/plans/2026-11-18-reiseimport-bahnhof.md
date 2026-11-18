# Reise-Import: klarer Dialog und Bahnhof per offiziellem Namen – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Import-Dialog ist eindeutig bedienbar (Karte wählen, grün bestätigen), und ein Bahnhofsname aus dem Reisetext wird über die offiziellen Namen der Verkehrsstellengruppe zum Bahnhof der App – danach misst eine Simulation, wie oft das greift.

**Architecture:** Backend: reine Abgleichslogik in `core/namensaufloesung.ts` mit injizierter Namensquelle; die Quelle sind zwei neue RIS::Stations-Funktionen in `clients/stations.ts` (gecacht in `app.ts`); Route `GET /api/bahnhof-zum-namen`. Frontend: `ReiseImport.tsx` neu gegliedert; `Eingabe.tsx` ruft nach „Bestätigen“ die Route und wählt den Bahnhof wie ein Tipp in der Liste. Ein Skript fährt dieselbe Logik über die StaDa-Bahnhöfe.

**Tech Stack:** TypeScript, Fastify + Vitest (backend), React 19 + Testing Library + Vitest (frontend), `npx tsx` für Skripte.

**Spec:** `docs/superpowers/specs/2026-11-18-reiseimport-bahnhof-design.md`

## Global Constraints

- Keine Timetables-Abfrage für die Auflösung; nur RIS::Stations (`stop-places/by-name`, `stop-places/{eva}`).
- Treffer nur **exakt** nach Normalisierung (Groß/klein, Leerraum zusammengefasst, Leerraum innen an Klammern egal). Verglichen werden `nameLong` und `nameShort` – nie `nameLocal`, `speechLong`, `speechShort`, `synonyms`.
- Genau eine passende Gruppe → ihr **führender** Eintrag aus der Namenssuche; keine oder mehrere → `null`.
- Nichts wird ohne Tipp des Nutzers ins Formular übernommen; der Reisetext verlässt das Gerät nicht, ans Backend geht nur ein Bahnhofsname.
- „Bestätigen“ grün: vorhandene Klasse `.knopf-angekommen` (`--color-gruen`, Text `--color-bg`).
- Hinweistext bei nicht aufgelöstem Bahnhof wörtlich: `Bitte Bahnhof antippen`.
- Frontend- und Backend-Tests nie gleichzeitig laufen lassen (sonst falsche Timeouts).
- Commits ohne Claude-Kennzeichnung (kein Co-Authored-By, kein Claude-Session); nichts pushen.
- Skripte mit DB-Zugang: `ladeSecrets()` aus `backend/scripts/secrets.ts`; Ablage in `backend/osm-ablage/` (gitignored), nie im Temp.

## Review Focus

1. Nutzer tippt im Bahnhofsfeld, während die Auflösung noch läuft → das späte Ergebnis darf seine Eingabe nicht überschreiben (Test in Task 6).
2. Name passt auf zwei Gruppen (gleicher `nameLong` in zwei Gruppen) → keine Wahl, Hinweis statt Raten (Test in Task 1).
3. Stations-API fällt für ein Mitglied aus → übrige Mitglieder zählen weiter, kein 500 (Test in Task 1 und Task 3).
4. Name aus der Abfahrtszeile ist ein Bus-Halt ohne EVA, Ankunftsname ist ein Bahnhof → Ankunftsname wird versucht (Test in Task 6).
5. Mehrere Umstiege, keiner gewählt → „Bestätigen“ gesperrt, Escape/Abbrechen schließen ohne Übernahme (Test in Task 5).

---

### Task 1: Abgleichslogik `core/namensaufloesung.ts`

**Files:**
- Create: `backend/src/core/namensaufloesung.ts`
- Modify: `backend/src/core/typen.ts` (Typ `BahnhofMitGruppe`)
- Test: `backend/test/namensaufloesung.test.ts`

**Interfaces:**
- Produces:
  - `interface BahnhofMitGruppe extends BahnhofTreffer { namen: string[]; mitglieder: string[] }` in `core/typen.ts` – `namen` = offizielle Namen des Eintrags selbst, `mitglieder` = gültige EVAs der Gruppe (ohne Gruppe: `[eva]`).
  - `normalisiereBahnhofsname(name: string): string`
  - `interface NamensQuelle { sucheMitGruppen(q: string): Promise<BahnhofMitGruppe[]>; amtlicheNamen(eva: string): Promise<string[]> }`
  - `loeseBahnhofsnamen(name: string, quelle: NamensQuelle): Promise<BahnhofTreffer | null>`
  - `MAX_KANDIDATEN = 5`

- [ ] **Step 1: Failing tests** (Quelle als Fake mit `vi.fn`, Daten aus dem Befund der Spec)

```ts
const BERNAU = { name: 'Bernau(b Berlin)', eva: '8013470', lat: 52.675, lon: 13.592,
  namen: ['Bernau(b Berlin)'], mitglieder: ['8013470', '8089205'] }
const CHIEMSEE = { name: 'Bernau a Chiemsee', eva: '8000911', lat: 47.81, lon: 12.37,
  namen: ['Bernau a Chiemsee'], mitglieder: ['8000911'] }
const MITGLIEDSNAMEN: Record<string, string[]> = { '8089205': ['Bernau (S)'] }

it('normalisiert Gross/klein, Leerraum und Klammern', () => {
  expect(normalisiereBahnhofsname(' Bernau  (S) ')).toBe(normalisiereBahnhofsname('bernau(s)'))
  expect(normalisiereBahnhofsname('Berlin Gesundbr. ( S )')).toBe('berlin gesundbr.(s)')
})
it('findet Bernau (S) ueber das Gruppenmitglied und liefert den fuehrenden Bahnhof', async () => {
  expect(await loeseBahnhofsnamen('Bernau (S)', quelle([BERNAU, CHIEMSEE])))
    .toEqual({ name: 'Bernau(b Berlin)', eva: '8013470', lat: 52.675, lon: 13.592 })
})
it('fragt keine Mitglieder ab, wenn ein fuehrender Name schon genau passt', async () => {
  const q = quelle([BERNAU, CHIEMSEE])
  expect((await loeseBahnhofsnamen('Bernau(b Berlin)', q))?.eva).toBe('8013470')
  expect(q.amtlicheNamen).not.toHaveBeenCalled()
})
it('waehlt nichts bei einem Namen, der zwei Gruppen trifft', async () => {
  const zweiter = { ...BERNAU, eva: '8099999', mitglieder: ['8099999'] }
  expect(await loeseBahnhofsnamen('Bernau(b Berlin)', quelle([BERNAU, zweiter]))).toBeNull()
})
it('waehlt nichts bei bloss aehnlichem Namen', async () => {
  // 'Bernau' ist weder nameLong noch nameShort - auch nicht von Bernau a Chiemsee (dort nur nameLocal)
  expect(await loeseBahnhofsnamen('Bernau', quelle([BERNAU, CHIEMSEE]))).toBeNull()
})
it('zaehlt ein ausgefallenes Mitglied als namenlos und rechnet weiter', async () => {
  const q = quelle([BERNAU]); q.amtlicheNamen.mockRejectedValueOnce(new Error('503'))
  expect(await loeseBahnhofsnamen('Bernau (S)', q)).toBeNull()
})
it('betrachtet hoechstens MAX_KANDIDATEN Treffer', async () => { /* 7 Kandidaten, Treffer an Position 6 → null */ })
it('liefert null fuer leeren Namen ohne Abfrage', async () => { /* quelle.sucheMitGruppen nicht aufgerufen */ })
```

`quelle(kandidaten)` liefert `{ sucheMitGruppen: vi.fn(async () => kandidaten), amtlicheNamen: vi.fn(async (eva) => MITGLIEDSNAMEN[eva] ?? []) }`.

- [ ] **Step 2: Run** `cd backend && npx vitest run test/namensaufloesung.test.ts` – Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement** in `core/namensaufloesung.ts`:
  - Normalisieren: `trim`, `toLowerCase`, `\s+`→`' '`, Leerraum nach `(` und vor `)` sowie vor `(` entfernen.
  - Suche über `namensvarianten(name)` (aus `core/bahnhofsname.ts`) wie `sucheBahnhoefeMitVarianten`: erste Variante mit Treffern gewinnt; Fehler einer Variante → nächste; `FehlendeZugangsdatenError` sofort weiterwerfen; kam keine durch, ersten Fehler werfen. Nur die ersten `MAX_KANDIDATEN` Treffer.
  - Stufe 1: Kandidaten, deren `namen` normalisiert gleich sind; genau einer → zurück, mehrere → `null`.
  - Stufe 2: je Kandidat `amtlicheNamen` für jedes Mitglied ≠ eigene EVA (`Promise.allSettled`, abgelehnt = `[]`); Kandidaten mit passendem Mitgliedsnamen; genau einer → zurück, sonst `null`.
  - Rückgabe ohne `namen`/`mitglieder` (nur `name, eva, lat, lon`).

- [ ] **Step 4: Run** dieselbe Testdatei – Expected: PASS.

- [ ] **Step 5: Commit** `feat(backend): Bahnhofsname per offiziellem Namen der Verkehrsstellengruppe aufloesen`

---

### Task 2: RIS::Stations-Funktionen für die Namensquelle

**Files:**
- Modify: `backend/src/clients/stations.ts` (Interface `StopPlace` um `nameShort?` in `names.DE`)
- Create: `backend/test/fixtures/db/by-name-bernau-s.json`, `backend/test/fixtures/db/stop-place-8089205.json` – aus `backend/test/fixtures/spike/namen-probe.json` (Einträge `name:Bernau (S)` und `eva:8089205`, unverändert, aufgezeichnet 18.11.2026)
- Test: `backend/test/namensquelle.test.ts`

**Interfaces:**
- Consumes: `BahnhofMitGruppe` (Task 1)
- Produces:
  - `sucheBahnhoefeMitGruppen(q: string, fetchFn?: typeof fetch): Promise<BahnhofMitGruppe[]>`
  - `holeAmtlicheNamen(eva: string, fetchFn?: typeof fetch): Promise<string[]>`

- [ ] **Step 1: Failing tests** (fetch-Fake liefert die Fixtures)

```ts
it('liefert Bahnhoefe mit Gruppe und offiziellen Namen, ohne fremde Nummernraeume', async () => {
  const t = await sucheBahnhoefeMitGruppen('Bernau (S)', fake('by-name-bernau-s'))
  expect(t[0]).toMatchObject({ eva: '8013470', name: 'Bernau(b Berlin)',
    mitglieder: ['8013470', '8089205'], namen: ['Bernau(b Berlin)'] })
  expect(t.every((x) => /^80\d{5}$/.test(x.eva))).toBe(true)
  expect(t.find((x) => x.eva === '8000911')?.namen).toEqual(['Bernau a Chiemsee'])   // nameLocal 'Bernau' zaehlt nicht
})
it('nennt nameLong und nameShort einer EVA - kein nameLocal, keine Sprechnamen, keine Kuerzel', async () => {
  expect(await holeAmtlicheNamen('8089205', fake('stop-place-8089205'))).toEqual(['Bernau (S)'])
})
```

- [ ] **Step 2: Run** `npx vitest run test/namensquelle.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement** beide Funktionen über `dbGet`/`ladeStopPlace`; `namen` = `[nameLong, nameShort]` ohne leere, entdoppelt; `mitglieder` = `groupMembers` gefiltert mit `istGueltigeEva`, leer → `[eva]`.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): offizielle Namen und Gruppen aus RIS::Stations`

---

### Task 3: Route `GET /api/bahnhof-zum-namen`

**Files:**
- Modify: `backend/src/routes/api.ts` (`ApiClients.namen?: NamensQuelle`, Route)
- Modify: `backend/src/app.ts` (Standard-Quelle mit `mitCache`: Suche `SUCHE_TTL_MS`/500, Namen `STAMM_TTL_MS`/1000; `GRENZEN['/api/bahnhof-zum-namen'] = 14`)
- Test: `backend/test/api-bahnhof-zum-namen.test.ts`

**Interfaces:**
- Consumes: `loeseBahnhofsnamen`, `NamensQuelle` (Task 1); Client-Funktionen (Task 2); `bahnhofAlsOrt` (`core/orte.ts`)
- Produces: `GET /api/bahnhof-zum-namen?name=…` →
  - 200 `{ ort: Ort | null }` (`Ort` via `bahnhofAlsOrt`)
  - 400 `{ fehler: 'parameter-fehlt' }` bei leerem `name`, 400 `{ fehler: 'parameter-ungueltig' }` über `HALTNAME_MAX` (100)
  - 503 `{ fehler: 'db-zugang-fehlt' }` bei `FehlendeZugangsdatenError`
  - 502 `{ fehler: 'quelle-ausfall' }` sonst, mit `log.warn({ degradation: 'namensaufloesung-ausfall' })`

- [ ] **Step 1: Failing tests** mit `buildApp({ stations: …, namen: fakeQuelle })`: `Bernau (S)` → `ort.eva === '8013470'`, `ort.verkehrsmittel` `['bahn']`; unbekannter Name → `{ ort: null }`; ohne `name` → 400; 101 Zeichen → 400; Quelle wirft `FehlendeZugangsdatenError` → 503; wirft `Error` → 502.
- [ ] **Step 2: Run** `npx vitest run test/api-bahnhof-zum-namen.test.ts` – FAIL.
- [ ] **Step 3: Implement** Route und Verdrahtung.
- [ ] **Step 4: Run** Testdatei – PASS; dann ganze Backend-Suite `npx vitest run` und `npm run lint` – PASS.
- [ ] **Step 5: Commit** `feat(backend): /api/bahnhof-zum-namen`

---

### Task 4: Ankunftsname am Umstieg und API-Aufruf im Frontend

**Files:**
- Modify: `frontend/src/reise/reisetext.ts` (`Umstieg.anBahnhof: string`, gesetzt aus `ankunft.anBahnhof`)
- Create: `frontend/src/api/bahnhofZumNamen.ts`
- Test: `frontend/src/reise/reisetext.test.ts`, `frontend/src/api/bahnhofZumNamen.test.ts`

**Interfaces:**
- Produces:
  - `Umstieg.anBahnhof: string`
  - `bahnhofZumNamen(name: string): Promise<Ort | null>` – nutzt `holeApi`; jede Abweichung (Netz, 4xx, 5xx, kaputtes JSON) → `null`.

- [ ] **Step 1: Failing tests:** Reisetext mit „An 11:40 Frankfurt(Main)Hbf, Gleis 8“ / „Ab 12:02 Frankfurt(Main)Hbf, Gleis 7“ → `umstiege[0].anBahnhof === 'Frankfurt(Main)Hbf'`; `bahnhofZumNamen` mit gemocktem `holeApi`: 200 `{ort}` → Ort, 200 `{ort:null}` → null, 502 → null, Wurf → null; URL enthält `name=Bernau%20(S)`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/reise/reisetext.test.ts src/api/bahnhofZumNamen.test.ts` – FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(frontend): Ankunftsname am Umstieg, Aufruf bahnhof-zum-namen`

---

### Task 5: Dialog „Reise importieren“ (Entwurf a)

**Files:**
- Modify: `frontend/src/components/ReiseImport.tsx`
- Modify: `frontend/src/App.css` (`.umstieg-wahl` gewählt-Zustand, Fußzeile)
- Test: `frontend/src/components/ReiseImport.test.tsx`

**Interfaces:**
- Consumes: `Umstieg` (Task 4). Props von `ReiseImport` bleiben gleich.

- [ ] **Step 1: Tests anpassen/neu** (alte Erwartungen „Stimmt das?“, „Das wird übernommen“, „Übernehmen“, „N Abschnitte erkannt“ fallen weg):

```ts
it('waehlt den einzigen Umstieg vor und uebernimmt erst auf Bestaetigen', async () => {
  // MIT_EINEM_UMSTIEG einfuegen
  expect(onUebernehmen).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: /Frankfurt\(Main\)Hbf/ })).toHaveProperty('checked', true)
  await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
  expect(onUebernehmen.mock.calls[0][0]).toMatchObject({ bahnhof: 'Frankfurt(Main)Hbf', anGleis: '8', abGleis: '7' })
  expect(onSchliessen).toHaveBeenCalledOnce()
})
it('sperrt Bestaetigen bei mehreren Umstiegen bis zur Wahl', async () => {
  // MIT_VIER_UMSTIEGEN: Bestätigen disabled; radio Frankfurt anklicken → enabled → Klick → anZug 'ICE 74', abZug 'ICE 1134'
})
it('zeigt keinen Zusammenfassungskasten mehr', async () => {
  // nach Einfuegen: kein Text /Stimmt das\?|Welcher Umstieg\?|Abschnitte erkannt/
})
it('Abbrechen und Bestaetigen stehen nebeneinander, Bestaetigen gruen', () => {
  // Bestätigen hat Klasse 'knopf-angekommen'; beide im selben Element mit Klasse 'dialog-knoepfe'
})
it('ohne Umstieg oder bei unlesbarem Text gibt es nur Abbrechen', async () => { /* queryByRole Bestätigen null */ })
```

Bestehende Tests „Gleis unbekannt“, Reisetag-Hinweis, Escape, Abbrechen, Direktverbindung, unlesbar, geteilter Text (dort: nichts übernommen, Fokus nicht im Feld) bleiben und müssen weiter grün sein.

- [ ] **Step 2: Run** `npx vitest run src/components/ReiseImport.test.tsx` – FAIL.
- [ ] **Step 3: Implement:**
  - Kasten „von → nach … Stimmt das?/Welcher Umstieg? … Abschnitte erkannt“ und der Zwischenschritt (`gewaehlt` + „Das wird übernommen“) entfallen.
  - Karten als `<label className="umstieg-wahl">` mit `<input type="radio" name="umstieg" className="nur-vorlesen">` (zugänglicher Name = Karteninhalt); Zustand `gewaehlt: number | null`, vorbelegt mit `0`, wenn genau ein Umstieg erkannt wird (in `verarbeite`, auch für `vorgabe`).
  - Gewählt: Rand `var(--color-gruen)` 2 px und Haken rechts oben (`✓`, `aria-hidden`); Klasse `.umstieg-wahl.gewaehlt`.
  - Fußzeile `<div className="dialog-knoepfe">` (Flex, Abstand 8 px, je Knopf `flex: 1`): `knopf-sekundaer` „Abbrechen“, `knopf-angekommen` „Bestätigen“ (`disabled` ohne Wahl; nur sichtbar, wenn Umstiege erkannt). Bestätigen: `onUebernehmen(umstiege[gewaehlt], reise.datum)`, dann `onSchliessen()`.
  - `.knopf-angekommen:disabled` wie `.knopf-primaer:disabled` (opacity 0.45, cursor not-allowed).
- [ ] **Step 4: Run** – PASS.
- [ ] **Step 5: Commit** `feat(frontend): Reise-Import mit waehlbaren Karten und gruenem Bestaetigen`

---

### Task 6: Bahnhof nach dem Import automatisch wählen

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx` (`uebernimmUmstieg`, Hinweis im `zusatz` der Ortsuche)
- Test: `frontend/src/components/Eingabe.test.tsx` (Block „Eingabe: Reise importieren“; `vi.mock('../api/bahnhofZumNamen', …)`)

**Interfaces:**
- Consumes: `bahnhofZumNamen` (Task 4), `Umstieg.anBahnhof` (Task 4)

- [ ] **Step 1: Tests** (im Import-Block; Klickfolge jetzt Einfügen → „Bestätigen“; Mock-Standard `bahnhofZumNamen` → `null`):

```ts
it('waehlt den aufgeloesten Bahnhof wie einen Tipp in der Liste', async () => {
  aufloesMock.mockResolvedValue(BERLIN)
  // importieren + Bestätigen
  await waitFor(() => expect(feld().value).toBe('Berlin Hbf'))
  expect(screen.queryByText('Bitte Bahnhof antippen')).toBeNull()
  expect(aufloesMock).toHaveBeenCalledWith('Berlin Hbf')
  // Tafeln offen: holeTafelMock aufgerufen mit '8011160'
})
it('zeigt "Bitte Bahnhof antippen", wenn nichts eindeutig ist', async () => {
  // Mock null → Text sichtbar, Vorschlag 'Berlin Hbf' als Knopf; Antippen laesst den Hinweis verschwinden
})
it('versucht nach dem Abfahrtsnamen den Ankunftsnamen', async () => {
  // REISE mit Ankunft 'Berlin Hbf', Abfahrt 'Berlin Hbf (tief)'; Mock: 1. Aufruf null, 2. BERLIN
  // erwartet Aufrufe ['Berlin Hbf (tief)', 'Berlin Hbf'] und Wahl BERLIN
})
it('ueberschreibt keine Eingabe, die waehrend der Aufloesung getippt wurde', async () => {
  // Mock mit zurueckgehaltenem Promise; nach Bestätigen 'Pots' tippen; Promise mit BERLIN aufloesen → feld().value bleibt 'Pots'
})
```

Den bisherigen Test „laesst die Verkehrsstelle weiterhin von der Bahnhofssuche bestimmen“ ersetzt der zweite Test; die übrigen Import-Tests (Gleise, Wagen leeren, Züge) bleiben mit neuer Klickfolge.

- [ ] **Step 2: Run** `npx vitest run src/components/Eingabe.test.tsx` – FAIL.
- [ ] **Step 3: Implement:**
  - `uebernimmUmstieg` setzt alles wie bisher, dann asynchron: `bahnhofZumNamen(u.bahnhof)`, bei `null` und `u.anBahnhof !== u.bahnhof` → `bahnhofZumNamen(u.anBahnhof)`.
  - Übernommen wird das Ergebnis nur, wenn seit dem Import nicht getippt/gewählt wurde: Zähler `importLauf` (`useRef<number>`), erhöht bei jedem Import und in `onText`/`onWahl`; Ergebnis gilt nur bei unverändertem Zähler.
  - Treffer: `setGewaehlt(ort)`, `setSuchtext(ort.name)` – Gleise, Züge und Wagen bleiben wie gesetzt (anders als `onWahl`, das Fahrten leert; hier sind keine gesetzt).
  - Kein Treffer: Zustand `bahnhofAntippen = true` → im `zusatz` vor den übrigen Hinweisen `<div className="hinweis-box">Bitte Bahnhof antippen</div>`; zurückgesetzt bei `onText`, `onWahl` und neuem Import.
- [ ] **Step 4: Run** Testdatei – PASS; danach ganze Frontend-Suite `npx vitest run` und `npm run lint` – PASS.
- [ ] **Step 5: Commit** `feat(frontend): Bahnhof nach dem Reise-Import ueber den offiziellen Namen waehlen`

---

### Task 7: Simulation „Bahnhof über andere offizielle Namen“

**Files:**
- Create: `backend/scripts/simulation-bahnhofsnamen.ts`
- Ausgabe: `backend/osm-ablage/bahnhofsnamen/` (gitignored): `rohdaten.json` (Zwischenstand, Wiederaufnahme), `ergebnis.json`, `ergebnis.md`

**Interfaces:**
- Consumes: `loeseBahnhofsnamen`, `normalisiereBahnhofsname` (Task 1); `sucheBahnhoefeMitGruppen`, `holeAmtlicheNamen` (Task 2); `epStadaStationen` (StaDa); `ladeSecrets`.

Ablauf (Aufruf: `npx tsx scripts/simulation-bahnhofsnamen.ts [--kategorien 1-4] [--grenze N]`):

1. StaDa-Bahnhöfe der Kategorien laden (wie `bestand-fuellen.ts`); je Bahnhof die Haupt-EVA (`evaNumbers` mit `isMain`).
2. Je Bahnhof: `sucheBahnhoefeMitGruppen(name)` → den Eintrag mit dieser EVA oder dessen Gruppe finden (= Soll-Bahnhof); fehlt er → Kategorie `nicht-in-suche`.
3. Namen sammeln: führende Namen + `holeAmtlicheNamen` je Mitglied. „Andere Namen“ = Mitgliedsnamen, die normalisiert keinem führenden Namen gleichen.
4. Jeden Namen (führend und anders) durch `loeseBahnhofsnamen` mit einer Quelle aus den Task-2-Funktionen (gecacht im Skript) schicken; Ergebnis je Name: `richtig` (Soll-EVA), `falsch` (andere EVA), `keins`.
5. Vergleichswert alt: vor der Änderung wurde nie automatisch gewählt (0 %); zusätzlich Ansatz B zum Vergleich: Klammerzusatz abschneiden (`haltnamenZurSuche` aus `core/haltname.ts`) und nur bei genau einem Bahnhof wählen – `richtig`/`falsch`/`keins`.
6. Takt: RIS::Stations höchstens 50 Abrufe je Minute (Abstand 1 200 ms), nach 429 Pause 65 s (wie `simulation-zugspitze.ts`); Zwischenstand je Bahnhof in `rohdaten.json`, beim Neustart übersprungen.
7. Bericht `ergebnis.md`: Anzahl Bahnhöfe, Bahnhöfe mit mehreren Verkehrsstellen, Bahnhöfe mit anderen Namen, je Namensart (führend / anders) die Quoten richtig/falsch/keins für Ansatz A und B, alle `falsch`-Fälle und die ersten 30 `keins`-Fälle mit Namen.

- [ ] **Step 1:** Skript schreiben; Probelauf `npx tsx scripts/simulation-bahnhofsnamen.ts --grenze 5` – Expected: `ergebnis.md` mit 5 Bahnhöfen und allen Quoten; dann `--grenze 5` erneut – Expected: alle 5 aus `rohdaten.json` übersprungen, keine neuen Abrufe.
- [ ] **Step 2:** Volllauf im Hintergrund (Start-Process, Rechner nicht in Energiesparmodus); Fortschritt über `rohdaten.json`.
- [ ] **Step 3:** Jeder `falsch`-Fall in A ist ein Fehler der Regel → zurück zu Task 1 (Test mit diesem Fall), nicht im Skript wegerklären.
- [ ] **Step 4: Commit** nur das Skript: `chore(backend): Simulation Bahnhofsaufloesung ueber offizielle Namen`

---

### Task 8: README nachziehen

**Files:**
- Modify: `README.md` (Abschnitt iOS-App: Stand Bau 3 vom 18.11.2026, Vereinbarungen PLA + App Store Connect als Stolperstein; Punkt A: Import-Befunde; neuer Kurzabschnitt Reise-Import mit Simulationsergebnis)

- [ ] **Step 1:** Abschnitte schreiben, Zahlen aus `ergebnis.md` übernehmen.
- [ ] **Step 2: Commit** `docs: README - Reise-Import mit Namensaufloesung, Bau 3, Simulation`
