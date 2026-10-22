// Zeichnet die Routen der Einfuehrungstour auf (Plan Einfuehrungstour,
// Paket 1): Berlin Hbf, Gleis 14 → 6 - jede Kombination aus Variante und
// Standort am Bahnsteig, die die App fuer diese Reise abfragt. Offline aus
// dem Startbestand, ohne Server, ohne Netz und ohne Schluessel; dieselben
// Bausteine wie /api/route (Vorbild: scripts/routenabzug.ts).
//
// Die Tour fuehrt die echte App vor, nur ihre Datenquelle ist eine andere
// (frontend/src/einfuehrung/vorfuehrquelle.ts). Deshalb liegen hier echte
// Antworten und keine erfundenen - und was das Backend mit 404 beantworten
// wuerde, steht als 404 darin.
//
// Erneut laufen lassen nach jeder Erneuerung des Startbestands
// (scripts/bestand-fuellen.ts):
//
//   cd backend && npm run vorfuehrdaten
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { baueGraph, graphZuGeoJSON } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { generiereSchritte } from '../src/core/textgen.js';
import type { OverpassAntwort, RoutenVariante } from '../src/core/typen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';

/** Die Beispielreise (Plan Abschnitt 1, abgestimmt mit Julian). */
export const REISE = { eva: '8011160', gleisAn: '14', gleisAb: '6' } as const;

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
export const ZIEL = fileURLToPath(new URL('../../frontend/src/einfuehrung/daten/', import.meta.url));

/** Wie frontend/src/api/varianten.ts (ANGEBOTENE) und api/standorte.ts (ABSCHNITTE). */
const VARIANTEN: RoutenVariante[] = ['schnellste', 'barrierefrei', 'mit-stopp'];
const ABSCHNITTE = ['anfang', 'mitte', 'ende'] as const;

/** Der Text, mit dem /api/route eine Variante ohne Weg beantwortet (routes/api.ts). */
function keineRouteText(variante: RoutenVariante): string {
  return variante === 'barrierefrei'
    ? 'Keine barrierefreie Route gefunden (Treppen gesperrt, kein nutzbarer Aufzug).'
    : variante === 'mit-stopp'
      ? 'Kein WC und kein Kiosk auf dem Weg gefunden.'
      : 'Keine Route zwischen den Gleisen gefunden.';
}

export type Aufzeichnung =
  | {
      status: 200;
      antwort: {
        stufe: number;
        schritte: unknown[];
        gehzeitSek: number;
        karte: unknown;
        schema: unknown;
        hinweise: string[];
      };
    }
  | { status: 404; antwort: { fehler: 'keine-route'; detail: string; hinweise: string[] } };

/** Schluessel `variante|abschnitt` → Antwort, wie /api/route sie gaebe. */
export function zeichneAuf(osm: OverpassAntwort, gleisAn: string, gleisAb: string): Record<string, Aufzeichnung> {
  const graph = baueGraph(osm);
  graph.stufe = klassifiziere(graph);
  const ziel = findeStartknoten(graph, gleisAb);
  const daten: Record<string, Aufzeichnung> = {};
  for (const variante of VARIANTEN) {
    for (const abschnitt of ABSCHNITTE) {
      const start = findeStartknoten(graph, gleisAn, abschnitt);
      const hinweise = start.hinweis ? [start.hinweis] : [];
      const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante, 'normal');
      daten[`${variante}|${abschnitt}`] = pfad
        ? {
            status: 200,
            antwort: {
              stufe: graph.stufe,
              schritte: generiereSchritte(pfad, { ungefaehr: graph.stufe === 3, profil: 'normal' }),
              gehzeitSek: gehzeitSekunden(pfad, 'normal'),
              karte: graphZuGeoJSON(graph, pfad),
              schema: baueBahnhofSchema(graph, pfad),
              hinweise,
            },
          }
        : { status: 404, antwort: { fehler: 'keine-route', detail: keineRouteText(variante), hinweise } };
    }
  }
  return daten;
}

async function main(): Promise<void> {
  const eintrag = await entpackeEintrag(readFileSync(join(BESTAND, `${REISE.eva}.json.gz`)));
  const routen = zeichneAuf(eintrag.osm, REISE.gleisAn, REISE.gleisAb);
  mkdirSync(ZIEL, { recursive: true });
  const datei = join(ZIEL, 'berlin-hbf-14-6.json');
  const text = JSON.stringify({ ...REISE, startbestandVom: eintrag.geholtAm, routen });
  writeFileSync(datei, text, 'utf8');
  const kb = (n: number) => `${Math.round(n / 1024)} kB`;
  for (const [schluessel, a] of Object.entries(routen)) {
    console.error(
      `  ${schluessel.padEnd(20)} ${a.status === 200 ? `${a.antwort.gehzeitSek} s, ${a.antwort.schritte.length} Schritte` : '404'}`,
    );
  }
  // Ziel laut Plan: unter 150 kB gzip. Ausgeliefert wird gepackt.
  console.error(`→ ${datei}: ${kb(text.length)}, gzip ${kb(gzipSync(text).length)}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('vorfuehrdaten.ts')) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
