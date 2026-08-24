import type { GraphKante, StationGraph, Stufe } from './typen.js';

// Klassifikationsheuristik (Konzept Abschnitt 5, Startwerte – über den
// Datenrealitäts-Spike nachjustierbar):
//   Stufe 1: ≥1 Ebenenwechsel-Kante mit echten level-Daten UND
//            zusammenhängender Fußweg-Graph zwischen ≥80 % der Bahnsteige
//   Stufe 2: Bahnsteige + irgendein Fußweg
//   Stufe 3: sonst (→ Synthesemodell)
const STUFE1_VERBUNDENHEIT = 0.8;

/** Alle Kanten genau einmal (Adjazenzliste führt jede Kante doppelt). */
function alleKanten(graph: StationGraph): GraphKante[] {
  const gesehen = new Set<GraphKante>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) gesehen.add(kante);
  }
  return [...gesehen];
}

function mittenIds(graph: StationGraph): string[] {
  return graph.gleise
    .map((g) => `gleis${g}:mitte`)
    .filter((id) => graph.knoten.has(id));
}

/** BFS-Komponente ab startId (über alle Kantentypen). */
function komponente(graph: StationGraph, startId: string): Set<string> {
  const besucht = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const aktuell = queue.shift()!;
    for (const kante of graph.adjazenz.get(aktuell) ?? []) {
      const naechster = kante.von === aktuell ? kante.nach : kante.von;
      if (!besucht.has(naechster)) {
        besucht.add(naechster);
        queue.push(naechster);
      }
    }
  }
  return besucht;
}

/** Ordnet jeder Bahnsteig-Mitte eine Komponenten-Nummer zu. */
function mittenKomponenten(graph: StationGraph): Map<string, number> {
  const mitten = mittenIds(graph);
  const zuordnung = new Map<string, number>();
  let naechsteNummer = 0;
  for (const mitte of mitten) {
    if (zuordnung.has(mitte)) continue;
    const erreicht = komponente(graph, mitte);
    for (const andere of mitten) {
      if (erreicht.has(andere)) zuordnung.set(andere, naechsteNummer);
    }
    naechsteNummer++;
  }
  return zuordnung;
}

/** Anteil der Gleispaare, zwischen denen ein Weg existiert (0..1). */
export function erreichbareGleisPaare(graph: StationGraph): number {
  const mitten = mittenIds(graph);
  if (mitten.length < 2) return mitten.length === 1 ? 1 : 0;
  const zuordnung = mittenKomponenten(graph);
  let verbunden = 0;
  let gesamt = 0;
  for (let i = 0; i < mitten.length; i++) {
    for (let j = i + 1; j < mitten.length; j++) {
      gesamt++;
      if (zuordnung.get(mitten[i]) === zuordnung.get(mitten[j])) verbunden++;
    }
  }
  return gesamt === 0 ? 0 : verbunden / gesamt;
}

export function klassifiziere(graph: StationGraph): Stufe {
  if (graph.gleise.length === 0) return 3;

  const kanten = alleKanten(graph);
  const hatEbenenwechselMitLevel = kanten.some(
    (k) =>
      (k.typ === 'treppe' || k.typ === 'rolltreppe' || k.typ === 'aufzug') && k.deltaLevel !== 0,
  );

  const mitten = mittenIds(graph);
  if (hatEbenenwechselMitLevel && mitten.length >= 2) {
    // größte Komponente unter den Bahnsteig-Mitten
    const zuordnung = mittenKomponenten(graph);
    const groessen = new Map<number, number>();
    for (const nummer of zuordnung.values()) {
      groessen.set(nummer, (groessen.get(nummer) ?? 0) + 1);
    }
    const groesste = Math.max(0, ...groessen.values());
    if (groesste / mitten.length >= STUFE1_VERBUNDENHEIT) return 1;
  }

  // irgendein echter Fußweg zwischen physischen Knoten?
  const hatFussweg = kanten.some(
    (k) => k.typ !== 'aufzug' && k.von.startsWith('n') && k.nach.startsWith('n'),
  );
  return hatFussweg ? 2 : 3;
}
