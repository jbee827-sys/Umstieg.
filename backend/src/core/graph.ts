import { erreichbareGleisPaare } from './klassifikation.js';
import { gleichesGleis, normGleis } from './gleisname.js';
import { mittlereAchse, nachNordwesten, peilungGrad, richteEndenAus } from './richtung.js';
import { mittellinie } from './mittellinie.js';
import type {
  GraphKante,
  GraphKnoten,
  GraphKontext,
  KantenTyp,
  OsmElement,
  OverpassAntwort,
  RoutenPfad,
  StationGraph,
  StationsInfo,
  UbahnSteig,
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
 * Wie nah ein Knoten am UMRISS eines Bahnsteigs liegen muss, um zu ihm zu
 * gehoeren: eine halbe Bahnsteigbreite.
 *
 * Bis zum 02.11.2026 waren es 12 m um eine Gerade von Ende zu Ende. Im Bogen
 * lag diese Gerade neben dem Bahnsteig, und 3655 Routen fuehrten ueber Gleise -
 * Koeln Hbf 8 -> 10 in 44 s. Am Umriss gemessen ist die Bogenform egal. Gemessen
 * ueber alle 382 Bahnhoefe sind 6 m besser als 8 m.
 */
const BAHNSTEIG_FLAECHE_M = 6;

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

/**
 * Die Mitte eines Bahnsteigs: die Sehnenmitte, wenn sie auf ihm liegt, sonst der
 * naechste Punkt seines Umrisses.
 *
 * Im Bogen liegt die Sehnenmitte neben dem Bahnsteig - an Berlin Hbf fuer Gleis
 * 13/14 23 m neben dem eigenen und 1,6 m neben dem Nachbarbahnsteig. Jeder Weg ab
 * „Bahnsteigmitte“ begann so auf der falschen Seite der Gleise.
 */
function mitteAufDemBahnsteig(
  mitte: { lat: number; lon: number },
  nodeListen: number[][],
  osmKnoten: Map<number, OsmElement>,
): { lat: number; lon: number } {
  if (abstandZumUmriss(mitte, nodeListen, osmKnoten) <= BAHNSTEIG_FLAECHE_M) return mitte;
  const mLat = 111_320;
  const mLon = mLat * Math.cos((mitte.lat * Math.PI) / 180);
  let beste = mitte;
  let min = Number.POSITIVE_INFINITY;
  for (const liste of nodeListen) {
    for (let i = 0; i < liste.length - 1; i++) {
      const a = osmKnoten.get(liste[i]);
      const b = osmKnoten.get(liste[i + 1]);
      if (a?.lat === undefined || b?.lat === undefined) continue;
      const ax = (a.lon! - mitte.lon) * mLon;
      const ay = (a.lat - mitte.lat) * mLat;
      const dx = (b.lon! - mitte.lon) * mLon - ax;
      const dy = (b.lat - mitte.lat) * mLat - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      const [x, y] = [ax + t * dx, ay + t * dy];
      const d = Math.hypot(x, y);
      if (d < min) {
        min = d;
        beste = { lat: mitte.lat + y / mLat, lon: mitte.lon + x / mLon };
      }
    }
  }
  return beste;
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

/** Ebenen an Anfang und Ende eines Ebenenwechsels; ohne zwei Ebenen im Tag nichts Belegtes. */
function ebenenDerEnden(tags: Record<string, string>): [number, number] | null {
  const levels = parseLevels(tags.level);
  if (levels.length < 2) return null;
  const [lo, hi] = [levels[0], levels[levels.length - 1]];
  return tags.incline === 'down' ? [hi, lo] : [lo, hi];
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

/**
 * Darf hier niemand gehen? `access=no` und `private` sperren den Weg, ein
 * ausdruecklich erlaubendes `foot` hebt das auf (Wirtschaftswege mit Fussweg).
 * `destination` und `customers` bleiben offen: Wer zum Zug will, ist Kunde.
 *
 * Das sperrt auch stufenfreie Wege, und das zu Recht: In Ansbach und Fuerth
 * fuehrten sie ueber einen „betrieblichen Ueberweg“, also ueber die Gleise auf
 * einem Dienstweg. „Keine barrierefreie Route“ ist dort die wahre Auskunft.
 *
 * Gesiebt wird beim Graphbau und nicht in der Abfrage, damit der Bestand gilt.
 * Der Bahnsteig selbst bleibt: Der Fahrplan nennt sein Gleis, auch wenn OSM ihn
 * gerade als gesperrt fuehrt.
 */
function istGesperrterWeg(el: OsmElement): boolean {
  if (el.type !== 'way') return false;
  const tags = el.tags ?? {};
  if (tags.railway || (!istEbenerWeg(tags) && !istEbenenwechselWeg(tags))) return false;
  if (tags.access !== 'no' && tags.access !== 'private') return false;
  return tags.foot !== 'yes' && tags.foot !== 'designated' && tags.foot !== 'permissive';
}

/**
 * Der Bahnhofsgraph aus OSM, auf Wunsch mit der DB-Gleisliste als zweiter Quelle.
 *
 * `kontext` sagt, ob diese Liste vollstaendig ist (`gleislisteUnvollstaendig`)
 * und welche Verkehrsstellen nur S-Bahn anbieten. Fehlt er, gilt die Liste als
 * unvollstaendig: Aus ihr wird dann nichts geschlossen, was ein fehlender
 * Eintrag belegen muesste (Spec 6.2, 6.3).
 */
export function baueGraph(
  osmRoh: OverpassAntwort,
  dbGleise?: StationsInfo['gleise'],
  kontext?: GraphKontext,
): StationGraph {
  const osm = { ...osmRoh, elements: osmRoh.elements.filter((el) => !istGesperrterWeg(el)) };
  const graph = baueGraphOhneNaht(osm, dbGleise, kontext);
  const vorher = erreichbareGleisPaare(graph);
  if (vorher === 1) return graph;
  const elements = vererbeEbenen(osm.elements);
  const mitNaht = baueGraphOhneNaht({ ...osm, elements }, dbGleise, kontext);
  zieheNaehte(mitNaht, elements);
  zieheTreppenenden(mitNaht, elements);
  schliesseLueckenAmTreppenfuss(mitNaht, elements);
  return erreichbareGleisPaare(mitNaht) > vorher ? mitNaht : graph;
}

/**
 * Die belegten Ebenen je OSM-Punkt – geraten zaehlt nicht.
 *
 * Grundlage der Naht (Stuttgart Hbf, gemeldet 02.11.2026): Der Baustellensteg
 * traegt `level=1`, seine Fortsetzung gar keines und gilt damit als Ebene 0.
 * Derselbe OSM-Punkt wurde zu zwei Knoten ohne Kante dazwischen, und 99 von 156
 * Abfahrten (S-Bahn, Gleis 101/102) hingen an keinem Weg mehr.
 */
function belegteEbenen(elemente: OsmElement[]): Map<number, Set<number>> {
  const belegt = new Map<number, Set<number>>();
  const merke = (id: number, ebene: number): void => {
    if (!belegt.has(id)) belegt.set(id, new Set());
    belegt.get(id)!.add(ebene);
  };
  for (const el of elemente) {
    if (el.type !== 'way' || !el.nodes) continue;
    const tags = el.tags ?? {};
    if (istEbenenwechselWeg(tags)) {
      const enden = ebenenDerEnden(tags);
      if (enden) {
        merke(el.nodes[0], enden[0]);
        merke(el.nodes[el.nodes.length - 1], enden[1]);
      }
    } else if (istEbenerWeg(tags) || tags.railway === 'platform' || tags.railway === 'platform_edge') {
      const { ebene, ebeneBelegt } = wayEbeneMitBeleg(tags);
      if (ebeneBelegt) for (const id of el.nodes) merke(id, ebene);
    }
  }
  return belegt;
}

function hatGeratenenWeg(el: OsmElement): el is OsmElement & { nodes: number[] } {
  if (el.type !== 'way' || !el.nodes) return false;
  const tags = el.tags ?? {};
  return istEbenerWeg(tags) && !istEbenenwechselWeg(tags) && !wayEbeneMitBeleg(tags).ebeneBelegt;
}

/**
 * Ein erratener Weg, der nur eine einzige belegte Ebene beruehrt, liegt auf ihr.
 *
 * Ohne diesen Schritt hiesse ein 4-m-Stueck zwischen zwei Abschnitten des
 * Querbahnsteigs „Rampe hinunter zur Ebene 0, Rampe hoch zur Ebene 1“. Bewusst
 * nur ein Schritt weit: Weitergereicht hinge bald das ganze Strassennetz an
 * Ebene 1, und die Treppen hinab endeten im Nichts. Die Eingabe bleibt
 * unveraendert, sie liegt im Bestand und wird wiederverwendet.
 */
function vererbeEbenen(elemente: OsmElement[]): OsmElement[] {
  const belegt = belegteEbenen(elemente);
  return elemente.map((el) => {
    if (!hatGeratenenWeg(el)) return el;
    const ebenen = new Set(el.nodes.flatMap((id) => [...(belegt.get(id) ?? [])]));
    if (ebenen.size !== 1) return el;
    const [ebene] = ebenen;
    return ebene === 0 ? el : { ...el, tags: { ...el.tags, level: String(ebene) } };
  });
}

/**
 * Verbindet am gemeinsamen OSM-Punkt, was nur eine Vermutung getrennt hat.
 *
 * Zwei Wege an einem Punkt sind in OSM verbunden. Sonst wuerde er nicht geteilt.
 * Zur Rampe wird das, weil sich die Ebene ohne Treppe aendert – am Steg, der zur
 * Strasse hinabfuehrt, stimmt das woertlich.
 *
 * **Die Regel ist bewusst schmal**, gemessen an allen 382 Bahnhoefen des
 * Bestands. Ueberall angewandt verkuerzte sie Routen auch dort, wo alle Gleise
 * laengst verbunden sind (Potsdam Hbf 1 -> 6: 317 s auf 149 s). Deshalb nur, wo
 * sie Gleise verbindet, die sonst getrennt blieben (siehe `baueGraph`). Zwei
 * belegte Ebenen an einem Punkt bleiben getrennt, und der Aufzugknoten bleibt
 * Aufzug (Pass C).
 */
function zieheNaehte(graph: StationGraph, elemente: OsmElement[]): void {
  const belegt = belegteEbenen(elemente);
  const aufzuege = new Set(
    elemente.filter((el) => el.type === 'node' && el.tags?.highway === 'elevator').map((el) => el.id),
  );
  const gezogen = new Set<string>();
  for (const el of elemente) {
    if (!hatGeratenenWeg(el)) continue;
    for (const id of el.nodes) {
      if (aufzuege.has(id)) continue;
      for (const ebene of belegt.get(id) ?? []) {
        const von = knotenId(id, 0);
        const nach = knotenId(id, ebene);
        if (ebene === 0 || gezogen.has(nach) || !graph.knoten.has(von) || !graph.knoten.has(nach)) continue;
        gezogen.add(nach);
        const kante: GraphKante = { von, nach, laengeM: 0, deltaLevel: ebene, typ: 'rampe', barrierefrei: true };
        for (const ende of [von, nach]) {
          if (!graph.adjazenz.has(ende)) graph.adjazenz.set(ende, []);
          graph.adjazenz.get(ende)!.push(kante);
        }
      }
    }
  }
}

/** Die zusammenhaengenden Teile des Graphen, mit Zusammenlegen fuer neue Kanten. */
function inselnVon(graph: StationGraph): {
  wurzel: (id: string) => string;
  verbinde: (a: string, b: string) => void;
} {
  const eltern = new Map<string, string>();
  const wurzel = (id: string): string => {
    let w = id;
    while (eltern.has(w)) w = eltern.get(w)!;
    return w;
  };
  const verbinde = (a: string, b: string): void => {
    const [x, y] = [wurzel(a), wurzel(b)];
    if (x !== y) eltern.set(x, y);
  };
  for (const liste of graph.adjazenz.values()) {
    for (const k of liste) verbinde(k.von, k.nach);
  }
  return { wurzel, verbinde };
}

/**
 * Das Ende einer Treppe oder Rolltreppe ist ein Ort, auch wenn
 * sich die Ebenen dort widersprechen.
 *
 * In Duesseldorf und Frankfurt-Hoechst sagt die Treppe `level=0;1`, die Passage an
 * ihrem Fuss `level=-1`, und der geteilte OSM-Punkt wird zu zwei Knoten ohne Kante.
 * Anders als mitten im Weg ist das hier kein Hinweis auf zwei Stockwerke: Wer die
 * Treppe hinabsteigt, steht in dieser Passage. Verbunden wird nur, was noch getrennt
 * ist, und nie stufenfrei.
 *
 * Aufzug-Wege nicht mehr (03.11.2026): Bis dahin legte die Naht an ihren Enden eine
 * stufenfreie Rampe der Laenge 0 - eine Aufzugfahrt, die nichts kostete und keinen
 * Schritt hatte. Seitdem ist jede Instanz ihrer Enden ein Halt des Schachts
 * (Pass C in `baueGraphOhneNaht`), und die Fahrt dorthin ist eine Aufzugkante.
 */
function zieheTreppenenden(graph: StationGraph, elemente: OsmElement[]): void {
  const { wurzel, verbinde } = inselnVon(graph);
  const instanzen = new Map<number, GraphKnoten[]>();
  for (const k of graph.knoten.values()) {
    const m = k.id.match(/^n(\d+)@/);
    if (!m) continue;
    const id = Number(m[1]);
    if (!instanzen.has(id)) instanzen.set(id, []);
    instanzen.get(id)!.push(k);
  }
  for (const el of elemente) {
    if (el.type !== 'way' || !el.nodes || !istEbenenwechselWeg(el.tags ?? {})) continue;
    if (el.tags?.highway === 'elevator') continue;
    for (const id of [el.nodes[0], el.nodes[el.nodes.length - 1]]) {
      const hier = [...(instanzen.get(id) ?? [])].sort((a, b) => a.level - b.level);
      for (let i = 0; i < hier.length - 1; i++) {
        if (wurzel(hier[i].id) === wurzel(hier[i + 1].id)) continue;
        verbinde(hier[i].id, hier[i + 1].id);
        const kante: GraphKante = {
          von: hier[i].id,
          nach: hier[i + 1].id,
          laengeM: 0,
          deltaLevel: hier[i + 1].level - hier[i].level,
          typ: 'rampe',
          barrierefrei: false,
        };
        for (const ende of [kante.von, kante.nach]) {
          if (!graph.adjazenz.has(ende)) graph.adjazenz.set(ende, []);
          graph.adjazenz.get(ende)!.push(kante);
        }
      }
    }
  }
}

/**
 * Wie weit ein Treppenfuss neben einem Weg liegen darf, um als dessen Ende zu gelten.
 * Kein gemessener Wert: In Duesseldorf sind es 2 bis 5 m. Ueber alle 382 Bahnhoefe
 * bringt die Grenze 78 Gleispaare zurueck und keine neue Kreuzung.
 */
const LUECKE_MAX_M = 5;

/**
 * Schliesst die Luecke zwischen einem Treppenfuss und dem Weg daneben.
 *
 * In Duesseldorf endet die Treppe von Gleis 9 auf Ebene 0, 3 m neben dem Fussweg der
 * Passage auf Ebene -1: Getrennt gezeichnet, gemeint ist derselbe Gang. Ohne die
 * Kanten, die frueher quer ueber die Gleise fuehrten, fehlte damit jeder Weg.
 *
 * **Bewusst schmal.** Nur Treppenenden, die nicht auf einem Bahnsteig liegen, und nur
 * zu Wegen, die es auch nicht tun: So kann die Kante kein Gleis ueberspringen. Nur
 * zwischen Teilen mit Gleisen, und jeder Teil nur einmal. Nicht stufenfrei, denn
 * eine geratene Verbindung sagt nichts ueber Stufen.
 */
function schliesseLueckenAmTreppenfuss(graph: StationGraph, elemente: OsmElement[]): void {
  const { wurzel, verbinde } = inselnVon(graph);
  const relationsWege = new Set<number>();
  for (const el of elemente) {
    if (el.type === 'relation' && el.tags?.railway === 'platform') {
      for (const m of el.members ?? []) if (m.type === 'way') relationsWege.add(m.ref);
    }
  }
  const aufBahnsteig = new Set<number>();
  for (const el of elemente) {
    if (el.type !== 'way') continue;
    if (relationsWege.has(el.id) || el.tags?.railway === 'platform' || el.tags?.railway === 'platform_edge') {
      for (const n of el.nodes ?? []) aufBahnsteig.add(n);
    }
  }
  const osmIdVon = (id: string): number => Number(id.slice(1, id.indexOf('@')));
  const frei = [...graph.knoten.values()].filter((k) => k.id.startsWith('n') && !aufBahnsteig.has(osmIdVon(k.id)));
  // Ein U-Bahn-Steig zaehlt hier wie ein Gleis: Er ist ein Bahnsteig, zu dem
  // die Bahnhofsseite Wege rechnet (Spec 6.2).
  const mitGleis = new Set<string>();
  for (const k of graph.knoten.values()) if (k.gleis || k.ubahnSteig) mitGleis.add(wurzel(k.id));
  for (const el of elemente) {
    if (el.type !== 'way' || !el.nodes || !istEbenenwechselWeg(el.tags ?? {})) continue;
    for (const id of [el.nodes[0], el.nodes[el.nodes.length - 1]]) {
      if (aufBahnsteig.has(id)) continue;
      for (const k of graph.knoten.values()) {
        if (!k.id.startsWith('n' + id + '@') || !mitGleis.has(wurzel(k.id))) continue;
        let bester: GraphKnoten | null = null;
        let abstand = LUECKE_MAX_M;
        for (const f of frei) {
          if (wurzel(f.id) === wurzel(k.id) || !mitGleis.has(wurzel(f.id))) continue;
          if (Math.abs(f.level - k.level) > 2) continue;
          const d = haversineM(k.lat, k.lon, f.lat, f.lon);
          if (d <= abstand) {
            abstand = d;
            bester = f;
          }
        }
        if (!bester) continue;
        verbinde(k.id, bester.id);
        const kante: GraphKante = {
          von: k.id,
          nach: bester.id,
          laengeM: abstand,
          deltaLevel: bester.level - k.level,
          typ: bester.level === k.level ? 'eben' : 'rampe',
          barrierefrei: false,
        };
        for (const ende of [kante.von, kante.nach]) {
          if (!graph.adjazenz.has(ende)) graph.adjazenz.set(ende, []);
          graph.adjazenz.get(ende)!.push(kante);
        }
      }
    }
  }
}

function baueGraphOhneNaht(
  osm: OverpassAntwort,
  dbGleise?: StationsInfo['gleise'],
  kontext?: GraphKontext,
): StationGraph {
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
  // Aufzug-Ways nur vorgemerkt: Ihre Kanten zieht Pass C, als Schacht.
  const aufzugWege: { way: OsmElement; vonId: string; nachId: string; laengeM: number }[] = [];
  for (const way of ways) {
    const tags = way.tags ?? {};
    if (!istEbenenwechselWeg(tags)) continue;

    const ersterOsm = way.nodes![0];
    const letzterOsm = way.nodes![way.nodes!.length - 1];

    // Ebenen bestimmen: explizites level-Tag hat Vorrang (incline gibt die
    // Richtung), sonst bereits bekannte Instanz-Ebenen der Endknoten.
    const levels = parseLevels(tags.level);
    const enden = ebenenDerEnden(tags);
    let ebeneErster: number;
    let ebeneLetzter: number;
    if (enden) {
      [ebeneErster, ebeneLetzter] = enden;
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
    if (typ === 'aufzug') {
      aufzugWege.push({ way, vonId, nachId, laengeM: laenge });
      continue;
    }
    fuegeKanteHinzu({
      von: vonId,
      nach: nachId,
      laengeM: laenge,
      deltaLevel: ebeneLetzter - ebeneErster,
      typ,
      barrierefrei: istBarrierefrei(typ, tags),
      anlageSchluessel: `w${way.id}`,
    });
  }

  /**
   * Ein Aufzug ist ein Schacht: Jedes Paar seiner Halte ist direkt verbunden,
   * eine Fahrt ist eine Kante und ein Schritt.
   *
   * Bis zum 03.11.2026 war ein Aufzug ueber mehrere Ebenen eine Kette von
   * Kanten zwischen Nachbarebenen. Berlin Hbf 2 -> 12 fuhr so von -2 nach 0 in
   * zwei Kanten, und die Anleitung sagte „Aufzug zur Unterführung (-1)“, „Aufzug
   * zur Ebene 0“ - ein Halt, an dem niemand aussteigt. Die Zeit einer Fahrt
   * haengt am ganzen Schacht (`zuschlagSekunden`): Die Spanne kommt aus dem
   * `level`-Tag, auch mit Ebenen, an denen kein Weg anschliesst - die Kabine
   * faehrt den ganzen Schacht. Nennt der Tag weniger als zwei Ebenen, gelten
   * die Halte. Verbunden wird nur, wo ein Knoten existiert; ein Aufzug mit nur
   * einem Halt bekommt keine Kante.
   */
  function verbindeSchacht(
    anlageSchluessel: string,
    halte: string[],
    tag: string | undefined,
    barrierefrei: boolean,
    laengeM: (a: GraphKnoten, b: GraphKnoten) => number,
    /** Ein Paar, das auch auf gleicher Ebene verbunden bleibt (Aufzug-Way ohne Ebenen). */
    paar?: [string, string],
  ): void {
    const knotenListe = [...new Set(halte)]
      .map((id) => knoten.get(id)!)
      .sort((a, b) => a.level - b.level);
    if (knotenListe.length < 2) return;
    const tagEbenen = parseLevels(tag);
    const ebenen = tagEbenen.length >= 2 ? tagEbenen : knotenListe.map((k) => k.level);
    // Die Kabine faehrt mindestens so weit, wie der Tag sagt, und mindestens
    // bis zum entferntesten Halt. Vom 03.11.2026 an gilt der groessere Wert:
    // Sagt der Tag `0;1`, steht aber am Fuss ein Halt auf -1 (Aufzug-Way, dessen
    // Gang davor `level=-1` traegt), ist die Fahrt -1 -> 1 zwei Ebenen lang. Mit
    // der Tag-Spanne 1 waere sie billiger als ihre Strecke - Warten und Fahrt
    // rechneten eine Ebene zu wenig.
    const haltEbenen = knotenListe.map((k) => k.level);
    const schachtSpanne = Math.max(
      Math.max(...ebenen) - Math.min(...ebenen),
      Math.max(...haltEbenen) - Math.min(...haltEbenen),
    );
    for (let i = 0; i < knotenListe.length; i++) {
      for (let j = i + 1; j < knotenListe.length; j++) {
        const [a, b] = [knotenListe[i], knotenListe[j]];
        const istPaar = paar !== undefined && paar.includes(a.id) && paar.includes(b.id);
        if (a.level === b.level && !istPaar) continue;
        fuegeKanteHinzu({
          von: a.id,
          nach: b.id,
          laengeM: laengeM(a, b),
          deltaLevel: b.level - a.level,
          typ: 'aufzug',
          barrierefrei,
          schachtSpanne,
          anlageSchluessel,
        });
      }
    }
  }

  // --- Pass C: Aufzuege als Schacht ---
  // Aufzug-Knoten (highway=elevator als Node): Halte sind alle Ebenen-Instanzen
  // desselben OSM-Knotens.
  for (const [osmId, ebenen] of instanzEbenen) {
    const osmNode = osmKnoten.get(osmId);
    if (osmNode?.tags?.highway !== 'elevator') continue;
    verbindeSchacht(
      `n${osmId}`,
      [...ebenen].map((ebene) => knotenId(osmId, ebene)),
      osmNode.tags.level,
      osmNode.tags.wheelchair !== 'no',
      () => 0,
    );
  }
  // Aufzug-Ways: Halte sind alle Instanzen ihres Anfangs- und Endpunkts - wie
  // bei Treppen zaehlen nur die Enden. Widerspricht der Weg am Fuss dem Tag
  // (`level=0;1`, der Gang davor `level=-1`), wird auch dieser Knoten ein Halt:
  // So faehrt man Aufzug, statt ueber die kostenlose Rampe, die
  // `zieheTreppenenden` dort frueher legte.
  const osmTeil = (k: GraphKnoten): string => k.id.slice(0, k.id.indexOf('@'));
  for (const { way, vonId, nachId, laengeM } of aufzugWege) {
    const tags = way.tags ?? {};
    const enden = [way.nodes![0], way.nodes![way.nodes!.length - 1]];
    const halte = enden.flatMap((osmId) =>
      [...(instanzEbenen.get(osmId) ?? [])].map((ebene) => knotenId(osmId, ebene)),
    );
    // Ohne Ebenen im Tag landen beide Enden mitunter auf derselben Ebene. Die
    // Kante zwischen ihnen gab es schon vorher; sie bleibt, damit der Weg nicht
    // abreisst.
    verbindeSchacht(
      `w${way.id}`,
      halte,
      tags.level,
      istBarrierefrei('aufzug', tags),
      (a, b) => (osmTeil(a) === osmTeil(b) ? 0 : laengeM),
      [vonId, nachId],
    );
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

  /**
   * Ein U-Bahn-Steig, der sich selbst so ausweist (Spec 6.2): `subway=yes` ohne
   * `train=yes`. Muenchen Hbf 51–56, Hamburg Hbf „Hauptbahnhof Süd“ 1;2 – im
   * DB-Fahrplan gibt es sie nicht, ihre Nummern stossen aber mit DB-Gleisen
   * zusammen. Mit `train=yes` haelt dort auch die S-Bahn (Konstablerwache).
   */
  function istUbahnsteig(tags: Record<string, string>): boolean {
    return tags.subway === 'yes' && tags.train !== 'yes';
  }

  /**
   * Stadtbahn unter der Erde: `light_rail=yes` ohne `train=yes`, und `level` < 0,
   * `tunnel=yes` oder `location=underground`. Bielefeld „Hauptbahnhof (U)“ 1–4,
   * Duesseldorf 1;3 / 2;4. U-Bahn ist sie erst, wenn die DB dort kein Gleis
   * fuehrt – die Berliner S-Bahn im Tunnel traegt dieselben Tags.
   */
  function istStadtbahnUnterDerErde(tags: Record<string, string>): boolean {
    if (tags.light_rail !== 'yes' || tags.train === 'yes') return false;
    const unten = parseLevels(tags.level).some((l) => l < 0);
    return unten || tags.tunnel === 'yes' || tags.location === 'underground';
  }

  /**
   * Die Linien eines Bahnsteigs: `route_ref` („S3;S5“) und die Linienkuerzel der
   * `description` („Hauptbahnhof (Tief) S1 S2 S3 S4 S6 S7 S8 Bahnsteig“).
   */
  function linienVon(tags: Record<string, string>): string[] {
    const route = (tags.route_ref ?? '').split(/[;,]/).map((l) => l.replace(/\s+/g, '')).filter(Boolean);
    const beschreibung = (tags.description ?? '').split(/[\s,;/+()]+/).filter((t) => /^[A-Z]{1,3}\d+$/.test(t));
    return [...route, ...beschreibung];
  }

  /** „U1 U2 U7 U8“ aus `route_ref` oder `description`, sonst „U-Bahn-Steig 51/53“. */
  function ubahnLabel(tags: Record<string, string>, refs: string[]): string {
    const route = (tags.route_ref ?? '').split(/[;,]/).map((l) => l.trim()).filter(Boolean);
    if (route.length > 0) return route.join(' ');
    const linien = (tags.description ?? '').match(/\bU\d+\b/g);
    if (linien) return [...new Set(linien)].join(' ');
    return `U-Bahn-Steig ${refs.join('/')}`;
  }

  /** Faellt die DB-Kennung `kennung` auf einen Bahnsteig mit diesen Kennungen – exakt oder als Bereich? */
  const passtKennung = (eigene: string[], kennung: string): boolean =>
    eigene.some((k) => k === kennung || kennung.startsWith(`${k}:`));

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
  //
  // Seit dem 04.11.2026 (Spec 6.3) ersetzen die DB-Namen die OSM-Nummern, die
  // die DB an diesem Bahnhof nicht fuehrt: OSM nennt die Muenchner S-Bahn tief
  // „81;82“, die DB „1“ und „2“ – bis dahin standen alle vier in der Liste.
  // Nur mit vollstaendiger Liste: Was ein ausgefallenes Mitglied fuehrt, weiss
  // sonst niemand. U-Bahn-Steige nehmen kein DB-Gleis auf.
  const vollstaendig = kontext?.gleislisteVollstaendig === true && (dbGleise?.length ?? 0) > 0;
  const dbNamen = new Set((dbGleise ?? []).map((g) => normGleis(g.gleis)));
  const ubahn = new Set(bahnsteige.filter((b) => istUbahnsteig(b.tags)));
  if (dbGleise) {
    const bekannt = new Set(bahnsteige.filter((b) => !ubahn.has(b)).flatMap((b) => b.refs.map(normGleis)));
    const alle = [...bahnsteige, ...strassenbahnsteige].filter((b) => !ubahn.has(b));
    const vonDb = new Map<BahnsteigDaten, Set<string>>();
    for (const g of dbGleise) {
      const kennung = g.ris?.ifopt;
      if (!kennung || bekannt.has(normGleis(g.gleis)) || g.ris?.parentPlatform) continue;
      const exakt = alle.filter((b) => (kennungen.get(b) ?? []).includes(kennung));
      const bereich = alle.filter((b) => (kennungen.get(b) ?? []).some((k) => kennung.startsWith(`${k}:`)));
      const treffer = exakt.length > 0 ? exakt : bereich;
      if (treffer.length !== 1) continue;
      const ziel = treffer[0];
      ziel.refs.push(g.gleis);
      if (!bahnsteige.includes(ziel)) bahnsteige.push(ziel);
      bekannt.add(normGleis(g.gleis));
      if (!vonDb.has(ziel)) vonDb.set(ziel, new Set());
      vonDb.get(ziel)!.add(g.gleis);
    }
    if (vollstaendig) {
      for (const [bahnsteig, neu] of vonDb) {
        bahnsteig.refs = bahnsteig.refs.filter((r) => neu.has(r) || dbNamen.has(normGleis(r)));
      }
    }
  }

  // --- U-Bahn: unterirdische Stadtbahn ohne DB-Gleis (Spec 6.2) ---
  //
  // Faellt per Kennung oder Namen ein DB-Gleis auf den Bahnsteig, bleibt er
  // Gleis (Berliner S-Bahn im Tunnel). Per Namen nur, wenn kein anderer
  // Bahnsteig dieselbe Nummer traegt: In Bielefeld liegt DB-Gleis 1 oben, die
  // Stadtbahn darunter heisst nur zufaellig auch 1. Ohne vollstaendige Liste
  // bleibt die Stadtbahn, wie sie war – aus Fehlendem wird nichts geschlossen.
  if (vollstaendig) {
    const kandidaten = bahnsteige.filter((b) => !ubahn.has(b) && istStadtbahnUnterDerErde(b.tags));
    const andereNummern = new Set(
      bahnsteige.filter((b) => !ubahn.has(b) && !kandidaten.includes(b)).flatMap((b) => b.refs.map(normGleis)),
    );
    for (const b of kandidaten) {
      const perKennung = dbGleise!.some((g) => g.ris?.ifopt && passtKennung(kennungen.get(b) ?? [], g.ris.ifopt));
      const perName = b.refs.some((r) => dbNamen.has(normGleis(r)) && !andereNummern.has(normGleis(r)));
      if (!perKennung && !perName) ubahn.add(b);
    }
  }

  /**
   * S-Bahn, eng erkannt (Spec 6.2): Der OSM-Bahnsteig weist sich nur als S-Bahn
   * aus – Linien ausschliesslich „S…“, oder `light_rail=yes` ohne `train=yes`
   * an einem Gleis, das die DB fuehrt (Berliner S-Bahn). Im Zweifel: Zuege.
   */
  const istSbahnsteig = (b: BahnsteigDaten): boolean => {
    const linien = linienVon(b.tags);
    if (linien.length > 0 && linien.every((l) => /^S\d+$/.test(l))) return true;
    if (b.tags.light_rail !== 'yes' || b.tags.train === 'yes' || !dbGleise) return false;
    return (
      b.refs.some((r) => dbNamen.has(normGleis(r))) ||
      dbGleise.some((g) => g.ris?.ifopt && passtKennung(kennungen.get(b) ?? [], g.ris.ifopt))
    );
  };
  /** Die DB fuehrt das Gleis nur unter Verkehrsstellen, die nur S-Bahn anbieten (Muenchen Hbf (tief)). */
  const sbahnEvas = new Set(kontext?.sbahnEvas ?? []);
  const nurSbahnVerkehrsstelle = (gleis: string): boolean => {
    if (!vollstaendig || sbahnEvas.size === 0) return false;
    const evas = dbGleise!.find((g) => gleichesGleis(g.gleis, gleis))?.evas ?? [];
    return evas.length > 0 && evas.every((e) => sbahnEvas.has(e));
  };

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
    if (ubahn.has(bahnsteig)) continue; // kein Gleis, siehe oben
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

  // Die Mittellinie je Bahnsteig fuer das Schema (Spec 6.4): Saarbruecken hat
  // gebogene Bahnsteige verschiedener Laenge, und die Sehne von Ende zu Ende
  // liegt dort bis zu 37 m neben dem Bahnsteig. Eine Relation gibt ihre
  // aeusseren Glieder einzeln weiter, ein Weg sich selbst.
  const bahnsteigLinien = new Map<string, { lat: number; lon: number }[]>();
  for (const bahnsteig of endenJeBahnsteig.keys()) {
    const teile = bahnsteig.nodeListen.map((liste) =>
      liste
        .map((id) => osmKnoten.get(id))
        .filter((n): n is Lagepunkt => n?.lat !== undefined && n?.lon !== undefined)
        .map((n) => ({ lat: n.lat, lon: n.lon })),
    );
    const linie = mittellinie(bahnsteig.bahnsteigId.startsWith('r') ? teile : teile[0]);
    if (linie.length > 0) bahnsteigLinien.set(bahnsteig.bahnsteigId, linie);
  }

  // Wessen Umriss ein Knoten ist. Ein Punkt kann mehreren Bahnsteigen gehoeren,
  // wenn sie sich beruehren; dann gilt er auch fuer jeden von ihnen als eigener.
  const umrissVon = new Map<string, Set<BahnsteigDaten>>();
  for (const bahnsteig of bahnsteige) {
    for (const id of bahnsteig.nodeListen.flat()) {
      const schluessel = knotenId(id, bahnsteig.ebene);
      if (!umrissVon.has(schluessel)) umrissVon.set(schluessel, new Set());
      umrissVon.get(schluessel)!.add(bahnsteig);
    }
  }

  /**
   * Zu welchem Bahnsteig ein Knoten gehoert: Wer auf einem Umriss liegt, zu
   * diesem, sonst zum naechsten der Ebene innerhalb `BAHNSTEIG_FLAECHE_M`. Das ist
   * die eine Regel gegen Wege ueber Gleise: Geratene Kanten gibt es nur innerhalb
   * eines Bahnsteigs, verlassen wird er nur ueber echte OSM-Wege.
   */
  const zugehoerigkeit = new Map<string, ReadonlySet<string>>();
  const bahnsteigVon = (k: GraphKnoten): ReadonlySet<string> => {
    const bekannt = zugehoerigkeit.get(k.id);
    if (bekannt) return bekannt;
    const ids = new Set<string>();
    const umriss = umrissVon.get(k.id);
    if (umriss) {
      for (const b of umriss) ids.add(b.bahnsteigId);
    } else {
      let naechster: BahnsteigDaten | null = null;
      let abstand = BAHNSTEIG_FLAECHE_M;
      for (const b of bahnsteige) {
        if (b.ebene !== k.level) continue;
        const d = abstandZumUmriss(k, b.nodeListen, osmKnoten);
        if (d <= abstand) {
          abstand = d;
          naechster = b;
        }
      }
      if (naechster) ids.add(naechster.bahnsteigId);
    }
    zugehoerigkeit.set(k.id, ids);
    return ids;
  };

  const gleisSet = new Set<string>();
  const ubahnSteige: UbahnSteig[] = [];
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
    const { lat: mitteLat, lon: mitteLon } = mitteAufDemBahnsteig(
      { lat: (endeA.lat + endeB.lat) / 2, lon: (endeA.lon + endeB.lon) / 2 },
      nodeListen,
      osmKnoten,
    );

    // Je Gleis eine Kette `gleisN:anfang|mitte|ende`; ein U-Bahn-Steig bekommt
    // eine einzige, `ubahn<id>:…`, ohne Gleis - routbar, aber nicht waehlbar.
    const ketten: { praefix: string; merkmal: Pick<GraphKnoten, 'gleis' | 'ubahnSteig'> }[] = [];
    if (ubahn.has(bahnsteig)) {
      ketten.push({ praefix: `ubahn${bahnsteigId}`, merkmal: { ubahnSteig: bahnsteigId } });
      ubahnSteige.push({
        id: bahnsteigId,
        label: ubahnLabel(tags, refs),
        ...(tags.name ? { name: tags.name } : {}),
      });
    } else {
      for (const gleis of refs) {
        gleisSet.add(gleis);
        // Ein anderer Bahnsteig ist die bessere Quelle fuer diese Nummer. Der
        // Umriss oben bleibt trotzdem begehbar – er ist echte Geometrie.
        if (quelleFuerGleis.get(gleis) === bahnsteig) ketten.push({ praefix: `gleis${gleis}`, merkmal: { gleis } });
      }
    }

    for (const { praefix, merkmal } of ketten) {
      const lagen: [string, number, number][] = [
        ['anfang', endeA.lat, endeA.lon],
        ['mitte', mitteLat, mitteLon],
        ['ende', endeB.lat, endeB.lon],
      ];
      let vorherigeId: string | null = null;
      for (const [abschnitt, lat, lon] of lagen) {
        const id = `${praefix}:${abschnitt}`;
        if (!knoten.has(id)) {
          knoten.set(id, { id, lat, lon, level: ebene, ...merkmal, abschnitt, bahnsteigId });
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
        const syntId = `${praefix}:${abschnitt}`;
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
        // Nie auf einen anderen Bahnsteig: Dazwischen liegt ein Gleis. In Stuttgart
        // liegt die Mitte von Gleis 3/4 22 m von der Kante von Gleis 2, aber 31 m
        // vom eigenen Knoten - 1 -> 3 lief so in 86 s ueber die Gleise statt in
        // 379 s ueber den Querbahnsteig. Auch dann nicht, wenn es die einzige
        // Verbindung waere: Die Kette haelt den Punkt ohnehin am eigenen Bahnsteig,
        // und fehlt der Weg im Kartenmaterial, sagt die Antwort das ehrlich.
        if (nahester && nahesteDist <= ANBINDUNG_MAX_M) {
          const andere = bahnsteigVon(nahester);
          const jenseitsDesGleises =
            andere.size > 0 &&
            !andere.has(bahnsteigId) &&
            abstandZumUmriss(nahester, nodeListen, osmKnoten) > KANTE_AM_BAHNSTEIG_M;
          if (!jenseitsDesGleises) {
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
  verdichteBahnsteigketten(knoten, bahnsteigVon, fuegeKanteHinzu);

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
  // Die Art haengt am Bahnsteig, der das Gleis stellt (`quelleFuerGleis`).
  const gleisArt = new Map<string, 'zug' | 'sbahn'>();
  for (const gleis of gleise) {
    const quelle = quelleFuerGleis.get(gleis);
    const sbahn = nurSbahnVerkehrsstelle(gleis) || (quelle !== undefined && istSbahnsteig(quelle));
    gleisArt.set(gleis, sbahn ? 'sbahn' : 'zug');
  }

  // --- Pass F: verwaiste Aufzugausstiege an ihren Bahnsteig anschliessen ---
  verbindeVerwaisteAufzuege(knoten, adjazenz, fuegeKanteHinzu);

  // Stufe wird erst durch die Klassifikation (Task 5) gesetzt – Start: 3.
  return { knoten, adjazenz, stufe: 3, gleise, bahnsteigLinien, gleisArt, ubahnSteige };
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
 * Ein Knoten haengt an HOECHSTENS einem Bahnsteig - dem, zu dem er gehoert
 * (`bahnsteigVon`). Sonst entstuende zwischen zwei Bahnsteigen eine ebene Kante,
 * also ein Weg ueber die Gleise. Die Achse legt nur noch die Reihenfolge fest.
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
  bahnsteigVon: (k: GraphKnoten) => ReadonlySet<string>,
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

  // Jeden begehbaren Knoten seinem Bahnsteig zuordnen.
  const mitglieder = new Map<string, GraphKnoten[]>();
  for (const kandidat of knoten.values()) {
    if (!kandidat.id.startsWith('n')) continue; // nur physische Knoten
    const eigene = bahnsteigVon(kandidat);
    let bester: { id: string; querM: number } | null = null;
    for (const [id, achse] of achsen) {
      if (!eigene.has(id) || achse.level !== kandidat.level) continue;
      const lage = geometrie(achse);
      if (!lage) continue;
      const hier = achsenLage(lage.anfang, lage.ende, kandidat);
      if (!hier) continue;
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

/** Ein synthetischer Bahnsteigpunkt: Gleis (`gleisN:…`) oder U-Bahn-Steig (`ubahn<id>:…`). */
function istSteigpunkt(id: string): boolean {
  return id.startsWith('gleis') || id.startsWith('ubahn');
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
    if (istSteigpunkt(id)) hatBahnsteig.add(nummer);
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
      if (!istSteigpunkt(kandidat.id)) continue;
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
  return {
    knoten: graph.knoten,
    adjazenz,
    stufe: graph.stufe,
    gleise: graph.gleise,
    ...(graph.bahnsteigLinien ? { bahnsteigLinien: graph.bahnsteigLinien } : {}),
    ...(graph.gleisArt ? { gleisArt: graph.gleisArt } : {}),
    ...(graph.ubahnSteige ? { ubahnSteige: graph.ubahnSteige } : {}),
  };
}

/**
 * Karte des Bahnhofspfads. Gezeichnet wird nur der Weg; der Graph bleibt als
 * Parameter für die bestehenden Aufrufer.
 */
export function graphZuGeoJSON(
  _graph: StationGraph,
  pfad: RoutenPfad,
): Record<string, { type: 'FeatureCollection'; features: GeoFeature[] }> {
  return pfadZuGeoJSON(pfad);
}

/**
 * GeoJSON je Ebene aus einem Weg – ohne Graph, damit auch der Fußweg des
 * Haltestellenpfads (Umstieg 2.0) dieselbe Karte bekommt.
 */
export function pfadZuGeoJSON(
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
