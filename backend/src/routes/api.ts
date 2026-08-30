import type { FastifyInstance } from 'fastify';
import { erzeugeCache, GRAPH_TTL_MS } from '../cache/lru.js';
import { FehlendeZugangsdatenError, istGueltigeEva } from '../clients/stations.js';
import { gehzeitSekunden } from '../core/gehzeit.js';
import { baueGraph, graphZuGeoJSON, kopiereGraph } from '../core/graph.js';
import { klassifiziere } from '../core/klassifikation.js';
import { berechneRoute, findeStartknoten, istGleicherBahnsteig } from '../core/routing.js';
import { gleicherBahnsteigErgebnis, syntheseGraph, wendeFastaAn } from '../core/synthmodell.js';
import { generiereSchritte } from '../core/textgen.js';
import type {
  BahnhofTreffer,
  FastaAnlage,
  Gehprofil,
  GraphKnoten,
  OverpassAntwort,
  RoutenVariante,
  StationGraph,
  StationsInfo,
  TafelEintrag,
} from '../core/typen.js';

export type OverpassFn = (lat: number, lon: number, radiusM: number) => Promise<OverpassAntwort>;

export interface StationsClient {
  sucheBahnhoefe(q: string): Promise<BahnhofTreffer[]>;
  sucheBahnhoefeNahebei(
    lat: number,
    lon: number,
    radiusM: number,
  ): Promise<BahnhofTreffer[]>;
  holeStationsInfo(eva: string): Promise<StationsInfo>;
}

export type TafelFn = (eva: string, typ: 'arr' | 'dep') => Promise<TafelEintrag[]>;

export type WagenpositionFn = (
  zugnummer: string,
  datum: string,
  wagen: string,
) => Promise<{ abschnitt: string } | null>;

export type FastaFn = (eva: string) => Promise<FastaAnlage[]>;

export interface ApiClients {
  overpass: OverpassFn;
  stations: StationsClient;
  tafel: TafelFn;
  wagenposition: WagenpositionFn;
  fasta: FastaFn;
}

const OVERPASS_RADIUS_M = 400;
const GEHPROFILE: Gehprofil[] = ['zuegig', 'normal', 'langsam'];
const VARIANTEN: RoutenVariante[] = ['schnellste', 'einfachste', 'barrierefrei'];

interface GraphEintrag {
  graph: StationGraph;
  info: StationsInfo;
  hinweise: string[];
}

interface RouteQuery {
  eva?: string;
  gleisAn?: string;
  gleisAb?: string;
  zugAn?: string; // Zugnummer des Ankunftszugs – für die Wagenreihung
  wagen?: string;
  abschnitt?: string;
  profil?: string;
  variante?: string;
}

function heuteJJJJMMTT(): string {
  const jetzt = new Date();
  const mm = String(jetzt.getMonth() + 1).padStart(2, '0');
  const tt = String(jetzt.getDate()).padStart(2, '0');
  return `${jetzt.getFullYear()}${mm}${tt}`;
}

export function registriereApiRouten(app: FastifyInstance, clients: ApiClients): void {
  const graphCache = erzeugeCache<GraphEintrag>(100, GRAPH_TTL_MS);
  const ERKENNUNG_RADIUS_M = 1000;

  app.get<{ Querystring: { q?: string; lat?: string; lon?: string } }>('/api/stations', async (req, reply) => {
    const q = req.query.q?.trim();
    const latRoh = req.query.lat;
    const lonRoh = req.query.lon;
    const hatKoordinaten = latRoh !== undefined || lonRoh !== undefined;

    if (!q && !hatKoordinaten) {
      return reply
        .code(400)
        .send({ fehler: 'parameter-fehlt', detail: 'q oder lat+lon ist erforderlich' });
    }
    if (q && hatKoordinaten) {
      return reply
        .code(400)
        .send({ fehler: 'parameter-ungueltig', detail: 'q und lat/lon schliessen sich aus' });
    }

    try {
      if (hatKoordinaten) {
        const lat = Number(latRoh);
        const lon = Number(lonRoh);
        const gueltig =
          latRoh !== undefined &&
          latRoh.trim() !== '' &&
          lonRoh !== undefined &&
          lonRoh.trim() !== '' &&
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180;
        if (!gueltig) {
          return reply
            .code(400)
            .send({ fehler: 'parameter-ungueltig', detail: 'lat und lon muessen gueltig sein' });
        }
        return await clients.stations.sucheBahnhoefeNahebei(lat, lon, ERKENNUNG_RADIUS_M);
      }
      return await clients.stations.sucheBahnhoefe(q!);
    } catch (e) {
      if (e instanceof FehlendeZugangsdatenError) {
        return reply.code(503).send({ fehler: 'db-zugang-fehlt' });
      }
      throw e;
    }
  });

  app.get<{ Params: { eva: string }; Querystring: { type?: string } }>(
    '/api/board/:eva',
    async (req, reply) => {
      // Kennungen aus fremden Nummernraeumen (Nahverkehr, IFOPT) kennt
      // Timetables nicht - ungeprueft endete das in einem HTTP 500.
      if (!istGueltigeEva(req.params.eva)) {
        return reply
          .code(400)
          .send({ fehler: 'parameter-ungueltig', detail: 'eva ist keine gueltige EVA-Nummer' });
      }
      const typ = req.query.type;
      if (typ !== 'arr' && typ !== 'dep') {
        return reply
          .code(400)
          .send({ fehler: 'parameter-ungueltig', detail: 'type muss arr oder dep sein' });
      }
      try {
        return await clients.tafel(req.params.eva, typ);
      } catch (e) {
        if (e instanceof FehlendeZugangsdatenError) {
          return reply.code(503).send({ fehler: 'db-zugang-fehlt' });
        }
        throw e;
      }
    },
  );

  app.get<{ Querystring: RouteQuery }>('/api/route', async (req, reply) => {
    const { eva, gleisAn, gleisAb, zugAn, wagen, abschnitt } = req.query;
    const profil = (req.query.profil ?? 'normal') as Gehprofil;
    const variante = (req.query.variante ?? 'schnellste') as RoutenVariante;
    if (!eva || !gleisAn || !gleisAb) {
      return reply
        .code(400)
        .send({ fehler: 'parameter-fehlt', detail: 'eva, gleisAn und gleisAb sind erforderlich' });
    }
    if (!istGueltigeEva(eva)) {
      return reply
        .code(400)
        .send({ fehler: 'parameter-ungueltig', detail: 'eva ist keine gueltige EVA-Nummer' });
    }
    if (!GEHPROFILE.includes(profil) || !VARIANTEN.includes(variante)) {
      return reply.code(400).send({ fehler: 'parameter-ungueltig' });
    }

    // Graph beschaffen (Cache 24 h je EVA)
    let eintrag = graphCache.get(eva);
    if (!eintrag) {
      let info: StationsInfo;
      try {
        info = await clients.stations.holeStationsInfo(eva);
      } catch (e) {
        if (e instanceof FehlendeZugangsdatenError) {
          return reply.code(503).send({ fehler: 'db-zugang-fehlt' });
        }
        throw e;
      }
      eintrag = await baueGraphEintrag(info, clients.overpass);
      graphCache.set(eva, eintrag);
    }

    const hinweise = [...eintrag.hinweise];
    let graph = eintrag.graph;

    // FaSta nur bei `barrierefrei`: Nur dort entscheidet der Betriebsstatus über
    // die Route (kanteErlaubt in routing.ts). Ausfall sperrt nichts, sondern
    // erzeugt einen ehrlichen Hinweis (Degradationstabelle, Konzept 8).
    let fastaAnlagen: FastaAnlage[] = [];
    if (variante === 'barrierefrei') {
      try {
        fastaAnlagen = await clients.fasta(eva);
        // Auf einer Kopie arbeiten: Ein gerade defekter Aufzug darf nicht im
        // 24-Stunden-Graphcache landen und dort gesperrt bleiben.
        graph = kopiereGraph(graph);
        wendeFastaAn(graph, fastaAnlagen);
      } catch {
        hinweise.push('Aufzugstatus unbekannt – Anlagendaten derzeit nicht abrufbar.');
      }
    }

    // Wagenreihung: liefert den Gleisabschnitt des Wagens; keine Daten sind
    // der Normalfall → Bahnsteigmitte mit transparentem Hinweis (Konzept 7).
    let abschnittEffektiv = abschnitt;
    if (wagen && zugAn) {
      const position = await clients.wagenposition(zugAn, heuteJJJJMMTT(), wagen);
      if (position) {
        abschnittEffektiv = position.abschnitt;
      } else {
        hinweise.push('Wagenposition unbekannt – Route startet an der Bahnsteigmitte.');
      }
    }

    // Sonderfall: beide Gleise am selben physischen Bahnsteig
    if (istGleicherBahnsteig(graph, gleisAn, gleisAb)) {
      const ergebnis = gleicherBahnsteigErgebnis(gleisAb, graph.stufe);
      return { ...ergebnis, hinweise: [...hinweise, ...ergebnis.hinweise] };
    }

    // Startpunkt/Ziel bestimmen; fehlt ein Gleis im OSM-Graphen → Synthese-Rückfall
    let start: { knoten: GraphKnoten; hinweis?: string };
    let ziel: { knoten: GraphKnoten; hinweis?: string };
    try {
      start = findeStartknoten(graph, gleisAn, abschnittEffektiv);
      ziel = findeStartknoten(graph, gleisAb);
    } catch {
      if (graph.stufe !== 3) {
        // Anlagen weiterreichen, damit der Betriebsstatus auch im Rückfall gilt.
        graph = syntheseGraph(eintrag.info, fastaAnlagen);
        hinweise.push(
          'Gleis nicht im Kartenmaterial gefunden – Standardmodell mit ungefähren Angaben.',
        );
        try {
          start = findeStartknoten(graph, gleisAn, abschnittEffektiv);
          ziel = findeStartknoten(graph, gleisAb);
        } catch {
          return reply.code(404).send({ fehler: 'gleis-unbekannt' });
        }
      } else {
        return reply.code(404).send({ fehler: 'gleis-unbekannt' });
      }
    }
    if (start.hinweis) hinweise.push(start.hinweis);

    const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante);
    if (!pfad) {
      return reply.code(404).send({
        fehler: 'keine-route',
        detail:
          variante === 'barrierefrei'
            ? 'Keine barrierefreie Route gefunden (Treppen gesperrt, kein nutzbarer Aufzug).'
            : 'Keine Route zwischen den Gleisen gefunden.',
        hinweise,
      });
    }

    return {
      stufe: graph.stufe,
      schritte: generiereSchritte(pfad, { ungefaehr: graph.stufe === 3, profil }),
      gehzeitSek: gehzeitSekunden(pfad, profil),
      karte: graphZuGeoJSON(graph, pfad),
      hinweise,
    };
  });
}

/** OSM-Graph bauen; bei Overpass-Ausfall oder unbrauchbaren Daten → Synthesemodell. */
async function baueGraphEintrag(info: StationsInfo, overpass: OverpassFn): Promise<GraphEintrag> {
  if (info.lat !== undefined && info.lon !== undefined) {
    try {
      const osm = await overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      const graph = baueGraph(osm);
      graph.stufe = klassifiziere(graph);
      if (graph.stufe !== 3) {
        return { graph, info, hinweise: [] };
      }
    } catch {
      // fällt unten auf das Synthesemodell zurück
    }
  }
  return {
    graph: syntheseGraph(info),
    info,
    hinweise: ['Kartendaten nicht verfügbar – Standardmodell mit ungefähren Angaben.'],
  };
}
