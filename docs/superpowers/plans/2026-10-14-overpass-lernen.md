# Overpass von Fly aus: höflich lernen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unbekannte Bahnhöfe werden von Fly aus wieder gelernt – ohne Zusatzkosten, ohne einen abweisenden Overpass-Server erneut zu fragen, und ein Fehlschlag wird nach einer Stunde selbst nachgeholt.

**Architecture:** Ein geteilter Zustand `OverpassPausen` (neues Modul) merkt sich je Server, wann er wieder gefragt werden darf; `overpassQuery` überspringt pausierte Server und fragt nach 429/406/abgewiesener Verbindung nicht nochmal denselben. Der Ersatzserver ist `maps.mail.ru`. `osm/quelle.ts` merkt einen gescheiterten Bahnhof über die neue Methode `erneuerung.spaeter()` vor; die stößt ihn nach 1 h über das vorhandene `stosseAn()` an.

**Tech Stack:** Node 22, TypeScript strict, Fastify 5, Vitest 3, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-14-overpass-lernen-design.md`

## Global Constraints

- Keine neuen Fly-Ressourcen, keine Zusatzkosten; `fly.toml` bleibt unverändert.
- Die Overpass-Abfrage (`baueOverpassQL`) bleibt unverändert – `ABFRAGE_VERSION` bleibt `32bc423f0c92`, der Startbestand bleibt gültig.
- Pausen: HTTP 429 → 60 s; Verbindung abgewiesen (`ECONNREFUSED`, auch in einem `AggregateError`) → 30 min; HTTP 406 → 24 h; 504, Zeitüberschreitung, sonstige Fehler → keine Pause, zweiter Versuch am selben Server wie bisher (2 s Pause).
- Ersatzserver-Vorgabe: `https://maps.mail.ru/osm/tools/overpass/api/interpreter`; `OVERPASS_URL_PRIMARY`/`OVERPASS_URL_FALLBACK` gelten weiter, leer gesetzt = Vorgabe.
- Nachholen: `NACHHOL_WARTEZEIT_MS` = 1 h, danach `stosseAn()` mit seinen Grenzen (50 je Stunde, 10 s Pause, ein Versuch je Bahnhof und Tag) – unverändert.
- Testablagen nie im Temp-Scratchpad; Tests setzen Overpass-Umgebungsvariablen selbst (`vi.stubEnv`).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; gearbeitet wird auf `feat/mvp`.
- Ausliefern: `flyctl deploy E:\jbeer\Claude-code\Umstieg\backend --ha=false`, dann `git push origin feat/mvp:main`, nach dem Vercel-Build `git push origin feat/mvp`.

## Review Focus

- Node meldet „Verbindung abgewiesen" in zwei Formen – `cause.code === 'ECONNREFUSED'` (eine Adresse) und `AggregateError` mit `errors[]` (IPv4 und IPv6) → beide müssen pausieren (Test in Task 1).
- Eine leer gesetzte Umgebungsvariable (`OVERPASS_URL_FALLBACK=""`) darf keinen `TypeError: Invalid URL` auslösen, sondern die Vorgabe nehmen (Test in Task 1).
- Beide Server pausiert → sofortiger Fehler **ohne** Netzverkehr und ohne die 2-s-Wartezeit; der Aufrufer fällt aufs Standardmodell (Test in Task 1).
- Viele verschiedene unbekannte Bahnhöfe hintereinander → ein abweisender Server wird trotzdem nur einmal gefragt, weil app.ts EINEN Pausenzustand teilt (Test in Task 2).
- Derselbe Bahnhof scheitert mehrfach in kurzer Zeit → genau eine Vormerkung, und das Nachholen hält die Tagessperre von `stosseAn` ein (Test in Task 3).

---

### Task 1: Sperrpause je Server und mail.ru als Ersatzserver

**Files:**
- Create: `backend/src/clients/overpass-pausen.ts`
- Modify: `backend/src/clients/overpass.ts` (`instanzReihenfolge`, `overpassQuery`)
- Test: `backend/test/overpass.test.ts`

**Interfaces:**
- Produces:
  - `export const PAUSE_429_MS = 60_000`, `PAUSE_ABGEWIESEN_MS = 30 * 60_000`, `PAUSE_406_MS = 24 * 60 * 60_000`
  - `export function istAbgewiesen(e: unknown): boolean`
  - `export function pauseFuer(ergebnis: { status?: number; fehler?: unknown }): number`
  - `export interface OverpassPausen { pausiertBis(instanz: string): Date | null; merke(instanz: string, ergebnis: { status?: number; fehler?: unknown }): number }`
  - `export function erzeugeOverpassPausen(o?: { jetzt?: () => Date }): OverpassPausen`
  - `overpassQuery(lat, lon, radiusM, fetchFn = fetch, retryWartezeitMs = 2000, beiVersuch?, pausen?: OverpassPausen)` – neuer 7. Parameter

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `backend/test/overpass.test.ts` die erste Zeile ersetzen durch:

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { baueOverpassQL, overpassQuery, protokolliereVersuch, type OverpassVersuch } from '../src/clients/overpass.js';
import {
  erzeugeOverpassPausen,
  istAbgewiesen,
  pauseFuer,
  PAUSE_406_MS,
  PAUSE_429_MS,
  PAUSE_ABGEWIESEN_MS,
} from '../src/clients/overpass-pausen.js';

// Die Tests kennen die Vorgaben – eine Variable aus der Shell darf sie nicht kippen.
beforeEach(() => {
  vi.stubEnv('OVERPASS_URL_PRIMARY', '');
  vi.stubEnv('OVERPASS_URL_FALLBACK', '');
});
afterEach(() => vi.unstubAllEnvs());
```

Im Test „fällt nach zwei Fehlversuchen auf die Fallback-Instanz zurück" die Zeile
`expect(dritteUrl).toContain('kumi.systems');` ersetzen durch
`expect(dritteUrl).toContain('maps.mail.ru');`.

Am Dateiende anhängen:

```ts
function abgewiesen(): TypeError {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED 162.55.144.139:443'), { code: 'ECONNREFUSED' }),
  });
}

function abgewiesenBeideAdressen(): TypeError {
  // So meldet Node es, wenn IPv4 UND IPv6 abweisen: ein AggregateError ohne eigenen Code.
  const v4 = Object.assign(new Error('connect ECONNREFUSED 162.55.144.139:443'), { code: 'ECONNREFUSED' });
  const v6 = Object.assign(new Error('connect ECONNREFUSED 2a01:4f8:261:3c4f::2:443'), { code: 'ECONNREFUSED' });
  return new TypeError('fetch failed', { cause: new AggregateError([v4, v6]) });
}

describe('pauseFuer', () => {
  it('pausiert nach 429, 406 und abgewiesener Verbindung, sonst nicht', () => {
    expect(pauseFuer({ status: 429 })).toBe(PAUSE_429_MS);
    expect(pauseFuer({ status: 406 })).toBe(PAUSE_406_MS);
    expect(pauseFuer({ fehler: abgewiesen() })).toBe(PAUSE_ABGEWIESEN_MS);
    expect(pauseFuer({ status: 504 })).toBe(0);
    expect(pauseFuer({ fehler: new Error('timeout') })).toBe(0);
    expect([PAUSE_429_MS, PAUSE_ABGEWIESEN_MS, PAUSE_406_MS]).toEqual([60_000, 1_800_000, 86_400_000]);
  });

  it('erkennt die abgewiesene Verbindung in beiden Formen von Node', () => {
    expect(istAbgewiesen(abgewiesen())).toBe(true);
    expect(istAbgewiesen(abgewiesenBeideAdressen())).toBe(true);
    expect(istAbgewiesen(new TypeError('fetch failed'))).toBe(false);
    expect(istAbgewiesen(undefined)).toBe(false);
  });
});

describe('overpassQuery – Sperrpause', () => {
  const PRIMAER = 'overpass-api.de';
  const ERSATZ = 'maps.mail.ru';
  const host = (f: ReturnType<typeof vi.fn>, i: number) => new URL(String(f.mock.calls[i][0])).host;

  function uhr() {
    let t = Date.parse('2026-10-14T12:00:00Z');
    return { jetzt: () => new Date(t), weiter: (ms: number) => (t += ms) };
  }

  it('fragt nach 429 nicht denselben Server erneut, sondern den Ersatzserver', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 429))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(host(fetchFn, 1)).toBe(ERSATZ);
  });

  it('wiederholt 504 am selben Server wie bisher', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 504))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(host(fetchFn, 1)).toBe(PRIMAER);
  });

  it('laesst einen Server nach 429 60 s in Ruhe und fragt ihn danach wieder', async () => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 429))
      .mockResolvedValue(jsonResponse({ elements: [] }));
    const frage = () => overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, undefined, pausen);
    await frage(); // 429 vom Hauptserver, Ersatz liefert
    u.weiter(30_000);
    await frage(); // Hauptserver pausiert -> gleich der Ersatz
    expect(host(fetchFn, 2)).toBe(ERSATZ);
    u.weiter(31_000);
    await frage(); // Pause vorbei -> wieder der Hauptserver
    expect(host(fetchFn, 3)).toBe(PRIMAER);
  });

  it.each([
    ['eine Adresse', abgewiesen],
    ['IPv4 und IPv6', abgewiesenBeideAdressen],
  ])('laesst einen abweisenden Server 30 min in Ruhe (%s)', async (_name, fehler) => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).host === PRIMAER) throw fehler();
      return jsonResponse({ elements: [] });
    });
    const frage = () => overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, undefined, pausen);
    await frage();
    expect(fetchFn.mock.calls.map((c) => new URL(c[0]).host)).toEqual([PRIMAER, ERSATZ]);
    u.weiter(29 * 60_000);
    await frage();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(host(fetchFn, 2)).toBe(ERSATZ);
    u.weiter(2 * 60_000);
    await frage();
    expect(host(fetchFn, 3)).toBe(PRIMAER);
  });

  it('laesst einen Server nach 406 einen Tag in Ruhe', async () => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    pausen.merke(PRIMAER, { status: 406 });
    expect(pausen.pausiertBis(PRIMAER)?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    u.weiter(PAUSE_406_MS);
    expect(pausen.pausiertBis(PRIMAER)).toBeNull();
  });

  it('wirft sofort und ohne Netz, wenn alle Server pausiert sind', async () => {
    const pausen = erzeugeOverpassPausen({ jetzt: () => new Date('2026-10-14T12:00:00Z') });
    pausen.merke(PRIMAER, { fehler: abgewiesen() });
    pausen.merke(ERSATZ, { status: 429 });
    const fetchFn = vi.fn();
    const beginn = Date.now();
    await expect(
      overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 2000, undefined, pausen),
    ).rejects.toThrow(/Overpass nicht erreichbar: alle Server pausiert/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(Date.now() - beginn).toBeLessThan(500); // keine 2-s-Wartezeit
  });

  it('vermerkt uebersprungene Server im Versuchsprotokoll', async () => {
    const pausen = erzeugeOverpassPausen({ jetzt: () => new Date('2026-10-14T12:00:00Z') });
    pausen.merke(PRIMAER, { fehler: abgewiesen() });
    const versuche: OverpassVersuch[] = [];
    const fetchFn = vi.fn(async () => jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, (v) => versuche.push(v), pausen);
    expect(versuche[0]).toMatchObject({
      instanz: PRIMAER,
      versuch: 1,
      ok: false,
      dauerMs: 0,
      fehler: 'pausiert bis 2026-10-14T12:30:00.000Z',
    });
    expect(versuche[2]).toMatchObject({ instanz: ERSATZ, ok: true });
  });

  it('nimmt die Vorgaben, wenn die Variablen leer gesetzt sind', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('kaputt'));
    await expect(overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0)).rejects.toThrow(
      /Overpass nicht erreichbar/,
    );
    expect(fetchFn.mock.calls.map((c) => new URL(String(c[0])).host)).toEqual([PRIMAER, PRIMAER, ERSATZ, ERSATZ]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `cd backend && npx vitest run test/overpass.test.ts`
Expected: FAIL – `overpass-pausen.js` gibt es nicht (Import-Fehler).

- [ ] **Step 3: `backend/src/clients/overpass-pausen.ts` anlegen**

```ts
/**
 * Sperrpause je Overpass-Server (Spec 2026-10-14, Abschnitt 4).
 *
 * `overpass-api.de` sperrt Adressen automatisch, die zu viel fragen oder ein
 * 429 missachten. Wer uns abweist, bekommt deshalb eine Weile gar keine
 * Anfrage – auch nicht von der naechsten Nutzeranfrage. Der Zustand liegt nur
 * im Arbeitsspeicher: Nach einem Neustart wird jeder Server einmal neu gefragt.
 */

/** „Zu viele Anfragen" – das OSM-Forum verlangt mindestens 30 s. */
export const PAUSE_429_MS = 60_000;
/** Verbindung abgewiesen: eine Adresssperre, die erst nach einer Weile auslaeuft. */
export const PAUSE_ABGEWIESEN_MS = 30 * 60_000;
/** Sperre nach User-Agent – wird nur von Hand aufgehoben. */
export const PAUSE_406_MS = 24 * 60 * 60_000;

export interface OverpassPausen {
  /** Bis wann der Server in Ruhe gelassen wird – `null`, wenn er gefragt werden darf. */
  pausiertBis(instanz: string): Date | null;
  /** Wertet eine Antwort oder einen Fehler aus; liefert die gesetzte Pause in ms (0 = keine). */
  merke(instanz: string, ergebnis: { status?: number; fehler?: unknown }): number;
}

interface MitCode {
  code?: unknown;
  errors?: unknown;
}

/**
 * Node meldet eine abgewiesene Verbindung als `TypeError('fetch failed')` mit
 * `cause.code === 'ECONNREFUSED'` – oder, wenn IPv4 und IPv6 beide abweisen,
 * mit einem `AggregateError`, dessen Einzelfehler den Code tragen.
 */
export function istAbgewiesen(e: unknown): boolean {
  const cause = (e as { cause?: unknown } | null | undefined)?.cause as MitCode | undefined;
  if (!cause) return false;
  if (cause.code === 'ECONNREFUSED') return true;
  const einzelne = Array.isArray(cause.errors) ? (cause.errors as MitCode[]) : [];
  return einzelne.length > 0 && einzelne.every((x) => x?.code === 'ECONNREFUSED');
}

export function pauseFuer(ergebnis: { status?: number; fehler?: unknown }): number {
  if (ergebnis.status === 429) return PAUSE_429_MS;
  if (ergebnis.status === 406) return PAUSE_406_MS;
  if (ergebnis.status === undefined && istAbgewiesen(ergebnis.fehler)) return PAUSE_ABGEWIESEN_MS;
  return 0;
}

export function erzeugeOverpassPausen(o: { jetzt?: () => Date } = {}): OverpassPausen {
  const jetzt = o.jetzt ?? (() => new Date());
  const bis = new Map<string, number>();
  return {
    pausiertBis(instanz) {
      const t = bis.get(instanz);
      if (t === undefined) return null;
      if (t <= jetzt().getTime()) {
        bis.delete(instanz);
        return null;
      }
      return new Date(t);
    },
    merke(instanz, ergebnis) {
      const ms = pauseFuer(ergebnis);
      if (ms > 0) bis.set(instanz, Math.max(bis.get(instanz) ?? 0, jetzt().getTime() + ms));
      return ms;
    },
  };
}
```

- [ ] **Step 4: `backend/src/clients/overpass.ts` anpassen**

Import oben ergänzen (nach dem Import von `OverpassAntwort`):

```ts
import { pauseFuer, type OverpassPausen } from './overpass-pausen.js';
```

`instanzReihenfolge()` ersetzen durch:

```ts
function instanzReihenfolge(): string[] {
  // `||` statt `??`: Eine leer gesetzte Variable faellt auf die Vorgabe zurueck.
  const primaer = process.env.OVERPASS_URL_PRIMARY || 'https://overpass-api.de/api/interpreter';
  // Ersatz seit 14.10.2026: overpass.kumi.systems (= overpass.private.coffee)
  // antwortet von nirgendwo mehr; maps.mail.ru liefert, wenn auch wackelig.
  const fallback =
    process.env.OVERPASS_URL_FALLBACK || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
  // 2 Versuche primär, dann 2 Versuche Fallback
  return [primaer, primaer, fallback, fallback];
}
```

`overpassQuery` ersetzen durch:

```ts
export async function overpassQuery(
  lat: number,
  lon: number,
  radiusM: number,
  fetchFn: typeof fetch = fetch,
  retryWartezeitMs = 2000,
  beiVersuch?: (v: OverpassVersuch) => void,
  pausen?: OverpassPausen,
): Promise<OverpassAntwort> {
  const ql = baueOverpassQL(lat, lon, radiusM);
  const versuche = instanzReihenfolge();
  // Wer in DIESER Abfrage mit 429, 406 oder abgewiesener Verbindung geantwortet
  // hat, bekommt keinen zweiten Versuch (Spec 2026-10-14, Abschnitt 4).
  const abgewiesen = new Set<string>();
  let gefragt = false;
  let letzterFehler: unknown;

  for (let i = 0; i < versuche.length; i++) {
    const instanz = new URL(versuche[i]).host;
    const pauseBis = pausen?.pausiertBis(instanz) ?? null;
    if (pauseBis || abgewiesen.has(instanz)) {
      const grund = pauseBis ? `pausiert bis ${pauseBis.toISOString()}` : 'pausiert';
      letzterFehler = new Error(`${instanz} ${grund}`);
      beiVersuch?.({ instanz, versuch: i + 1, ok: false, fehler: grund, dauerMs: 0 });
      continue;
    }
    if (gefragt && retryWartezeitMs > 0) {
      await new Promise((r) => setTimeout(r, retryWartezeitMs));
    }
    gefragt = true;
    const beginn = Date.now();
    let status: number | undefined;
    try {
      const res = await fetchFn(versuche[i], {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(ql)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const antwort = (await res.json()) as OverpassAntwort;
      // HTTP 200 heisst bei Overpass nicht Erfolg: Ein Zeit- oder Speicherfehler
      // kommt mit Status 200, einem `remark` und leerem oder teilweisem
      // `elements`. Als Erfolg gewertet laege so eine Antwort 30 Tage im Bestand;
      // als Fehlversuch geht es zur naechsten Instanz wie bei jedem anderen.
      if (typeof antwort.remark === 'string' && /runtime error/i.test(antwort.remark)) {
        throw new Error(`Overpass-Laufzeitfehler: ${antwort.remark.slice(0, 160)}`);
      }
      beiVersuch?.({ instanz, versuch: i + 1, ok: true, status, dauerMs: Date.now() - beginn });
      return antwort;
    } catch (e) {
      letzterFehler = e;
      const ergebnis = { status, fehler: e };
      if (pauseFuer(ergebnis) > 0) {
        abgewiesen.add(instanz);
        pausen?.merke(instanz, ergebnis);
      }
      beiVersuch?.({
        instanz,
        versuch: i + 1,
        ok: false,
        status,
        fehler: String(e).slice(0, 200),
        dauerMs: Date.now() - beginn,
      });
    }
  }
  if (!gefragt) throw new Error('Overpass nicht erreichbar: alle Server pausiert');
  throw new Error(`Overpass nicht erreichbar: ${String(letzterFehler)}`);
}
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `cd backend && npx vitest run test/overpass.test.ts`
Expected: PASS (alle, auch die bisherigen).

- [ ] **Step 6: Ganze Suite und Lint**

Run: `cd backend && npm test && npm run lint`
Expected: alle grün, Lint sauber.

- [ ] **Step 7: Commit**

```bash
git add backend/src/clients/overpass-pausen.ts backend/src/clients/overpass.ts backend/test/overpass.test.ts
git commit -m "feat(backend): Sperrpause je Overpass-Server, mail.ru als Ersatzserver" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Einen Pausenzustand in app.ts und im Skript teilen

**Files:**
- Modify: `backend/src/app.ts` (Overpass-Funktion in `buildApp`)
- Modify: `backend/scripts/bestand-fuellen.ts` (Aufruf von `overpassQuery`)
- Test: `backend/test/osm-verdrahtung.test.ts`

**Interfaces:**
- Consumes: `erzeugeOverpassPausen()`, `overpassQuery(..., pausen)` aus Task 1

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `backend/test/osm-verdrahtung.test.ts` den `afterEach` ergänzen:

```ts
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(WURZEL, { recursive: true, force: true });
});
```

Am Dateiende anhängen:

```ts
describe('buildApp: ein Pausenzustand fuer alle Overpass-Abrufe', () => {
  it('fragt einen abweisenden Server beim naechsten Bahnhof nicht erneut', async () => {
    vi.stubEnv('OVERPASS_URL_PRIMARY', '');
    vi.stubEnv('OVERPASS_URL_FALLBACK', '');
    const gefragt: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const host = new URL(String(url)).host;
        gefragt.push(host);
        if (host === 'overpass-api.de') {
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
          });
        }
        return new Response(JSON.stringify(miniOsm), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const c = clients();
    // Zwei verschiedene Bahnhoefe – sonst traefe die zweite Anfrage den Graph-Cache.
    const ohneOverpass = {
      ...c,
      overpass: undefined,
      stations: {
        ...c.stations,
        holeStationsInfo: vi.fn(async (eva: string) => ({ ...ministadt, eva, evas: [eva] })),
      },
    };
    const app = buildApp(ohneOverpass as never);
    await app.inject({ method: 'GET', url: ROUTE });
    await app.inject({ method: 'GET', url: ROUTE.replace('8000001', '8000002') });
    expect(gefragt.filter((h) => h === 'overpass-api.de')).toHaveLength(1);
    expect(gefragt.filter((h) => h === 'maps.mail.ru')).toHaveLength(2);
  }, 15_000);
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-verdrahtung.test.ts`
Expected: FAIL – `overpass-api.de` wird zweimal gefragt (ohne geteilten Zustand vergisst jede Abfrage die Abweisung).

- [ ] **Step 3: `backend/src/app.ts` anpassen**

Import ergänzen (neben dem Import aus `./clients/overpass.js`):

```ts
import { erzeugeOverpassPausen } from './clients/overpass-pausen.js';
```

Die Overpass-Funktion in `buildApp` ersetzen:

```ts
    // EIN Pausenzustand fuer Vordergrund und Erneuerung (Spec 2026-10-14):
    // Wer uns abweist, bekommt auch von der naechsten Nutzeranfrage keine.
    const pausen = erzeugeOverpassPausen();
    const overpass: OverpassFn =
      clients.overpass ??
      ((lat, lon, radiusM) =>
        overpassQuery(lat, lon, radiusM, fetch, 2000, protokolliereVersuch(instanz.log), pausen));
```

- [ ] **Step 4: `backend/scripts/bestand-fuellen.ts` anpassen**

Import ergänzen:

```ts
import { erzeugeOverpassPausen } from '../src/clients/overpass-pausen.js';
```

In `main()` nach `const gescheitert: string[] = [];`:

```ts
  const pausen = erzeugeOverpassPausen();
```

Den Abruf ersetzen:

```ts
        const osm = await overpassQuery(info.lat, info.lon, OVERPASS_RADIUS_M, fetch, 2000, undefined, pausen);
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `cd backend && npx vitest run test/osm-verdrahtung.test.ts test/bestand-fuellen.test.ts`
Expected: PASS.

- [ ] **Step 6: Ganze Suite und Lint**

Run: `cd backend && npm test && npm run lint`
Expected: alle grün, Lint sauber.

- [ ] **Step 7: Commit**

```bash
git add backend/src/app.ts backend/scripts/bestand-fuellen.ts backend/test/osm-verdrahtung.test.ts
git commit -m "feat(backend): ein Overpass-Pausenzustand fuer Vordergrund, Erneuerung und Skript" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gescheiterte Bahnhöfe nach einer Stunde nachholen

**Files:**
- Modify: `backend/src/osm/erneuerung.ts` (`spaeter`, `NACHHOL_WARTEZEIT_MS`, Optionen `nachholWartezeitMs`, `zeitgeber`)
- Modify: `backend/src/osm/quelle.ts` (`hole`: bei Overpass-Fehler vormerken)
- Modify: `backend/test/api-bestand.test.ts` (Attrappen um `spaeter` ergänzen)
- Test: `backend/test/osm-erneuerung.test.ts`, `backend/test/osm-quelle.test.ts`

**Interfaces:**
- Produces:
  - `export const NACHHOL_WARTEZEIT_MS = 60 * 60 * 1000`
  - `OsmErneuerung.spaeter(auftrag: ErneuerungsAuftrag): void`
  - `erzeugeErneuerung(o: { …bisherige…, nachholWartezeitMs?: number; zeitgeber?: (fn: () => void, ms: number) => void })`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `backend/test/osm-erneuerung.test.ts` den Import ersetzen:

```ts
import { erzeugeErneuerung, NACHHOL_WARTEZEIT_MS, type ErneuerungsAuftrag } from '../src/osm/erneuerung.js';
```

Am Dateiende anhängen:

```ts
describe('Hintergrund-Erneuerung – Nachholen', () => {
  function mitZeitgeber() {
    const zeitgeber: { fn: () => void; ms: number }[] = [];
    const overpass = vi.fn(async () => OSM);
    const bestand: OsmBestand = {
      hatVolume: true,
      lies: vi.fn(async () => null),
      schreibe: vi.fn(async () => true),
    };
    const erneuerung = erzeugeErneuerung({
      bestand,
      overpass,
      warte: async () => {},
      jetzt: () => new Date('2026-10-14T12:00:00Z'),
      zeitgeber: (fn, ms) => {
        zeitgeber.push({ fn, ms });
      },
    });
    return { erneuerung, overpass, bestand, zeitgeber };
  }

  it('holt einen vorgemerkten Bahnhof erst nach einer Stunde', async () => {
    const a = mitZeitgeber();
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.spaeter(auftrag('8010376'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).not.toHaveBeenCalled();
    expect(a.zeitgeber).toHaveLength(1);
    expect(a.zeitgeber[0].ms).toBe(NACHHOL_WARTEZEIT_MS);
    expect(NACHHOL_WARTEZEIT_MS).toBe(60 * 60 * 1000);
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledWith(52, 13, 400);
    expect(a.bestand.schreibe).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8010376' }));
    expect(erneuert).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8010376' }));
  });

  it('merkt denselben Bahnhof nur einmal vor, bis er angestossen ist', async () => {
    const a = mitZeitgeber();
    a.erneuerung.spaeter(auftrag('8010376'));
    a.erneuerung.spaeter(auftrag('8010376'));
    expect(a.zeitgeber).toHaveLength(1);
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    a.erneuerung.spaeter(auftrag('8010376'));
    expect(a.zeitgeber).toHaveLength(2);
  });

  it('haelt beim Nachholen die Tagessperre ein', async () => {
    const a = mitZeitgeber();
    a.erneuerung.stosseAn(auftrag('8010376'));
    await a.erneuerung.leerlauf();
    a.erneuerung.spaeter(auftrag('8010376'));
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);
  });
});
```

In `backend/test/osm-quelle.test.ts` die Attrappe in `aufbau` ersetzen:

```ts
  const erneuerung: OsmErneuerung = {
    stosseAn: vi.fn(),
    spaeter: vi.fn(),
    beiErneuert: vi.fn(),
    leerlauf: async () => {},
  };
```

und im `describe('OSM-Quelle', …)` anhängen:

```ts
  it('merkt einen gescheiterten Bahnhof zum Nachholen vor und wirft weiter', async () => {
    const a = aufbau(null, { overpassWirft: true });
    await expect(a.quelle.hole(berlin)).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(a.erneuerung.spaeter).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      evas: ['8098160', '8011160', '8089021'],
    });
  });

  it('merkt nichts vor, wenn Overpass liefert oder der Bestand trifft', async () => {
    const geholt = aufbau(null);
    await geholt.quelle.hole(berlin);
    expect(geholt.erneuerung.spaeter).not.toHaveBeenCalled();
    const getroffen = aufbau(gefunden());
    await getroffen.quelle.hole(berlin);
    expect(getroffen.erneuerung.spaeter).not.toHaveBeenCalled();
  });
```

In `backend/test/api-bestand.test.ts` beide `OsmErneuerung`-Attrappen (Zeile ~114 und ~125) um `spaeter: vi.fn(),` direkt nach `stosseAn: vi.fn(),` ergänzen.

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run: `cd backend && npx vitest run test/osm-erneuerung.test.ts test/osm-quelle.test.ts`
Expected: FAIL – `spaeter` ist keine Funktion, `NACHHOL_WARTEZEIT_MS` undefiniert; „merkt … vor" scheitert, weil `hole` nicht vormerkt.

- [ ] **Step 3: `backend/src/osm/erneuerung.ts` anpassen**

Unter `const STUNDE_MS = 60 * 60 * 1000;`:

```ts
/** Spec 2026-10-14, Abschnitt 5: so lange nach einem gescheiterten Vordergrundabruf. */
export const NACHHOL_WARTEZEIT_MS = 60 * 60 * 1000;
```

Im Interface `OsmErneuerung` nach `stosseAn` ergänzen:

```ts
  /**
   * Nach einem gescheiterten Vordergrundabruf: in `NACHHOL_WARTEZEIT_MS` ueber
   * `stosseAn` erneut versuchen – mit dessen Grenzen. Niemand muss dafuer
   * erneut fragen.
   */
  spaeter(auftrag: ErneuerungsAuftrag): void;
```

In der Optionsliste von `erzeugeErneuerung` nach `sperreMs?: number;` ergänzen:

```ts
  nachholWartezeitMs?: number;
  zeitgeber?: (fn: () => void, ms: number) => void;
```

Nach `const sperreMs = o.sperreMs ?? SPERRE_MS;` ergänzen:

```ts
  const nachholMs = o.nachholWartezeitMs ?? NACHHOL_WARTEZEIT_MS;
  const zeitgeber =
    o.zeitgeber ??
    ((fn: () => void, ms: number) => {
      setTimeout(fn, ms).unref();
    });
  const vorgemerkt = new Set<string>();
```

Das zurückgegebene Objekt ersetzen – `stosseAn` wird eine benannte Funktion, damit `spaeter` sie rufen kann:

```ts
  function stosseAn(a: ErneuerungsAuftrag): void {
    const t = jetzt().getTime();
    if (wartend.has(a.schluessel)) return;
    const letzter = letzterVersuch.get(a.schluessel);
    if (letzter !== undefined && t - letzter < sperreMs) return;
    while (aufnahmen.length > 0 && t - aufnahmen[0] >= STUNDE_MS) aufnahmen.shift();
    if (aufnahmen.length >= maxProStunde) return;
    aufnahmen.push(t);
    wartend.add(a.schluessel);
    warteschlange.push(a);
    starte();
  }

  return {
    stosseAn,
    spaeter(a) {
      if (vorgemerkt.has(a.schluessel)) return;
      vorgemerkt.add(a.schluessel);
      zeitgeber(() => {
        vorgemerkt.delete(a.schluessel);
        stosseAn(a);
      }, nachholMs);
    },
    beiErneuert(fn) {
      abonnenten.push(fn);
    },
    async leerlauf() {
      while (true) {
        const current = lauf;
        if (!current) break;
        await current;
      }
    },
  };
```

- [ ] **Step 4: `backend/src/osm/quelle.ts` anpassen**

Die Zeile `const osm = await o.overpass(info.lat, info.lon, OVERPASS_RADIUS_M);` ersetzen durch:

```ts
      let osm: OverpassAntwort;
      try {
        osm = await o.overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      } catch (e) {
        // Spec 2026-10-14, Abschnitt 5: Niemand muss erneut fragen – die
        // Erneuerung holt den Bahnhof in einer Stunde nach.
        o.erneuerung?.spaeter(auftrag);
        throw e;
      }
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `cd backend && npx vitest run test/osm-erneuerung.test.ts test/osm-quelle.test.ts test/api-bestand.test.ts`
Expected: PASS.

- [ ] **Step 6: Ganze Suite und Lint**

Run: `cd backend && npm test && npm run lint`
Expected: alle grün, Lint sauber.

- [ ] **Step 7: Commit**

```bash
git add backend/src/osm/erneuerung.ts backend/src/osm/quelle.ts backend/test/osm-erneuerung.test.ts backend/test/osm-quelle.test.ts backend/test/api-bestand.test.ts
git commit -m "feat(backend): gescheiterte Bahnhoefe nach einer Stunde im Hintergrund nachholen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dokumentation, Ausliefern, Prüfen

**Files:**
- Modify: `docs/deployment.md` (Abschnitt „OSM-Bestand und Volume")
- Modify: `README.md` (Block unter „Hier weitermachen")

- [ ] **Step 1: `docs/deployment.md` ergänzen**

Im Abschnitt „OSM-Bestand und Volume" vor **Prüfen:** einfügen:

```markdown
**Overpass von Fly aus (seit 14.10.2026):** Ersatzserver ist `maps.mail.ru`
(`overpass.kumi.systems` antwortet nicht mehr). Wer mit 429, 406 oder
abgewiesener Verbindung antwortet, bekommt 60 s / 24 h / 30 min keine Anfrage –
im Log als `overpass-versuch` mit `fehler: "pausiert bis …"` und `dauerMs: 0`.
Scheitert ein Bahnhof, holt die Erneuerung ihn nach einer Stunde nach.
Fly schickt ausgehenden Verkehr über geteilte Adressen; sperrt Overpass eine
davon, hilft nur Warten oder eine eigene Adresse
(`fly ips allocate-egress -a umstieg-backend -r fra`, 3,60 $ im Monat).
```

- [ ] **Step 2: Ausliefern**

Run: `flyctl deploy E:\jbeer\Claude-code\Umstieg\backend --ha=false`
Expected: eine Maschine, gesund, Volume weiter eingehängt (`flyctl machines list -a umstieg-backend`).

- [ ] **Step 3: Prüfen (Spec Abschnitt 8)**

1. Hamburg (8002549) und Frankfurt (8000105) wie am 14.10.: 200, unter 1 s, Stufe 1.
2. Wiesenburg (Mark) (8010376) abfragen; in `flyctl logs -a umstieg-backend --no-tail` die `overpass-versuch`-Zeilen lesen: `overpass-api.de` höchstens einmal abgewiesen, danach „pausiert"; `maps.mail.ru` gefragt.
3. Kam Wiesenburg als Standardmodell: nach gut einer Stunde `flyctl ssh console -a umstieg-backend -C "ls -la /data/osm"` – liegt `8010376.json.gz` dort, dieselbe Route erneut: Stufe 1 oder 2. Kam sie gleich mit Daten: Datei sofort auf dem Volume.

- [ ] **Step 4: README nachtragen**

Unter `## Hier weitermachen` einen neuen Block oben einfügen: Anlass (Sperre der geteilten Fly-Adresse, Belege aus der Spec §2), was gebaut ist (Tasks 1–3, Commits), Testzahl, Messwerte aus Step 3, offene Grenze (solange `overpass-api.de` sperrt, lernt Fly nur über mail.ru), Option eigene Adresse. Den bisherigen Block zum OSM-Bestand als `### Davor: OSM-Bestand ausgeliefert (14.10.2026, nachmittags)` darunter lassen.

- [ ] **Step 5: Commit und Push**

```bash
git add docs/deployment.md README.md
git commit -m "docs: Overpass-Sperrpause und Nachholen ausgeliefert" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin feat/mvp:main
# nach dem Vercel-Build (vercel ls --prod: Ready)
git push origin feat/mvp
```
