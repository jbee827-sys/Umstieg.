// Legt die DB-Gleislisten (RIS::Stations) aller Bahnhoefe des Startbestands ab
// (Spec 2026-11-03, Abschnitt 6.3). Die Bahnhofsseiten bauen ihren Graphen
// damit wie der Server: DB-Namen statt OSM-Nummern („1“/„2“ statt „81“/„82“
// in Muenchen Hbf tief), Gleisarten und U-Bahn-Steige.
//
// Ablage: backend/osm-ablage/db-gleise/<schluessel>.json = die StationsInfo,
// ohne Schluessel (gitignored; die Namen landen ohnehin in den eingecheckten
// Seitendaten, die Rohdaten brauchen kein Repo). <schluessel> ist der
// Dateiname des Bestandseintrags, ohne `.json.gz`.
//
// ECHTE DB-ANFRAGEN: je Bahnhof eine Stationsauskunft plus eine Gleisliste je
// Verkehrsstelle der Gruppe, mit 1,5 s Pause. Ueberspringt, was schon liegt und
// vollstaendig ist (`gleislisteUnvollstaendig` false) - nach einem Abbruch
// einfach neu starten; eine unvollstaendige Liste wird erneut geholt.
//
// Aufruf (aus backend/):  npx tsx scripts/db-gleise-fuellen.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gleislisteUnvollstaendig, holeStationsInfo } from '../src/clients/stations.js';
import type { StationsInfo } from '../src/core/typen.js';
import { ladeSecrets } from './secrets.js';

export const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
export const ABLAGE = fileURLToPath(new URL('../osm-ablage/db-gleise/', import.meta.url));

export const PAUSE_DB_MS = 1500;
const PAUSE_NACH_FEHLER_MS = 45_000;
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `8000261.json.gz` → `8000261`; alles andere gehoert nicht zum Bestand. */
export function schluesselAusBestandsdatei(datei: string): string | null {
  const m = /^(.+)\.json\.gz$/.exec(datei);
  return m ? m[1] : null;
}

export function ablageDatei(schluessel: string, ordner: string = ABLAGE): string {
  return join(ordner, `${schluessel}.json`);
}

/**
 * Die Felder der StationsInfo, ausdruecklich benannt: Was nicht hier steht,
 * wird nicht abgelegt. Die Ablage ist eine Kopie oeffentlicher Gleisdaten und
 * soll nie etwas anderes tragen (Kopfzeilen, Schluessel).
 */
export function serialisiere(info: StationsInfo): string {
  const sauber: StationsInfo = {
    eva: info.eva,
    name: info.name,
    ...(info.lat !== undefined ? { lat: info.lat } : {}),
    ...(info.lon !== undefined ? { lon: info.lon } : {}),
    evas: info.evas,
    ...(info.stationID !== undefined ? { stationID: info.stationID } : {}),
    ...(info.sbahnEvas !== undefined ? { sbahnEvas: info.sbahnEvas } : {}),
    ...(info.gleisteileOhneAntwort !== undefined ? { gleisteileOhneAntwort: info.gleisteileOhneAntwort } : {}),
    ...(info.gruppeUnvollstaendig !== undefined ? { gruppeUnvollstaendig: info.gruppeUnvollstaendig } : {}),
    gleise: info.gleise,
  };
  return JSON.stringify(sauber);
}

/** Die abgelegte StationsInfo, oder `undefined` ohne (lesbare) Datei. */
export function ladeAblage(schluessel: string, ordner: string = ABLAGE): StationsInfo | undefined {
  const pfad = ablageDatei(schluessel, ordner);
  if (!existsSync(pfad)) return undefined;
  try {
    return JSON.parse(readFileSync(pfad, 'utf8')) as StationsInfo;
  } catch {
    return undefined;
  }
}

/** Nur eine vorhandene, vollstaendige Ablage ist erledigt. */
export function istErledigt(schluessel: string, ordner: string = ABLAGE): boolean {
  const info = ladeAblage(schluessel, ordner);
  return info !== undefined && !gleislisteUnvollstaendig(info);
}

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(ABLAGE, { recursive: true });
  const schluessel = readdirSync(BESTAND)
    .map(schluesselAusBestandsdatei)
    .filter((s): s is string => s !== null)
    .sort();
  console.log(`${schluessel.length} Bahnhoefe im Bestand, Ablage ${ABLAGE}`);
  let geholt = 0;
  let uebersprungen = 0;
  const gescheitert: string[] = [];
  const unvollstaendig: string[] = [];
  for (const [i, s] of schluessel.entries()) {
    const kopf = `[${i + 1}/${schluessel.length}] ${s}`;
    if (istErledigt(s)) {
      uebersprungen++;
      continue;
    }
    try {
      const info = await holeStationsInfo(s);
      writeFileSync(ablageDatei(s), serialisiere(info), 'utf8');
      geholt++;
      const unv = gleislisteUnvollstaendig(info);
      if (unv) unvollstaendig.push(`${s} ${info.name}`);
      console.log(`${kopf} … ${info.name}: ${info.gleise.length} Gleise${unv ? ' (UNVOLLSTAENDIG)' : ''}`);
      await warte(PAUSE_DB_MS);
    } catch (e) {
      console.log(`${kopf} … ${String(e).slice(0, 80)}`);
      gescheitert.push(s);
      await warte(PAUSE_NACH_FEHLER_MS);
    }
  }
  console.log(
    `\nFERTIG: ${geholt} geholt, ${uebersprungen} lagen schon, ${unvollstaendig.length} unvollstaendig, ${gescheitert.length} gescheitert`,
  );
  for (const u of unvollstaendig) console.log('  unvollstaendig: ' + u);
  for (const g of gescheitert) console.log('  gescheitert: ' + g);
}

// Nur als Skript laufen, nicht beim Import durch die Tests.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('db-gleise-fuellen.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
