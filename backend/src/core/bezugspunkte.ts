import type { Etappe } from './etappen.js';
import { aussteigeSeite, gleisSchluessel } from './gleisseite.js';
import { haversineM } from './graph.js';
import { peilungGrad, winkelDelta, type Segment } from './segmente.js';
import type { GraphKante, GraphKnoten, RoutenPfad, StationGraph } from './typen.js';

/**
 * Bezugspunkte je Etappe (Konzept 09, 5.2 und 5.3).
 *
 * Rangfolge: Gleisnummer am Aufgang (steht im Satz ohnehin als Ziel), Zaehlen
 * der Aufgaenge, Anlagen am Weg, Gangnamen und Ausgaenge, Laeden, zuletzt
 * grobe Meter. Jede Funktion hier liefert einen davon oder nichts - geraten
 * wird nicht. Ein fehlender Bezugspunkt macht den Satz ungenauer, ein falscher
 * schickt jemanden in die falsche Richtung.
 */

export type Seite = 'links' | 'rechts';

/** Unter diesem Winkel ist ein Abzweig „geradeaus“, nicht links oder rechts. */
const SEITE_MIN_GRAD = 25;
/** Ab hier ist es Abbiegen, darunter „links/rechts halten“. */
const ABBIEGEN_GRAD = 50;
/** Darunter ist ein Knick kein Abbiegen (wie `MERGE_SCHWELLE_GRAD`). */
const KNICK_MIN_GRAD = 25;
/** So weit entlang des Wegs darf der Abzweig vom geglaetteten Knick liegen. */
const ABZWEIG_SUCHE_M = 8;
/** Gezaehlt wird hoechstens bis zum vierten Aufgang (Konzept 09, 5.2). */
const ZAEHLEN_MAX = 4;
/** Ein Laden zaehlt, wenn er so nah am Weg liegt (Konzept 09, 4.3). */
const LADEN_MAX_M = 10;
/** Ein Ausgang ohne eigenen Wegknoten zaehlt, wenn er so nah am Weg liegt. */
const AUSGANG_MAX_M = 5;
/** Unter dieser Strecke entlang der Bahnsteigachse gibt es keine Richtung. */
const RICHTUNG_MIN_M = 15;

/** Ist ein Ebenenwechsel - Treppe, Rolltreppe, Aufzug, Rampe mit Hoehenunterschied. */
function istAufgangKante(k: GraphKante): boolean {
  return k.typ !== 'eben' && (k.deltaLevel !== 0 || k.typ === 'aufzug');
}

function andererKnoten(k: GraphKante, id: string): string {
  return k.von === id ? k.nach : k.von;
}

/** Laengen kumuliert entlang des Pfads, `m[i]` = Meter bis Knoten i. */
function kumuliert(pfad: RoutenPfad): number[] {
  const m = [0];
  for (let i = 0; i < pfad.kanten.length; i++) m.push(m[i] + (pfad.kanten[i]?.laengeM ?? 0));
  return m;
}

/**
 * Zweigt an Knoten `i` des Pfads ein anderer begehbarer Weg ab?
 *
 * Ohne Graph (Haltestellenpfad) ist jeder Knick eine Entscheidung - draussen
 * kennt der Text das Wegenetz nicht.
 */
export function istEntscheidungspunkt(pfad: RoutenPfad, graph: StationGraph | undefined, i: number): boolean {
  if (!graph) return true;
  const hier = pfad.knoten[i];
  if (!hier) return false;
  const nachbarn = new Set<string>();
  for (const k of graph.adjazenz.get(hier.id) ?? []) {
    const anderer = andererKnoten(k, hier.id);
    if (anderer === pfad.knoten[i - 1]?.id || anderer === pfad.knoten[i + 1]?.id) continue;
    if (graph.knoten.get(anderer)?.poi) continue;
    nachbarn.add(anderer);
  }
  return nachbarn.size > 0;
}

/** Gehrichtung am Knoten `i`: ueber etwa 5 m davor, am Anfang ueber 5 m danach. */
function gehPeilung(pfad: RoutenPfad, m: number[], i: number, abIndex: number): number | null {
  let j = i;
  while (j > abIndex && m[i] - m[j] < 5) j--;
  if (j < i && m[i] - m[j] > 0.5) return peilungGrad(pfad.knoten[j], pfad.knoten[i]);
  let k = i;
  while (k < pfad.knoten.length - 1 && m[k] - m[i] < 5) k++;
  if (k > i && m[k] - m[i] > 0.5) return peilungGrad(pfad.knoten[i], pfad.knoten[k]);
  return null;
}

function seiteAus(delta: number): Seite | undefined {
  if (delta >= SEITE_MIN_GRAD && delta <= 180 - SEITE_MIN_GRAD) return 'links';
  if (delta <= -SEITE_MIN_GRAD && delta >= -(180 - SEITE_MIN_GRAD)) return 'rechts';
  return undefined;
}

/** Auf welcher Seite liegt `ziel`, von Knoten `i` aus in Gehrichtung gesehen? */
function seiteVon(pfad: RoutenPfad, m: number[], i: number, abIndex: number, ziel: GraphKnoten): Seite | undefined {
  const geh = gehPeilung(pfad, m, i, abIndex);
  const hier = pfad.knoten[i];
  if (geh === null || (hier.lat === ziel.lat && hier.lon === ziel.lon)) return undefined;
  return seiteAus(winkelDelta(geh, peilungGrad(hier, ziel)));
}

/**
 * Zu welchem Bahnsteig fuehrt ein Aufgang? Kurze Suche ueber ebene Kanten am
 * oberen Ende, bis ein Bahnsteigpunkt gefunden ist.
 */
function bahnsteigHinter(graph: StationGraph, startId: string): string | undefined {
  const start = graph.knoten.get(startId);
  if (!start) return undefined;
  if (start.bahnsteigId) return start.bahnsteigId;
  const besucht = new Set([startId]);
  let rand = [startId];
  for (let tiefe = 0; tiefe < 12 && rand.length > 0 && besucht.size < 80; tiefe++) {
    const naechste: string[] = [];
    for (const id of rand) {
      for (const k of graph.adjazenz.get(id) ?? []) {
        if (istAufgangKante(k)) continue;
        const anderer = andererKnoten(k, id);
        if (besucht.has(anderer)) continue;
        // Nur ueber den Bahnsteig selbst weiter, wenn man ihn erreicht hat -
        // sonst laeuft die Suche ueber Gaenge zum naechsten Bahnsteig.
        if (tiefe > 3 && k.lage !== 'bahnsteig') continue;
        besucht.add(anderer);
        const knoten = graph.knoten.get(anderer);
        if (knoten?.bahnsteigId) return knoten.bahnsteigId;
        naechste.push(anderer);
      }
    }
    rand = naechste;
  }
  return undefined;
}

export interface AufgangZaehlung {
  seite: Seite;
  /** 1 = erster Aufgang auf dieser Seite. Fehlt, wenn es mehr als vier sind. */
  ordnung?: number;
  /** Gab es vorher auf dieser Seite schon einen anderen Aufgang? */
  mitVorgaengern: boolean;
}

/**
 * „Zweiter Aufgang rechts“: Zaehlt die Aufgaenge zu ANDEREN Bahnsteigen auf
 * derselben Seite, von Anfang der Etappe `weg` bis zum Fuss des Wechsels `auf`
 * (Konzept 09, 5.2). Aufgaenge zum selben Bahnsteig zaehlen einmal.
 */
export function zaehleAufgaenge(
  pfad: RoutenPfad,
  graph: StationGraph | undefined,
  weg: Etappe,
  auf: Etappe,
): AufgangZaehlung | undefined {
  if (!graph) return undefined;
  const fuss = auf.knotenVon;
  const oben = pfad.knoten[fuss + 1];
  if (!oben || fuss < weg.knotenVon) return undefined;
  const m = kumuliert(pfad);
  const seite = seiteVon(pfad, m, fuss, weg.knotenVon, oben);
  if (!seite) return undefined;
  const eigenerBahnsteig = bahnsteigHinter(graph, pfad.knoten[auf.knotenBis].id) ?? `eigen:${oben.id}`;

  const gesehen = new Set<string>();
  for (let i = weg.knotenVon; i <= fuss; i++) {
    const hier = pfad.knoten[i];
    for (const k of graph.adjazenz.get(hier.id) ?? []) {
      if (!istAufgangKante(k)) continue;
      const anderer = andererKnoten(k, hier.id);
      if (anderer === pfad.knoten[i - 1]?.id) continue;
      if (i === fuss && anderer === oben.id) continue;
      const knoten = graph.knoten.get(anderer);
      if (!knoten || seiteVon(pfad, m, i, weg.knotenVon, knoten) !== seite) continue;
      const bahnsteig = bahnsteigHinter(graph, anderer);
      if (!bahnsteig) continue;
      // Am selben Fuss ein anderer Aufgang auf derselben Seite: Welcher der
      // „zweite“ ist, liesse sich nicht sagen.
      if (i === fuss && bahnsteig !== eigenerBahnsteig) return { seite, mitVorgaengern: true };
      gesehen.add(bahnsteig);
    }
  }
  const ordnung = gesehen.has(eigenerBahnsteig) ? [...gesehen].indexOf(eigenerBahnsteig) + 1 : gesehen.size + 1;
  const mitVorgaengern = ordnung > 1;
  return ordnung > ZAEHLEN_MAX ? { seite, mitVorgaengern } : { seite, ordnung, mitVorgaengern };
}

/**
 * Abbiegen innerhalb einer ebenen Etappe - nur an Entscheidungspunkten
 * (Konzept 09, 5.3). Ein Knick ohne Abzweigung ist der Verlauf des Gangs.
 */
export function abbiegungen(
  pfad: RoutenPfad,
  graph: StationGraph | undefined,
  segmente: Segment[],
  etappe: Etappe,
): string[] {
  const m = kumuliert(pfad);
  const woerter: string[] = [];
  for (let n = 0; n < etappe.segmente.length - 1; n++) {
    const a = segmente[etappe.segmente[n]];
    const b = segmente[etappe.segmente[n + 1]];
    if (a.peilungEnde === null || b.peilungStart === null) continue;
    const delta = winkelDelta(a.peilungEnde, b.peilungStart);
    if (Math.abs(delta) < KNICK_MIN_GRAD) continue;
    const knick = a.knotenBis;
    let entscheidung = false;
    for (let i = knick; i >= etappe.knotenVon && m[knick] - m[i] <= ABZWEIG_SUCHE_M && !entscheidung; i--) {
      entscheidung = istEntscheidungspunkt(pfad, graph, i);
    }
    for (let i = knick + 1; i < etappe.knotenBis && m[i] - m[knick] <= ABZWEIG_SUCHE_M && !entscheidung; i++) {
      entscheidung = istEntscheidungspunkt(pfad, graph, i);
    }
    if (!entscheidung) continue;
    const seite = delta > 0 ? 'links' : 'rechts';
    woerter.push(Math.abs(delta) >= ABBIEGEN_GRAD ? seite : `${seite} halten`);
  }
  return woerter;
}

/**
 * Abbiegen genau an der Grenze zweier ebener Etappen (vom Querbahnsteig auf
 * den Zielbahnsteig) - wieder nur an einem Abzweig.
 */
export function abbiegenAnGrenze(
  pfad: RoutenPfad,
  graph: StationGraph | undefined,
  segmente: Segment[],
  vorher: Etappe,
  danach: Etappe,
): Seite | undefined {
  if (vorher.typ !== 'eben' || danach.typ !== 'eben') return undefined;
  const a = segmente[vorher.segmente[vorher.segmente.length - 1]];
  const b = segmente[danach.segmente[0]];
  if (a.peilungEnde === null || b.peilungStart === null) return undefined;
  const delta = winkelDelta(a.peilungEnde, b.peilungStart);
  if (Math.abs(delta) < ABBIEGEN_GRAD) return undefined;
  const m = kumuliert(pfad);
  const grenze = danach.knotenVon;
  let entscheidung = false;
  for (let i = grenze; i >= vorher.knotenVon && m[grenze] - m[i] <= ABZWEIG_SUCHE_M && !entscheidung; i--) {
    entscheidung = istEntscheidungspunkt(pfad, graph, i);
  }
  for (let i = grenze + 1; i < danach.knotenBis && m[i] - m[grenze] <= ABZWEIG_SUCHE_M && !entscheidung; i++) {
    entscheidung = istEntscheidungspunkt(pfad, graph, i);
  }
  return entscheidung ? (delta > 0 ? 'links' : 'rechts') : undefined;
}

/**
 * Wohin es nach einem Ebenenwechsel geht: „unten links“. Nur, wenn am Fuss
 * bzw. oben ein anderer Weg abzweigt - sonst gibt es nichts zu entscheiden.
 */
export function seiteNachWechsel(
  pfad: RoutenPfad,
  graph: StationGraph | undefined,
  segmente: Segment[],
  wechsel: Etappe,
  danach: Etappe | undefined,
): Seite | undefined {
  if (!danach || danach.typ !== 'eben') return undefined;
  const w = segmente[wechsel.segmente[wechsel.segmente.length - 1]];
  const d = segmente[danach.segmente[0]];
  if (w.peilungEnde === null || d.peilungStart === null) return undefined;
  if (!istEntscheidungspunkt(pfad, graph, wechsel.knotenBis)) return undefined;
  const delta = winkelDelta(w.peilungEnde, d.peilungStart);
  return Math.abs(delta) >= ABBIEGEN_GRAD ? (delta > 0 ? 'links' : 'rechts') : undefined;
}

/** Ein Name, der im Bahnhof genau einmal als Laden vorkommt (Konzept 09, 4.3, Bedingung 3). */
function eindeutigeLaeden(graph: StationGraph): Map<string, number> {
  const zahl = new Map<string, number>();
  for (const b of graph.bezugspunkte ?? []) {
    if (b.art !== 'laden' || !b.name) continue;
    const schluessel = b.name.toLocaleLowerCase('de');
    zahl.set(schluessel, (zahl.get(schluessel) ?? 0) + 1);
  }
  return zahl;
}

/**
 * Ein Laden am Weg - nur mit allen vier Bedingungen aus Konzept 09, 4.3:
 * Name, hoechstens 10 m und dieselbe Ebene, eindeutig im Bahnhof, kein
 * staerkerer Bezugspunkt (das prueft der Aufrufer).
 */
export function ladenAmWeg(pfad: RoutenPfad, graph: StationGraph | undefined, etappe: Etappe): string | undefined {
  if (!graph?.bezugspunkte?.length || etappe.typ !== 'eben') return undefined;
  const zahl = eindeutigeLaeden(graph);
  for (let i = etappe.knotenVon; i <= etappe.knotenBis; i++) {
    const k = pfad.knoten[i];
    for (const b of graph.bezugspunkte) {
      if (b.art !== 'laden' || !b.name || b.level !== k.level) continue;
      if (zahl.get(b.name.toLocaleLowerCase('de')) !== 1) continue;
      if (haversineM(k.lat, k.lon, b.lat, b.lon) <= LADEN_MAX_M) return b.name;
    }
  }
  return undefined;
}

/**
 * Taugt der Name eines Ausgangs als Bezugspunkt? Nicht, wenn er den Bahnhof
 * selbst nennt („Hauptbahnhof“) oder mehrere Dinge auf einmal
 * („Bahnhofshalle;Reisezentrum“, Leipzig Hbf).
 */
function ausgangsNameTaugt(name: string): boolean {
  return !name.includes(';') && !/bahnhof|hbf/i.test(name) && name.length <= 30;
}

/** Ein benannter Ausgang am Weg der Etappe. */
export function ausgangAmWeg(pfad: RoutenPfad, graph: StationGraph | undefined, etappe: Etappe): string | undefined {
  if (!graph?.bezugspunkte?.length || etappe.typ !== 'eben') return undefined;
  for (let i = etappe.knotenVon; i <= etappe.knotenBis; i++) {
    const k = pfad.knoten[i];
    for (const b of graph.bezugspunkte) {
      if (b.art !== 'ausgang' || !b.name || b.level !== k.level || !ausgangsNameTaugt(b.name)) continue;
      if (b.knotenId === k.id || haversineM(k.lat, k.lon, b.lat, b.lon) <= AUSGANG_MAX_M) return b.name;
    }
  }
  return undefined;
}

export interface BahnsteigRichtung {
  /** „in Fahrtrichtung“, „entgegen der Fahrtrichtung“, „nach rechts“, „nach links“. */
  wort: string;
  /** Der Weg erreicht dabei ein Ende des Bahnsteigs (Kopfbahnhof, Querbahnsteig). */
  amEnde: boolean;
}

/**
 * Wohin es am Ankunftsbahnsteig geht (Julian, 06.11.2026): Himmelsrichtungen
 * kennt niemand. Zuerst die Fahrtrichtung des Zugs - die hat man eben noch
 * gespuert (`enden`, aus der Zugspitze des Schemas). Sonst rechts oder links,
 * mit dem Zug im Ruecken (`gleisseite.ts`). Sonst nichts: Dann nennt der Satz
 * grobe Meter, aber keine Richtung, die er nicht kennt.
 *
 * Nur fuer den Ausstieg (`ausstieg`): Auf einem anderen Bahnsteig hat niemand
 * einen Zug im Ruecken.
 */
export function richtungAmBahnsteig(
  pfad: RoutenPfad,
  graph: StationGraph | undefined,
  etappe: Etappe,
  enden: Map<string, { anfang: string; ende: string }> | undefined,
  ausstieg = true,
): BahnsteigRichtung | undefined {
  if (!graph) return undefined;
  let bahnsteigId: string | undefined;
  for (let i = etappe.knotenVon; i <= etappe.knotenBis && !bahnsteigId; i++) bahnsteigId = pfad.knoten[i].bahnsteigId;
  if (!bahnsteigId) return undefined;
  let anfang: GraphKnoten | undefined;
  let ende: GraphKnoten | undefined;
  for (const k of graph.knoten.values()) {
    if (k.bahnsteigId !== bahnsteigId) continue;
    if (k.abschnitt === 'anfang') anfang ??= k;
    if (k.abschnitt === 'ende') ende ??= k;
  }
  if (!anfang || !ende) return undefined;
  const laenge = haversineM(anfang.lat, anfang.lon, ende.lat, ende.lon);
  if (laenge < 1) return undefined;
  const mLat = 111_320;
  const mLon = mLat * Math.cos((anfang.lat * Math.PI) / 180);
  const ax = (ende.lon - anfang.lon) * mLon;
  const ay = (ende.lat - anfang.lat) * mLat;
  const t = (k: GraphKnoten): number => (((k.lon - anfang!.lon) * mLon) * ax + ((k.lat - anfang!.lat) * mLat) * ay) / laenge;
  // Massgeblich ist die weiteste Auslenkung entlang der Achse, nicht das Ende
  // der Etappe: Am Kopfbahnhof geht es erst zum Querbahnsteig und dann auf
  // einem anderen Bahnsteig zurueck - die Richtung ist die zum Kopf.
  const von = t(pfad.knoten[etappe.knotenVon]);
  let bis = von;
  for (let i = etappe.knotenVon + 1; i <= etappe.knotenBis; i++) {
    const hier = t(pfad.knoten[i]);
    if (Math.abs(hier - von) > Math.abs(bis - von)) bis = hier;
  }
  if (Math.abs(bis - von) < RICHTUNG_MIN_M) return undefined;
  const amEnde = bis < laenge * 0.12 || bis > laenge * 0.88;
  if (!ausstieg) return undefined;
  const zumEnde = bis > von;
  const namen = enden?.get(bahnsteigId);
  if (namen) return { wort: zumEnde ? namen.ende : namen.anfang, amEnde };
  const start = pfad.knoten[etappe.knotenVon];
  const seite = start?.gleis ? graph.gleisSeiten?.get(gleisSchluessel(bahnsteigId, start.gleis)) : undefined;
  if (seite) return { wort: `nach ${aussteigeSeite(seite.seite, zumEnde)}`, amEnde };
  return undefined;
}
