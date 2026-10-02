import { bahnsteigSchluessel, verankerterBahnsteig } from './fasta-gleisbezug.js';
import { haversineM } from './graph.js';
import type {
  FastaAnlage,
  GraphKante,
  GraphKnoten,
  KantenTyp,
  RouteErgebnis,
  StationGraph,
  StationsInfo,
  Stufe,
} from './typen.js';

// Synthesemodell (Stufe 3): Standardmuster deutscher Bahnhöfe – parallele
// Bahnsteige, eine Querung als Unterführung (level −1) auf halber Länge.
// Alle Längen sind GROBE Schätzungen; die Textausgabe nutzt „ca."-Formulierungen.
// Gemessen, nicht geraten: Die FaSta-Sondierung vom 05.09.2026 ergab
// Nachbarabstaende von 20-26 m (Hannover 20-26, Frankfurt 26, Berlin 10-22
// innerhalb einer Ebene). Der vorherige Wert 15 war ein Startwert ohne Messung.
const BAHNSTEIG_ABSTAND_M = 20;
const TREPPE_LAENGE_M = 10;
const AUFZUG_LAENGE_M = 5;
const NACHBARGLEIS_LAENGE_M = 5;
const GRUPPIER_SCHWELLE_M = 10; // Gleise näher beieinander → selber Bahnsteig
// Notnagel, wenn die Stationsdaten keine Position tragen: geografische Mitte
// Deutschlands. Der Regelfall ist die echte Stationsposition – siehe unten.
const BASIS_LAT = 51.0;
const BASIS_LON = 10.0;

interface SynthBahnsteig {
  id: string;
  gleise: { gleis: string; lat?: number; lon?: number }[];
  lat: number;
  lon: number;
  /** Anlagen, die diesen Bahnsteig laut FaSta-Beschreibung bedienen. */
  anlagen: FastaAnlage[];
}

/**
 * Gleise zu physischen Bahnsteigen gruppieren.
 *
 * Drei Schritte, und der erste ist seit §5 neu: Wo FaSta einen Bahnsteig
 * BENENNT ("zu Gleis 15/16"), bekommt er ECHTE Koordinaten. Nur der Rest wird
 * geschaetzt.
 *
 * Warum die Zuordnung ueber die Beschreibung laeuft und nicht ueber die
 * Geometrie, steht in `fasta-gleisbezug.ts`. Kurz: Berlins Anlagen streuen
 * ueber 339 m, weil Parkhaeuser und Tram-Haltestellen mit darin stehen.
 *
 * Ohne FaSta bleibt es beim bisherigen Aufbau. Verankert wird dann an der
 * ECHTEN Stationsposition. Die Gleisliste aus
 * RIS::Stations (`platforms/{eva}`) traegt nie Koordinaten – sie liefert nur
 * Namen. Ohne Verankerung landete deshalb jede Stufe-3-Route bei 51 N / 10 O,
 * und weil das Frontend die Karte zeigt, sobald `karte` vorhanden ist, sah der
 * Nutzer echte OSM-Kacheln von einem Acker in Mitteldeutschland – mit allem
 * Anschein von Genauigkeit. Die relativen Abstaende bleiben unveraendert
 * geschaetzt („ca."-Angaben); richtig ist nur, WO der Bahnhof liegt.
 */
/**
 * Ein Teilgleis („7A-D") ist kein eigenes Gleis, sondern ein Abschnitt von
 * `parentPlatform` – sofern die Liste dieses Hauptgleis auch führt. Sonst
 * bleibt es, wie es kommt: Aus einer Lücke wird nichts geschlossen.
 */
function istTeilgleis(eintrag: StationsInfo['gleise'][number], info: StationsInfo): boolean {
  const haupt = eintrag.ris?.parentPlatform;
  return haupt !== undefined && info.gleise.some((g) => g.gleis === haupt);
}

/** RIS::Stations nennt die Gleise am selben Bahnsteig (`linkedPlatforms`). */
function liegenZusammen(a: StationsInfo['gleise'][number], b: StationsInfo['gleise'][number]): boolean {
  return (a.ris?.linkedPlatforms ?? []).includes(b.gleis) || (b.ris?.linkedPlatforms ?? []).includes(a.gleis);
}

function gruppiereBahnsteige(info: StationsInfo, anlagen: FastaAnlage[]): SynthBahnsteig[] {
  // Schritt 1: Verankerungen aus den Beschreibungen sammeln.
  const verankert = new Map<string, FastaAnlage[]>();
  for (const anlage of anlagen) {
    const gleise = verankerterBahnsteig(anlage.beschreibung);
    if (!gleise) continue;
    const schluessel = bahnsteigSchluessel(gleise);
    const bisher = verankert.get(schluessel);
    if (bisher) bisher.push(anlage);
    else verankert.set(schluessel, [anlage]);
  }

  const bahnsteige: SynthBahnsteig[] = [];
  const vergeben = new Set<string>();

  // Schritt 2: benannte Bahnsteige bilden - nur aus Gleisen, die die
  // DB-Gleisliste kennt. FaSta nennt auch Tram- und U-Bahn-Gleise; die
  // Gleisliste bleibt die Autoritaet darueber, was DIESER Bahnhof hat.
  for (const [schluessel, ihre] of verankert) {
    const genannte = schluessel.split('/');
    const eintraege = info.gleise.filter(
      (g) => genannte.includes(g.gleis) && !vergeben.has(g.gleis),
    );
    if (eintraege.length === 0) continue;
    for (const e of eintraege) vergeben.add(e.gleis);
    bahnsteige.push({
      id: `bs${bahnsteige.length}`,
      gleise: eintraege,
      lat: ihre.reduce((s, a) => s + a.lat, 0) / ihre.length,
      lon: ihre.reduce((s, a) => s + a.lon, 0) / ihre.length,
      anlagen: ihre,
    });
  }

  // Schritt 3: uebrige Gleise wie bisher gruppieren.
  const echte = [...bahnsteige].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  const ohneAnker: SynthBahnsteig[] = [];
  for (const eintrag of info.gleise) {
    if (vergeben.has(eintrag.gleis) || istTeilgleis(eintrag, info)) continue;
    // Was RIS::Stations als gemeinsamen Bahnsteig nennt, ist einer – belegt,
    // nicht aus der Lage geschätzt.
    const verbunden = ohneAnker.find((b) => b.gleise.some((g) => liegenZusammen(g, eintrag)));
    if (verbunden) {
      verbunden.gleise.push(eintrag);
      continue;
    }
    if (eintrag.lat !== undefined && eintrag.lon !== undefined) {
      const passend = ohneAnker.find(
        (b) =>
          b.gleise[0].lat !== undefined &&
          haversineM(b.lat, b.lon, eintrag.lat!, eintrag.lon!) <= GRUPPIER_SCHWELLE_M,
      );
      if (passend) {
        passend.gleise.push(eintrag);
        continue;
      }
    }
    ohneAnker.push({
      id: `bs${bahnsteige.length + ohneAnker.length}`,
      gleise: [eintrag],
      lat: eintrag.lat ?? NaN,
      lon: eintrag.lon ?? NaN,
      anlagen: [],
    });
  }

  // Achse: aus den echten Bahnsteigen abgeleitet, sonst wie bisher nach Osten.
  const ankerLat = echte[0]?.lat ?? info.lat ?? BASIS_LAT;
  const ankerLon = echte[0]?.lon ?? info.lon ?? BASIS_LON;
  const mProGradLat = 111320;
  const mProGradLon = 111320 * Math.cos((ankerLat * Math.PI) / 180);
  let richtungLat = 0;
  let richtungLon = 1;
  if (echte.length >= 2) {
    const dLat = (echte[echte.length - 1].lat - echte[0].lat) * mProGradLat;
    const dLon = (echte[echte.length - 1].lon - echte[0].lon) * mProGradLon;
    const laenge = Math.hypot(dLat, dLon);
    if (laenge > 0) {
      richtungLat = dLat / laenge;
      richtungLon = dLon / laenge;
    }
  }

  // Synthetische Bahnsteige entlang der Achse anhaengen. Gibt es echte,
  // beginnen sie EINEN Abstand hinter dem letzten; gibt es keine, sitzt der
  // erste auf der Stationsposition - genau wie bisher.
  const letzte = echte[echte.length - 1];
  const startLat = letzte?.lat ?? ankerLat;
  const startLon = letzte?.lon ?? ankerLon;
  ohneAnker.forEach((b, i) => {
    if (!Number.isNaN(b.lat)) return;
    const versatz = (echte.length > 0 ? i + 1 : i) * BAHNSTEIG_ABSTAND_M;
    b.lat = startLat + (richtungLat * versatz) / mProGradLat;
    b.lon = startLon + (richtungLon * versatz) / mProGradLon;
  });

  return [...bahnsteige, ...ohneAnker].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
}

export function syntheseGraph(info: StationsInfo, anlagen: FastaAnlage[] = []): StationGraph {
  const knoten = new Map<string, GraphKnoten>();
  const adjazenz = new Map<string, GraphKante[]>();
  const fuegeKanteEin = (kante: GraphKante): void => {
    for (const ende of [kante.von, kante.nach]) {
      if (!adjazenz.has(ende)) adjazenz.set(ende, []);
      adjazenz.get(ende)!.push(kante);
    }
  };

  const bahnsteige = gruppiereBahnsteige(info, anlagen);
  const querIds: string[] = [];

  for (const bahnsteig of bahnsteige) {
    const querId = `quer:${bahnsteig.id}@-1`;
    knoten.set(querId, { id: querId, lat: bahnsteig.lat, lon: bahnsteig.lon, level: -1 });
    querIds.push(querId);

    let vorherigesGleis: string | null = null;
    for (const eintrag of bahnsteig.gleise) {
      const gleisId = `gleis${eintrag.gleis}:mitte`;
      knoten.set(gleisId, {
        id: gleisId,
        lat: eintrag.lat ?? bahnsteig.lat,
        lon: eintrag.lon ?? bahnsteig.lon,
        level: 0,
        gleis: eintrag.gleis,
        abschnitt: 'mitte',
        bahnsteigId: bahnsteig.id,
      });
      fuegeKanteEin({
        von: gleisId,
        nach: querId,
        laengeM: TREPPE_LAENGE_M,
        deltaLevel: -1,
        typ: 'treppe',
        barrierefrei: false,
      });
      if (vorherigesGleis) {
        fuegeKanteEin({
          von: vorherigesGleis,
          nach: gleisId,
          laengeM: NACHBARGLEIS_LAENGE_M,
          deltaLevel: 0,
          typ: 'eben',
          barrierefrei: true,
        });
      }
      vorherigesGleis = gleisId;
    }
  }

  // Querung: Unterführung verbindet benachbarte Bahnsteige.
  for (let i = 0; i + 1 < bahnsteige.length; i++) {
    const abstand = haversineM(
      bahnsteige[i].lat, bahnsteige[i].lon, bahnsteige[i + 1].lat, bahnsteige[i + 1].lon,
    );
    fuegeKanteEin({
      von: querIds[i],
      nach: querIds[i + 1],
      laengeM: Math.max(NACHBARGLEIS_LAENGE_M, Math.round(abstand)),
      deltaLevel: 0,
      typ: 'eben',
      barrierefrei: true,
    });
  }

  // Verankerte Anlagen: der Weg ueber den Bahnsteig wird GERECHNET, nur der
  // Abstieg bleibt geschaetzt. Der Status wird hier NICHT eingetragen - dieser
  // Graph wird gecacht, und ein gerade defekter Aufzug bliebe darin stehen.
  // Den Status legt `wendeFastaAn` pro Anfrage auf einer Kopie nach, ueber
  // `anlageId`.
  for (const bahnsteig of bahnsteige) {
    for (const anlage of bahnsteig.anlagen) {
      const wegM = Math.round(haversineM(bahnsteig.lat, bahnsteig.lon, anlage.lat, anlage.lon));
      const abstieg = anlage.typ === 'AUFZUG' ? AUFZUG_LAENGE_M : TREPPE_LAENGE_M;
      for (const eintrag of bahnsteig.gleise) {
        fuegeKanteEin({
          von: `gleis${eintrag.gleis}:mitte`,
          nach: `quer:${bahnsteig.id}@-1`,
          laengeM: wegM + abstieg,
          deltaLevel: -1,
          typ: anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe',
          barrierefrei: anlage.typ === 'AUFZUG',
          anlageId: anlage.id,
        });
      }
    }
  }

  // Anlagen OHNE Gleisbezug: nach der bisherigen Regel ans naechstgelegene
  // Gleis. Sie praegen keine Lage - aber sie duerfen keine Auskunft kosten:
  // Muenchen benennt nur 16 % seiner Anlagen mit einem Gleis. Fielen die
  // uebrigen 84 % weg, wuerde aus "barrierefreie Route vorhanden" ein "keine
  // Route", und eine bessere Geometrie haette eine Auskunft gekostet.
  const bedient = new Set(bahnsteige.flatMap((b) => b.anlagen.map((a) => a.id)));
  const gleisKnoten = [...knoten.values()].filter((k) => k.gleis);
  for (const anlage of anlagen) {
    if (bedient.has(anlage.id) || gleisKnoten.length === 0) continue;
    let nahester = gleisKnoten[0];
    let minAbstand = Infinity;
    for (const kandidat of gleisKnoten) {
      const abstand = haversineM(anlage.lat, anlage.lon, kandidat.lat, kandidat.lon);
      if (abstand < minAbstand) {
        minAbstand = abstand;
        nahester = kandidat;
      }
    }
    fuegeKanteEin({
      von: nahester.id,
      nach: `quer:${nahester.bahnsteigId}@-1`,
      laengeM: anlage.typ === 'AUFZUG' ? AUFZUG_LAENGE_M : TREPPE_LAENGE_M,
      deltaLevel: -1,
      typ: anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe',
      barrierefrei: anlage.typ === 'AUFZUG',
      anlageId: anlage.id,
    });
  }

  const gleise = [...new Set(info.gleise.filter((g) => !istTeilgleis(g, info)).map((g) => g.gleis))].sort((a, b) =>
    a.localeCompare(b, 'de', { numeric: true }),
  );
  return { knoten, adjazenz, stufe: 3, gleise };
}

// FaSta-Koordinaten und OSM-Geometrie stammen aus verschiedenen Quellen; jenseits
// dieser Entfernung ist die Zuordnung nicht mehr glaubwürdig und wird verworfen.
const FASTA_MAX_ABSTAND_M = 50;

/** Kleinster Abstand der Anlage zu einem der beiden Kantenenden. */
function abstandZuKante(graph: StationGraph, kante: GraphKante, anlage: FastaAnlage): number {
  let kleinster = Infinity;
  for (const id of [kante.von, kante.nach]) {
    const knoten = graph.knoten.get(id);
    if (!knoten) continue;
    kleinster = Math.min(kleinster, haversineM(anlage.lat, anlage.lon, knoten.lat, knoten.lon));
  }
  return kleinster;
}

/**
 * Überträgt den FaSta-Betriebsstatus auf einen Graphen. Zwei Wege, und der
 * erste ist der genaue:
 *
 * 1. Trägt die Kante eine `anlageId` (Synthesemodell), gilt der Status der
 *    Anlage mit dieser Nummer – ohne Entfernungsprüfung. Nötig, weil der
 *    Kantenknoten auf dem Bahnsteigschwerpunkt sitzt und die Anlage an ihrem
 *    echten Ort: an Berlins 280 m langen Bahnsteigen bis zu ~140 m
 *    auseinander. Über die Entfernung wäre der Status still verworfen worden
 *    – auf der barrierefreien Route, wo das am meisten wiegt.
 * 2. Sonst (OSM-Graph, Stufe 1/2) wie bisher über die nächstgelegene Kante
 *    gleichen Typs, begrenzt auf FASTA_MAX_ABSTAND_M.
 *
 * `INACTIVE` sperrt die Kante ausschließlich in der Variante `barrierefrei`
 * (das erledigt `kanteErlaubt` in routing.ts); `schnellste` bleibt unberührt.
 * Der Graph wird an Ort und Stelle geändert – Aufrufer arbeiten deshalb auf
 * einer Kopie, sonst stünde der Live-Status im 24-Stunden-Cache.
 */
export function wendeFastaAn(graph: StationGraph, anlagen: FastaAnlage[]): void {
  // Kanten stehen in beiden Adjazenzlisten als dieselbe Referenz – ein Set
  // betrachtet jedes Kantenobjekt genau einmal.
  const kanten = new Set<GraphKante>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) kanten.add(kante);
  }

  // Weg 1: über die Identität.
  const nachId = new Map(anlagen.map((a) => [a.id, a]));
  const offen = new Set<GraphKante>();
  for (const kante of kanten) {
    if (kante.anlageId === undefined) {
      offen.add(kante);
      continue;
    }
    const anlage = nachId.get(kante.anlageId);
    // Eine Kante, deren Anlage in dieser Antwort fehlt, bleibt ohne Status –
    // sie wird NICHT ersatzweise über die Entfernung bedient. Ein geratener
    // Status ist auf der barrierefreien Route schlimmer als keiner.
    if (anlage) kante.status = anlage.status;
  }

  // Weg 2: über die Entfernung, für Kanten ohne Identität (OSM).
  for (const anlage of anlagen) {
    const gesucht: KantenTyp = anlage.typ === 'AUFZUG' ? 'aufzug' : 'rolltreppe';
    let beste: GraphKante | null = null;
    let besterAbstand = Infinity;
    for (const kante of offen) {
      if (kante.typ !== gesucht) continue;
      const abstand = abstandZuKante(graph, kante, anlage);
      if (abstand < besterAbstand) {
        besterAbstand = abstand;
        beste = kante;
      }
    }
    if (beste && besterAbstand <= FASTA_MAX_ABSTAND_M) beste.status = anlage.status;
  }
}

/** Sonderfall gleicher Bahnsteig: kein Routing nötig, ehrliche Kurzansage. */
export function gleicherBahnsteigErgebnis(gleisAb: string, stufe: Stufe): RouteErgebnis {
  return {
    stufe,
    schritte: [{ text: `Gleis ${gleisAb} gegenüber, kein Ebenenwechsel`, typ: 'ziel' }],
    gehzeitSek: 30,
    hinweise: [],
  };
}
