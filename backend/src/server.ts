import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { LISTEN_HOST } from './server-host.js';
import type { ApiClients } from './routes/api.js';
import type { OverpassAntwort } from './core/typen.js';

const port = Number(process.env.PORT ?? 3001);

/**
 * Dev-Modus ohne DB-Zugang: FIXTURE_EVA=berlin npm run dev
 * → /api/route läuft gegen das Berlin-Hbf-Overpass-Fixture, /api/stations
 * liefert einen festen Treffer. Nur für lokale Frontend-Entwicklung.
 */
function fixtureClients(): Partial<ApiClients> {
  if (!process.env.FIXTURE_EVA) return {};
  const pfad = fileURLToPath(new URL('../test/fixtures/overpass/berlin-hbf.json', import.meta.url));
  const osm = JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
  console.log('FIXTURE-Modus aktiv: Berlin Hbf aus Overpass-Fixture, keine externen Aufrufe.');
  return {
    overpass: async () => osm,
    stations: {
      sucheBahnhoefe: async () => [
        { name: 'Berlin Hbf (Fixture)', eva: '8011160', lat: 52.5251, lon: 13.3694 },
      ],
      sucheBahnhoefeNahebei: async () => [
        { name: 'Berlin Hbf (Fixture)', eva: '8011160', lat: 52.5251, lon: 13.3694 },
      ],
      holeStationsInfo: async (eva) => ({
        eva,
        name: 'Berlin Hbf (Fixture)',
        lat: 52.5251,
        lon: 13.3694,
        evas: [eva],
        gleise: [],
      }),
      ermittleGruppe: async (eva) => [eva],
    },
  };
}

const app = buildApp(fixtureClients());

app
  .listen({ port, host: LISTEN_HOST })
  .then(() => console.log(`Umstiegs-Navigator Backend läuft auf Port ${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
