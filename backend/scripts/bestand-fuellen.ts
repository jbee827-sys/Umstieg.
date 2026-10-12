// Fuellt den STARTBESTAND des Backends (Spec 2026-10-12, Abschnitt 7) - die
// OSM-Daten aller Bahnhoefe der DB-Preisklassen 1-3, gepackt unter
// `backend/osm-bestand/`. Der Bestand liegt im Repo und im Image.
//
// Laeuft lokal, nicht im Betrieb: rund eine Stunde mit Pausen. Ueberspringt,
// was in der aktuellen Abfrageversion schon liegt - nach einem Abbruch einfach
// neu starten.
//
// Aufruf (aus backend/):  npx tsx scripts/bestand-fuellen.ts
// Bei toten Overpass-Spiegeln den Ersatz vorgeben, z. B.:
//   OVERPASS_URL_FALLBACK=https://maps.mail.ru/osm/tools/overpass/api/interpreter npx tsx scripts/bestand-fuellen.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epStadaStationen } from '../src/clients/db-endpunkte.js';
import { OVERPASS_RADIUS_M, overpassQuery } from '../src/clients/overpass.js';
import { dbAuthHeader, holeStationsInfo } from '../src/clients/stations.js';
import type { StationsInfo } from '../src/core/typen.js';
import { dateiname, entpackeEintrag, packeEintrag, schluesselVon } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import { ladeSecrets } from './secrets.js';

export const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));

export interface StadaStation {
  name: string;
  priceCategory?: number;
  evaNumbers?: { number: number; isMain?: boolean }[];
}

export function hauptEva(s: StadaStation): string | null {
  const evas = s.evaNumbers ?? [];
  const haupt = evas.find((e) => e.isMain) ?? evas[0];
  return haupt ? String(haupt.number) : null;
}

// Ob die Verkehrsstellengruppe vollstaendig aufgeloest werden konnte. Nur dann
// liefert die Kleinste-EVA denselben Schluessel wie der Betrieb. Andernfalls
// wird der Bahnhof bei der naechsten Ausfuehrung erneut gefetcht.
export function gruppeVerlaesslich(info: Pick<StationsInfo, 'gruppeUnvollstaendig'>): boolean {
  return info.gruppeUnvollstaendig !== true;
}

const PAUSE_MS = 8000;
const PAUSE_DB_MS = 1500;
const PAUSE_NACH_FEHLER_MS = 45_000;
const VERSUCHE = 3;
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function holeStadaListe(): Promise<StadaStation[]> {
  const res = await fetch(epStadaStationen('1-3'), {
    headers: { ...dbAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`StaDa: HTTP ${res.status}`);
  const j = (await res.json()) as { result?: StadaStation[] };
  return j.result ?? [];
}

async function liegtAktuell(pfad: string): Promise<boolean> {
  if (!existsSync(pfad)) return false;
  try {
    return (await entpackeEintrag(readFileSync(pfad))).abfrageVersion === ABFRAGE_VERSION;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(BESTAND, { recursive: true });
  const stationen = await holeStadaListe();
  console.log(`${stationen.length} Bahnhoefe der Preisklassen 1-3, Abfrageversion ${ABFRAGE_VERSION}`);

  const erledigt = new Set<string>();
  let geholt = 0;
  const gescheitert: string[] = [];
  for (const [i, s] of stationen.entries()) {
    const kopf = `[${i + 1}/${stationen.length}] ${s.name}`;
    const eva = hauptEva(s);
    if (!eva) {
      gescheitert.push(`${s.name}: keine EVA`);
      continue;
    }
    let info: StationsInfo;
    try {
      info = await holeStationsInfo(eva);
      await warte(PAUSE_DB_MS); // die DB-API drosselt schneller als Overpass
    } catch (e) {
      console.log(`${kopf} … Stationsauskunft: ${String(e).slice(0, 80)}`);
      gescheitert.push(`${s.name}: Stationsauskunft`);
      await warte(PAUSE_NACH_FEHLER_MS);
      continue;
    }
    if (info.lat === undefined || info.lon === undefined) {
      gescheitert.push(`${s.name}: keine Koordinaten`);
      continue;
    }
    if (!gruppeVerlaesslich(info)) {
      console.log(`${kopf} … Gruppe unvollstaendig – spaeter erneut`);
      gescheitert.push(`${s.name}: Gruppe unvollstaendig`);
      await warte(PAUSE_NACH_FEHLER_MS);
      continue;
    }
    const schluessel = schluesselVon(info.evas.length > 0 ? info.evas : [info.eva]);
    if (erledigt.has(schluessel)) {
      console.log(`${kopf} … derselbe Bahnhof wie zuvor (${schluessel})`);
      continue;
    }
    erledigt.add(schluessel);
    const pfad = join(BESTAND, dateiname(schluessel));
    if (await liegtAktuell(pfad)) {
      console.log(`${kopf} … liegt schon (${schluessel})`);
      continue;
    }
    let ok = false;
    for (let versuch = 1; versuch <= VERSUCHE && !ok; versuch++) {
      try {
        const osm = await overpassQuery(info.lat, info.lon, OVERPASS_RADIUS_M);
        writeFileSync(
          pfad,
          await packeEintrag({
            schluessel,
            name: info.name,
            lat: info.lat,
            lon: info.lon,
            geholtAm: new Date().toISOString(),
            abfrageVersion: ABFRAGE_VERSION,
            osm,
          }),
        );
        console.log(`${kopf} … geholt (${schluessel}, ${osm.elements.length} Elemente)`);
        geholt++;
        ok = true;
        await warte(PAUSE_MS);
      } catch (e) {
        console.log(`${kopf} … Versuch ${versuch}: ${String(e).slice(0, 70)}`);
        await warte(PAUSE_NACH_FEHLER_MS * versuch);
      }
    }
    if (!ok) gescheitert.push(`${s.name}: Overpass nach ${VERSUCHE} Versuchen`);
  }
  console.log(`\nFERTIG: ${geholt} neu geholt, ${gescheitert.length} gescheitert`);
  for (const g of gescheitert) console.log('  ' + g);
}

// Nur als Skript laufen, nicht beim Import durch die Tests.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('bestand-fuellen.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
