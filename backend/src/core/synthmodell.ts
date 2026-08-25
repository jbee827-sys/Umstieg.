import { haversineM } from './graph.js';
import type {
  FastaAnlage,
  GraphKante,
  GraphKnoten,
  RouteErgebnis,
  StationGraph,
  StationsInfo,
  Stufe,
} from './typen.js';

// Synthesemodell (Stufe 3): Standardmuster deutscher Bahnhöfe – parallele
// Bahnsteige, eine Querung als Unterführung (level −1) auf halber Länge.
// Alle Längen sind GROBE Schätzungen; die Textausgabe nutzt „ca."-Formulierungen.
const BAHNSTEIG_ABSTAND_M = 15;
const TREPPE_LAENGE_M = 10;
const AUFZUG_LAENGE_M = 5;
const NACHBARGLEIS_LAENGE_M = 5;
const GRUPPIER_SCHWELLE_M = 10; // Gleise näher beieinander → selber Bahnsteig
const BASIS_LAT = 51.0;
const BASIS_LON = 10.0;

interface SynthBahnsteig {
  id: string;
  gleise: { gleis: string; lat?: number; lon?: number }[];
  lat: number;
  lon: number;
}

/** Gleise zu physischen Bahnsteigen gruppieren (gleiche/nahe Koordinaten). */
function gruppiereBahnsteige(info: StationsInfo): SynthBahnsteig[] {
  const bahnsteige: SynthBahnsteig[] = [];
  for (const eintrag of info.gleise) {
    if (eintrag.lat !== undefined && eintrag.lon !== undefined) {
      const passend = bahnsteige.find(
        (b) =>
          b.gleise[0].lat !== undefined &&
          haversineM(b.lat, b.lon, eintrag.lat!, eintrag.lon!) <= GRUPPIER_SCHWELLE_M,
      );
      if (passend) {
        passend.gleise.push(eintrag);
        continue;
      }
    }
    bahnsteige.push({
      id: `bs${bahnsteige.length}`,
      gleise: [eintrag],
      lat: eintrag.lat ?? NaN,
      lon: eintrag.lon ?? NaN,
    });
  }
  // Bahnsteige ohne Koordinaten bekommen synthetische Positionen im Standardabstand.
  const mProGradLon = 111320 * Math.cos((BASIS_LAT * Math.PI) / 180);
  bahnsteige.forEach((b, i) => {
    if (Number.isNaN(b.lat)) {
      b.lat = BASIS_LAT;
      b.lon = BASIS_LON + (i * BAHNSTEIG_ABSTAND_M) / mProGradLon;
    }
  });
  return bahnsteige.sort((a, b) => a.lon - b.lon || a.lat - b.lat);
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

  const bahnsteige = gruppiereBahnsteige(info);
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

  // FaSta-Anlagen dem nächstgelegenen Gleis zuordnen → Kante Bahnsteig ↔ Querung.
  const gleisKnoten = [...knoten.values()].filter((k) => k.gleis);
  for (const anlage of anlagen) {
    if (gleisKnoten.length === 0) break;
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
      status: anlage.status,
    });
  }

  const gleise = [...new Set(info.gleise.map((g) => g.gleis))].sort((a, b) =>
    a.localeCompare(b, 'de', { numeric: true }),
  );
  return { knoten, adjazenz, stufe: 3, gleise };
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
