// SONDIERUNG (wegwerfbar): Laesst sich ein Bahnsteigabschnitt (A-G) verorten?
//
// Das ist die Kernfrage des Alleinstellungsmerkmals: Wagenreihung liefert
// "Abschnitt C", das Schema muss daraus einen ORT machen. OSM kennt fuer
// Berlin Hbf keinen einzigen Abschnittsmarker (nachgeprueft, auch mit
// erweiterter Abfrage). Bleibt eine Quelle: FaSta schreibt die Abschnitte in
// die Anlagenbeschreibung - "Gleis 5/6 (C/D) - Gleis 15/16" - und liefert
// Koordinaten dazu.
//
// Geprueft wird deshalb: Wenn man die FaSta-Anlage auf die OSM-Bahnsteigachse
// projiziert, liegt sie dort, wo eine gleichmaessige Einteilung A-G den
// genannten Abschnitt erwarten laesst? Faellt der Test aus, ist die
// gleichmaessige Einteilung eine Erfindung und darf nicht gezeichnet werden.
//
// Aufruf: npx tsx scripts/spike-abschnitt-verortung.ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { holeAnlagen } from '../src/clients/fasta.js';
import { bahnsteigSchluessel } from '../src/core/fasta-gleisbezug.js';
import { haversineM } from '../src/core/graph.js';
import type { FastaAnlage, OsmElement, OverpassAntwort } from '../src/core/typen.js';
import { ladeSecrets } from './secrets.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const STATION_ID = '1071'; // Berlin Hbf, StaDa-Nummer

/** Abschnittsbuchstaben aus "(C/D)", "(A-D)", "Abschnitt C". */
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

interface Achse {
  schluessel: string;
  level: number | undefined;
  a: [number, number];
  b: [number, number];
  laengeM: number;
}

/** Bahnsteigachsen aus dem OSM-Fixture, je Gleispaar. */
function achsen(osm: OverpassAntwort): Map<string, Achse> {
  const nodes = new Map<number, OsmElement>();
  const ways = new Map<number, OsmElement>();
  const relationen: OsmElement[] = [];
  for (const el of osm.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else relationen.push(el);
  }

  const ergebnis = new Map<string, Achse>();
  const eintragen = (refs: string[], level: string | undefined, nodeIds: number[]): void => {
    if (refs.length === 0) return;
    const punkte = nodeIds
      .map((id) => nodes.get(id))
      .filter((n): n is OsmElement => n?.lat !== undefined && n.lon !== undefined)
      .map((n) => [n.lat!, n.lon!] as [number, number]);
    if (punkte.length < 2) return;
    let a = punkte[0];
    let b = punkte[1];
    let max = -1;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        const d = haversineM(punkte[i][0], punkte[i][1], punkte[j][0], punkte[j][1]);
        if (d > max) {
          max = d;
          a = punkte[i];
          b = punkte[j];
        }
      }
    }
    ergebnis.set(bahnsteigSchluessel(refs), {
      schluessel: bahnsteigSchluessel(refs),
      level: level === undefined ? undefined : Number(level),
      a,
      b,
      laengeM: max,
    });
  };

  const relMitglieder = new Set<number>();
  for (const rel of relationen) {
    if (rel.tags?.railway !== 'platform') continue;
    const ids: number[] = [];
    for (const m of rel.members ?? []) {
      if (m.type !== 'way' || m.role === 'inner') continue;
      const w = ways.get(m.ref);
      if (w?.nodes) {
        ids.push(...w.nodes);
        relMitglieder.add(m.ref);
      }
    }
    eintragen(
      (rel.tags?.ref ?? '').split(/[;/]/).map((r) => r.trim()).filter(Boolean),
      rel.tags?.level,
      ids,
    );
  }
  for (const [id, way] of ways) {
    if (way.tags?.railway !== 'platform' || relMitglieder.has(id)) continue;
    eintragen(
      (way.tags?.ref ?? '').split(/[;/]/).map((r) => r.trim()).filter(Boolean),
      way.tags?.level,
      way.nodes ?? [],
    );
  }
  return ergebnis;
}

/** Lage auf der Achse als Anteil 0..1 (0 = Ende a, 1 = Ende b) plus Abstand quer. */
function projiziere(
  achse: Achse,
  lat: number,
  lon: number,
): { anteil: number; querM: number } {
  // Lokale Meter-Ebene: lat/lon linear um den Achsenanfang.
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((achse.a[0] * Math.PI) / 180);
  const ax = 0;
  const ay = 0;
  const bx = (achse.b[1] - achse.a[1]) * mLon;
  const by = (achse.b[0] - achse.a[0]) * mLat;
  const px = (lon - achse.a[1]) * mLon;
  const py = (lat - achse.a[0]) * mLat;
  const laenge2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = laenge2 === 0 ? 0 : ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / laenge2;
  const projX = ax + t * (bx - ax);
  const projY = ay + t * (by - ay);
  const quer = Math.hypot(px - projX, py - projY);
  return { anteil: t, querM: quer };
}

/** Erwarteter Anteil des Abschnitts bei gleichmaessiger Einteilung A..letzter. */
function erwarteterAnteil(buchstaben: string[], letzter: string): number {
  const n = letzter.charCodeAt(0) - 65 + 1; // A=1
  const mitten = buchstaben.map((b) => (b.charCodeAt(0) - 65 + 0.5) / n);
  return mitten.reduce((s, m) => s + m, 0) / mitten.length;
}

async function main(): Promise<void> {
  ladeSecrets();

  const osm = JSON.parse(
    readFileSync(join(HIER, '..', 'test', 'fixtures', 'overpass', 'berlin-hbf.json'), 'utf8'),
  ) as OverpassAntwort;
  const bahnsteigAchsen = achsen(osm);

  console.log('OSM-Bahnsteigachsen (Berlin Hbf):');
  for (const a of bahnsteigAchsen.values()) {
    console.log(`  ${a.schluessel.padEnd(8)} level=${String(a.level).padEnd(6)} ${Math.round(a.laengeM)} m`);
  }

  const anlagen: FastaAnlage[] = await holeAnlagen(STATION_ID);

  // Welche Anlagen nennen ueberhaupt einen Abschnitt?
  const mitAbschnitt = anlagen
    .map((a) => ({ anlage: a, abschnitte: abschnitte(a.beschreibung ?? '') }))
    .filter((e) => e.abschnitte.length > 0);

  console.log(
    `\nFaSta-Anlagen: ${anlagen.length} · mit Abschnittsbuchstaben in der Beschreibung: ${mitAbschnitt.length}`,
  );

  // Der Gleisbezug: der Parser verankert nur bei GENAU einer Fundstelle.
  // Die interessanten Faelle ("Gleis 5/6 (C/D) - Gleis 15/16") haben zwei -
  // der Abschnitt gehoert aber eindeutig zur ERSTEN Nennung.
  console.log('\nAbschnittsnennungen im Einzelnen:');
  const treffer: {
    beschreibung: string;
    schluessel: string;
    abschnitte: string[];
    anteil: number;
    querM: number;
    erwartet: number;
    laengeM: number;
  }[] = [];

  for (const { anlage, abschnitte: abs } of mitAbschnitt) {
    const text = anlage.beschreibung ?? '';
    // Erste Gleisnennung = der Bahnsteig, zu dem der Abschnitt gehoert.
    const ersteNennung = text.match(/\b(?:gleis|gl\.?)\s*(\d+)(?:\s*\/\s*(\d+))?/i);
    if (!ersteNennung) {
      console.log(`  [kein Gleisbezug] ${text}`);
      continue;
    }
    const refs = [ersteNennung[1], ersteNennung[2]].filter((r): r is string => r !== undefined);
    const schluessel = bahnsteigSchluessel(refs);
    const achse = bahnsteigAchsen.get(schluessel);
    if (!achse) {
      console.log(`  [Bahnsteig ${schluessel} nicht in OSM] ${text}`);
      continue;
    }
    const { anteil, querM } = projiziere(achse, anlage.lat, anlage.lon);
    const erwartet = erwarteterAnteil(abs, 'G');
    treffer.push({
      beschreibung: text,
      schluessel,
      abschnitte: abs,
      anteil,
      querM,
      erwartet,
      laengeM: achse.laengeM,
    });
    console.log(
      `  ${schluessel.padEnd(6)} Abschnitt ${abs.join('/').padEnd(5)} → Achsenanteil ${anteil.toFixed(3)} (erwartet bei A-G: ${erwartet.toFixed(3)})  quer ${querM.toFixed(0)} m  Bahnsteig ${Math.round(achse.laengeM)} m`,
    );
  }

  if (treffer.length === 0) {
    console.log('\nKein einziger Treffer – Abschnitte sind nicht verortbar.');
    return;
  }

  console.log('\n--- Auswertung ---');
  // Richtungsfrage: Liegt A am Achsenanfang oder am Achsenende? Beides pruefen.
  for (const richtung of ['A am Achsenanfang', 'A am Achsenende'] as const) {
    const fehler = treffer.map((t) => {
      const gemessen = richtung === 'A am Achsenanfang' ? t.anteil : 1 - t.anteil;
      return Math.abs(gemessen - t.erwartet) * t.laengeM;
    });
    const mittel = fehler.reduce((s, f) => s + f, 0) / fehler.length;
    const max = Math.max(...fehler);
    console.log(
      `  ${richtung.padEnd(20)}: mittlerer Fehler ${mittel.toFixed(0)} m, groesster ${max.toFixed(0)} m`,
    );
  }
  const querMittel = treffer.reduce((s, t) => s + t.querM, 0) / treffer.length;
  console.log(`  Querabstand zur Bahnsteigachse: im Mittel ${querMittel.toFixed(0)} m`);
  console.log(
    `  Ein Abschnitt ist bei A-G und ${Math.round(treffer[0].laengeM)} m Bahnsteig ${Math.round(treffer[0].laengeM / 7)} m breit.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
