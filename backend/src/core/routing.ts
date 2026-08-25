import { peilungGrad } from './textgen.js';
import type {
  GraphKante,
  GraphKnoten,
  RoutenPfad,
  RoutenVariante,
  StationGraph,
} from './typen.js';

// Kantengewichte in Sekunden (Plan Task 7). Basisgewicht = laengeM / basisMproSek;
// Varianten-Zu- und Abschläge siehe kantenKosten().
export const GEWICHTE = {
  basisMproSek: 1.0,
  rolltreppeBonusSek: -10,
  aufzugMalusSek: 60,
  ebenenwechselMalusSek: 45,
  abbiegenMalusSek: 15,
  abbiegenSchwelleGrad: 45,
} as const;

/**
 * Liefert den Startknoten für ein Gleis. Abschnitt unbekannt oder nicht im
 * Graphen → Bahnsteigmitte mit transparentem Hinweis.
 */
export function findeStartknoten(
  graph: StationGraph,
  gleis: string,
  abschnitt?: string,
): { knoten: GraphKnoten; hinweis?: string } {
  const kandidaten = [...graph.knoten.values()].filter((kn) => kn.gleis === gleis);
  if (kandidaten.length === 0) {
    throw new Error(`Gleis ${gleis} ist im Stationsgraphen nicht vorhanden`);
  }
  const mitte = kandidaten.find((kn) => kn.abschnitt === 'mitte') ?? kandidaten[0];
  if (abschnitt === undefined) return { knoten: mitte };
  const treffer = kandidaten.find((kn) => kn.abschnitt === abschnitt);
  if (treffer) return { knoten: treffer };
  return {
    knoten: mitte,
    hinweis: `Abschnitt ${abschnitt} auf Gleis ${gleis} unbekannt – Route startet an der Bahnsteigmitte.`,
  };
}

/** Zwei Gleise liegen am selben physischen Bahnsteig (bahnsteigId der Bahnsteigpunkte). */
export function istGleicherBahnsteig(
  graph: StationGraph,
  gleisAn: string,
  gleisAb: string,
): boolean {
  if (gleisAn === gleisAb) return true;
  const idsVon = bahnsteigIds(graph, gleisAn);
  const idsNach = bahnsteigIds(graph, gleisAb);
  for (const id of idsVon) if (idsNach.has(id)) return true;
  return false;
}

function bahnsteigIds(graph: StationGraph, gleis: string): Set<string> {
  const ids = new Set<string>();
  for (const kn of graph.knoten.values()) {
    if (kn.gleis === gleis && kn.bahnsteigId) ids.add(kn.bahnsteigId);
  }
  return ids;
}

/** Winkeländerung in Grad, normalisiert auf 0..180. */
function richtungswechselGrad(vorher: number, nachher: number): number {
  let delta = Math.abs(nachher - vorher) % 360;
  if (delta > 180) delta = 360 - delta;
  return delta;
}

function kanteErlaubt(kante: GraphKante, variante: RoutenVariante): boolean {
  if (variante !== 'barrierefrei') return true;
  return kante.barrierefrei && kante.status !== 'INACTIVE';
}

/** Kosten einer Kante in Sekunden, ohne Abbiege-Malus (der hängt vom Vorgänger ab). */
function kantenKosten(kante: GraphKante, variante: RoutenVariante): number {
  let kosten = kante.laengeM / GEWICHTE.basisMproSek;
  if (variante === 'schnellste') {
    if (kante.typ === 'rolltreppe') kosten += GEWICHTE.rolltreppeBonusSek;
    if (kante.typ === 'aufzug') kosten += GEWICHTE.aufzugMalusSek;
  }
  if (variante === 'einfachste' && kante.deltaLevel !== 0) {
    kosten += GEWICHTE.ebenenwechselMalusSek;
  }
  return Math.max(0, kosten);
}

interface SuchZustand {
  knotenId: string;
  ankunftsKante: number; // Index in kantenListe; -1 = Start
  kosten: number;
}

/**
 * Dijkstra über Zustände (Knoten, Ankunftskante), damit der Abbiege-Malus der
 * Variante „einfachste" korrekt je Richtungswechsel gezählt werden kann.
 * Graphen sind klein (wenige hundert Knoten) – einfache Prioritätsliste genügt.
 */
export function berechneRoute(
  graph: StationGraph,
  startId: string,
  zielId: string,
  variante: RoutenVariante,
): RoutenPfad | null {
  if (!graph.knoten.has(startId) || !graph.knoten.has(zielId)) return null;

  // Alle Kanten einmalig indizieren (Adjazenz führt jede Kante doppelt).
  const kantenListe: GraphKante[] = [];
  const kantenIndex = new Map<GraphKante, number>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) {
      if (!kantenIndex.has(kante)) {
        kantenIndex.set(kante, kantenListe.length);
        kantenListe.push(kante);
      }
    }
  }

  const schluessel = (z: { knotenId: string; ankunftsKante: number }): string =>
    `${z.knotenId}|${z.ankunftsKante}`;
  const beste = new Map<string, number>();
  const vorgaenger = new Map<string, { zustand: string; kante: GraphKante } | null>();
  const offen: SuchZustand[] = [{ knotenId: startId, ankunftsKante: -1, kosten: 0 }];
  beste.set(schluessel(offen[0]), 0);
  vorgaenger.set(schluessel(offen[0]), null);

  while (offen.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < offen.length; i++) if (offen[i].kosten < offen[minIdx].kosten) minIdx = i;
    const aktuell = offen.splice(minIdx, 1)[0];
    const aktuellSchluessel = schluessel(aktuell);
    if (aktuell.kosten > (beste.get(aktuellSchluessel) ?? Infinity)) continue;
    if (aktuell.knotenId === zielId) {
      return rekonstruiere(graph, vorgaenger, aktuellSchluessel);
    }

    const hier = graph.knoten.get(aktuell.knotenId)!;
    const vorherPeilung =
      aktuell.ankunftsKante >= 0
        ? peilungDerKante(graph, kantenListe[aktuell.ankunftsKante], aktuell.knotenId)
        : null;

    for (const kante of graph.adjazenz.get(aktuell.knotenId) ?? []) {
      if (!kanteErlaubt(kante, variante)) continue;
      const naechsterId = kante.von === aktuell.knotenId ? kante.nach : kante.von;
      const naechster = graph.knoten.get(naechsterId);
      if (!naechster) continue;

      let kosten = kantenKosten(kante, variante);
      if (variante === 'einfachste' && vorherPeilung !== null) {
        const neuePeilung = peilungGrad(hier, naechster);
        if (richtungswechselGrad(vorherPeilung, neuePeilung) > GEWICHTE.abbiegenSchwelleGrad) {
          kosten += GEWICHTE.abbiegenMalusSek;
        }
      }

      const folge: SuchZustand = {
        knotenId: naechsterId,
        ankunftsKante: kantenIndex.get(kante)!,
        kosten: aktuell.kosten + kosten,
      };
      const folgeSchluessel = schluessel(folge);
      if (folge.kosten < (beste.get(folgeSchluessel) ?? Infinity)) {
        beste.set(folgeSchluessel, folge.kosten);
        vorgaenger.set(folgeSchluessel, { zustand: aktuellSchluessel, kante });
        offen.push(folge);
      }
    }
  }
  return null;
}

/** Peilung, mit der eine Kante am Knoten `ankunftId` ankommt (vom anderen Ende her). */
function peilungDerKante(graph: StationGraph, kante: GraphKante, ankunftId: string): number {
  const vonId = kante.von === ankunftId ? kante.nach : kante.von;
  return peilungGrad(graph.knoten.get(vonId)!, graph.knoten.get(ankunftId)!);
}

function rekonstruiere(
  graph: StationGraph,
  vorgaenger: Map<string, { zustand: string; kante: GraphKante } | null>,
  zielSchluessel: string,
): RoutenPfad {
  const knoten: GraphKnoten[] = [];
  const kanten: GraphKante[] = [];
  let aktuell: string | null = zielSchluessel;
  while (aktuell !== null) {
    const knotenId = aktuell.slice(0, aktuell.lastIndexOf('|'));
    knoten.unshift(graph.knoten.get(knotenId)!);
    const schritt: { zustand: string; kante: GraphKante } | null = vorgaenger.get(aktuell) ?? null;
    if (schritt) kanten.unshift(schritt.kante);
    aktuell = schritt ? schritt.zustand : null;
  }
  return { knoten, kanten, laengeM: kanten.reduce((s, ka) => s + ka.laengeM, 0) };
}
