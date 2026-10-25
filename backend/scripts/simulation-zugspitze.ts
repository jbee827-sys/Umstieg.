// SIMULATION: An wie vielen Bahnhoefen kennt die App die Zugspitze?
//
// Seit dem 25.10.2026 fragt die Standortwahl nach der Stelle im ZUG
// („Zuganfang · Zugmitte · Zugende"), wenn die Fahrtrichtung sicher ist: Die
// Spitze steht am Bahnsteigende, das vom vorherigen Halt weg zeigt
// (`bestimmeZugspitze`). Sonst bleibt es bei der Himmelsrichtung. Diese
// Simulation misst, wie oft das „sonst" eintritt - je Ankunft und je Bahnhof.
//
// Je Bahnhof des Startbestands (`osm-bestand/`):
//   - Graph offline wie in `bahnhofsseiten-daten.ts`, Stufe nach Klassifikation.
//   - ECHTE Ankunftstafel (Timetables, Plan der aktuellen Stunde, je
//     Verkehrsstelle der Gruppe) - dieselbe Quelle, aus der die App den
//     vorherigen Halt nimmt.
//   - Lage jedes vorherigen und naechsten Halts aus RIS::Stations, mit
//     derselben Regel wie `/api/route` (nur genau gleicher Name).
//   - Je Ankunft: Gleis aufgeloest? Achse da? Halt gefunden? Spitze bestimmt?
//   - Gegenprobe, wo der Zug weiterfaehrt: Liegt der naechste Halt hinter der
//     Spitze (Durchgangsbahnhof, stimmig), hinter dem Zugende (Kopfbahnhof -
//     oder eine falsch erkannte Richtung) oder quer?
//
// Last: Timetables teilt sich das Minutenbudget (60) mit der Produktion.
// Deshalb hoechstens 20 Abrufe je Minute und nur der Plan EINER Stunde - die
// Produktion behaelt zwei Drittel. RIS::Stations hoechstens 60 je Minute.
// Gemerkte Haltlagen liegen in `osm-ablage/zugspitze/halte.json` (gitignored)
// und werden beim naechsten Lauf nicht neu geholt.
//
// Aufruf: npx tsx scripts/simulation-zugspitze.ts [--grenze N]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epTafelPlan } from '../src/clients/db-endpunkte.js';
import { dbAuthHeader, holeGruppe, sucheBahnhoefe } from '../src/clients/stations.js';
import { baueTafel } from '../src/clients/timetables.js';
import { baueGraph } from '../src/core/graph.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { bestimmeZugspitze, type Ort } from '../src/core/richtung.js';
import { loeseGleis } from '../src/core/routing.js';
import type { StationGraph, TafelEintrag } from '../src/core/typen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';
import { ladeSecrets } from './secrets.js';

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
const AUSGABE = fileURLToPath(new URL('../osm-ablage/zugspitze/', import.meta.url));
const HALTE = join(AUSGABE, 'halte.json');

const TIMETABLES_ABSTAND_MS = 3_000;
const RIS_ABSTAND_MS = 1_000;
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

const norm = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();

/** Dieselbe Regel wie `lageVonHalt` in `routes/api.ts`: nur genau gleicher Name. */
async function lageVon(name: string | undefined): Promise<Ort | undefined | 'fehler'> {
  if (!name) return undefined;
  if (name in halte) return halte[name] ?? undefined;
  try {
    const treffer = (await sucheBahnhoefe(name, taktFetch)).find(
      (t) => norm(t.name) === norm(name) && (t.lat !== 0 || t.lon !== 0),
    );
    halte[name] = treffer ? { lat: treffer.lat, lon: treffer.lon } : null;
    if (++halteNeu % 25 === 0) writeFileSync(HALTE, JSON.stringify(halte));
    return halte[name] ?? undefined;
  } catch (e) {
    console.log(`  Halt „${name}": ${String(e)}`);
    return 'fehler';
  }
}

// --- Bewertung ---

type Ergebnis =
  | 'bestimmt'
  | 'stufe-3'
  | 'gleis-unbekannt'
  | 'ohne-achse'
  | 'ohne-vorhalt'
  | 'halt-ohne-lage'
  | 'halt-fehler'
  | 'quer';

type Gegenprobe = 'stimmig' | 'kopf' | 'quer' | 'ohne';

interface Ankunft {
  zug: string;
  gleis: string;
  vonHalt?: string;
  nachHalt?: string;
  ergebnis: Ergebnis;
  zugspitze?: 'anfang' | 'ende';
  gegenprobe?: Gegenprobe;
  /** Nur bei `quer`: Laege der naechste Halt klar laengs zur Achse? */
  nachherKlar?: boolean;
}

interface Bahnhof {
  name: string;
  eva: string;
  stufe: number;
  evas: string[];
  tafelFehler?: string;
  ankuenfte: Ankunft[];
}

function bewerte(graph: StationGraph, e: TafelEintrag, vorher: Ort | undefined | 'fehler', nachher: Ort | undefined | 'fehler'): Omit<Ankunft, 'zug' | 'gleis' | 'vonHalt' | 'nachHalt'> {
  if (graph.stufe === 3) return { ergebnis: 'stufe-3' };
  const gleis = loeseGleis(graph, e.gleisIst ?? e.gleisSoll).gleis;
  if (!graph.gleise.includes(gleis)) return { ergebnis: 'gleis-unbekannt' };
  const anfang = graph.knoten.get(`gleis${gleis}:anfang`);
  const ende = graph.knoten.get(`gleis${gleis}:ende`);
  if (!anfang || !ende || anfang === ende) return { ergebnis: 'ohne-achse' };
  if (!e.vonHalt) return { ergebnis: 'ohne-vorhalt' };
  if (vorher === 'fehler') return { ergebnis: 'halt-fehler' };
  if (!vorher) return { ergebnis: 'halt-ohne-lage' };
  const zugspitze = bestimmeZugspitze(anfang, ende, vorher);
  if (!zugspitze) {
    // Wie oft haette der naechste Halt geholfen? Nur gezaehlt, nicht benutzt -
    // im Kopfbahnhof laege er auf der falschen Seite.
    const klar = nachher !== undefined && nachher !== 'fehler' && bestimmeZugspitze(anfang, ende, nachher) !== undefined;
    return { ergebnis: 'quer', nachherKlar: klar };
  }

  // Gegenprobe: Wohin zeigt der naechste Halt? Dieselbe Rechnung, nur von der
  // anderen Seite - liegt er hinter der Spitze, ist die Richtung stimmig.
  let gegenprobe: Gegenprobe = 'ohne';
  if (nachher && nachher !== 'fehler') {
    const seiteNach = bestimmeZugspitze(anfang, ende, nachher);
    // `bestimmeZugspitze(nachher)` nennt das Ende WEG vom naechsten Halt; im
    // Durchgangsbahnhof ist das das Zugende, also nicht die Spitze.
    gegenprobe = !seiteNach ? 'quer' : seiteNach !== zugspitze ? 'stimmig' : 'kopf';
  }
  return { ergebnis: 'bestimmt', zugspitze, gegenprobe };
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
    const bahnhof: Bahnhof = { name: eintrag.name, eva: eintrag.schluessel, stufe: graph.stufe, evas: [], ankuenfte: [] };
    bahnhoefe.push(bahnhof);

    try {
      bahnhof.evas = await holeGruppe(eintrag.schluessel, taktFetch);
    } catch (e) {
      bahnhof.evas = [eintrag.schluessel];
      console.log(`  Gruppe ${eintrag.name}: ${String(e)}`);
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
        ...bewerte(graph, e, vorher, nachher),
      });
    }
    const bestimmt = bahnhof.ankuenfte.filter((a) => a.ergebnis === 'bestimmt').length;
    console.log(
      `[${i + 1}/${dateien.length}] ${eintrag.name} (Stufe ${graph.stufe}): ${bestimmt}/${bahnhof.ankuenfte.length} bestimmt${bahnhof.tafelFehler ? ` - Tafel: ${bahnhof.tafelFehler}` : ''}`,
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

  console.log('\n=== Ankuenfte ===');
  console.log(`gesamt ${alle.length}`, zaehle(alle.map((a) => a.ergebnis)));
  const bestimmt = alle.filter((a) => a.ergebnis === 'bestimmt');
  console.log('Gegenprobe (naechster Halt)', zaehle(bestimmt.map((a) => a.gegenprobe ?? 'ohne')));
  const quer = alle.filter((a) => a.ergebnis === 'quer');
  console.log(`quer: ${quer.length}, davon mit klar laengs liegendem naechsten Halt ${quer.filter((a) => a.nachherKlar).length}`);

  const mitAnkunft = bahnhoefe.filter((b) => b.ankuenfte.length > 0);
  const anteil = (b: Bahnhof) => b.ankuenfte.filter((a) => a.ergebnis === 'bestimmt').length / b.ankuenfte.length;
  const nie = mitAnkunft.filter((b) => anteil(b) === 0);
  const voll = mitAnkunft.filter((b) => anteil(b) === 1);
  const teils = mitAnkunft.filter((b) => anteil(b) > 0 && anteil(b) < 1);
  console.log('\n=== Bahnhoefe ===');
  console.log(
    `${bahnhoefe.length} im Bestand, ${mitAnkunft.length} mit Ankuenften in der Stunde: ` +
      `${voll.length} immer bestimmt, ${teils.length} teilweise, ${nie.length} nie`,
  );
  const ohneAnkunft = bahnhoefe.filter((b) => b.ankuenfte.length === 0);
  console.log(`ohne Ankunft in der Stunde: ${ohneAnkunft.length}${ohneAnkunft.some((b) => b.tafelFehler) ? ` (davon mit Tafelfehler ${ohneAnkunft.filter((b) => b.tafelFehler).length})` : ''}`);

  const grund = (b: Bahnhof) => {
    const z = zaehle(b.ankuenfte.filter((a) => a.ergebnis !== 'bestimmt').map((a) => a.ergebnis));
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
  console.log('\nKopf in der Gegenprobe (naechster Halt auf der Seite des vorherigen):');
  const kopf = new Map<string, number>();
  for (const b of bahnhoefe) {
    const n = b.ankuenfte.filter((a) => a.gegenprobe === 'kopf').length;
    if (n > 0) kopf.set(b.name, n);
  }
  for (const [name, n] of [...kopf].sort((x, y) => y[1] - x[1])) console.log(`  ${name}: ${n}`);
  const ohneLage = zaehle(alle.filter((a) => a.ergebnis === 'halt-ohne-lage').map((a) => a.vonHalt ?? ''));
  console.log('\nHalte ohne Lage (Name nicht genau gefunden):', Object.keys(ohneLage).length);
  for (const [name, n] of Object.entries(ohneLage).sort((x, y) => y[1] - x[1]).slice(0, 40)) console.log(`  „${name}" ${n}`);
}

await main();
