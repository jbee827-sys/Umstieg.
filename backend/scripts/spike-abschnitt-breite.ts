// SONDIERUNG (wegwerfbar): Wie weit traegt der Abschnittsbezug aus FaSta?
//
// Der Berlin-Befund hat eine Luecke: Alle acht Abschnittsnennungen lauten
// "C/D" - also Mitte. Damit ist die gleichmaessige Einteilung in der Mitte
// bestaetigt, die RICHTUNG (welches Bahnsteigende ist A?) aber nicht. Die
// Frage ist, ob andere Bahnhoefe Nennungen abseits der Mitte liefern.
//
// Aufruf: npx tsx scripts/spike-abschnitt-breite.ts
import { holeAnlagen } from '../src/clients/fasta.js';
import { holeStationsInfo } from '../src/clients/stations.js';
import { ladeSecrets } from './secrets.js';

const BAHNHOEFE = [
  { eva: '8011160', label: 'Berlin Hbf' },
  { eva: '8000261', label: 'Muenchen Hbf' },
  { eva: '8000105', label: 'Frankfurt(Main)Hbf' },
  { eva: '8000152', label: 'Hannover Hbf' },
  { eva: '8002549', label: 'Hamburg Hbf' },
  { eva: '8000207', label: 'Koeln Hbf' },
  { eva: '8000284', label: 'Nuernberg Hbf' },
  { eva: '8000244', label: 'Mannheim Hbf' },
];

function abschnitte(text: string): string[] {
  const treffer = new Set<string>();
  for (const m of text.matchAll(/\(([A-G])\s*[/-]\s*([A-G])\)/g)) {
    treffer.add(m[1]);
    treffer.add(m[2]);
  }
  for (const m of text.matchAll(/\(([A-G])\)/g)) treffer.add(m[1]);
  for (const m of text.matchAll(/\bAbschnitt\s+([A-G])\b/gi)) treffer.add(m[1].toUpperCase());
  return [...treffer].sort();
}

async function main(): Promise<void> {
  ladeSecrets();
  console.log(
    'Bahnhof'.padEnd(22),
    'Anlagen'.padStart(8),
    'mit Abschn.'.padStart(12),
    'Buchstaben',
  );
  console.log('-'.repeat(72));

  for (const { eva, label } of BAHNHOEFE) {
    try {
      const info = await holeStationsInfo(eva);
      const nummer = info.stationID;
      if (!nummer) {
        console.log(label.padEnd(22), '(keine stationID)');
        continue;
      }
      const anlagen = await holeAnlagen(nummer);
      const mit = anlagen
        .map((a) => abschnitte(a.beschreibung ?? ''))
        .filter((s) => s.length > 0);
      const alle = [...new Set(mit.flat())].sort();
      console.log(
        label.padEnd(22),
        String(anlagen.length).padStart(8),
        String(mit.length).padStart(12),
        '  ' + (alle.join(', ') || '–'),
      );
    } catch (e) {
      console.log(label.padEnd(22), 'FEHLER:', String(e).slice(0, 60));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
