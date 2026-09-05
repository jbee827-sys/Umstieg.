// SONDIERUNG, zweiter Durchgang (wegwerfbar): Auswertung der gespeicherten
// FaSta-Rohantworten - KEINE weiteren API-Aufrufe.
//
// Der erste Durchgang zeigte: `description` nennt fast immer ein GLEISPAAR
// ("zu Gleis 15/16"), aber in wechselndem Vokabular - "Gleis", "Gl", "Gl.",
// "Bstg Gl", "Bst" - und manchmal als Bereich ("Gleis 3-8") oder als Paar von
// Bahnsteigen ("Gleis 5/6 (C/D) - Gleis 11/12"). Hier wird gemessen, wie weit
// ein toleranter Parser traegt und was er ueber die Bahnsteige verraet.
//
// Aufruf: npx tsx scripts/spike-fasta-auswertung.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { haversineM } from '../src/core/graph.js';

interface RohAnlage {
  type?: string;
  state?: string;
  description?: string;
  geocoordX?: number;
  geocoordY?: number;
}

// Toleranter Gleisbezug. Deckt "Gleis 15/16", "Gl 11/12", "Gl. 101/102",
// "Bstg Gl 3/4", "Bst 9/10" ab - mit Paar (a/b) oder Bereich (a-b).
const GLEIS_MUSTER = /(?:gleis|gleise|bstg\.?\s*gl\.?|bst\.?|gl\.?)\s*(\d+)\s*([/-]\s*(\d+))?/gi;

/** Alle im Text genannten Gleise, Bereiche aufgeloest. */
function gleiseAusText(text: string): string[] {
  const treffer = new Set<string>();
  for (const m of text.matchAll(GLEIS_MUSTER)) {
    const von = Number(m[1]);
    const bis = m[3] === undefined ? von : Number(m[3]);
    const trenner = m[2]?.trim().startsWith('-');
    if (trenner && bis > von && bis - von <= 20) {
      for (let g = von; g <= bis; g++) treffer.add(String(g));
    } else {
      treffer.add(String(von));
      if (m[3] !== undefined) treffer.add(String(bis));
    }
  }
  return [...treffer];
}

/** Bahnsteigschluessel: das Gleispaar, sortiert - "11/12" und "12/11" sind eins. */
function bahnsteigSchluessel(gleise: string[]): string {
  return [...gleise].sort((a, b) => Number(a) - Number(b)).join('/');
}

const ordner = join(process.env.TEMP ?? '.', 'fasta-spike');
for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.json'))) {
  const roh = JSON.parse(readFileSync(join(ordner, datei), 'utf8')) as unknown;
  const liste: RohAnlage[] = Array.isArray(roh)
    ? (roh as RohAnlage[])
    : ((roh as { facilities?: RohAnlage[] }).facilities ?? []);
  const relevant = liste.filter(
    (a) => (a.type === 'ELEVATOR' || a.type === 'ESCALATOR') && a.geocoordX !== undefined,
  );

  console.log(`\n${'='.repeat(72)}\n${datei}  -  ${relevant.length} Anlagen mit Koordinaten\n${'='.repeat(72)}`);

  const mitGleis = relevant.filter((a) => gleiseAusText(a.description ?? '').length > 0);
  const quote = relevant.length ? Math.round((100 * mitGleis.length) / relevant.length) : 0;
  console.log(`  mit erkanntem Gleisbezug: ${mitGleis.length}/${relevant.length}  (${quote} %)`);

  // Was faellt durch? Genau das sind die nicht-bahnsteigbezogenen Anlagen.
  const ohne = relevant.filter((a) => gleiseAusText(a.description ?? '').length === 0);
  console.log(`  ohne Gleisbezug (${ohne.length}):`);
  for (const t of [...new Set(ohne.map((a) => a.description ?? '(leer)'))].slice(0, 12)) {
    console.log(`     x ${t}`);
  }

  // Bahnsteige aus den Beschreibungen. Anlagen, die ZWEI Bahnsteige nennen
  // ("Gleis 5/6 (C/D) - Gleis 11/12"), sind Verbindungen, keine Zugaenge -
  // hier grob daran erkannt, dass mehr als zwei Gleise genannt sind.
  const proBahnsteig = new Map<string, { lat: number; lon: number }[]>();
  let verbindungen = 0;
  for (const a of mitGleis) {
    const gleise = gleiseAusText(a.description ?? '');
    if (gleise.length > 2) {
      verbindungen++;
      continue;
    }
    const k = bahnsteigSchluessel(gleise);
    if (!proBahnsteig.has(k)) proBahnsteig.set(k, []);
    proBahnsteig.get(k)!.push({ lat: a.geocoordY!, lon: a.geocoordX! });
  }
  console.log(`  Anlagen, die MEHRERE Bahnsteige nennen (Verbindungen): ${verbindungen}`);
  console.log(`  benannte Bahnsteige: ${proBahnsteig.size}`);

  // Je Bahnsteig: Wie weit streuen seine Anlagen? Das ist ein Untermass der
  // Bahnsteiglaenge - eine Zahl, die der platforms-Endpunkt NICHT liefert.
  for (const [k, punkte] of [...proBahnsteig.entries()].sort()) {
    let spanne = 0;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        spanne = Math.max(spanne, haversineM(punkte[i].lat, punkte[i].lon, punkte[j].lat, punkte[j].lon));
      }
    }
    console.log(`     Gleis ${k.padEnd(9)} ${String(punkte.length).padStart(2)} Anlagen, Spanne ${String(Math.round(spanne)).padStart(3)} m`);
  }

  // Abstand BENACHBARTER Bahnsteige - heute im Modell pauschal 15 m geraten.
  const mitten = [...proBahnsteig.entries()].map(([k, p]) => ({
    k,
    lat: p.reduce((s, x) => s + x.lat, 0) / p.length,
    lon: p.reduce((s, x) => s + x.lon, 0) / p.length,
  }));
  if (mitten.length > 1) {
    const abstaende: number[] = [];
    for (let i = 0; i < mitten.length; i++) {
      let naechster = Infinity;
      for (let j = 0; j < mitten.length; j++) {
        if (i === j) continue;
        naechster = Math.min(naechster, haversineM(mitten[i].lat, mitten[i].lon, mitten[j].lat, mitten[j].lon));
      }
      abstaende.push(Math.round(naechster));
    }
    console.log(`  Abstand zum naechsten Bahnsteig je Bahnsteig: ${abstaende.sort((a, b) => a - b).join(', ')} m   (Modell rechnet pauschal 15 m)`);
  }
}
