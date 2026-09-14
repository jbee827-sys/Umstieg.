// Die Zusicherungen der Simulationen, an EINER Stelle.
//
// Bis zum 14.09.2026 trug jedes Simulationsskript seine eigene Kopie. Die
// Prüfung des Schemas stand zweimal da, und eine dritte hätte gefehlt: Keine
// der beiden prüfte, ob der Graph den direkten Weg zu einer Treppe überhaupt
// ANBIETET. Genau dort saß der Fehler, der Leipzig ab der Bahnsteigmitte über
// den Kopf schickte, obwohl die Unterführung 31 s schneller war.
import { haversineM } from '../src/core/graph.js';
import { kantenZeitSekunden } from '../src/core/gehzeit.js';
import type { BahnhofSchema, GraphKante, GraphKnoten, StationGraph } from '../src/core/typen.js';

/** Alles, was das Schema behauptet, gegen das pruefen, was es behaupten darf. */
export function pruefeSchema(schema: BahnhofSchema, pfadLaenge: number, aufWechseln: number): string[] {
  const fehler: string[] = [];

  for (const ebene of schema.ebenen) {
    const quer = ebene.bahnsteige.map((b) => b.querM).filter((q): q is number => q !== undefined);
    for (let i = 1; i < quer.length; i++) {
      if (quer[i] < quer[i - 1]) fehler.push(`Querlage auf Ebene ${ebene.level} nicht monoton`);
    }
    if (quer.length > 0 && quer[0] !== 0) {
      fehler.push(`Querlage auf Ebene ${ebene.level} beginnt nicht bei 0`);
    }

    for (const b of ebene.bahnsteige) {
      if (b.laengeM === undefined) continue;
      if (b.laengeM < 10 || b.laengeM > 900) {
        fehler.push(`Bahnsteig ${b.gleise.join('/')}: ${b.laengeM} m unplausibel`);
      }
      for (const z of b.zugaenge ?? []) {
        if (z.beiM < -10 || z.beiM > b.laengeM + 10) {
          fehler.push(`Zugang bei ${z.beiM} m liegt neben dem ${b.laengeM}-m-Bahnsteig`);
        }
        if (z.aufzug + z.rolltreppe + z.treppe === 0) fehler.push('Zugang ohne eine einzige Anlage');
      }
    }
    for (const e of ebene.elemente ?? []) {
      if (e.punkte.length < 1 || e.punkte.length > 2) fehler.push('Anlage mit ungueltiger Punktzahl');
      if (e.typ === 'aufzug' && e.punkte.length !== 1) fehler.push('Aufzug ist kein Punkt');
    }
    if (ebene.art === 'gleise' && ebene.netz) fehler.push(`Gleisebene ${ebene.level} traegt ein Netz`);
    for (const n of ebene.netz ?? []) {
      if (n.punkte.length < 2) fehler.push('Wegstueck mit weniger als zwei Punkten');
    }
    for (const p of [...(ebene.weg ?? []), ...(ebene.netz ?? []).flatMap((n) => n.punkte)]) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fehler.push('Punkt ohne endliche Koordinate');
    }
  }

  let summe = 0;
  for (const ebene of schema.ebenen) {
    for (let i = 1; i < (ebene.weg?.length ?? 0); i++) {
      summe += Math.hypot(ebene.weg![i].x - ebene.weg![i - 1].x, ebene.weg![i].y - ebene.weg![i - 1].y);
    }
  }
  const erwartet = pfadLaenge - aufWechseln;
  if (erwartet > 20 && summe > erwartet + 5) {
    fehler.push(`Wegzerlegung zu lang: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  if (erwartet > 20 && summe < erwartet * 0.85) {
    fehler.push(`Wegzerlegung zu kurz: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  return fehler;
}

/**
 * JEDE Treppe, die die Route nimmt, muss im Schema stehen - auf der Ebene,
 * die sie verlaesst, UND auf der, die sie erreicht. Ueber ALLE Besuche einer
 * Ebene, nicht den ersten (siehe README, „Ein Befund war meine eigene
 * Fehlmessung").
 */
export function pruefeMarkierung(schema: BahnhofSchema): string[] {
  const fehler: string[] = [];
  for (const wechsel of schema.wechsel) {
    for (const level of [wechsel.vonLevel, wechsel.nachLevel]) {
      const besuche = schema.ebenen.filter((e) => e.level === level);
      if (besuche.length === 0) {
        fehler.push(`Ebenenwechsel nach ${level} fuehrt auf eine Ebene, die das Schema nicht hat`);
        continue;
      }
      const markiert = besuche.some((e) =>
        (e.elemente ?? []).some((el) => el.typ === wechsel.typ && el.aufRoute),
      );
      if (!markiert) {
        fehler.push(`${wechsel.typ} ${wechsel.vonLevel}→${wechsel.nachLevel} ist auf Ebene ${level} nicht markiert`);
      }
    }
  }
  return fehler;
}

/** Die Ebenenfolge als Kennung des Wegs: "1 → 0 → 1" statt "265 m". */
export function ebenenfolge(schema: BahnhofSchema): string {
  return schema.ebenen.map((e) => e.level).join(' → ');
}

/** Kürzeste Zeiten von einem Knoten zu allen — dieselben Kosten wie der Router. */
export function zeitenAb(
  graph: StationGraph,
  startId: string,
  nurEben = false,
  kosten: (k: GraphKante) => number = (k) => kantenZeitSekunden(k, 'normal'),
): Map<string, number> {
  const dist = new Map<string, number>([[startId, 0]]);
  // Binärer Haufen: Berlin Hbf trägt mehrere tausend Knoten, und die
  // Simulation fragt je Route zweimal.
  const haufen: [number, string][] = [[0, startId]];
  const hoch = (i: number): void => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (haufen[p][0] <= haufen[i][0]) break;
      [haufen[p], haufen[i]] = [haufen[i], haufen[p]];
      i = p;
    }
  };
  const runter = (i: number): void => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < haufen.length && haufen[l][0] < haufen[m][0]) m = l;
      if (r < haufen.length && haufen[r][0] < haufen[m][0]) m = r;
      if (m === i) break;
      [haufen[m], haufen[i]] = [haufen[i], haufen[m]];
      i = m;
    }
  };
  while (haufen.length > 0) {
    const [d, id] = haufen[0];
    const letzter = haufen.pop()!;
    if (haufen.length > 0) {
      haufen[0] = letzter;
      runter(0);
    }
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const k of graph.adjazenz.get(id) ?? []) {
      if (nurEben && k.deltaLevel !== 0) continue;
      const nach = k.von === id ? k.nach : k.von;
      const neu = d + kosten(k);
      if (neu < (dist.get(nach) ?? Infinity)) {
        dist.set(nach, neu);
        haufen.push([neu, nach]);
        hoch(haufen.length - 1);
      }
    }
  }
  return dist;
}

/** Lage eines Punktes zur Achse a→b: Anteil entlang, Meter quer. */
function achsenLage(a: GraphKnoten, b: GraphKnoten, p: GraphKnoten): { anteil: number; querM: number } {
  const mLat = 111_320;
  const mLon = mLat * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lon - a.lon) * mLon;
  const by = (b.lat - a.lat) * mLat;
  const px = (p.lon - a.lon) * mLon;
  const py = (p.lat - a.lat) * mLat;
  const l2 = Math.max(bx * bx + by * by, 1e-9);
  const t = (px * bx + py * by) / l2;
  return { anteil: t, querM: Math.hypot(px - t * bx, py - t * by) };
}

/**
 * Ist jeder Zugang des Bahnsteigs vom Standort aus OHNE UMWEG erreichbar?
 *
 * Der Fehler vom 14.09.2026: An jedem Bahnsteig mit zwei Gleisen war nur die
 * Kette des zuletzt verarbeiteten Gleises verdichtet. Von der Mitte des
 * anderen führte der Weg zur Treppe erst ans Bahnsteigende und zurück –
 * Leipzig 6: 139 s statt 72 s. Das Routing rechnete dabei exakt; nur der
 * Graph bot den geraden Weg nicht an. Keine Prüfung des Schemas konnte das
 * sehen, denn das Schema zeichnet den Weg, den der Graph liefert.
 *
 * Gemessen wird deshalb am GRAPHEN: Ebenen-Distanz vom Standort zu jedem
 * Ebenenwechsel, der auf diesem Bahnsteig ansetzt, gegen die Strecke entlang
 * der Achse. Mehr als 25 m und 30 % darüber ist ein Umweg.
 */
export function pruefeBahnsteigwege(graph: StationGraph, standort: GraphKnoten): string[] {
  if (!standort.gleis) return [];
  const anfang = graph.knoten.get(`gleis${standort.gleis}:anfang`);
  const ende = graph.knoten.get(`gleis${standort.gleis}:ende`);
  if (!anfang || !ende || anfang === ende) return [];
  const laenge = haversineM(anfang.lat, anfang.lon, ende.lat, ende.lon);
  if (laenge < 20) return [];
  const hier = achsenLage(anfang, ende, standort);
  const meter = zeitenAb(graph, standort.id, true, (k) => k.laengeM);

  const fehler: string[] = [];
  const gesehen = new Set<string>();
  for (const liste of graph.adjazenz.values()) {
    for (const k of liste) {
      if (k.deltaLevel === 0) continue;
      for (const id of [k.von, k.nach]) {
        if (gesehen.has(id)) continue;
        gesehen.add(id);
        const p = graph.knoten.get(id);
        if (!p || p.level !== standort.level) continue;
        const lage = achsenLage(anfang, ende, p);
        // Nur was wirklich auf DIESEM Bahnsteig ansetzt: nah an der Achse,
        // innerhalb seiner Länge. Die Treppe des Nachbarbahnsteigs gehört
        // nicht dazu - zu ihr führt zu Recht kein ebener Weg.
        if (lage.querM > 8 || lage.anteil < 0 || lage.anteil > 1) continue;
        const gerade = Math.abs(lage.anteil - hier.anteil) * laenge + lage.querM;
        const graphM = meter.get(id) ?? Infinity;
        if (graphM > gerade + 25 && graphM > gerade * 1.3) {
          fehler.push(
            `Gleis ${standort.gleis} ${standort.abschnitt ?? ''}: ${k.typ} bei ${Math.round(lage.anteil * laenge)} m ` +
              `nur über Umweg (${Number.isFinite(graphM) ? `${Math.round(graphM)} m` : 'unerreichbar'} statt ${Math.round(gerade)} m)`,
          );
        }
      }
    }
  }
  return fehler;
}

/** Zwei Ebenenwechsel näher als das sind derselbe Zugang, keine Alternative. */
const ZUGANG_ABSTAND_M = 30;

function naheAm(graph: StationGraph, a: GraphKante, b: GraphKante, grenzeM: number): boolean {
  const enden = (k: GraphKante): GraphKnoten[] =>
    [graph.knoten.get(k.von), graph.knoten.get(k.nach)].filter((x): x is GraphKnoten => x !== undefined);
  for (const p of enden(a)) {
    for (const q of enden(b)) if (haversineM(p.lat, p.lon, q.lat, q.lon) < grenzeM) return true;
  }
  return false;
}

export interface Alternativen {
  fehler: string[];
  /** Die schnellste erzwungene Route über einen ANDEREN ersten Ebenenwechsel. */
  zweitbesteSek?: number;
  zweitbesteTyp?: string;
}

/**
 * Ist wirklich jeder Weg geprüft?
 *
 * Für jeden Ebenenwechsel im Haus die beste Route, die ihn zwingend nimmt:
 * Start → Anlage → Ziel. Keine darf schneller sein als die gewählte - sonst
 * rechnen Router und Anzeige mit verschiedenen Kosten (so war es bis zum
 * 02.09.2026: Rolltreppe −10 s beim Routen, +10 s in der Anzeige).
 *
 * Nebenbei die Konkurrenz: Wie knapp liegt der beste Weg über einen anderen
 * Zugang? Unter 30 s entscheidet der Standort am Bahnsteig.
 */
export function pruefeAlternativen(
  graph: StationGraph,
  startId: string,
  zielId: string,
  gewaehltSek: number,
  ersterWechsel: GraphKante | undefined,
): Alternativen {
  const ab = zeitenAb(graph, startId);
  const bis = zeitenAb(graph, zielId);
  const direkt = bis.get(startId) ?? Infinity;
  const fehler: string[] = [];
  if (direkt < gewaehltSek - 1) {
    fehler.push(`Kürzeste Zeit laut Graph ${Math.round(direkt)} s, ausgewiesen ${gewaehltSek} s`);
  }

  let zweit: { sek: number; typ: string } | undefined;
  const geprueft = new Set<GraphKante>();
  for (const liste of graph.adjazenz.values()) {
    for (const k of liste) {
      if (k.deltaLevel === 0 || geprueft.has(k)) continue;
      geprueft.add(k);
      const c = kantenZeitSekunden(k, 'normal');
      const sek = Math.min(
        (ab.get(k.von) ?? Infinity) + c + (bis.get(k.nach) ?? Infinity),
        (ab.get(k.nach) ?? Infinity) + c + (bis.get(k.von) ?? Infinity),
      );
      if (!Number.isFinite(sek)) continue;
      if (sek < gewaehltSek - 1) {
        fehler.push(`Über ${k.typ} ${k.von}→${k.nach}: ${Math.round(sek)} s, schneller als die gewählte (${gewaehltSek} s)`);
      }
      // Konkurrenz: nur Wege über einen ANDEREN Zugang. Die Rolltreppe
      // gleich neben der gewählten ist keine Alternative, sondern dieselbe
      // Stelle - mitgezählt ergab das am 14.09.2026 „844 von 1044 Routen
      // knapp", eine Zahl ohne Aussage.
      if (ersterWechsel && naheAm(graph, k, ersterWechsel, ZUGANG_ABSTAND_M)) continue;
      if (!zweit || sek < zweit.sek) zweit = { sek, typ: k.typ };
    }
  }
  return {
    fehler,
    ...(zweit ? { zweitbesteSek: Math.round(zweit.sek), zweitbesteTyp: zweit.typ } : {}),
  };
}
