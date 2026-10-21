// Rechnet die Gehzeiten fuer die vorgerenderten Bahnhofsseiten (Konzept
// Nutzergewinnung, AP 5a, 21.10.2026): je Bahnhof des Startbestands jedes
// geordnete Gleispaar, schnellste und stufenfreie Route - offline, ohne
// Server, ohne Netz und ohne Schluessel. Dieselben Bausteine wie /api/route
// (Vorbild: scripts/routenabzug.ts).
//
// Vercel baut nur frontend/ - deshalb landen die Ergebnisse als JSON im
// Frontend (frontend/src/bahnhofsseiten/daten/<slug>.json) und werden
// eingecheckt. Gerundet wird erst dort; die Daten tragen Sekunden.
//
// Erneut laufen lassen nach jeder Erneuerung des Startbestands
// (scripts/bestand-fuellen.ts):
//
//   cd backend && npm run bahnhofsseiten
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueGraph, haversineM } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten, istGleicherBahnsteig } from '../src/core/routing.js';
import type { RoutenPfad, StationGraph, Stufe } from '../src/core/typen.js';
import { entpackeEintrag, type BestandsEintrag } from '../src/osm/bestand.js';

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
export const ZIEL = fileURLToPath(new URL('../../frontend/src/bahnhofsseiten/daten/', import.meta.url));

/** Ueber dieser Gesamtgroesse wird vor dem Einchecken nachgefragt (Konzept 5a.6). */
export const GRENZE_BYTES = 5 * 1024 * 1024;

export type Anlage = 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';

/**
 * Wie der schnellste Weg in der Hoehe verlaeuft. Gleiche Ebene an Start und
 * Ziel: hinunter und wieder herauf = Unterfuehrung, hinauf und wieder
 * herunter = Ueberfuehrung (Steg, Halle). Sonst die Richtung zum Ziel.
 */
export type Lage = 'ebenerdig' | 'unterfuehrung' | 'ueberfuehrung' | 'nach-unten' | 'nach-oben';

export interface Gleispaar {
  von: string;
  nach: string;
  /** Beide Gleise am selben physischen Bahnsteig (istGleicherBahnsteig, nur OSM). */
  gleicherBahnsteig: boolean;
  /** Schnellste Route ab Bahnsteigmitte, normales Gehtempo; null = kein Weg im Graphen. */
  sek: number | null;
  /** Ebenenwechsel der schnellsten Route - wie `schema.wechsel` in /api/route. */
  wechsel: number;
  /** Genutzte Anlagen der schnellsten Route, in Wegreihenfolge, ohne Dopplung. */
  anlagen: Anlage[];
  lage: Lage;
  /** Barrierefreie Route; null = nicht moeglich. */
  stufenfreiSek: number | null;
}

export interface Bahnhofsdaten {
  name: string;
  eva: string;
  slug: string;
  lat: number;
  lon: number;
  stufe: Stufe;
  geholtAm: string;
  gleise: string[];
  paare: Gleispaar[];
}

/**
 * Kurzname fuer die Adresse: Kleinbuchstaben, ae/oe/ue/ss, alles ausser
 * a-z und 0-9 wird zu `-`, doppelte Bindestriche zusammengefasst, keine am
 * Rand. „Frankfurt(Main)Hbf" → `frankfurt-main-hbf`.
 */
export function slugVon(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Zwei Bahnhoefe mit demselben Kurznamen brechen ab - eine Seite ueberschriebe die andere. */
export function pruefeSlugs(liste: { name: string; slug: string }[]): void {
  const gesehen = new Map<string, string>();
  const kollisionen: string[] = [];
  for (const { name, slug } of liste) {
    const vorher = gesehen.get(slug);
    if (vorher !== undefined) kollisionen.push(`${slug}: „${vorher}" und „${name}"`);
    else gesehen.set(slug, name);
  }
  if (kollisionen.length > 0) {
    throw new Error(`Kurznamen nicht eindeutig:\n  ${kollisionen.join('\n  ')}`);
  }
}

export function graphAus(eintrag: BestandsEintrag): StationGraph {
  const graph = baueGraph(eintrag.osm);
  graph.stufe = klassifiziere(graph);
  return graph;
}

function mitteVon(graph: StationGraph, gleis: string): { lat: number; lon: number } | undefined {
  return graph.knoten.get(`gleis${gleis}:mitte`) ?? [...graph.knoten.values()].find((k) => k.gleis === gleis);
}

/** Bahnsteigmitten je Gleis - Grundlage fuer `fremdeGleise`. */
export function gleisMitten(graph: StationGraph): Map<string, { lat: number; lon: number }> {
  const mitten = new Map<string, { lat: number; lon: number }>();
  for (const gleis of graph.gleise) {
    const m = mitteVon(graph, gleis);
    if (m) mitten.set(gleis, { lat: m.lat, lon: m.lon });
  }
  return mitten;
}

/** Gleiche Bahnsteigmitte = derselbe Bahnsteig, auch unter zwei Bahnhoefen. */
const GLEICHE_MITTE_M = 10;

/**
 * Gleise, die ein Bahnhof einem anderen ueberlassen muss.
 *
 * OSM fuehrt im Startbestand (Stand 13.10.2026) die Gleise 5-34 von München
 * Hbf auch unter München Hackerbrücke und 51-56 unter Karlsplatz - die
 * Overpass-Abfrage holt alles im Umkreis. In der App faellt das nicht auf:
 * Dort waehlt man Gleise aus dem Fahrplan. Auf einer Seite „Umsteigen in
 * München Hackerbrücke" stuende Gleis 34. Deshalb: Liegt dieselbe
 * Bahnsteigmitte unter zwei Bahnhoefen, gehoert sie dem mit mehr Gleisen;
 * bei Gleichstand beiden (Frankfurt Flughafen Fern- und Regionalbahnhof sind
 * ein Gebaeude).
 */
export function fremdeGleise(
  bahnhoefe: { schluessel: string; gleise: Map<string, { lat: number; lon: number }> }[],
): Map<string, Set<string>> {
  const fremd = new Map<string, Set<string>>();
  const merke = (schluessel: string, gleis: string) => {
    if (!fremd.has(schluessel)) fremd.set(schluessel, new Set());
    fremd.get(schluessel)!.add(gleis);
  };
  for (let i = 0; i < bahnhoefe.length; i++) {
    for (let j = i + 1; j < bahnhoefe.length; j++) {
      const a = bahnhoefe[i];
      const b = bahnhoefe[j];
      if (a.gleise.size === b.gleise.size) continue;
      const kleiner = a.gleise.size < b.gleise.size ? a : b;
      const groesser = kleiner === a ? b : a;
      for (const [gleis, m] of kleiner.gleise) {
        const dort = groesser.gleise.get(gleis);
        if (dort && haversineM(m.lat, m.lon, dort.lat, dort.lon) < GLEICHE_MITTE_M) {
          merke(kleiner.schluessel, gleis);
        }
      }
    }
  }
  return fremd;
}

const ANLAGEN: ReadonlySet<string> = new Set<Anlage>(['treppe', 'rolltreppe', 'aufzug', 'rampe']);

/** Ebenenwechsel und Anlagen des Wegs - dieselbe Regel wie `sammleWechsel` in core/schema.ts. */
function wegMerkmale(pfad: RoutenPfad): Pick<Gleispaar, 'wechsel' | 'anlagen' | 'lage'> {
  let wechsel = 0;
  const anlagen: Anlage[] = [];
  for (const kante of pfad.kanten) {
    if (kante.deltaLevel !== 0) wechsel++;
    if (ANLAGEN.has(kante.typ) && !anlagen.includes(kante.typ as Anlage)) anlagen.push(kante.typ as Anlage);
  }
  const ebenen = pfad.knoten.map((k) => k.level);
  const start = ebenen[0] ?? 0;
  const ziel = ebenen[ebenen.length - 1] ?? 0;
  let lage: Lage = 'ebenerdig';
  if (ziel < start) lage = 'nach-unten';
  else if (ziel > start) lage = 'nach-oben';
  else if (Math.min(...ebenen) < start) lage = 'unterfuehrung';
  else if (Math.max(...ebenen) > start) lage = 'ueberfuehrung';
  return { wechsel, anlagen, lage };
}

/**
 * Alle Gleispaare eines Bahnhofs. `null` fuer Stufe 3 (Standardmodell):
 * Dort waeren die Werte nur geschaetzt - dafuer gibt es keine Seite
 * (Konzept 5a.2, Vorgabe aus Abschnitt 7).
 */
export function berechneBahnhof(
  eintrag: BestandsEintrag,
  graph: StationGraph,
  ohne: ReadonlySet<string> = new Set(),
): Bahnhofsdaten | null {
  if (graph.stufe === 3) return null;
  const gleise = graph.gleise.filter((g) => !ohne.has(g));
  const paare: Gleispaar[] = [];
  for (const von of gleise) {
    const start = findeStartknoten(graph, von, 'mitte');
    for (const nach of gleise) {
      if (von === nach) continue;
      const ziel = findeStartknoten(graph, nach);
      const schnell = berechneRoute(graph, start.knoten.id, ziel.knoten.id, 'schnellste', 'normal');
      const stufenfrei = berechneRoute(graph, start.knoten.id, ziel.knoten.id, 'barrierefrei', 'normal');
      paare.push({
        von,
        nach,
        gleicherBahnsteig: istGleicherBahnsteig(graph, von, nach),
        sek: schnell ? gehzeitSekunden(schnell, 'normal') : null,
        ...(schnell ? wegMerkmale(schnell) : { wechsel: 0, anlagen: [], lage: 'ebenerdig' as const }),
        stufenfreiSek: stufenfrei ? gehzeitSekunden(stufenfrei, 'normal') : null,
      });
    }
  }
  return {
    name: eintrag.name,
    eva: eintrag.schluessel,
    slug: slugVon(eintrag.name),
    lat: eintrag.lat,
    lon: eintrag.lon,
    stufe: graph.stufe,
    geholtAm: eintrag.geholtAm,
    gleise,
    paare,
  };
}

/** Kopfdaten lesbar, je Gleispaar eine Zeile - knapp und im Diff nachvollziehbar. */
export function alsJson(d: Bahnhofsdaten): string {
  const { paare, ...kopf } = d;
  const kopfText = JSON.stringify(kopf, null, 2).replace(/\n}$/, '');
  const zeilen = paare.map((p) => `    ${JSON.stringify(p)}`).join(',\n');
  return `${kopfText},\n  "paare": [\n${zeilen}\n  ]\n}\n`;
}

async function main(): Promise<void> {
  const beginn = Date.now();
  const dateien = readdirSync(BESTAND).filter((n) => n.endsWith('.json.gz')).sort();
  const geladen: { eintrag: BestandsEintrag; graph: StationGraph }[] = [];
  const stufe3: string[] = [];
  for (const datei of dateien) {
    const eintrag = await entpackeEintrag(readFileSync(join(BESTAND, datei)));
    const graph = graphAus(eintrag);
    if (graph.stufe === 3) stufe3.push(`${eintrag.name} (${eintrag.schluessel})`);
    else geladen.push({ eintrag, graph });
  }

  const fremd = fremdeGleise(
    geladen.map(({ eintrag, graph }) => ({ schluessel: eintrag.schluessel, gleise: gleisMitten(graph) })),
  );

  const alle: Bahnhofsdaten[] = [];
  for (const { eintrag, graph } of geladen) {
    const daten = berechneBahnhof(eintrag, graph, fremd.get(eintrag.schluessel));
    if (daten) alle.push(daten);
  }
  pruefeSlugs(alle);

  // Alte Dateien weg: Ein Bahnhof, der aus dem Bestand faellt, darf keine
  // Seite behalten.
  rmSync(ZIEL, { recursive: true, force: true });
  mkdirSync(ZIEL, { recursive: true });
  let gesamt = 0;
  for (const d of alle) {
    const pfad = join(ZIEL, `${d.slug}.json`);
    writeFileSync(pfad, alsJson(d), 'utf8');
    gesamt += statSync(pfad).size;
  }

  const groesster = alle.reduce((a, b) => (b.gleise.length > a.gleise.length ? b : a));
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`Bahnhoefe im Bestand: ${dateien.length}`);
  console.log(`  Stufe 1: ${alle.filter((d) => d.stufe === 1).length}`);
  console.log(`  Stufe 2: ${alle.filter((d) => d.stufe === 2).length}`);
  console.log(`  Stufe 3 (keine Seite): ${stufe3.length}${stufe3.length ? ` - ${stufe3.join(', ')}` : ''}`);
  for (const [schluessel, gleise] of fremd) {
    const name = geladen.find((g) => g.eintrag.schluessel === schluessel)?.eintrag.name ?? schluessel;
    console.log(`  Gleise einem groesseren Bahnhof ueberlassen: ${name} - ${[...gleise].join(' ')}`);
  }
  console.log(`Groesste Gleisanzahl: ${groesster.gleise.length} (${groesster.name})`);
  console.log(`Gleispaare: ${alle.reduce((s, d) => s + d.paare.length, 0)}`);
  console.log(`JSON gesamt: ${mb(gesamt)} in ${alle.length} Dateien → ${ZIEL}`);
  console.log(`Laufzeit: ${((Date.now() - beginn) / 1000).toFixed(0)} s`);
  if (gesamt > GRENZE_BYTES) {
    console.log(`ACHTUNG: ueber ${mb(GRENZE_BYTES)} - vor dem Einchecken Rueckfrage (Konzept 5a.6).`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('bahnhofsseiten-daten.ts')) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
