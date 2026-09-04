import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  LogController,
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
import { Sicherheitsprotokoll } from './core/sicherheitsprotokoll.js';
import { registriereApiRouten, type ApiClients, type TafelFn } from './routes/api.js';
import {
  mitCache,
  FASTA_TTL_MS,
  STAMM_TTL_MS,
  SUCHE_TTL_MS,
  TAFEL_TTL_MS,
} from './cache/clients.js';
import { registriereLiveRouten, type SseGrenzen } from './routes/live.js';

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

/**
 * Grenzen je Route, je Aufrufer und Minute.
 *
 * Das Backend ist ein unauthentifizierter Proxy vor vier kostenpflichtigen
 * APIs. CORS schuetzt davor NICHT - es ist eine Regel fuer Browser, kein
 * Zugriffsschutz; `curl` ignoriert sie vollstaendig. Ohne diese Grenzen kann
 * jeder, der die Domain kennt, die Quoten leerlaufen lassen.
 *
 * Bewusst niedrig angesetzt: Hochsetzen ist eine Konfigurationsaenderung, eine
 * verbrauchte Quote ist eine Rechnung.
 */
const GRENZEN: Record<string, number> = {
  // Teuerste Route - Overpass, Stationsinfo und FaSta in einem Aufruf.
  '/api/route': 14,
  // Tippsuche. Im Frontend entprellt; ein Mensch loest ~10 je Minute aus.
  '/api/stations': 21,
  '/api/board/:eva': 21,
  // Gegen Wiederverbindungsstuerme. Die eigentliche Grenze fuer den Strom ist
  // die Zahl gleichzeitiger Verbindungen, nicht die der Anfragen.
  '/api/live/:eva': 14,
};

/** Fuer alles, was keine eigene Grenze hat. */
const STANDARD_GRENZE = 70;

export interface AppOptionen {
  /** Ueberschreibt die Voreinstellung - Tests reichen hier einen Sammelstrom herein. */
  logger?: FastifyServerOptions['logger'];
  /**
   * Obergrenzen des SSE-Stroms. Ohne Angabe gelten die Standardwerte aus
   * `routes/live.ts`; Tests setzen kleine Zahlen, damit sie die Grenze
   * erreichen koennen, ohne 140 Verbindungen zu oeffnen.
   */
  sseGrenzen?: SseGrenzen;
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
     * Ohne das ist `req.ip` auf Fly die Adresse des Fly-Proxys.
     *
     * Alle Besucher landeten dann in EINEM Zaehler der Ratenbegrenzung: Die
     * Grenze waere wirkungslos und wuerde beim ersten Andrang alle
     * gleichzeitig aussperren. Genau daran scheitern solche Konfigurationen
     * ueblicherweise - sie sehen richtig aus und zaehlen den Falschen.
     *
     * Vertretbar, weil ausschliesslich hinter dem Fly-Proxy betrieben, der
     * `X-Forwarded-For` selbst setzt. Direkt aus dem Netz erreichbar waere der
     * Wert faelschbar und die Grenze umgehbar.
     */
    trustProxy: true,
    /**
     * Protokolliert werden Ausfaelle, nicht Besucher.
     *
     * Fastify schreibt sonst je Anfrage einen Eintrag mit `url` und
     * `remoteAddress`. Beides bricht eine Zusage, die auf der
     * Datenschutzseite steht: „Die Anwendung fuehrt kein
     * Zugriffsprotokoll" und „Ein Zugriffsprotokoll mit Koordinaten wird
     * nicht gefuehrt". Die URL der Bahnhofssuche IST die Koordinate
     * (`/api/stations?lat=..&lon=..`) - die Rundung auf ~110 m macht sie zu
     * einem groberen Personenbezug, nicht zu keinem.
     *
     * Das war beim Einschalten der Protokollierung am 02.09.2026 niemandem
     * aufgefallen: Gewollt waren die Degradationseintraege, mitgekommen ist
     * das Anfrageprotokoll. Die bleiben aus; die Diagnose bleibt. Sie haengt
     * an einem Bahnhof, nicht an einem Menschen.
     *
     * Festgehalten in `test/datenschutz.test.ts`.
     *
     * Ueber `logController` statt der gleichnamigen Top-Level-Option: Die
     * entfaellt in Fastify 6 ersatzlos und trug bis zum 04.09.2026 bei jedem
     * Start und jedem Testlauf eine Deprecation-Warnung ein
     * (`test/datenschutz.test.ts`, "Kein Fastify-6-Deprecation-Hinweis
     * mehr"). Das Verhalten ist identisch: `LogController` liest dieselbe
     * `disableRequestLogging`-Option, nur eine Ebene tiefer.
     */
    logController: new LogController({ disableRequestLogging: true }),
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
   * Meldet, DASS eine Grenze gegriffen hat - nie, wer sie ausgeloest hat.
   * Begruendung und Form stehen in `core/sicherheitsprotokoll.ts`.
   */
  const sicherheit = new Sicherheitsprotokoll(app.log);

  /**
   * Ratenbegrenzung je Aufrufer und Route.
   *
   * Der Schluessel enthaelt die Route, nicht nur die Adresse: Sonst teilten
   * sich Tippsuche und Routenberechnung einen Zaehler, und wer den Bahnhof
   * sucht, sperrte sich die Wegberechnung selbst aus.
   *
   * Die Zaehler stehen ausschliesslich im Arbeitsspeicher. Sie werden nicht
   * geschrieben, nicht protokolliert und ueberleben keinen Neustart - die
   * Adresse wird verarbeitet, nicht gespeichert (Art. 6 Abs. 1 lit. f DSGVO,
   * ErwG 49). Was bei einer Ueberschreitung ins Protokoll geht, steht in
   * `core/sicherheitsprotokoll.ts` und traegt keinen Personenbezug.
   */
  app.register(rateLimit, {
    global: true,
    timeWindow: '1 minute',
    max: (req) => GRENZEN[req.routeOptions?.url ?? ''] ?? STANDARD_GRENZE,
    keyGenerator: (req) => `${req.ip}|${req.routeOptions?.url ?? 'unbekannt'}`,
    /*
     * Flys Gesundheitspruefung fragt regelmaessig an. Liefe sie in die Grenze,
     * hielte die Plattform die Maschine fuer tot und startete sie neu - die
     * Schutzmassnahme haette den Ausfall dann selbst erzeugt.
     */
    allowList: (req) => req.routeOptions?.url === '/api/health',
    /*
     * Das Plugin WIRFT dieses Objekt, es sendet es nicht. Deshalb traegt es
     * `statusCode` und `code`: So uebersetzt der vorhandene Fehlerbehandler
     * oben es von selbst in die Form, die die App ueberall benutzt
     * (`{ fehler, detail }`). Ohne `statusCode` wurde daraus ein 500er -
     * die Grenze griff, sah nach aussen aber wie ein Serverfehler aus.
     */
    /*
     * `key` traegt die Adresse - er wird bewusst NICHT weitergereicht.
     * Gemeldet wird allein das Routen-Muster.
     */
    onExceeded: (req) => sicherheit.melde('ratelimit', req.routeOptions?.url ?? 'unbekannt'),
    errorResponseBuilder: () => ({
      statusCode: 429,
      code: 'zu-viele-anfragen',
      message: 'Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten.',
    }),
  });

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

  /**
   * Die Tafel gibt es in ZWEI Ausfuehrungen - und das ist Absicht.
   *
   * `tafelRoh` geht immer hinaus und gehoert dem Live-Poller: Er ist die
   * Frischequelle. Ein Zwischenspeicher in seinem Pfad verschluckte genau die
   * Aenderung, wegen der es den SSE-Strom ueberhaupt gibt.
   *
   * `tafelFuerRouten` bedient die HTTP-Route und spart dort Quote. Die Frist
   * liegt unter dem Poll-Intervall (30 s), damit die abgerufene Anzeige nie
   * aelter ist als das, was der Strom daneben schon gemeldet hat.
   *
   * Zwischengespeichert wird nur, was NICHT hereingereicht wurde: Tests mit
   * Fixture-Clients zaehlen Aufrufe, ein Speicher darunter machte diese
   * Zaehlung bedeutungslos.
   */
  const tafelRoh: TafelFn = clients.tafel ?? ((eva, typ) => holeTafel(eva, typ));
  const tafelFuerRouten: TafelFn = clients.tafel
    ? tafelRoh
    : mitCache(tafelRoh, (eva, typ) => `${eva}|${typ}`, TAFEL_TTL_MS, 200);

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
      async (eva) => [...(await tafelRoh(eva, 'arr')), ...(await tafelRoh(eva, 'dep'))],
      undefined,
      app.log,
    );

  /**
   * Die Routen kommen in einem eigenen Zusammenhang - und zwar NACH der
   * Ratenbegrenzung.
   *
   * `onRoute`-Haken feuern sofort, wenn eine Route angemeldet wird.
   * `app.register()` ist dagegen aufgeschoben: Wuerden die Routen wie zuvor
   * direkt daneben angemeldet, existierte der Haken der Ratenbegrenzung zu
   * diesem Zeitpunkt noch nicht - das Plugin waere geladen, die Grenzen aber
   * an keine einzige Route geknuepft. Es sah dann genau so aus wie jetzt, nur
   * ohne Wirkung.
   *
   * Zwei aufgeschobene Registrierungen laufen dagegen in ihrer Reihenfolge.
   * `test/ratelimit.test.ts` haelt das fest.
   */
  app.register(async (instanz) => {
    instanz.get('/api/health', async () => ({ status: 'ok' }));

    registriereApiRouten(instanz, {
      overpass: clients.overpass ?? ((lat, lon, radiusM) => overpassQuery(lat, lon, radiusM)),
      stations: clients.stations ?? {
        sucheBahnhoefe: mitCache((q: string) => sucheBahnhoefe(q), (q) => q, SUCHE_TTL_MS, 500),
        /**
         * BEWUSST OHNE Zwischenspeicher.
         *
         * Der Schluessel waere die Koordinate. Sie zehn Minuten lang zu
         * halten widerspraeche der Zusage auf der Datenschutzseite, der
         * Server verarbeite sie im Arbeitsspeicher und verwerfe sie danach -
         * ein Cache-Schluessel IST eine Aufbewahrung, auch wenn er nur im RAM
         * steht.
         *
         * Es geht dabei auch nichts verloren: Gegen den Missbrauchsfall
         * wuerde ein Speicher ohnehin nicht helfen, weil geraten Koordinaten
         * jedes Mal einen neuen Schluessel bilden. Dagegen steht die
         * Ratenbegrenzung.
         */
        sucheBahnhoefeNahebei: (lat, lon, radiusM) => sucheBahnhoefeNahebei(lat, lon, radiusM),
        holeStationsInfo: mitCache(
          (eva: string) => holeStationsInfo(eva),
          (eva) => eva,
          STAMM_TTL_MS,
          500,
        ),
        ermittleGruppe: mitCache((eva: string) => holeGruppe(eva), (eva) => eva, STAMM_TTL_MS, 500),
      },
      tafel: tafelFuerRouten,
      wagenposition:
        clients.wagenposition ?? ((zug, datum, wagen) => holeWagenposition(zug, datum, wagen)),
      fasta:
        clients.fasta ??
        mitCache((nr: string) => holeAnlagen(nr), (nr) => nr, FASTA_TTL_MS, 200),
    });

    registriereLiveRouten(
      instanz,
      ueberwachung,
      erlaubteHerkuenfte,
      optionen.sseGrenzen,
      sicherheit,
    );
  });

  return app;
}
