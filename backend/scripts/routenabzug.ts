// Zieht eine vollstaendige /api/route-Antwort aus der OSM-Ablage, ohne Server
// und ohne Netz - dieselben Bausteine, die `routes/api.ts` zusammensetzt.
//
// Gebraucht fuer Abzuege der Navigationsansicht: Das Frontend soll mit ECHTEN
// Daten gezeichnet werden, nicht mit erfundenen. Ein erfundener Datensatz
// zeigt genau die Faelle nicht, an denen ein Bild scheitert.
//
// Aufruf: npx tsx scripts/routenabzug.ts <EVA> <gleisAn> <gleisAb> [abschnitt] [variante] [datei]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baueGraph, graphZuGeoJSON } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { generiereSchritte } from '../src/core/textgen.js';
import type { OverpassAntwort, RoutenVariante } from '../src/core/typen.js';
import { ABLAGE as CACHE } from './osm-ablage-fuellen.js';

const [eva, gleisAn, gleisAb, abschnitt = 'mitte', varianteRoh = 'schnellste', datei] =
  process.argv.slice(2);
if (!eva || !gleisAn || !gleisAb) {
  console.error(
    'Aufruf: npx tsx scripts/routenabzug.ts <EVA> <gleisAn> <gleisAb> [abschnitt] [variante] [datei]',
  );
  process.exit(2);
}
const variante = varianteRoh as RoutenVariante;

const pfadOsm = join(CACHE, `${eva}.json`);
if (!existsSync(pfadOsm)) {
  console.error(`EVA ${eva} liegt nicht in der Ablage (${CACHE})`);
  process.exit(2);
}

const graph = baueGraph(JSON.parse(readFileSync(pfadOsm, 'utf8')) as OverpassAntwort);
graph.stufe = klassifiziere(graph);

const start = findeStartknoten(graph, gleisAn, abschnitt);
const ziel = findeStartknoten(graph, gleisAb);
const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante, 'normal');
if (!pfad) {
  console.error(`Keine Route ${gleisAn} → ${gleisAb} (${variante})`);
  process.exit(1);
}

const antwort = {
  stufe: graph.stufe,
  schritte: generiereSchritte(pfad, { ungefaehr: graph.stufe === 3, profil: 'normal' }),
  gehzeitSek: gehzeitSekunden(pfad, 'normal'),
  karte: graphZuGeoJSON(graph, pfad),
  schema: baueBahnhofSchema(graph, pfad),
  hinweise: start.hinweis ? [start.hinweis] : [],
};

const text = JSON.stringify(antwort, null, 2);
if (datei) {
  writeFileSync(datei, text, 'utf8');
  console.error(
    `${eva} ${gleisAn}→${gleisAb} (${abschnitt}, ${variante}): Stufe ${antwort.stufe} · ` +
      `${antwort.schritte.length} Schritte · ${antwort.gehzeitSek} s · ` +
      `${antwort.schema.ebenen.length} Ebenenbesuche → ${datei}`,
  );
} else {
  process.stdout.write(text);
}
