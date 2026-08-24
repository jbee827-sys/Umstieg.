import type {
  GraphKante,
  GraphKnoten,
  KantenTyp,
  OsmElement,
  OverpassAntwort,
  StationGraph,
} from './typen.js';

const ERDRADIUS_M = 6_371_000;
// Bahnsteigpunkte werden an den nächstgelegenen Wegknoten gleicher Ebene
// angebunden – aber nur, wenn er nah genug ist (sonst Datenlücke).
const ANBINDUNG_MAX_M = 30;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_M * Math.asin(Math.sqrt(a));
}

/** "−1;0" → [-1, 0] (sortiert); ungültige Werte werden verworfen. */
function parseLevels(tag: string | undefined): number[] {
  if (!tag) return [];
  return tag
    .split(';')
    .map((s) => Number.parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/** Ebene eines "flachen" Ways: level-Tag, sonst Tunnel/Brücke-Heuristik, sonst 0. */
function wayEbene(tags: Record<string, string>): number {
  const levels = parseLevels(tags.level);
  if (levels.length === 1) return levels[0];
  if (levels.length > 1) return levels[0]; // uneindeutig – konservativ unterste
  if (tags.tunnel === 'yes') return -1;
  if (tags.bridge === 'yes') return 1;
  return 0;
}

// Bahnsteige laufen separat über Pass D (Ways UND Relationen einheitlich).
function istEbenerWeg(tags: Record<string, string>): boolean {
  const hw = tags.highway;
  return hw === 'footway' || hw === 'corridor' || hw === 'pedestrian' || hw === 'path';
}

/** Treppe/Rolltreppe/Aufzug – Ways, die Ebenen verbinden und zu 1 Kante kollabieren. */
function istEbenenwechselWeg(tags: Record<string, string>): boolean {
  return tags.highway === 'steps' || tags.highway === 'elevator' || tags.conveying !== undefined;
}

function kantenTypFuerWay(tags: Record<string, string>): KantenTyp {
  if (tags.highway === 'elevator') return 'aufzug';
  if (tags.conveying && tags.conveying !== 'no') return 'rolltreppe';
  if (tags.highway === 'steps') return 'treppe';
  if (tags.incline) return 'rampe';
  return 'eben';
}

function istBarrierefrei(typ: KantenTyp, tags: Record<string, string>): boolean {
  if (typ === 'treppe' || typ === 'rolltreppe') return false;
  return tags.wheelchair !== 'no';
}

function knotenId(osmId: number, level: number): string {
  return `n${osmId}@${level}`;
}

export function baueGraph(osm: OverpassAntwort): StationGraph {
  const osmKnoten = new Map<number, OsmElement>();
  const ways: OsmElement[] = [];
  const waysNachId = new Map<number, OsmElement>();
  const relationen: OsmElement[] = [];
  for (const el of osm.elements) {
    if (el.type === 'node') osmKnoten.set(el.id, el);
    else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push(el);
      waysNachId.set(el.id, el);
    } else if (el.type === 'relation') relationen.push(el);
  }

  const knoten = new Map<string, GraphKnoten>();
  const adjazenz = new Map<string, GraphKante[]>();
  // OSM-Knoten-Id → vorhandene Ebenen-Instanzen (für Aufzugknoten und Pass B)
  const instanzEbenen = new Map<number, Set<number>>();

  function stelleKnotenSicher(osmId: number, level: number): string | null {
    const osmNode = osmKnoten.get(osmId);
    if (!osmNode || osmNode.lat === undefined || osmNode.lon === undefined) return null;
    const id = knotenId(osmId, level);
    if (!knoten.has(id)) {
      knoten.set(id, { id, lat: osmNode.lat, lon: osmNode.lon, level });
      if (!instanzEbenen.has(osmId)) instanzEbenen.set(osmId, new Set());
      instanzEbenen.get(osmId)!.add(level);
    }
    return id;
  }

  function fuegeKanteHinzu(kante: GraphKante): void {
    for (const ende of [kante.von, kante.nach]) {
      if (!adjazenz.has(ende)) adjazenz.set(ende, []);
      adjazenz.get(ende)!.push(kante);
    }
  }

  // --- Pass A: ebene Ways (Bahnsteige, Fußwege, Korridore) ---
  // legt Knoten-Instanzen auf ihrer Ebene an und verbindet Segmentpaare.
  for (const way of ways) {
    const tags = way.tags ?? {};
    if (!istEbenerWeg(tags) || istEbenenwechselWeg(tags)) continue;
    const ebene = wayEbene(tags);
    const typ = kantenTypFuerWay(tags);
    const barrierefrei = istBarrierefrei(typ, tags);
    for (let i = 0; i < way.nodes!.length - 1; i++) {
      const vonId = stelleKnotenSicher(way.nodes![i], ebene);
      const nachId = stelleKnotenSicher(way.nodes![i + 1], ebene);
      if (!vonId || !nachId || vonId === nachId) continue;
      const von = knoten.get(vonId)!;
      const nach = knoten.get(nachId)!;
      fuegeKanteHinzu({
        von: vonId,
        nach: nachId,
        laengeM: haversineM(von.lat, von.lon, nach.lat, nach.lon),
        deltaLevel: 0,
        typ,
        barrierefrei,
      });
    }
  }

  // --- Pass B: Ebenenwechsel-Ways (Treppen, Rolltreppen, Aufzug-Ways) ---
  // werden zu genau einer Kante zwischen Anfangs- und Endknoten kollabiert.
  for (const way of ways) {
    const tags = way.tags ?? {};
    if (!istEbenenwechselWeg(tags)) continue;

    const ersterOsm = way.nodes![0];
    const letzterOsm = way.nodes![way.nodes!.length - 1];

    // Ebenen bestimmen: explizites level-Tag hat Vorrang (incline gibt die
    // Richtung), sonst bereits bekannte Instanz-Ebenen der Endknoten.
    const levels = parseLevels(tags.level);
    let ebeneErster: number;
    let ebeneLetzter: number;
    if (levels.length >= 2) {
      const [lo, hi] = [levels[0], levels[levels.length - 1]];
      if (tags.incline === 'down') {
        ebeneErster = hi;
        ebeneLetzter = lo;
      } else {
        ebeneErster = lo;
        ebeneLetzter = hi;
      }
    } else {
      const bekannteErster = instanzEbenen.get(ersterOsm);
      const bekannteLetzter = instanzEbenen.get(letzterOsm);
      ebeneErster = bekannteErster ? Math.min(...bekannteErster) : (levels[0] ?? 0);
      ebeneLetzter = bekannteLetzter ? Math.max(...bekannteLetzter) : (levels[0] ?? 0);
    }

    const vonId = stelleKnotenSicher(ersterOsm, ebeneErster);
    const nachId = stelleKnotenSicher(letzterOsm, ebeneLetzter);
    if (!vonId || !nachId || vonId === nachId) continue;

    // Gesamtlänge über alle Segmente des Ways
    let laenge = 0;
    for (let i = 0; i < way.nodes!.length - 1; i++) {
      const a = osmKnoten.get(way.nodes![i]);
      const b = osmKnoten.get(way.nodes![i + 1]);
      if (a?.lat !== undefined && b?.lat !== undefined) {
        laenge += haversineM(a.lat!, a.lon!, b.lat!, b.lon!);
      }
    }

    const typ = kantenTypFuerWay(tags);
    fuegeKanteHinzu({
      von: vonId,
      nach: nachId,
      laengeM: laenge,
      deltaLevel: ebeneLetzter - ebeneErster,
      typ,
      barrierefrei: istBarrierefrei(typ, tags),
    });
  }

  // --- Pass C: Aufzug-Knoten (highway=elevator als Node) ---
  // verbindet alle Ebenen-Instanzen desselben OSM-Knotens mit Aufzugkanten.
  for (const [osmId, ebenen] of instanzEbenen) {
    const osmNode = osmKnoten.get(osmId);
    if (osmNode?.tags?.highway !== 'elevator' || ebenen.size < 2) continue;
    const sortiert = [...ebenen].sort((a, b) => a - b);
    for (let i = 0; i < sortiert.length - 1; i++) {
      fuegeKanteHinzu({
        von: knotenId(osmId, sortiert[i]),
        nach: knotenId(osmId, sortiert[i + 1]),
        laengeM: 0,
        deltaLevel: sortiert[i + 1] - sortiert[i],
        typ: 'aufzug',
        barrierefrei: osmNode.tags?.wheelchair !== 'no',
      });
    }
  }

  // --- Pass D: Bahnsteige (Ways UND Multipolygon-Relationen) ---
  // Große Bahnhöfe mappen Bahnsteige als Relation; kleine als einfachen Way.
  // Beide Formen werden auf dieselbe Struktur normalisiert.
  interface BahnsteigDaten {
    bahnsteigId: string;
    refs: string[];
    ebene: number;
    tags: Record<string, string>;
    nodeListen: number[][];
  }

  function parseRefs(tag: string | undefined): string[] {
    // Getrennt per ";" oder "/" ("11/12" ist bei Relationen üblich)
    return (tag ?? '')
      .split(/[;/]/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  }

  const bahnsteige: BahnsteigDaten[] = [];
  const relationsMitgliedWays = new Set<number>();

  for (const rel of relationen) {
    const tags = rel.tags ?? {};
    if (tags.railway !== 'platform') continue;
    const nodeListen: number[][] = [];
    for (const member of rel.members ?? []) {
      if (member.type !== 'way' || member.role === 'inner') continue;
      const memberWay = waysNachId.get(member.ref);
      if (memberWay?.nodes) {
        nodeListen.push(memberWay.nodes);
        relationsMitgliedWays.add(member.ref);
      }
    }
    if (nodeListen.length > 0) {
      bahnsteige.push({
        bahnsteigId: `r${rel.id}`,
        refs: parseRefs(tags.ref),
        ebene: wayEbene(tags),
        tags,
        nodeListen,
      });
    }
  }

  for (const way of ways) {
    const tags = way.tags ?? {};
    if (tags.railway !== 'platform') continue;
    if (relationsMitgliedWays.has(way.id)) continue; // schon über Relation erfasst
    bahnsteige.push({
      bahnsteigId: `w${way.id}`,
      refs: parseRefs(tags.ref),
      ebene: wayEbene(tags),
      tags,
      nodeListen: [way.nodes!],
    });
  }

  const gleisSet = new Set<string>();
  for (const bahnsteig of bahnsteige) {
    const { bahnsteigId, refs, ebene, tags, nodeListen } = bahnsteig;

    // Umriss als begehbare Kanten – verbindet Treppen/Aufzüge, die Knoten
    // mit der Bahnsteigkante teilen, auch ohne ref.
    const barrierefrei = tags.wheelchair !== 'no';
    for (const nodeListe of nodeListen) {
      for (let i = 0; i < nodeListe.length - 1; i++) {
        const vonId = stelleKnotenSicher(nodeListe[i], ebene);
        const nachId = stelleKnotenSicher(nodeListe[i + 1], ebene);
        if (!vonId || !nachId || vonId === nachId) continue;
        const von = knoten.get(vonId)!;
        const nach = knoten.get(nachId)!;
        fuegeKanteHinzu({
          von: vonId,
          nach: nachId,
          laengeM: haversineM(von.lat, von.lon, nach.lat, nach.lon),
          deltaLevel: 0,
          typ: 'eben',
          barrierefrei,
        });
      }
    }

    if (refs.length === 0) continue; // ohne Gleisnummer keine synthetischen Punkte

    const punkte = nodeListen
      .flat()
      .map((id) => osmKnoten.get(id))
      .filter((n): n is OsmElement => n?.lat !== undefined && n?.lon !== undefined);
    if (punkte.length < 2) continue;

    // Bahnsteigenden = Punktpaar mit maximaler Distanz (Ways sind klein, O(n²) ok)
    let endeA = punkte[0];
    let endeB = punkte[1];
    let maxDist = -1;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        const d = haversineM(punkte[i].lat!, punkte[i].lon!, punkte[j].lat!, punkte[j].lon!);
        if (d > maxDist) {
          maxDist = d;
          endeA = punkte[i];
          endeB = punkte[j];
        }
      }
    }
    const mitteLat = (endeA.lat! + endeB.lat!) / 2;
    const mitteLon = (endeA.lon! + endeB.lon!) / 2;

    for (const gleis of refs) {
      gleisSet.add(gleis);
      const lagen: [string, number, number][] = [
        ['anfang', endeA.lat!, endeA.lon!],
        ['mitte', mitteLat, mitteLon],
        ['ende', endeB.lat!, endeB.lon!],
      ];
      let vorherigeId: string | null = null;
      for (const [abschnitt, lat, lon] of lagen) {
        const id = `gleis${gleis}:${abschnitt}`;
        if (!knoten.has(id)) {
          knoten.set(id, { id, lat, lon, level: ebene, gleis, abschnitt, bahnsteigId });
        }
        if (vorherigeId) {
          const a = knoten.get(vorherigeId)!;
          const b = knoten.get(id)!;
          fuegeKanteHinzu({
            von: vorherigeId,
            nach: id,
            laengeM: haversineM(a.lat, a.lon, b.lat, b.lon),
            deltaLevel: 0,
            typ: 'eben',
            barrierefrei: true,
          });
        }
        vorherigeId = id;
      }

      // Anbindung ans Wegenetz: nächster physischer Knoten gleicher Ebene ≤ 30 m
      for (const [abschnitt, lat, lon] of lagen) {
        const syntId = `gleis${gleis}:${abschnitt}`;
        let nahester: GraphKnoten | null = null;
        let nahesteDist = Number.POSITIVE_INFINITY;
        for (const kandidat of knoten.values()) {
          if (!kandidat.id.startsWith('n')) continue; // nur physische Knoten
          if (kandidat.level !== ebene) continue;
          const d = haversineM(lat, lon, kandidat.lat, kandidat.lon);
          if (d < nahesteDist) {
            nahesteDist = d;
            nahester = kandidat;
          }
        }
        if (nahester && nahesteDist <= ANBINDUNG_MAX_M) {
          fuegeKanteHinzu({
            von: syntId,
            nach: nahester.id,
            laengeM: nahesteDist,
            deltaLevel: 0,
            typ: 'eben',
            barrierefrei: true,
          });
        }
      }
    }
  }

  const gleise = [...gleisSet].sort((a, b) =>
    a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' }),
  );

  // Stufe wird erst durch die Klassifikation (Task 5) gesetzt – Start: 3.
  return { knoten, adjazenz, stufe: 3, gleise };
}
