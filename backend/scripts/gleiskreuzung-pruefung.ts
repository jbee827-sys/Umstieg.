// GLEISPRUEFUNG (02.11.2026): Fuehrt eine berechnete Route ueber ein Gleis?
//
// Der Graph kennt keine Gleise - genau deshalb kann er eine Kante ziehen, die
// quer darueber fuehrt, und keine Simulation bemerkt es: Das Schema zeichnet
// treu, was der Graph anbietet. So zeigte Koeln Hbf 8 -> 10 am 02.11.2026 44 s.
// Diese Pruefung legt jede Route auf die echten Gleise.
//
// Die Gleise kommen aus den OpenFreeMap-Kacheln, die die App ohnehin zeigt (Zoom
// 14), gecacht unter `osm-ablage/gleise/`. Sie bleiben Pruefwerkzeug: Das Produkt
// braucht sie nicht, Overpass-Abfrage und Bestand bleiben unveraendert.
//
// Eine Kreuzung zaehlt, wenn
//   1. die Kante eben ist und ihr OSM-Weg weder Tunnel noch Bruecke noch Innengang
//   2. sie den Bahnsteig verlaesst: Beide Enden am selben Bahnsteig sind eine
//      Sehne im Bogen, kein Gang ueber das Gleis
//   3. sie auf der Hoehe des Gleises liegt, gemessen am naechsten Bahnsteig. Ein
//      Tunnelgleis zaehlt nur an einem tiefen, ein Brueckengleis nur an einem
//      hohen Bahnsteig - sonst liefe der Querbahnsteig in Stuttgart ueber die
//      S-Bahn-Roehre, die 20 m unter ihm liegt
//   4. kein Bahnuebergang innerhalb 4 m liegt
//
// Gegenprobe: Der alte Stuttgarter Weg 1 -> 3 (86 s) kreuzt zwei Gleise. Bleibt
// eine Schaetzung: „kreuzt kein Gleis“ heisst nicht, dass der Weg offen ist.
//
// Aufruf (aus backend/):
//   npx tsx scripts/gleiskreuzung-pruefung.ts laden               Gleise holen
//   npx tsx scripts/gleiskreuzung-pruefung.ts <ausgabe.json> [basis.json]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { baueGraph, haversineM } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { erreichbareGleisPaare } from '../src/core/klassifikation.js';
import { berechneRoute, istGleicherBahnsteig } from '../src/core/routing.js';
import type { GraphKnoten, OsmElement } from '../src/core/typen.js';
import type { BestandsEintrag } from '../src/osm/bestand.js';

const BESTAND = 'osm-bestand';
const GLEISE = 'osm-ablage/gleise';
const FAHRWEGE = ['rail', 'light_rail', 'subway', 'narrow_gauge'];

interface Punkt {
  lat: number;
  lon: number;
}
interface Gleis {
  geometry: Punkt[];
  tags: Record<string, string>;
}
interface Bahnsteig {
  ringe: Punkt[][];
  ebene: number;
}
interface Ergebnis {
  bahnhof: string;
  sek: number | null;
  klasse?: string;
  beleg?: string;
}

function ladeBestand(): { eva: string; eintrag: BestandsEintrag }[] {
  return readdirSync(BESTAND)
    .filter((f) => f.endsWith('.json.gz'))
    .map((f) => ({
      eva: f.replace('.json.gz', ''),
      eintrag: JSON.parse(gunzipSync(readFileSync(`${BESTAND}/${f}`)).toString()) as BestandsEintrag,
    }))
    .filter((b) => b.eintrag.osm?.elements !== undefined);
}

// --- Gleise aus den Kacheln ---

async function ladeGleise(): Promise<void> {
  mkdirSync(GLEISE, { recursive: true });
  // Nur hier gebraucht und nur im Frontend installiert (MapLibre bringt sie mit).
  const pfad = (p: string): string => new URL(`../../frontend/node_modules/${p}`, import.meta.url).href;
  const { PbfReader } = (await import(pfad('pbf/index.js'))) as { PbfReader: new (b: Uint8Array) => unknown };
  const { VectorTile } = (await import(pfad('@mapbox/vector-tile/index.js'))) as {
    VectorTile: new (p: unknown) => {
      layers: Record<string, { length: number; feature(i: number): {
        properties: Record<string, string | number>;
        toGeoJSON(x: number, y: number, z: number): { geometry: { type: string; coordinates: unknown } };
      } }>;
    };
  };
  const kopf = { headers: { 'User-Agent': 'umstiegs-navigator/0.1 (dev)' } };
  const tilejson = (await (await fetch('https://tiles.openfreemap.org/planet', kopf)).json()) as { tiles: string[] };
  const Z = 14;
  const kachel = (lat: number, lon: number): [number, number] => {
    const n = 2 ** Z;
    const r = (lat * Math.PI) / 180;
    return [
      Math.floor(((lon + 180) / 360) * n),
      Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
    ];
  };
  const speicher = new Map<string, Gleis[]>();
  const hole = async (x: number, y: number): Promise<Gleis[]> => {
    const schluessel = `${x}/${y}`;
    const da = speicher.get(schluessel);
    if (da) return da;
    const url = tilejson.tiles[0].replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y));
    const antwort = await fetch(url, { ...kopf, signal: AbortSignal.timeout(30_000) });
    if (!antwort.ok) throw new Error(`${url}: HTTP ${antwort.status}`);
    const lage = new VectorTile(new PbfReader(new Uint8Array(await antwort.arrayBuffer()))).layers.transportation;
    const gleise: Gleis[] = [];
    for (let i = 0; i < (lage?.length ?? 0); i++) {
      const f = lage.feature(i);
      const p = f.properties;
      if (p.class !== 'rail' && p.class !== 'transit') continue;
      const art = String(p.subclass ?? 'rail');
      if (!FAHRWEGE.includes(art)) continue;
      const g = f.toGeoJSON(x, y, Z).geometry;
      const linien = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []) as number[][][];
      for (const l of linien) {
        gleise.push({
          geometry: l.map(([lon, lat]) => ({ lat, lon })),
          tags: {
            railway: art,
            ...(p.brunnel === 'tunnel' ? { tunnel: 'yes' } : {}),
            ...(p.brunnel === 'bridge' ? { bridge: 'yes' } : {}),
          },
        });
      }
    }
    speicher.set(schluessel, gleise);
    await new Promise((r) => setTimeout(r, 150));
    return gleise;
  };
  let neu = 0;
  for (const { eva, eintrag } of ladeBestand()) {
    const ziel = `${GLEISE}/${eva}.json`;
    if (existsSync(ziel)) continue;
    const [m, mLon] = [0.006, 0.009];
    const [a, b] = [kachel(eintrag.lat - m, eintrag.lon - mLon), kachel(eintrag.lat + m, eintrag.lon + mLon)];
    const gleise: Gleis[] = [];
    for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) {
      for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) gleise.push(...(await hole(x, y)));
    }
    writeFileSync(ziel, JSON.stringify(gleise));
    neu++;
  }
  console.log(`${neu} Bahnhoefe geladen, ${speicher.size} Kacheln.`);
}

// --- Geometrie ---

function schnittpunkt(a: Punkt, b: Punkt, c: Punkt, d: Punkt): Punkt | null {
  const m = Math.cos((a.lat * Math.PI) / 180);
  const [ax, ay, bx, by] = [a.lon * m, a.lat, b.lon * m, b.lat];
  const [cx, cy, dx, dy] = [c.lon * m, c.lat, d.lon * m, d.lat];
  const n = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (n === 0) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / n;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / n;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { lat: ay + t * (by - ay), lon: (ax + t * (bx - ax)) / m };
}

function abstandZumSegment(p: Punkt, a: Punkt, b: Punkt): number {
  const mLat = 111_320;
  const mLon = mLat * Math.cos((p.lat * Math.PI) / 180);
  const [ax, ay] = [(a.lon - p.lon) * mLon, (a.lat - p.lat) * mLat];
  const [bx, by] = [(b.lon - p.lon) * mLon, (b.lat - p.lat) * mLat];
  const [dx, dy] = [bx - ax, by - ay];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function abstandZumBahnsteig(p: Punkt, b: Bahnsteig): number {
  let min = Number.POSITIVE_INFINITY;
  for (const r of b.ringe) {
    for (let i = 0; i < r.length - 1; i++) min = Math.min(min, abstandZumSegment(p, r[i], r[i + 1]));
  }
  return min;
}

/** Die Bahnsteige eines Bahnhofs, getrennt vom Graphen - der Pruefer soll dessen Regeln nicht teilen. */
function bahnsteigeVon(el: OsmElement[]): Map<string, Bahnsteig> {
  const punkte = new Map(el.filter((e) => e.type === 'node' && e.lat !== undefined).map((e) => [e.id, e as OsmElement & Punkt]));
  const relationVon = new Map<number, OsmElement>();
  for (const e of el) {
    if (e.type !== 'relation' || e.tags?.railway !== 'platform') continue;
    for (const m of e.members ?? []) if (m.type === 'way') relationVon.set(m.ref, e);
  }
  const ebene = (t?: Record<string, string>): number => {
    const n = Number.parseFloat((t?.level ?? '').split(';')[0]);
    if (Number.isFinite(n)) return n;
    return t?.tunnel === 'yes' ? -1 : t?.bridge === 'yes' ? 1 : 0;
  };
  const bahnsteige = new Map<string, Bahnsteig>();
  for (const e of el) {
    if (e.type !== 'way') continue;
    const r = relationVon.get(e.id);
    if (!r && e.tags?.railway !== 'platform' && e.tags?.railway !== 'platform_edge') continue;
    const id = r ? `r${r.id}` : `w${e.id}`;
    if (!bahnsteige.has(id)) bahnsteige.set(id, { ringe: [], ebene: ebene(r?.tags ?? e.tags) });
    bahnsteige.get(id)!.ringe.push((e.nodes ?? []).map((n) => punkte.get(n)).filter((p): p is OsmElement & Punkt => p !== undefined));
  }
  return bahnsteige;
}

// --- Pruefung ---

function pruefeBahnhof(eva: string, eintrag: BestandsEintrag, ergebnis: Map<string, Ergebnis>): void {
  const el = eintrag.osm.elements;
  const gleise = (JSON.parse(readFileSync(`${GLEISE}/${eva}.json`, 'utf8')) as Gleis[]).filter((g) => FAHRWEGE.includes(g.tags.railway));
  const uebergaenge = el.filter((e) => e.type === 'node' && e.lat !== undefined && (e.tags?.railway === 'crossing' || e.tags?.railway === 'level_crossing')) as (OsmElement & Punkt)[];
  const bahnsteige = bahnsteigeVon(el);
  const wegeVon = new Map<number, OsmElement[]>();
  for (const e of el) {
    if (e.type !== 'way') continue;
    for (const n of e.nodes ?? []) {
      if (!wegeVon.has(n)) wegeVon.set(n, []);
      wegeVon.get(n)!.push(e);
    }
  }
  const osmId = (id: string): number | null => {
    const m = id.match(/^n(\d+)@/);
    return m ? Number(m[1]) : null;
  };
  const seitenVon = (k: GraphKnoten): Set<string> => {
    const s = new Set<string>();
    if (k.bahnsteigId) s.add(k.bahnsteigId);
    for (const [id, b] of bahnsteige) if (abstandZumBahnsteig(k, b) <= 3) s.add(id);
    return s;
  };
  const befunde = new Map<string, { klasse: string; beleg: string } | null>();
  const befund = (u: GraphKnoten, w: GraphKnoten): { klasse: string; beleg: string } | null => {
    const schluessel = u.id < w.id ? `${u.id}|${w.id}` : `${w.id}|${u.id}`;
    const da = befunde.get(schluessel);
    if (da !== undefined) return da;
    let treffer: { klasse: string; beleg: string } | null = null;
    const [a, b] = [osmId(u.id), osmId(w.id)];
    const weg = a !== null && b !== null ? (wegeVon.get(a) ?? []).find((x) => x.nodes!.includes(b) && !x.tags?.railway) : undefined;
    const t = weg?.tags ?? {};
    const daneben = t.indoor === 'yes' || (t.layer !== undefined && Number.parseFloat(t.layer) < 0) || (t.tunnel && t.tunnel !== 'no') || (t.bridge && t.bridge !== 'no');
    const [su, sw] = [seitenVon(u), seitenVon(w)];
    if (!daneben && ![...su].some((x) => sw.has(x))) {
      suche: for (const g of gleise) {
        for (let i = 0; i < g.geometry.length - 1; i++) {
          const x = schnittpunkt(u, w, g.geometry[i], g.geometry[i + 1]);
          if (!x) continue;
          let ebene: number | null = null;
          let naehe = 30;
          for (const bs of bahnsteige.values()) {
            const d = abstandZumBahnsteig(x, bs);
            if (d < naehe) {
              naehe = d;
              ebene = bs.ebene;
            }
          }
          if (g.tags.tunnel === 'yes' && (ebene === null || ebene >= 0 || naehe > 12)) continue;
          if (g.tags.bridge && (ebene === null || ebene <= 0 || naehe > 12)) continue;
          if ((ebene ?? 0) !== u.level) continue;
          if (uebergaenge.some((q) => haversineM(q.lat, q.lon, x.lat, x.lon) <= 4)) continue;
          const synth = [u.id, w.id].some((id) => id.startsWith('gleis') || id.startsWith('ubahn'));
          treffer = { klasse: weg ? 'WEG' : synth ? 'ANKER' : 'KETTE', beleg: `${u.id} > ${w.id}${weg ? ` w${weg.id}` : ''}` };
          break suche;
        }
      }
    }
    befunde.set(schluessel, treffer);
    return treffer;
  };

  const graph = baueGraph(eintrag.osm);
  const mitten = graph.gleise.filter((g) => graph.knoten.has(`gleis${g}:mitte`));
  for (let i = 0; i < mitten.length; i++) {
    for (let j = i + 1; j < mitten.length; j++) {
      if (istGleicherBahnsteig(graph, mitten[i], mitten[j])) continue;
      for (const variante of ['schnellste', 'barrierefrei'] as const) {
        const pfad = berechneRoute(graph, `gleis${mitten[i]}:mitte`, `gleis${mitten[j]}:mitte`, variante);
        const zeile: Ergebnis = { bahnhof: eintrag.name, sek: pfad ? gehzeitSekunden(pfad, 'normal') : null };
        for (const [z, k] of (pfad?.kanten ?? []).entries()) {
          if ((k.typ !== 'eben' && k.typ !== 'rampe') || k.laengeM < 1) continue;
          const b = befund(pfad!.knoten[z], pfad!.knoten[z + 1]);
          if (b) {
            Object.assign(zeile, b);
            break;
          }
        }
        ergebnis.set(`${eva}|${mitten[i]}|${mitten[j]}|${variante}`, zeile);
      }
    }
  }
}

function zaehle<T>(liste: T[], f: (x: T) => string, anzahl = 12): string {
  const z = new Map<string, number>();
  for (const x of liste) z.set(f(x), (z.get(f(x)) ?? 0) + 1);
  return [...z].sort((a, b) => b[1] - a[1]).slice(0, anzahl).map(([k, v]) => `${k}: ${v}`).join(', ');
}

function main(): void {
  const ausgabe = process.argv[2];
  if (!ausgabe) {
    console.error('Aufruf: gleiskreuzung-pruefung.ts laden | <ausgabe.json> [basis.json]');
    process.exit(2);
  }
  const ergebnis = new Map<string, Ergebnis>();
  let erreichbar = 0;
  let voll = 0;
  let n = 0;
  const beginn = Date.now();
  for (const { eva, eintrag } of ladeBestand()) {
    if (!existsSync(`${GLEISE}/${eva}.json`)) continue;
    pruefeBahnhof(eva, eintrag, ergebnis);
    const e = erreichbareGleisPaare(baueGraph(eintrag.osm));
    erreichbar += e;
    if (e === 1) voll++;
    n++;
  }
  writeFileSync(ausgabe, JSON.stringify(Object.fromEntries(ergebnis)));

  const alle = [...ergebnis.entries()].map(([schluessel, z]) => ({ schluessel, ...z }));
  const routen = alle.filter((z) => z.sek !== null);
  const kreuzen = routen.filter((z) => z.klasse);
  const schnell = alle.filter((z) => z.schluessel.endsWith('|schnellste'));
  const frei = alle.filter((z) => z.schluessel.endsWith('|barrierefrei'));
  console.log(`Bahnhoefe ${n}, Routen ${routen.length}, kreuzen ein Gleis ${kreuzen.length} (${((100 * kreuzen.length) / routen.length).toFixed(1)} %) an ${new Set(kreuzen.map((z) => z.bahnhof)).size} Bahnhoefen, ${Math.round((Date.now() - beginn) / 1000)} s`);
  console.log(`Klassen: ${zaehle(kreuzen, (z) => z.klasse!)}`);
  console.log(`Meiste: ${zaehle(kreuzen, (z) => z.bahnhof)}`);
  console.log(`Haeufigste Kanten: ${zaehle(kreuzen, (z) => `${z.bahnhof} ${z.beleg}`, 8)}`);
  console.log(`Ohne Weg: schnell ${schnell.filter((z) => z.sek === null).length}, stufenfrei ${frei.filter((z) => z.sek === null).length}`);
  console.log(`Unter 60 s: ${schnell.filter((z) => z.sek !== null && z.sek < 60).length}`);
  console.log(`Erreichbare Gleispaare im Mittel ${(erreichbar / n).toFixed(4)}, voll verbunden ${voll}/${n}`);
  const stuttgart = kreuzen.filter((z) => z.schluessel.startsWith('8000096|'));
  console.log(`Stuttgart Hbf kreuzt: ${stuttgart.length}`);

  const basisPfad = process.argv[3];
  if (!basisPfad) return;
  const basis = JSON.parse(readFileSync(basisPfad, 'utf8')) as Record<string, Ergebnis>;
  const verloren: typeof alle = [];
  const neu: typeof alle = [];
  const kuerzer: { d: number; z: string }[] = [];
  const laenger: { d: number; z: string }[] = [];
  for (const z of alle) {
    const b = basis[z.schluessel];
    if (!b) continue;
    const [, von, nach, variante] = z.schluessel.split('|');
    if (b.sek !== null && z.sek === null) verloren.push(z);
    else if (b.sek === null && z.sek !== null) neu.push(z);
    else if (b.sek !== null && z.sek !== null && variante === 'schnellste') {
      const d = z.sek - b.sek;
      const text = `${z.bahnhof} ${von}-${nach} ${b.sek}>${z.sek}`;
      if (d < -15) kuerzer.push({ d: -d, z: text });
      if (d > 15) laenger.push({ d, z: text });
    }
  }
  const ist = (x: { schluessel: string }, v: string): boolean => x.schluessel.endsWith(`|${v}`);
  console.log(`--- gegen die Basis`);
  console.log(`Verloren: schnell ${verloren.filter((x) => ist(x, 'schnellste')).length}, stufenfrei ${verloren.filter((x) => ist(x, 'barrierefrei')).length}`);
  console.log(`  schnell: ${zaehle(verloren.filter((x) => ist(x, 'schnellste')), (z) => z.bahnhof, 20)}`);
  console.log(`Neu: schnell ${neu.filter((x) => ist(x, 'schnellste')).length}, stufenfrei ${neu.filter((x) => ist(x, 'barrierefrei')).length}`);
  console.log(`Kuerzer ${kuerzer.length}: ${kuerzer.sort((a, b) => b.d - a.d).slice(0, 10).map((x) => x.z).join('; ')}`);
  console.log(`Laenger ${laenger.length}: ${laenger.sort((a, b) => b.d - a.d).slice(0, 10).map((x) => x.z).join('; ')}`);
}

if (process.argv[2] === 'laden') await ladeGleise();
else main();
