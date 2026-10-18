// SONDIERUNG (wegwerfbar): Was steht in der Wagenreihungs-Antwort ausser dem
// Sektorbuchstaben?
//
// Anlass: `holeWagenposition` liest genau ein Feld (`fahrzeugsektor`) und wirft
// den Rest weg. Fuer das Schema waere entscheidend, ob die Antwort die LAGE
// der Sektoren am Gleis kennt - dann braeuchte die Abschnittsanzeige weder
// OSM-Marker (die es nicht gibt) noch die FaSta-Kruecke (die nur an 4 von 8
// Bahnhoefen greift).
//
// Aufruf: npx tsx scripts/spike-wagenreihung-geometrie.ts
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { epWagenreihung } from '../src/clients/db-endpunkte.js';
import { holeTafel } from '../src/clients/timetables.js';
import { ladeSecrets } from './secrets.js';

// Rohdaten in den gitignorierten Spike-Ordner, nie in den Temp-Scratchpad
// einer Sitzung - der ist kein Ablageort und verschwindet (Regel seit 14.09.2026).
const AUSGABE = fileURLToPath(new URL('../test/fixtures/spike/schema-geometrie/', import.meta.url));

// Berlin Hbf tief - dort haengen die Fernzuege (Gleis 1-8).
const EVA_TIEF = '8098160';

function heuteJJJJMMTT(): string {
  const jetzt = new Date();
  const j = jetzt.getFullYear();
  const m = String(jetzt.getMonth() + 1).padStart(2, '0');
  const t = String(jetzt.getDate()).padStart(2, '0');
  return `${j}${m}${t}`;
}

/** Alle Schluessel eines verschachtelten Objekts, mit Pfad - zum Sichten. */
function schluesselpfade(wert: unknown, pfad = '', tiefe = 0): string[] {
  if (tiefe > 6 || wert === null || typeof wert !== 'object') return [];
  if (Array.isArray(wert)) {
    return wert.length > 0 ? schluesselpfade(wert[0], `${pfad}[]`, tiefe + 1) : [];
  }
  const raus: string[] = [];
  for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
    const p = pfad ? `${pfad}.${k}` : k;
    if (v !== null && typeof v === 'object') raus.push(...schluesselpfade(v, p, tiefe + 1));
    else raus.push(`${p} = ${JSON.stringify(v)}`);
  }
  return raus;
}

async function main(): Promise<void> {
  ladeSecrets();
  const datum = heuteJJJJMMTT();

  const tafel = await holeTafel(EVA_TIEF, 'dep');
  console.log(`Abfahrtstafel ${EVA_TIEF}: ${tafel.length} Eintraege`);
  const fern = tafel.filter((t) => /^(ICE|IC|EC)\s/.test(t.zug));
  console.log(`Davon Fernverkehr: ${fern.length}`);
  for (const t of fern.slice(0, 8)) {
    console.log(`  ${t.zug.padEnd(12)} ${t.zeitSoll} Gleis ${t.gleisSoll} → ${t.ziel}`);
  }

  if (fern.length === 0) {
    console.log('Kein Fernzug auf der Tafel – ohne Zugnummer keine Wagenreihung.');
    return;
  }

  // Der Reihe nach versuchen: nicht jeder Zug fuehrt eine Ist-Wagenreihung.
  for (const eintrag of fern.slice(0, 6)) {
    const nummer = eintrag.zug.replace(/\D+/g, '');
    const url = epWagenreihung(nummer, datum);
    console.log(`\n--- ${eintrag.zug} (Nr. ${nummer}), ${datum} ---`);
    console.log(url);
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    console.log('HTTP', res.status);
    if (res.status !== 200) continue;
    const body = (await res.json()) as unknown;

    mkdirSync(AUSGABE, { recursive: true });
    writeFileSync(join(AUSGABE, `h-wagenreihung-${nummer}.json`), JSON.stringify(body, null, 2));

    const pfade = schluesselpfade(body);
    console.log(`Felder (erstes Element je Liste), ${pfade.length} Blattwerte:`);
    for (const p of pfade.slice(0, 70)) console.log('  ', p);
    if (pfade.length > 70) console.log(`   … und ${pfade.length - 70} weitere`);

    // Gezielt nach Lageangaben suchen.
    const roh = JSON.stringify(body);
    for (const wort of [
      'sektor',
      'position',
      'prozent',
      'meter',
      'laenge',
      'gleis',
      'bahnsteig',
      'start',
      'ende',
    ]) {
      const treffer = [...new Set([...roh.matchAll(new RegExp(`"([a-zA-Z]*${wort}[a-zA-Z]*)"`, 'gi'))].map((m) => m[1]))];
      if (treffer.length) console.log(`  Felder mit "${wort}":`, treffer.join(', '));
    }
    console.log(`\nVolle Antwort: ${join(AUSGABE, `h-wagenreihung-${nummer}.json`)}`);
    return;
  }
  console.log('\nKein Zug lieferte eine Wagenreihung (alle 404).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
