// SONDIERUNG (wegwerfbar): Was liefert FaSta wirklich?
//
// Hintergrund: test/fixtures/db/fasta-facilities.json ist handgebaut. Verifiziert
// war bisher nur die ADRESSIERUNG (stationnumber statt EVA, siehe db-endpunkte.ts),
// nicht die Nutzlast. Fuer ToDo 7b (§5) haengt aber alles an drei Fragen:
//
//   1. Wie viele Anlagen kommen je Bahnhof, und tragen sie alle Koordinaten?
//   2. Wie streuen sie - laesst sich daraus eine Bahnsteigachse ablesen?
//   3. Steht in `description` je eine Gleisnummer? Das waere die einzige
//      nicht-geratene Bruecke Cluster -> Bahnsteig.
//
// Aufruf: npx tsx scripts/spike-fasta.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { epFastaFacilities, epStopPlace } from '../src/clients/db-endpunkte.js';
import { dbAuthHeader } from '../src/clients/stations.js';
import { haversineM } from '../src/core/graph.js';

// Zugangsdaten aus dem Tresor. Die Datei hat CRLF - ohne \r-Strip landet ein
// Wagenruecklauf im Secret und der Auth-Header ist still falsch.
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

interface RohAnlage {
  equipmentnumber?: number;
  type?: string;
  state?: string;
  description?: string;
  geocoordX?: number;
  geocoordY?: number;
  stationnumber?: number;
  [k: string]: unknown;
}

const BAHNHOEFE: { eva: string; label: string }[] = [
  { eva: '8011160', label: 'Berlin Hbf' },
  { eva: '8000261', label: 'Muenchen Hbf' },
  { eva: '8000105', label: 'Frankfurt(Main)Hbf' },
  { eva: '8010101', label: 'Eberswalde Hbf' },
  { eva: '8000152', label: 'Hannover Hbf' },
];

// RIS::Stations verlangt den Vendor-Media-Type, FaSta plain JSON - der falsche
// Accept quittiert das Gateway mit 415, nicht mit einer Fehlermeldung im Body.
async function hole(url: string, accept: string): Promise<unknown> {
  const antwort = await fetch(url, {
    headers: { ...dbAuthHeader(), Accept: accept },
    signal: AbortSignal.timeout(20000),
  });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} bei ${url}`);
  return antwort.json();
}
const RIS_ACCEPT = 'application/vnd.de.db.ris+json';

/** Einfaches Single-Linkage-Clustern: Punkte naeher als `schwelle` sind ein Cluster. */
function clusterZahl(punkte: { lat: number; lon: number }[], schwelle: number): number {
  const eltern = punkte.map((_, i) => i);
  const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
  for (let i = 0; i < punkte.length; i++) {
    for (let j = i + 1; j < punkte.length; j++) {
      if (haversineM(punkte[i].lat, punkte[i].lon, punkte[j].lat, punkte[j].lon) <= schwelle) {
        eltern[wurzel(i)] = wurzel(j);
      }
    }
  }
  return new Set(punkte.map((_, i) => wurzel(i))).size;
}

ladeSecrets();
const ausgabe = join(process.env.TEMP ?? '.', 'fasta-spike');
mkdirSync(ausgabe, { recursive: true });

for (const { eva, label } of BAHNHOEFE) {
  console.log(`\n${'='.repeat(70)}\n${label} (EVA ${eva})\n${'='.repeat(70)}`);
  try {
    const sp = (await hole(epStopPlace(eva), RIS_ACCEPT)) as
      | { stationID?: string; stopPlaces?: { stationID?: string }[] };
    const stationID = sp.stationID ?? sp.stopPlaces?.[0]?.stationID;
    if (!stationID) {
      console.log('  KEINE stationID in der StopPlace-Antwort - FaSta nicht adressierbar.');
      continue;
    }
    console.log(`  stationID (StaDa) = ${stationID}`);

    const roh = await hole(epFastaFacilities(stationID), 'application/json');
    writeFileSync(join(ausgabe, `fasta-${eva}.json`), JSON.stringify(roh, null, 2));
    const liste: RohAnlage[] = Array.isArray(roh)
      ? (roh as RohAnlage[])
      : (((roh as { facilities?: RohAnlage[] }).facilities ?? []) as RohAnlage[]);

    console.log(`  Anlagen gesamt: ${liste.length}   (Rohform: ${Array.isArray(roh) ? 'Array' : 'Objekt mit facilities'})`);

    // Frage 1: Typen, Status, Koordinatenabdeckung
    const zaehle = (feld: keyof RohAnlage): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const a of liste) m[String(a[feld])] = (m[String(a[feld])] ?? 0) + 1;
      return m;
    };
    console.log(`  type:  ${JSON.stringify(zaehle('type'))}`);
    console.log(`  state: ${JSON.stringify(zaehle('state'))}`);
    const mitKoord = liste.filter((a) => a.geocoordX !== undefined && a.geocoordY !== undefined);
    console.log(`  mit Koordinaten: ${mitKoord.length} von ${liste.length}`);
    console.log(`  Felder je Anlage: ${JSON.stringify([...new Set(liste.flatMap((a) => Object.keys(a)))])}`);

    // Frage 2: Streuung und Clusterbarkeit
    const punkte = mitKoord.map((a) => ({ lat: a.geocoordY!, lon: a.geocoordX! }));
    if (punkte.length > 1) {
      let maxAbstand = 0;
      for (let i = 0; i < punkte.length; i++) {
        for (let j = i + 1; j < punkte.length; j++) {
          maxAbstand = Math.max(
            maxAbstand,
            haversineM(punkte[i].lat, punkte[i].lon, punkte[j].lat, punkte[j].lon),
          );
        }
      }
      console.log(`  groesste Spannweite: ${Math.round(maxAbstand)} m`);
      const schwellen = [10, 15, 20, 30, 50, 80];
      console.log(
        `  Cluster je Schwelle: ${schwellen.map((s) => `${s}m->${clusterZahl(punkte, s)}`).join('  ')}`,
      );
    }

    // Frage 3: Traegt `description` eine Gleisnummer?
    const beschreibungen = liste.map((a) => a.description).filter((d): d is string => !!d);
    const mitGleis = beschreibungen.filter((d) => /gleis\s*\d/i.test(d));
    console.log(`  description vorhanden: ${beschreibungen.length}, davon mit "Gleis <n>": ${mitGleis.length}`);
    const proben = [...new Set(beschreibungen)].slice(0, 15);
    for (const p of proben) console.log(`     | ${p}`);
  } catch (e) {
    console.log(`  FEHLER: ${String(e)}`);
  }
}
console.log(`\nRohantworten liegen in ${ausgabe}`);
