import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { holeAnlagen } from './clients/fasta.js';
import { overpassQuery } from './clients/overpass.js';
import { holeStationsInfo, sucheBahnhoefe, sucheBahnhoefeNahebei } from './clients/stations.js';
import { holeTafel } from './clients/timetables.js';
import { holeWagenposition } from './clients/wagenreihung.js';
import { Ueberwachung } from './core/ueberwachung.js';
import { registriereApiRouten, type ApiClients } from './routes/api.js';
import { registriereLiveRouten } from './routes/live.js';

export interface AppClients extends ApiClients {
  /** Überwachung ist injizierbar, damit Tests die Polls selbst auslösen können. */
  ueberwachung: Ueberwachung;
}

// App-Factory ohne listen(): per app.inject() testbar; Clients injizierbar
// (Tests nutzen Fixture-Clients, Produktion die echten).
export function buildApp(clients: Partial<AppClients> = {}): FastifyInstance {
  const app = Fastify({ logger: false });

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

  app.get('/api/health', async () => ({ status: 'ok' }));

  const tafel = clients.tafel ?? ((eva, typ) => holeTafel(eva, typ));

  registriereApiRouten(app, {
    overpass: clients.overpass ?? ((lat, lon, radiusM) => overpassQuery(lat, lon, radiusM)),
    stations: clients.stations ?? {
      sucheBahnhoefe: (q) => sucheBahnhoefe(q),
      sucheBahnhoefeNahebei: (lat, lon, radiusM) => sucheBahnhoefeNahebei(lat, lon, radiusM),
      holeStationsInfo: (eva) => holeStationsInfo(eva),
    },
    tafel,
    wagenposition:
      clients.wagenposition ?? ((zug, datum, wagen) => holeWagenposition(zug, datum, wagen)),
    fasta: clients.fasta ?? ((eva) => holeAnlagen(eva)),
  });

  // Eine Überwachung je App-Instanz. Sie beobachtet beide Tafeln, damit sowohl
  // der Ankunfts- als auch der Anschlusszug erfasst ist; gepollt wird trotzdem
  // nur einmal je EVA (Konzeptkorrektur 1).
  const ueberwachung =
    clients.ueberwachung ??
    new Ueberwachung(async (eva) => [...(await tafel(eva, 'arr')), ...(await tafel(eva, 'dep'))]);
  registriereLiveRouten(app, ueberwachung);

  return app;
}
