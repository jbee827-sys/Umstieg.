// Fuellt die OSM-Ablage der Simulationen - und NUR das.
//
// Getrennt von der Auswertung, weil beide verschieden schnell sind: Ein
// Overpass-Abruf dauert bis zu einer Minute und scheitert unter Last, die
// Auswertung ueber hundert abgelegte Bahnhoefe dauert Sekunden. Wer beides in
// einem Lauf macht, wertet mit dem Code von vor einer Stunde aus.
//
// Zwei Ablagen:
//   <EVA>.json   die Overpass-Antwort, wie gehabt
//   namen.json   Bahnhofsname -> { eva, lat, lon }
//
// Die zweite ist neu (14.09.2026). Der Standortlauf vom 13.09. verlor 20
// Bahnhoefe nicht an Overpass, sondern an der DB-API: Er schlug jeden Namen
// neu nach, auch mit `ABLAGE_NUR=1`, und lief in deren Drosselung. Ein Lauf
// ohne Netz muss auch ohne Namenssuche auskommen.
//
// Aufruf: npx tsx scripts/osm-ablage-fuellen.ts [Name ...]
//         ohne Namen: die Liste LAUF_3 unten
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { overpassQuery } from '../src/clients/overpass.js';
import { sucheBahnhoefe } from '../src/clients/stations.js';

export const ABLAGE = join(
  homedir(), 'AppData', 'Local', 'Temp', 'claude', 'D--Claude-code',
  '6db04a47-3c2c-491e-84a8-985fc6d8dc06', 'scratchpad', 'osm-cache',
);
const NAMEN = join(ABLAGE, 'namen.json');

/**
 * Dritter Durchgang (14.09.2026).
 *
 * Erstens der NACHLAUF: die 18 Bahnhoefe, die der zweite Schemalauf an
 * Overpass-Zeitueberschreitungen verlor. Sie waren nie gemessen.
 *
 * Zweitens neue Bahnhoefe - in KEINEM der beiden bisherigen Laeufe dabei.
 * Die drei Metropolknoten bleiben Pflicht; dazu ihre zweite Reihe (Berlin
 * Friedrichstrasse, Ostkreuz, Frankfurt Sued, Muenchen Ost), weil dort die
 * Ebenen am dichtesten liegen, und eine Breite aus Kopf-, Durchgangs- und
 * Kreuzungsbahnhoefen aller Groessen.
 */
export const NACHLAUF = [
  'München-Pasing', 'Düsseldorf Flughafen', 'Essen-Steele', 'Offenburg',
  'Friedrichshafen Stadt', 'Kempten(Allgäu)Hbf', 'Stendal', 'Wittenberge',
  'Neubrandenburg', 'Stralsund Hbf', 'Emden Hbf', 'Paderborn Hbf',
  'Solingen Hbf', 'Montabaur', 'Wetzlar', 'Eisenach', 'Gotha', 'Weimar',
];

export const LAUF_3 = [
  // Metropolen (Pflicht) und ihre zweite Reihe
  'Berlin Hbf', 'Frankfurt(Main)Hbf', 'München Hbf',
  'Berlin Friedrichstraße', 'Berlin Alexanderplatz', 'Berlin Ostkreuz', 'Berlin-Spandau',
  'Berlin Potsdamer Platz', 'Berlin-Lichtenberg', 'Frankfurt(Main)Süd', 'München Ost',
  'Hamburg-Harburg', 'Köln/Bonn Flughafen', 'Leipzig/Halle Flughafen',
  // Rhein-Main, Ruhr, Rheinland
  'Hanau Hbf', 'Darmstadt Hbf', 'Wiesbaden Hbf', 'Aschaffenburg Hbf', 'Offenbach(Main)Hbf',
  'Bochum Hbf', 'Gelsenkirchen Hbf', 'Mülheim(Ruhr)Hbf', 'Recklinghausen Hbf', 'Neuss Hbf',
  'Siegburg/Bonn', 'Düren',
  // Nord und Ost
  'Potsdam Hbf', 'Frankfurt(Oder)', 'Lutherstadt Wittenberg Hbf', 'Bitterfeld',
  'Hildesheim Hbf', 'Celle', 'Wolfsburg Hbf', 'Lübeck Hbf', 'Neumünster', 'Bremerhaven Hbf',
  'Rheine', 'Herford', 'Goslar', 'Hameln', 'Halberstadt', 'Nordhausen',
  // Sued und Suedwest
  'Fürth(Bay)Hbf', 'Erlangen', 'Rosenheim', 'Landshut(Bay)Hbf', 'Plattling', 'Lindau-Reutin',
  'Pforzheim Hbf', 'Tübingen Hbf', 'Baden-Baden', 'Bruchsal', 'Ludwigsburg', 'Aalen',
  'Worms Hbf', 'Schweinfurt Hbf', 'Coburg', 'Saalfeld(Saale)', 'Friedberg(Hess)',
];

interface Eintrag {
  eva: string;
  lat: number;
  lon: number;
}

export function ladeNamen(): Record<string, Eintrag> {
  return existsSync(NAMEN) ? (JSON.parse(readFileSync(NAMEN, 'utf8')) as Record<string, Eintrag>) : {};
}

function ladeSecrets(): void {
  const pfad = join(homedir(), '.secrets', 'umstieg.env');
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    const sauber = zeile.replace(/\r$/, '').trim();
    if (!sauber || sauber.startsWith('#')) continue;
    const trenner = sauber.indexOf('=');
    if (trenner < 0) continue;
    process.env[sauber.slice(0, trenner).trim()] = sauber.slice(trenner + 1).trim();
  }
}

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Pausen, die auf Drosselung RICHTIG reagieren: nach einem Fehlschlag laenger
 * warten, nicht kuerzer. Der Schemalauf vom 13.09. tat das Gegenteil - seine
 * Pause lief nur nach Erfolgen - und verlor 18 Bahnhoefe am Stueck.
 */
const PAUSE_MS = 8000;
const PAUSE_NACH_FEHLER_MS = 45_000;
const VERSUCHE = 3;

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(ABLAGE, { recursive: true });
  const namen = ladeNamen();
  const liste = process.argv.length > 2 ? process.argv.slice(2) : [...NACHLAUF, ...LAUF_3];

  let geholt = 0;
  const gescheitert: string[] = [];
  for (const [i, name] of liste.entries()) {
    const kopf = `[${i + 1}/${liste.length}] ${name}`;
    try {
      let eintrag = namen[name];
      if (!eintrag) {
        const treffer = await sucheBahnhoefe(name);
        if (treffer.length === 0) {
          console.log(`${kopf} … nicht gefunden`);
          gescheitert.push(`${name}: nicht gefunden`);
          continue;
        }
        eintrag = { eva: treffer[0].eva, lat: treffer[0].lat, lon: treffer[0].lon };
        namen[name] = eintrag;
        writeFileSync(NAMEN, JSON.stringify(namen, null, 1), 'utf8');
        await warte(1500); // die DB-API drosselt schneller als Overpass
      }
      const pfad = join(ABLAGE, `${eintrag.eva}.json`);
      if (existsSync(pfad)) {
        console.log(`${kopf} … liegt schon (${eintrag.eva})`);
        continue;
      }
      let ok = false;
      for (let versuch = 1; versuch <= VERSUCHE && !ok; versuch++) {
        try {
          const antwort = await overpassQuery(eintrag.lat, eintrag.lon, 400);
          writeFileSync(pfad, JSON.stringify(antwort), 'utf8');
          console.log(`${kopf} … geholt (${eintrag.eva}, ${antwort.elements.length} Elemente)`);
          geholt++;
          ok = true;
          await warte(PAUSE_MS);
        } catch (e) {
          console.log(`${kopf} … Versuch ${versuch}: ${String(e).slice(0, 70)}`);
          await warte(PAUSE_NACH_FEHLER_MS * versuch);
        }
      }
      if (!ok) gescheitert.push(`${name}: Overpass nach ${VERSUCHE} Versuchen`);
    } catch (e) {
      console.log(`${kopf} … FEHLER ${String(e).slice(0, 80)}`);
      gescheitert.push(`${name}: ${String(e).slice(0, 80)}`);
      await warte(PAUSE_NACH_FEHLER_MS);
    }
  }
  console.log(`\nFERTIG: ${geholt} neu geholt, ${gescheitert.length} gescheitert`);
  for (const g of gescheitert) console.log('  ' + g);
}

// Nur als Skript laufen, nicht beim Import durch die Simulation.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('osm-ablage-fuellen.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
