import { mittlereAchse, nachNordwesten, peilungGrad, richteEndenAus } from './richtung.js';
import type {
  GraphKante,
  GraphKnoten,
  KantenTyp,
  OsmElement,
  OverpassAntwort,
  RoutenPfad,
  StationGraph,
  StationsInfo,
} from './typen.js';

const ERDRADIUS_M = 6_371_000;
// Bahnsteigpunkte werden an den nächstgelegenen Wegknoten gleicher Ebene
// angebunden – aber nur, wenn er nah genug ist (sonst Datenlücke).
const ANBINDUNG_MAX_M = 30;

/**
 * Umkreis, in dem ein verwaister Aufzugausstieg an einen Bahnsteig
 * angeschlossen wird (siehe `verbindeVerwaisteAufzuege`).
 *
 * Bewusst VIEL enger als `ANBINDUNG_MAX_M`. Die normale Anbindung verbindet
 * einen Bahnsteigpunkt mit dem Wegenetz, das ohnehin zu ihm gehoert; hier
 * wird eine Luecke in Fremddaten ueberbrueckt, und ein falsch verbundener
 * Aufzug ist auf der barrierefreien Route der teuerste denkbare Fehler: Er
 * schickt jemanden im Rollstuhl zu einem Lift, den er nicht erreicht. Das
 * ist schlechter als die ehrliche Absage "keine barrierefreie Route".
 *
 * 10 m ist die Entscheidung vom 07.09.2026, getroffen an Braunschweig Hbf
 * (Abstand dort: 8 m). Kein gemessener Wert - eine bewusst knappe Grenze.
 */
const VERWAIST_MAX_M = 10;

/**
 * Wie nah ein begehbarer Knoten an der Bahnsteigachse liegen muss, um als
 * „auf dem Bahnsteig" zu gelten.
 *
 * Berlins Tiefbahnsteige liegen 24 m auseinander; 12 m ist die Haelfte davon
 * und damit die groesste Weite, die nicht auf den Nachbarbahnsteig greifen
 * kann. Zusaetzlich gewinnt immer der NAECHSTE Bahnsteig - ein Knoten haengt
 * nie an zweien.
 */
const BAHNSTEIG_NAEHE_M = 12;

/**
 * So nah am Umriss eines Bahnsteigs liegt JEDER Punkt seiner Kante.
 *
 * Eine `platform_edge` ist der Rand des Bahnsteigs; gezeichnet liegt sie auf
 * dem Umriss oder knapp daneben. 3 m sind weniger als ein Gleisabstand
 * (4,5 m) - die Kante kann nicht an den Bahnsteig jenseits des Gleises
 * fallen.
 */
const KANTE_AM_BAHNSTEIG_M = 3;

/** Kleinster Abstand eines Punktes zum Umriss (allen Segmenten) eines Bahnsteigs, in Metern. */
function abstandZumUmriss(
  p: { lat: number; lon: number },
  nodeListen: number[][],
  osmKnoten: Map<number, OsmElement>,
): number {
  const mLat = 111_320;
  const mLon = mLat * Math.cos((p.lat * Math.PI) / 180);
  let min = Number.POSITIVE_INFINITY;
  for (const liste of nodeListen) {
    for (let i = 0; i < liste.length - 1; i++) {
      const a = osmKnoten.get(liste[i]);
      const b = osmKnoten.get(liste[i + 1]);
      if (a?.lat === undefined || b?.lat === undefined) continue;
      const ax = (a.lon! - p.lon) * mLon;
      const ay = (a.lat - p.lat) * mLat;
      const bx = (b.lon! - p.lon) * mLon;
      const by = (b.lat - p.lat) * mLat;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return min;
}

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

/**
 * Ebene eines "flachen" Ways – und ob sie belegt ist oder geraten.
 *
 * Die Unterscheidung ist kein Beiwerk: Ohne sie sieht eine Vermutung wie eine
 * Tatsache aus, und bei zwei Bahnsteigen mit derselben Gleisnummer entschied
 * die Verarbeitungsreihenfolge statt der Datenlage.
 */
function wayEbeneMitBeleg(tags: Record<string, string>): { ebene: number; ebeneBelegt: boolean } {
  const levels = parseLevels(tags.level);
  if (levels.length === 1) return { ebene: levels[0], ebeneBelegt: true };
  if (levels.length > 1) return { ebene: levels[0], ebeneBelegt: true }; // uneindeutig – konservativ unterste
  if (tags.tunnel === 'yes') return { ebene: -1, ebeneBelegt: true };
  if (tags.bridge === 'yes') return { ebene: 1, ebeneBelegt: true };
  return { ebene: 0, ebeneBelegt: false };
}

/** Ebene eines "flachen" Ways: level-Tag, sonst Tunnel/Brücke-Heuristik, sonst 0. */
function wayEbene(tags: Record<string, string>): number {
  return wayEbeneMitBeleg(tags).ebene;
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

/** WC oder Kiosk – die beiden Zwischenziele, die der Entwurf in einem Knopf nennt. */
function poiArt(tags: Record<string, string> | undefined): 'wc' | 'kiosk' | undefined {
  if (!tags) return undefined;
  if (tags.amenity === 'toilets') return 'wc';
  if (tags.shop === 'kiosk') return 'kiosk';
  return undefined;
}

/**
 * Ein Punkt für den POI: die Node selbst, oder die Mitte der Umrisspunkte.
 *
 * Grössere Anlagen sind in OSM als Fläche erfasst, nicht als Punkt. Ohne die
 * Mittelung fiele jede zweite Toilette weg, weil ein Way keine eigene
 * Koordinate trägt.
 */
function poiPunkt(
  el: OsmElement,
  osmKnoten: Map<number, OsmElement>,
): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  const punkte = (el.nodes ?? [])
    .map((id) => osmKnoten.get(id))
    .filter((n): n is OsmElement => n?.lat !== undefined && n.lon !== undefined);
  if (punkte.length === 0) return null;
  return {
    lat: punkte.reduce((s, n) => s + n.lat!, 0) / punkte.length,
    lon: punkte.reduce((s, n) => s + n.lon!, 0) / punkte.length,
  };
}

function knotenId(osmId: number, level: number): string {
  return `n${osmId}@${level}`;
}

export function baueGraph(osm: OverpassAntwort, dbGleise?: StationsInfo['gleise']): StationGraph {
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
    /** true = aus level/tunnel/bridge gelesen, false = mangels Angabe auf 0 geraten. */
    ebeneBelegt: boolean;
    tags: Record<string, string>;
    nodeListen: number[][];
  }

  /**
   * Die Gleisnummern eines Bahnsteigs aus seinem `ref`-Tag.
   *
   * Drei Regeln, alle am 13.09.2026 ueber 983 Bahnsteigrefs aus 85 abgelegten
   * Bahnhoefen gemessen - die Simulation hat sie aufgedeckt, indem sie in
   * Frankfurt(Main)Hbf vom Gleis 1 zum „Platz der Republik" fuhr.
   *
   * 1. TRENNZEICHEN. Bisher nur ";" und "/". In den Daten stehen ausserdem
   *    "," und ":" - Leipzig Hbf traegt "18a,19", Hannover "2,2a" und
   *    "2b,3,3a,3b", Duesseldorf "3:4". Deren Gleise fehlten damit in der
   *    Liste, und an ihrer Stelle stand ein Gebilde, das kein Gleis ist.
   *    Am Kopfbahnhof Leipzig hiess das: „Gleis 19" gibt es nicht.
   * 2. VORSILBE. "Gleis 21" ist Gleis 21. Sechs Bahnsteige schreiben es aus.
   * 3. EINE GLEISNUMMER HAT EINE ZIFFER. Was keine traegt, ist keine:
   *    "Omnibusbahnhof", "Eilgutbuehne", "Museumsbahnsteig", "Platz der
   *    Republik", die Strassenbahnsteige "B", "C", "L", "M", "G". Basels
   *    "Regio 1" und "Fern 4" bleiben - sie sind dort die Gleisbezeichnung.
   */
  function parseRefs(tag: string | undefined): string[] {
    return (tag ?? '')
      .split(/[;/,:]/)
      .map((r) => r.trim().replace(/^(?:Gleis|Gl\.?)\s+/i, '').trim())
      .filter((r) => r.length > 0 && /\d/.test(r));
  }

  /**
   * Alle Gleisnummern eines Bahnsteigs – in jeder Schreibweise, die OSM kennt.
   *
   * Bis zum 02.10.2026 nur `ref`. Das ÖPNV-Schema von OSM schreibt die
   * Gleisnummer aber als `local_ref` (Singen, Offenburg, Iserlohn), manche
   * Bahnsteige als `railway:track_ref` (Karlsruhe). Im Abgleich mit dem
   * echten Fahrplan fehlten dadurch an 16 von 116 Bahnhöfen Gleise, die in
   * OSM stehen.
   *
   * `local_ref` geht vor `ref`. Gemessen über die Ablage: 170 Bahnsteige
   * tragen beide gleich, 9 verschieden – und dort ist `ref` die
   * Bahnsteigbezeichnung (Ostkreuz „Rn1", „F") oder schlicht falsch (Halle,
   * „Bahnsteig 4/5" mit ref=5;6; die DB verbindet 4 mit 5).
   */
  function gleisnummern(tags: Record<string, string>): string[] {
    const haupt = tags.local_ref !== undefined ? tags.local_ref : tags.ref;
    const alle = [haupt, tags['railway:track_ref']].flatMap(parseRefs);
    return [...new Set(alle)];
  }

  /**
   * Ist das ein EISENBAHNsteig?
   *
   * `railway=platform` traegt in OSM auch Strassenbahnsteige: Frankfurts
   * Bahnhofsvorplatz liefert so die „Gleise" B, C, L und „Platz der
   * Republik" - und die Simulation fuhr am 13.09.2026 zum letzten davon
   * statt zu Gleis 24. Der Metropolknoten war damit gar nicht gemessen.
   *
   * Die Regel ist bewusst eng: Ausgeschlossen wird nur, was sich SELBST als
   * Strassenbahn- oder Bussteig ausweist und sich NICHT auch als
   * Eisenbahnsteig. `train=yes` zu VERLANGEN waere zu scharf - 184 von 983
   * gemessenen Bahnsteigrefs tragen es nicht, darunter Kaiserslauterns
   * Gleise 1 und 8/10. Auch `highway=platform` bleibt draussen: Es faellt
   * genau ein echtes Gleis mit (Duisburgs Gleis 1) und faengt dafuer nur
   * Chemnitz' „Omnibusbahnhof", den Regel 3 oben ohnehin nimmt.
   */
  function istEisenbahnsteig(tags: Record<string, string>): boolean {
    if (tags.train === 'yes') return true;
    return tags.tram !== 'yes' && tags.bus !== 'yes';
  }

  const bahnsteige: BahnsteigDaten[] = [];
  const relationsMitgliedWays = new Set<number>();
  /** Strassenbahnsteige – draussen, ausser die DB fuehrt dort per IFOPT ein Gleis. */
  const strassenbahnsteige: BahnsteigDaten[] = [];
  /** Die DELFI-Kennungen (`ref:IFOPT`) je Bahnsteig, auch die seiner Kanten. */
  const kennungen = new Map<BahnsteigDaten, string[]>();
  const merkeKennungen = (bahnsteig: BahnsteigDaten, tags: Record<string, string>): void => {
    const neu = (tags['ref:IFOPT'] ?? '').split(';').map((k) => k.trim()).filter(Boolean);
    kennungen.set(bahnsteig, [...(kennungen.get(bahnsteig) ?? []), ...neu]);
  };

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
      nimmAuf({ bahnsteigId: `r${rel.id}`, refs: [], ...wayEbeneMitBeleg(tags), tags, nodeListen });
    }
  }

  for (const way of ways) {
    const tags = way.tags ?? {};
    if (tags.railway !== 'platform') continue;
    if (relationsMitgliedWays.has(way.id)) continue; // schon über Relation erfasst
    nimmAuf({ bahnsteigId: `w${way.id}`, refs: [], ...wayEbeneMitBeleg(tags), tags, nodeListen: [way.nodes!] });
  }

  /** Eisenbahnsteig mit seinen Gleisnummern – Strassenbahnsteig ohne. */
  function nimmAuf(bahnsteig: BahnsteigDaten): void {
    merkeKennungen(bahnsteig, bahnsteig.tags);
    if (istEisenbahnsteig(bahnsteig.tags)) {
      bahnsteig.refs = gleisnummern(bahnsteig.tags);
      bahnsteige.push(bahnsteig);
    } else {
      strassenbahnsteige.push(bahnsteig);
    }
  }

  // --- Bahnsteigkanten (`railway=platform_edge`) ---
  //
  // Stuttgart, Karlsruhe und Mannheim Hbf tragen die Gleisnummer nicht am
  // Bahnsteig, sondern an seinen Kanten - je Gleis eine Linie entlang des
  // Umrisses. Die Nummer gehoert dem Bahnsteig, an dessen Umriss die Kante
  // liegt: So bleiben beide Kanten eines Inselbahnsteigs EIN Bahnsteig, und
  // "gegenueber" stimmt. Ohne Bahnsteig daneben ist die Kante selbst der
  // Bahnsteig - ihre Linie ist seine Lage.
  for (const way of ways) {
    const tags = way.tags ?? {};
    if (tags.railway !== 'platform_edge' || !istEisenbahnsteig(tags)) continue;
    const refs = gleisnummern(tags);
    if (refs.length === 0 && !tags['ref:IFOPT']) continue;
    const punkte = way.nodes!
      .map((id) => osmKnoten.get(id))
      .filter((n): n is OsmElement & { lat: number; lon: number } => n?.lat !== undefined && n?.lon !== undefined);
    if (punkte.length < 2) continue;
    const kante = wayEbeneMitBeleg(tags);
    let bester: BahnsteigDaten | undefined;
    let besterAbstand = Number.POSITIVE_INFINITY;
    for (const bahnsteig of bahnsteige) {
      // Zwei belegte, verschiedene Stockwerke: nicht derselbe Bahnsteig.
      if (bahnsteig.ebeneBelegt && kante.ebeneBelegt && bahnsteig.ebene !== kante.ebene) continue;
      // Der GROESSTE Abstand eines Kantenpunkts: Die Kante folgt dem Umriss
      // ihres Bahnsteigs auf ganzer Laenge. An Berlin Hbf, einem
      // Kreuzungsbahnhof, lag die Mitte der Kante von Gleis 3 (Ebene -2) auf
      // dem Umriss eines Bahnsteigs von Ebene 2 – sie kreuzt ihn nur.
      const abstand = Math.max(...punkte.map((q) => abstandZumUmriss(q, bahnsteig.nodeListen, osmKnoten)));
      if (abstand < besterAbstand) {
        besterAbstand = abstand;
        bester = bahnsteig;
      }
    }
    if (bester && besterAbstand <= KANTE_AM_BAHNSTEIG_M) {
      for (const r of refs) if (!bester.refs.includes(r)) bester.refs.push(r);
      if (!bester.ebeneBelegt && kante.ebeneBelegt) Object.assign(bester, kante);
      merkeKennungen(bester, tags);
    } else {
      const eigener: BahnsteigDaten = { bahnsteigId: `w${way.id}`, refs, ...kante, tags, nodeListen: [way.nodes!] };
      bahnsteige.push(eigener);
      merkeKennungen(eigener, tags);
    }
  }

  // --- DB-Gleise ueber die IFOPT-Kennung ---
  //
  // RIS::Stations nennt je Gleis die DELFI-Kennung, OSM traegt sie am
  // Bahnsteig. Wo OSM die Gleisnummer nicht schreibt (Hamburg-Altonas
  // S-Bahnsteige, Muenchen Hbf tief), verbindet die Kennung beide Quellen –
  // belegt, nicht aus Namen geraten. Exakt vor Bereich: "de:09162:6:40" ist
  // der Bereich, in dem das Gleis "de:09162:6:40:81" liegt. Treffen zwei
  // Bahnsteige gleich gut, wird nicht gewaehlt.
  //
  // Ein Strassenbahnsteig gilt, wenn die DB dort ein Gleis fuehrt: Chemnitz
  // Hbf faehrt seine Citybahn ueber die Bahnsteige des Vorplatzes.
  if (dbGleise) {
    const bekannt = new Set(bahnsteige.flatMap((b) => b.refs));
    const alle = [...bahnsteige, ...strassenbahnsteige];
    for (const g of dbGleise) {
      const kennung = g.ris?.ifopt;
      if (!kennung || bekannt.has(g.gleis) || g.ris?.parentPlatform) continue;
      const exakt = alle.filter((b) => (kennungen.get(b) ?? []).includes(kennung));
      const bereich = alle.filter((b) => (kennungen.get(b) ?? []).some((k) => kennung.startsWith(`${k}:`)));
      const treffer = exakt.length > 0 ? exakt : bereich;
      if (treffer.length !== 1) continue;
      const ziel = treffer[0];
      ziel.refs.push(g.gleis);
      if (!bahnsteige.includes(ziel)) bahnsteige.push(ziel);
      bekannt.add(g.gleis);
    }
  }

  /**
   * Welcher Bahnsteig stellt die Punkte fuer eine Gleisnummer?
   *
   * Zwei verschiedene Bahnsteige koennen sich eine Nummer teilen – in Berlin
   * Hbf traegt sowohl der U-Bahnsteig "S+U Hauptbahnhof" als auch "Berlin
   * Hauptbahnhof (Tief)" ein Gleis 4. Bisher gewann schlicht der zuerst
   * verarbeitete: Der Knoten `gleis4:*` behielt dessen Lage UND dessen
   * (mangels level-Tag geratene) Ebene 0, wurde vom zweiten aber ans
   * -2-Netz gehaengt. Heraus kam eine ebene Kante ueber zwei Stockwerke.
   *
   * Die Regel ist bewusst schmal: Ein belegtes Stockwerk schlaegt ein
   * geratenes. Sie loest den beobachteten Fall und masst sich nicht an, den
   * vollen Abgleich OSM <-> DB-Gleisliste (Konzept 4.3) zu ersetzen – haben
   * beide einen Beleg, bleibt es bei der bisherigen Reihenfolge.
   */
  const quelleFuerGleis = new Map<string, BahnsteigDaten>();
  for (const bahnsteig of bahnsteige) {
    for (const gleis of bahnsteig.refs) {
      const bisher = quelleFuerGleis.get(gleis);
      if (!bisher || (!bisher.ebeneBelegt && bahnsteig.ebeneBelegt)) {
        quelleFuerGleis.set(gleis, bahnsteig);
      }
    }
  }

  /**
   * Welches Bahnsteigende „anfang" heisst (ToDo 31, 15.09.2026).
   *
   * Bis dahin das Ende, das OSM zufaellig zuerst zeichnet: an zwei
   * Nachbarbahnsteigen oft entgegengesetzte Enden, und kein Knopf konnte
   * sagen, welches gemeint ist. Jetzt das Nord- bzw. Westende - fuer alle
   * Bahnsteige EINER Ebene an derselben Achse ausgerichtet, damit zwei fast
   * parallele Bahnsteige knapp beiderseits der Nordost-Diagonale nicht
   * verschiedene Enden waehlen.
   *
   * Warum die Himmelsrichtung: Sie ist die einzige Orientierung, die an JEDEM
   * Bahnhof aus den Daten belegt ist. Kopf und Empfangsgebaeude kennt die
   * Overpass-Abfrage nicht, und die Fahrtrichtung des Zuges liesse sich nur
   * aus dem Laufweg schaetzen - eine Schaetzung, die an Bruecken und Kurven
   * das falsche Ende naennte.
   */
  type Lagepunkt = OsmElement & { lat: number; lon: number };
  const endenJeBahnsteig = new Map<BahnsteigDaten, [Lagepunkt, Lagepunkt]>();
  for (const bahnsteig of bahnsteige) {
    if (bahnsteig.refs.length === 0) continue; // ohne Gleisnummer keine synthetischen Punkte
    const punkte = bahnsteig.nodeListen
      .flat()
      .map((id) => osmKnoten.get(id))
      .filter((n): n is Lagepunkt => n?.lat !== undefined && n?.lon !== undefined);
    if (punkte.length < 2) continue;

    // Bahnsteigenden = Punktpaar mit maximaler Distanz (Ways sind klein, O(n²) ok)
    let endeA = punkte[0];
    let endeB = punkte[1];
    let maxDist = -1;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        const d = haversineM(punkte[i].lat, punkte[i].lon, punkte[j].lat, punkte[j].lon);
        if (d > maxDist) {
          maxDist = d;
          endeA = punkte[i];
          endeB = punkte[j];
        }
      }
    }
    endenJeBahnsteig.set(bahnsteig, [endeA, endeB]);
  }
  const peilungenJeEbene = new Map<number, number[]>();
  for (const [bahnsteig, [a, e]] of endenJeBahnsteig) {
    const liste = peilungenJeEbene.get(bahnsteig.ebene) ?? [];
    liste.push(peilungGrad(a, e));
    peilungenJeEbene.set(bahnsteig.ebene, liste);
  }
  const richtungJeEbene = new Map<number, number>();
  for (const [ebene, peilungen] of peilungenJeEbene) {
    richtungJeEbene.set(ebene, nachNordwesten(mittlereAchse(peilungen)));
  }
  for (const [bahnsteig, [a, e]] of endenJeBahnsteig) {
    endenJeBahnsteig.set(bahnsteig, richteEndenAus(a, e, richtungJeEbene.get(bahnsteig.ebene)!));
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

    // Anfang = Nord- bzw. Westende, siehe `endenJeBahnsteig` oben.
    const enden = endenJeBahnsteig.get(bahnsteig);
    if (!enden) continue;
    const [endeA, endeB] = enden;
    const mitteLat = (endeA.lat + endeB.lat) / 2;
    const mitteLon = (endeA.lon + endeB.lon) / 2;

    for (const gleis of refs) {
      gleisSet.add(gleis);
      // Ein anderer Bahnsteig ist die bessere Quelle fuer diese Nummer. Der
      // Umriss oben bleibt trotzdem begehbar – er ist echte Geometrie.
      if (quelleFuerGleis.get(gleis) !== bahnsteig) continue;
      const lagen: [string, number, number][] = [
        ['anfang', endeA.lat, endeA.lon],
        ['mitte', mitteLat, mitteLon],
        ['ende', endeB.lat, endeB.lon],
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
        // Die Ebene des KNOTENS, nicht die des gerade verarbeiteten
        // Bahnsteigs. Beide sind hier identisch, seit nur die gewaehlte
        // Quelle Punkte anlegt – aber eine ebene Kante ueber Stockwerke darf
        // auch dann unmoeglich bleiben, wenn das jemand spaeter aufweicht.
        const knotenEbene = knoten.get(syntId)?.level ?? ebene;
        let nahester: GraphKnoten | null = null;
        let nahesteDist = Number.POSITIVE_INFINITY;
        for (const kandidat of knoten.values()) {
          if (!kandidat.id.startsWith('n')) continue; // nur physische Knoten
          if (kandidat.level !== knotenEbene) continue;
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

  // --- Pass E: der Bahnsteig als begehbare Linie ---
  //
  // Bis hierher ist ein Bahnsteig eine Kette aus drei Punkten. Wer ihn
  // dazwischen betritt - und das tut jeder, der eine Rolltreppe in der Mitte
  // nimmt -, muss erst zu einem der drei laufen. An Berlins Gleis 5/6 waren
  // das 342 m statt 92: 123 m zurueck zum Anfang, dann 215 m wieder vor.
  //
  // Die Kette wird deshalb um die begehbaren Knoten ergaenzt, die ohnehin auf
  // dem Bahnsteig liegen, in ihrer Reihenfolge entlang der Achse. Neue Knoten
  // entstehen dabei keine - nur die Kanten, die den Bahnsteig zu dem machen,
  // was er ist: eine Flaeche, auf der man der Laenge nach gehen kann.
  verdichteBahnsteigketten(knoten, fuegeKanteHinzu);

  // --- Pass POI: Zwischenziele der Variante `mit-stopp` ---
  //
  // Sie hängen nur AM Graphen, sie sind nicht Teil seines Gerüsts: Ein POI
  // bekommt genau eine ebene Kante zum nächsten begehbaren Knoten und wird
  // dadurch nie zur Abkürzung zwischen zwei Bahnsteigen. Ohne diese Grenze
  // liefe irgendwann eine „schnellste" Route durch eine Toilette.
  for (const el of osm.elements) {
    const art = poiArt(el.tags);
    if (!art) continue;
    const punkt = poiPunkt(el, osmKnoten);
    if (!punkt) continue;

    // Ebene aus dem Tag, sonst die des nächsten begehbaren Knotens: Ein WC
    // im Untergeschoss an das Erdgeschoss zu hängen wäre schlimmer als es
    // wegzulassen – der Weg dorthin führte durch keine Treppe.
    const ebeneBelegt = el.tags?.level !== undefined;
    const eigeneEbene = ebeneBelegt ? wayEbene(el.tags ?? {}) : undefined;

    let nahester: GraphKnoten | null = null;
    let nahesteDist = Number.POSITIVE_INFINITY;
    for (const kandidat of knoten.values()) {
      if (!kandidat.id.startsWith('n')) continue; // nur physische Knoten
      if (eigeneEbene !== undefined && kandidat.level !== eigeneEbene) continue;
      const d = haversineM(punkt.lat, punkt.lon, kandidat.lat, kandidat.lon);
      if (d < nahesteDist) {
        nahesteDist = d;
        nahester = kandidat;
      }
    }
    if (!nahester || nahesteDist > ANBINDUNG_MAX_M) continue;

    const id = `poi${el.id}@${nahester.level}`;
    if (knoten.has(id)) continue;
    knoten.set(id, { id, lat: punkt.lat, lon: punkt.lon, level: nahester.level, poi: art });
    fuegeKanteHinzu({
      von: id,
      nach: nahester.id,
      laengeM: nahesteDist,
      deltaLevel: 0,
      typ: 'eben',
      barrierefrei: true,
    });
  }

  const gleise = [...gleisSet].sort((a, b) =>
    a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' }),
  );

  // --- Pass F: verwaiste Aufzugausstiege an ihren Bahnsteig anschliessen ---
  verbindeVerwaisteAufzuege(knoten, adjazenz, fuegeKanteHinzu);

  // Stufe wird erst durch die Klassifikation (Task 5) gesetzt – Start: 3.
  return { knoten, adjazenz, stufe: 3, gleise };
}

/**
 * Schliesst Aufzugausstiege an, die in OSM an keinem Wegenetz haengen.
 *
 * Der Fall, an dem es auffiel (Braunschweig Hbf, gemeldet 07.09.2026): Vier
 * Aufzuege kartiert, laut FaSta alle ACTIVE, und trotzdem keine
 * barrierefreie Route. Drei davon verbindet OSM mit dem Bahnsteigweg, den
 * vierten nicht - dessen Ausstieg auf Ebene 1 bildet mit zwei Stummelknoten
 * eine eigene Insel, 8 m neben der Mitte von Gleis 1. Die normale Anbindung
 * konnte ihn nicht auffangen: Sie waehlt je Bahnsteigpunkt genau EINEN
 * naechsten Wegknoten, und das war mit 2 m ein anderer.
 *
 * Dass die anderen drei funktionierten, war Glueck in Fremddaten. Darauf
 * darf sich eine barrierefreie Auskunft nicht verlassen.
 *
 * **Die Regel ist bewusst schmal**, wie die gegen den Ebenensprung. Sie
 * greift nur, wenn alle drei Bedingungen zutreffen:
 *
 * 1. Die barrierefreie Insel enthaelt einen Aufzug und KEINEN Bahnsteig.
 *    Ein Aufzugausstieg, von dem aus zu Fuss nichts zu erreichen ist, ist
 *    beweisbar kaputte Datenlage - er fuehrt nirgendwohin.
 * 2. Ein Bahnsteigpunkt derselben Ebene liegt naeher als `VERWAIST_MAX_M`.
 * 3. **Alle** Bahnsteigpunkte in diesem Umkreis gehoeren zu EINER Insel.
 *    Liegen zwei verschiedene in Reichweite, ist nicht entscheidbar, welchem
 *    der Aufzug dient - dann bleibt es bei der ehrlichen Absage.
 *
 * Punkt 3 zaehlt Inseln, nicht Gleisnummern: Ein Bahnsteig traegt oft zwei
 * Gleise (Braunschweig: "1;2"), und die sind derselbe begehbare Ort.
 */
/**
 * Lage eines Punktes auf einer Achse: Anteil 0..1 entlang, Abstand quer.
 */
function achsenLage(
  a: GraphKnoten,
  b: GraphKnoten,
  p: { lat: number; lon: number },
): { anteil: number; querM: number } | null {
  const mLat = 111_320;
  const mLon = mLat * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lon - a.lon) * mLon;
  const by = (b.lat - a.lat) * mLat;
  const px = (p.lon - a.lon) * mLon;
  const py = (p.lat - a.lat) * mLat;
  const laenge2 = bx * bx + by * by;
  if (laenge2 === 0) return null;
  const t = (px * bx + py * by) / laenge2;
  return { anteil: t, querM: Math.hypot(px - t * bx, py - t * by) };
}

/**
 * Die Bahnsteigketten um die Knoten ergaenzen, die auf ihnen liegen.
 *
 * Ein Knoten haengt an HOECHSTENS einem Bahnsteig - dem naechsten. Sonst
 * entstuende zwischen zwei Bahnsteigen eine ebene Kante, also ein Weg ueber
 * die Gleise.
 *
 * Aber an JEDER Kette dieses Bahnsteigs. Ein Bahnsteig traegt meist zwei
 * Gleise, und jedes hat seine eigenen Punkte `gleisN:anfang|mitte|ende`.
 * Bis zum 14.09.2026 waren die Achsen nach Bahnsteig geschluesselt, das
 * zuletzt verarbeitete Gleis ueberschrieb das erste - und nur dessen Kette
 * wurde verdichtet. In Leipzig Hbf hing `gleis6:mitte` deshalb allein an
 * seinen beiden Enden, 103 m in jede Richtung; die Treppe zur Unterfuehrung
 * 72 m weiter kostete 139 s statt 72 s. Das Routing war dabei exakt - der
 * Graph bot den direkten Weg nur nicht an.
 */
function verdichteBahnsteigketten(
  knoten: Map<string, GraphKnoten>,
  fuegeKanteHinzu: (kante: GraphKante) => void,
): void {
  interface Kette {
    anfang: GraphKnoten;
    ende: GraphKnoten;
    mitte?: GraphKnoten;
  }
  interface Achse {
    level: number;
    /** Eine Kette je Gleis - sie teilen sich den Bahnsteig, nicht die Knoten. */
    ketten: Map<string, Kette>;
  }
  const achsen = new Map<string, Achse>();
  for (const k of knoten.values()) {
    if (!k.bahnsteigId || !k.abschnitt) continue;
    let achse = achsen.get(k.bahnsteigId);
    if (!achse) {
      achse = { level: k.level, ketten: new Map() };
      achsen.set(k.bahnsteigId, achse);
    }
    const gleis = k.gleis ?? '';
    let kette = achse.ketten.get(gleis);
    if (!kette) {
      kette = { anfang: k, ende: k };
      achse.ketten.set(gleis, kette);
    }
    if (k.abschnitt === 'anfang') kette.anfang = k;
    if (k.abschnitt === 'ende') kette.ende = k;
    if (k.abschnitt === 'mitte') kette.mitte = k;
  }

  /** Die Lage des Bahnsteigs: Alle seine Ketten liegen auf denselben Enden. */
  const geometrie = (achse: Achse): Kette | undefined =>
    [...achse.ketten.values()].find((k) => k.anfang !== k.ende);

  // Jeden begehbaren Knoten seinem naechsten Bahnsteig zuordnen.
  const mitglieder = new Map<string, GraphKnoten[]>();
  for (const kandidat of knoten.values()) {
    if (!kandidat.id.startsWith('n')) continue; // nur physische Knoten
    let bester: { id: string; querM: number } | null = null;
    for (const [id, achse] of achsen) {
      if (achse.level !== kandidat.level) continue;
      const lage = geometrie(achse);
      if (!lage) continue;
      const hier = achsenLage(lage.anfang, lage.ende, kandidat);
      if (!hier) continue;
      if (hier.querM > BAHNSTEIG_NAEHE_M) continue;
      if (hier.anteil < 0 || hier.anteil > 1) continue;
      if (!bester || hier.querM < bester.querM) bester = { id, querM: hier.querM };
    }
    if (!bester) continue;
    if (!mitglieder.has(bester.id)) mitglieder.set(bester.id, []);
    mitglieder.get(bester.id)!.push(kandidat);
  }

  for (const [id, achse] of achsen) {
    const liste = mitglieder.get(id) ?? [];
    if (liste.length === 0) continue;
    for (const k of achse.ketten.values()) {
      if (k.anfang === k.ende) continue;
      const anteil = (p: GraphKnoten): number => achsenLage(k.anfang, k.ende, p)?.anteil ?? 0.5;
      const kette = [
        { knoten: k.anfang, anteil: 0 },
        ...liste.map((m) => ({ knoten: m, anteil: anteil(m) })),
        { knoten: k.ende, anteil: 1 },
      ];
      if (k.mitte) kette.push({ knoten: k.mitte, anteil: anteil(k.mitte) });
      kette.sort((a, b) => a.anteil - b.anteil);
      for (let i = 0; i < kette.length - 1; i++) {
        const von = kette[i].knoten;
        const nach = kette[i + 1].knoten;
        if (von.id === nach.id) continue;
        fuegeKanteHinzu({
          von: von.id,
          nach: nach.id,
          laengeM: haversineM(von.lat, von.lon, nach.lat, nach.lon),
          deltaLevel: 0,
          typ: 'eben',
          barrierefrei: true,
        });
      }
    }
  }
}

function verbindeVerwaisteAufzuege(
  knoten: Map<string, GraphKnoten>,
  adjazenz: Map<string, GraphKante[]>,
  fuegeKanteHinzu: (kante: GraphKante) => void,
): void {
  // Inseln ueber barrierefreie Kanten - aber OHNE die Aufzuege selbst.
  //
  // Das ist der Kern: Wer den Aufzug mitzaehlt, faehrt vom verwaisten
  // Ausstieg hinunter auf Ebene 0, findet dort Bahnsteige und haelt die
  // Insel faelschlich fuer versorgt. Gefragt ist aber, was der Ausstieg auf
  // SEINER Ebene zu Fuss erreicht - und das ist bei Braunschweig nichts.
  //
  // `status` bleibt aussen vor: Der ist zur Bauzeit unbekannt und kommt erst
  // je Anfrage aus FaSta dazu.
  const insel = new Map<string, number>();
  let naechsteInsel = 0;
  for (const id of knoten.keys()) {
    if (insel.has(id)) continue;
    const nummer = naechsteInsel++;
    const stapel = [id];
    insel.set(id, nummer);
    while (stapel.length > 0) {
      const aktuell = stapel.pop()!;
      for (const kante of adjazenz.get(aktuell) ?? []) {
        if (!kante.barrierefrei || kante.typ === 'aufzug') continue;
        const nachbar = kante.von === aktuell ? kante.nach : kante.von;
        if (insel.has(nachbar)) continue;
        insel.set(nachbar, nummer);
        stapel.push(nachbar);
      }
    }
  }

  const hatAufzug = new Set<number>();
  const hatBahnsteig = new Set<number>();
  for (const [id, nummer] of insel) {
    if (id.startsWith('gleis')) hatBahnsteig.add(nummer);
    if ((adjazenz.get(id) ?? []).some((k) => k.typ === 'aufzug')) hatAufzug.add(nummer);
  }

  // Erst sammeln, dann verbinden: Eine Kante waehrend des Laufs zu ziehen
  // wuerde die Inselnummern verfaelschen, auf denen die naechste Entscheidung
  // beruht.
  const neu: GraphKante[] = [];
  for (const [id, nummer] of insel) {
    if (!hatAufzug.has(nummer) || hatBahnsteig.has(nummer)) continue;
    const ausstieg = knoten.get(id);
    if (!ausstieg) continue;

    let naechster: GraphKnoten | null = null;
    let naechsteDist = Number.POSITIVE_INFINITY;
    const inseln = new Set<number>();
    for (const kandidat of knoten.values()) {
      if (!kandidat.id.startsWith('gleis')) continue;
      if (kandidat.level !== ausstieg.level) continue;
      const d = haversineM(ausstieg.lat, ausstieg.lon, kandidat.lat, kandidat.lon);
      if (d > VERWAIST_MAX_M) continue;
      inseln.add(insel.get(kandidat.id) ?? -1);
      if (d < naechsteDist) {
        naechsteDist = d;
        naechster = kandidat;
      }
    }
    // Bedingung 3: genau eine Insel in Reichweite, sonst gar nichts.
    if (!naechster || inseln.size !== 1) continue;
    neu.push({
      von: id,
      nach: naechster.id,
      laengeM: naechsteDist,
      deltaLevel: 0,
      typ: 'eben',
      barrierefrei: true,
    });
  }
  for (const kante of neu) fuegeKanteHinzu(kante);
}

// --- GeoJSON-Export fuer das Kartenfeld (Task 12) ---

interface GeoFeature {
  type: 'Feature';
  geometry: { type: 'LineString' | 'Point'; coordinates: unknown };
  properties: Record<string, unknown>;
}

/**
 * Route als GeoJSON je Ebene (Schluessel = level als String): Routen-Liniensegmente
 * pro Ebene plus Start-/Zielmarker. Koordinatenreihenfolge GeoJSON-konform [lon, lat].
 */
/**
 * Kopie mit geklonten Kanten; Knoten werden geteilt (sie werden nie geändert).
 *
 * Nötig, bevor ein Momentanzustand auf einen zwischengespeicherten Graphen
 * angewendet wird – etwa der FaSta-Betriebsstatus. Ohne die Kopie wanderte ein
 * gerade defekter Aufzug in den 24-Stunden-Graphcache und bliebe dort gesperrt,
 * lange nachdem er wieder läuft.
 */
export function kopiereGraph(graph: StationGraph): StationGraph {
  // Dieselbe Kante steht in beiden Adjazenzlisten – die Zuordnung sorgt dafür,
  // dass sie auch in der Kopie EIN Objekt bleibt.
  const klone = new Map<GraphKante, GraphKante>();
  const adjazenz = new Map<string, GraphKante[]>();
  for (const [id, liste] of graph.adjazenz) {
    adjazenz.set(
      id,
      liste.map((kante) => {
        let klon = klone.get(kante);
        if (!klon) {
          klon = { ...kante };
          klone.set(kante, klon);
        }
        return klon;
      }),
    );
  }
  return { knoten: graph.knoten, adjazenz, stufe: graph.stufe, gleise: graph.gleise };
}

export function graphZuGeoJSON(
  graph: StationGraph,
  pfad: RoutenPfad,
): Record<string, { type: 'FeatureCollection'; features: GeoFeature[] }> {
  if (pfad.knoten.length === 0) return {};

  const proEbene = new Map<number, GeoFeature[]>();
  const featuresFuer = (level: number): GeoFeature[] => {
    if (!proEbene.has(level)) proEbene.set(level, []);
    return proEbene.get(level)!;
  };

  // Routenlinie in Segmente gleicher Ebene zerlegen
  let segment: GraphKnoten[] = [pfad.knoten[0]];
  const schliesseSegment = (): void => {
    if (segment.length >= 2) {
      featuresFuer(segment[0].level).push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: segment.map((k) => [k.lon, k.lat]),
        },
        properties: { route: true, level: segment[0].level },
      });
    }
  };
  for (let i = 1; i < pfad.knoten.length; i++) {
    const knoten = pfad.knoten[i];
    if (knoten.level === segment[segment.length - 1].level) {
      segment.push(knoten);
    } else {
      schliesseSegment();
      segment = [knoten];
    }
  }
  schliesseSegment();

  const start = pfad.knoten[0];
  const ziel = pfad.knoten[pfad.knoten.length - 1];
  featuresFuer(start.level).push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [start.lon, start.lat] },
    properties: { rolle: 'start', gleis: start.gleis ?? null, level: start.level },
  });
  featuresFuer(ziel.level).push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [ziel.lon, ziel.lat] },
    properties: { rolle: 'ziel', gleis: ziel.gleis ?? null, level: ziel.level },
  });

  const ergebnis: Record<string, { type: 'FeatureCollection'; features: GeoFeature[] }> = {};
  for (const [level, features] of proEbene) {
    ergebnis[String(level)] = { type: 'FeatureCollection', features };
  }
  return ergebnis;
}
