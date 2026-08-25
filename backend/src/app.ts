import Fastify, { type FastifyInstance } from 'fastify';
import { overpassQuery } from './clients/overpass.js';
import { holeStationsInfo, sucheBahnhoefe } from './clients/stations.js';
import { registriereApiRouten, type ApiClients } from './routes/api.js';

// App-Factory ohne listen(): per app.inject() testbar; Clients injizierbar
// (Tests nutzen Fixture-Clients, Produktion die echten).
export function buildApp(clients: Partial<ApiClients> = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok' }));

  registriereApiRouten(app, {
    overpass: clients.overpass ?? ((lat, lon, radiusM) => overpassQuery(lat, lon, radiusM)),
    stations: clients.stations ?? {
      sucheBahnhoefe: (q) => sucheBahnhoefe(q),
      holeStationsInfo: (eva) => holeStationsInfo(eva),
    },
  });

  return app;
}
