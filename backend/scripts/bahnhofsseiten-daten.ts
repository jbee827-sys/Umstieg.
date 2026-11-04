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
//
// Seit dem 04.11.2026 (Spec 6.2/6.3) baut das Skript den Graphen wie der Server
// mit der DB-Gleisliste, soweit sie unter osm-ablage/db-gleise/ liegt
// (scripts/db-gleise-fuellen.ts): DB-Namen statt OSM-Nummern, Gleisarten,
// U-Bahn-Steige. Ohne Ablage rechnet es wie zuvor und sagt es im Lauf.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueGraph, haversineM } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten, istGleicherBahnsteig } from '../src/core/routing.js';
import type { GraphKnoten, RoutenPfad, StationGraph, Stufe } from '../src/core/typen.js';
import { gleislisteUnvollstaendig } from '../src/clients/stations.js';
import { namensSchluessel } from '../src/core/orte.js';
import type { StationsInfo, UbahnSteig } from '../src/core/typen.js';
import { entpackeEintrag, type BestandsEintrag } from '../src/osm/bestand.js';
import { ladeAblage } from './db-gleise-fuellen.js';

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

/** Ein U-Bahn-Steig mit seinen Wegen zu jedem Gleis; `von` = Beschriftung des Steigs. */
export interface UbahnDaten {
  id: string;
  label: string;
  paare: Gleispaar[];
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
  /** Art je Gleis (Spec 6.2): S-Bahn nur, wo sie sich sicher erkennen laesst, sonst Zuege. */
  gleisArt: Record<string, 'zug' | 'sbahn'>;
  /** U-Bahn-Steige des Bahnhofs, je Steig die Wege zu den Gleisen. */
  ubahn: UbahnDaten[];
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

/**
 * Der Graph eines Bestandseintrags - mit `db` genau so gebaut wie im Server
 * (`baueGraphEintrag` in routes/api.ts), ohne wie vor dem 04.11.2026.
 */
export function graphAus(eintrag: BestandsEintrag, db?: StationsInfo): StationGraph {
  const graph = db
    ? baueGraph(eintrag.osm, db.gleise, {
        gleislisteVollstaendig: !gleislisteUnvollstaendig(db),
        ...(db.sbahnEvas ? { sbahnEvas: db.sbahnEvas } : {}),
      })
    : baueGraph(eintrag.osm);
  graph.stufe = klassifiziere(graph);
  return graph;
}

function mitteVon(graph: StationGraph, gleis: string): GraphKnoten | undefined {
  return graph.knoten.get(`gleis${gleis}:mitte`) ?? [...graph.knoten.values()].find((k) => k.gleis === gleis);
}

/** Schluessel eines U-Bahn-Steigs in `fremdeGleise`/`ohne` - kann keinem Gleisnamen gleichen. */
export const ubahnSchluessel = (id: string): string => `ubahn:${id}`;

/** Zusaetze, die ein U-Bahn-Steig zum Bahnhofsnamen haben darf (Hamburg „Hauptbahnhof Nord“). */
const HIMMELSRICHTUNGEN: ReadonlySet<string> = new Set(['nord', 'sued', 'ost', 'west']);

/** Woerter einer Steigbeschreibung, die nichts ueber den Ort sagen: Linien („u3“) und „Bahnsteig“. */
const OHNE_ORT = (w: string): boolean => /^[a-z]{1,3}\d+$/.test(w) || w === 'bahnsteig';

/**
 * Passt der OSM-Name eines U-Bahn-Steigs zum Bahnhof (Spec 6.2)? Der
 * Overpass-Umkreis bringt Steige fremder Haltestellen mit (Hamburg Hbf:
 * Moenckebergstrasse; Stuttgart Hbf: Staatsgalerie; Alexanderplatz: Rotes
 * Rathaus). Die Woerter des Steignamens muessen im Bahnhofsnamen stehen
 * („Hauptbahnhof“ = „Hbf“ ueber `namensSchluessel`), dazu eine Himmelsrichtung.
 * Linienkuerzel und „Bahnsteig“ zaehlen nicht: Ohne `name` kommt hier die
 * Beschreibung an („Marienplatz U3 U6 Bahnsteig“).
 * Ohne Namen laesst sich nichts widerlegen - der Steig bleibt.
 */
export function ubahnNamePasst(steigName: string | undefined, bahnhof: string): boolean {
  if (!steigName) return true;
  const woerter = namensSchluessel(steigName)
    .split(' ')
    .filter((w) => w && !HIMMELSRICHTUNGEN.has(w) && !OHNE_ORT(w));
  if (woerter.length === 0) return false;
  const bahnhofsWoerter = new Set(namensSchluessel(bahnhof).split(' '));
  return woerter.every((w) => bahnhofsWoerter.has(w));
}

const steigeCache = new WeakMap<StationGraph, UbahnSteig[]>();

/**
 * So weit darf ein Steig ohne Namen und ohne Beschreibung von der naechsten
 * Gleismitte liegen. Gemessen am 04.11.2026 ueber den Bestand: Die 9
 * unbenannten Steige, die dazugehoeren, liegen hoechstens 141 m entfernt
 * (Marienplatz); Taunusanlages „Alte Oper“ 266 m.
 */
const UNBENANNT_MAX_M = 150;

/**
 * Die U-Bahn-Steige, die zu diesem Bahnhof gehoeren: im Graphen von einem
 * Gleis aus erreichbar UND dem Namen nach (`ubahnNamePasst`, ohne `name` die
 * Beschreibung). Ohne beides entscheidet die Lage (`UNBENANNT_MAX_M`). Der
 * Graph gehoert zu genau einem Bahnhof; das Ergebnis wird je Graph gemerkt.
 */
export function ubahnSteigeDesBahnhofs(graph: StationGraph, bahnhofsname: string): UbahnSteig[] {
  const gemerkt = steigeCache.get(graph);
  if (gemerkt) return gemerkt;
  const mitten = graph.gleise.map((g) => mitteVon(graph, g)).filter((k): k is GraphKnoten => k !== undefined);
  const ergebnis = (graph.ubahnSteige ?? []).filter((steig) => {
    const kennzeichen = steig.name ?? steig.beschreibung;
    if (!ubahnNamePasst(kennzeichen, bahnhofsname)) return false;
    const start = graph.knoten.get(`ubahn${steig.id}:mitte`);
    if (!start) return false;
    if (!kennzeichen && !mitten.some((m) => haversineM(m.lat, m.lon, start.lat, start.lon) <= UNBENANNT_MAX_M)) {
      return false;
    }
    return graph.gleise.some((gleis) => {
      const ziel = mitteVon(graph, gleis);
      return ziel !== undefined && berechneRoute(graph, start.id, ziel.id, 'schnellste', 'normal') !== null;
    });
  });
  steigeCache.set(graph, ergebnis);
  return ergebnis;
}

/** Die Mitte eines Bahnsteigs und, wo der Graph sie kennt, seine OSM-Kennung (`w<id>`/`r<id>`). */
export interface Bahnsteigmitte {
  lat: number;
  lon: number;
  bahnsteigId?: string;
}

const mitteMitKennung = (k: GraphKnoten): Bahnsteigmitte => ({
  lat: k.lat,
  lon: k.lon,
  ...(k.bahnsteigId ? { bahnsteigId: k.bahnsteigId } : {}),
});

/**
 * Bahnsteigmitten je Gleis und je U-Bahn-Steig - Grundlage fuer
 * `fremdeGleise`. U-Bahn-Steige zaehlen wie Gleise: Auch sie holt der
 * Overpass-Umkreis unter zwei Bahnhoefen.
 */
export function gleisMitten(graph: StationGraph, bahnhofsname: string): Map<string, Bahnsteigmitte> {
  const mitten = new Map<string, Bahnsteigmitte>();
  for (const gleis of graph.gleise) {
    const m = mitteVon(graph, gleis);
    if (m) mitten.set(gleis, mitteMitKennung(m));
  }
  for (const steig of ubahnSteigeDesBahnhofs(graph, bahnhofsname)) {
    const m = graph.knoten.get(`ubahn${steig.id}:mitte`);
    if (m) mitten.set(ubahnSchluessel(steig.id), mitteMitKennung(m));
  }
  return mitten;
}

/** Gleiche Bahnsteigmitte = derselbe Bahnsteig, auch unter zwei Bahnhoefen. */
const GLEICHE_MITTE_M = 10;

/**
 * Derselbe physische Bahnsteig unter zwei Bahnhoefen - am Namen nicht zu
 * erkennen: Seit die DB-Namen gelten (Spec 6.3), heisst München Hbf (tief)
 * r5370442 unter Hbf „1“, unter Karlsplatz aber „81“/„82“ (Karlsplatz' eigener
 * Bahnsteig wurde per IFOPT „1“/„2“). Beide Graphen stammen aus OSM; tragen
 * beide eine Kennung, entscheidet sie. Sonst die Mitte.
 */
function derselbeBahnsteig(a: Bahnsteigmitte, b: Bahnsteigmitte): boolean {
  if (a.bahnsteigId && b.bahnsteigId) return a.bahnsteigId === b.bahnsteigId;
  return haversineM(a.lat, a.lon, b.lat, b.lon) < GLEICHE_MITTE_M;
}

/** Wie viele Gleise ein Bahnhof hat - U-Bahn-Steige zaehlen dafuer nicht. */
const anzahlGleise = (gleise: Map<string, Bahnsteigmitte>): number =>
  [...gleise.keys()].filter((k) => !k.startsWith(ubahnSchluessel(''))).length;

/**
 * Gleise, die ein Bahnhof einem anderen ueberlassen muss.
 *
 * OSM fuehrt im Startbestand (Stand 13.10.2026) die Gleise 5-34 von München
 * Hbf auch unter München Hackerbrücke und 51-56 unter Karlsplatz - die
 * Overpass-Abfrage holt alles im Umkreis. In der App faellt das nicht auf:
 * Dort waehlt man Gleise aus dem Fahrplan. Auf einer Seite „Umsteigen in
 * München Hackerbrücke" stuende Gleis 34. Deshalb: Liegt derselbe
 * Bahnsteig (`derselbeBahnsteig`, gleich unter welchem Namen) unter zwei
 * Bahnhoefen, gehoert er dem mit mehr Gleisen - U-Bahn-Steige zaehlen dabei
 * nicht mit; bei Gleichstand beiden (Frankfurt Flughafen Fern- und Regionalbahnhof sind
 * ein Gebaeude).
 */
export function fremdeGleise(
  bahnhoefe: { schluessel: string; gleise: Map<string, Bahnsteigmitte> }[],
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
      const [nA, nB] = [anzahlGleise(a.gleise), anzahlGleise(b.gleise)];
      if (nA === nB) continue;
      const kleiner = nA < nB ? a : b;
      const groesser = kleiner === a ? b : a;
      const dort = [...groesser.gleise.values()];
      for (const [gleis, m] of kleiner.gleise) {
        if (dort.some((d) => derselbeBahnsteig(m, d))) merke(kleiner.schluessel, gleis);
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

/** Schnellste und stufenfreie Route von einem Startknoten zu einem Gleis. */
function paarVon(graph: StationGraph, startId: string, von: string, nach: string, gleicherBahnsteig: boolean): Gleispaar {
  const ziel = findeStartknoten(graph, nach);
  const schnell = berechneRoute(graph, startId, ziel.knoten.id, 'schnellste', 'normal');
  const stufenfrei = berechneRoute(graph, startId, ziel.knoten.id, 'barrierefrei', 'normal');
  return {
    von,
    nach,
    gleicherBahnsteig,
    sek: schnell ? gehzeitSekunden(schnell, 'normal') : null,
    ...(schnell ? wegMerkmale(schnell) : { wechsel: 0, anlagen: [], lage: 'ebenerdig' as const }),
    stufenfreiSek: stufenfrei ? gehzeitSekunden(stufenfrei, 'normal') : null,
  };
}

/**
 * Alle Gleispaare eines Bahnhofs, dazu je U-Bahn-Steig die Wege zu den
 * Gleisen. `null` fuer Stufe 3 (Standardmodell):
 * Dort waeren die Werte nur geschaetzt - dafuer gibt es keine Seite
 * (Konzept 5a.2, Vorgabe aus Abschnitt 7).
 *
 * Die DB-Gleisliste steckt im Graphen (`graphAus(eintrag, db)`). `ohne`
 * nennt Gleise und U-Bahn-Steige (`ubahnSchluessel`), die ein groesserer
 * Bahnhof behaelt.
 */
export function berechneBahnhof(
  eintrag: BestandsEintrag,
  graph: StationGraph,
  ohne: ReadonlySet<string> = new Set(),
): Bahnhofsdaten | null {
  if (graph.stufe === 3) return null;
  const gleise = graph.gleise.filter((g) => !ohne.has(g));
  // Unter zwei Gleisen gibt es keinen Umstieg - die Seite waere leer
  // (Saarlouis Hbf: OSM kennt nur Gleis 1).
  if (gleise.length < 2) return null;
  const paare: Gleispaar[] = [];
  for (const von of gleise) {
    const start = findeStartknoten(graph, von, 'mitte');
    for (const nach of gleise) {
      if (von === nach) continue;
      paare.push(paarVon(graph, start.knoten.id, von, nach, istGleicherBahnsteig(graph, von, nach)));
    }
  }
  // Route vom Knoten `ubahn<id>:mitte`, `von` = Beschriftung des Steigs.
  const ubahn: UbahnDaten[] = ubahnSteigeDesBahnhofs(graph, eintrag.name)
    .filter((steig) => !ohne.has(ubahnSchluessel(steig.id)))
    .map((steig) => ({
      id: steig.id,
      label: steig.label,
      paare: gleise.map((nach) => paarVon(graph, `ubahn${steig.id}:mitte`, steig.label, nach, false)),
    }));
  const gleisArt: Record<string, 'zug' | 'sbahn'> = {};
  for (const g of gleise) gleisArt[g] = graph.gleisArt?.get(g) ?? 'zug';
  return {
    name: eintrag.name,
    eva: eintrag.schluessel,
    slug: slugVon(eintrag.name),
    lat: eintrag.lat,
    lon: eintrag.lon,
    stufe: graph.stufe,
    geholtAm: eintrag.geholtAm,
    gleise,
    gleisArt,
    ubahn,
    paare,
  };
}

/** Kopfdaten lesbar, je Gleispaar eine Zeile - knapp und im Diff nachvollziehbar. */
export function alsJson(d: Bahnhofsdaten): string {
  const { paare, ubahn, gleisArt, ...kopf } = d;
  const kopfText = JSON.stringify(kopf, null, 2).replace(/\n}$/, '');
  const zeilen = (liste: Gleispaar[], einzug: string) =>
    liste.map((p) => `${einzug}${JSON.stringify(p)}`).join(',\n');
  const ubahnText = ubahn
    .map(
      (u) =>
        `    {\n      "id": ${JSON.stringify(u.id)},\n      "label": ${JSON.stringify(u.label)},\n` +
        `      "paare": [\n${zeilen(u.paare, '        ')}\n      ]\n    }`,
    )
    .join(',\n');
  return (
    `${kopfText},\n  "gleisArt": ${JSON.stringify(gleisArt)},\n` +
    `  "ubahn": [${ubahn.length > 0 ? `\n${ubahnText}\n  ` : ''}],\n` +
    `  "paare": [\n${zeilen(paare, '    ')}\n  ]\n}\n`
  );
}

async function main(): Promise<void> {
  const beginn = Date.now();
  const dateien = readdirSync(BESTAND).filter((n) => n.endsWith('.json.gz')).sort();
  const geladen: { eintrag: BestandsEintrag; graph: StationGraph }[] = [];
  const stufe3: string[] = [];
  const ohneAblage: string[] = [];
  for (const datei of dateien) {
    const eintrag = await entpackeEintrag(readFileSync(join(BESTAND, datei)));
    const db = ladeAblage(eintrag.schluessel);
    if (!db) ohneAblage.push(`${eintrag.name} (${eintrag.schluessel})`);
    const graph = graphAus(eintrag, db);
    if (graph.stufe === 3) stufe3.push(`${eintrag.name} (${eintrag.schluessel})`);
    else geladen.push({ eintrag, graph });
  }

  const fremd = fremdeGleise(
    geladen.map(({ eintrag, graph }) => ({ schluessel: eintrag.schluessel, gleise: gleisMitten(graph, eintrag.name) })),
  );

  const alle: Bahnhofsdaten[] = [];
  const zuWenigGleise: string[] = [];
  for (const { eintrag, graph } of geladen) {
    const daten = berechneBahnhof(eintrag, graph, fremd.get(eintrag.schluessel));
    if (daten) alle.push(daten);
    else zuWenigGleise.push(`${eintrag.name} (${eintrag.schluessel})`);
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
  console.log(
    `  unter zwei Gleisen (keine Seite): ${zuWenigGleise.length}${zuWenigGleise.length ? ` - ${zuWenigGleise.join(', ')}` : ''}`,
  );
  for (const [schluessel, gleise] of fremd) {
    const name = geladen.find((g) => g.eintrag.schluessel === schluessel)?.eintrag.name ?? schluessel;
    console.log(`  Gleise einem groesseren Bahnhof ueberlassen: ${name} - ${[...gleise].join(' ')}`);
  }
  console.log(`Groesste Gleisanzahl: ${groesster.gleise.length} (${groesster.name})`);
  if (ohneAblage.length > 0) {
    console.log(
      `WARNUNG: ${ohneAblage.length} Bahnhoefe ohne DB-Gleisliste (scripts/db-gleise-fuellen.ts), gerechnet wie zuvor: ` +
        `${ohneAblage.slice(0, 5).join(', ')}${ohneAblage.length > 5 ? ' …' : ''}`,
    );
  }
  console.log(`Bahnhoefe mit U-Bahn-Steigen: ${alle.filter((d) => d.ubahn.length > 0).length}`);
  console.log(`Bahnhoefe mit S-Bahn-Gleisen: ${alle.filter((d) => Object.values(d.gleisArt).includes('sbahn')).length}`);
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
