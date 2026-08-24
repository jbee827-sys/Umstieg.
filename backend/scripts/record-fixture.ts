// Nimmt eine echte Overpass-Antwort als Test-Fixture auf.
// Aufruf: npx tsx scripts/record-fixture.ts <name> <lat> <lon> [radiusM]
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { overpassQuery } from '../src/clients/overpass.js';

const [name, latStr, lonStr, radiusStr] = process.argv.slice(2);
if (!name || !latStr || !lonStr) {
  console.error('Aufruf: npx tsx scripts/record-fixture.ts <name> <lat> <lon> [radiusM]');
  process.exit(1);
}

const antwort = await overpassQuery(Number(latStr), Number(lonStr), Number(radiusStr ?? 400));
const ordner = fileURLToPath(new URL('../test/fixtures/overpass/', import.meta.url));
await mkdir(ordner, { recursive: true });
const datei = `${ordner}${name}.json`;
await writeFile(datei, JSON.stringify(antwort));
console.log(`${name}: ${antwort.elements.length} Elemente → ${datei}`);
