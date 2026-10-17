import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import type { HaltestellenClient } from '../clients/haltestellen.js';
import { HaltestellenAnfrageFehler, HaltestellenNichtVerfuegbarError } from '../clients/motis-pausen.js';
import { FehlendeZugangsdatenError } from '../clients/stations.js';
import { wegAusLuftlinie, wegAusPfad } from '../core/fussweg.js';
import { haversineM } from '../core/graph.js';
import { fuehreOrteZusammen } from '../core/orte.js';
import type { BahnhofTreffer, Gehprofil, Ort, Steigpunkt } from '../core/typen.js';
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

const NICHT_EINGERICHTET = {
  fehler: 'haltestellen-nicht-eingerichtet',
  detail: 'Haltestellen sind auf diesem Server nicht eingerichtet.',
};

const PROFILE: readonly Gehprofil[] = ['zuegig', 'normal', 'langsam'];
/** Ein Umstieg, keine Wanderung: weiter auseinander plant der Reiseplaner (F2). */
const HOECHSTABSTAND_M = 3000;

/** `undefined` = nicht angegeben, `null` = ungültig. */
function leseEbene(roh?: string): number | undefined | null {
  if (roh === undefined || roh === '') return undefined;
  const n = Number(roh);
  return Number.isInteger(n) && Math.abs(n) <= 20 ? n : null;
}

/** Eine Antwort für alle MOTIS-Fehler – die Ursache gehört ins Protokoll, nicht zum Nutzer. */
function motisFehler(e: unknown, reply: FastifyReply, log: FastifyBaseLogger, route: string): FastifyReply {
  if (e instanceof HaltestellenAnfrageFehler) {
    return reply.code(404).send({ fehler: 'haltestelle-unbekannt', detail: 'Diese Haltestelle ist gerade nicht bekannt.' });
  }
  if (e instanceof HaltestellenNichtVerfuegbarError) {
    log.warn({ degradation: 'haltestellen-unerreichbar', route, grund: e.message }, 'Haltestellendaten nicht verfuegbar');
    return reply.code(503).send({ fehler: 'haltestellen-nicht-verfuegbar', detail: 'Haltestellendaten gerade nicht verfügbar.' });
  }
  throw e;
}

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

  app.get<{ Querystring: { id?: string; lat?: string; lon?: string; typ?: string } }>(
    '/api/haltestelle/tafel',
    async (req, reply) => {
      const { id, typ } = req.query;
      const punkt = leseKoordinaten(req.query.lat, req.query.lon);
      if (!id || id.length > 300 || !punkt || (typ !== 'arr' && typ !== 'dep')) {
        return reply.code(400).send({ fehler: 'parameter-ungueltig', detail: 'id, lat, lon und typ (arr|dep) sind erforderlich' });
      }
      if (!o.haltestellen) return reply.code(503).send(NICHT_EINGERICHTET);
      try {
        const eintraege = await o.haltestellen.tafel({ id, ...punkt }, typ);
        // `stand` ist die Antwortzeit (F5); die Einträge können bis zu
        // HALTESTELLEN_TAFEL_TTL_MS (30 s) aus dem Zwischenspeicher stammen.
        return { eintraege, stand: new Date().toISOString() };
      } catch (e) {
        return motisFehler(e, reply, req.log, '/api/haltestelle/tafel');
      }
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>('/api/weg', async (req, reply) => {
    const q = req.query;
    const von = leseKoordinaten(q.vonLat, q.vonLon);
    const nach = leseKoordinaten(q.nachLat, q.nachLon);
    const vonLevel = leseEbene(q.vonLevel);
    const nachLevel = leseEbene(q.nachLevel);
    const profil = (q.profil ?? 'normal') as Gehprofil;
    const variante = q.variante ?? 'schnellste';
    const ziel = q.ziel?.trim();
    if (
      !von ||
      !nach ||
      vonLevel === null ||
      nachLevel === null ||
      !PROFILE.includes(profil) ||
      (variante !== 'schnellste' && variante !== 'barrierefrei') ||
      (ziel !== undefined && ziel.length > 80)
    ) {
      return reply.code(400).send({ fehler: 'parameter-ungueltig' });
    }
    if (haversineM(von.lat, von.lon, nach.lat, nach.lon) > HOECHSTABSTAND_M) {
      return reply
        .code(400)
        .send({ fehler: 'zu-weit', detail: 'Die beiden Steige liegen für einen Umstieg zu weit auseinander.' });
    }
    if (!o.haltestellen) return reply.code(503).send(NICHT_EINGERICHTET);
    const a: Steigpunkt = { ...von, ...(vonLevel !== undefined ? { level: vonLevel } : {}) };
    const b: Steigpunkt = { ...nach, ...(nachLevel !== undefined ? { level: nachLevel } : {}) };
    try {
      const pfad = await o.haltestellen.fussweg(a, b, variante === 'barrierefrei' ? 'WHEELCHAIR' : 'FOOT');
      const weg = pfad ? wegAusPfad(pfad, profil, ziel ? `zu ${ziel}` : undefined) : wegAusLuftlinie(a, b, profil);
      // Aufzugsstatus gibt es nur an DB-Bahnhöfen (FaSta), Spec 9.
      if (variante === 'barrierefrei') {
        weg.hinweise.push('Aufzugstatus an Haltestellen unbekannt – Anlagen können ausgefallen sein.');
      }
      return weg;
    } catch (e) {
      return motisFehler(e, reply, req.log, '/api/weg');
    }
  });
}
