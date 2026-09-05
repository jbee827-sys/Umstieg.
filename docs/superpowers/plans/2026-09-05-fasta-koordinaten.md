# FaSta-Koordinaten im Synthesemodell – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stufe 3 bezieht die Lage von Aufzügen und Rolltreppen aus FaSta, statt jede Querung auf die Bahnsteigmitte und jeden Weg dorthin auf pauschal 10 m zu setzen.

**Architecture:** Die Zuordnung Anlage → Bahnsteig kommt aus dem FaSta-Feld `description` („zu Gleis 15/16" = Bahnsteig 15/16), nie aus Geometrie – geometrisches Clustern wäre nachweislich falsch (Parkhäuser, Tram). Ein neuer reiner Parser (`core/fasta-gleisbezug.ts`) liefert den Gleisbezug, `core/synthmodell.ts` verankert damit die Bahnsteige, und `routes/api.ts` ruft FaSta beim Graphbau nur dann, wenn ein Bahnhof wirklich auf Stufe 3 fällt. Koordinaten dürfen in den Graphcache (ein Aufzug wandert nicht), der Betriebsstatus niemals – er wird wie heute pro Anfrage auf einer Kopie angewandt, künftig aber über die Anlagen-Identität statt über eine 50-m-Schranke.

**Tech Stack:** TypeScript (ESM, `.js`-Endungen in Importen), Fastify 5, Vitest 3, oxlint. Alles im Ordner `backend/`.

**Spec:** [`docs/superpowers/specs/2026-09-05-fasta-koordinaten-design.md`](../specs/2026-09-05-fasta-koordinaten-design.md)

## Global Constraints

- **Arbeitszweig ist `feat/mvp`.** `main` wird später per Fast-Forward nachgezogen, nicht hier.
- **Alle Befehle laufen in `backend/`.** Tests: `npm test`. Lint plus Typprüfung: `npm run lint` (muss ohne Ausgabe durchlaufen).
- **Sprache:** Bezeichner und Kommentare auf Deutsch, wie im ganzen Repo. Nutzertexte ebenfalls.
- **Importe tragen die `.js`-Endung**, auch für `.ts`-Dateien (ESM-Auflösung).
- **Keine neue Abhängigkeit.** FaSta ist über `clients/fasta.ts` bereits angeschlossen und in `app.ts:320` mit 5 Minuten Frist zwischengespeichert.
- **Der Betriebsstatus darf niemals in den Graphcache.** Das ist die Naht, in die dieses Repo schon einmal getreten ist (siehe `routes/api.ts:369`).
- **Gemessene Konstante:** Bahnsteigabstand **20 m** (Sondierung ergab 20–26 m), bisher 15 m.
- **Degradation kostet nie eine Auskunft.** Jeder Ausfall fällt auf das heutige Verhalten zurück, nie auf etwas Schlechteres. Kein neuer Nutzertext.
- **Commits** enden auf:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01QbM5X9MwnFVe1rnGWMeUTP
  ```

---

### Task 1: Der Gleisbezug-Parser

Rein, ohne Abhängigkeiten, einzeln testbar. Beantwortet für einen FaSta-Beschreibungstext genau eine Frage: Welchen Bahnsteig verankert diese Anlage – wenn überhaupt?

**Files:**
- Create: `backend/src/core/fasta-gleisbezug.ts`
- Test: `backend/test/fasta-gleisbezug.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `verankerterBahnsteig(text: string | undefined): string[] | null` – die Gleise des verankerten Bahnsteigs, oder `null`
  - `bahnsteigSchluessel(gleise: string[]): string` – z. B. `['12','11'] → '11/12'`

- [ ] **Step 1: Write the failing test**

`backend/test/fasta-gleisbezug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bahnsteigSchluessel, verankerterBahnsteig } from '../src/core/fasta-gleisbezug.js';

describe('verankerterBahnsteig', () => {
  it('erkennt das Vokabular aller fuenf sondierten Bahnhoefe', () => {
    expect(verankerterBahnsteig('zu Gleis 15/16')).toEqual(['15', '16']);
    expect(verankerterBahnsteig('zu Bstg Gl 11/12')).toEqual(['11', '12']);
    expect(verankerterBahnsteig('zu Bstg Gl 3/4 Ostseite')).toEqual(['3', '4']);
    expect(verankerterBahnsteig('zu Bst 9/10')).toEqual(['9', '10']);
    expect(verankerterBahnsteig('B2-Ebene zu Gl. 101/102 S-Bahn')).toEqual(['101', '102']);
    expect(verankerterBahnsteig('zu Gleis 3/4')).toEqual(['3', '4']);
  });

  // Falle 1, belegt in der Berliner Rohantwort: Der Bindestrich ist ein
  // TRENNER, kein Bereich - "1.UG" ist eine Ebene, kein Gleis. Die naive
  // Lesart machte daraus "Gleis 1 bis 22".
  it('liest "Gleis 22 - 1.UG - Kein Halt EG" als genau ein Gleis', () => {
    expect(verankerterBahnsteig('Gleis 22 - 1.UG - Kein Halt EG')).toEqual(['22']);
  });

  // Falle 2, belegt in der Muenchener Rohantwort: 1a ist nicht 1.
  it('behaelt den Buchstabensuffix', () => {
    expect(verankerterBahnsteig('von UG zu Gleis 1a (S-Bahn)')).toEqual(['1a']);
    expect(verankerterBahnsteig('von UG zu Gleis 2a (S-Bahn)')).toEqual(['2a']);
  });

  it('ein echter Bereich nennt mehr als zwei Gleise und verankert deshalb nichts', () => {
    expect(verankerterBahnsteig('zu Gleis 3-8 Abschnitt D/E')).toBeNull();
  });

  it('zwei Fundstellen sind eine Verbindung und verankern nichts', () => {
    expect(verankerterBahnsteig('Gleis 5/6 (C/D) - Gleis 11/12')).toBeNull();
    expect(verankerterBahnsteig('Gleis 3/4 (C/D) - Gleis 13/14')).toBeNull();
  });

  it('Anlagen ohne Gleisbezug verankern nichts', () => {
    for (const text of [
      'von Parkhaus A zum 1. UG',
      '1.UG - Tram Haltestelle 5',
      'Nicht Reisendenrelevant',
      'DB Lounge',
      'Ecke Arnulf-/Luisenstr. zu U1',
      'B-Ebene <-> Strassenbahn',
      'von EG zu Zwischenebene',
      'Fahrtreppe HF 0204',
      '',
    ]) {
      expect(verankerterBahnsteig(text), text).toBeNull();
    }
    expect(verankerterBahnsteig(undefined)).toBeNull();
  });
});

describe('bahnsteigSchluessel', () => {
  it('sortiert numerisch - 12/11 und 11/12 sind derselbe Bahnsteig', () => {
    expect(bahnsteigSchluessel(['12', '11'])).toBe('11/12');
    expect(bahnsteigSchluessel(['11', '12'])).toBe('11/12');
  });

  it('sortiert nicht alphabetisch - 9 kommt vor 10', () => {
    expect(bahnsteigSchluessel(['10', '9'])).toBe('9/10');
  });

  it('vertraegt den Buchstabensuffix', () => {
    expect(bahnsteigSchluessel(['1a'])).toBe('1a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fasta-gleisbezug`
Expected: FAIL – `Failed to resolve import "../src/core/fasta-gleisbezug.js"`

- [ ] **Step 3: Write minimal implementation**

`backend/src/core/fasta-gleisbezug.ts`:

```ts
/**
 * Gleisbezug aus dem FaSta-Feld `description`.
 *
 * Warum ueber den Text und nicht ueber die Geometrie: Eine Sondierung gegen
 * die echte API (05.09.2026, fuenf Bahnhoefe) hat gezeigt, dass rein
 * geometrisches Clustern der Anlagen falsch ist. Berlins Anlagenmenge streut
 * ueber 339 m, weil Parkhaeuser, Tram-Haltestellen und "Nicht
 * Reisendenrelevant" mit darin stehen; und die Clusterschwelle ist nicht
 * uebertragbar (30 m ergibt in Berlin 6 Cluster, in Hannover 2).
 *
 * `description` dagegen nennt fast immer ein GLEISPAAR - und ein Gleispaar
 * IST ein Bahnsteig. Das ist keine Vermutung, sondern die Auskunft selbst.
 */

/**
 * Vokabular und Zahlform, alle Bestandteile in den Rohantworten belegt:
 * "Gleis 15/16", "Gl 11/12", "Gl. 101/102", "Bstg Gl 3/4", "Bst 9/10".
 *
 * Zwei Feinheiten, die je einen Fehler verhindern:
 *
 * - `(\s*\/\s*|-)` laesst den Bindestrich NUR ohne Leerzeichen als Bereich
 *   gelten. "Gleis 22 - 1.UG" ist damit ein Gleis und kein Bereich 1..22.
 * - `(?!\.[a-z])` verwirft eine Zahl, der ein Punkt und ein Buchstabe folgt.
 *   Das ist eine Ebene ("1.UG", "1.OG"), kein Gleis.
 *
 * Die Alternativen stehen lang vor kurz, sonst schluckte `gl\.?` den Anfang
 * von "Gleis".
 */
const GLEIS_MUSTER =
  /\b(?:gleise|gleis|bstg\.?\s*gl\.?|bstg\.?|bst\.?|gl\.?)\s*(\d+[a-z]?)(?!\.[a-z])(?:(\s*\/\s*|-)(\d+[a-z]?)(?!\.[a-z]))?/gi;

/** Hoechstweite eines Bereichs - schuetzt vor einer Zahl, die keine Gleisnummer ist. */
const BEREICH_MAX = 20;

/** Die Gleise je Fundstelle. Zwei Fundstellen = die Anlage verbindet zwei Bahnsteige. */
function fundstellen(text: string): string[][] {
  const alle: string[][] = [];
  for (const treffer of text.matchAll(GLEIS_MUSTER)) {
    const [, erstes, trenner, zweites] = treffer;
    if (zweites === undefined) {
      alle.push([erstes]);
      continue;
    }
    // Bereich nur bei unmittelbarem Bindestrich und reinen Zahlen.
    const istBereich = trenner === '-' && /^\d+$/.test(erstes) && /^\d+$/.test(zweites);
    const von = Number(erstes);
    const bis = Number(zweites);
    if (istBereich && bis > von && bis - von <= BEREICH_MAX) {
      const gleise: string[] = [];
      for (let g = von; g <= bis; g++) gleise.push(String(g));
      alle.push(gleise);
    } else {
      alle.push([erstes, zweites]);
    }
  }
  return alle;
}

/**
 * Der Bahnsteig, den diese Anlage verankert - oder `null`.
 *
 * Verankert wird nur bei GENAU EINER Fundstelle mit einem oder zwei Gleisen.
 * Alles andere ist keine Bahnsteigzuordnung:
 *
 * - keine Fundstelle -> Parkhaus, Tram, DB Lounge. Gehoert nicht an einen Bahnsteig.
 * - zwei Fundstellen -> eine Verbindung ("Gleis 5/6 (C/D) - Gleis 11/12"). Sie
 *   waere wertvoll, traegt aber nur EINEN Punkt, und eine Verbindung braucht
 *   zwei. Sie hier zu verwerten hiesse raten.
 * - mehr als zwei Gleise -> ein Querbahnsteig ueber mehrere Bahnsteige.
 */
export function verankerterBahnsteig(text: string | undefined): string[] | null {
  if (!text) return null;
  const alle = fundstellen(text);
  if (alle.length !== 1) return null;
  const gleise = alle[0];
  return gleise.length === 1 || gleise.length === 2 ? gleise : null;
}

/** Bahnsteigschluessel: Gleise numerisch sortiert - "12/11" und "11/12" sind eins. */
export function bahnsteigSchluessel(gleise: string[]): string {
  return [...gleise].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).join('/');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fasta-gleisbezug`
Expected: PASS – 8 Tests grün

- [ ] **Step 5: Lint und Typen**

Run: `npm run lint`
Expected: keine Ausgabe

- [ ] **Step 6: Commit**

```bash
git add backend/src/core/fasta-gleisbezug.ts backend/test/fasta-gleisbezug.test.ts
git commit -m "feat: Gleisbezug aus der FaSta-Beschreibung lesen"
```

---

### Task 2: Echte Fixtures und die Anlagen-Identität

Das bisherige Fixture ist handgebaut und hat die **falsche Form** – echt kommt ein blankes Array, das Fixture liefert `{facilities: […]}`. Es wird durch zwei echte Aufzeichnungen ersetzt. Gleichzeitig bekommt `FastaAnlage` eine Identität, die Task 3 braucht.

**Files:**
- Create: `backend/test/fixtures/db/fasta-hannover-8000152.json` (Kopie aus `%TEMP%\fasta-spike\fasta-8000152.json`)
- Create: `backend/test/fixtures/db/fasta-berlin-8011160.json` (Kopie aus `%TEMP%\fasta-spike\fasta-8011160.json`)
- Delete: `backend/test/fixtures/db/fasta-facilities.json`
- Modify: `backend/src/core/typen.ts:154-160` (`FastaAnlage`)
- Modify: `backend/src/clients/fasta.ts:5-11, 30-43`
- Test: `backend/test/fasta.test.ts:20-37` (ersetzt den Fixture-Test)

**Interfaces:**
- Consumes: nichts aus Task 1
- Produces: `FastaAnlage.id: string` – stabile Identität je Anlage, aus `equipmentnumber`

- [ ] **Step 1: Fixtures aus der Sondierung übernehmen**

```bash
cd backend
cp "$TEMP/fasta-spike/fasta-8000152.json" test/fixtures/db/fasta-hannover-8000152.json
cp "$TEMP/fasta-spike/fasta-8011160.json" test/fixtures/db/fasta-berlin-8011160.json
rm test/fixtures/db/fasta-facilities.json
```

Prüfen, dass beide ein **blankes Array** sind (kein `facilities`-Umschlag):

Run: `head -c 40 test/fixtures/db/fasta-hannover-8000152.json`
Expected: beginnt mit `[` und `{`, nicht mit `{"facilities"`

- [ ] **Step 2: Write the failing test**

In `backend/test/fasta.test.ts` den Block `describe('holeAnlagen', …)` **ersetzen** durch:

```ts
describe('holeAnlagen', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  function antwortMit(fixture: string): typeof fetch {
    return (async () =>
      new Response(ladeFixture(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
  }

  // Aufgezeichnet am 05.09.2026 gegen die echte API. Das Vorgaengerfixture
  // war handgebaut UND hatte die falsche Form: FaSta liefert ein blankes
  // Array, nicht {facilities: [...]}.
  it('parst die echte Hannover-Antwort (blankes Array)', async () => {
    const anlagen = await holeAnlagen('2545', antwortMit('fasta-hannover-8000152.json'));
    expect(anlagen.length).toBeGreaterThanOrEqual(18);
    for (const a of anlagen) {
      expect(a.id, 'jede Anlage braucht eine Identitaet').toBeTruthy();
      expect(['AUFZUG', 'ROLLTREPPE']).toContain(a.typ);
      expect(Number.isFinite(a.lat) && Number.isFinite(a.lon)).toBe(true);
    }
  });

  it('die Identitaet ist die equipmentnumber und ist eindeutig', async () => {
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    const ids = anlagen.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // In der Sondierung: Berlin 69 von 70 Anlagen mit Koordinaten.
  it('verwirft Anlagen ohne Koordinaten', async () => {
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    expect(anlagen.every((a) => a.lat !== undefined && a.lon !== undefined)).toBe(true);
    expect(anlagen.length).toBeLessThan(70);
  });

  // Belegt: state UNKNOWN kommt wirklich vor (Frankfurt 1x, Eberswalde 2x).
  // Die konservative Abbildung ist damit belegt richtig, nicht nur vorsichtig.
  it('fuehrt jeden nicht-ACTIVE Status als INACTIVE', async () => {
    const roh = JSON.parse(ladeFixture('fasta-berlin-8011160.json')) as { state?: string }[];
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    expect(anlagen.every((a) => a.status === 'ACTIVE' || a.status === 'INACTIVE')).toBe(true);
    expect(roh.length).toBeGreaterThan(0);
  });

  it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    await expect(holeAnlagen('1071')).rejects.toBeInstanceOf(FehlendeZugangsdatenError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- fasta`
Expected: FAIL – `Property 'id' does not exist on type 'FastaAnlage'`

- [ ] **Step 4: Write minimal implementation**

In `backend/src/core/typen.ts` die Schnittstelle `FastaAnlage` ersetzen:

```ts
export interface FastaAnlage {
  /**
   * Stabile Identitaet der Anlage (FaSta `equipmentnumber`).
   *
   * Wird gebraucht, um den LIVE-Status einer Kante zuzuordnen, die im
   * GECACHTEN Graphen steht. Ueber die Entfernung ginge das nicht: Im
   * verankerten Synthesemodell sitzt der Kantenknoten auf dem
   * Bahnsteigschwerpunkt, die Anlage an ihrem echten Ort - an Berlins 280 m
   * langen Bahnsteigen bis zu ~140 m auseinander.
   */
  id: string;
  typ: 'AUFZUG' | 'ROLLTREPPE';
  lat: number;
  lon: number;
  status: 'ACTIVE' | 'INACTIVE';
  beschreibung?: string;
}
```

In `backend/src/clients/fasta.ts` das Feld in `FastaFacility` ergänzen und beim Abbilden setzen:

```ts
interface FastaFacility {
  equipmentnumber?: number;
  type?: string; // ELEVATOR | ESCALATOR
  state?: string; // ACTIVE | INACTIVE | UNKNOWN
  description?: string;
  geocoordY?: number; // Breite
  geocoordX?: number; // Länge
}
```

und im `.map(…)` als erstes Feld:

```ts
    .map((f) => ({
      // Ohne equipmentnumber aus den Koordinaten gebildet: Eine Anlage darf
      // NIE verworfen werden, nur weil ihre Nummer fehlt - eine verschwiegene
      // INACTIVE-Anlage liesse die barrierefreie Route passierbar aussehen.
      id:
        f.equipmentnumber !== undefined
          ? String(f.equipmentnumber)
          : `geo:${f.geocoordY}:${f.geocoordX}`,
      typ: f.type === 'ELEVATOR' ? ('AUFZUG' as const) : ('ROLLTREPPE' as const),
      lat: f.geocoordY!,
      lon: f.geocoordX!,
      status: f.state === 'ACTIVE' ? ('ACTIVE' as const) : ('INACTIVE' as const),
      ...(f.description ? { beschreibung: f.description } : {}),
    }));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- fasta`
Expected: PASS

- [ ] **Step 6: Die übrigen Testdateien nachziehen**

Jede Stelle, die ein `FastaAnlage`-Literal baut, braucht jetzt `id`. Betroffen sind `test/synthmodell.test.ts` und `test/fasta.test.ts` (Block `wendeFastaAn`).

Run: `npm run lint`
Expected: zeigt die fehlenden `id`-Felder als Typfehler. Jedes Literal um ein sprechendes `id` ergänzen, z. B. `{ id: 'a1', typ: 'AUFZUG', lat: 51, lon: 10, status: 'ACTIVE' }`.

Run: `npm run lint && npm test`
Expected: keine Ausgabe bzw. alle Tests grün

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "feat: echte FaSta-Fixtures und eine Identitaet je Anlage"
```

---

### Task 3: Statuszuordnung über Identität statt Entfernung

`wendeFastaAn` ordnet heute über die nächstgelegene Kante gleichen Typs zu, begrenzt auf `FASTA_MAX_ABSTAND_M = 50`. Für den verankerten Stufe-3-Graphen reicht das nicht – dort liegen Anlage und Kantenknoten bis zu ~140 m auseinander, und der Status würde **still verworfen**, auf der barrierefreien Route.

**Files:**
- Modify: `backend/src/core/typen.ts:39-47` (`GraphKante`)
- Modify: `backend/src/core/synthmodell.ts:180-215` (`wendeFastaAn` und ihr Kommentarblock)
- Test: `backend/test/fasta.test.ts` (Block `describe('wendeFastaAn …')`)

**Interfaces:**
- Consumes: `FastaAnlage.id` aus Task 2
- Produces: `GraphKante.anlageId?: string`; `wendeFastaAn(graph: StationGraph, anlagen: FastaAnlage[]): void` mit unveränderter Signatur

- [ ] **Step 1: Write the failing test**

Ans Ende von `backend/test/fasta.test.ts` anfügen:

```ts
describe('wendeFastaAn: Zuordnung ueber Identitaet', () => {
  function graphMitIdKante(): StationGraph {
    const knoten: GraphKnoten[] = [
      { id: 'gleis1:mitte', lat: 52.525, lon: 13.369, level: 0, gleis: '1' },
      { id: 'quer:bs0@-1', lat: 52.525, lon: 13.369, level: -1 },
    ];
    const kante: GraphKante = {
      von: 'gleis1:mitte',
      nach: 'quer:bs0@-1',
      laengeM: 45,
      deltaLevel: -1,
      typ: 'aufzug',
      barrierefrei: true,
      anlageId: '10499908',
    };
    return {
      knoten: new Map(knoten.map((k) => [k.id, k])),
      adjazenz: new Map([
        ['gleis1:mitte', [kante]],
        ['quer:bs0@-1', [kante]],
      ]),
      stufe: 3,
      gleise: ['1'],
    };
  }

  // Der Berliner Regelfall: 280 m langer Bahnsteig, Anlage ~140 m vom
  // Schwerpunkt. Die alte 50-m-Schranke haette den Status verworfen und die
  // barrierefreie Route auf einem defekten Aufzug weiterlaufen lassen.
  it('greift auch bei 140 m Abstand, wenn die anlageId passt', () => {
    const graph = graphMitIdKante();
    wendeFastaAn(graph, [
      { id: '10499908', typ: 'AUFZUG', lat: 52.5263, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei')).toBeNull();
  });

  it('eine fremde anlageId laesst die Kante unberuehrt', () => {
    const graph = graphMitIdKante();
    wendeFastaAn(graph, [
      { id: 'ganz-andere', typ: 'AUFZUG', lat: 52.525, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei')).not.toBeNull();
  });

  // Der OSM-Pfad bleibt, wie er war: ohne anlageId zaehlt die Entfernung,
  // und die 50-m-Schranke wirkt weiter.
  it('ohne anlageId gilt weiterhin die Entfernung mit 50-m-Schranke', () => {
    const graph = graphMitIdKante();
    for (const liste of graph.adjazenz.values()) {
      for (const k of liste) delete k.anlageId;
    }
    wendeFastaAn(graph, [
      { id: 'x', typ: 'AUFZUG', lat: 52.5263, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(
      berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei'),
      '140 m entfernt - ausserhalb der Schranke, Status darf nicht greifen',
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fasta`
Expected: FAIL – `Object literal may only specify known properties, and 'anlageId' does not exist in type 'GraphKante'`

- [ ] **Step 3: Write minimal implementation**

In `backend/src/core/typen.ts`, `GraphKante` um ein Feld ergänzen:

```ts
export interface GraphKante {
  von: string;
  nach: string;
  laengeM: number;
  deltaLevel: number; // level(nach) - level(von)
  typ: KantenTyp;
  barrierefrei: boolean;
  status?: 'ACTIVE' | 'INACTIVE'; // FaSta, nur aufzug/rolltreppe
  /**
   * Welche FaSta-Anlage diese Kante erzeugt hat (Synthesemodell).
   *
   * STABIL, darf deshalb in den Graphcache - anders als `status`. Damit
   * findet der Live-Status seine Kante ueber die Identitaet statt ueber die
   * Entfernung, die im verankerten Modell nicht mehr traegt.
   */
  anlageId?: string;
}
```

In `backend/src/core/synthmodell.ts` `wendeFastaAn` ersetzen (samt Kommentarblock – der alte behauptet, Stufe 3 brauche das nicht):

```ts
/**
 * Überträgt den FaSta-Betriebsstatus auf einen Graphen. Zwei Wege, und der
 * erste ist der genaue:
 *
 * 1. Trägt die Kante eine `anlageId` (Synthesemodell), gilt der Status der
 *    Anlage mit dieser Nummer - ohne Entfernungsprüfung. Nötig, weil der
 *    Kantenknoten auf dem Bahnsteigschwerpunkt sitzt und die Anlage an
 *    ihrem echten Ort: an Berlins 280-m-Bahnsteigen bis zu ~140 m Abstand.
 *    Über die Entfernung wäre der Status still verworfen worden.
 * 2. Sonst (OSM-Graph, Stufe 1/2) wie bisher über die nächstgelegene Kante
 *    gleichen Typs, begrenzt auf FASTA_MAX_ABSTAND_M.
 *
 * `INACTIVE` sperrt die Kante ausschließlich in der Variante `barrierefrei`
 * (das erledigt `kanteErlaubt` in routing.ts). Der Graph wird an Ort und
 * Stelle geändert - Aufrufer arbeiten deshalb auf einer Kopie.
 */
export function wendeFastaAn(graph: StationGraph, anlagen: FastaAnlage[]): void {
  // Kanten stehen in beiden Adjazenzlisten als dieselbe Referenz – ein Set
  // betrachtet jedes Kantenobjekt genau einmal.
  const kanten = new Set<GraphKante>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) kanten.add(kante);
  }

  // Weg 1: über die Identität.
  const nachId = new Map(anlagen.map((a) => [a.id, a]));
  const offen = new Set<GraphKante>();
  for (const kante of kanten) {
    if (kante.anlageId === undefined) {
      offen.add(kante);
      continue;
    }
    const anlage = nachId.get(kante.anlageId);
    // Eine Kante, deren Anlage in dieser Antwort fehlt, bleibt ohne Status -
    // sie wird NICHT ersatzweise über die Entfernung bedient. Ein geratener
    // Status ist auf der barrierefreien Route schlimmer als keiner.
    if (anlage) kante.status = anlage.status;
  }

  // Weg 2: über die Entfernung, für Kanten ohne Identität (OSM).
  for (const anlage of anlagen) {
    const gesucht: KantenTyp = anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe';
    let beste: GraphKante | null = null;
    let besterAbstand = Infinity;
    for (const kante of offen) {
      if (kante.typ !== gesucht) continue;
      const abstand = abstandZuKante(graph, kante, anlage);
      if (abstand < besterAbstand) {
        besterAbstand = abstand;
        beste = kante;
      }
    }
    if (beste && besterAbstand <= FASTA_MAX_ABSTAND_M) beste.status = anlage.status;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fasta`
Expected: PASS – die drei neuen Tests plus die bestehenden `wendeFastaAn`-Tests

- [ ] **Step 5: Lint und volle Testrunde**

Run: `npm run lint && npm test`
Expected: keine Lint-Ausgabe, alle Tests grün

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/test
git commit -m "fix: FaSta-Status ueber die Anlagen-Identitaet zuordnen"
```

---

### Task 4: Bahnsteige aus FaSta verankern

Das Herzstück. `gruppiereBahnsteige` bekommt die Anlagen und bildet zuerst die **benannten** Bahnsteige aus echten Koordinaten; alles Übrige bleibt synthetisch, hängt aber an der gemessenen Achse.

**Files:**
- Modify: `backend/src/core/synthmodell.ts:16-165` (Konstanten, `SynthBahnsteig`, `gruppiereBahnsteige`, `syntheseGraph`)
- Test: `backend/test/synthmodell.test.ts` (ergänzend)

**Interfaces:**
- Consumes: `verankerterBahnsteig`, `bahnsteigSchluessel` (Task 1); `FastaAnlage.id` (Task 2); `GraphKante.anlageId` (Task 3)
- Produces: `syntheseGraph(info: StationsInfo, anlagen?: FastaAnlage[]): StationGraph` – Signatur **unverändert**, Verhalten neu

- [ ] **Step 1: Write the failing test**

Ans Ende von `backend/test/synthmodell.test.ts` anfügen:

```ts
describe('syntheseGraph: Verankerung aus FaSta', () => {
  const info: StationsInfo = {
    eva: '8000152',
    evas: ['8000152'],
    name: 'Teststadt',
    lat: 52.0,
    lon: 12.0,
    gleise: [{ gleis: '1' }, { gleis: '2' }, { gleis: '3' }, { gleis: '4' }],
  };

  // Ein Bahnsteig 1/2, dessen beide Anlagen ~200 m noerdlich der
  // Stationsposition stehen. Der Bahnsteig muss dorthin wandern.
  const anlagen1u2: FastaAnlage[] = [
    { id: 'a1', typ: 'AUFZUG', lat: 52.0018, lon: 12.0, status: 'ACTIVE', beschreibung: 'zu Gleis 1/2' },
    { id: 'a2', typ: 'ROLLTREPPE', lat: 52.0018, lon: 12.0004, status: 'ACTIVE', beschreibung: 'zu Bstg Gl 1/2 Ostseite' },
  ];

  it('ein benannter Bahnsteig sitzt auf dem Schwerpunkt seiner Anlagen', () => {
    const graph = syntheseGraph(info, anlagen1u2);
    const gleis1 = graph.knoten.get('gleis1:mitte')!;
    // Schwerpunkt der beiden Anlagen, nicht die Stationsposition 52.0.
    expect(gleis1.lat).toBeCloseTo(52.0018, 4);
    expect(gleis1.lat).not.toBeCloseTo(52.0, 4);
    // Gleis 2 liegt am selben Bahnsteig.
    expect(graph.knoten.get('gleis2:mitte')!.bahnsteigId).toBe(gleis1.bahnsteigId);
  });

  it('die Kante zur Querung traegt den gerechneten Weg, nicht mehr pauschal 10 m', () => {
    const graph = syntheseGraph(info, anlagen1u2);
    const kanten = [...new Set([...graph.adjazenz.values()].flat())];
    const aufzug = kanten.find((k) => k.typ === 'aufzug');
    expect(aufzug, 'ein Aufzug muss eine Kante erzeugen').toBeDefined();
    expect(aufzug!.anlageId).toBe('a1');
    // Der Aufzug steht auf dem Schwerpunkt -> Weg ~0 plus Abstieg.
    const rolltreppe = kanten.find((k) => k.typ === 'rolltreppe');
    // Die Rolltreppe steht ~27 m oestlich des Schwerpunkts: Weg > 0.
    expect(rolltreppe!.laengeM).toBeGreaterThan(aufzug!.laengeM);
  });

  it('der Status wird beim Bau NICHT eingetragen - er gehoert nicht in den Cache', () => {
    const defekt: FastaAnlage[] = anlagen1u2.map((a) => ({ ...a, status: 'INACTIVE' as const }));
    const graph = syntheseGraph(info, defekt);
    const kanten = [...new Set([...graph.adjazenz.values()].flat())];
    expect(kanten.every((k) => k.status === undefined)).toBe(true);
  });

  it('Anlagen ohne Gleisbezug verschieben keinen Bahnsteig', () => {
    const stoerung: FastaAnlage[] = [
      { id: 'p1', typ: 'AUFZUG', lat: 52.01, lon: 12.01, status: 'ACTIVE', beschreibung: 'von Parkhaus A zum 1. UG' },
      { id: 'p2', typ: 'ROLLTREPPE', lat: 52.02, lon: 12.02, status: 'ACTIVE', beschreibung: '1.UG - Tram Haltestelle 5' },
    ];
    const graph = syntheseGraph(info, stoerung);
    // Kein benannter Bahnsteig -> alles bleibt an der Stationsposition.
    expect(graph.knoten.get('gleis1:mitte')!.lat).toBeCloseTo(52.0, 4);
  });

  // Der Muenchener Fall: nur 16 % der Anlagen tragen einen Gleisbezug. Die
  // uebrigen duerfen keine barrierefreie Route kosten, die es heute gibt.
  it('Anlagen ohne Gleisbezug erzeugen weiterhin ihre Kante', () => {
    const namenlos: FastaAnlage[] = [
      { id: 'n1', typ: 'AUFZUG', lat: 52.0, lon: 12.0, status: 'ACTIVE', beschreibung: 'von EG zu UG' },
      { id: 'n2', typ: 'AUFZUG', lat: 52.0, lon: 12.0004, status: 'ACTIVE', beschreibung: 'Haupthalle - VTE' },
    ];
    const graph = syntheseGraph(info, namenlos);
    const kanten = [...new Set([...graph.adjazenz.values()].flat())];
    expect(kanten.filter((k) => k.typ === 'aufzug').length).toBeGreaterThan(0);
  });

  it('ohne Anlagen bleibt der Aufbau wie bisher - nur der Abstand ist 20 m', () => {
    const graph = syntheseGraph(info);
    expect(graph.stufe).toBe(3);
    expect(graph.gleise).toEqual(['1', '2', '3', '4']);
    const b0 = graph.knoten.get('gleis1:mitte')!;
    const b1 = graph.knoten.get('gleis2:mitte')!;
    expect(haversineM(b0.lat, b0.lon, b1.lat, b1.lon)).toBeCloseTo(20, 0);
  });
});
```

Am Kopf der Datei den Import ergänzen:

```ts
import { haversineM } from '../src/core/graph.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- synthmodell`
Expected: FAIL – der Bahnsteig sitzt noch auf 52.0, `anlageId` ist `undefined`, der Abstand ist 15 m

- [ ] **Step 3: Write minimal implementation**

In `backend/src/core/synthmodell.ts`: Import ergänzen, Konstante ändern, `SynthBahnsteig` und `gruppiereBahnsteige` ersetzen, den Anlagen-Block in `syntheseGraph` ersetzen.

Kopf:

```ts
import { bahnsteigSchluessel, verankerterBahnsteig } from './fasta-gleisbezug.js';
```

Konstante (gemessen 20–26 m in der Sondierung, bisher geraten):

```ts
const BAHNSTEIG_ABSTAND_M = 20;
```

`SynthBahnsteig` um die Anlagen erweitern:

```ts
interface SynthBahnsteig {
  id: string;
  gleise: { gleis: string; lat?: number; lon?: number }[];
  lat: number;
  lon: number;
  /** Anlagen, die diesen Bahnsteig laut FaSta-Beschreibung bedienen. */
  anlagen: FastaAnlage[];
}
```

`gruppiereBahnsteige` ersetzen:

```ts
/**
 * Gleise zu physischen Bahnsteigen gruppieren.
 *
 * Drei Schritte, und der erste ist neu: Wo FaSta einen Bahnsteig BENENNT
 * ("zu Gleis 15/16"), bekommt er echte Koordinaten. Nur der Rest wird
 * geschaetzt.
 *
 * Warum ueber die Beschreibung und nicht ueber die Geometrie, steht in
 * `fasta-gleisbezug.ts`. Kurz: Berlins Anlagenmenge streut ueber 339 m, weil
 * Parkhaeuser und Tram-Haltestellen mit darin stehen.
 *
 * Ohne FaSta bleibt es beim bisherigen Aufbau: Verankerung an der ECHTEN
 * Stationsposition, Bahnsteige im Standardabstand nach Osten. Ohne diese
 * Verankerung landete jede Stufe-3-Route bei 51 N / 10 O - und weil das
 * Frontend die Karte zeigt, sobald `karte` vorhanden ist, sah der Nutzer
 * echte OSM-Kacheln von einem Acker in Mitteldeutschland.
 */
function gruppiereBahnsteige(info: StationsInfo, anlagen: FastaAnlage[]): SynthBahnsteig[] {
  // Schritt 1: Verankerungen aus den Beschreibungen sammeln.
  const verankert = new Map<string, FastaAnlage[]>();
  for (const anlage of anlagen) {
    const gleise = verankerterBahnsteig(anlage.beschreibung);
    if (!gleise) continue;
    const schluessel = bahnsteigSchluessel(gleise);
    const bisher = verankert.get(schluessel);
    if (bisher) bisher.push(anlage);
    else verankert.set(schluessel, [anlage]);
  }

  const bahnsteige: SynthBahnsteig[] = [];
  const vergeben = new Set<string>();

  // Schritt 2: benannte Bahnsteige bilden - nur aus Gleisen, die die
  // DB-Gleisliste kennt. FaSta nennt auch Tram- und U-Bahn-Gleise; die
  // Gleisliste bleibt die Autoritaet darueber, was DIESER Bahnhof hat.
  for (const [schluessel, ihre] of verankert) {
    const genannte = schluessel.split('/');
    const eintraege = info.gleise.filter(
      (g) => genannte.includes(g.gleis) && !vergeben.has(g.gleis),
    );
    if (eintraege.length === 0) continue;
    for (const e of eintraege) vergeben.add(e.gleis);
    bahnsteige.push({
      id: `bs${bahnsteige.length}`,
      gleise: eintraege,
      lat: ihre.reduce((s, a) => s + a.lat, 0) / ihre.length,
      lon: ihre.reduce((s, a) => s + a.lon, 0) / ihre.length,
      anlagen: ihre,
    });
  }

  // Schritt 3: uebrige Gleise wie bisher gruppieren.
  const echte = [...bahnsteige].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  const ohneAnker: SynthBahnsteig[] = [];
  for (const eintrag of info.gleise) {
    if (vergeben.has(eintrag.gleis)) continue;
    if (eintrag.lat !== undefined && eintrag.lon !== undefined) {
      const passend = ohneAnker.find(
        (b) =>
          b.gleise[0].lat !== undefined &&
          haversineM(b.lat, b.lon, eintrag.lat!, eintrag.lon!) <= GRUPPIER_SCHWELLE_M,
      );
      if (passend) {
        passend.gleise.push(eintrag);
        continue;
      }
    }
    ohneAnker.push({
      id: `bs${bahnsteige.length + ohneAnker.length}`,
      gleise: [eintrag],
      lat: eintrag.lat ?? NaN,
      lon: eintrag.lon ?? NaN,
      anlagen: [],
    });
  }

  // Achse: aus den echten Bahnsteigen, sonst wie bisher nach Osten.
  const ankerLat = echte[0]?.lat ?? info.lat ?? BASIS_LAT;
  const ankerLon = echte[0]?.lon ?? info.lon ?? BASIS_LON;
  const mProGradLat = 111320;
  const mProGradLon = 111320 * Math.cos((ankerLat * Math.PI) / 180);
  let richtungLat = 0;
  let richtungLon = 1;
  if (echte.length >= 2) {
    const dLat = (echte[echte.length - 1].lat - echte[0].lat) * mProGradLat;
    const dLon = (echte[echte.length - 1].lon - echte[0].lon) * mProGradLon;
    const laenge = Math.hypot(dLat, dLon);
    if (laenge > 0) {
      richtungLat = dLat / laenge;
      richtungLon = dLon / laenge;
    }
  }

  // Synthetische Bahnsteige entlang der Achse anhaengen. Gibt es echte,
  // beginnen sie EINEN Abstand hinter dem letzten; gibt es keine, sitzt der
  // erste auf der Stationsposition - genau wie bisher.
  const letzte = echte[echte.length - 1];
  const startLat = letzte?.lat ?? ankerLat;
  const startLon = letzte?.lon ?? ankerLon;
  ohneAnker.forEach((b, i) => {
    if (!Number.isNaN(b.lat)) return;
    const versatz = (echte.length > 0 ? i + 1 : i) * BAHNSTEIG_ABSTAND_M;
    b.lat = startLat + (richtungLat * versatz) / mProGradLat;
    b.lon = startLon + (richtungLon * versatz) / mProGradLon;
  });

  return [...bahnsteige, ...ohneAnker].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
}
```

In `syntheseGraph` die Signaturzeile und den Aufruf anpassen:

```ts
export function syntheseGraph(info: StationsInfo, anlagen: FastaAnlage[] = []): StationGraph {
```
bleibt unverändert; nur der Aufruf wird:

```ts
  const bahnsteige = gruppiereBahnsteige(info, anlagen);
```

Und den bisherigen Anlagen-Block (`// FaSta-Anlagen dem nächstgelegenen Gleis zuordnen …` bis zum Ende der Schleife) **ersetzen** durch:

```ts
  // Verankerte Anlagen: echter Weg ueber den Bahnsteig plus geschaetzter
  // Abstieg. Der Status wird hier NICHT eingetragen - dieser Graph wird
  // gecacht, und ein gerade defekter Aufzug bliebe darin stehen. Den Status
  // legt `wendeFastaAn` pro Anfrage auf einer Kopie nach, ueber `anlageId`.
  for (const bahnsteig of bahnsteige) {
    for (const anlage of bahnsteig.anlagen) {
      const wegM = Math.round(haversineM(bahnsteig.lat, bahnsteig.lon, anlage.lat, anlage.lon));
      const abstieg = anlage.typ === 'AUFZUG' ? AUFZUG_LAENGE_M : TREPPE_LAENGE_M;
      for (const eintrag of bahnsteig.gleise) {
        fuegeKanteEin({
          von: `gleis${eintrag.gleis}:mitte`,
          nach: `quer:${bahnsteig.id}@-1`,
          laengeM: wegM + abstieg,
          deltaLevel: -1,
          typ: anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe',
          barrierefrei: anlage.typ === 'AUFZUG',
          anlageId: anlage.id,
        });
      }
    }
  }

  // Anlagen OHNE Gleisbezug: nach der bisherigen Regel ans naechstgelegene
  // Gleis. Sie praegen keine Lage, aber sie duerfen keine Auskunft kosten:
  // Muenchen benennt nur 16 % seiner Anlagen - fielen die uebrigen 84 % weg,
  // wuerde aus "barrierefreie Route vorhanden" ein "keine Route".
  const bedient = new Set(bahnsteige.flatMap((b) => b.anlagen.map((a) => a.id)));
  const gleisKnoten = [...knoten.values()].filter((k) => k.gleis);
  for (const anlage of anlagen) {
    if (bedient.has(anlage.id) || gleisKnoten.length === 0) continue;
    let nahester = gleisKnoten[0];
    let minAbstand = Infinity;
    for (const kandidat of gleisKnoten) {
      const abstand = haversineM(anlage.lat, anlage.lon, kandidat.lat, kandidat.lon);
      if (abstand < minAbstand) {
        minAbstand = abstand;
        nahester = kandidat;
      }
    }
    fuegeKanteEin({
      von: nahester.id,
      nach: `quer:${nahester.bahnsteigId}@-1`,
      laengeM: anlage.typ === 'AUFZUG' ? AUFZUG_LAENGE_M : TREPPE_LAENGE_M,
      deltaLevel: -1,
      typ: anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe',
      barrierefrei: anlage.typ === 'AUFZUG',
      anlageId: anlage.id,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- synthmodell`
Expected: PASS – die sechs neuen Tests und die bestehenden

- [ ] **Step 5: Test gegen die echten Fixtures**

Ans Ende von `backend/test/synthmodell.test.ts` anfügen:

```ts
describe('syntheseGraph gegen echte FaSta-Antworten', () => {
  function ladeAnlagen(datei: string): FastaAnlage[] {
    const roh = JSON.parse(
      readFileSync(fileURLToPath(new URL(`./fixtures/db/${datei}`, import.meta.url)), 'utf8'),
    ) as { equipmentnumber?: number; type?: string; state?: string; description?: string; geocoordX?: number; geocoordY?: number }[];
    return roh
      .filter((f) => (f.type === 'ELEVATOR' || f.type === 'ESCALATOR') && f.geocoordX !== undefined)
      .map((f) => ({
        id: String(f.equipmentnumber),
        typ: f.type === 'ELEVATOR' ? ('AUFZUG' as const) : ('ROLLTREPPE' as const),
        lat: f.geocoordY!,
        lon: f.geocoordX!,
        status: f.state === 'ACTIVE' ? ('ACTIVE' as const) : ('INACTIVE' as const),
        ...(f.description ? { beschreibung: f.description } : {}),
      }));
  }

  it('Hannover: sechs Bahnsteige bekommen echte Koordinaten', () => {
    const info: StationsInfo = {
      eva: '8000152', evas: ['8000152'], name: 'Hannover Hbf', lat: 52.3767, lon: 9.7411,
      gleise: '1 2 3 4 7 8 9 10 11 12 13 14'.split(' ').map((gleis) => ({ gleis })),
    };
    const graph = syntheseGraph(info, ladeAnlagen('fasta-hannover-8000152.json'));
    const bahnsteige = new Set(
      [...graph.knoten.values()].filter((k) => k.gleis).map((k) => k.bahnsteigId),
    );
    expect(bahnsteige.size).toBe(6);
  });

  it('Berlin: Parkhaus, Tram und U-Bahn verschieben keinen Bahnsteig', () => {
    const info: StationsInfo = {
      eva: '8011160', evas: ['8011160'], name: 'Berlin Hbf', lat: 52.5250, lon: 13.3694,
      gleise: '1 2 3 4 5 6 7 8 11 12 13 14 15 16'.split(' ').map((gleis) => ({ gleis })),
    };
    const graph = syntheseGraph(info, ladeAnlagen('fasta-berlin-8011160.json'));
    // Kein Gleisknoten darf weiter als 400 m von der Stationsposition liegen -
    // die Parkhaus-Anlagen streuen ueber 339 m und duerfen nicht ziehen.
    for (const k of [...graph.knoten.values()].filter((n) => n.gleis)) {
      expect(haversineM(52.5250, 13.3694, k.lat, k.lon), `Gleis ${k.gleis}`).toBeLessThan(400);
    }
  });
});
```

Am Kopf der Datei ergänzen:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
```

Run: `npm test -- synthmodell`
Expected: PASS

- [ ] **Step 6: Lint und volle Testrunde**

Run: `npm run lint && npm test`
Expected: keine Lint-Ausgabe, alle Tests grün

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "feat: Bahnsteige im Synthesemodell aus FaSta-Koordinaten verankern"
```

---

### Task 5: FaSta beim Graphbau anschließen

Bis hierhin kommen die Anlagen nirgends an: `baueGraphEintrag` baut den gecachten Graphen weiterhin ohne sie. Jetzt wird FaSta gerufen – **nur** wenn ein Bahnhof wirklich auf Stufe 3 fällt.

**Files:**
- Modify: `backend/src/routes/api.ts:528-560` (`baueGraphEintrag`)
- Modify: `backend/src/routes/api.ts:330` (Aufrufstelle)
- Test: `backend/test/degradation.test.ts` (ergänzend)

**Interfaces:**
- Consumes: `syntheseGraph(info, anlagen)` aus Task 4; `FastaFn` aus `api.ts:55`
- Produces: `baueGraphEintrag(info: StationsInfo, overpass: OverpassFn, fasta: FastaFn, log: FastifyBaseLogger): Promise<GraphEintrag>`

- [ ] **Step 1: Write the failing test**

Ans Ende von `backend/test/degradation.test.ts` anfügen:

```ts
describe('FaSta-Geometrie im Graphbau (§5)', () => {
  it('wird bei Stufe 3 gerufen und verankert den Bahnsteig', async () => {
    const fasta = vi.fn(async () => [
      { id: 'a1', typ: 'AUFZUG' as const, lat: 52.0018, lon: 12.0, status: 'ACTIVE' as const, beschreibung: 'zu Gleis 1/2' },
    ]);
    const app = await buildApp(macheClients({ overpass: vi.fn(async () => ({ elements: [] })), fasta }));
    const antwort = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(antwort.statusCode).toBe(200);
    expect(fasta, 'FaSta muss beim Stufe-3-Bau gerufen werden').toHaveBeenCalledWith('4711');
    await app.close();
  });

  it('ohne stationID faellt es auf das heutige Modell zurueck', async () => {
    const fasta = vi.fn(async () => []);
    const ohneNummer = { ...ministadt, stationID: undefined };
    const app = await buildApp(
      macheClients({
        overpass: vi.fn(async () => ({ elements: [] })),
        fasta,
        stations: { holeStationsInfo: vi.fn(async () => ohneNummer), sucheBahnhoefe: vi.fn(async () => []), ermittleGruppe: vi.fn(async () => ['8000001']) },
      }),
    );
    const antwort = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(antwort.statusCode).toBe(200);
    expect(fasta, 'ohne Bahnhofsnummer gar nicht erst fragen').not.toHaveBeenCalled();
    await app.close();
  });

  it('ein FaSta-Ausfall kostet keine Route', async () => {
    const fasta = vi.fn(async () => {
      throw new Error('FaSta: HTTP 503');
    });
    const app = await buildApp(macheClients({ overpass: vi.fn(async () => ({ elements: [] })), fasta }));
    const antwort = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(antwort.statusCode, 'Degradieren statt ausfallen').toBe(200);
    await app.close();
  });

  it('bei Stufe 1/2 wird FaSta fuer die Geometrie NICHT gerufen', async () => {
    const fasta = vi.fn(async () => []);
    // miniOsm liefert brauchbare OSM-Daten -> nicht Stufe 3.
    const app = await buildApp(macheClients({ fasta }));
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(fasta).not.toHaveBeenCalled();
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- degradation`
Expected: FAIL – `expected "fasta" to be called with arguments: [ '4711' ]`, weil `baueGraphEintrag` FaSta gar nicht kennt

- [ ] **Step 3: Write minimal implementation**

In `backend/src/routes/api.ts` `baueGraphEintrag` ersetzen:

```ts
async function baueGraphEintrag(
  info: StationsInfo,
  overpass: OverpassFn,
  fasta: FastaFn,
  log: FastifyBaseLogger,
): Promise<GraphEintrag> {
  let grund = 'keine Koordinaten zum Bahnhof';
  if (info.lat !== undefined && info.lon !== undefined) {
    try {
      const osm = await overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      const graph = baueGraph(osm);
      graph.stufe = klassifiziere(graph);
      if (graph.stufe !== 3) {
        return { graph, info, hinweise: [] };
      }
      grund = 'OSM-Daten unbrauchbar (Stufe 3 nach Klassifikation)';
    } catch (e) {
      grund = `Overpass nicht erreichbar: ${String(e)}`;
    }
  }
  log.warn(
    { degradation: 'kartendaten-fehlen', eva: info.eva, bahnhof: info.name, grund },
    'Rueckfall auf das Standardmodell',
  );

  // §5: FaSta ist die einzige verbliebene Quelle mit echten Koordinaten - der
  // platforms-Endpunkt fuehrt keine. Gerufen wird NUR hier, im Stufe-3-Fall,
  // und damit hoechstens einmal je Graphbau (Frist 10 min); der
  // 5-Minuten-Clientcache liegt darunter.
  //
  // Was hier in den Cache geht, sind KOORDINATEN - die sind stabil. Der
  // Betriebsstatus geht es nicht; den legt `wendeFastaAn` pro Anfrage auf
  // einer Kopie nach.
  let anlagen: FastaAnlage[] = [];
  if (!info.stationID) {
    // Ohne Bahnhofsnummer gar nicht erst fragen: Die EVA quittiert FaSta mit
    // HTTP 200 und leerer Liste - nicht von "keine Aufzuege" zu unterscheiden.
    log.warn(
      { degradation: 'fasta-geometrie-fehlt', eva: info.eva, grund: 'keine stationID' },
      'Standardmodell ohne FaSta-Koordinaten',
    );
  } else {
    try {
      anlagen = await fasta(info.stationID);
    } catch (e) {
      log.warn(
        { degradation: 'fasta-geometrie-fehlt', eva: info.eva, stationsnummer: info.stationID, grund: String(e) },
        'Standardmodell ohne FaSta-Koordinaten',
      );
    }
  }

  return {
    graph: syntheseGraph(info, anlagen),
    info,
    hinweise: ['Kartendaten nicht verfügbar – Standardmodell mit ungefähren Angaben.'],
  };
}
```

Die Aufrufstelle (`api.ts:330`) mitziehen:

```ts
          const gebaut = await buendle(laufendeGraphbauten, bahnhofSchluessel, () =>
            baueGraphEintrag(info, clients.overpass, clients.fasta, req.log),
          );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- degradation`
Expected: PASS

- [ ] **Step 5: Prüfen, dass der Status nicht im Cache landet**

Der Gleis-Rückfall in `api.ts:475` reicht `fastaAnlagen` an `syntheseGraph` weiter. Da `syntheseGraph` seit Task 4 keinen Status mehr einträgt, ist das unschädlich – aber der Kommentar dort („Anlagen weiterreichen, damit der Betriebsstatus auch im Rückfall gilt") ist jetzt falsch. Ersetzen durch:

```ts
        // Anlagen weiterreichen, damit auch der Rueckfallgraph verankert ist.
        // Den Status legt wendeFastaAn oben schon auf der Kopie nach.
        graph = syntheseGraph(eintrag.info, fastaAnlagen);
```

Run: `npm run lint && npm test`
Expected: keine Lint-Ausgabe, alle Tests grün

- [ ] **Step 6: Die Cache-Naht absichern**

Der eigentliche Beweis, dass Koordinaten und Status getrennt sind: **derselbe** gecachte Graph muss zwei Anfragen mit unterschiedlichem Live-Status unterschiedlich beantworten. Ans Ende von `backend/test/cache.test.ts` anfügen:

```ts
describe('FaSta: Koordinaten gecacht, Status nicht', () => {
  it('derselbe Graph beantwortet zwei Anfragen mit unterschiedlichem Status verschieden', async () => {
    const overpass = vi.fn(async () => ({ elements: [] }));
    let status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';
    const fasta = vi.fn(async () => [
      { id: 'a1', typ: 'AUFZUG' as const, lat: 52.0, lon: 12.0, status, beschreibung: 'zu Gleis 1/2' },
    ]);
    const app = await buildApp(macheClients({ overpass, fasta }));
    const url = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=barrierefrei';

    const ersteAntwort = await app.inject({ method: 'GET', url });
    expect(ersteAntwort.statusCode).toBe(200);

    // Aufzug faellt aus. Der Graph bleibt im Cache - Overpass darf NICHT
    // erneut gefragt werden -, aber die Sperrung muss durchschlagen.
    status = 'INACTIVE';
    const zweiteAntwort = await app.inject({ method: 'GET', url });

    expect(overpass, 'der Graph kam aus dem Cache').toHaveBeenCalledTimes(1);
    expect(zweiteAntwort.statusCode, 'gesperrter Aufzug -> keine barrierefreie Route').toBe(404);
    await app.close();
  });
});
```

Der Helfer `macheClients` liegt in `test/degradation.test.ts`; wenn `cache.test.ts` einen eigenen Aufbau hat, den dortigen benutzen und nur `fasta` ergänzen.

Run: `npm test -- cache`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "feat: FaSta-Koordinaten beim Stufe-3-Graphbau ziehen"
```

---

### Task 6: README nachziehen

Das README ist in diesem Repo das Arbeitsprotokoll, nicht nur eine Beschreibung. ToDo 7b wird geschlossen und der Befund festgehalten.

**Files:**
- Modify: `README.md:242` (Zeile 7b in der Tabelle „Als Nächstes")
- Modify: `README.md:1880` (Punkt 5 unter „Was als Nächstes drankommt")
- Modify: `README.md:1958-1967` (Abschnitt §5)
- Modify: `README.md` – neuer Abschnitt mit dem Sondierungsbefund

- [ ] **Step 1: Tabellenzeile 7b auf erledigt setzen**

```markdown
| ~~7b~~ | ~~**§5 FaSta-Koordinaten im Synthesemodell**~~ ✅ **erledigt 05.09.2026** | Die Zuordnung kommt aus `description` („zu Gleis 15/16" = Bahnsteig 15/16), nicht aus der Geometrie – geometrisches Clustern wäre nachweislich falsch gewesen. Siehe „Was FaSta wirklich liefert“. |
```

- [ ] **Step 2: Punkt 5 der Dringlichkeitsliste umschreiben**

```markdown
5. ~~**§5 – FaSta-Koordinaten (ToDo 7b).**~~ ✅ erledigt 05.09.2026.
```

- [ ] **Step 3: Neuen Abschnitt „Was FaSta wirklich liefert" ergänzen**

**Keine Zahl neu erfinden.** Die Messtabelle steht fertig in Abschnitt 2 der Spec (`docs/superpowers/specs/2026-09-05-fasta-koordinaten-design.md`) und wird von dort übernommen. Inhalt:

- Die Messtabelle der fünf Bahnhöfe (Anlagen, Gleisbezug, Bahnsteige, Nachbarabstand)
- Warum geometrisches Clustern verworfen wurde: Berlins 339 m kommen von Parkhäusern und Tram
- Das Fixture war handgebaut **und hatte die falsche Form** (blankes Array statt `{facilities}`)
- `state: UNKNOWN` kommt wirklich vor – die konservative Abbildung ist damit belegt
- Die zwei Parserfallen mit ihren Rohtexten
- Der Fund aus der Selbstprüfung: `wendeFastaAn` hätte den Status an 280-m-Bahnsteigen still verworfen
- Die gemessenen 20 m statt der geratenen 15 m

- [ ] **Step 4: ToDo 10 (Spike-Nachlauf) um den FaSta-Nachlauf ergänzen**

```markdown
| 10b | **FaSta-Verbindungsanlagen auswerten** | Anlagen, die ZWEI Bahnsteige nennen („Gleis 5/6 (C/D) - Gleis 11/12“), sind die Querung selbst – 6 von 69 in Berlin. Sie tragen aber nur einen Punkt, und eine Verbindung braucht zwei. Bewusst ausgelassen (§5-Spec, Abschnitt 9). |
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: ToDo 7b schliessen, Sondierungsbefund festhalten"
```

---

## Abschluss

- [ ] **Volle Prüfung**

```bash
cd backend && npm run lint && npm test
```
Expected: keine Lint-Ausgabe, alle Tests grün

- [ ] **Zweig prüfen**

```bash
git log --oneline feat/mvp -8
```
Expected: sechs Commits dieses Plans über `6d0ba62` (der Spec)
