// ANFRAGEPRUEFUNG (15.09.2026): Antwortet der Server auf JEDE Anfrage sauber?
//
// Die Simulationen pruefen, was der Graph anbietet und was das Bild daraus
// macht - aber nie den Weg durch Fastify: Parameterpruefung, Fehlerbehandler,
// Serialisierung. Dort sitzen die Fehler, die ein Reisender als leeren
// Bildschirm erlebt (ein 500er, ein `null` statt einer Zahl).
//
// Teil A - im Prozess ueber `app.inject`: jedes Gleispaar von Berlin Hbf mit
// jeder Variante und jedem Standort, dazu kaputte und boesartige Eingaben.
// Jede Anfrage kommt von einer anderen Adresse, sonst griffe nach 14 Routen
// die Ratenbegrenzung.
//
// Teil B - an einem echten Socket: Gesundheit, eine Route, der SSE-Strom und
// die Ratenbegrenzung selbst (sie muss 429 sagen, nicht 500).
//
// Geprueft wird dabei auch die Naht der Standortknoepfe (ToDo 31): Wer
// `abschnitt=anfang` schickt, startet im Schema genau an `von`, wer `ende`
// schickt, an `bis` - und der Ankunftsbahnsteig nennt seine Himmelsrichtung.
//
// Ohne Netz und ohne Tresor: Geometrie aus dem Berlin-Fixture, alle anderen
// Quellen als stille Attrappen.
//
// Aufruf: npx tsx scripts/anfragen-pruefung.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { baueGraph } from '../src/core/graph.js';
import type { OverpassAntwort, RouteErgebnis, StationsInfo } from '../src/core/typen.js';

const FIXTURE = fileURLToPath(new URL('../test/fixtures/overpass/berlin-hbf.json', import.meta.url));
const osm = JSON.parse(readFileSync(FIXTURE, 'utf8')) as OverpassAntwort;
const EVA = '8011160';
const GRUPPE = ['8011160', '8098160', '8089021'];
const TREFFER = [{ name: 'Berlin Hbf', eva: EVA, lat: 52.5251, lon: 13.3694 }];

function clients() {
  return {
    overpass: async () => osm,
    stations: {
      sucheBahnhoefe: async () => TREFFER,
      sucheBahnhoefeNahebei: async () => TREFFER,
      holeStationsInfo: async (eva: string): Promise<StationsInfo> => ({
        eva,
        name: 'Berlin Hbf',
        lat: 52.5251,
        lon: 13.3694,
        evas: GRUPPE,
        gleise: [],
      }),
      ermittleGruppe: async () => GRUPPE,
    },
    tafel: async () => [],
    wagenposition: async () => null,
    fasta: async () => [],
  };
}

const GEGENUEBER: Record<string, string> = { N: 'S', S: 'N', W: 'O', O: 'W' };

interface Befund {
  url: string;
  status: number;
  grund: string;
}
const befunde: Befund[] = [];
const statusZaehler = new Map<number, number>();
let anfragen = 0;
const richtungen = new Map<string, number>();

/** Erstes `null` oder unendliche Zahl in der Antwort - JSON macht aus NaN still `null`. */
function findeLeeres(wert: unknown, pfad = ''): string | null {
  if (wert === null) return pfad || '(Wurzel)';
  if (typeof wert === 'number' && !Number.isFinite(wert)) return pfad;
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length; i++) {
      const r = findeLeeres(wert[i], `${pfad}[${i}]`);
      if (r) return r;
    }
  } else if (typeof wert === 'object' && wert !== undefined) {
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
      const r = findeLeeres(v, pfad ? `${pfad}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
}

/** Was eine 200er-Route immer erfuellen muss. `null` = in Ordnung. */
function pruefeRoute(r: RouteErgebnis, abschnitt: string | undefined): string | null {
  if (![1, 2, 3].includes(r.stufe)) return `stufe ${String(r.stufe)}`;
  if (!Array.isArray(r.schritte) || r.schritte.length === 0) return 'keine Schritte';
  if (!Number.isFinite(r.gehzeitSek) || r.gehzeitSek < 0) return `gehzeitSek ${r.gehzeitSek}`;
  if (!Array.isArray(r.hinweise)) return 'hinweise fehlt';
  if (r.schritte.every((s) => s.sekunden !== undefined)) {
    const summe = r.schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0);
    if (Math.abs(summe - r.gehzeitSek) > 1) return `Schrittsumme ${summe} statt ${r.gehzeitSek}`;
  }
  const leer = findeLeeres(r);
  if (leer) return `null/NaN bei ${leer}`;
  if (!r.schema) return null; // gleicher Bahnsteig: Kurzantwort ohne Bild

  if (r.schema.ebenen.length === 0) return 'Schema ohne Ebenen';
  const start = r.schema.ebenen[0].bahnsteige.find((b) => b.rolle === 'start');
  if (!start) return 'kein Ankunftsbahnsteig im Schema';
  if (r.stufe !== 3 && start.von && start.bis) {
    const h = start.himmelsrichtung;
    if (!h) return 'Ankunftsbahnsteig ohne Himmelsrichtung';
    if (GEGENUEBER[h.von] !== h.bis) return `Enden ${h.von}/${h.bis} nicht gegenueber`;
    richtungen.set(`${h.von}→${h.bis}`, (richtungen.get(`${h.von}→${h.bis}`) ?? 0) + 1);
  }
  // Die Naht Knopf → Weg: Der Ursprung des Schemas ist der Startpunkt.
  const zurueckgefallen = r.hinweise.some((h) => h.includes('unbekannt'));
  if (!zurueckgefallen && start.von && start.bis) {
    const amUrsprung = (p: { x: number; y: number }) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
    if (abschnitt === 'anfang' && !amUrsprung(start.von)) return `anfang startet nicht an von (${JSON.stringify(start.von)})`;
    if (abschnitt === 'ende' && !amUrsprung(start.bis)) return `ende startet nicht an bis (${JSON.stringify(start.bis)})`;
  }
  return null;
}

let adresse = 0;
function naechsteAdresse(): string {
  adresse++;
  return `10.${(adresse >> 16) & 255}.${(adresse >> 8) & 255}.${adresse & 255}`;
}

async function frage(
  app: ReturnType<typeof buildApp>,
  url: string,
  erlaubt: number[],
  pruefe?: (body: unknown) => string | null,
  methode: 'GET' | 'POST' = 'GET',
): Promise<void> {
  anfragen++;
  const res = await app.inject({ method: methode, url, remoteAddress: naechsteAdresse() });
  statusZaehler.set(res.statusCode, (statusZaehler.get(res.statusCode) ?? 0) + 1);
  if (res.statusCode >= 500 && !erlaubt.includes(res.statusCode)) {
    befunde.push({ url, status: res.statusCode, grund: `Serverfehler: ${res.body.slice(0, 200)}` });
    return;
  }
  if (!erlaubt.includes(res.statusCode)) {
    befunde.push({ url, status: res.statusCode, grund: `erwartet ${erlaubt.join('/')}: ${res.body.slice(0, 160)}` });
    return;
  }
  let body: unknown;
  try {
    body = res.body.length > 0 ? JSON.parse(res.body) : undefined;
  } catch {
    befunde.push({ url, status: res.statusCode, grund: 'kein JSON' });
    return;
  }
  if (res.statusCode >= 400) {
    const f = (body as { fehler?: unknown } | undefined)?.fehler;
    if (typeof f !== 'string') befunde.push({ url, status: res.statusCode, grund: `Fehlerantwort ohne "fehler": ${res.body.slice(0, 120)}` });
    return;
  }
  const grund = pruefe?.(body);
  if (grund) befunde.push({ url, status: res.statusCode, grund });
}

function route(p: Record<string, string | undefined>): string {
  const q = Object.entries(p)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return `/api/route?${q}`;
}

async function teilA(): Promise<void> {
  const app = buildApp(clients(), { logger: false });
  await app.ready();
  const gleise = baueGraph(osm).gleise;
  console.log(`Teil A: Berlin Hbf, ${gleise.length} Gleise → ${gleise.length * (gleise.length - 1)} Paare`);

  const varianten = ['schnellste', 'einfachste', 'barrierefrei', 'mit-stopp'];
  const abschnitte = ['anfang', 'mitte', 'ende', undefined];
  let paare = 0;
  for (const an of gleise) {
    for (const ab of gleise) {
      if (an === ab) continue;
      paare++;
      for (const variante of varianten) {
        for (const abschnitt of abschnitte) {
          // eslint-disable-next-line no-await-in-loop -- nacheinander: derselbe Graph, kein Stapel
          await frage(app, route({ eva: EVA, gleisAn: an, gleisAb: ab, variante, abschnitt }), [200, 404], (b) =>
            pruefeRoute(b as RouteErgebnis, abschnitt),
          );
        }
      }
      // Gehtempo an jedem zehnten Paar - es aendert Zeiten, nicht Wege.
      if (paare % 10 === 0) {
        for (const profil of ['zuegig', 'langsam']) {
          // eslint-disable-next-line no-await-in-loop
          await frage(app, route({ eva: EVA, gleisAn: an, gleisAb: ab, profil }), [200, 404], (b) =>
            pruefeRoute(b as RouteErgebnis, undefined),
          );
        }
      }
    }
    process.stdout.write('.');
  }
  console.log('');

  // Gleiches Gleis, gleicher Bahnsteig: Kurzantwort.
  await frage(app, route({ eva: EVA, gleisAn: gleise[0], gleisAb: gleise[0] }), [200], (b) =>
    pruefeRoute(b as RouteErgebnis, undefined),
  );

  // --- kaputte und boesartige Eingaben: 4xx mit {fehler}, nie 5xx ---
  const g = gleise[0];
  const h = gleise[1];
  const faelle: [string, number[]][] = [
    ['/api/route', [400]],
    [route({ eva: EVA, gleisAn: g }), [400]],
    [route({ gleisAn: g, gleisAb: h }), [400]],
    [route({ eva: 'abc', gleisAn: g, gleisAb: h }), [400]],
    [route({ eva: '1', gleisAn: g, gleisAb: h }), [400]],
    [route({ eva: '80111601234567', gleisAn: g, gleisAb: h }), [400]],
    [route({ eva: EVA, gleisAn: g, gleisAb: h, profil: 'rennend' }), [400]],
    [route({ eva: EVA, gleisAn: g, gleisAb: h, variante: 'kuerzeste' }), [400]],
    [route({ eva: EVA, gleisAn: '999', gleisAb: h }), [200, 404, 503]],
    [route({ eva: EVA, gleisAn: '<script>alert(1)</script>', gleisAb: h }), [200, 404, 503]],
    [route({ eva: EVA, gleisAn: 'x'.repeat(5000), gleisAb: h }), [200, 400, 404, 414, 503]],
    [route({ eva: EVA, gleisAn: ' ', gleisAb: h }), [200, 400, 404, 503]],
    [route({ eva: EVA, gleisAn: 'ä', gleisAb: h }), [200, 404, 503]],
    [route({ eva: EVA, gleisAn: ' ', gleisAb: h }), [200, 400, 404, 503]],
    // Doppelte Parameter: seit dem 15.09.2026 immer 400 (vorher ein 500er bei q).
    [`/api/route?eva=${EVA}&gleisAn=${g}&gleisAn=${h}&gleisAb=${h}`, [400]],
    [`/api/route?eva=${EVA}&eva=8000105&gleisAn=${g}&gleisAb=${h}`, [400]],
    [`/api/route?eva=${EVA}&gleisAn=${g}&gleisAb=${h}&abschnitt=anfang&abschnitt=ende`, [400]],
    ['/api/stations?lat=52.5&lat=52.6&lon=13.4', [400]],
    [`/api/board/${EVA}?type=dep&type=arr`, [400]],
    [`/api/live/${EVA}?zugAn=ICE%201&zugAn=ICE%202`, [400]],
    [`/api/route?eva=${EVA}&gleisAn=${g}&gleisAb=${h}&variante=schnellste&variante=barrierefrei`, [400]],
    [`/api/route?eva=%E0%A4%A&gleisAn=${g}&gleisAb=${h}`, [400]],
    ['/api/stations', [400]],
    ['/api/stations?q=Berlin', [200]],
    ['/api/stations?q=', [400]],
    [`/api/stations?q=${'b'.repeat(3000)}`, [200, 400, 414]],
    ['/api/stations?lat=52.5&lon=13.4', [200]],
    ['/api/stations?lat=91&lon=0', [400]],
    ['/api/stations?lat=abc&lon=1', [400]],
    ['/api/stations?lat=52.5', [400]],
    ['/api/stations?q=x&lat=52.5&lon=13.4', [400]],
    ['/api/stations?q=Berlin&q=Hamburg', [400]],
    [`/api/board/${EVA}?type=dep`, [200]],
    [`/api/board/${EVA}?type=arr`, [200]],
    [`/api/board/${EVA}?type=xyz`, [400]],
    ['/api/board/abc?type=dep', [400]],
    ['/api/health', [200]],
    ['/api/gibtsnicht', [404]],
  ];
  for (const [url, erlaubt] of faelle) {
    // eslint-disable-next-line no-await-in-loop
    await frage(app, url, erlaubt);
  }
  await frage(app, route({ eva: EVA, gleisAn: g, gleisAb: h }), [404, 405], undefined, 'POST');
  await app.close();
}

async function teilB(): Promise<void> {
  const app = buildApp(clients(), { logger: false });
  await app.listen({ port: 0, host: '::' });
  const port = (app.server.address() as AddressInfo).port;
  const basis = `http://[::1]:${port}`;
  const gleise = baueGraph(osm).gleise;
  const pruefe = (bedingung: boolean, grund: string, url: string, status: number) => {
    anfragen++;
    if (!bedingung) befunde.push({ url, status, grund });
  };

  const health = await fetch(`${basis}/api/health`);
  pruefe(health.status === 200, 'health nicht 200', '/api/health (Socket)', health.status);

  const url = route({ eva: EVA, gleisAn: gleise[0], gleisAb: gleise[gleise.length - 1], abschnitt: 'anfang' });
  const r = await fetch(`${basis}${url}`);
  const body = (await r.json()) as RouteErgebnis;
  pruefe(r.status === 200 && pruefeRoute(body, 'anfang') === null, `Route am Socket: ${pruefeRoute(body, 'anfang')}`, url, r.status);

  // SSE: Kopf muss sofort kommen; der Strom endet nie von selbst.
  const abbruch = new AbortController();
  const zeit = setTimeout(() => abbruch.abort(), 3000);
  try {
    const sse = await fetch(`${basis}/api/live/${EVA}?zugAn=ICE%20123`, { signal: abbruch.signal });
    const typ = sse.headers.get('content-type') ?? '';
    pruefe(sse.status === 200 && typ.includes('text/event-stream'), `SSE-Kopf ${sse.status} ${typ}`, '/api/live', sse.status);
    abbruch.abort();
  } catch (e) {
    if (!abbruch.signal.aborted) pruefe(false, `SSE: ${String(e)}`, '/api/live', 0);
  } finally {
    clearTimeout(zeit);
  }

  // Ratenbegrenzung: nach 14 Routen je Minute 429 mit {fehler} - nicht 500.
  let letzter = 0;
  let letzterText = '';
  for (let i = 0; i < 16; i++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${basis}${route({ eva: EVA, gleisAn: gleise[1], gleisAb: gleise[2] })}`);
    letzter = res.status;
    // eslint-disable-next-line no-await-in-loop
    letzterText = await res.text();
  }
  pruefe(letzter === 429 && letzterText.includes('zu-viele-anfragen'), `Grenze: ${letzter} ${letzterText.slice(0, 100)}`, '/api/route ×16', letzter);

  await app.close();
}

async function main(): Promise<void> {
  const t0 = Date.now();
  await teilA();
  await teilB();
  console.log(`\n${anfragen} Anfragen in ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`Status: ${[...statusZaehler].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}: ${n}`).join(' · ')}`);
  console.log(`Ankunftsbahnsteig (von→bis): ${[...richtungen].map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  console.log(`\nBEFUNDE: ${befunde.length}`);
  for (const b of befunde.slice(0, 40)) console.log(`  [${b.status}] ${b.url.slice(0, 110)}\n        ${b.grund}`);
  process.exitCode = befunde.length > 0 ? 1 : 0;
}

await main();
