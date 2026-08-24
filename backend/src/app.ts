import Fastify, { type FastifyInstance } from 'fastify';

// App-Factory ohne listen(): so per app.inject() testbar und später
// mit injizierbaren Clients (Overpass, DB-APIs) erweiterbar.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
