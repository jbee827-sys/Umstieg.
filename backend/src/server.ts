import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { registriereHerunterfahren } from './herunterfahren.js';
import { LISTEN_HOST } from './server-host.js';
import type { ApiClients } from './routes/api.js';
import type { OverpassAntwort } from './core/typen.js';

const port = Number(process.env.PORT ?? 3001);

/**
 * Dev-Modus ohne DB-Zugang: FIXTURE_EVA=berlin npm run dev
 * → /api/route läuft gegen das Berlin-Hbf-Overpass-Fixture, /api/stations
 * liefert einen festen Treffer. Nur für lokale Frontend-Entwicklung.
 *
 * Überschrieben werden nur `overpass` und `stations`. Tafel, Wagenreihung und
 * FaSta fallen auf die echten Clients durch - mit DB-Zugang ergibt das die
 * nützlichste Mischung: verlässliche Geometrie aus der Aufzeichnung, echte
 * Live-Daten darüber.
 */
/**
 * Berlin Hbf ist drei Verkehrsstellen. Unter der EVA, die die Suche liefert
 * (8011160), steht KEINE Abfahrt - die Züge hängen an 8098160 (tief) und
 * 8089021 (Stadtbahn). Gab die Fixture hier nur `[eva]` zurück, blieb die
 * Live-Tafel leer und der Fixture-Modus widersprach genau dem Befund, den er
 * nachstellen soll.
 */
const BERLIN_HBF_GRUPPE = ['8011160', '8098160', '8089021'];
function fixtureClients(): Partial<ApiClients> {
  if (!process.env.FIXTURE_EVA) return {};
  const pfad = fileURLToPath(new URL('../test/fixtures/overpass/berlin-hbf.json', import.meta.url));
  const osm = JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
  console.log('FIXTURE-Modus aktiv: Berlin Hbf aus Overpass-Fixture, keine externen Aufrufe.');
  return {
    overpass: async () => osm,
    stations: {
      sucheBahnhoefe: async () => [
        { name: 'Berlin Hbf', eva: '8011160', lat: 52.5251, lon: 13.3694 },
      ],
      sucheBahnhoefeNahebei: async () => [
        { name: 'Berlin Hbf', eva: '8011160', lat: 52.5251, lon: 13.3694 },
      ],
      holeStationsInfo: async (eva) => ({
        eva,
        name: 'Berlin Hbf',
        lat: 52.5251,
        lon: 13.3694,
        evas: BERLIN_HBF_GRUPPE,
        gleise: [],
      }),
      ermittleGruppe: async () => BERLIN_HBF_GRUPPE,
    },
  };
}

const app = buildApp(fixtureClients());
// SIGINT (Fly) und SIGTERM: Stroeme beenden, Zaehlerstunde schreiben, dann aus.
registriereHerunterfahren(app);

app
  .listen({ port, host: LISTEN_HOST })
  .then(() => console.log(`Umstieg. Backend läuft auf Port ${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
