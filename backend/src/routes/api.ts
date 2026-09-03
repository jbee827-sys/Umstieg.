import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import { erzeugeCache, graphTtlMs, GRAPH_TTL_MS } from '../cache/lru.js';
import {
  FehlendeZugangsdatenError,
  gleislisteUnvollstaendig,
  istGueltigeEva,
} from '../clients/stations.js';
import { namensvarianten } from '../core/bahnhofsname.js';
import { gehzeitSekunden } from '../core/gehzeit.js';
import { berlinTeile } from '../core/zeit.js';
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
  /** Alle Verkehrsstellen des Bahnhofs – ohne die Gleislisten zu holen. */
  ermittleGruppe(eva: string): Promise<string[]>;
}

export type TafelFn = (eva: string, typ: 'arr' | 'dep') => Promise<TafelEintrag[]>;

export type WagenpositionFn = (
  zugnummer: string,
  datum: string,
  wagen: string,
) => Promise<{ abschnitt: string } | null>;

/**
 * FaSta adressiert die StaDa-BAHNHOFSNUMMER (`stationID` aus RIS::Stations),
 * nicht die EVA. Mit einer EVA antwortet die API mit HTTP 200 und leerer
 * Liste – ein stiller leerer Erfolg, der wie „keine Aufzüge" aussieht.
 */
export type FastaFn = (stationsnummer: string) => Promise<FastaAnlage[]>;

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
  // Deutsche Ortszeit: Zwischen 22 und 24 Uhr deutscher Zeit ist im UTC-
  // Container noch der Vortag, und die Wagenreihung waere fuer den falschen
  // Tag abgefragt.
  const { jahr, monat, tag } = berlinTeile(new Date());
  return `${jahr}${monat}${tag}`;
}

export function registriereApiRouten(app: FastifyInstance, clients: ApiClients): void {
  const graphCache = erzeugeCache<GraphEintrag>(100, GRAPH_TTL_MS);
  /**
   * Der Cache haelt nur *fertige* Eintraege - ein *laufender* Graphbau war
   * fuer den Zweiten unsichtbar. Die Oberflaeche laedt zwei Routenvarianten,
   * beide fanden den Cache leer, beide fragten Overpass: am 31.08.2026
   * gemessen 24 s und 61 s statt 2 s. Wer als Zweiter kommt, wartet jetzt auf
   * das laufende Versprechen, statt daneben ein eigenes zu starten.
   *
   * Zwei Karten, keine gemeinsame: Bei einem Bahnhof aus einer einzigen
   * Verkehrsstelle sind EVA und Gruppenschluessel dieselbe Zeichenkette. In
   * einer Karte fand der innere Bau das noch offene aeussere Versprechen -
   * und wartete auf sich selbst.
   */
  const laufendeAnfragen = new Map<string, Promise<GraphEintrag>>();
  const laufendeGraphbauten = new Map<string, Promise<GraphEintrag>>();
  // Gruppenzugehörigkeit ist Stammdatum – sie ändert sich nicht im Tagesbetrieb.
  // Ohne diesen Cache kostete jeder SSE-Poll zwei zusätzliche DB-Aufrufe.
  const gruppenCache = erzeugeCache<{ evas: string[] }>(200, GRAPH_TTL_MS);
  const ERKENNUNG_RADIUS_M = 1000;

  async function gruppeVon(eva: string, log: FastifyBaseLogger): Promise<string[]> {
    const gecacht = gruppenCache.get(eva);
    if (gecacht) return gecacht.evas;
    let evas: string[];
    try {
      evas = await clients.stations.ermittleGruppe(eva);
    } catch (e) {
      if (e instanceof FehlendeZugangsdatenError) throw e;
      // Gruppenauflösung ist eine Verbesserung, keine Voraussetzung - aber
      // eine teure: Berlin Hbf führt unter seiner eigenen EVA KEINE Abfahrt.
      // Scheitert sie, sieht eine leere Tafel aus wie "keine Züge", und
      // niemand erfährt den Unterschied. Deshalb hier eine Spur.
      log.warn(
        { degradation: 'gruppe-unbekannt', eva, grund: String(e) },
        'Verkehrsstellengruppe nicht ermittelbar - Tafel nur ueber die eigene EVA',
      );
      evas = [eva];
    }
    if (evas.length === 0) evas = [eva];
    gruppenCache.set(eva, { evas });
    return evas;
  }

  /**
   * Ein Bau je Schluessel. Der Eintrag faellt nach Abschluss wieder heraus -
   * auch nach einem Fehlschlag, sonst naegelte ein einmal gescheiterter
   * Abruf den Bahnhof dauerhaft auf seinen Fehler fest.
   */
  function buendle(
    laufende: Map<string, Promise<GraphEintrag>>,
    schluessel: string,
    erzeuge: () => Promise<GraphEintrag>,
  ): Promise<GraphEintrag> {
    const laufend = laufende.get(schluessel);
    if (laufend) return laufend;
    const versprechen = erzeuge().finally(() => {
      laufende.delete(schluessel);
    });
    laufende.set(schluessel, versprechen);
    return versprechen;
  }

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
      /*
       * Schreibvarianten der Reihe nach probieren.
       *
       * Ein aus einer Verbund-App uebernommener Name ("S+U Berlin
       * Gesundbrunnen Bhf") liefert bei RIS::Stations nichts, derselbe Ort
       * als "Berlin Gesundbrunnen" schon. Statt das im Client zu raten - was
       * jede App anders braeuchte - probiert die Suche selbst.
       *
       * Ein sauberer Name ergibt genau eine Variante und kostet damit auch
       * genau einen Aufruf; die Tippsuche wird also nicht teurer.
       *
       * Faellt eine Variante mit einem Fehler aus, laeuft die naechste
       * trotzdem: Die DB-API quittiert manche Eingaben mit einem Fehler statt
       * mit einer leeren Liste. Erst wenn KEINE durchkam, wird gemeldet.
       */
      let ersterFehler: unknown;
      for (const variante of namensvarianten(q!)) {
        try {
          const treffer = await clients.stations.sucheBahnhoefe(variante);
          if (treffer.length > 0) return treffer;
        } catch (e) {
          if (e instanceof FehlendeZugangsdatenError) throw e;
          ersterFehler ??= e;
        }
      }
      if (ersterFehler) throw ersterFehler;
      return [];
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
        // Über die ganze Verkehrsstellengruppe: Berlin Hbf führt unter der
        // EVA, die die Suche liefert (8011160), KEINE Abfahrt – die Züge
        // stehen unter 8098160 und 8089021. Ohne die Gruppe blieb die
        // Zugauswahl für den meistgenannten Bahnhof leer.
        const evas = await gruppeVon(req.params.eva, req.log);
        const ergebnisse = await Promise.allSettled(evas.map((e) => clients.tafel(e, typ)));

        const erfolgreich = ergebnisse.filter(
          (r): r is PromiseFulfilledResult<TafelEintrag[]> => r.status === 'fulfilled',
        );
        // Ein ausgefallener Bahnhofsteil darf die übrigen nicht mitnehmen –
        // eine unvollständige Tafel ist besser als gar keine. Fallen alle aus,
        // bleibt der Fehler stehen (503 bei fehlendem Zugang).
        if (erfolgreich.length === 0 && ergebnisse.length > 0) {
          throw (ergebnisse[0] as PromiseRejectedResult).reason;
        }

        // Nach Zug UND Sollzeit entdoppeln: derselbe Zug steht in mehreren
        // Bahnhofsteilen. Nur nach Zugnummer würde ein durchfahrender Zug mit
        // zwei Halten fälschlich zu einem zusammenfallen – derselbe Schlüssel
        // wie in core/ueberwachung.ts, aus demselben Grund.
        const gesehen = new Set<string>();
        const zusammengefuehrt: TafelEintrag[] = [];
        for (const r of erfolgreich) {
          for (const eintrag of r.value) {
            const schluessel = `${eintrag.zug}|${eintrag.zeitSoll}`;
            if (gesehen.has(schluessel)) continue;
            gesehen.add(schluessel);
            zusammengefuehrt.push(eintrag);
          }
        }
        return zusammengefuehrt.sort((a, b) => a.zeitSoll.localeCompare(b.zeitSoll));
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

    // Graph beschaffen (Cache 24 h). Geschlüsselt wird auf den BAHNHOF, nicht
    // auf die Verkehrsstelle: Berlin Hbf über 8011160 und über 8098160 ist
    // derselbe Bahnhof, derselbe Graph, ein Overpass-Abruf.
    let eintrag = graphCache.get(eva);
    if (!eintrag) {
      try {
        // Gebuendelt auf zwei Ebenen: auf die EVA, weil zwei Varianten
        // derselben Anfrage schon vor der Stationsauskunft zusammentreffen,
        // und auf den Bahnhof, weil zwei Verkehrsstellen desselben Bahnhofs
        // erst danach als dieselbe Sache erkennbar sind.
        eintrag = await buendle(laufendeAnfragen, eva, async () => {
          const info = await clients.stations.holeStationsInfo(eva);
          // Sortiert, damit jedes Mitglied denselben Schlüssel bildet –
          // `groupMembers` kommt nicht in stabiler Reihenfolge.
          const bahnhofSchluessel = [...info.evas].sort().join(',');
          const ausGruppe = graphCache.get(bahnhofSchluessel);
          if (ausGruppe) {
            graphCache.set(eva, ausGruppe, {
              ttl: graphTtlMs(ausGruppe.graph.stufe, gleislisteUnvollstaendig(ausGruppe.info)),
            });
            return ausGruppe;
          }
          const gebaut = await buendle(laufendeGraphbauten, bahnhofSchluessel, () =>
            baueGraphEintrag(info, clients.overpass, req.log),
          );
          // Frist nach Qualität: Ein Stufe-3-Notbehelf darf den Bahnhof nicht
          // einen Tag lang degradiert halten, nachdem Overpass sich erholt hat.
          const ttl = graphTtlMs(gebaut.graph.stufe, gleislisteUnvollstaendig(gebaut.info));
          graphCache.set(bahnhofSchluessel, gebaut, { ttl });
          // Kurzweg, damit der nächste Aufruf die Stationsauskunft nicht
          // braucht - mit derselben Frist, sonst überlebte der Notbehelf hier.
          graphCache.set(eva, gebaut, { ttl });
          return gebaut;
        });
      } catch (e) {
        if (e instanceof FehlendeZugangsdatenError) {
          return reply.code(503).send({ fehler: 'db-zugang-fehlt' });
        }
        throw e;
      }
    }

    const hinweise = [...eintrag.hinweise];
    let graph = eintrag.graph;

    // FaSta nur bei `barrierefrei`: Nur dort entscheidet der Betriebsstatus über
    // die Route (kanteErlaubt in routing.ts). Ausfall sperrt nichts, sondern
    // erzeugt einen ehrlichen Hinweis (Degradationstabelle, Konzept 8).
    let fastaAnlagen: FastaAnlage[] = [];
    if (variante === 'barrierefrei') {
      // Ohne Bahnhofsnummer gar nicht erst fragen: Die EVA quittiert FaSta mit
      // einer leeren Liste, und die wäre von „dieser Bahnhof hat keine
      // Aufzüge" nicht zu unterscheiden. Offen zu sagen, dass der Status
      // fehlt, ist ehrlicher als eine falsche Auskunft.
      const stationsnummer = eintrag.info.stationID;
      if (!stationsnummer) {
        hinweise.push('Aufzugstatus unbekannt – Anlagendaten derzeit nicht abrufbar.');
      } else {
        try {
          fastaAnlagen = await clients.fasta(stationsnummer);
          // Auf einer Kopie arbeiten: Ein gerade defekter Aufzug darf nicht im
          // 24-Stunden-Graphcache landen und dort gesperrt bleiben.
          graph = kopiereGraph(graph);
          wendeFastaAn(graph, fastaAnlagen);
        } catch (e) {
          // Der Hinweis geht an den Reisenden, der Eintrag an den Betrieb.
          // Beides wird gebraucht: Der eine plant um, der andere stellt die
          // Ursache ab. Bisher gab es nur den Hinweis – ein FaSta-Ausfall
          // war in den Protokollen von „dieser Bahnhof hat keine Aufzüge"
          // nicht zu unterscheiden.
          req.log.warn(
            {
              degradation: 'aufzugstatus-unbekannt',
              eva: eintrag.info.eva,
              stationsnummer,
              grund: String(e),
            },
            'FaSta nicht erreichbar - barrierefreie Route ohne Betriebsstatus',
          );
          hinweise.push('Aufzugstatus unbekannt – Anlagendaten derzeit nicht abrufbar.');
        }
      }
    }

    // Wagenreihung: liefert den Gleisabschnitt des Wagens; keine Daten sind
    // der Normalfall → Bahnsteigmitte mit transparentem Hinweis (Konzept 7).
    let abschnittEffektiv = abschnitt;
    if (wagen && zugAn) {
      // Zwei Wege enden hier in derselben Bahnsteigmitte, und der Unterschied
      // gehört ins Protokoll, nicht in die Antwort: `null` heisst „die
      // Auskunft steht, sie kennt den Wagen nur nicht" (Konzept 7, der
      // Normalfall). Ein Wurf heisst „wir haben die Auskunft nicht erreicht".
      // Für den Reisenden ist beides dieselbe Nachricht; für den Betrieb ist
      // nur das zweite ein Vorfall.
      let position: { abschnitt: string } | null = null;
      try {
        position = await clients.wagenposition(zugAn, heuteJJJJMMTT(), wagen);
      } catch (e) {
        req.log.warn(
          { degradation: 'wagenposition-unbekannt', zug: zugAn, wagen, grund: String(e) },
          'Wagenreihung nicht erreichbar - Route ab Bahnsteigmitte',
        );
      }
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

    /**
     * „Das Gleis kenne ich nicht“ darf nur sagen, wer vollständig gefragt hat.
     *
     * Berlin Hbf führt Gleis 6 unter 8098160. Fällt dessen Gleisliste aus,
     * fehlt Gleis 6 in der Vereinigung – und die Antwort war bisher 404
     * „gleis-unbekannt“, im Frontend: „Eines der Gleise wurde an diesem
     * Bahnhof nicht gefunden.“ Das ist falsch und klingt endgültig; der
     * Nutzer sucht daraufhin den Fehler bei sich. Richtig ist: Die Quelle ist
     * gerade weg. Deshalb 503 statt 404 – wiederkommen hilft, korrigieren
     * nicht.
     */
    const unvollstaendig = gleislisteUnvollstaendig(eintrag.info);
    const gleisNichtGefunden = (): FastifyReply => {
      if (!unvollstaendig) return reply.code(404).send({ fehler: 'gleis-unbekannt' });
      req.log.warn(
        {
          degradation: 'gleisliste-unvollstaendig',
          eva: eintrag.info.eva,
          bahnhof: eintrag.info.name,
          gleisteileOhneAntwort: eintrag.info.gleisteileOhneAntwort ?? 0,
          gruppeUnvollstaendig: eintrag.info.gruppeUnvollstaendig === true,
        },
        'Gleis nicht in einer unvollstaendigen Gleisliste - kein Beleg fuer "gibt es nicht"',
      );
      return reply.code(503).send({
        fehler: 'gleisliste-unvollstaendig',
        detail:
          'Die Gleisliste dieses Bahnhofs ist derzeit unvollständig – das Gleis lässt sich nicht prüfen.',
      });
    };

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
          return gleisNichtGefunden();
        }
      } else {
        return gleisNichtGefunden();
      }
    }
    if (start.hinweis) hinweise.push(start.hinweis);

    // Profil mitgeben: Die schnellste Route fuer einen Zuegigen ist nicht
    // zwingend die fuer jemanden mit Gepaeck.
    const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante, profil);
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

/**
 * OSM-Graph bauen; bei Overpass-Ausfall oder unbrauchbaren Daten →
 * Synthesemodell.
 *
 * Der Rueckfall wird protokolliert, und zwar mit Unterscheidung: Ein
 * Overpass-Ausfall ist ein anderer Zustand als brauchbar erreichte, aber
 * unbrauchbare OSM-Daten. Beide enden im selben Standardmodell - wer den
 * Bahnhof verbessern will, muss aber wissen, welcher von beiden vorliegt.
 */
async function baueGraphEintrag(
  info: StationsInfo,
  overpass: OverpassFn,
  log: FastifyBaseLogger,
): Promise<GraphEintrag> {
  let grund = 'keine Koordinaten zum Bahnhof';
  if (info.lat !== undefined && info.lon !== undefined) {
    try {
      const osm = await overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      const graph = baueGraph(osm);
      graph.stufe = klassifiziere(graph);
      if (graph.stufe !== 3) {
        return { graph, info, hinweise: [] };
      }
      grund = 'OSM-Daten unbrauchbar (Stufe 3 nach Klassifikation)';
    } catch (e) {
      grund = `Overpass nicht erreichbar: ${String(e)}`;
    }
  }
  log.warn(
    { degradation: 'kartendaten-fehlen', eva: info.eva, bahnhof: info.name, grund },
    'Rueckfall auf das Standardmodell',
  );
  return {
    graph: syntheseGraph(info),
    info,
    hinweise: ['Kartendaten nicht verfügbar – Standardmodell mit ungefähren Angaben.'],
  };
}
