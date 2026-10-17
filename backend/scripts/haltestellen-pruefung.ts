// HALTESTELLENPRUEFUNG (Umstieg 2.0, Plan-Task 13): Traegt der Haltestellenpfad
// gegen die echte MOTIS-API?
//
// Prueft die Erfolgskriterien der Spec, soweit sie am Backend haengen:
//   K1 – 50 Haltestellen aus allen 16 Laendern, Stadt und Land: gefunden?
//   K2 – fuenf Tafeln: Linie, Ziel, Steig, Soll- und Ist-Zeit belegt?
//   K4 – 20 Steigpaare, darunter Bahnhof → Bushaltestelle: Fussweg gefunden?
//
// Manuell gestartet, NIE in CI: Jede Anfrage geht an die echte API. Deshalb
// strikt nacheinander und mit 1,2 s Pause (F7 – kein Massenabruf). Der Client
// ist derselbe wie im Backend, samt Zwischenspeicher und Pausenzustand: Eine
// Pause von MOTIS wird hier als Fehler sichtbar, nicht ueberrannt.
//
// Ergebnis als Tabelle auf der Konsole und als JSON unter
// `.superpowers/pruefung-<Datum>/` (gitignored).
//
// Aufruf: cd backend && MOTIS_BASIS_URL=https://api.transitous.org npx tsx scripts/haltestellen-pruefung.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { erzeugeHaltestellenClient } from '../src/clients/haltestellen.js';
import { erzeugeMotisKern } from '../src/clients/motis.js';
import { erzeugeMotisPausen } from '../src/clients/motis-pausen.js';
import { erzeugeAnfragezaehler } from '../src/core/anfragezaehler.js';
import { haversineM } from '../src/core/graph.js';
import type { Ort } from '../src/core/typen.js';

const basisUrl = process.env.MOTIS_BASIS_URL?.trim();
if (!basisUrl) {
  console.error('MOTIS_BASIS_URL fehlt, z. B. MOTIS_BASIS_URL=https://api.transitous.org');
  process.exit(1);
}

const zaehler = erzeugeAnfragezaehler({ intervallMs: 0 });
const client = erzeugeHaltestellenClient(
  erzeugeMotisKern({
    basisUrl,
    kontakt: process.env.MOTIS_KONTAKT?.trim() || undefined,
    pausen: erzeugeMotisPausen(),
    zaehler,
  }),
);

const PAUSE_MS = 1200;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nur die erste Anfrage je Suchtext kostet; der Client merkt sich die Treffer 24 h. */
const gesucht = new Set<string>();
async function suche(text: string): Promise<Ort[]> {
  if (!gesucht.has(text)) {
    gesucht.add(text);
    await warte(PAUSE_MS);
  }
  return client.sucheOrte(text);
}

const fehlertext = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// --- K1: 50 Haltestellen, alle 16 Laender ---
const HALTESTELLEN: [land: string, text: string][] = [
  ['BW', 'Stuttgart Hauptbahnhof'], ['BW', 'Karlsruhe Marktplatz'], ['BW', 'Titisee Bahnhof'], ['BW', 'Freiburg Bertoldsbrunnen'],
  ['BY', 'München Hbf'], ['BY', 'Karlsplatz (Stachus)'], ['BY', 'Nürnberg Plärrer'], ['BY', 'Garmisch-Partenkirchen Bahnhof'], ['BY', 'Oberstdorf Bahnhof'],
  ['BE', 'Berlin Hbf'], ['BE', 'S+U Alexanderplatz'], ['BE', 'U Kottbusser Tor'], ['BE', 'S+U Hauptbahnhof/Washingtonplatz'],
  ['BB', 'Potsdam Hauptbahnhof'], ['BB', 'Cottbus Stadthalle'], ['BB', 'Wiesenburg Bahnhof'],
  ['HB', 'Bremen Hauptbahnhof'], ['HB', 'Bremen Domsheide'], ['HB', 'Bremerhaven Hauptbahnhof'],
  ['HH', 'Hamburg Hauptbahnhof'], ['HH', 'Jungfernstieg'], ['HH', 'Hamburg-Altona'],
  ['HE', 'Kassel Rathaus'], ['HE', 'Frankfurt Konstablerwache'], ['HE', 'Darmstadt Luisenplatz'], ['HE', 'Fulda Bahnhof'],
  ['MV', 'Rostock Lange Straße'], ['MV', 'Schwerin Marienplatz'], ['MV', 'Stralsund Hauptbahnhof'],
  ['NI', 'Hannover Kröpcke'], ['NI', 'Braunschweig Rathaus'], ['NI', 'Göttingen Bahnhof'],
  ['NW', 'Köln Neumarkt'], ['NW', 'Düsseldorf Heinrich-Heine-Allee'], ['NW', 'Dortmund Reinoldikirche'], ['NW', 'Münster Hauptbahnhof'],
  ['RP', 'Mainz Hauptbahnhof'], ['RP', 'Cochem Bahnhof'], ['RP', 'Trier Porta Nigra'],
  ['SL', 'Saarbrücken Hauptbahnhof'], ['SL', 'Saarbrücken Johanneskirche'],
  ['SN', 'Leipzig Hbf'], ['SN', 'Dresden Postplatz'], ['SN', 'Chemnitz Zentralhaltestelle'],
  ['ST', 'Magdeburg Hauptbahnhof'], ['ST', 'Halle Marktplatz'],
  ['SH', 'Kiel Hauptbahnhof'], ['SH', 'Lübeck ZOB'],
  ['TH', 'Erfurt Anger'], ['TH', 'Jena Paradies'],
];

/** Gefunden heisst: Ein Treffer traegt eine Haltestellen-ID und das erste Wort des Suchtexts. */
function gefunden(text: string, orte: Ort[]): Ort | undefined {
  const wort = text.split(/[ /(]/)[0].toLowerCase();
  return orte.find((o) => o.haltestelleId && o.name.toLowerCase().includes(wort)) ?? orte.find((o) => o.haltestelleId);
}

// --- K2: fuenf Tafeln ---
const TAFELN = ['S+U Alexanderplatz', 'Karlsplatz (Stachus)', 'Kassel Rathaus', 'Wiesenburg Bahnhof', 'Köln Neumarkt'];

// --- K4: 20 Steigpaare, ueberwiegend Bahnhof → Bus/Tram ---
const PAARE: [von: string, nach: string][] = [
  ['Berlin Hbf', 'S+U Hauptbahnhof/Washingtonplatz'],
  ['München Hbf', 'Karlsplatz (Stachus)'],
  ['Kassel Hauptbahnhof', 'Kassel Scheidemannplatz'],
  ['Frankfurt Hauptbahnhof', 'Frankfurt Hauptbahnhof/Münchener Straße'],
  ['Hamburg Hauptbahnhof', 'ZOB Hamburg'],
  ['Köln Hbf', 'Köln Dom/Hbf'],
  ['Leipzig Hbf', 'Leipzig Hauptbahnhof, Westseite'],
  ['Dresden Hauptbahnhof', 'Dresden Hauptbahnhof Nord'],
  ['Hannover Hauptbahnhof', 'Hannover Kröpcke'],
  ['Bremen Hauptbahnhof', 'Bremen Domsheide'],
  ['Stuttgart Hauptbahnhof', 'Stuttgart Hauptbahnhof (Arnulf-Klett-Platz)'],
  ['Erfurt Hauptbahnhof', 'Erfurt Anger'],
  ['Rostock Hauptbahnhof', 'Rostock Hauptbahnhof Süd'],
  ['Potsdam Hauptbahnhof', 'Potsdam Lange Brücke'],
  ['Mainz Hauptbahnhof', 'Mainz Hauptbahnhof West'],
  ['Saarbrücken Hauptbahnhof', 'Saarbrücken Trierer Straße'],
  ['Kiel Hauptbahnhof', 'Kiel ZOB'],
  ['Magdeburg Hauptbahnhof', 'Magdeburg Damaschkeplatz'],
  ['Lübeck Hauptbahnhof', 'Lübeck ZOB'],
  ['Titisee Bahnhof', 'Titisee Seestraße'],
];

async function main() {
  const start = new Date();

  console.log(`\nK1 – Suche (${HALTESTELLEN.length} Haltestellen)`);
  const k1: { land: string; text: string; treffer?: string; id?: string; eva?: string; fehler?: string }[] = [];
  for (const [land, text] of HALTESTELLEN) {
    try {
      const ort = gefunden(text, await suche(text));
      k1.push({ land, text, treffer: ort?.name, id: ort?.haltestelleId, eva: ort?.eva });
    } catch (e) {
      k1.push({ land, text, fehler: fehlertext(e) });
    }
    const z = k1.at(-1)!;
    console.log(`  ${z.treffer ? '✓' : '✗'} ${land} ${text.padEnd(36)} ${z.treffer ?? z.fehler ?? 'kein Treffer'}${z.eva ? ` (EVA ${z.eva})` : ''}`);
  }
  const k1Gefunden = k1.filter((z) => z.treffer).length;
  const k1Laender = new Set(k1.filter((z) => z.treffer).map((z) => z.land)).size;

  console.log('\nK2 – Tafeln');
  const k2: { text: string; eintraege?: number; mitLinie?: number; mitZiel?: number; mitSteig?: number; mitEchtzeit?: number; mitIst?: number; ausfall?: number; fehler?: string }[] = [];
  for (const text of TAFELN) {
    try {
      const ort = gefunden(text, await suche(text));
      if (!ort?.haltestelleId) throw new Error('Haltestelle nicht gefunden');
      await warte(PAUSE_MS);
      const t = await client.tafel({ id: ort.haltestelleId, lat: ort.lat, lon: ort.lon }, 'dep');
      k2.push({
        text,
        eintraege: t.length,
        mitLinie: t.filter((e) => e.linie).length,
        mitZiel: t.filter((e) => e.ziel).length,
        mitSteig: t.filter((e) => e.steigSoll || e.steigIst).length,
        mitEchtzeit: t.filter((e) => e.echtzeit).length,
        mitIst: t.filter((e) => e.zeitIst).length,
        ausfall: t.filter((e) => e.ausfall).length,
      });
    } catch (e) {
      k2.push({ text, fehler: fehlertext(e) });
    }
    const z = k2.at(-1)!;
    console.log(
      z.fehler
        ? `  ✗ ${text}: ${z.fehler}`
        : `  ${z.eintraege ? '✓' : '✗'} ${text.padEnd(24)} ${z.eintraege} Abfahrten · Linie ${z.mitLinie} · Ziel ${z.mitZiel} · Steig ${z.mitSteig} · Echtzeit ${z.mitEchtzeit} · Ist ${z.mitIst} · Ausfall ${z.ausfall}`,
    );
  }

  console.log(`\nK4 – Fusswege (${PAARE.length} Paare)`);
  const k4: { von: string; nach: string; abstandM?: number; wegM?: number; kanten?: number; ebenen?: number[]; fehler?: string }[] = [];
  for (const [vonText, nachText] of PAARE) {
    try {
      const von = gefunden(vonText, await suche(vonText));
      const nach = gefunden(nachText, await suche(nachText));
      if (!von || !nach) throw new Error(`nicht aufgeloest: ${!von ? vonText : nachText}`);
      const abstand = Math.round(haversineM(von.lat, von.lon, nach.lat, nach.lon));
      if (abstand > 3000) throw new Error(`zu weit auseinander (${abstand} m)`);
      await warte(PAUSE_MS);
      const pfad = await client.fussweg(von, nach, 'FOOT');
      k4.push({
        von: von.name,
        nach: nach.name,
        abstandM: abstand,
        wegM: pfad ? Math.round(pfad.laengeM) : undefined,
        kanten: pfad?.kanten.length,
        ebenen: pfad ? [...new Set(pfad.knoten.map((k) => k.level))] : undefined,
        ...(pfad ? {} : { fehler: 'kein Weg (direct leer)' }),
      });
    } catch (e) {
      k4.push({ von: vonText, nach: nachText, fehler: fehlertext(e) });
    }
    const z = k4.at(-1)!;
    console.log(
      z.wegM !== undefined
        ? `  ✓ ${z.von} → ${z.nach}: ${z.wegM} m (Luftlinie ${z.abstandM} m), ${z.kanten} Kanten, Ebenen ${z.ebenen?.join('/')}`
        : `  ✗ ${z.von} → ${z.nach}: ${z.fehler}`,
    );
  }
  const k4Gefunden = k4.filter((z) => z.wegM !== undefined).length;

  const anfragen = zaehler.stand();
  const ergebnis = {
    start: start.toISOString(),
    ende: new Date().toISOString(),
    basisUrl,
    k1: { gefunden: k1Gefunden, von: HALTESTELLEN.length, laender: k1Laender, ziel: 'mindestens 49 von 50', zeilen: k1 },
    k2: { zeilen: k2 },
    k4: { gefunden: k4Gefunden, von: PAARE.length, zeilen: k4 },
    anfragen,
  };

  console.log(`\nK1: ${k1Gefunden}/${HALTESTELLEN.length} gefunden, ${k1Laender} Länder (Ziel ≥ 49)`);
  console.log(`K4: ${k4Gefunden}/${PAARE.length} Fusswege`);
  console.log(`Anfragen an MOTIS: ${JSON.stringify(anfragen)}`);

  const ordner = fileURLToPath(new URL(`../../.superpowers/pruefung-${start.toISOString().slice(0, 10)}/`, import.meta.url));
  mkdirSync(ordner, { recursive: true });
  const datei = `${ordner}haltestellen-pruefung.json`;
  writeFileSync(datei, JSON.stringify(ergebnis, null, 2));
  console.log(`Ergebnis: ${datei}`);
}

await main();
