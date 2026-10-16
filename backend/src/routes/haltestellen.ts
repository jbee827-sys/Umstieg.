import type { FastifyInstance } from 'fastify';
import type { HaltestellenClient } from '../clients/haltestellen.js';
import { FehlendeZugangsdatenError } from '../clients/stations.js';
import { fuehreOrteZusammen } from '../core/orte.js';
import type { BahnhofTreffer, Ort } from '../core/typen.js';
import { leseKoordinaten, sucheBahnhoefeMitVarianten, type StationsClient } from './api.js';

/**
 * Routen des Haltestellenpfads (Umstieg 2.0, Spec 5.2). Die Routen des
 * Bahnhofspfads in `api.ts` bleiben unverändert (F1).
 *
 * Kein Fehler von MOTIS darf den Bahnhofspfad beeinträchtigen (F6): Jede
 * Route hier fängt MOTIS-Fehler selbst und antwortet mit einem eigenen Code.
 */

/**
 * Wie es einer Quelle bei dieser Anfrage ging. Das Frontend braucht den
 * Unterschied: `zugang-fehlt` öffnet die EVA-Ersatzeingabe, `ausfall` einen
 * Hinweis, `nicht-eingerichtet` gar nichts.
 */
export type QuellenStand = 'ok' | 'zugang-fehlt' | 'ausfall' | 'nicht-eingerichtet';

export interface OrteAntwort {
  orte: Ort[];
  quellen: { bahnhoefe: QuellenStand; haltestellen: QuellenStand };
}

export interface HaltestellenRoutenOptionen {
  stations: StationsClient;
  /** `null` = nicht eingerichtet (`MOTIS_BASIS_URL` fehlt). */
  haltestellen: HaltestellenClient | null;
}

/** Derselbe Umkreis wie die Standortsuche in `/api/stations`. */
const ERKENNUNG_RADIUS_M = 1000;

export function registriereHaltestellenRouten(app: FastifyInstance, o: HaltestellenRoutenOptionen): void {
  app.get<{ Querystring: { q?: string; lat?: string; lon?: string } }>('/api/orte', async (req, reply) => {
    const q = req.query.q?.trim();
    const hatKoordinaten = req.query.lat !== undefined || req.query.lon !== undefined;
    if (!q && !hatKoordinaten) {
      return reply.code(400).send({ fehler: 'parameter-fehlt', detail: 'q oder lat+lon ist erforderlich' });
    }
    if (q && hatKoordinaten) {
      return reply.code(400).send({ fehler: 'parameter-ungueltig', detail: 'q und lat/lon schliessen sich aus' });
    }
    const punkt = hatKoordinaten ? leseKoordinaten(req.query.lat, req.query.lon) : null;
    if (hatKoordinaten && !punkt) {
      return reply.code(400).send({ fehler: 'parameter-ungueltig', detail: 'lat und lon muessen gueltig sein' });
    }

    // Beide Quellen nebeneinander: Fällt eine aus, bleibt die andere (K5).
    const [db, motis] = await Promise.allSettled([
      punkt
        ? o.stations.sucheBahnhoefeNahebei(punkt.lat, punkt.lon, ERKENNUNG_RADIUS_M)
        : sucheBahnhoefeMitVarianten(o.stations, q!),
      o.haltestellen
        ? punkt
          ? o.haltestellen.orteNahebei(punkt.lat, punkt.lon)
          : o.haltestellen.sucheOrte(q!)
        : Promise.resolve([]),
    ]);

    const quellen: OrteAntwort['quellen'] = {
      bahnhoefe:
        db.status === 'fulfilled' ? 'ok' : db.reason instanceof FehlendeZugangsdatenError ? 'zugang-fehlt' : 'ausfall',
      haltestellen: !o.haltestellen ? 'nicht-eingerichtet' : motis.status === 'fulfilled' ? 'ok' : 'ausfall',
    };
    // Protokolliert wird der Ausfall, nie der Suchtext oder die Koordinate
    // (Datenschutzzusage, siehe `app.ts`).
    if (motis.status === 'rejected') {
      req.log.warn(
        { degradation: 'haltestellen-unerreichbar', route: '/api/orte', grund: String(motis.reason) },
        'Ortssuche ohne MOTIS - nur Bahnhoefe',
      );
    }
    if (quellen.bahnhoefe === 'ausfall') {
      req.log.warn(
        { degradation: 'bahnhofssuche-unerreichbar', route: '/api/orte', grund: String((db as PromiseRejectedResult).reason) },
        'Ortssuche ohne RIS::Stations - nur Haltestellen',
      );
    }

    // Ein echter Ausfall ohne jede Antwort ist ein 503. Fehlen beide Quellen
    // nur, weil sie nicht eingerichtet sind, ist eine leere Liste die ehrliche
    // Antwort – das Frontend zeigt dann wie heute die EVA-Ersatzeingabe.
    const keineQuelle = quellen.bahnhoefe !== 'ok' && quellen.haltestellen !== 'ok';
    const echterAusfall = quellen.bahnhoefe === 'ausfall' || quellen.haltestellen === 'ausfall';
    if (keineQuelle && echterAusfall) {
      return reply
        .code(503)
        .send({ fehler: 'orte-nicht-verfuegbar', detail: 'Die Ortssuche ist gerade nicht erreichbar.', quellen });
    }

    const bahnhoefe: BahnhofTreffer[] = db.status === 'fulfilled' ? db.value : [];
    const haltestellen: Ort[] = motis.status === 'fulfilled' ? motis.value : [];
    return { orte: fuehreOrteZusammen(bahnhoefe, haltestellen), quellen } satisfies OrteAntwort;
  });
}
