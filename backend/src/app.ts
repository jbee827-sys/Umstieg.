import cors from '@fastify/cors';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { holeAnlagen } from './clients/fasta.js';
import { overpassQuery } from './clients/overpass.js';
import {
  holeGruppe,
  holeStationsInfo,
  sucheBahnhoefe,
  sucheBahnhoefeNahebei,
} from './clients/stations.js';
import { holeTafel } from './clients/timetables.js';
import { holeWagenposition } from './clients/wagenreihung.js';
import { Ueberwachung } from './core/ueberwachung.js';
import { registriereApiRouten, type ApiClients } from './routes/api.js';
import { registriereLiveRouten } from './routes/live.js';

export interface AppClients extends ApiClients {
  /** Überwachung ist injizierbar, damit Tests die Polls selbst auslösen können. */
  ueberwachung: Ueberwachung;
}

/**
 * Voreinstellung der Protokollierung.
 *
 * In Tests still, sonst an. Das Backend lief lange mit `logger: false` -
 * jeder dokumentierte Rueckfall geschah damit lautlos. Als Overpass am
 * 01.09.2026 stundenlang ausfiel, liess sich das nur feststellen, indem man
 * die API von Hand abfragte und aus "Stufe 3" auf die Ursache schloss.
 */
function standardLogger(): FastifyServerOptions['logger'] {
  if (process.env.NODE_ENV === 'test') return false;
  return { level: process.env.LOG_LEVEL ?? 'info' };
}

export interface AppOptionen {
  /** Ueberschreibt die Voreinstellung - Tests reichen hier einen Sammelstrom herein. */
  logger?: FastifyServerOptions['logger'];
}

// App-Factory ohne listen(): per app.inject() testbar; Clients injizierbar
// (Tests nutzen Fixture-Clients, Produktion die echten).
export function buildApp(
  clients: Partial<AppClients> = {},
  optionen: AppOptionen = {},
): FastifyInstance {
  const app = Fastify({
    logger: optionen.logger ?? standardLogger(),
    /**
     * Protokolliert werden Ausfaelle, nicht Besucher.
     *
     * Fastify schreibt sonst je Anfrage einen Eintrag mit `url` und
     * `remoteAddress`. Beides bricht eine Zusage, die auf der
     * Datenschutzseite steht: „Die Anwendung selbst schreibt keine
     * Protokolle" und „Ein Zugriffsprotokoll mit Koordinaten wird nicht
     * gefuehrt". Die URL der Bahnhofssuche IST die Koordinate
     * (`/api/stations?lat=..&lon=..`) - die Rundung auf ~110 m macht sie zu
     * einem groberen Personenbezug, nicht zu keinem.
     *
     * Das war beim Einschalten der Protokollierung am 02.09.2026 niemandem
     * aufgefallen: Gewollt waren die Degradationseintraege, mitgekommen ist
     * das Anfrageprotokoll. Die bleiben aus; die Diagnose bleibt. Sie haengt
     * an einem Bahnhof, nicht an einem Menschen.
     *
     * Festgehalten in `test/datenschutz.test.ts`.
     */
    disableRequestLogging: true,
  });

  // CORS nur, wenn ausdruecklich konfiguriert.
  //
  // In der Entwicklung laeuft alles ueber den Vite-Proxy und ist damit
  // same-origin – dort werden keine CORS-Header gebraucht, und keine zu
  // senden ist die sicherere Voreinstellung.
  //
  // In Produktion liegt das Frontend auf Vercel und das Backend auf einer
  // anderen Domain. CORS_ORIGIN nennt die erlaubten Herkuenfte, kommagetrennt
  // (Produktionsdomain plus ggf. Vercel-Vorschau-URLs). Die API ist
  // ausschliesslich lesend, deshalb reicht GET.
  const erlaubteHerkuenfte = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (erlaubteHerkuenfte.length > 0) {
    app.register(cors, { origin: erlaubteHerkuenfte, methods: ['GET'] });
  }

  /**
   * Serverfehler melden - die Stelle, nicht den Anfragenden.
   *
   * `disableRequestLogging` nimmt Fastify auch die eigene Fehlermeldung ab.
   * Ohne diesen Behandler waere ein 500er voellig still, und das waere der
   * Zustand, gegen den diese Runde ueberhaupt angeht: ein Fehler, den
   * niemand sieht.
   *
   * Protokolliert wird das Routen-MUSTER (`/api/stations`), nicht die
   * aufgerufene URL. Der Unterschied ist genau die Abfragezeichenkette - und
   * die traegt bei der Bahnhofssuche die Koordinate.
   *
   * Fehler unterhalb von 500 sind keine Vorfaelle, sondern Antworten auf
   * fehlerhafte Anfragen (400, 404). Sie gehen unprotokolliert durch, sonst
   * kann jeder Aufrufer das Protokoll von aussen fuellen.
   */
  app.setErrorHandler((fehler: FastifyError, req, reply) => {
    const status = fehler.statusCode ?? 500;
    if (status >= 500) {
      req.log.error(
        {
          route: req.routeOptions?.url ?? 'unbekannt',
          methode: req.method,
          fehler: String(fehler),
          stapel: fehler.stack,
        },
        'Unbehandelter Serverfehler',
      );
    }
    return reply.code(status).send({
      fehler: status >= 500 ? 'serverfehler' : (fehler.code ?? 'anfrage-ungueltig'),
      detail: status >= 500 ? 'Interner Serverfehler.' : fehler.message,
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  const tafel = clients.tafel ?? ((eva, typ) => holeTafel(eva, typ));

  registriereApiRouten(app, {
    overpass: clients.overpass ?? ((lat, lon, radiusM) => overpassQuery(lat, lon, radiusM)),
    stations: clients.stations ?? {
      sucheBahnhoefe: (q) => sucheBahnhoefe(q),
      sucheBahnhoefeNahebei: (lat, lon, radiusM) => sucheBahnhoefeNahebei(lat, lon, radiusM),
      holeStationsInfo: (eva) => holeStationsInfo(eva),
      ermittleGruppe: (eva) => holeGruppe(eva),
    },
    tafel,
    wagenposition:
      clients.wagenposition ?? ((zug, datum, wagen) => holeWagenposition(zug, datum, wagen)),
    fasta: clients.fasta ?? ((stationsnummer) => holeAnlagen(stationsnummer)),
  });

  // Eine Überwachung je App-Instanz. Sie beobachtet beide Tafeln, damit sowohl
  // der Ankunfts- als auch der Anschlusszug erfasst ist; gepollt wird trotzdem
  // nur einmal je EVA (Konzeptkorrektur 1).
  //
  // `app.log` reicht die Protokollierung bis in den Poller. Ohne ihn war ein
  // Ausfall von Timetables im Betrieb an nichts zu erkennen: Der SSE-Strom
  // bleibt offen und wird nur stumm.
  const ueberwachung =
    clients.ueberwachung ??
    new Ueberwachung(
      async (eva) => [...(await tafel(eva, 'arr')), ...(await tafel(eva, 'dep'))],
      undefined,
      app.log,
    );
  registriereLiveRouten(app, ueberwachung, erlaubteHerkuenfte);

  return app;
}
