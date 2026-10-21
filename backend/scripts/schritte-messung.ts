// Wie viele Schritte hat ein Umstieg, und wie viele davon sind kurz?
// Offline aus dem Startbestand (`osm-bestand/`), ohne Netz - dieselben
// Bausteine wie `routes/api.ts`. Anlass: „zu viele kleine Schritte“
// (Julian, 21.10.2026). Gemessen wird vor und nach einer Aenderung an
// `core/textgen.ts`.
//
// Aufruf: npx tsx scripts/schritte-messung.ts [anzahlBahnhoefe] [paareJeBahnhof]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baueGraph } from '../src/core/graph.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { generiereSchritte } from '../src/core/textgen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';

const ORDNER = join(import.meta.dirname, '..', 'osm-bestand');
const [anzahlRoh = '60', paareRoh = '6'] = process.argv.slice(2);
const anzahl = Number(anzahlRoh);
const paareJe = Number(paareRoh);

const dateien = readdirSync(ORDNER).filter((d) => d.endsWith('.json.gz')).sort();
// Gleichmaessig ueber den Bestand verteilt, nicht die ersten n (die EVA-Nummern sortieren grob nach Region).
const auswahl = dateien.filter((_, i) => i % Math.max(1, Math.floor(dateien.length / anzahl)) === 0).slice(0, anzahl);

const zahlen: number[] = [];
let kurz = 0;
let wenige = 0;
let senkrecht = 0;
let gesamt = 0;
// Das Frontend ordnet die Schritte ueber ihre Ebenenlaeufe den Baendern des
// Schemas zu (`besuchJeSchritt`) - beide Zahlen muessen gleich sein.
const schemaFehler: string[] = [];
const beispiele: { name: string; paar: string; schritte: string[] }[] = [];

for (const datei of auswahl) {
  const eintrag = await entpackeEintrag(readFileSync(join(ORDNER, datei)));
  const graph = baueGraph(eintrag.osm);
  graph.stufe = klassifiziere(graph);
  if (graph.stufe === 3 || graph.gleise.length < 2) continue;
  const gleise = graph.gleise;
  let paare = 0;
  for (let a = 0; a < gleise.length && paare < paareJe; a++) {
    const b = gleise.length - 1 - a;
    if (a === b) continue;
    let start, ziel;
    try {
      start = findeStartknoten(graph, gleise[a], 'mitte');
      ziel = findeStartknoten(graph, gleise[b]);
    } catch {
      continue;
    }
    const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, 'schnellste', 'normal');
    if (!pfad) continue;
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    paare++;
    const laeufe = schritte.filter((x, i) => x.level !== undefined && x.level !== schritte[i - 1]?.level).length;
    const baender = baueBahnhofSchema(graph, pfad).ebenen.length;
    if (laeufe !== baender) schemaFehler.push(`${eintrag.name} ${gleise[a]}→${gleise[b]}: ${laeufe} Laeufe, ${baender} Baender`);
    zahlen.push(schritte.length);
    gesamt += schritte.length;
    for (const s of schritte) {
      if (s.typ !== 'eben') senkrecht++;
      else if (s.distanzM === undefined) wenige++;
      else if (s.distanzM < 20) kurz++;
    }
    if (schritte.length >= 9 && beispiele.length < 4) {
      beispiele.push({ name: eintrag.name, paar: `${gleise[a]}→${gleise[b]}`, schritte: schritte.map((s) => s.text) });
    }
  }
}

zahlen.sort((x, y) => x - y);
const q = (p: number) => zahlen[Math.min(zahlen.length - 1, Math.floor(p * zahlen.length))];
console.log(`Wege: ${zahlen.length} · Schritte: ${gesamt} · Mittel ${(gesamt / zahlen.length).toFixed(1)}`);
console.log(`Median ${q(0.5)} · 90 % ${q(0.9)} · Maximum ${zahlen[zahlen.length - 1]}`);
console.log(
  `davon „wenige Meter“: ${wenige} (${((100 * wenige) / gesamt).toFixed(0)} %) · eben 10–19 m: ${kurz} (${((100 * kurz) / gesamt).toFixed(0)} %) · Treppe/Aufzug/Rampe: ${senkrecht}`,
);
console.log(`Schema: ${schemaFehler.length} Wege mit anderer Zahl von Laeufen als Baendern`);
for (const f of schemaFehler.slice(0, 10)) console.log(`  ${f}`);
for (const b of beispiele) console.log(`\n${b.name} ${b.paar}:\n  - ${b.schritte.join('\n  - ')}`);
