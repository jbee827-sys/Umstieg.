// SONDIERUNG (wegwerfbar): Was gaebe OSM her, wenn die Abfrage danach fragt?
//
// Anlass: Das Berlin-Fixture stammt aus Commit fcc6e53 (24.08.), die POI-Zeilen
// der Abfrage kamen erst mit 2b46a48. "0 Kioske in Berlin Hbf" ist deshalb ein
// Aufzeichnungsartefakt, kein Datenbefund - und mehrere Elemente, die Screen 3
// zeichnet (Abschnittsmarker, Anzeigetafeln, Gleisachsen), stehen ueberhaupt
// nicht in der heutigen Abfrage.
//
// Genau EIN Overpass-Aufruf; das Ergebnis wird im Spike-Ordner abgelegt und bei
// Wiederholung von dort gelesen (Fairness gegenueber der oeffentlichen Instanz).
//
// Aufruf: npx tsx scripts/spike-schema-overpass-live.ts
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OsmElement, OverpassAntwort } from '../src/core/typen.js';

// Rohdaten in den gitignorierten Spike-Ordner, nie in den Temp-Scratchpad
// einer Sitzung - der ist kein Ablageort und verschwindet (Regel seit 14.09.2026).
const AUSGABE = fileURLToPath(new URL('../test/fixtures/spike/schema-geometrie/', import.meta.url));
const CACHE = join(AUSGABE, 'g-overpass-erweitert.json');

const LAT = 52.5251;
const LON = 13.3694;
const RADIUS = 400;

// Nur die Klassen, die in der heutigen Abfrage FEHLEN - plus die POI-Zeilen,
// damit der Fixture-Verdacht geklaert wird.
function ql(): string {
  const um = `around:${RADIUS},${LAT},${LON}`;
  return `[out:json][timeout:60];
(
  node["railway"="platform_section"](${um});
  node["public_transport"="platform_section"](${um});
  node["departures_board"](${um});
  node["railway"="departures_board"](${um});
  node["information"="board"](${um});
  way["railway"="rail"](${um});
  node["amenity"="toilets"](${um});
  way["amenity"="toilets"](${um});
  node["shop"="kiosk"](${um});
  way["shop"="kiosk"](${um});
  node["shop"="convenience"](${um});
  node["amenity"~"cafe|fast_food|bakery"](${um});
  node["railway"="subway_entrance"](${um});
  node["entrance"](${um});
  way["indoor"="room"](${um});
  node["highway"="elevator"](${um});
);
out tags center;`;
}

async function holeOderCache(): Promise<OverpassAntwort> {
  if (existsSync(CACHE)) {
    console.log('Aus dem Spike-Ordner gelesen (kein Overpass-Aufruf).');
    return JSON.parse(readFileSync(CACHE, 'utf8')) as OverpassAntwort;
  }
  const url = process.env.OVERPASS_URL_PRIMARY ?? 'https://overpass-api.de/api/interpreter';
  console.log('Overpass-Aufruf an', url, '…');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'umstiegs-navigator/0.1 (spike schema-geometrie)',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(ql())}`,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const daten = (await res.json()) as OverpassAntwort;
  mkdirSync(AUSGABE, { recursive: true });
  writeFileSync(CACHE, JSON.stringify(daten), 'utf8');
  return daten;
}

function gruppe(el: OsmElement): string {
  const t = el.tags ?? {};
  if (t.railway === 'platform_section' || t.public_transport === 'platform_section')
    return 'Abschnittsmarker';
  if (t.departures_board !== undefined || t.railway === 'departures_board' || t.information === 'board')
    return 'Anzeigetafel';
  if (t.railway === 'rail') return 'Gleisachse (railway=rail)';
  if (t.amenity === 'toilets') return 'WC';
  if (t.shop === 'kiosk') return 'Kiosk';
  if (t.shop === 'convenience') return 'Laden (convenience)';
  if (t.amenity === 'cafe' || t.amenity === 'fast_food' || t.amenity === 'bakery')
    return `Gastronomie (${t.amenity})`;
  if (t.railway === 'subway_entrance') return 'U-Bahn-Zugang';
  if (t.entrance !== undefined) return 'Eingang';
  if (t.indoor === 'room') return 'Innenraum (indoor=room)';
  if (t.highway === 'elevator') return 'Aufzug';
  return 'sonstiges';
}

async function main(): Promise<void> {
  const daten = await holeOderCache();
  const nachGruppe = new Map<string, OsmElement[]>();
  for (const el of daten.elements) {
    const g = gruppe(el);
    if (!nachGruppe.has(g)) nachGruppe.set(g, []);
    nachGruppe.get(g)!.push(el);
  }

  console.log(`\nElemente gesamt: ${daten.elements.length}\n`);
  console.log('Klasse'.padEnd(30), 'Anzahl'.padStart(7), ' davon mit level');
  console.log('-'.repeat(60));
  for (const [g, els] of [...nachGruppe.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const mitLevel = els.filter((e) => e.tags?.level !== undefined).length;
    console.log(g.padEnd(30), String(els.length).padStart(7), String(mitLevel).padStart(15));
  }

  for (const interessant of [
    'Abschnittsmarker',
    'Anzeigetafel',
    'WC',
    'Kiosk',
    'Laden (convenience)',
    'Gastronomie (cafe)',
    'Gastronomie (fast_food)',
    'Gastronomie (bakery)',
  ]) {
    const els = nachGruppe.get(interessant) ?? [];
    if (els.length === 0) continue;
    console.log(`\n--- ${interessant} (${els.length}) ---`);
    for (const el of els.slice(0, 12)) {
      const t = el.tags ?? {};
      console.log(
        `  ${el.type}/${el.id} level=${String(t.level ?? '-').padEnd(6)} ref=${String(t.ref ?? '-').padEnd(6)} name=${t.name ?? '-'}`,
      );
    }
    if (els.length > 12) console.log(`  … und ${els.length - 12} weitere`);
  }

  // Gleisachsen: fuer die Gleislinien im Schema. Welche tragen eine Nummer?
  const gleise = nachGruppe.get('Gleisachse (railway=rail)') ?? [];
  const mitRef = gleise.filter((g) => g.tags?.ref !== undefined);
  console.log(`\n--- Gleisachsen: ${gleise.length}, davon mit ref: ${mitRef.length} ---`);
  const refs = [...new Set(mitRef.map((g) => g.tags!.ref))].sort();
  console.log('  refs:', refs.join(', ') || '(keine)');
  const mitLevel = gleise.filter((g) => g.tags?.level !== undefined);
  console.log(`  mit level: ${mitLevel.length}`);

  console.log(`\nRohdaten: ${CACHE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
