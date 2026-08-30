# Schrittnavigation im Bahnhof – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Nutzer sieht unterwegs, auf welchem Schritt seiner Route er ist, und die Karte zeigt genau diesen Schritt – auf der richtigen Ebene, im richtigen Ausschnitt.

**Architecture:** Das Backend liefert je Schritt drei zusätzliche Felder aus, die `baueSegmente()` bereits kennt und heute verwirft: Gehzeit, Ebene und Pfadbereich. Im Frontend bestimmt ein reines Modul `navigation/` aus Schritten, Startzeit und Nutzerkorrektur den aktiven Schritt; Schrittliste und Karte leiten ihre Darstellung daraus ab. Kein Sitzungszustand im Backend, keine neue Datenquelle, keine neue Berechtigung.

**Tech Stack:** Backend Node ≥20 · Fastify 5 · TypeScript strict · vitest 3. Frontend React 19 · Vite 8 · TypeScript ~6.0 · MapLibre GL 6 · vitest 3.

**Spec:** [`docs/superpowers/specs/2026-08-30-schrittnavigation-design.md`](../specs/2026-08-30-schrittnavigation-design.md)

## Global Constraints

- **Commit nur bei grüner Suite.** `cd backend && npm test` (aktuell 138) und `cd frontend && npm test` (aktuell 22) müssen vollständig grün sein.
- **Backend-Imports tragen `.js`-Endungen** (ESM/NodeNext), auch für `.ts`-Quellen: `import { x } from './datei.js'`.
- **Frontend-Stilkonvention:** `.ts`-Logikdateien mit Semikolon (wie `src/api/client.ts`), `.tsx`-Komponenten ohne Semikolon (wie `src/App.tsx`). Frontend-Imports **ohne** Dateiendung.
- **Bezeichner und UI-Texte auf Deutsch**, wie im gesamten Projekt.
- **Keine Zahlenliterale für Schwellenwerte** im Frontend – ausschließlich Konstanten aus `navigation/schwellen.ts` bzw. `standort/schwellen.ts`.
- **Alle neuen `Schritt`-Felder sind optional** (`?`). Eine ältere Backend-Version darf das Frontend nicht brechen; die Degradationstabelle in Spec Abschnitt 8 ist bindend.
- **`frontend/src/api/typen.ts` spiegelt `backend/src/core/typen.ts`.** Jede Typänderung dort muss hier nachgezogen werden – der Kopfkommentar sagt das bereits.
- **oxlint darf nicht schlechter werden.** Stand: 4 Warnungen (`Zugauswahl.tsx:23`, `Eingabe.tsx:72`, `Eingabe.tsx:80`, `App.tsx` purity). Neue Warnungen sind zu beheben, nicht zu übernehmen.

---

## Dateistruktur

**Backend**

| Datei | Verantwortung |
|---|---|
| `src/core/gehzeit.ts` | *ändern* – `verteileGehzeit()` ergänzen: Sekunden je Segment mit kumulativer Rundung |
| `src/core/textgen.ts` | *ändern* – `Segment` und `Schritt` um `sekunden`, `level`, `knotenVon`, `knotenBis` |
| `src/core/typen.ts` | *ändern* – `Schritt` um vier optionale Felder |
| `src/routes/api.ts` | *ändern* – `profil` an `generiereSchritte` durchreichen |
| `test/gehzeit.test.ts` | *ändern* – Tests für `verteileGehzeit` |
| `test/textgen.test.ts` | *ändern* – Tests für die neuen Felder, inkl. Invariante |

**Frontend**

| Datei | Verantwortung |
|---|---|
| `src/api/typen.ts` | *ändern* – gespiegelte `Schritt`-Felder |
| `src/navigation/schwellen.ts` | *neu* – `MINDEST_SCHRITT_MS`, sonst nichts |
| `src/navigation/fortschritt.ts` | *neu* – `aktiverSchritt()`, rein |
| `src/navigation/fortschritt.test.ts` | *neu* – Zeitgrenzen, Versatz, Degradation |
| `src/components/Schrittliste.tsx` | *ändern* – aktiver Schritt hervorgehoben |
| `src/components/Schrittsteuerung.tsx` | *neu* – „Zurück"/„Weiter", große Flächen |
| `src/components/Bahnhofsschema.tsx` | *neu* – SVG-Prinzipskizze für Stufe 3 |
| `src/components/Karte.tsx` | *ändern* – Ebene, Ausschnitt und Einfärbung aus dem aktiven Schritt |
| `src/App.tsx` | *ändern* – Startzeit, Versatz, Verdrahtung |
| `src/App.css` | *ändern* – Stile für aktiven Schritt, Steuerung, Schema |

---

### Task 1: `verteileGehzeit` – Sekunden je Segment ohne Rundungsdrift

`gehzeitSekunden` rundet **einmal am Ende**: `Math.round(Σlänge / v) + Σzuschläge`. Rundet man je Segment einzeln, weicht die Summe davon ab – bei 30 Schritten um mehrere Sekunden. Die Spec verlangt aber, dass die Summe der Schrittzeiten exakt `gehzeitSek` ergibt, weil sonst Ampel und Schrittanzeige auseinanderlaufen.

Lösung: kumulative Rundung. Für Segment *i* wird die gerundete Gesamtzeit bis einschließlich *i* berechnet und davon die bis *i−1* abgezogen. Die Summe der Differenzen ist per Konstruktion die gerundete Gesamtsumme.

**Files:**
- Modify: `backend/src/core/gehzeit.ts`
- Test: `backend/test/gehzeit.test.ts`

**Interfaces:**
- Consumes: `Gehprofil`, `KantenTyp` aus `core/typen.js`.
- Produces: `verteileGehzeit(segmente: { laengeM: number; typ: KantenTyp }[], profil: Gehprofil): number[]` – ein Eintrag je Segment, Summe identisch zu `gehzeitSekunden` über dieselben Kanten.

- [ ] **Step 1: Failing Tests schreiben**

An `backend/test/gehzeit.test.ts` anhängen:

```ts
describe('verteileGehzeit', () => {
  it('verteilt auf ein Segment die volle Zeit', () => {
    const werte = verteileGehzeit([{ laengeM: 100, typ: 'eben' }], 'normal');
    expect(werte).toEqual([100]);
  });

  it('rechnet den Zuschlag je Segmenttyp dazu', () => {
    // 10 m bei 1,0 m/s = 10 s, Treppenzuschlag 20 s
    const werte = verteileGehzeit([{ laengeM: 10, typ: 'treppe' }], 'normal');
    expect(werte).toEqual([30]);
  });

  it('haelt die Summe exakt auf gehzeitSekunden – auch bei krummen Laengen', () => {
    const segmente = [
      { laengeM: 3.7, typ: 'eben' as const },
      { laengeM: 3.7, typ: 'eben' as const },
      { laengeM: 3.7, typ: 'eben' as const },
    ];
    const werte = verteileGehzeit(segmente, 'normal');
    const summe = werte.reduce((a, b) => a + b, 0);
    // Einzeln gerundet waere jedes 4 s, in Summe 12 – richtig sind 11.
    expect(summe).toBe(Math.round((3.7 * 3) / 1.0));
    expect(summe).toBe(11);
  });

  it('liefert nie negative Werte', () => {
    const segmente = Array.from({ length: 20 }, () => ({ laengeM: 0.4, typ: 'eben' as const }));
    for (const w of verteileGehzeit(segmente, 'zuegig')) {
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('beruecksichtigt das Gehprofil', () => {
    const schnell = verteileGehzeit([{ laengeM: 140, typ: 'eben' }], 'zuegig');
    const langsam = verteileGehzeit([{ laengeM: 140, typ: 'eben' }], 'langsam');
    expect(schnell[0]).toBeLessThan(langsam[0]);
  });

  it('leere Eingabe → leeres Ergebnis', () => {
    expect(verteileGehzeit([], 'normal')).toEqual([]);
  });
});
```

Die Importzeile am Dateikopf um `verteileGehzeit` ergänzen.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd backend && npx vitest run test/gehzeit.test.ts`
Expected: FAIL – `verteileGehzeit is not a function`.

- [ ] **Step 3: Implementieren**

In `backend/src/core/gehzeit.ts` hinter `gehzeitSekunden` einfügen:

```ts
/**
 * Gehzeit je Segment. Die Summe ist EXAKT gleich `gehzeitSekunden` ueber
 * dieselben Kanten – deshalb kumulative Rundung statt Rundung je Segment:
 * `gehzeitSekunden` rundet einmal am Ende, und Sum(round(x_i)) weicht davon
 * ab. Bei 30 Schritten summiert sich das auf mehrere Sekunden, und dann
 * widersprechen sich Ampel und Schrittanzeige.
 */
export function verteileGehzeit(
  segmente: { laengeM: number; typ: KantenTyp }[],
  profil: Gehprofil,
): number[] {
  const v = GESCHWINDIGKEIT[profil];
  let laengeBisher = 0;
  let gerundetBisher = 0;
  return segmente.map((segment) => {
    laengeBisher += segment.laengeM;
    const gerundet = Math.round(laengeBisher / v);
    const anteil = gerundet - gerundetBisher;
    gerundetBisher = gerundet;
    return anteil + (ZUSCHLAG[segment.typ] ?? 0);
  });
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `cd backend && npm test && npm run lint`
Expected: PASS – 6 neue Tests grün, 144 gesamt, `tsc --noEmit` sauber.

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/gehzeit.ts backend/test/gehzeit.test.ts
git commit -m "feat: verteileGehzeit - Sekunden je Segment ohne Rundungsdrift"
```

---

### Task 2: `sekunden` und `level` je Schritt

**Files:**
- Modify: `backend/src/core/typen.ts`
- Modify: `backend/src/core/textgen.ts`
- Modify: `backend/src/routes/api.ts`
- Modify: `frontend/src/api/typen.ts`
- Test: `backend/test/textgen.test.ts`

**Interfaces:**
- Consumes: `verteileGehzeit` (Task 1).
- Produces: `Schritt` mit `sekunden?: number` und `level?: number`; `TextOptionen` mit `profil?: Gehprofil`.

- [ ] **Step 1: Typ erweitern**

In `backend/src/core/typen.ts` das Interface `Schritt` ersetzen:

```ts
export interface Schritt {
  text: string; // fertiger deutscher Anweisungssatz
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number; // auf 10 m gerundet, nur bei eben/rampe
  /** Gehzeit dieses Schritts. Summe aller Schritte = gehzeitSek (Invariante). */
  sekunden?: number;
  /** Ebene, auf der der Schritt ENDET – bei einem Wechsel die Zielebene. */
  level?: number;
}
```

- [ ] **Step 2: Failing Tests schreiben**

An `backend/test/textgen.test.ts` anhängen:

```ts
describe('Schritte tragen Zeit und Ebene', () => {
  it('jeder Schritt hat sekunden, und die Summe ist die Gehzeit', () => {
    const pfad = beispielPfad();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    for (const s of schritte) expect(typeof s.sekunden).toBe('number');
    const summe = schritte.reduce((a, s) => a + (s.sekunden ?? 0), 0);
    expect(summe).toBe(gehzeitSekunden(pfad, 'normal'));
  });

  it('level ist die ZIEL-Ebene eines Ebenenwechsels, nicht die Ausgangsebene', () => {
    const pfad = pfadMitTreppeVon0Nach1();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    const treppe = schritte.find((s) => s.typ === 'treppe');
    expect(treppe?.level).toBe(1);
  });

  it('ohne profil bleiben sekunden undefiniert – Rueckwaertskompatibilitaet', () => {
    const schritte = generiereSchritte(beispielPfad());
    expect(schritte[0].sekunden).toBeUndefined();
    expect(schritte[0].level).toBeDefined();
  });
});
```

`beispielPfad()` und `pfadMitTreppeVon0Nach1()` aus den vorhandenen Hilfsfunktionen der Datei aufbauen; existiert nur eine, die zweite analog danebenlegen. `gehzeitSekunden` importieren.

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd backend && npx vitest run test/textgen.test.ts`
Expected: FAIL – `sekunden` ist `undefined`, `level` ist `undefined`.

- [ ] **Step 4: Implementieren**

In `backend/src/core/textgen.ts`:

`TextOptionen` erweitern:

```ts
export interface TextOptionen {
  /** Stufe 3 (Synthesemodell): Distanzen sind Schätzungen → Präfix „ca. ". */
  ungefaehr?: boolean;
  /** Ohne Profil bleibt `sekunden` undefiniert (aeltere Aufrufer). */
  profil?: Gehprofil;
}
```

Importe ergänzen:

```ts
import { verteileGehzeit } from './gehzeit.js';
import type { Gehprofil } from './typen.js';
```

In `generiereSchritte` hinter `const segmente = baueSegmente(pfad);` einfügen:

```ts
  const zeiten = optionen.profil ? verteileGehzeit(segmente, optionen.profil) : null;
```

Die `schritte.push`-Zeile ersetzen:

```ts
    schritte.push({
      text,
      typ: segment.typ,
      ...(distanzM !== undefined ? { distanzM } : {}),
      ...(zeiten ? { sekunden: zeiten[schritte.length] } : {}),
      level: segment.zielLevel,
    });
```

`zeiten[schritte.length]` trifft, weil je Segment genau ein Schritt entsteht und `schritte.length` vor dem Push dem Segmentindex entspricht.

- [ ] **Step 5: `profil` durchreichen**

In `backend/src/routes/api.ts` den Aufruf ersetzen:

```ts
      schritte: generiereSchritte(pfad, { ungefaehr: graph.stufe === 3, profil }),
```

- [ ] **Step 6: Frontend-Typ spiegeln**

In `frontend/src/api/typen.ts` das Interface `Schritt` ersetzen:

```ts
export interface Schritt {
  text: string;
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number;
  /** Gehzeit dieses Schritts. Summe aller Schritte = gehzeitSek. */
  sekunden?: number;
  /** Ebene, auf der der Schritt endet. */
  level?: number;
}
```

- [ ] **Step 7: Alles grün**

Run: `cd backend && npm test && npm run lint`
Run: `cd frontend && npm run build`
Expected: PASS – 147 Backend-Tests, Frontend-Build sauber.

- [ ] **Step 8: Commit**

```bash
git add backend/src/core/typen.ts backend/src/core/textgen.ts backend/src/routes/api.ts backend/test/textgen.test.ts frontend/src/api/typen.ts
git commit -m "feat: Schritte tragen Gehzeit und Ebene (Spec Abschnitt 4)"
```

---

### Task 3: `knotenVon` / `knotenBis` – der Bezug zur Geometrie

`baueSegmente` verschmilzt benachbarte `eben`-Kanten. Damit die Karte das Teilstück eines Schritts zeichnen kann, muss jedes Segment festhalten, welchen Bereich des Pfads es abdeckt. `kanten[i]` verbindet `knoten[i]` und `knoten[i+1]` – ein Segment von Kante *i* bis Kante *j* deckt also `knoten[i]` bis `knoten[j+1]` ab.

**Files:**
- Modify: `backend/src/core/typen.ts`
- Modify: `backend/src/core/textgen.ts`
- Modify: `frontend/src/api/typen.ts`
- Test: `backend/test/textgen.test.ts`

**Interfaces:**
- Produces: `Schritt` mit `knotenVon?: number` und `knotenBis?: number`.

- [ ] **Step 1: Failing Tests schreiben**

An `backend/test/textgen.test.ts` anhängen:

```ts
describe('Schritte verweisen auf ihren Pfadbereich', () => {
  it('deckt den Pfad lueckenlos und ohne Ueberschneidung ab', () => {
    const pfad = beispielPfad();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    expect(schritte[0].knotenVon).toBe(0);
    expect(schritte[schritte.length - 1].knotenBis).toBe(pfad.knoten.length - 1);
    for (let i = 1; i < schritte.length; i++) {
      expect(schritte[i].knotenVon).toBe(schritte[i - 1].knotenBis);
    }
  });

  it('ein verschmolzenes Segment umfasst mehrere Knoten', () => {
    const pfad = beispielPfad();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    const spannen = schritte.map((s) => (s.knotenBis ?? 0) - (s.knotenVon ?? 0));
    expect(Math.max(...spannen)).toBeGreaterThanOrEqual(1);
    for (const spanne of spannen) expect(spanne).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd backend && npx vitest run test/textgen.test.ts`
Expected: FAIL – `knotenVon` ist `undefined`.

- [ ] **Step 3: Implementieren**

In `backend/src/core/typen.ts` das Interface `Schritt` um zwei Felder ergänzen:

```ts
  /** Indexbereich im Routenpfad – daraus zeichnet die Karte das Teilstueck. */
  knotenVon?: number;
  knotenBis?: number;
```

In `backend/src/core/textgen.ts` das Interface `Segment` erweitern:

```ts
interface Segment {
  typ: KantenTyp;
  laengeM: number;
  peilungStart: number | null; // null = senkrecht (Aufzug ohne Ortsversatz)
  peilungEnde: number | null;
  deltaLevel: number;
  zielLevel: number;
  knotenVon: number;
  knotenBis: number;
}
```

Im Verschmelzungszweig von `baueSegmente` hinter `letztes.zielLevel = nach.level;` einfügen:

```ts
      letztes.knotenBis = i + 1;
```

Im `segmente.push`-Aufruf ergänzen:

```ts
      knotenVon: i,
      knotenBis: i + 1,
```

In `generiereSchritte` den `schritte.push`-Aufruf um die beiden Felder erweitern:

```ts
      knotenVon: segment.knotenVon,
      knotenBis: segment.knotenBis,
```

- [ ] **Step 4: Frontend-Typ spiegeln**

In `frontend/src/api/typen.ts` an `Schritt` anhängen:

```ts
  /** Indexbereich im Routenpfad. */
  knotenVon?: number;
  knotenBis?: number;
```

- [ ] **Step 5: Alles grün**

Run: `cd backend && npm test && npm run lint`
Run: `cd frontend && npm run build`
Expected: PASS – 149 Backend-Tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/core/typen.ts backend/src/core/textgen.ts backend/test/textgen.test.ts frontend/src/api/typen.ts
git commit -m "feat: Schritte verweisen auf ihren Bereich im Routenpfad"
```

---

### Task 4: `navigation/fortschritt.ts` – der aktive Schritt

**Files:**
- Create: `frontend/src/navigation/schwellen.ts`
- Create: `frontend/src/navigation/fortschritt.ts`
- Test: `frontend/src/navigation/fortschritt.test.ts`

**Interfaces:**
- Consumes: `Schritt` aus `../api/typen` (Tasks 2 und 3).
- Produces: `aktiverSchritt(schritte: Schritt[], startZeitMs: number, jetztMs: number, versatz: number): number`

- [ ] **Step 1: Schwellenwert anlegen**

Create `frontend/src/navigation/schwellen.ts`:

```ts
// Schwellenwerte der Schrittnavigation. Begruendung in der Spec, Abschnitt 5.

/**
 * Untergrenze der Anzeigedauer je Schritt. Ein Schritt wie „wenige Meter
 * rechts" hat wenige Sekunden Gehzeit und waere vorbei, bevor der Nutzer
 * hinsieht. Wirkt NUR auf die Anzeige – die Gehzeit und damit die Ampel
 * bleiben unberuehrt. Startwert, in der Mobilabnahme nachzujustieren.
 */
export const MINDEST_SCHRITT_MS = 8_000;
```

- [ ] **Step 2: Failing Tests schreiben**

Create `frontend/src/navigation/fortschritt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aktiverSchritt } from './fortschritt';
import type { Schritt } from '../api/typen';

/** Drei Schritte a 30 s – deutlich ueber MINDEST_SCHRITT_MS. */
function schritte(): Schritt[] {
  return [
    { text: 'eins', typ: 'eben', sekunden: 30 },
    { text: 'zwei', typ: 'treppe', sekunden: 30 },
    { text: 'drei', typ: 'eben', sekunden: 30 },
  ];
}

describe('aktiverSchritt', () => {
  it('startet beim ersten Schritt', () => {
    expect(aktiverSchritt(schritte(), 1000, 1000, 0)).toBe(0);
  });

  it('bleibt bis zur Sekunde vor dem Uebergang beim ersten', () => {
    expect(aktiverSchritt(schritte(), 0, 29_999, 0)).toBe(0);
  });

  it('wechselt exakt am Uebergang', () => {
    expect(aktiverSchritt(schritte(), 0, 30_000, 0)).toBe(1);
  });

  it('erreicht den letzten Schritt', () => {
    expect(aktiverSchritt(schritte(), 0, 65_000, 0)).toBe(2);
  });

  it('laeuft nicht ueber das Listenende hinaus', () => {
    expect(aktiverSchritt(schritte(), 0, 999_999, 0)).toBe(2);
  });

  it('vor der Startzeit bleibt es beim ersten Schritt', () => {
    expect(aktiverSchritt(schritte(), 10_000, 0, 0)).toBe(0);
  });

  it('der Versatz verschiebt den Vorschlag nach vorn', () => {
    expect(aktiverSchritt(schritte(), 0, 0, 2)).toBe(2);
  });

  it('der Versatz verschiebt auch zurueck', () => {
    expect(aktiverSchritt(schritte(), 0, 65_000, -2)).toBe(0);
  });

  it('der Versatz wird an beiden Enden begrenzt', () => {
    expect(aktiverSchritt(schritte(), 0, 0, -5)).toBe(0);
    expect(aktiverSchritt(schritte(), 0, 0, 99)).toBe(2);
  });

  it('sehr kurze Schritte bekommen die Mindestanzeigedauer', () => {
    const kurz: Schritt[] = [
      { text: 'kurz', typ: 'eben', sekunden: 2 },
      { text: 'lang', typ: 'eben', sekunden: 60 },
    ];
    // Ohne Untergrenze waere nach 3 s schon Schritt 2 dran.
    expect(aktiverSchritt(kurz, 0, 3_000, 0)).toBe(0);
    expect(aktiverSchritt(kurz, 0, 8_000, 0)).toBe(1);
  });

  it('ohne sekunden zaehlt allein der Versatz – Degradation', () => {
    const ohneZeit: Schritt[] = [
      { text: 'eins', typ: 'eben' },
      { text: 'zwei', typ: 'eben' },
    ];
    expect(aktiverSchritt(ohneZeit, 0, 999_999, 0)).toBe(0);
    expect(aktiverSchritt(ohneZeit, 0, 999_999, 1)).toBe(1);
  });

  it('leere Schrittliste → 0', () => {
    expect(aktiverSchritt([], 0, 1000, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/navigation/fortschritt.test.ts`
Expected: FAIL – `Failed to resolve import "./fortschritt"`.

- [ ] **Step 4: Implementieren**

Create `frontend/src/navigation/fortschritt.ts`:

```ts
import type { Schritt } from '../api/typen';
import { MINDEST_SCHRITT_MS } from './schwellen';

/** Auf [0, laenge-1] begrenzen; leere Liste ergibt 0. */
function begrenze(index: number, laenge: number): number {
  if (laenge === 0) return 0;
  return Math.min(Math.max(index, 0), laenge - 1);
}

/**
 * Welcher Schritt ist gerade dran?
 *
 * Rein: Die Zeit kommt als Parameter herein, damit die Logik ohne Fake-Timer
 * pruefbar ist – dieselbe Entscheidung wie bei pruefeAnkunft.
 *
 * `versatz` ist die Summe der Nutzerkorrekturen und wirkt DAUERHAFT: Die Uhr
 * schlaegt vor, der Mensch entscheidet, und seine Entscheidung wird nicht von
 * der naechsten Zeitschaetzung ueberstimmt.
 *
 * Fehlt auch nur einem Schritt `sekunden` (aeltere Backend-Version), wird gar
 * nicht geschaetzt – dann zaehlt allein der Versatz, also reines manuelles
 * Weiterschalten. Halbe Schaetzungen waeren schlimmer als keine.
 */
export function aktiverSchritt(
  schritte: Schritt[],
  startZeitMs: number,
  jetztMs: number,
  versatz: number,
): number {
  if (schritte.length === 0) return 0;

  const zeitgesteuert = schritte.every((s) => typeof s.sekunden === 'number');
  if (!zeitgesteuert) return begrenze(versatz, schritte.length);

  const verstrichen = Math.max(0, jetztMs - startZeitMs);
  let summe = 0;
  let ausZeit = schritte.length - 1;
  for (let i = 0; i < schritte.length; i++) {
    summe += Math.max((schritte[i].sekunden ?? 0) * 1000, MINDEST_SCHRITT_MS);
    if (verstrichen < summe) {
      ausZeit = i;
      break;
    }
  }
  return begrenze(ausZeit + versatz, schritte.length);
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd frontend && npm test && npm run build && npm run lint`
Expected: PASS – 13 neue Tests grün, 35 gesamt, oxlint weiterhin bei 4 Warnungen.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/navigation/
git commit -m "feat: aktiverSchritt - Fortschritt entlang der Route (Spec Abschnitt 5)"
```

---

### Task 5: Schrittliste hervorheben und steuern

**Files:**
- Create: `frontend/src/components/Schrittsteuerung.tsx`
- Modify: `frontend/src/components/Schrittliste.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `aktiverSchritt` (Task 4).
- Produces: `Schrittliste` erhält `aktiv?: number`; `Schrittsteuerung({ position, anzahl, onZurueck, onWeiter })`.

- [ ] **Step 1: Steuerung anlegen**

Create `frontend/src/components/Schrittsteuerung.tsx`:

```tsx
interface SchrittsteuerungProps {
  position: number
  anzahl: number
  onZurueck: () => void
  onWeiter: () => void
}

// Grosse Flaechen statt Wischgesten: Wer mit Koffer in der einen und Handy in
// der anderen Hand laeuft, kann nicht wischen (Konzept Abschnitt 9).
export function Schrittsteuerung({ position, anzahl, onZurueck, onWeiter }: SchrittsteuerungProps) {
  return (
    <div className="schrittsteuerung">
      <button
        type="button"
        className="knopf-sekundaer"
        onClick={onZurueck}
        disabled={position <= 0}
      >
        Zurück
      </button>
      <span className="schritt-zaehler" role="status">
        Schritt {position + 1} von {anzahl}
      </span>
      <button
        type="button"
        className="knopf-sekundaer"
        onClick={onWeiter}
        disabled={position >= anzahl - 1}
      >
        Weiter
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Schrittliste um die Hervorhebung erweitern**

`frontend/src/components/Schrittliste.tsx` vollständig ersetzen:

```tsx
import type { Schritt } from '../api/typen'

const EBENENWECHSEL = new Set(['treppe', 'rolltreppe', 'aufzug', 'rampe'])

interface SchrittlisteProps {
  schritte: Schritt[]
  /** Index des aktiven Schritts; undefiniert = keine Hervorhebung. */
  aktiv?: number
}

// Nummerierte Schrittliste in großer Schrift – Text vor Karte (Konzept).
// Ebenenwechsel-Schritte bekommen eine dunkle Nummernkachel als Orientierung.
// Der aktive Schritt wird hervorgehoben, die übrigen bleiben lesbar: Der
// Nutzer soll den Weg im Ganzen behalten, nicht durch ein Guckloch laufen.
export function Schrittliste({ schritte, aktiv }: SchrittlisteProps) {
  return (
    <ol className="schrittliste">
      {schritte.map((schritt, i) => (
        <li
          className={`schritt${aktiv === i ? ' schritt-aktiv' : ''}${
            aktiv !== undefined && i < aktiv ? ' schritt-erledigt' : ''
          }`}
          key={`${i}-${schritt.text}`}
          aria-current={aktiv === i ? 'step' : undefined}
        >
          <span
            className={`schritt-nummer${EBENENWECHSEL.has(schritt.typ) ? ' ebenenwechsel' : ''}`}
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className="schritt-text">{schritt.text}</span>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 3: Stile ergänzen**

An `frontend/src/App.css` anhängen:

```css
/* Aktiver Schritt: kraeftig, erledigte gedaempft – der Weg bleibt im Ganzen
   sichtbar, die Gegenwart hebt sich ab. */
.schritt-aktiv {
  background: var(--color-accent-100);
  border: 2px solid var(--color-accent);
  font-size: 1.15rem;
}

.schritt-erledigt {
  opacity: 0.45;
}

.schrittsteuerung {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
}

.schrittsteuerung .knopf-sekundaer {
  flex: 1;
  min-height: 56px;
}

.schrittsteuerung .knopf-sekundaer:disabled {
  opacity: 0.4;
}

.schritt-zaehler {
  flex: 0 0 auto;
  font-size: 0.85rem;
  color: var(--color-neutral-600);
  text-align: center;
  min-width: 96px;
}
```

- [ ] **Step 4: In App verdrahten**

In `frontend/src/App.tsx` die Importe ergänzen:

```tsx
import { Schrittsteuerung } from './components/Schrittsteuerung'
import { aktiverSchritt } from './navigation/fortschritt'
```

Hinter dem Ankunfts-Effekt einfügen:

```tsx
  // Die Uhr laeuft ab dem Oeffnen der Routenansicht, NICHT ab der Berechnung –
  // zwischen "Route ansehen" und "losgehen" liegen oft Minuten.
  const [startZeit, setStartZeit] = useState<number | null>(null)
  const [versatz, setVersatz] = useState(0)

  useEffect(() => {
    if (ansicht !== 'route') return
    setStartZeit(Date.now())
    setVersatz(0)
  }, [ansicht, route])
```

Im Block `if (ansicht === 'route' && route && werte)` vor dem `return` einfügen:

```tsx
    const position = aktiverSchritt(route.schritte, startZeit ?? Date.now(), Date.now(), versatz)
```

Die Schrittliste ersetzen und die Steuerung darunter setzen:

```tsx
        <Schrittliste schritte={route.schritte} aktiv={position} />
        {route.schritte.length > 1 && (
          <Schrittsteuerung
            position={position}
            anzahl={route.schritte.length}
            onZurueck={() => setVersatz((v) => v - 1)}
            onWeiter={() => setVersatz((v) => v + 1)}
          />
        )}
```

Der bestehende 10-Sekunden-Countdown-Effekt rendert die Ansicht ohnehin regelmäßig neu; dadurch rückt der Vorschlag ohne zusätzlichen Timer weiter. Damit das auch ohne Zugauswahl geschieht, dessen Bedingung erweitern:

```tsx
  useEffect(() => {
    if (ansicht !== 'route') return
    const timer = window.setInterval(() => setTick((t) => t + 1), 10000)
    return () => window.clearInterval(timer)
  }, [ansicht])
```

- [ ] **Step 5: Build, Lint, Tests**

Run: `cd frontend && npm test && npm run build && npm run lint`
Expected: PASS – 35 Tests grün, oxlint bei höchstens 4 Warnungen. Meldet oxlint `set-state-in-effect` für den neuen Startzeit-Effekt, ist das zu beheben: Startzeit über `useRef` halten und beim Ansichtswechsel setzen, statt State zu schreiben.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Schrittsteuerung.tsx frontend/src/components/Schrittliste.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: aktiver Schritt hervorgehoben, Weiter/Zurueck-Steuerung"
```

---

### Task 6: Karte folgt dem aktiven Schritt

**Files:**
- Modify: `frontend/src/components/Karte.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Schritt.level`, `Schritt.knotenVon/knotenBis` (Tasks 2, 3).
- Produces: `KarteProps` erhält `aktiverSchritt?: Schritt | null`.

- [ ] **Step 1: Prop und Ebenenwahl**

In `frontend/src/components/Karte.tsx` `KarteProps` erweitern:

```tsx
interface KarteProps {
  /** GeoJSON-FeatureCollections je Ebene (Schlüssel = level), aus /api/route */
  karte: Record<string, unknown>
  /** Aktueller Geraetestandort; null = keiner verfuegbar. */
  standort?: Standort | null
  /** Aktiver Schritt – bestimmt Ebene und Ausschnitt. */
  aktiverSchritt?: Schritt | null
}
```

Import ergänzen:

```tsx
import type { Schritt } from '../api/typen'
```

Signatur ersetzen:

```tsx
export function Karte({ karte, standort, aktiverSchritt }: KarteProps) {
```

- [ ] **Step 2: Ebene automatisch nachziehen**

Hinter dem bestehenden Ebenen-Effekt einfügen:

```tsx
  // Die Ebene des aktiven Schritts uebernehmen – aber nur, solange der Nutzer
  // nicht selbst umgeschaltet hat. Sonst waere die Handbedienung wirkungslos.
  const manuellGewaehlt = useRef(false)
  useEffect(() => {
    if (manuellGewaehlt.current) return
    const level = aktiverSchritt?.level
    if (level === undefined) return
    const schluessel = String(level)
    if (ebenen.includes(schluessel)) setEbene(schluessel)
  }, [aktiverSchritt, ebenen])
```

Im `onClick` der Ebenen-Knöpfe die manuelle Wahl vermerken:

```tsx
                onClick={() => {
                  manuellGewaehlt.current = true
                  setEbene(e)
                }}
```

- [ ] **Step 3: Ausschnitt auf das Teilstück**

Hinter dem Ebenen-Effekt einfügen:

```tsx
  // Ausschnitt auf das Teilstueck des aktiven Schritts. Auf 390 px ist das der
  // Unterschied zwischen lesbar und nicht: Eine 400-m-Route als Ganzes zu
  // zeigen heisst, nichts davon zu zeigen.
  useEffect(() => {
    const map = mapRef.current
    const von = aktiverSchritt?.knotenVon
    const bis = aktiverSchritt?.knotenBis
    if (!map || von === undefined || bis === undefined) return
    const linie = alleKoordinaten(daten(ebene))
    const stueck = linie.slice(von, bis + 1)
    if (stueck.length === 0) return
    const grenzen = stueck.reduce((b, p) => b.extend(p), new LngLatBounds(stueck[0], stueck[0]))
    map.fitBounds(grenzen, { padding: 64, maxZoom: 19 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf Schrittwechsel reagieren
  }, [aktiverSchritt, ebene])
```

- [ ] **Step 4: In App durchreichen**

In `frontend/src/App.tsx` den Karten-Aufruf ersetzen:

```tsx
            <Karte
              karte={route.karte}
              standort={standort}
              aktiverSchritt={route.schritte[position] ?? null}
            />
```

- [ ] **Step 5: Build, Lint, Tests**

Run: `cd frontend && npm test && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Karte.tsx frontend/src/App.tsx
git commit -m "feat: Karte folgt dem aktiven Schritt (Ebene und Ausschnitt)"
```

---

### Task 7: Stufe-3-Schema statt Landkarte

Bei Stufe 3 ist die Geometrie innerhalb des Bahnhofs geschätzt. Eine geografische Karte darüber behauptet eine Vermessung, die nicht stattgefunden hat – am 29.08.2026 sichtbar geworden, als die Karte eine Wiese zeigte.

**Files:**
- Create: `frontend/src/components/Bahnhofsschema.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Produces: `Bahnhofsschema({ schritte, aktiv, bahnhofName })`.

- [ ] **Step 1: Schema anlegen**

Create `frontend/src/components/Bahnhofsschema.tsx`:

```tsx
import type { Schritt } from '../api/typen'

interface BahnhofsschemaProps {
  schritte: Schritt[]
  aktiv: number
  bahnhofName: string
}

const ZEILE_H = 44
const RAND = 16

// Prinzipskizze fuer Stufe 3. Bewusst KEINE Landkarte: Die Geometrie im
// Bahnhof ist dort geschaetzt, und echte Kacheln darunter wuerden eine
// Vermessung behaupten, die nicht stattgefunden hat. Ein Schema behauptet sie
// nicht – und MapLibre (940 kB) wird gar nicht erst geladen.
export function Bahnhofsschema({ schritte, aktiv, bahnhofName }: BahnhofsschemaProps) {
  const hoehe = RAND * 2 + Math.max(schritte.length, 1) * ZEILE_H
  return (
    <section className="schema-bereich">
      <div className="hinweis-box">
        {bahnhofName} · Schema, keine Karte – die Abstände sind geschätzt.
      </div>
      <svg
        className="schema-flaeche"
        viewBox={`0 0 320 ${hoehe}`}
        role="img"
        aria-label={`Schematische Darstellung des Wegs in ${bahnhofName}`}
      >
        {schritte.map((schritt, i) => {
          const y = RAND + i * ZEILE_H + ZEILE_H / 2
          const istAktiv = i === aktiv
          return (
            <g key={`${i}-${schritt.text}`} opacity={i < aktiv ? 0.4 : 1}>
              <line
                x1={40}
                y1={y}
                x2={280}
                y2={y}
                stroke={istAktiv ? 'var(--color-accent)' : 'var(--color-neutral-500)'}
                strokeWidth={istAktiv ? 6 : 3}
                strokeLinecap="round"
              />
              {i < schritte.length - 1 && (
                <line
                  x1={160}
                  y1={y}
                  x2={160}
                  y2={y + ZEILE_H}
                  stroke="var(--color-neutral-500)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}
              <text x={8} y={y + 5} fontSize={13} fill="var(--color-text)">
                {i + 1}
              </text>
              {schritt.level !== undefined && (
                <text x={288} y={y + 5} fontSize={11} fill="var(--color-neutral-600)">
                  {schritt.level > 0 ? `+${schritt.level}` : schritt.level}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </section>
  )
}
```

- [ ] **Step 2: Stile ergänzen**

An `frontend/src/App.css` anhängen:

```css
.schema-bereich {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}

.schema-flaeche {
  width: 100%;
  height: auto;
  background: var(--color-neutral-100);
  border-radius: 12px;
}
```

- [ ] **Step 3: In App einhängen**

In `frontend/src/App.tsx` den Import ergänzen:

```tsx
import { Bahnhofsschema } from './components/Bahnhofsschema'
```

Den Kartenblock ersetzen:

```tsx
        {route.stufe === 3 ? (
          <Bahnhofsschema
            schritte={route.schritte}
            aktiv={position}
            bahnhofName={werte.bahnhofName || 'Umstieg'}
          />
        ) : (
          route.karte && (
            <Suspense fallback={<div className="lade-hinweis">Karte wird geladen …</div>}>
              <Karte
                karte={route.karte}
                standort={standort}
                aktiverSchritt={route.schritte[position] ?? null}
              />
            </Suspense>
          )
        )}
```

- [ ] **Step 4: Build prüfen – MapLibre bleibt im Lazy-Chunk**

Run: `cd frontend && npm run build`
Expected: PASS – `Karte-*.js` bleibt ein eigener Chunk, das Hauptbundle wächst nur um das Schema (wenige kB).

- [ ] **Step 5: Lint und Tests**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Bahnhofsschema.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: Stufe 3 zeigt ein Schema statt einer Landkarte"
```

---

### Task 8: Abnahme und Dokumentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Vollständige Suite**

Run: `cd backend && npm test && npm run lint`
Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS – Backend 149, Frontend 35, oxlint bei höchstens 4 Warnungen.

- [ ] **Step 2: Abnahme im Browser**

Beide Deployments aktualisieren (`cd backend && fly deploy --ha=false`, dann `git push`), danach auf <https://umstieg.vercel.app> prüfen:

1. Route mit mehreren Schritten berechnen → der erste Schritt ist hervorgehoben, der Zähler zeigt „Schritt 1 von N".
2. „Weiter" antippen → Hervorhebung rückt weiter, erledigte Schritte werden blass.
3. Karte aufklappen → die Ebene des aktiven Schritts ist gewählt, der Ausschnitt zeigt das Teilstück.
4. Ebene von Hand umschalten, dann „Weiter" → die Handwahl bleibt bestehen.
5. Eine Stufe-3-Route erzwingen (Gleise, die nicht im OSM-Graphen liegen) → Schema statt Karte, kein Kartenknopf.

- [ ] **Step 3: README nachziehen**

Im Abschnitt „Projektstand" eine Zeile ergänzen und die Testzahlen aktualisieren:

```markdown
| Schrittnavigation (Spec 30.08.2026) | ✅ Code fertig, Abnahme am Gerät offen |
```

Im Abschnitt „API" die Beschreibung von `/api/route` um die neuen Felder ergänzen:

```markdown
  - `schritte[]` tragen zusätzlich `sekunden` (Summe = `gehzeitSek`), `level` (Zielebene) und `knotenVon`/`knotenBis` (Bereich im Routenpfad)
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Schrittnavigation im README"
```

---

## Selbstprüfung (durchgeführt)

**Spec-Abdeckung:** Spec 4 (Datenmodell) → Tasks 2, 3 · Spec 5 (Navigationslogik, Mindestanzeigedauer) → Task 4 · Spec 6 (Karte) → Task 6 · Spec 7 (Stufe 3) → Task 7 · Spec 8 (Degradation) → Task 4 (fehlende `sekunden`), Task 6 (fehlende `level`/`knoten*`) · Spec 9 (Oberfläche) → Task 5 · Spec 10 (Tests) → Tasks 1–4 · Spec 11 (Reihenfolge) → Tasks 1–8.

Die Invariante aus Spec Abschnitt 4 hängt an einer Rundungsfalle, die die Spec nicht benennt: `gehzeitSekunden` rundet einmal am Ende. Deshalb ist `verteileGehzeit` (Task 1) als eigene, getestete Einheit vorgezogen, statt die Rechnung in `generiereSchritte` zu verstecken.

**Typkonsistenz:** `Schritt` wird in Task 2 um `sekunden`/`level` und in Task 3 um `knotenVon`/`knotenBis` erweitert – beide Male in `backend/src/core/typen.ts` **und** `frontend/src/api/typen.ts`. `aktiverSchritt` heißt in Task 4 (Definition), Task 5 (Aufruf) und Task 6 (Prop-Name) durchgehend gleich; die Prop in `KarteProps` trägt denselben Namen wie die Funktion, meint aber den Schritt selbst – im Interface-Block von Task 6 ausdrücklich als `Schritt | null` typisiert.

**Bekannte Abgrenzung:** Task 5 Step 5 nennt den Ausweg, falls oxlint den Startzeit-Effekt beanstandet. Der Effekt schreibt State synchron und ist damit derselbe Fall wie `Eingabe.tsx:72` – die Anweisung ist, ihn zu beheben statt die Warnung zu übernehmen.
