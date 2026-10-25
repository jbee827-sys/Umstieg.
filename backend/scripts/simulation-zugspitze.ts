// SIMULATION: An wie vielen Bahnhoefen kennt die App die Zugspitze?
//
// Seit dem 25.10.2026 fragt die Standortwahl nach der Stelle im ZUG
// („Zuganfang · Zugmitte · Zugende"), wenn die Fahrtrichtung sicher ist
// (`bestimmeZugspitze`): weg vom vorherigen Halt; liegt der quer oder fehlt
// seine Lage, zum naechsten Halt hin; am Kopfgleis (RIS `headPlatform`)
// immer entgegen dem naechsten Halt. Sonst bleibt es bei der Himmelsrichtung.
// Diese Simulation misst, wie oft das „sonst" eintritt - je Ankunft und je
// Bahnhof.
//
// Je Bahnhof des Startbestands (`osm-bestand/`):
//   - Graph offline wie in `bahnhofsseiten-daten.ts`, Stufe nach Klassifikation.
//   - Stationsauskunft aus RIS::Stations wie in `/api/route`: Verkehrsstellen
//     der Gruppe und Gleisliste - fuer Teilgleise („11 B-C") und Kopfgleise.
//   - ECHTE Ankunftstafel (Timetables, Plan der aktuellen Stunde, je
//     Verkehrsstelle) - dieselbe Quelle, aus der die App die Halte nimmt.
//   - Lage jedes vorherigen und naechsten Halts aus RIS::Stations, mit
//     derselben Namensregel wie `/api/route` (`core/haltname.ts`).
//   - Je Ankunft: Gleis aufgeloest? Achse da? Spitze bestimmt - und woraus?
//   - Gegenprobe, wo beide Halte laengs liegen: Stimmen sie ueberein?
//
// Last: Timetables teilt sich das Minutenbudget (60) mit der Produktion.
// Deshalb hoechstens 20 Abrufe je Minute und nur der Plan EINER Stunde - die
// Produktion behaelt zwei Drittel. RIS::Stations hoechstens 50 je Minute.
// Gemerkte Haltlagen liegen in `osm-ablage/zugspitze/halte.json` (gitignored),
// je GESUCHTEM Namen, und werden beim naechsten Lauf nicht neu geholt.
//
// Aufruf: npx tsx scripts/simulation-zugspitze.ts [--grenze N]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epTafelPlan } from '../src/clients/db-endpunkte.js';
import { dbAuthHeader, holeStationsInfo, sucheBahnhoefe } from '../src/clients/stations.js';
import { baueTafel } from '../src/clients/timetables.js';
import { baueGraph } from '../src/core/graph.js';
import { gleicherHaltname, haltnamenZurSuche } from '../src/core/haltname.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { bestimmeZugspitze, type Ort } from '../src/core/richtung.js';
import { istKopfgleis, loeseGleis } from '../src/core/routing.js';
import type { StationGraph, StationsInfo, TafelEintrag } from '../src/core/typen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';
import { ladeSecrets } from './secrets.js';

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
const AUSGABE = fileURLToPath(new URL('../osm-ablage/zugspitze/', import.meta.url));
const HALTE = join(AUSGABE, 'halte.json');

const TIMETABLES_ABSTAND_MS = 3_000;
const RIS_ABSTAND_MS = 1_200;
const PAUSE_429_MS = 65_000;

// --- Abrufe im Takt ---

const letzterAbruf = new Map<string, number>();
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch mit Mindestabstand je Schnittstelle und Wiederholung nach 429. */
async function taktFetch(eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(eingabe);
  const art = url.includes('/timetables/') ? 'timetables' : 'ris';
  const abstand = art === 'timetables' ? TIMETABLES_ABSTAND_MS : RIS_ABSTAND_MS;
  for (let versuch = 0; ; versuch++) {
    const seit = Date.now() - (letzterAbruf.get(art) ?? 0);
    if (seit < abstand) await warte(abstand - seit);
    letzterAbruf.set(art, Date.now());
    const antwort = await fetch(eingabe, init);
    if (antwort.status !== 429 || versuch >= 3) return antwort;
    console.log(`  ${art}: 429 - Pause ${PAUSE_429_MS / 1000} s`);
    await warte(PAUSE_429_MS);
  }
}

// --- Haltlagen, gemerkt ueber Laeufe ---

type HaltLage = { lat: number; lon: number } | null;
const halte: Record<string, HaltLage> = existsSync(HALTE)
  ? (JSON.parse(readFileSync(HALTE, 'utf8')) as Record<string, HaltLage>)
  : {};
let halteNeu = 0;

/** Dieselbe Regel wie `lageVonHalt` in `routes/api.ts`. */
async function lageVon(name: string | undefined): Promise<Ort | undefined | 'fehler'> {
  if (!name) return undefined;
  for (const gesucht of haltnamenZurSuche(name)) {
    if (!(gesucht in halte)) {
      try {
        const treffer = (await sucheBahnhoefe(gesucht, taktFetch)).find(
          (t) => gleicherHaltname(t.name, gesucht) && (t.lat !== 0 || t.lon !== 0),
        );
        halte[gesucht] = treffer ? { lat: treffer.lat, lon: treffer.lon } : null;
        if (++halteNeu % 25 === 0) writeFileSync(HALTE, JSON.stringify(halte));
      } catch (e) {
        console.log(`  Halt „${gesucht}": ${String(e)}`);
        return 'fehler';
      }
    }
    if (halte[gesucht]) return halte[gesucht]!;
  }
  return undefined;
}

// --- Bewertung ---

type Ergebnis =
  | 'vorher'
  | 'nachher'
  | 'kopf-nachher'
  | 'kopf-vorher'
  | 'stufe-3'
  | 'ohne-gleisangabe'
  | 'gleis-unbekannt'
  | 'ohne-achse'
  | 'halt-fehler'
  | 'halte-ohne-lage'
  | 'quer';

const BESTIMMT: Ergebnis[] = ['vorher', 'nachher', 'kopf-nachher', 'kopf-vorher'];

/** Wo beide Halte laengs liegen: zeigen sie dieselbe Richtung? */
type Gegenprobe = 'stimmig' | 'widerspruch';

interface Ankunft {
  zug: string;
  gleis: string;
  vonHalt?: string;
  nachHalt?: string;
  kopfgleis: boolean;
  ergebnis: Ergebnis;
  zugspitze?: 'anfang' | 'ende';
  gegenprobe?: Gegenprobe;
}

interface Bahnhof {
  name: string;
  eva: string;
  stufe: number;
  evas: string[];
  kopfgleise: string[];
  tafelFehler?: string;
  ankuenfte: Ankunft[];
}

function bewerte(
  graph: StationGraph,
  info: Pick<StationsInfo, 'gleise'>,
  e: TafelEintrag,
  vorher: Ort | undefined | 'fehler',
  nachher: Ort | undefined | 'fehler',
): Omit<Ankunft, 'zug' | 'gleis' | 'vonHalt' | 'nachHalt'> {
  const angefragt = e.gleisIst ?? e.gleisSoll;
  const gleis = loeseGleis(graph, angefragt, info.gleise).gleis;
  const kopfgleis = istKopfgleis(info, angefragt, gleis);
  if (graph.stufe === 3) return { kopfgleis, ergebnis: 'stufe-3' };
  if (angefragt === '') return { kopfgleis, ergebnis: 'ohne-gleisangabe' };
  if (!graph.gleise.includes(gleis)) return { kopfgleis, ergebnis: 'gleis-unbekannt' };
  const anfang = graph.knoten.get(`gleis${gleis}:anfang`);
  const ende = graph.knoten.get(`gleis${gleis}:ende`);
  if (!anfang || !ende || anfang === ende) return { kopfgleis, ergebnis: 'ohne-achse' };
  if (vorher === 'fehler' || nachher === 'fehler') return { kopfgleis, ergebnis: 'halt-fehler' };
  if (!vorher && !nachher) return { kopfgleis, ergebnis: 'halte-ohne-lage' };

  const zugspitze = bestimmeZugspitze(anfang, ende, { vorher, nachher, kopfgleis });
  if (!zugspitze) return { kopfgleis, ergebnis: 'quer' };

  // Woraus die Spitze kommt: dieselbe Regel einzeln befragt.
  const ausVorher = bestimmeZugspitze(anfang, ende, { vorher, kopfgleis });
  const ausNachher = bestimmeZugspitze(anfang, ende, { nachher, kopfgleis });
  const ergebnis: Ergebnis = kopfgleis
    ? ausNachher
      ? 'kopf-nachher'
      : 'kopf-vorher'
    : ausVorher
      ? 'vorher'
      : 'nachher';
  const gegenprobe: Gegenprobe | undefined =
    ausVorher && ausNachher ? (ausVorher === ausNachher ? 'stimmig' : 'widerspruch') : undefined;
  return { kopfgleis, ergebnis, zugspitze, ...(gegenprobe ? { gegenprobe } : {}) };
}

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(AUSGABE, { recursive: true });
  const grenzeArg = process.argv.indexOf('--grenze');
  const grenze = grenzeArg > 0 ? Number(process.argv[grenzeArg + 1]) : Infinity;

  const dateien = readdirSync(BESTAND)
    .filter((n) => n.endsWith('.json.gz'))
    .sort()
    .slice(0, grenze);
  const jetzt = new Date();
  console.log(`${dateien.length} Bahnhoefe, Plan der Stunde ab ${jetzt.toISOString()}, ${Object.keys(halte).length} Halte gemerkt`);

  const bahnhoefe: Bahnhof[] = [];
  for (const [i, datei] of dateien.entries()) {
    const eintrag = await entpackeEintrag(readFileSync(join(BESTAND, datei)));
    const graph = baueGraph(eintrag.osm);
    graph.stufe = klassifiziere(graph);
    const bahnhof: Bahnhof = {
      name: eintrag.name,
      eva: eintrag.schluessel,
      stufe: graph.stufe,
      evas: [],
      kopfgleise: [],
      ankuenfte: [],
    };
    bahnhoefe.push(bahnhof);

    let info: Pick<StationsInfo, 'gleise'> = { gleise: [] };
    try {
      const voll = await holeStationsInfo(eintrag.schluessel, taktFetch);
      info = voll;
      bahnhof.evas = voll.evas;
      bahnhof.kopfgleise = voll.gleise.filter((g) => g.ris?.headPlatform === true).map((g) => g.gleis);
    } catch (e) {
      bahnhof.evas = [eintrag.schluessel];
      console.log(`  Stationsauskunft ${eintrag.name}: ${String(e)}`);
    }
    const eintraege: TafelEintrag[] = [];
    for (const eva of bahnhof.evas) {
      try {
        const antwort = await taktFetch(epTafelPlan(eva, jetzt), {
          headers: { ...dbAuthHeader(), Accept: 'application/xml' },
          signal: AbortSignal.timeout(15_000),
        });
        // 404 = diese Verkehrsstelle hat in der Stunde keinen Plan - kein Fehler.
        if (antwort.status === 404) continue;
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        eintraege.push(...baueTafel([await antwort.text()], '<timetable/>', 'arr'));
      } catch (e) {
        bahnhof.tafelFehler = String(e);
      }
    }
    // Je Zug einmal - eine Fahrt kann unter zwei Verkehrsstellen stehen.
    const gesehen = new Set<string>();
    for (const e of eintraege) {
      const schluessel = `${e.zug}|${e.zeitSoll}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      const vorher = await lageVon(e.vonHalt);
      const nachher = await lageVon(e.nachHalt);
      bahnhof.ankuenfte.push({
        zug: e.zug,
        gleis: e.gleisIst ?? e.gleisSoll,
        ...(e.vonHalt ? { vonHalt: e.vonHalt } : {}),
        ...(e.nachHalt ? { nachHalt: e.nachHalt } : {}),
        ...bewerte(graph, info, e, vorher, nachher),
      });
    }
    const bestimmt = bahnhof.ankuenfte.filter((a) => BESTIMMT.includes(a.ergebnis)).length;
    console.log(
      `[${i + 1}/${dateien.length}] ${eintrag.name} (Stufe ${graph.stufe}${bahnhof.kopfgleise.length ? `, Kopf ${bahnhof.kopfgleise.length}` : ''}): ${bestimmt}/${bahnhof.ankuenfte.length} bestimmt${bahnhof.tafelFehler ? ` - Tafel: ${bahnhof.tafelFehler}` : ''}`,
    );
    writeFileSync(join(AUSGABE, 'ergebnis.json'), JSON.stringify(bahnhoefe, null, 1));
  }
  writeFileSync(HALTE, JSON.stringify(halte));
  auswerten(bahnhoefe);
}

function auswerten(bahnhoefe: Bahnhof[]): void {
  const alle = bahnhoefe.flatMap((b) => b.ankuenfte);
  const zaehle = <T extends string>(werte: T[]) =>
    werte.reduce<Record<string, number>>((z, w) => ((z[w] = (z[w] ?? 0) + 1), z), {});
  const istBestimmt = (a: Ankunft) => BESTIMMT.includes(a.ergebnis);

  console.log('\n=== Ankuenfte ===');
  const bestimmt = alle.filter(istBestimmt).length;
  console.log(`gesamt ${alle.length}, bestimmt ${bestimmt} (${Math.round((bestimmt / alle.length) * 1000) / 10} %)`);
  console.log(zaehle(alle.map((a) => a.ergebnis)));
  console.log('Gegenprobe (beide Halte laengs)', zaehle(alle.flatMap((a) => (a.gegenprobe ? [a.gegenprobe] : []))));
  console.log(`am Kopfgleis: ${alle.filter((a) => a.kopfgleis).length} Ankuenfte`);

  const mitAnkunft = bahnhoefe.filter((b) => b.ankuenfte.length > 0);
  const anteil = (b: Bahnhof) => b.ankuenfte.filter(istBestimmt).length / b.ankuenfte.length;
  const nie = mitAnkunft.filter((b) => anteil(b) === 0);
  const voll = mitAnkunft.filter((b) => anteil(b) === 1);
  const teils = mitAnkunft.filter((b) => anteil(b) > 0 && anteil(b) < 1);
  console.log('\n=== Bahnhoefe ===');
  console.log(
    `${bahnhoefe.length} im Bestand, ${mitAnkunft.length} mit Ankuenften in der Stunde: ` +
      `${voll.length} immer bestimmt, ${teils.length} teilweise, ${nie.length} nie`,
  );
  console.log(`mit Kopfgleisen laut RIS: ${bahnhoefe.filter((b) => b.kopfgleise.length > 0).map((b) => b.name).join(', ')}`);
  const ohneAnkunft = bahnhoefe.filter((b) => b.ankuenfte.length === 0);
  console.log(`ohne Ankunft in der Stunde: ${ohneAnkunft.length} (${ohneAnkunft.map((b) => b.name).join(', ')})`);

  const grund = (b: Bahnhof) => {
    const z = zaehle(b.ankuenfte.filter((a) => !istBestimmt(a)).map((a) => a.ergebnis));
    return Object.entries(z)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
  };
  console.log('\nNie bestimmt:');
  for (const b of nie) console.log(`  ${b.name} (Stufe ${b.stufe}, ${b.ankuenfte.length} Ankuenfte): ${grund(b)}`);
  console.log('\nTeilweise (unter 80 %):');
  for (const b of teils.filter((x) => anteil(x) < 0.8).sort((x, y) => anteil(x) - anteil(y))) {
    console.log(`  ${b.name}: ${Math.round(anteil(b) * 100)} % von ${b.ankuenfte.length} - ${grund(b)}`);
  }
  console.log('\nWiderspruch in der Gegenprobe:');
  const wider = new Map<string, number>();
  for (const b of bahnhoefe) {
    const n = b.ankuenfte.filter((a) => a.gegenprobe === 'widerspruch').length;
    if (n > 0) wider.set(b.name, n);
  }
  for (const [name, n] of [...wider].sort((x, y) => y[1] - x[1])) console.log(`  ${name}: ${n}`);
  const ohneLage = zaehle(
    alle.filter((a) => a.ergebnis === 'halte-ohne-lage').flatMap((a) => [a.vonHalt ?? '', a.nachHalt ?? '']).filter(Boolean),
  );
  console.log('\nHalte ohne Lage (Name nicht genau gefunden):', Object.keys(ohneLage).length);
  for (const [name, n] of Object.entries(ohneLage).sort((x, y) => y[1] - x[1]).slice(0, 40)) console.log(`  „${name}" ${n}`);
}

await main();
