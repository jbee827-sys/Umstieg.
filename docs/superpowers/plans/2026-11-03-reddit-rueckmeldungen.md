# Reddit-Rückmeldungen umsetzen – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Rückmeldungen G1–G5 und B.1 aus `Umstieg_Konzepte/08-reddit-auswertung-wegfuehrung.md` generisch umsetzen – realistische Aufzug- und Stoppzeiten, einheitliche Gleisnamen, Gleisarten mit Reitern auf den Bahnhofsseiten, ein Schema in echter Lage, eine Ampel ab Ankunft.

**Architecture:** Fast alles liegt im Backend-Kern (`backend/src/core/`): Zeitmodell in `gehzeit.ts`, Graphbau in `graph.ts`, Routing in `routing.ts`, Schema in `schema.ts`. Das Frontend spiegelt Typen (`frontend/src/api/typen.ts`) und ändert Ampel, Fußzeile und Bahnhofsseite. Die Bahnhofsseiten werden offline aus dem OSM-Bestand plus neu abgelegten DB-Gleislisten gerechnet.

**Tech Stack:** Node ≥ 20, TypeScript strict, Fastify 5, vitest; React + Vite; Daten aus OSM (Overpass/Bestand), RIS::Stations, FaSta, Transitous (MOTIS).

**Spec:** `docs/superpowers/specs/2026-11-03-reddit-rueckmeldungen-design.md` – vor jeder Aufgabe den zugehörigen Abschnitt lesen.

## Global Constraints

- Jede Regel gilt für alle Bahnhöfe; kein Code-Sonderfall für einen einzelnen Bahnhof.
- Der Router minimiert genau die Zeit, die angezeigt wird: Routing, `gehzeitSek`, Schrittsekunden und Ampel rechnen mit derselben Funktion. Invariante: Summe der `schritte[].sekunden` = `gehzeitSek`.
- Kantenkosten bleiben ≥ 0 (Dijkstra).
- Aufzug: `AUFZUG_SEK_JE_EBENE = 10`, `AUFZUG_TUEREN_SEK = 15`; Warten = Spanne × 10 + 15, Fahrt = |Δ| × 10 + 15.
- Stopp: `STOPP_AUFENTHALT_SEK = 300` (WC und Kiosk gleich).
- Kein Weg wird stufenfrei, der Stufen hat; keine neue Route über Gleise (Basis `backend/osm-ablage/laeufe/gleise-basis-0311.json`: 169 von 14.812).
- Aus einer unvollständigen DB-Gleisliste (`gleislisteUnvollstaendig`) wird nichts geschlossen.
- Tests: Backend und Frontend **nacheinander, nie parallel**. Backend `cd backend && npx vitest run <datei>`, Frontend `cd frontend && npx vitest run <datei>`.
- Commits: Autor Julian, **keine** Claude-Kennzeichnung (kein `Co-Authored-By`, kein „Generated with“). Zweig `fix/offene-punkte`. Kein Deploy, kein Push auf `main` ohne Julians Freigabe.
- Zwischenergebnisse und Diagnoseskripte nur unter `backend/osm-ablage/` (gitignored), nie im Temp-Scratchpad.
- Schlüssel nur über `ladeSecrets()` (`backend/scripts/secrets.ts`); kein Schlüsselwert in Ausgabe, Datei oder Commit.
- Netzabfragen an Transitous laufen in der Sandbox nicht; vor jeder solchen Abfrage Julian fragen.

## Review Focus

1. **Mitternacht:** Ankunft 23:58, Abfahrt 00:10 – `heuteUm` legt beide auf heute; die neue Ampel darf daraus nicht „nicht erreichbar“ machen. → Test in Task 12.
2. **Aufzug, an dem im Graphen nur eine Ebene anschließt:** Schacht-Tag `-2;-1;0;1;2`, aber nur Ebene 0 hat Wege – es darf keine Kante, kein Absturz und keine Division entstehen. → Test in Task 3.
3. **Gestörter Aufzug über mehrere Ebenen:** FaSta meldet INACTIVE; keine einzige Kante desselben Schachts darf auf der stufenfreien Route bleiben. → Test in Task 4.
4. **Teilgleis mit Schreibvariante an einem Bahnhof ohne DB-Liste** (`dbGleise` fehlt): „7 G–I“ mit Gedankenstrich bei Graphgleis „7G-I“ – Normalform muss auch ohne RIS greifen. → Test in Task 1.
5. **„Mit Stopp“ am selben Bahnsteig** (Start und Ziel gleich, POI auf dem Weg): genau ein Stopp-Schritt, 300 s gezählt, keine doppelte Zählung. → Test in Task 5.

---

### Task 1: Gleisnamen in Normalform vergleichen (Spec 6.1)

**Files:**
- Create: `backend/src/core/gleisname.ts`
- Modify: `backend/src/core/routing.ts` (`loeseGleis`, `istKopfgleis`, `evasVonGleis`)
- Test: `backend/test/routing.test.ts`

**Interfaces:**
- Produces: `normGleis(name: string): string` – entfernt Leerzeichen, ersetzt `‐ ‑ ‒ – — −` durch `-`, wandelt in Kleinbuchstaben. `gleichesGleis(a: string, b: string): boolean`.

- [ ] **Step 1: Failing tests**
```ts
describe('normGleis', () => {
  it('Teilgleise gleich, egal wie geschrieben', () => {
    expect(normGleis('7 G–I')).toBe(normGleis('7G-I'));
    expect(normGleis('1 A-B')).toBe('1a-b');
  });
});
it('loeseGleis findet RIS-Teilgleis trotz Leerzeichen', () => {
  // Graph mit Gleis "7"; dbGleise: { gleis: '7G-I', ris: { name: '7G-I', parentPlatform: '7' } }
  expect(loeseGleis(graph, '7 G-I', dbGleise).gleis).toBe('7');
});
it('loeseGleis ohne DB-Liste: Graphgleis "7G-I" auf Anfrage "7 G–I"', () => {
  expect(loeseGleis(graphMitGleis('7G-I'), '7 G–I').gleis).toBe('7G-I');
});
```
- [ ] **Step 2:** `cd backend && npx vitest run test/routing.test.ts` → FAIL (`normGleis` nicht definiert).
- [ ] **Step 3:** `gleisname.ts` anlegen; in `routing.ts` jeden Namensvergleich (`graph.gleise.includes`, `g.gleis === gleis`, `eintrag.gleis === gleis`) über `gleichesGleis`. Rückgabe ist immer die Schreibweise des Graphen.
- [ ] **Step 4:** Test → PASS; ganze Backend-Suite `cd backend && npx vitest run` → PASS.
- [ ] **Step 5:** `git commit -m "fix(backend): Gleisnamen ohne Schreibweise vergleichen (7 G-I = 7G-I)"`

---

### Task 2: Zeitmodell für Aufzüge (Spec 4.1)

**Files:**
- Modify: `backend/src/core/typen.ts` (`GraphKante`)
- Modify: `backend/src/core/gehzeit.ts`
- Modify: `backend/src/core/textgen.ts:117` (Zuschlag je Kante)
- Test: `backend/test/gehzeit.test.ts`

**Interfaces:**
- Produces in `GraphKante`: `schachtSpanne?: number` (max − min der Schachtebenen), `anlageSchluessel?: string` (OSM-Kennung `n<id>`/`w<id>`, beim Synthesemodell = `anlageId`).
- Produces in `gehzeit.ts`: `AUFZUG_SEK_JE_EBENE = 10`, `AUFZUG_TUEREN_SEK = 15`, `zuschlagSekunden(kante: Pick<GraphKante, 'typ' | 'deltaLevel' | 'schachtSpanne'>): number`. Für `aufzug`: `spanne * 10 + 15 + |deltaLevel| * 10 + 15` mit `spanne = schachtSpanne ?? |deltaLevel|`; sonst `ZUSCHLAG[typ] ?? 0` (treppe 20, rolltreppe 10). `ZUSCHLAG.aufzug` entfällt.
- `kantenZeitSekunden`, `gehzeitSekunden` und `textgen.ts` (`haenge`) benutzen `zuschlagSekunden`; `verteileGehzeit` nimmt `segment.zuschlagSek`, als Rückfall `zuschlagSekunden(segment)` statt `ZUSCHLAG[segment.typ]`.

- [ ] **Step 1: Failing tests** (alten Test „Aufzug +60“ ersetzen)
```ts
it('Aufzug zwei Ebenen: 50 s', () => {
  expect(zuschlagSekunden({ typ: 'aufzug', deltaLevel: 1 })).toBe(50);
});
it('Aufzug -2 → +1 im Schacht -2..2: Warten 55 + Fahrt 45 = 100 s', () => {
  expect(zuschlagSekunden({ typ: 'aufzug', deltaLevel: 3, schachtSpanne: 4 })).toBe(100);
});
it('halbe Ebene zählt halb', () => {
  expect(zuschlagSekunden({ typ: 'aufzug', deltaLevel: 0.5, schachtSpanne: 0.5 })).toBe(40);
});
it('Treppe 20, Rolltreppe 10, Rampe 0 unverändert', () => { /* … */ });
```
- [ ] **Step 2:** `cd backend && npx vitest run test/gehzeit.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren wie in Interfaces.
- [ ] **Step 4:** `cd backend && npx vitest run` → Tests, die 60 s pro Aufzugkante erwarten (`textgen`, `routing`, `api`, `synthmodell`), auf die neue Formel umstellen; jede geänderte Erwartung im Testtext begründen. → PASS.
- [ ] **Step 5:** `git commit -m "feat(backend): Aufzugzeit aus Warten und Fahrt statt 60 s je Kante"`

---

### Task 3: Aufzug als Schacht im Graphen (Spec 4.1)

**Files:**
- Modify: `backend/src/core/graph.ts` (Pass C ab Zeile ~611; Ebenenwechsel-Wege in Pass B; Verbindungskanten um Zeile ~400 in der Naht-Logik)
- Modify: `backend/src/core/synthmodell.ts` (Aufzugkanten: `anlageSchluessel = anlageId`)
- Test: `backend/test/graph.test.ts`, `backend/test/textgen.test.ts`

**Interfaces:**
- Consumes: `schachtSpanne`, `anlageSchluessel` aus Task 2.
- Produces: Jeder Aufzug ist eine Clique. Für jedes Paar von Ebenen, an denen ein Knoten existiert, gibt es genau eine Kante `typ: 'aufzug'` mit `schachtSpanne` = max − min der Ebenen aus dem `level`-Tag (enthält der Tag weniger als zwei Ebenen: die Ebenen der Knoten) und `anlageSchluessel` = `n<osmId>` bzw. `w<wayId>`. Treppen- und Rolltreppen-Wege bekommen `anlageSchluessel = w<wayId>`.

- [ ] **Step 1: Failing tests** (Overpass-Fixture inline: Aufzugknoten `level=-2;-1;0;1;2`, Fußwege auf −2, 0 und 1)
```ts
it('Schacht: direkte Kante -2 ↔ 1, Spanne 4', () => {
  const k = aufzugKanten(graph);               // Hilfsfunktion im Test
  expect(k).toHaveLength(3);                   // -2↔0, -2↔1, 0↔1
  expect(k.every((x) => x.schachtSpanne === 4 && x.anlageSchluessel === 'n42')).toBe(true);
});
it('Route -2 → 1 nimmt EINE Aufzugkante', () => {
  expect(pfad.kanten.filter((x) => x.typ === 'aufzug')).toHaveLength(1);
});
it('ein Schritt: "Aufzug zur Ebene 1"', () => {
  expect(generiereSchritte(pfad).filter((s) => s.typ === 'aufzug').map((s) => s.text)).toEqual(['Aufzug zur Ebene 1']);
});
it('Aufzug mit nur einer angebundenen Ebene: keine Kante, kein Fehler', () => { /* Review Focus 2 */ });
it('Aufzug-Weg erzeugt keine kostenlose Rampe zwischen seinen Ebenen', () => { /* highway=elevator als Way, level=0;1 */ });
```
- [ ] **Step 2:** `cd backend && npx vitest run test/graph.test.ts test/textgen.test.ts` → FAIL.
- [ ] **Step 3:** Pass C auf Clique umbauen; Aufzug-Wege (Pass B, `istEbenenwechselWeg`) ebenso mit `schachtSpanne`; in der Naht-Logik keine `rampe`-Kante mit `laengeM: 0` für `highway=elevator`-Wege mehr anlegen (die Clique ersetzt sie).
- [ ] **Step 4:** Ganze Backend-Suite → PASS. Danach Berlin nachrechnen: `npx tsx osm-ablage/diagnose/reddit.ts 8011160 2 12` → schnellste bleibt Aufzug, ein Aufzugschritt, Gehzeit < 339 s.
- [ ] **Step 5:** `git commit -m "feat(backend): Aufzug als Schacht - eine Fahrt, eine Kante, ein Schritt"`

---

### Task 4: FaSta-Status je Anlage (Spec 4.1)

**Files:**
- Modify: `backend/src/core/synthmodell.ts` (`wendeFastaAn`, Zeile ~331)
- Test: `backend/test/synthmodell.test.ts` oder `backend/test/fasta.test.ts` (dort, wo `wendeFastaAn` heute getestet wird)

**Interfaces:**
- Consumes: `anlageSchluessel` (Task 3).
- Produces: Trifft Weg 2 (Entfernung) eine Kante, bekommen alle Kanten mit demselben `anlageSchluessel` denselben Status.

- [ ] **Step 1: Failing test** – Schacht wie in Task 3, FaSta-Anlage `AUFZUG`, `INACTIVE`, 3 m neben dem Knoten:
```ts
expect(aufzugKanten(graph).every((k) => k.status === 'INACTIVE')).toBe(true);
expect(berechneRoute(graph, start, ziel, 'barrierefrei')).toBeNull();
```
- [ ] **Step 2:** Test → FAIL (nur eine Kante INACTIVE).
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Test und Suite → PASS.
- [ ] **Step 5:** `git commit -m "fix(backend): gestoerter Aufzug sperrt den ganzen Schacht"`

---

### Task 5: Mit Stopp – 5 Minuten Aufenthalt (Spec 4.2)

**Files:**
- Modify: `backend/src/core/typen.ts` (`RoutenPfad`, `Schritt.typ`)
- Modify: `backend/src/core/gehzeit.ts`, `backend/src/core/routing.ts` (`routeMitStopp`), `backend/src/core/textgen.ts`
- Modify: `frontend/src/api/typen.ts` (`Schritt.typ`), `frontend/src/components/Schrittliste.tsx` (Darstellung `stopp`)
- Test: `backend/test/routing.test.ts`, `backend/test/textgen.test.ts`, `frontend/src/components/Schrittsheet.test.tsx` (oder der Test, der `Schrittliste` abdeckt)

**Interfaces:**
- Produces: `STOPP_AUFENTHALT_SEK = 300` in `gehzeit.ts`. `RoutenPfad.stopp?: { knotenIndex: number; art: 'wc' | 'kiosk'; sekunden: number }`. `gehzeitSekunden` addiert `pfad.stopp?.sekunden ?? 0`. `Schritt.typ` erweitert um `'stopp'`.
- `generiereSchritte` fügt nach dem Schritt, der am POI endet, ein: `{ typ: 'stopp', text: '5 min Stopp: WC' | '5 min Stopp: Kiosk', sekunden: 300, level: <Ebene des POI>, knotenVon: i, knotenBis: i }`. Kein `distanzM`. Der Stopp-Schritt wird nie mit Nachbarn zusammengefasst.

- [ ] **Step 1: Failing tests**
```ts
it('mit-stopp: 300 s zusätzlich', () => {
  const ohne = gehzeitSekunden({ ...pfad, stopp: undefined }, 'normal');
  expect(gehzeitSekunden(pfad, 'normal')).toBe(ohne + 300);
});
it('genau ein Stopp-Schritt, Summe der Schritte = gehzeitSek', () => {
  const s = generiereSchritte(pfad, { profil: 'normal' });
  expect(s.filter((x) => x.typ === 'stopp').map((x) => x.text)).toEqual(['5 min Stopp: WC']);
  expect(s.reduce((a, x) => a + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(pfad, 'normal'));
});
it('Stopp-Schritt bricht keinen Ebenenlauf (besuchJeSchritt)', () => { /* level des Stopps = level davor */ });
```
Frontend: Ein Schritt `typ: 'stopp'` wird mit seinem Text angezeigt und zählt nicht als Ebenenwechsel.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. `routeMitStopp` setzt `stopp` mit dem Index des POI im zusammengesetzten Pfad und `art` aus `poi.poi`.
- [ ] **Step 4:** Backend-Suite, danach Frontend-Suite (nacheinander) → PASS.
- [ ] **Step 5:** `git commit -m "feat: Mit Stopp plant 5 Minuten Aufenthalt ein"`

---

### Task 6: Schema in echter Lage – Mittellinie, Reihenfolge, Zugänge (Spec 6.4)

**Files:**
- Create: `backend/src/core/mittellinie.ts`
- Modify: `backend/src/core/typen.ts` (`StationGraph.bahnsteigLinien?: Map<string, { lat: number; lon: number }[]>`)
- Modify: `backend/src/core/graph.ts` (Pass D: Linie je Bahnsteig speichern; `kopiereGraph` übernimmt sie)
- Modify: `backend/src/core/schema.ts` (`ordneQuer`, `aufAchse` für Zugänge, `zugangQuerGrenze`)
- Test: `backend/test/schema.test.ts`

**Interfaces:**
- Produces: `mittellinie(umriss: { lat: number; lon: number }[]): { lat: number; lon: number }[]` – für Flächen: Punkte auf die Hauptachse (größte Ausdehnung) projizieren, in Fächer zu 10 m teilen, je Fach den Mittelpunkt zwischen kleinstem und größtem Querwert; für Linien (`platform` als Linie, `platform_edge`): die Linie selbst.
- Produces: `querLagen(linien: Map<string, Punkt[]>): Map<string, number>` in `mittellinie.ts` – Algorithmus unten.
- `bahnsteigLinien` ist im Synthesemodell leer → Schema fällt auf die heutige Sehne (`anfang`/`ende`) zurück.

Algorithmus `querLagen` (die Signatur legt ihn nicht fest):
```
für jedes Paar (A, B): an jedem 10-m-Fach, in dem beide Linien Punkte haben,
  d = vorzeichenbehafteter Abstand von B zur Linie A, Vorzeichen bezogen auf
      die gemeinsame Hauptrichtung (links = positiv);
  d_AB = Median der d; Paar nur, wenn ≥ 3 Fächer überlappen.
Lagen x bestimmen: minimiere Σ (x_B − x_A − d_AB)² über alle Paare
  (Gauss-Seidel, 50 Durchläufe, Start = heutige Projektion der Mitte).
Bahnsteige ohne Paar: heutige Projektion.
```

- [ ] **Step 1: Failing tests** – aus dem echten Bestand (`backend/osm-bestand/8000323.json.gz`, Saarbrücken Hbf), Route 12→14:
```ts
it('Saarbrücken: Reihenfolge folgt der Lage, nicht der Nummer', () => {
  const ordnung = gleisfolgeDerEbene(schema, 1);           // Gleise in Schema-Reihenfolge
  const pos = (g: string) => ordnung.indexOf(g);
  const gruppen = [['1'], ['2', '3'], ['5', '6'], ['8'], ['11', '12'], ['14', '16']];
  // monoton in einer der beiden Richtungen
  expect(istMonoton(gruppen.map((g) => g.map(pos)))).toBe(true);
});
it('Saarbrücken: Gleis 12 hat nicht die Zugänge von 14/16', () => {
  expect(zugaengeVon(schema, '12')).not.toEqual(zugaengeVon(schema, '14'));
});
it('Berlin Hbf tief: Gleis 22 bleibt neben 7/8', () => { /* bestehender Test muss weiter grün sein */ });
```
- [ ] **Step 2:** `cd backend && npx vitest run test/schema.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren. Zugänge: Querabstand zur Mittellinie statt zur Sehne; `zugangQuerGrenze` ohne den Krümmungszuschlag, wenn eine Mittellinie da ist.
- [ ] **Step 4:** Suite → PASS. Messung: Diagnoseskript `osm-ablage/diagnose/schema-reihenfolge.ts` schreibt je Bahnhof und Ebene die Reihenfolge vor/nach (vorher mit `git stash` erzeugen) → Zahl der Bahnhöfe mit geänderter Reihenfolge notieren, jeden geänderten Bahnhof mit `osm-ablage/diagnose/bahnsteiglage.ts` gegenprüfen.
- [ ] **Step 5:** `git commit -m "fix(backend): Ebenenschema ordnet Bahnsteige nach ihrer echten Lage"`

---

### Task 7: Anlagen je Anlage zählen, Fußzeile nur mit genutzter Anlage (Spec 6.4, 6.5)

**Files:**
- Modify: `backend/src/core/schema.ts` (`zugaengeFuer`, `zaehleAnlagen`)
- Modify: `frontend/src/schema/bandtext.ts` (`fusstext`)
- Test: `backend/test/schema.test.ts`, `frontend/src/schema/bandmodell.test.ts` (dort steht der Test für `fusstext`, sonst neu `bandtext.test.ts`)

**Interfaces:**
- Consumes: `anlageSchluessel` (Task 3).
- Produces: Zählung über `anlageSchluessel ?? anlageId ?? '<von>|<nach>'`, jede Anlage einmal je Bahnsteig.

- [ ] **Step 1: Failing tests**
```ts
// Backend: Schacht über 5 Ebenen am Bahnsteig → zahl.aufzug === 1
// Frontend:
expect(fusstext(bandMitTreppeBei195UndDreiTreppenDreiAufzuegen)).toBe('Treppe hinunter bei 195 m');
```
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Backend zählen je Anlage; in `fusstext` die Aufzählung `anlagen` streichen (Zeilen mit `mehrzahl(...)`); die Zeichnung der Zugänge bleibt.
- [ ] **Step 4:** Backend-Suite, danach Frontend-Suite → PASS.
- [ ] **Step 5:** `git commit -m "fix: Anlagen einmal zaehlen, Fusszeile nennt nur die genutzte"`

---

### Task 8: S-Bahn-Verkehrsstellen aus RIS (Spec 6.2)

**Files:**
- Modify: `backend/src/clients/stations.ts` (`StopPlace`, `ermittleGruppe`, `holeStationsInfo`)
- Modify: `backend/src/core/typen.ts` (`StationsInfo`)
- Test: `backend/test/stations.test.ts`, Fixture unter `backend/test/fixtures/db/`

**Interfaces:**
- Produces: `StopPlace.availableTransports?: string[]`; `StationsInfo.sbahnEvas?: string[]` – die Mitglieder der Gruppe, deren Eintrag in der Suchantwort `availableTransports` hat und darin ausschließlich `CITY_TRAIN`. Fehlt ein Mitglied in der Suchantwort, steht es nicht in `sbahnEvas`.

- [ ] **Step 1:** Prüfen, ob die Namenssuche je Mitglied `availableTransports` trägt: eine echte Antwort (München Hbf) mit `ladeSecrets()` holen und als Fixture ablegen (`stopplaces-muenchen-hbf.json`; nur RIS-Daten, kein Schlüssel). Trägt sie es nicht: `sbahnEvas` entfällt, Task 9 nutzt nur die OSM-Regel – im Commit vermerken.
- [ ] **Step 2: Failing test:** `expect(info.sbahnEvas).toEqual(['8098263'])` für die Fixture.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Suite → PASS.
- [ ] **Step 5:** `git commit -m "feat(backend): S-Bahn-Verkehrsstellen aus RIS::Stations"`

---

### Task 9: Gleisarten im Graphen – Züge, S-Bahn, U-Bahn; DB-Namen per IFOPT (Spec 6.2, 6.3)

**Files:**
- Modify: `backend/src/core/typen.ts` (`StationGraph`, `GraphKnoten`)
- Modify: `backend/src/core/graph.ts` (`baueGraph`, `istEisenbahnsteig`, IFOPT-Block Zeile ~798)
- Modify: `backend/src/routes/api.ts` (`baueGraphEintrag`: Kontext übergeben)
- Test: `backend/test/graph.test.ts`, `backend/test/gleisliste.test.ts`

**Interfaces:**
- Consumes: `StationsInfo.sbahnEvas` (Task 8), `normGleis` (Task 1).
- Produces: `baueGraph(osmRoh, dbGleise?, kontext?: GraphKontext)` mit `interface GraphKontext { gleislisteVollstaendig: boolean; sbahnEvas?: string[] }`.
- Produces in `StationGraph`: `gleisArt?: Map<string, 'zug' | 'sbahn'>` (für jedes Gleis in `gleise`; fehlt die Angabe → `'zug'`), `ubahnSteige?: UbahnSteig[]` mit `interface UbahnSteig { id: string /* bahnsteigId */; label: string; name?: string /* OSM name */ }`.
- Produces in `GraphKnoten`: `ubahnSteig?: string` (= `UbahnSteig.id`) an den Knoten `ubahn<id>:anfang|mitte|ende`. Diese Knoten tragen KEIN `gleis`; `graph.gleise` enthält keine U-Bahn-Steige.

Regeln (Spec 6.2):
- U-Bahn: `subway=yes` ohne `train=yes`; außerdem `light_rail=yes` unter der Erde (`level` < 0, `tunnel=yes` oder `location=underground`), wenn `kontext.gleislisteVollstaendig` und kein DB-Gleis per IFOPT oder `normGleis`-Namen auf den Bahnsteig fällt.
- S-Bahn (eng): Gleis eines Bahnsteigs, dessen DB-Gleis nur unter `sbahnEvas` geführt wird, ODER OSM-Bahnsteig mit Linien ausschließlich `S\d+` in `route_ref`/`description`, ODER `light_rail=yes` mit DB-Gleis. Sonst `zug`.
- DB-Namen: Fallen per IFOPT DB-Gleise auf einen Bahnsteig und ist die Liste vollständig, werden dessen OSM-Nummern entfernt, die die DB an diesem Bahnhof nicht führt (München „81;82“ → „1“, „2“).
- `label`: Linien aus `route_ref` oder aus `description` (`U\d+`-Folgen, z. B. „U1 U2 U7 U8“); sonst `U-Bahn-Steig <ref>`.

- [ ] **Step 1: Failing tests** (aus `osm-bestand/8000261.json.gz` plus DB-Gleise aus `osm-ablage/db-roh/8000261.json`, im Test als kleine Fixture nachgebaut)
```ts
it('München Hbf: 51–56 keine Gleise, drei U-Bahn-Steige', () => {
  expect(graph.gleise.some((g) => Number(g) >= 51 && Number(g) <= 56)).toBe(false);
  expect(graph.ubahnSteige!.map((s) => s.label).sort()).toEqual(['U1 U2 U7 U8', 'U1 U2 U7 U8', 'U4 U5']);
});
it('München Hbf tief: DB-Namen 1/2 statt 81/82, Art S-Bahn', () => {
  expect(graph.gleise).toContain('1');
  expect(graph.gleise).not.toContain('81');
  expect(graph.gleisArt!.get('1')).toBe('sbahn');
});
it('unvollständige Liste: light_rail bleibt wie heute', () => { /* kontext.gleislisteVollstaendig = false */ });
it('Berlin-S-Bahn (light_rail mit DB-Gleis) bleibt Gleis, Art S-Bahn', () => { /* kleine Fixture */ });
```
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren; `baueGraphEintrag` übergibt `{ gleislisteVollstaendig: !gleislisteUnvollstaendig(info), sbahnEvas: info.sbahnEvas }`.
- [ ] **Step 4:** Backend-Suite → PASS. Gleisprüfung: `cd backend && npx tsx scripts/gleiskreuzung-pruefung.ts osm-ablage/laeufe/gleise-task9.json osm-ablage/laeufe/gleise-basis-0311.json` → keine neue Kreuzung; die Zahl der Routen sinkt nur um entfallene U-Bahn-Paare.
- [ ] **Step 5:** `git commit -m "feat(backend): Gleisarten Zuege/S-Bahn/U-Bahn, DB-Namen ueber IFOPT"`

---

### Task 10: DB-Gleislisten ablegen, Bahnhofsseiten-Daten mit Arten (Spec 6.2, 6.3)

**Files:**
- Create: `backend/scripts/db-gleise-fuellen.ts`
- Modify: `backend/scripts/bahnhofsseiten-daten.ts`
- Modify: `frontend/src/bahnhofsseiten/typen.ts` (Spiegel)
- Test: `backend/test/bahnhofsseiten-daten.test.ts`

**Interfaces:**
- Consumes: `baueGraph(…, kontext)`, `gleisArt`, `ubahnSteige` (Task 9); `holeStationsInfo` (Task 8).
- Produces: Ablage `backend/osm-ablage/db-gleise/<schluessel>.json` = die `StationsInfo` (ohne Schlüssel), gitignored. `db-gleise-fuellen.ts` holt sie für jeden Eintrag in `osm-bestand/`, überspringt vorhandene, Pausen wie `bestand-fuellen.ts` (`PAUSE_DB_MS = 1500`), Schlüssel über `ladeSecrets()`.
- Produces in `Bahnhofsdaten`: `gleisArt: Record<string, 'zug' | 'sbahn'>`, `ubahn: { id: string; label: string; paare: Gleispaar[] }[]` (je Steig ein `Gleispaar` je Gleis, `von` = Steig-`label`, `nach` = Gleis; Route vom Knoten `ubahn<id>:mitte`).
- `berechneBahnhof(eintrag, graph, ohne, db?: StationsInfo)`; ohne Ablage → wie heute, mit Warnung im Lauf.
- U-Bahn-Steig zählt nur, wenn im Graphen von einem Gleis erreichbar UND `namensSchluessel(steig.name)` (`core/orte.ts`) zum Bahnhof passt; „Hbf“ = „Hauptbahnhof“, Zusätze `Nord`/`Süd`/`Ost`/`West` erlaubt. `fremdeGleise` behandelt U-Bahn-Steige wie Gleise (gleiche Mitte, 10 m).

- [ ] **Step 1: Failing tests**
```ts
it('München Hbf: gleisArt 1/2 sbahn, ubahn mit 3 Steigen', () => { /* … */ });
it('Hamburg Hbf: Mönckebergstraße fällt heraus, Hauptbahnhof Nord/Süd bleiben', () => { /* Namensregel */ });
it('ohne DB-Ablage: Daten wie heute, ubahn aus OSM subway=yes', () => { /* … */ });
```
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS. Dann die Ablage einmal füllen: `cd backend && npx tsx scripts/db-gleise-fuellen.ts` (echte DB-Anfragen; vorher Julian Bescheid geben, Laufzeit ca. 382 × 1,5 s × Mitglieder). Ergebnis: Zahl der Bahnhöfe mit Ablage melden.
- [ ] **Step 5:** `git commit -m "feat(bahnhofsseiten): DB-Gleislisten und Gleisarten in den Seitendaten"` (die Ablage selbst bleibt ungetrackt)

---

### Task 11: Reiter auf der Bahnhofsseite, Satz zur Auswahl (Spec 6.2, 7.3)

**Files:**
- Modify: `frontend/src/bahnhofsseiten/Bahnhofsseite.tsx`, `frontend/src/bahnhofsseiten/bahnhofsseiten.css`, `frontend/src/bahnhofsseiten/texte.ts`
- Test: `frontend/src/bahnhofsseiten/seiten.test.ts` (oder neuer `Bahnhofsseite.test.tsx`)

**Interfaces:**
- Consumes: `Bahnhofsdaten.gleisArt`, `Bahnhofsdaten.ubahn` (Task 10).
- Produces: Reiterleiste `role="tablist"` mit `Züge`, `S-Bahn`, `U-Bahn` – nur Arten, die es gibt; nur eine Art → keine Leiste. Alle Reiterinhalte stehen im vorgerenderten HTML (inaktive mit `hidden`), damit die statischen Seiten den Inhalt behalten. „Züge“/„S-Bahn“: die heutigen Blöcke „Ankunft Gleis X“ für Ankunftsgleise ihrer Art, Zeilen zu allen Gleisen. „U-Bahn“: je Steig ein `<details>` „U-Bahn {label}“ mit derselben Tabelle (Abfahrt/Gehzeit/Weg/Stufenfrei).
- Copy (fest): unter der Einleitung bzw. in den Häufigen Fragen: „Vorab berechnet sind die Bahnhöfe der DB-Preisklassen 1 bis 3. Für jeden anderen Bahnhof rechnet die App den Weg live.“

- [ ] **Step 1: Failing tests**
```ts
it('München Hbf: drei Reiter, Züge aktiv', () => { /* getAllByRole('tab') → ['Züge','S-Bahn','U-Bahn'] */ });
it('nur Züge: keine Reiterleiste', () => { /* queryByRole('tablist') === null */ });
it('U-Bahn-Inhalt steht im HTML, auch wenn der Reiter nicht aktiv ist', () => { /* renderToString enthält "U4 U5" */ });
it('Satz zur Auswahl steht auf jeder Seite', () => { /* … */ });
```
- [ ] **Step 2:** `cd frontend && npx vitest run src/bahnhofsseiten` → FAIL.
- [ ] **Step 3:** Implementieren (Tastatur: Pfeiltasten zwischen Reitern, `aria-selected`, `aria-controls`).
- [ ] **Step 4:** Frontend-Suite → PASS; `cd frontend && npm run build` → die statischen Seiten entstehen ohne Fehler.
- [ ] **Step 5:** `git commit -m "feat(bahnhofsseiten): Reiter Zuege/S-Bahn/U-Bahn und Satz zur Auswahl"`

---

### Task 12: Ampel rechnet ab Ankunft (Spec 7.1)

**Files:**
- Modify: `frontend/src/navigation/ampel.ts`
- Modify: `frontend/src/components/Ampel.tsx` (Status-Text)
- Modify: `frontend/src/App.tsx` (Zeilen ~406, ~1020, ~1044, ~1089), `frontend/src/screens/Dashboard.tsx` (`farbeVon`)
- Test: `frontend/src/navigation/ampel.test.ts`, `frontend/src/components/Ampel.test.tsx`

**Interfaces:**
- Produces in `ampel.ts`: `umstiegRestSek(abfahrt: Date, ankunft: Date | undefined, jetztMs: number): number` = `(abfahrt − max(jetztMs, ankunft)) / 1000`; `anschlussUnerreichbar(abfahrt: Date, ankunft: Date | undefined): boolean` = Abfahrt vor Ankunft. Ankunft = `werte.ankunftZeit` (wird bei Verspätung bereits überschrieben, `App.tsx:904`).
- Mitternacht: Liegt die Ankunft mehr als 12 h nach der Abfahrt, gilt die Abfahrt als am Folgetag (Helfer `abfahrtNachAnkunft(abfahrt: Date, ankunft: Date): Date` in `ampel.ts`).
- `Ampel` bekommt `unerreichbar?: boolean`; dann Farbe `rot`, Text „Anschluss nicht erreichbar“.
- „Zug abgefahren“ bleibt an `abfahrt − jetzt < −ABGEFAHREN_KULANZ_MS` gebunden (nicht an der neuen Restzeit). Die Mitteilung bei Rot (`wirdRot`) bleibt nur beim Wechsel.

- [ ] **Step 1: Failing tests**
```ts
it('Erfurt: Ankunft 16:21, Abfahrt 16:20 → unerreichbar, rot', () => {
  expect(anschlussUnerreichbar(um('16:20'), um('16:21'))).toBe(true);
});
it('vor der Ankunft zählt Abfahrt − Ankunft, nicht Abfahrt − jetzt', () => {
  expect(umstiegRestSek(um('16:30'), um('16:21'), um('15:00').getTime())).toBe(540);
});
it('nach der Ankunft zählt jetzt', () => {
  expect(umstiegRestSek(um('16:30'), um('16:21'), um('16:25').getTime())).toBe(300);
});
it('Mitternacht: an 23:58, ab 00:10 → erreichbar, 720 s', () => { /* Review Focus 1 */ });
it('Ampel zeigt "Anschluss nicht erreichbar"', () => { /* render <Ampel unerreichbar … /> */ });
```
- [ ] **Step 2:** `cd frontend && npx vitest run src/navigation/ampel.test.ts src/components/Ampel.test.tsx` → FAIL.
- [ ] **Step 3:** Implementieren und alle vier Aufrufer in `App.tsx` sowie `Dashboard.tsx` umstellen; Meldungen (`~1044`) rechnen mit der neuen Abfahrt und der aktuellen Ankunft.
- [ ] **Step 4:** Frontend-Suite → PASS.
- [ ] **Step 5:** `git commit -m "fix(frontend): Ampel rechnet ab Ankunft, unerreichbarer Anschluss ist rot"`

---

### Task 13: Ersatzverkehr und U-Linien in der Tafel (Spec 7.2)

**Files:**
- Modify: `backend/src/clients/motis-abbildung.ts` (`verkehrsmittelAus`, Tafeleintrag Zeile ~133)
- Modify: `backend/src/core/typen.ts`, `frontend/src/api/typen.ts` (`HaltestellenTafelEintrag.ersatzverkehr?: boolean`)
- Modify: die Komponente, die Tafeleinträge der Haltestellentafel zeigt (`frontend/src/components/Fahrtauswahl.tsx`)
- Test: `backend/test/motis-verkehrsmittel.test.ts`, `backend/test/motis-tafel.test.ts`, `frontend/src/components/Fahrtauswahl.test.tsx`

**Interfaces:**
- Produces: `verkehrsmittelAus(mode: string, linie?: string): Verkehrsmittel` – `TRAM`/`BUS` mit Linie `/^U\s?\d+$/` → `ubahn`. `istErsatzverkehr(mode: string, linie: string): boolean` – `BUS`/`COACH` mit Linie `/^(ICE|IC|IRE|RE|RB|S)\s?\d+/`.
- Anzeige: Eintrag mit `ersatzverkehr` trägt den Zusatz „Ersatzverkehr“ neben der Linie.

- [ ] **Step 1: Failing tests**
```ts
expect(verkehrsmittelAus('TRAM', 'U2')).toBe('ubahn');
expect(verkehrsmittelAus('TRAM', '11')).toBe('tram');
expect(istErsatzverkehr('BUS', 'RB30')).toBe(true);
expect(istErsatzverkehr('BUS', '36')).toBe(false);
```
- [ ] **Step 2:** Tests → FAIL. **Step 3:** Implementieren. **Step 4:** Backend-, dann Frontend-Suite → PASS.
- [ ] **Step 5: `n=10` prüfen** – nach Julians Zustimmung zur Netzabfrage: Stoptimes Nürnberg Hbf einmal mit `n=10`, einmal mit `n=100` im gleichen Fenster abfragen (`osm-ablage/diagnose/`). Fehlen bei `n=10` Fahrten im Fenster, `n` in `clients/motis.ts` so erhöhen, dass das Fenster vollständig ist, mit Test auf den Parameter.
- [ ] **Step 6:** `git commit -m "feat: Ersatzverkehr kennzeichnen, U-Linien als U-Bahn"`

---

### Task 14: Abdeckung – Hessental und Ausland (Spec 7.3)

**Files:**
- Modify (je nach Befund): `backend/src/routes/api.ts` (`/api/stations`), `backend/src/clients/stations.ts`, `frontend/src/App.tsx` (Fehlertexte, Zeile ~77)
- Test: `backend/test/stationssuche.test.ts`, `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: Copy (fest): „Umstieg. deckt nur Bahnhöfe in Deutschland ab.“

- [ ] **Step 1: Befund** – lokalen Server mit DB-Zugang starten (`cd backend && npx tsx watch --env-file="E:/jbeer/.secrets/umstieg.env" src/server.ts`), `GET /api/stations?q=Schwäbisch%20Hall-Hessental` (UTF-8 kodiert, nicht `--data-urlencode`) und `q=Bologna`. Danach Server und Port 3001 beenden.
- [ ] **Step 2: Failing test** – je nach Befund: Hessental fehlt → Test mit der aufgezeichneten Antwort als Fixture, der den Treffer erwartet; ausländischer Treffer erreichbar → Test, dass die Antwort bzw. Oberfläche den festen Satz zeigt.
- [ ] **Step 3:** Ursache beheben. **Step 4:** Suiten nacheinander → PASS.
- [ ] **Step 5:** `git commit -m "fix: Bahnhofssuche - Hessental und Bahnhoefe im Ausland"` (findet Step 1 keinen Fehler: kein Commit, Befund im Bericht)

---

### Task 15: G1-Rest – Wege über Gleise (Spec 3)

**Files:**
- Modify: `backend/src/core/graph.ts` (je nach Befund)
- Create (gitignored): `backend/osm-ablage/diagnose/stufenfrei-geraten.ts`
- Test: `backend/test/graph.test.ts`

- [ ] **Step 1:** `cd backend && npx tsx scripts/gleiskreuzung-pruefung.ts osm-ablage/laeufe/gleise-vor-g1.json osm-ablage/laeufe/gleise-basis-0311.json` → aktuelle Zahl, häufigste Kanten.
- [ ] **Step 2:** Häufigste Kante (Dortmund `gleis6:mitte > n2385416821@1`) mit `osm-ablage/diagnose/koeln.ts`-Muster auf OSM-Wege zurückführen; Ursache als allgemeine Regel formulieren.
- [ ] **Step 3: Failing test** – minimale Overpass-Fixture, die das Muster nachbaut; erwartet: keine Kante über das Gleis.
- [ ] **Step 4:** Regel implementieren; Test und Suite → PASS; Gleisprüfung gegen die Basis: weniger Kreuzungen, keine neue Kreuzung, „Ohne Weg“ schnell ≤ 748, stufenfrei ≤ 2498.
- [ ] **Step 5:** Commit `fix(backend): <Regel>`; Steps 2–5 für die nächste Kante wiederholen, solange eine allgemeine Ursache erkennbar ist. Was nur eine OSM-Korrektur löst, als Liste je Bahnhof in den Abschlussbericht.
- [ ] **Step 6:** `stufenfrei-geraten.ts`: Zahl der stufenfreien Routen (alle Gleispaare, 382 Bahnhöfe), die einen Knoten mit geratener Ebene benutzen – Zahl und die zehn häufigsten Bahnhöfe berichten. Keine Produktänderung.

---

### Task 16: Neu erzeugen, messen, dokumentieren (Spec 8)

**Files:**
- Modify: `frontend/src/bahnhofsseiten/daten/*.json` (erzeugt), `frontend/src/einfuehrung/daten/*` (erzeugt), `README.md` (Abschnitt „Hier weitermachen“)

Referenzstand für alle Vergleiche ist Commit `d1be87a` (Seitendaten dort eingecheckt).

- [ ] **Step 1:** `cd backend && npm run bahnhofsseiten` und `npm run vorfuehrdaten`. Einführung Schritt 7 („9 statt 6 Minuten“) prüfen; stimmt der Satz nicht mehr, Text an die neue Zahl anpassen (`frontend/src/einfuehrung/schritte.ts`) mit Test.
- [ ] **Step 2: Messung G2** – Diagnoseskript `osm-ablage/diagnose/aufzug-vergleich.ts` vergleicht `anlagen` und `sek` je Gleispaar zwischen `d1be87a` und jetzt: Zahl der Paare Aufzug→Treppe, Treppe→Aufzug, Mittelwert und Median der Änderung von `sek` und `stufenfreiSek`.
- [ ] **Step 3: Prüfläufe** – `gleiskreuzung-pruefung.ts` gegen die Basis, `anfragen-pruefung.ts`, `simulation-bild.ts`, `simulation-lauf3.ts`: keine neuen Befunde gegenüber dem Stand im README (02.11.2026).
- [ ] **Step 4: Suiten** – `cd backend && npx vitest run && npm run lint && npm run build`, danach `cd frontend && npx vitest run && npm run lint && npm run build`. Alles grün.
- [ ] **Step 5:** README „Hier weitermachen“ um den Stand 03.11.2026 ergänzen: was geändert ist, die Messzahlen aus Step 2/3, die Liste aus Task 15, offene Punkte.
- [ ] **Step 6:** `git commit -m "chore: Bahnhofsseiten und Vorfuehrdaten neu, README Stand 03.11.2026"`. Kein Push, kein Deploy – Freigabe durch Julian.
