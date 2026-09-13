// SONDIERUNG (wegwerfbar): Welche Geometrie traegt ein schematisches
// Bahnhofsbild nach Screen 3 des Entwurfs (design/Umstieg.dc.html)?
//
// Screen 3 zeichnet: drei Ebenenbaender mit Beschriftung, Gleislinien mit
// Nummern, Bahnsteigbalken dazwischen, Orientierungspunkte (Anzeige, Kiosk,
// Aufzuege), eine Routenlinie ueber alle Ebenen, einen Abschnittsmarker (A-G)
// und einen Positionspunkt. Die Frage ist, welches dieser Elemente aus den
// vorhandenen Quellen ableitbar ist - und welches erfunden waere.
//
// Aufruf: npx tsx scripts/spike-schema-geometrie.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { holeAnlagen } from '../src/clients/fasta.js';
import { holeStationsInfo } from '../src/clients/stations.js';
import { holeTafel } from '../src/clients/timetables.js';
import { baueGraph, haversineM } from '../src/core/graph.js';
import type { OsmElement, OverpassAntwort, StationGraph } from '../src/core/typen.js';

// Zugangsdaten aus dem Tresor. CRLF-Strip noetig, sonst landet ein
// Wagenruecklauf im Secret und der Auth-Header ist still falsch.
function ladeSecrets(): void {
  const pfad = join(homedir(), '.secrets', 'umstieg.env');
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    const sauber = zeile.replace(/\r$/, '').trim();
    if (!sauber || sauber.startsWith('#')) continue;
    const trenner = sauber.indexOf('=');
    if (trenner < 0) continue;
    process.env[sauber.slice(0, trenner).trim()] = sauber.slice(trenner + 1).trim();
  }
}

const HIER = dirname(fileURLToPath(import.meta.url));
const AUSGABE = join(
  homedir(),
  'AppData',
  'Local',
  'Temp',
  'claude',
  'D--Claude-code',
  '6db04a47-3c2c-491e-84a8-985fc6d8dc06',
  'scratchpad',
  'schema-geometrie',
);

const BERLIN_EVA = '8011160';
const GLEIS_AN = '14';
const GLEIS_AB = '6';

function schreibe(name: string, daten: unknown): void {
  mkdirSync(AUSGABE, { recursive: true });
  writeFileSync(join(AUSGABE, name), JSON.stringify(daten, null, 2), 'utf8');
}

function ueberschrift(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

// ---------------------------------------------------------------------------
// A) Was liegt in den OSM-Rohdaten?
// ---------------------------------------------------------------------------

interface BahnsteigBefund {
  id: string;
  quelle: 'way' | 'relation';
  refs: string[];
  level: string | undefined;
  tunnel: string | undefined;
  bridge: string | undefined;
  knoten: number;
  laengeM: number;
  peilung: number;
  mitte: [number, number];
}

function peilungGrad(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function analysiereOsm(osm: OverpassAntwort): {
  bahnsteige: BahnsteigBefund[];
  zaehlung: Record<string, number>;
  abschnittsmarker: OsmElement[];
  aufzuege: OsmElement[];
  rolltreppen: OsmElement[];
  treppen: OsmElement[];
  pois: { art: string; lat: number; lon: number; level?: string; name?: string }[];
  levelHistogramm: Record<string, number>;
} {
  const nodes = new Map<number, OsmElement>();
  const ways = new Map<number, OsmElement>();
  const relationen: OsmElement[] = [];
  for (const el of osm.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else relationen.push(el);
  }

  const koord = (id: number): [number, number] | null => {
    const n = nodes.get(id);
    return n?.lat !== undefined && n.lon !== undefined ? [n.lat, n.lon] : null;
  };

  function achse(nodeIds: number[]): { laengeM: number; peilung: number; mitte: [number, number] } {
    const punkte = nodeIds.map(koord).filter((p): p is [number, number] => p !== null);
    if (punkte.length < 2) return { laengeM: 0, peilung: 0, mitte: punkte[0] ?? [0, 0] };
    let a = punkte[0];
    let b = punkte[1];
    let max = -1;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        const d = haversineM(punkte[i][0], punkte[i][1], punkte[j][0], punkte[j][1]);
        if (d > max) {
          max = d;
          a = punkte[i];
          b = punkte[j];
        }
      }
    }
    return {
      laengeM: Math.round(max),
      peilung: Math.round(peilungGrad(a[0], a[1], b[0], b[1])),
      mitte: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
  }

  const bahnsteige: BahnsteigBefund[] = [];
  const relMitglieder = new Set<number>();

  for (const rel of relationen) {
    if (rel.tags?.railway !== 'platform') continue;
    const nodeIds: number[] = [];
    for (const m of rel.members ?? []) {
      if (m.type !== 'way' || m.role === 'inner') continue;
      const w = ways.get(m.ref);
      if (w?.nodes) {
        nodeIds.push(...w.nodes);
        relMitglieder.add(m.ref);
      }
    }
    if (nodeIds.length === 0) continue;
    bahnsteige.push({
      id: `r${rel.id}`,
      quelle: 'relation',
      refs: (rel.tags?.ref ?? '')
        .split(/[;/]/)
        .map((r) => r.trim())
        .filter(Boolean),
      level: rel.tags?.level,
      tunnel: rel.tags?.tunnel,
      bridge: rel.tags?.bridge,
      knoten: nodeIds.length,
      ...achse(nodeIds),
    });
  }

  for (const [id, way] of ways) {
    if (way.tags?.railway !== 'platform' || relMitglieder.has(id)) continue;
    bahnsteige.push({
      id: `w${id}`,
      quelle: 'way',
      refs: (way.tags?.ref ?? '')
        .split(/[;/]/)
        .map((r) => r.trim())
        .filter(Boolean),
      level: way.tags?.level,
      tunnel: way.tags?.tunnel,
      bridge: way.tags?.bridge,
      knoten: way.nodes?.length ?? 0,
      ...achse(way.nodes ?? []),
    });
  }

  // Abschnittsmarker A-G: der USP haengt daran. In OSM als
  // railway=platform_section oder als Node mit ref an einem Bahnsteig.
  const abschnittsmarker = [...nodes.values()].filter(
    (n) =>
      n.tags?.railway === 'platform_section' ||
      n.tags?.['railway:platform_section'] !== undefined ||
      (n.tags?.ref !== undefined && /^[A-G]$/.test(n.tags.ref)),
  );

  const aufzuege = [
    ...[...nodes.values()].filter((n) => n.tags?.highway === 'elevator'),
    ...[...ways.values()].filter((w) => w.tags?.highway === 'elevator'),
  ];
  const rolltreppen = [...ways.values()].filter((w) => w.tags?.conveying !== undefined);
  const treppen = [...ways.values()].filter(
    (w) => w.tags?.highway === 'steps' && w.tags?.conveying === undefined,
  );

  const pois: { art: string; lat: number; lon: number; level?: string; name?: string }[] = [];
  for (const el of [...nodes.values(), ...ways.values()]) {
    const t = el.tags ?? {};
    let art: string | null = null;
    if (t.amenity === 'toilets') art = 'wc';
    else if (t.shop === 'kiosk') art = 'kiosk';
    if (!art) continue;
    let lat = el.lat;
    let lon = el.lon;
    if (lat === undefined && el.nodes) {
      const p = el.nodes.map(koord).filter((q): q is [number, number] => q !== null);
      if (p.length > 0) {
        lat = p.reduce((s, q) => s + q[0], 0) / p.length;
        lon = p.reduce((s, q) => s + q[1], 0) / p.length;
      }
    }
    if (lat === undefined || lon === undefined) continue;
    pois.push({ art, lat, lon, level: t.level, name: t.name });
  }

  const levelHistogramm: Record<string, number> = {};
  for (const el of [...ways.values(), ...relationen]) {
    const lvl = el.tags?.level ?? '(ohne)';
    levelHistogramm[lvl] = (levelHistogramm[lvl] ?? 0) + 1;
  }

  return {
    bahnsteige,
    zaehlung: {
      elemente: osm.elements.length,
      nodes: nodes.size,
      ways: ways.size,
      relationen: relationen.length,
      bahnsteige: bahnsteige.length,
    },
    abschnittsmarker,
    aufzuege,
    rolltreppen,
    treppen,
    pois,
    levelHistogramm,
  };
}

// ---------------------------------------------------------------------------
// B) Was steht im gebauten Graphen?
// ---------------------------------------------------------------------------

function analysiereGraph(graph: StationGraph): Record<string, unknown> {
  const proLevel = new Map<number, { knoten: number; gleise: Set<string>; bahnsteige: Set<string> }>();
  for (const k of graph.knoten.values()) {
    if (!proLevel.has(k.level)) {
      proLevel.set(k.level, { knoten: 0, gleise: new Set(), bahnsteige: new Set() });
    }
    const e = proLevel.get(k.level)!;
    e.knoten++;
    if (k.gleis) e.gleise.add(k.gleis);
    if (k.bahnsteigId) e.bahnsteige.add(k.bahnsteigId);
  }

  const kantenTypen: Record<string, number> = {};
  const gesehen = new Set<string>();
  const wechselKanten: { typ: string; von: number; nach: number; laengeM: number }[] = [];
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) {
      const schluessel = `${kante.von}|${kante.nach}|${kante.typ}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      kantenTypen[kante.typ] = (kantenTypen[kante.typ] ?? 0) + 1;
      if (kante.deltaLevel !== 0) {
        const von = graph.knoten.get(kante.von);
        const nach = graph.knoten.get(kante.nach);
        if (von && nach) {
          wechselKanten.push({
            typ: kante.typ,
            von: von.level,
            nach: nach.level,
            laengeM: Math.round(kante.laengeM),
          });
        }
      }
    }
  }

  return {
    stufe: graph.stufe,
    knotenGesamt: graph.knoten.size,
    gleise: graph.gleise,
    kantenTypen,
    proLevel: [...proLevel.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([level, e]) => ({
        level,
        knoten: e.knoten,
        gleise: [...e.gleise].sort(),
        bahnsteige: e.bahnsteige.size,
      })),
    ebenenwechsel: wechselKanten,
  };
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  ladeSecrets();

  // --- A) OSM ---
  const osmPfad = join(HIER, '..', 'test', 'fixtures', 'overpass', 'berlin-hbf.json');
  const osm = JSON.parse(readFileSync(osmPfad, 'utf8')) as OverpassAntwort;
  const osmBefund = analysiereOsm(osm);

  ueberschrift('A) OSM-Rohdaten Berlin Hbf (Fixture, Radius 400 m)');
  console.log(osmBefund.zaehlung);
  console.log('\nEbenen-Tag der Ways/Relationen:', osmBefund.levelHistogramm);
  console.log(`\nBahnsteige mit Gleisnummer (${osmBefund.bahnsteige.filter((b) => b.refs.length).length} von ${osmBefund.bahnsteige.length}):`);
  for (const b of osmBefund.bahnsteige.filter((x) => x.refs.length).sort((x, y) => ((x.level ?? '') < (y.level ?? '') ? -1 : 1))) {
    console.log(
      `  ${b.id.padEnd(12)} Gleis ${b.refs.join('/').padEnd(8)} level=${String(b.level).padEnd(6)} tunnel=${String(b.tunnel).padEnd(6)} ${String(b.laengeM).padStart(4)} m  Peilung ${String(b.peilung).padStart(3)}°`,
    );
  }
  console.log('\nBahnsteige OHNE Gleisnummer:', osmBefund.bahnsteige.filter((b) => !b.refs.length).length);
  console.log('Abschnittsmarker A-G:', osmBefund.abschnittsmarker.length);
  console.log('Aufzuege (OSM):', osmBefund.aufzuege.length);
  console.log('Rolltreppen (conveying):', osmBefund.rolltreppen.length);
  console.log('Treppen (steps):', osmBefund.treppen.length);
  console.log('POI (wc/kiosk):', osmBefund.pois.length, osmBefund.pois.map((p) => p.art).join(', '));
  schreibe('a-osm-befund.json', osmBefund);

  // --- B) Graph ---
  const graph = baueGraph(osm);
  const graphBefund = analysiereGraph(graph);
  ueberschrift('B) Gebauter Graph');
  console.log('Stufe:', graphBefund.stufe, '· Knoten:', graphBefund.knotenGesamt);
  console.log('Kantentypen:', graphBefund.kantenTypen);
  console.log('\nJe Ebene:');
  for (const e of graphBefund.proLevel as { level: number; knoten: number; gleise: string[]; bahnsteige: number }[]) {
    console.log(
      `  Ebene ${String(e.level).padStart(3)}: ${String(e.knoten).padStart(5)} Knoten, ${String(e.bahnsteige).padStart(2)} Bahnsteige, Gleise ${e.gleise.join(',') || '-'}`,
    );
  }
  schreibe('b-graph-befund.json', graphBefund);

  // --- C) DB-Stationsdaten ---
  ueberschrift('C) DB RIS::Stations');
  let info: Awaited<ReturnType<typeof holeStationsInfo>> | null = null;
  try {
    info = await holeStationsInfo(BERLIN_EVA);
    console.log('Name:', info.name, '· EVA-Gruppe:', info.evas.join(', '), '· stationID:', info.stationID);
    console.log('Gleise:', info.gleise.length);
    const mitKoord = info.gleise.filter((g) => g.lat !== undefined);
    console.log(`Davon mit Koordinate: ${mitKoord.length}`);
    for (const g of info.gleise) {
      console.log(
        `  Gleis ${g.gleis.padEnd(5)} evas=${(g.evas ?? []).join('/')} ${g.lat !== undefined ? `${g.lat.toFixed(5)},${g.lon!.toFixed(5)}` : '(ohne Koordinate)'}`,
      );
    }
    schreibe('c-stationsinfo.json', info);
  } catch (e) {
    console.log('FEHLER:', String(e));
  }

  // --- D) FaSta ---
  ueberschrift('D) DB FaSta (Aufzuege/Rolltreppen)');
  try {
    const nummer = info?.stationID ?? BERLIN_EVA;
    const anlagen = await holeAnlagen(nummer);
    console.log(`Anlagen: ${anlagen.length} (Adressierung ueber ${nummer})`);
    const mitBeschreibung = anlagen.filter((a) => a.beschreibung);
    console.log(`Mit Beschreibung: ${mitBeschreibung.length}`);
    for (const a of anlagen) {
      console.log(
        `  ${a.typ.padEnd(10)} ${a.status.padEnd(8)} ${a.lat.toFixed(5)},${a.lon.toFixed(5)}  ${a.beschreibung ?? ''}`,
      );
    }
    schreibe('d-fasta.json', anlagen);
  } catch (e) {
    console.log('FEHLER:', String(e));
  }

  // --- E) Live-Tafel (fuer Zugbezug/Abschnitt) ---
  ueberschrift('E) Timetables – Abfahrtstafel (Stichprobe)');
  try {
    const tafel = await holeTafel(BERLIN_EVA, 'dep');
    console.log(`Eintraege unter ${BERLIN_EVA}: ${tafel.length}`);
    for (const t of tafel.slice(0, 5)) {
      console.log(`  ${t.zug.padEnd(12)} ${t.zeitSoll} Gleis ${t.gleisSoll} → ${t.ziel}`);
    }
    schreibe('e-tafel.json', tafel);
  } catch (e) {
    console.log('FEHLER:', String(e));
  }

  // --- F) Echter Routenlauf 14 → 6 ---
  ueberschrift(`F) /api/route Berlin Hbf Gleis ${GLEIS_AN} → ${GLEIS_AB}`);
  const app = buildApp({
    // OSM aus der Aufzeichnung (reproduzierbar), alles andere live.
    overpass: async () => osm,
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/route?eva=${BERLIN_EVA}&gleisAn=${GLEIS_AN}&gleisAb=${GLEIS_AB}&profil=normal&variante=schnellste`,
  });
  console.log('HTTP', res.statusCode);
  const ergebnis = res.json() as Record<string, unknown>;
  if (res.statusCode === 200) {
    console.log('Stufe:', ergebnis.stufe, '· Gehzeit:', ergebnis.gehzeitSek, 's');
    console.log('Hinweise:', ergebnis.hinweise);
    console.log('\nSchritte:');
    for (const [i, s] of (ergebnis.schritte as Record<string, unknown>[]).entries()) {
      console.log(
        `  ${String(i + 1).padStart(2)}. [${String(s.typ).padEnd(10)}] level=${String(s.level ?? '-').padStart(3)} knoten ${s.knotenVon}..${s.knotenBis}  ${s.text}`,
      );
    }
    const karte = ergebnis.karte as Record<string, { features: unknown[] }> | undefined;
    console.log('\nkarte-GeoJSON je Ebene:');
    for (const [level, fc] of Object.entries(karte ?? {})) {
      const arten = (fc.features as { properties: Record<string, unknown> }[]).map((f) =>
        f.properties.route ? 'route' : String(f.properties.rolle),
      );
      console.log(`  Ebene ${level}: ${fc.features.length} Features (${arten.join(', ')})`);
    }
  } else {
    console.log(ergebnis);
  }
  schreibe('f-route-14-6.json', ergebnis);

  await app.close();
  console.log(`\nRohdaten liegen in ${AUSGABE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
