// MOTIS-VERGLEICH: Traegt Transitous als Alternative zu DB Timetables?
//
// Fuer einige grosse Bahnhoefe die Abfahrten der naechsten Stunde aus beiden
// Quellen, Zug fuer Zug verglichen:
//   - Abdeckung: Wie viele DB-Zuege findet MOTIS (Zugnummer + Sollminute)?
//   - Echtzeit: Bei wie vielen traegt MOTIS `realTime`?
//   - Zeit: Stimmt die Ist-Zeit auf die Minute?
//   - Gleis: Hat MOTIS ein Gleis, ist es dasselbe - und kommen die
//     Gleiswechsel der DB bei MOTIS an? Fuer Umstieg. die entscheidende Frage.
//   - Antwortzeit je MOTIS-Aufruf.
//
// Manuell gestartet, NIE in CI. Timetables: 3 Aufrufe je Bahnhof (Budget 60/min).
// MOTIS: 2 je Bahnhof, strikt nacheinander mit 1,2 s Pause (F7 - kein
// Massenabruf). Gefragt wird mit `n=100`, nicht mit den 10 der App - sonst
// deckte die Antwort an einem Hauptbahnhof nur Minuten ab.
//
// Ergebnis auf der Konsole und als JSON unter `.superpowers/pruefung-<Datum>/`.
//
// Aufruf: cd backend && npx tsx scripts/motis-vergleich.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { holeTafel } from '../src/clients/timetables.js';
import { motisUserAgent, MOTIS_PFADE } from '../src/clients/motis.js';
import type { MotisMatch, MotisStoptimesAntwort } from '../src/clients/motis-typen.js';
import { berlinUhrzeit } from '../src/core/zeit.js';
import { ladeSecrets } from './secrets.js';

ladeSecrets();

const MOTIS = process.env.MOTIS_BASIS_URL?.trim() || 'https://api.transitous.org';
const userAgent = motisUserAgent(process.env.MOTIS_KONTAKT);
const PAUSE_MS = 1200;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nur Bahnhoefe mit EINER EVA - Berlin Hbf faechert sich auf drei auf. */
const BAHNHOEFE: [eva: string, name: string][] = [
  ['8000152', 'Hannover Hbf'],
  ['8000207', 'Köln Hbf'],
  ['8000105', 'Frankfurt (Main) Hbf'],
  ['8000261', 'München Hbf'],
  ['8010101', 'Erfurt Hbf'],
  ['8000115', 'Fulda'],
  ['8000096', 'Stuttgart Hbf'],
];

/** Verkehrsmittel, die auch die DB-Tafel fuehrt. */
const BAHN = new Set(['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'RAIL', 'SUBURBAN']);

async function motis<T>(pfad: string, parameter: Record<string, string>): Promise<{ wert: T; ms: number }> {
  const start = performance.now();
  const antwort = await fetch(`${MOTIS}${pfad}?${new URLSearchParams(parameter)}`, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const ms = Math.round(performance.now() - start);
  if (!antwort.ok) throw new Error(`MOTIS ${pfad}: HTTP ${antwort.status} nach ${ms} ms`);
  return { wert: (await antwort.json()) as T, ms };
}

/** Ziffern der Zugnummer: "ICE 577" -> "577", "S 31234" -> "31234". */
const nummer = (text: string | undefined) => text?.match(/\d+/g)?.at(-1) ?? '';

/** Minuten zwischen zwei "HH:MM", ueber Mitternacht gefaltet. */
function minutenAbstand(a: string, b: string): number {
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  let d = Math.abs(m(a) - m(b));
  if (d > 720) d = 1440 - d;
  return d;
}

interface Zeile {
  bahnhof: string;
  dbZuege: number;
  motisZuege: number;
  gefunden: number;
  gefundenNummer: number;
  echtzeit: number;
  dbVerspaetet5: number;
  verspaetet5BeiMotis: number;
  dbVerspaetet: number;
  zeitGleich: number;
  zeitVerglichen: number;
  motisMitGleis: number;
  gleisGleich: number;
  gleisVerglichen: number;
  dbGleiswechsel: number;
  gleiswechselBeiMotis: number;
  motisMs: number[];
  fehler?: string;
  beispiele: string[];
}

function leereZeile(bahnhof: string): Zeile {
  return {
    bahnhof, dbZuege: 0, motisZuege: 0, gefunden: 0, gefundenNummer: 0, echtzeit: 0, dbVerspaetet: 0,
    dbVerspaetet5: 0, verspaetet5BeiMotis: 0, zeitGleich: 0, zeitVerglichen: 0, motisMitGleis: 0,
    gleisGleich: 0, gleisVerglichen: 0, dbGleiswechsel: 0, gleiswechselBeiMotis: 0, motisMs: [], beispiele: [],
  };
}

async function vergleiche(eva: string, name: string): Promise<Zeile> {
  const z = leereZeile(name);
  const jetzt = new Date();
  const jetztText = berlinUhrzeit(jetzt.toISOString());

  // DB: die naechste Stunde der Abfahrtstafel.
  const db = (await holeTafel(eva, 'dep')).filter((e) => {
    const d = minutenAbstand(e.zeitSoll, jetztText);
    return e.zeitSoll >= jetztText ? d <= 60 : false;
  });
  z.dbZuege = db.length;

  // MOTIS: Bahnhof per Suche, dann Abfahrten im Umkreis (alle Bahnsteige).
  await warte(PAUSE_MS);
  const suche = await motis<MotisMatch[]>(MOTIS_PFADE.geocode, { text: name, type: 'STOP', language: 'de' });
  z.motisMs.push(suche.ms);
  const halt = suche.wert.find((m) => m.type === 'STOP');
  if (!halt) throw new Error('MOTIS findet den Bahnhof nicht');

  await warte(PAUSE_MS);
  const tafel = await motis<MotisStoptimesAntwort>(MOTIS_PFADE.stoptimes, {
    stopId: halt.id,
    center: `${halt.lat},${halt.lon}`,
    radius: '300',
    time: jetzt.toISOString(),
    arriveBy: 'false',
    direction: 'LATER',
    window: '3600',
    n: '100',
    withAlerts: 'false',
    language: 'de',
  });
  z.motisMs.push(tafel.ms);

  // Entdoppeln: DELFI und Verbundquellen fuehren dieselbe Fahrt mehrfach.
  const gesehen = new Set<string>();
  const motisBahn = tafel.wert.stopTimes.filter((s) => {
    if (!BAHN.has(s.mode)) return false;
    const schluessel = `${nummer(s.tripShortName) || s.routeShortName}|${s.place.scheduledDeparture}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
  z.motisZuege = motisBahn.length;

  const vergeben = new Set<(typeof motisBahn)[number]>();
  for (const e of db) {
    if (e.zeitIst) z.dbVerspaetet++;
    const dbGleis = e.gleisIst ?? e.gleisSoll;
    if (e.gleisIst) z.dbGleiswechsel++;

    const frei = motisBahn.filter((s) => !vergeben.has(s));
    const gleicheMinute = (s: (typeof motisBahn)[number]) =>
      s.place.scheduledDeparture !== undefined && berlinUhrzeit(s.place.scheduledDeparture) === e.zeitSoll;
    let treffer = frei.find(
      (s) => gleicheMinute(s) && (nummer(s.tripShortName) === nummer(e.zug) || nummer(s.displayName) === nummer(e.zug)),
    );
    if (treffer) z.gefundenNummer++;
    else {
      // Ersatz: Verbundquellen tragen statt der Zugnummer oft nur die Linie.
      // Dann muss die Sollminute UND Ziel oder Sollgleis passen.
      const zielWort = e.ziel.split(/[ (,]/)[0].toLowerCase();
      treffer = frei.find(
        (s) =>
          gleicheMinute(s) &&
          ((zielWort.length > 2 && s.headsign.toLowerCase().includes(zielWort)) ||
            (s.place.scheduledTrack !== undefined && s.place.scheduledTrack === e.gleisSoll)),
      );
    }
    if (!treffer) {
      if (z.beispiele.length < 4) z.beispiele.push(`fehlt: ${e.zug} ${e.zeitSoll} Gl. ${dbGleis} → ${e.ziel}`);
      continue;
    }
    vergeben.add(treffer);
    z.gefunden++;
    if (treffer.realTime) z.echtzeit++;

    if (treffer.place.departure) {
      z.zeitVerglichen++;
      const motisIst = berlinUhrzeit(treffer.place.departure);
      if (motisIst === (e.zeitIst ?? e.zeitSoll)) z.zeitGleich++;
      else if (z.beispiele.length < 8) z.beispiele.push(`Zeit: ${e.zug} DB ${e.zeitIst ?? e.zeitSoll} / MOTIS ${motisIst}`);
      // Was fuer einen Umstieg zaehlt: Kommt eine Verspaetung ab 5 Minuten an?
      if (e.zeitIst && minutenAbstand(e.zeitIst, e.zeitSoll) >= 5) {
        z.dbVerspaetet5++;
        if (minutenAbstand(motisIst, e.zeitIst) <= 2) z.verspaetet5BeiMotis++;
      }
    }

    const motisGleis = treffer.place.track ?? treffer.place.scheduledTrack;
    if (motisGleis) {
      z.motisMitGleis++;
      z.gleisVerglichen++;
      if (motisGleis === dbGleis) z.gleisGleich++;
      else if (z.beispiele.length < 8) z.beispiele.push(`Gleis: ${e.zug} DB ${dbGleis} / MOTIS ${motisGleis}`);
      if (e.gleisIst && motisGleis === e.gleisIst) z.gleiswechselBeiMotis++;
    }
  }
  return z;
}

async function main() {
  const start = new Date();
  const zeilen: Zeile[] = [];
  for (const [eva, name] of BAHNHOEFE) {
    try {
      zeilen.push(await vergleiche(eva, name));
    } catch (e) {
      zeilen.push({ ...leereZeile(name), fehler: e instanceof Error ? e.message : String(e) });
    }
    const z = zeilen.at(-1)!;
    console.log(
      z.fehler
        ? `✗ ${z.bahnhof}: ${z.fehler}`
        : `${z.bahnhof.padEnd(22)} DB ${z.dbZuege} · MOTIS ${z.motisZuege} · gefunden ${z.gefunden} (Nr. ${z.gefundenNummer}) · Echtzeit ${z.echtzeit} · ` +
            `Verspätung ≥5 DB ${z.dbVerspaetet5}, bei MOTIS ${z.verspaetet5BeiMotis} · ` +
            `Zeit gleich ${z.zeitGleich}/${z.zeitVerglichen} (DB verspätet ${z.dbVerspaetet}) · ` +
            `Gleis da ${z.motisMitGleis}, gleich ${z.gleisGleich}/${z.gleisVerglichen} · ` +
            `Gleiswechsel DB ${z.dbGleiswechsel}, bei MOTIS ${z.gleiswechselBeiMotis} · ms ${z.motisMs.join('/')}`,
    );
    for (const b of z.beispiele) console.log(`    ${b}`);
  }

  const summe = (f: (z: Zeile) => number) => zeilen.reduce((s, z) => s + f(z), 0);
  const ms = zeilen.flatMap((z) => z.motisMs).sort((a, b) => a - b);
  const gesamt = {
    dbZuege: summe((z) => z.dbZuege),
    gefunden: summe((z) => z.gefunden),
    gefundenNummer: summe((z) => z.gefundenNummer),
    motisMitGleis: summe((z) => z.motisMitGleis),
    dbVerspaetet5: summe((z) => z.dbVerspaetet5),
    verspaetet5BeiMotis: summe((z) => z.verspaetet5BeiMotis),
    echtzeit: summe((z) => z.echtzeit),
    zeitGleich: summe((z) => z.zeitGleich),
    zeitVerglichen: summe((z) => z.zeitVerglichen),
    gleisGleich: summe((z) => z.gleisGleich),
    gleisVerglichen: summe((z) => z.gleisVerglichen),
    dbGleiswechsel: summe((z) => z.dbGleiswechsel),
    gleiswechselBeiMotis: summe((z) => z.gleiswechselBeiMotis),
    motisMsMedian: ms[Math.floor(ms.length / 2)],
    motisMsMax: ms.at(-1),
  };
  console.log(`\nGesamt: ${JSON.stringify(gesamt)}`);

  const ordner = fileURLToPath(new URL(`../../.superpowers/pruefung-${start.toISOString().slice(0, 10)}/`, import.meta.url));
  mkdirSync(ordner, { recursive: true });
  const datei = `${ordner}motis-vergleich-${start.toISOString().slice(11, 16).replace(':', '')}.json`;
  writeFileSync(datei, JSON.stringify({ start: start.toISOString(), motis: MOTIS, gesamt, zeilen }, null, 2));
  console.log(`Ergebnis: ${datei}`);
}

await main();
