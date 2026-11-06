// Prueflauf der Wegtexte (Konzept 09, Abschnitt 7 und Paket 8) - offline aus
// dem Startbestand (`osm-bestand/`), dieselben Bausteine wie `routes/api.ts`.
//
// Je Weg der klassische und der neue Text nebeneinander, dazu die Regeln:
//   - kein „Ebene“ und keine Ziffer mit Minuszeichen im Text,
//   - Kurzfassung hoechstens 20 Woerter,
//   - hoechstens 6 Schritte (Auffaelligkeit, kein Fehler),
//   - kein „ebenerdig/stufenlos“, keine Himmelsrichtung,
//   - kein Laden, dessen Name im Bahnhof nicht eindeutig ist,
//   - Summe der Sekunden = gehzeitSek,
//   - jede besuchte Ebene hat einen Schritt (Laeufe = Baender des Schemas).
//
// Ausgabe: Zaehlung auf der Konsole, die Wege als Datei in
// `osm-ablage/laeufe/` (gitignored). Dort liegt auch die Stichprobe fuer die
// Lesbarkeitspruefung.
//
// Aufruf: npx tsx scripts/textpruefung.ts [anzahlBahnhoefe=382] [paareJeBahnhof=6] [stichprobe=50]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { baueGraph } from '../src/core/graph.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { bahnsteigEndenAusSchema, generiereText } from '../src/core/textgen.js';
import type { RoutenVariante, StationGraph } from '../src/core/typen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';

const ORDNER = join(import.meta.dirname, '..', 'osm-bestand');
const AUSGABE = join(import.meta.dirname, '..', 'osm-ablage', 'laeufe');
const [anzahlRoh = '382', paareRoh = '6', stichprobeRoh = '50'] = process.argv.slice(2);
const anzahl = Number(anzahlRoh);
const paareJe = Number(paareRoh);
const stichprobe = Number(stichprobeRoh);
const ABSCHNITTE = ['anfang', 'mitte', 'ende'] as const;

const dateien = readdirSync(ORDNER).filter((d) => d.endsWith('.json.gz')).sort();
const auswahl = dateien.filter((_, i) => i % Math.max(1, Math.floor(dateien.length / anzahl)) === 0).slice(0, anzahl);

interface Befund {
  regel: string;
  weg: string;
  detail: string;
}

interface Eintrag {
  weg: string;
  klassisch: string[];
  neu: string[];
  kurz?: string;
}

const befunde: Befund[] = [];
const eintraege: Eintrag[] = [];
const schritteAlt: number[] = [];
const schritteNeu: number[] = [];
let wenigeMeterAlt = 0;
let mitKurz = 0;

function eindeutigeLaeden(graph: StationGraph): Set<string> {
  const zahl = new Map<string, number>();
  for (const b of graph.bezugspunkte ?? []) {
    if (b.art === 'laden' && b.name) zahl.set(b.name, (zahl.get(b.name) ?? 0) + 1);
  }
  return new Set([...zahl].filter(([, n]) => n === 1).map(([name]) => name));
}

for (const datei of auswahl) {
  const eintrag = await entpackeEintrag(readFileSync(join(ORDNER, datei)));
  const graph = baueGraph(eintrag.osm);
  graph.stufe = klassifiziere(graph);
  if (graph.stufe === 3 || graph.gleise.length < 2) continue;
  const laeden = eindeutigeLaeden(graph);
  const gleise = graph.gleise;
  let paare = 0;
  for (let a = 0; a < gleise.length && paare < paareJe; a++) {
    const b = gleise.length - 1 - a;
    if (a === b) continue;
    const abschnitt = ABSCHNITTE[paare % 3];
    const variante: RoutenVariante = paare % 4 === 3 ? 'barrierefrei' : 'schnellste';
    let start, ziel;
    try {
      start = findeStartknoten(graph, gleise[a], abschnitt);
      ziel = findeStartknoten(graph, gleise[b]);
    } catch {
      continue;
    }
    const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante, 'normal');
    if (!pfad) continue;
    paare++;
    const name = `${eintrag.name} ${gleise[a]}→${gleise[b]} (${abschnitt}, ${variante})`;
    const schema = baueBahnhofSchema(graph, pfad);
    const alt = generiereText(pfad, { profil: 'normal', stil: 'klassisch' });
    const neu = generiereText(pfad, {
      profil: 'normal',
      stil: 'bezug',
      graph,
      bahnsteigEnden: bahnsteigEndenAusSchema(schema),
      schema,
    });
    schritteAlt.push(alt.schritte.length);
    schritteNeu.push(neu.schritte.length);
    wenigeMeterAlt += alt.schritte.filter((s) => s.text.includes('wenige Meter')).length;
    if (neu.kurzfassung) mitKurz++;
    eintraege.push({
      weg: name,
      klassisch: alt.schritte.map((s) => s.text),
      neu: neu.schritte.map((s) => `${s.text}${s.distanzM !== undefined ? ` · ${s.distanzM} m` : ''} · ${s.sekunden} s`),
      ...(neu.kurzfassung ? { kurz: neu.kurzfassung } : {}),
    });

    const melde = (regel: string, detail: string) => befunde.push({ regel, weg: name, detail });
    for (const s of neu.schritte) {
      if (/Ebene/.test(s.text)) melde('Ebene im Text', s.text);
      if (/[-−]\d/.test(s.text)) melde('Ziffer mit Minus', s.text);
      if (/ebenerdig|stufenlos/i.test(s.text)) melde('ebenerdig/stufenlos', s.text);
      // Julian, 06.11.2026: Wo Norden ist, weiss in einer Halle niemand.
      if (/(Nord|Süd|Ost|West)ende|Richtung (Nord|Süd|Ost|West)/.test(s.text)) melde('Himmelsrichtung', s.text);
      const laden = s.text.match(/an (.+?) vorbei/);
      if (laden && !laeden.has(laden[1])) melde('Laden nicht eindeutig', s.text);
    }
    if (neu.kurzfassung && neu.kurzfassung.split(/\s+/).length > 20) melde('Kurzfassung > 20 Wörter', neu.kurzfassung);
    if (!neu.kurzfassung) melde('keine Kurzfassung', neu.schritte.map((s) => s.text).join(' | '));
    if (neu.schritte.length > 6) melde('mehr als 6 Schritte (Auffälligkeit)', String(neu.schritte.length));
    const summe = neu.schritte.reduce((n, s) => n + (s.sekunden ?? 0), 0);
    if (summe !== gehzeitSekunden(pfad, 'normal')) melde('Sekunden ≠ Gehzeit', `${summe} ≠ ${gehzeitSekunden(pfad, 'normal')}`);
    const laeufe = neu.schritte.filter((x, i) => x.level !== undefined && x.level !== neu.schritte[i - 1]?.level).length;
    if (laeufe !== schema.ebenen.length) melde('Ebene ohne Schritt', `${laeufe} Läufe, ${schema.ebenen.length} Bänder`);
  }
}

const mittel = (z: number[]) => (z.reduce((a, b) => a + b, 0) / Math.max(1, z.length)).toFixed(1);
const maximum = (z: number[]) => Math.max(...z);
const zaehlung = new Map<string, number>();
for (const b of befunde) zaehlung.set(b.regel, (zaehlung.get(b.regel) ?? 0) + 1);

const kopf = [
  `Wege: ${eintraege.length} an ${auswahl.length} Bahnhöfen`,
  `Schritte je Weg: klassisch Mittel ${mittel(schritteAlt)}, max ${maximum(schritteAlt)} · neu Mittel ${mittel(schritteNeu)}, max ${maximum(schritteNeu)}`,
  `„wenige Meter“ klassisch: ${wenigeMeterAlt} · mit Kurzfassung: ${mitKurz}`,
  `Befunde: ${befunde.length}`,
  ...[...zaehlung].map(([regel, n]) => `  ${regel}: ${n}`),
];
console.log(kopf.join('\n'));

mkdirSync(AUSGABE, { recursive: true });
const datum = new Date().toISOString().slice(0, 10);
const zeilen = [...kopf, '', '## Befunde', ...befunde.map((b) => `- [${b.regel}] ${b.weg}: ${b.detail}`), '', '## Wege'];
for (const e of eintraege) {
  zeilen.push('', `### ${e.weg}`, `Kurz: ${e.kurz ?? '–'}`, 'neu:', ...e.neu.map((t, i) => `  ${i + 1}. ${t}`));
  zeilen.push('klassisch:', ...e.klassisch.map((t, i) => `  ${i + 1}. ${t}`));
}
writeFileSync(join(AUSGABE, `textpruefung-${datum}.txt`), zeilen.join('\n'), 'utf8');
// Stichprobe fuer die Lesbarkeitspruefung: gleichmaessig ueber alle Wege.
const schritt = Math.max(1, Math.floor(eintraege.length / stichprobe));
const probe = eintraege.filter((_, i) => i % schritt === 0).slice(0, stichprobe);
writeFileSync(
  join(AUSGABE, `textpruefung-${datum}-stichprobe.txt`),
  probe.map((e) => [`### ${e.weg}`, `Kurz: ${e.kurz ?? '–'}`, ...e.neu.map((t, i) => `  ${i + 1}. ${t}`)].join('\n')).join('\n\n'),
  'utf8',
);
console.log(`Datei: osm-ablage/laeufe/textpruefung-${datum}.txt (+ -stichprobe.txt, ${probe.length} Wege)`);
