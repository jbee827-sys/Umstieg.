// Holt einzelne Bahnhoefe des Startbestands neu - mit der Abfrage und
// Version, die fuer ihren Schluessel gilt (osm/pt-bahnsteige.ts). Name und
// Koordinaten kommen aus dem vorhandenen Eintrag; keine DB-Anfrage.
//
// Aufruf (aus backend/):  npx tsx scripts/bestand-einzeln.ts 8000105 [weitere Schluessel]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OVERPASS_RADIUS_M, overpassQuery } from '../src/clients/overpass.js';
import { erzeugeOverpassPausen } from '../src/clients/overpass-pausen.js';
import { dateiname, entpackeEintrag, packeEintrag } from '../src/osm/bestand.js';
import { mitPtBahnsteigen } from '../src/osm/pt-bahnsteige.js';
import { abfrageVersionFuer } from '../src/osm/version.js';
import { BESTAND } from './bestand-fuellen.js';

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const pausen = erzeugeOverpassPausen();
let fehler = 0;
for (const schluessel of process.argv.slice(2)) {
  const pfad = join(BESTAND, dateiname(schluessel));
  const alt = await entpackeEintrag(readFileSync(pfad));
  let ok = false;
  for (let versuch = 1; versuch <= 3 && !ok; versuch++) {
    try {
      const osm = await overpassQuery(alt.lat, alt.lon, OVERPASS_RADIUS_M, fetch, 2000, undefined, pausen, mitPtBahnsteigen(schluessel));
      writeFileSync(pfad, await packeEintrag({ ...alt, geholtAm: new Date().toISOString(), abfrageVersion: abfrageVersionFuer(schluessel), osm }));
      console.log(`${alt.name} (${schluessel}): ${alt.osm.elements.length} -> ${osm.elements.length} Elemente, Version ${abfrageVersionFuer(schluessel)}`);
      ok = true;
    } catch (e) {
      console.log(`${alt.name} Versuch ${versuch}: ${String(e).slice(0, 80)}`);
      await warte(15_000 * versuch);
    }
  }
  if (!ok) fehler++;
  await warte(2000);
}
if (fehler) process.exit(1);
