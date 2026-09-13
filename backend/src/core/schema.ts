import { haversineM } from './graph.js';
import type {
  BahnhofSchema,
  GraphKnoten,
  KantenTyp,
  RoutenPfad,
  SchemaAnlage,
  SchemaBahnsteig,
  SchemaEbene,
  SchemaPoi,
  SchemaElement,
  SchemaPunkt,
  SchemaWechsel,
  SchemaWegstueck,
  SchemaZugang,
  StationGraph,
} from './typen.js';

/**
 * Das Bahnhofsbild zu einer Route.
 *
 * Warum nicht aus den Schritttexten, wie es das Frontend bisher tut: Aus
 * „Rolltreppe hinunter zur Ebene 0" lässt sich die Abfolge der Ebenen lesen,
 * aber kein Bahnhof. Wie viele Bahnsteige eine Ebene trägt, in welcher
 * Reihenfolge sie liegen, wie lang sie sind, WO man sie verlässt und welche
 * Form der Weg dort hat – all das steht im Graphen.
 *
 * Und es ist mehr, als ein Stapel Bänder braucht: Ein Ebenenwechsel liegt an
 * einer bestimmten Stelle des Bahnsteigs, nicht irgendwo, und wer auf einem
 * 430-m-Bahnsteig steht, will wissen, ob der Abgang 30 m oder 330 m entfernt
 * ist. Deshalb trägt jede Ebene ihre eigene Geometrie in Metern.
 *
 * Was hier NICHT passiert: raten. Fehlt eine Bahnsteigachse, bleiben Länge,
 * Lage und Zugänge leer und ein Vorbehalt sagt warum. Das Bild darf grob
 * sein, es darf nicht falsch sein.
 */

/** Nur ein Bahnsteig in der Nähe zählt als „liegt an Gleis X". */
const ANLAGE_MAX_M = 60;

/** Quer zur Bahnsteigachse: weiter weg heisst, die Anlage gehört nicht dazu. */
const ZUGANG_QUER_MAX_M = 30;

/** Zwei Anlagen näher als das sind derselbe Zugang, kein zweiter. */
const ZUGANG_BUENDEL_M = 25;


/**
 * Wie weit um die Route herum die Ebene gezeigt wird.
 *
 * Weiter waere nicht hilfreicher: Was 100 m abseits liegt, sieht der
 * Reisende nicht, und es macht das Bild nur voll. 80 m um den Weg ergeben in
 * Berlin rund 90 Kanten je Uebergangsebene - genug fuer den Ring auf Ebene 1,
 * wenig genug fuer ein Telefon.
 */
const NETZ_RADIUS_M = 80;

/** Anlagen weiter weg als das sieht man vom Weg aus nicht mehr. */
const ELEMENT_RADIUS_M = 50;

/** Obergrenzen, damit ein grosser Bahnhof die Antwort nicht sprengt. */
const NETZ_MAX_STUECKE = 120;
const ELEMENT_MAX_ABSEITS = 20;

/**
 * Wie weit ein Punkt von der Geraden seiner Nachbarn abweichen muss, um
 * gezeichnet zu werden.
 *
 * OSM-Linienzuege tragen Messrauschen: Punkte, die eine Gerade in drei
 * Stuecke zerlegen, ohne die Form zu aendern. Auf einem Telefonbildschirm
 * werden daraus ausgefranste Kanten. 1,5 m ist kleiner als jede Ecke, an der
 * jemand abbiegt, und groesser als das Rauschen.
 */
const GLAETTUNG_M = 1.5;

const BOGEN = Math.PI / 180;
const M_LAT = 111_320;

interface Bahnsteigrohbau {
  bahnsteigId: string;
  level: number;
  gleise: string[];
  anfang?: GraphKnoten;
  ende?: GraphKnoten;
  mitte: GraphKnoten;
}

/** Peilung a→b in Grad (0 = Nord, im Uhrzeigersinn). */
function peilungGrad(a: GraphKnoten, b: GraphKnoten): number {
  const dLon = (b.lon - a.lon) * BOGEN;
  const y = Math.sin(dLon) * Math.cos(b.lat * BOGEN);
  const x =
    Math.cos(a.lat * BOGEN) * Math.sin(b.lat * BOGEN) -
    Math.sin(a.lat * BOGEN) * Math.cos(b.lat * BOGEN) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Mittel mehrerer Achsrichtungen.
 *
 * Über die Winkel zu mitteln wäre falsch: Ein Bahnsteig ist richtungslos,
 * 170° und 10° sind fast dieselbe Achse, ihr arithmetisches Mittel (90°)
 * steht senkrecht darauf. Deshalb über die verdoppelten Winkel mitteln und
 * das Ergebnis halbieren – das übliche Verfahren für Achsen ohne Vorzeichen.
 */
function mittlereAchse(grade: number[]): number {
  let x = 0;
  let y = 0;
  for (const g of grade) {
    x += Math.cos(2 * g * BOGEN);
    y += Math.sin(2 * g * BOGEN);
  }
  return (Math.atan2(y, x) / 2 / BOGEN + 360) % 180;
}

/**
 * Der Bezugsrahmen: Ursprung und Drehung für alle Meterangaben.
 *
 * Ursprung ist der Startpunkt der Route – der Ort, an dem der Reisende
 * steht, ist der einzige, zu dem jede Entfernung für ihn eine Bedeutung hat.
 * Gedreht wird auf die Gleisrichtung der Startebene, damit der
 * Ankunftsbahnsteig waagerecht liegt und alles andere in seiner echten Lage
 * dazu – auch eine Ebene, die quer dazu steht.
 */
function macheRahmen(
  ursprung: GraphKnoten | undefined,
  richtungGrad: number,
): (k: { lat: number; lon: number }) => SchemaPunkt {
  if (!ursprung) return () => ({ x: 0, y: 0 });
  const mLon = M_LAT * Math.cos(ursprung.lat * BOGEN);
  const sin = Math.sin(richtungGrad * BOGEN);
  const cos = Math.cos(richtungGrad * BOGEN);
  return (k) => {
    const ost = (k.lon - ursprung.lon) * mLon;
    const nord = (k.lat - ursprung.lat) * M_LAT;
    return {
      x: Math.round(ost * sin + nord * cos),
      y: Math.round(ost * cos - nord * sin),
    };
  };
}

/** Bahnsteigpunkte des Graphen zu Bahnsteigen zusammenfassen. */
function sammleBahnsteige(graph: StationGraph): Bahnsteigrohbau[] {
  const nachId = new Map<string, Bahnsteigrohbau>();
  for (const knoten of graph.knoten.values()) {
    if (!knoten.gleis || !knoten.bahnsteigId) continue;
    let eintrag = nachId.get(knoten.bahnsteigId);
    if (!eintrag) {
      eintrag = {
        bahnsteigId: knoten.bahnsteigId,
        level: knoten.level,
        gleise: [],
        mitte: knoten,
      };
      nachId.set(knoten.bahnsteigId, eintrag);
    }
    if (!eintrag.gleise.includes(knoten.gleis)) eintrag.gleise.push(knoten.gleis);
    if (knoten.abschnitt === 'anfang') eintrag.anfang = knoten;
    if (knoten.abschnitt === 'ende') eintrag.ende = knoten;
    if (knoten.abschnitt === 'mitte') eintrag.mitte = knoten;
  }
  for (const eintrag of nachId.values()) {
    eintrag.gleise.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  }
  return [...nachId.values()];
}

/** Lage eines Punktes auf der Bahnsteigachse: Meter entlang, Meter quer. */
function aufAchse(
  bahnsteig: Bahnsteigrohbau,
  knoten: { lat: number; lon: number },
): { laengsM: number; querM: number; laengeM: number } | null {
  const { anfang, ende } = bahnsteig;
  if (!anfang || !ende) return null;
  const mLon = M_LAT * Math.cos(anfang.lat * BOGEN);
  const bx = (ende.lon - anfang.lon) * mLon;
  const by = (ende.lat - anfang.lat) * M_LAT;
  const px = (knoten.lon - anfang.lon) * mLon;
  const py = (knoten.lat - anfang.lat) * M_LAT;
  const laenge2 = bx * bx + by * by;
  if (laenge2 === 0) return null;
  const t = (px * bx + py * by) / laenge2;
  const laengeM = Math.sqrt(laenge2);
  return {
    laengsM: t * laengeM,
    querM: Math.hypot(px - t * bx, py - t * by),
    laengeM,
  };
}

/**
 * Die Bahnsteige einer Ebene in ihre tatsächliche Reihenfolge bringen.
 *
 * Nicht nach Gleisnummer: Am Berliner Tiefbahnsteig liegt Gleis 22 neben
 * 7/8, nicht hinter 1/2. Eine Sortierung nach Nummer zeichnete den Bahnhof
 * falsch herum.
 */
function ordneQuer(bahnsteige: Bahnsteigrohbau[]): {
  reihenfolge: Bahnsteigrohbau[];
  querM: Map<string, number>;
  richtungGrad?: number;
} {
  const mitAchse = bahnsteige.filter((b) => b.anfang && b.ende);
  if (mitAchse.length === 0) return { reihenfolge: bahnsteige, querM: new Map() };

  const richtung = mittlereAchse(mitAchse.map((b) => peilungGrad(b.anfang!, b.ende!)));
  const quer = (richtung + 90) * BOGEN;
  const qx = Math.sin(quer);
  const qy = Math.cos(quer);
  const bezug = mitAchse[0].mitte;
  const mLon = M_LAT * Math.cos(bezug.lat * BOGEN);

  const lagen = new Map<string, number>();
  for (const b of mitAchse) {
    const dx = (b.mitte.lon - bezug.lon) * mLon;
    const dy = (b.mitte.lat - bezug.lat) * M_LAT;
    lagen.set(b.bahnsteigId, dx * qx + dy * qy);
  }

  const sortiert = [...mitAchse].sort(
    (a, b) => lagen.get(a.bahnsteigId)! - lagen.get(b.bahnsteigId)!,
  );
  const kleinster = lagen.get(sortiert[0].bahnsteigId)!;
  const querM = new Map<string, number>();
  for (const [id, lage] of lagen) querM.set(id, lage - kleinster);

  // Bahnsteige ohne Achse hinten anhängen – sie haben keine Lage, aber es
  // gibt sie, und sie stillschweigend fallen zu lassen wäre der schlechtere
  // Fehler.
  const ohneAchse = bahnsteige.filter((b) => !b.anfang || !b.ende);
  return { reihenfolge: [...sortiert, ...ohneAchse], querM, richtungGrad: richtung };
}

/** Ebenenwechsel des Wegs, in der Reihenfolge des Wegs. */
function sammleWechsel(pfad: RoutenPfad): SchemaWechsel[] {
  const wechsel: SchemaWechsel[] = [];
  for (let i = 0; i < pfad.kanten.length; i++) {
    const kante = pfad.kanten[i];
    if (kante.deltaLevel === 0) continue;
    const von = pfad.knoten[i];
    const nach = pfad.knoten[i + 1];
    if (!von || !nach) continue;
    wechsel.push({ vonLevel: von.level, nachLevel: nach.level, typ: kante.typ });
  }
  return wechsel;
}

/**
 * Die Besuche der Route, in ihrer Reihenfolge.
 *
 * Ein Besuch ist ein zusammenhaengendes Stueck Weg auf einer Ebene. Wer
 * hinunter in die Unterfuehrung geht und wieder herauf, besucht die
 * Gleisebene zweimal - und zwischen den beiden Besuchen liegt kein Weg,
 * sondern eine Treppe. Sie in eine Liste je Ebene zu werfen erzeugte eine
 * erfundene Strecke; in einer Stichprobe ueber 16 Bahnhoefe wuchs der Weg
 * dadurch um die Haelfte.
 */
function besucheDerRoute(
  pfad: RoutenPfad,
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): { level: number; weg: SchemaPunkt[] }[] {
  const besuche: { level: number; weg: SchemaPunkt[] }[] = [];
  let aktuell: { level: number; weg: SchemaPunkt[] } | null = null;

  const schliesse = (): void => {
    if (aktuell && aktuell.weg.length >= 2) {
      besuche.push({ level: aktuell.level, weg: vereinfacheLinie(aktuell.weg, GLAETTUNG_M) });
    } else if (aktuell) {
      // Ein Besuch ohne Weg ist trotzdem ein Besuch - er traegt nur keine
      // Linie. Ohne ihn fehlte im Bild ein Band, das der Reisende betritt.
      besuche.push({ level: aktuell.level, weg: aktuell.weg });
    }
    aktuell = null;
  };

  for (const knoten of pfad.knoten) {
    if (!aktuell || aktuell.level !== knoten.level) {
      schliesse();
      aktuell = { level: knoten.level, weg: [] };
    }
    const punkt = zuXY(knoten);
    const letzter = aktuell.weg[aktuell.weg.length - 1];
    if (!letzter || letzter.x !== punkt.x || letzter.y !== punkt.y) aktuell.weg.push(punkt);
  }
  schliesse();
  return besuche;
}


/** Die Ebenenwechsel-Kanten des Graphen, jede genau einmal. */
function* ebenenwechselKanten(
  graph: StationGraph,
): Generator<{ typ: KantenTyp; von: GraphKnoten; nach: GraphKnoten; schluessel: string }> {
  const gesehen = new Set<string>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) {
      if (kante.deltaLevel === 0) continue;
      const schluessel = `${kante.von}|${kante.nach}`;
      if (gesehen.has(schluessel) || gesehen.has(`${kante.nach}|${kante.von}`)) continue;
      gesehen.add(schluessel);
      const von = graph.knoten.get(kante.von);
      const nach = graph.knoten.get(kante.nach);
      if (von && nach) yield { typ: kante.typ, von, nach, schluessel };
    }
  }
}

/**
 * Der Bahnsteig, an dem ein Knoten liegt – oder keiner.
 *
 * Bei einem 430-m-Bahnsteig sagt die Entfernung zur MITTE wenig; der halbe
 * Bahnsteig zaehlt deshalb als Spielraum mit.
 */
function bahnsteigBei(
  knoten: GraphKnoten,
  bahnsteige: Bahnsteigrohbau[],
): Bahnsteigrohbau | undefined {
  let beste: Bahnsteigrohbau | undefined;
  let besteDist = ANLAGE_MAX_M;
  for (const b of bahnsteige) {
    if (b.level !== knoten.level) continue;
    const d = haversineM(knoten.lat, knoten.lon, b.mitte.lat, b.mitte.lon);
    const spielraum =
      b.anfang && b.ende ? haversineM(b.anfang.lat, b.anfang.lon, b.ende.lat, b.ende.lon) / 2 : 0;
    if (d - spielraum < besteDist) {
      besteDist = d - spielraum;
      beste = b;
    }
  }
  return beste;
}

/**
 * Wo man einen Bahnsteig verlassen kann.
 *
 * Anlagen bilden Gruppen: An Berlins Gleis 5/6 stehen 27 Stück, aber an nur
 * sechs Stellen. Einzeln gezeichnet wären sie ein Strichmuster; als
 * Zugangsstellen beantworten sie die Frage, die auf dem Bahnsteig zählt –
 * „wie weit bis zum nächsten Abgang?".
 */
function zugaengeFuer(
  bahnsteig: Bahnsteigrohbau,
  graph: StationGraph,
  aufRoute: Set<string>,
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): SchemaZugang[] | undefined {
  if (!bahnsteig.anfang || !bahnsteig.ende) return undefined;

  interface Treffer {
    typ: string;
    laengsM: number;
    knoten: GraphKnoten;
    aufRoute: boolean;
  }
  const treffer: Treffer[] = [];

  for (const kante of ebenenwechselKanten(graph)) {
    for (const ende of [kante.von, kante.nach]) {
      if (ende.level !== bahnsteig.level) continue;
      const lage = aufAchse(bahnsteig, ende);
      if (!lage) continue;
      if (lage.querM > ZUGANG_QUER_MAX_M) continue;
      if (lage.laengsM < -5 || lage.laengsM > lage.laengeM + 5) continue;
      treffer.push({
        typ: kante.typ,
        laengsM: lage.laengsM,
        knoten: ende,
        aufRoute: aufRoute.has(kante.schluessel) || aufRoute.has(`${kante.nach.id}|${kante.von.id}`),
      });
      break;
    }
  }
  if (treffer.length === 0) return [];

  treffer.sort((a, b) => a.laengsM - b.laengsM);

  const zugaenge: SchemaZugang[] = [];
  let gruppe: Treffer[] = [treffer[0]];
  const schliesse = (): void => {
    const zahl = { aufzug: 0, rolltreppe: 0, treppe: 0 };
    for (const t of gruppe) {
      if (t.typ === 'aufzug' || t.typ === 'rolltreppe' || t.typ === 'treppe') zahl[t.typ]++;
    }
    const mittelLaengs = gruppe.reduce((s, t) => s + t.laengsM, 0) / gruppe.length;
    const punkte = gruppe.map((t) => zuXY(t.knoten));
    zugaenge.push({
      beiM: Math.round(mittelLaengs),
      pos: {
        x: Math.round(punkte.reduce((s, p) => s + p.x, 0) / punkte.length),
        y: Math.round(punkte.reduce((s, p) => s + p.y, 0) / punkte.length),
      },
      ...zahl,
      aufRoute: gruppe.some((t) => t.aufRoute),
    });
  };
  for (let i = 1; i < treffer.length; i++) {
    if (treffer[i].laengsM - gruppe[0].laengsM <= ZUGANG_BUENDEL_M) {
      gruppe.push(treffer[i]);
    } else {
      schliesse();
      gruppe = [treffer[i]];
    }
  }
  schliesse();
  return zugaenge;
}

/** Die Anlagen, die die Route nutzt – in der Reihenfolge des Wegs. */
function anlagenDerRoute(
  pfad: RoutenPfad,
  bahnsteige: Bahnsteigrohbau[],
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): SchemaAnlage[] {
  const anlagen: SchemaAnlage[] = [];
  for (let i = 0; i < pfad.kanten.length; i++) {
    const kante = pfad.kanten[i];
    if (kante.deltaLevel === 0) continue;
    const von = pfad.knoten[i];
    const nach = pfad.knoten[i + 1];
    if (!von || !nach) continue;
    const bahnsteig = bahnsteigBei(von, bahnsteige) ?? bahnsteigBei(nach, bahnsteige);
    const lage = bahnsteig ? aufAchse(bahnsteig, von) : null;
    anlagen.push({
      typ: kante.typ,
      vonLevel: von.level,
      nachLevel: nach.level,
      ...(bahnsteig ? { beiGleisen: bahnsteig.gleise } : {}),
      pos: zuXY(von),
      ...(lage ? { beiM: Math.round(lage.laengsM) } : {}),
    });
  }
  return anlagen;
}

/**
 * Wie viele Aufzüge, Rolltreppen und Treppen liegen an welchem Bahnsteig?
 *
 * Die Zahl trägt auch dort, wo die Lage fehlt – und sie ist die Auskunft für
 * die Bahnsteige, die nicht Start oder Ziel sind.
 */
function zaehleAnlagen(
  graph: StationGraph,
  bahnsteige: Bahnsteigrohbau[],
): Map<string, { aufzug: number; rolltreppe: number; treppe: number }> {
  const zahlen = new Map<string, { aufzug: number; rolltreppe: number; treppe: number }>();
  for (const kante of ebenenwechselKanten(graph)) {
    if (kante.typ !== 'aufzug' && kante.typ !== 'rolltreppe' && kante.typ !== 'treppe') continue;
    // Eine Anlage verbindet zwei Ebenen und gehört damit an beide Enden.
    for (const ende of [kante.von, kante.nach]) {
      const bahnsteig = bahnsteigBei(ende, bahnsteige);
      if (!bahnsteig) continue;
      let eintrag = zahlen.get(bahnsteig.bahnsteigId);
      if (!eintrag) {
        eintrag = { aufzug: 0, rolltreppe: 0, treppe: 0 };
        zahlen.set(bahnsteig.bahnsteigId, eintrag);
      }
      eintrag[kante.typ]++;
    }
  }
  return zahlen;
}

function sammlePois(graph: StationGraph, bahnsteige: Bahnsteigrohbau[]): SchemaPoi[] {
  const pois: SchemaPoi[] = [];
  for (const knoten of graph.knoten.values()) {
    if (!knoten.poi) continue;
    let beiGleisen: string[] | undefined;
    let besteDist = ANLAGE_MAX_M;
    for (const b of bahnsteige) {
      if (b.level !== knoten.level) continue;
      const d = haversineM(knoten.lat, knoten.lon, b.mitte.lat, b.mitte.lon);
      if (d < besteDist) {
        besteDist = d;
        beiGleisen = b.gleise;
      }
    }
    pois.push({ art: knoten.poi, level: knoten.level, ...(beiGleisen ? { beiGleisen } : {}) });
  }
  return pois;
}

/** Abstand eines Punktes zur Geraden durch a und b. */
function abstandZurGeraden(p: SchemaPunkt, a: SchemaPunkt, b: SchemaPunkt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy);
  if (laenge === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / laenge;
}

/**
 * Einen Linienzug auf seine Form reduzieren (Douglas-Peucker).
 *
 * Anfang und Ende bleiben immer stehen; dazwischen ueberlebt nur, was weiter
 * als `toleranzM` von der Sehne abweicht. Das ist keine Schoenung: Die
 * entfernten Punkte lagen innerhalb der Toleranz auf der Linie, die sie
 * ersetzt - die Form bleibt, das Rauschen geht.
 */
export function vereinfacheLinie(punkte: SchemaPunkt[], toleranzM: number): SchemaPunkt[] {
  if (punkte.length <= 2) return punkte;
  const erster = punkte[0];
  const letzter = punkte[punkte.length - 1];

  let weiteste = 0;
  let abstand = -1;
  for (let i = 1; i < punkte.length - 1; i++) {
    const d = abstandZurGeraden(punkte[i], erster, letzter);
    if (d > abstand) {
      abstand = d;
      weiteste = i;
    }
  }
  if (abstand <= toleranzM) return [erster, letzter];

  const links = vereinfacheLinie(punkte.slice(0, weiteste + 1), toleranzM);
  const rechts = vereinfacheLinie(punkte.slice(weiteste), toleranzM);
  return [...links.slice(0, -1), ...rechts];
}

/** Abstand eines Punktes zum naechsten Punkt eines Linienzugs, in Metern. */
function abstandZumWeg(p: SchemaPunkt, weg: SchemaPunkt[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const w of weg) {
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Das begehbare Netz einer Ebene in Routennaehe, zu Linienzuegen verschmolzen.
 *
 * Kante fuer Kante waere es eine Wolke aus Strichen. Zusammengefasst werden
 * daraus Gaenge und Ringe - und genau die sind es, an denen sich jemand
 * ausrichtet.
 */
function netzFuer(
  graph: StationGraph,
  level: number,
  weg: SchemaPunkt[],
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): SchemaWegstueck[] {
  if (weg.length === 0) return [];

  const nah = new Map<string, SchemaPunkt>();
  for (const knoten of graph.knoten.values()) {
    if (knoten.level !== level) continue;
    const p = zuXY(knoten);
    if (abstandZumWeg(p, weg) <= NETZ_RADIUS_M) nah.set(knoten.id, p);
  }

  const nachbarn = new Map<string, Set<string>>();
  for (const id of nah.keys()) nachbarn.set(id, new Set());
  for (const [id, liste] of graph.adjazenz) {
    if (!nah.has(id)) continue;
    for (const kante of liste) {
      if (kante.deltaLevel !== 0) continue;
      const anderer = kante.von === id ? kante.nach : kante.von;
      if (!nah.has(anderer) || anderer === id) continue;
      nachbarn.get(id)!.add(anderer);
      nachbarn.get(anderer)!.add(id);
    }
  }

  const benutzt = new Set<string>();
  const schluessel = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a);
  const stuecke: SchemaWegstueck[] = [];

  /** Von einem Knoten aus einer Kette folgen, bis sie sich gabelt oder endet. */
  const laufe = (start: string, erster: string): void => {
    const punkte = [nah.get(start)!];
    let vorher = start;
    let jetzt = erster;
    for (;;) {
      benutzt.add(schluessel(vorher, jetzt));
      punkte.push(nah.get(jetzt)!);
      const weiter = [...nachbarn.get(jetzt)!].filter(
        (n) => n !== vorher && !benutzt.has(schluessel(jetzt, n)),
      );
      // Nur eine Fortsetzung heisst: derselbe Gang. Mehrere heissen Kreuzung.
      if (nachbarn.get(jetzt)!.size !== 2 || weiter.length !== 1) break;
      vorher = jetzt;
      jetzt = weiter[0];
    }
    if (punkte.length > 1) stuecke.push({ punkte: vereinfacheLinie(punkte, GLAETTUNG_M) });
  };

  // Erst von jeder Kreuzung und jedem Ende aus, dann die reinen Ringe -
  // ein Ring hat keinen Knoten mit Grad ungleich zwei und bliebe sonst liegen.
  for (const durchgang of [0, 1]) {
    for (const [id, nb] of nachbarn) {
      if (durchgang === 0 && nb.size === 2) continue;
      for (const n of nb) {
        if (benutzt.has(schluessel(id, n))) continue;
        laufe(id, n);
        if (stuecke.length >= NETZ_MAX_STUECKE) return stuecke;
      }
    }
  }
  return stuecke;
}

/**
 * Die Ebenenwechsel, die auf dieser Ebene sichtbar sind.
 *
 * Eine Rolltreppe ist im Grundriss eine Strecke, ein Aufzug ein Punkt - das
 * ist keine Gestaltung, sondern ihre Form. Beides kommt aus denselben
 * Koordinaten wie alles andere.
 */
function elementeFuer(
  graph: StationGraph,
  level: number,
  weg: SchemaPunkt[],
  bahnsteige: Bahnsteigrohbau[],
  wichtigeBahnsteige: Set<string>,
  aufRoute: Set<string>,
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): SchemaElement[] {
  const amBahnsteig: SchemaElement[] = [];
  const abseits: { element: SchemaElement; abstand: number }[] = [];

  for (const kante of ebenenwechselKanten(graph)) {
    const aufEbene = [kante.von, kante.nach].find((k) => k.level === level);
    if (!aufEbene) continue;

    const a = zuXY(kante.von);
    const b = zuXY(kante.nach);
    // Ein Aufzug ist derselbe Ort auf beiden Ebenen - ein Punkt. Eine Treppe
    // laeuft waagerecht mit, also eine Strecke.
    const punkte = a.x === b.x && a.y === b.y ? [a] : [a, b];

    // Liegt die Anlage an einem Bahnsteig dieser Ebene, gehoert ihre Lage
    // entlang des Bahnsteigs dazu - das ist die Angabe, die dort zaehlt.
    // Nur am Ankunfts- und Abfahrtsbahnsteig zaehlt die Stelle. An den
    // Nachbarbahnsteigen ist jede Anlage nur Gewirr - dort genuegt die Zahl.
    let beiM: number | undefined;
    for (const bahnsteig of bahnsteige) {
      if (bahnsteig.level !== level) continue;
      if (!wichtigeBahnsteige.has(bahnsteig.bahnsteigId)) continue;
      const lage = aufAchse(bahnsteig, aufEbene);
      if (!lage || lage.querM > ZUGANG_QUER_MAX_M) continue;
      if (lage.laengsM < -5 || lage.laengsM > lage.laengeM + 5) continue;
      beiM = Math.round(lage.laengsM);
      break;
    }

    const element: SchemaElement = {
      typ: kante.typ,
      punkte,
      aufRoute: aufRoute.has(kante.schluessel) || aufRoute.has(`${kante.nach.id}|${kante.von.id}`),
      ...(beiM !== undefined ? { beiM } : {}),
    };

    // Am eigenen Bahnsteig zaehlt JEDE Anlage, auch die am fernen Ende: "wo
    // ist der naechste Aufgang" ist dort die Frage. Sonst nur, was in
    // Sichtweite des Wegs liegt.
    if (beiM !== undefined) {
      amBahnsteig.push(element);
      continue;
    }
    const abstand = abstandZumWeg(zuXY(aufEbene), weg);
    if (abstand > ELEMENT_RADIUS_M) continue;
    abseits.push({ abstand, element });
  }

  amBahnsteig.sort((a, b) => (a.beiM ?? 0) - (b.beiM ?? 0));
  abseits.sort((x, y) => x.abstand - y.abstand);
  return [...amBahnsteig, ...abseits.slice(0, ELEMENT_MAX_ABSEITS).map((g) => g.element)];
}

export function baueBahnhofSchema(graph: StationGraph, pfad: RoutenPfad): BahnhofSchema {
  const bahnsteige = sammleBahnsteige(graph);
  const anlagenZahlen = zaehleAnlagen(graph, bahnsteige);
  const start = pfad.knoten[0];
  const ziel = pfad.knoten[pfad.knoten.length - 1];

  const proLevel = new Map<number, Bahnsteigrohbau[]>();
  for (const b of bahnsteige) {
    if (!proLevel.has(b.level)) proLevel.set(b.level, []);
    proLevel.get(b.level)!.push(b);
  }

  // Der Rahmen richtet sich nach der Ebene, auf der der Reisende ankommt.
  const startLevel = start?.level;
  const startOrdnung =
    startLevel !== undefined ? ordneQuer(proLevel.get(startLevel) ?? []) : undefined;
  const rahmenRichtung = startOrdnung?.richtungGrad ?? 0;
  const zuXY = macheRahmen(start, rahmenRichtung);

  const aufRoute = new Set<string>();
  for (const kante of pfad.kanten) {
    if (kante.deltaLevel !== 0) aufRoute.add(`${kante.von}|${kante.nach}`);
  }
  const besuche = besucheDerRoute(pfad, zuXY);

  /** Die Bahnsteige einer Ebene, fertig fuer die Antwort. */
  const bahnsteigeVon = (level: number): { liste: SchemaBahnsteig[]; richtungGrad?: number; ohneAchse: number } => {
    const { reihenfolge, querM, richtungGrad } = ordneQuer(proLevel.get(level) ?? []);
    let ohneAchse = 0;
    const liste: SchemaBahnsteig[] = reihenfolge.map((b) => {
      const hatAchse = b.anfang !== undefined && b.ende !== undefined;
      const laengeM = hatAchse
        ? Math.round(haversineM(b.anfang!.lat, b.anfang!.lon, b.ende!.lat, b.ende!.lon))
        : undefined;
      if (laengeM === undefined) ohneAchse++;
      const rolle =
        start?.bahnsteigId === b.bahnsteigId
          ? ('start' as const)
          : ziel?.bahnsteigId === b.bahnsteigId
            ? ('ziel' as const)
            : undefined;
      // Zugänge nur dort, wo der Reisende wirklich steht. An den übrigen
      // Bahnsteigen ist die Stelle ohne Belang und die Antwort bliebe sonst
      // nicht klein.
      const zugaenge = rolle && hatAchse ? zugaengeFuer(b, graph, aufRoute, zuXY) : undefined;
      return {
        bahnsteigId: b.bahnsteigId,
        gleise: b.gleise,
        ...(laengeM !== undefined ? { laengeM } : {}),
        ...(querM.has(b.bahnsteigId) ? { querM: Math.round(querM.get(b.bahnsteigId)!) } : {}),
        ...(rolle ? { rolle } : {}),
        ...(anlagenZahlen.has(b.bahnsteigId) ? { anlagen: anlagenZahlen.get(b.bahnsteigId)! } : {}),
        ...(hatAchse ? { von: zuXY(b.anfang!), bis: zuXY(b.ende!) } : {}),
        ...(zugaenge ? { zugaenge } : {}),
      };
    });
    return { liste, richtungGrad, ohneAchse };
  };

  // Je Ebene nur einmal zaehlen, auch wenn sie mehrfach besucht wird.
  const gezaehlt = new Set<number>();
  let ohneAchse = 0;

  const ebenen: SchemaEbene[] = besuche.map((besuch, i) => {
    const { liste, richtungGrad, ohneAchse: fehlend } = bahnsteigeVon(besuch.level);
    if (!gezaehlt.has(besuch.level)) {
      gezaehlt.add(besuch.level);
      ohneAchse += fehlend;
    }

    const wichtige = new Set(liste.filter((b) => b.rolle !== undefined).map((b) => b.bahnsteigId));
    // Netz und Anlagen gelten je BESUCH: Was beim ersten Mal in Sichtweite
    // lag, muss es beim zweiten nicht sein - der Weg verlaeuft dort anders.
    const elemente = elementeFuer(graph, besuch.level, besuch.weg, bahnsteige, wichtige, aufRoute, zuXY);

    // Wie diese Ebene im Bezugsrahmen liegt: 0 = waagerecht wie die
    // Startebene. Auf −90..+90 gefaltet, weil eine Gleisachse keine Richtung
    // hat und 170° dieselbe Lage ist wie −10°.
    let richtungLokalGrad: number | undefined;
    if (richtungGrad !== undefined) {
      let d = richtungGrad - rahmenRichtung;
      while (d > 90) d -= 180;
      while (d < -90) d += 180;
      richtungLokalGrad = Math.round(d);
    }

    const rolle = i === 0 ? ('start' as const) : i === besuche.length - 1 ? ('ziel' as const) : undefined;

    return {
      level: besuch.level,
      ...(rolle ? { rolle } : {}),
      art: liste.length > 0 ? ('gleise' as const) : ('verbindung' as const),
      ...(richtungGrad !== undefined ? { richtungGrad: Math.round(richtungGrad) } : {}),
      ...(richtungLokalGrad !== undefined ? { richtungLokalGrad } : {}),
      bahnsteige: liste,
      ...(besuch.weg.length > 0 ? { weg: besuch.weg } : {}),
      // Netz nur, wo keine Bahnsteige die Orientierung tragen.
      ...(liste.length === 0 && besuch.weg.length > 0
        ? { netz: netzFuer(graph, besuch.level, besuch.weg, zuXY) }
        : {}),
      ...(elemente.length > 0 ? { elemente } : {}),
    };
  });

  // Kreuzungswinkel nur zwischen den beiden Ebenen, die den Reisenden
  // betreffen – Ankunft und Abfahrt. Ein Winkel zwischen zwei Ebenen, die er
  // nie betritt, ist eine Angabe ohne Anlass.
  let kreuzungswinkelGrad: number | undefined;
  if (start && ziel && start.level !== ziel.level) {
    const a = ebenen.find((e) => e.level === start.level)?.richtungGrad;
    const b = ebenen.find((e) => e.level === ziel.level)?.richtungGrad;
    if (a !== undefined && b !== undefined) {
      const diff = Math.abs(a - b);
      kreuzungswinkelGrad = Math.round(Math.min(diff, 180 - diff));
    }
  }

  const vorbehalte: string[] = [];
  if (graph.stufe === 3) {
    vorbehalte.push(
      'Standardmodell: Lage und Abstände sind geschätzt, nicht aus Kartenmaterial belegt.',
    );
  } else if (ohneAchse > 0) {
    vorbehalte.push(
      ohneAchse === 1
        ? 'Für einen Bahnsteig fehlt die Länge – sein Balken ist geschätzt.'
        : `Für ${ohneAchse} Bahnsteige fehlt die Länge – ihre Balken sind geschätzt.`,
    );
  }
  vorbehalte.push('Bahnsteigabschnitte (A–G) sind in den Quellen nicht verortet.');

  return {
    ebenen,
    anlagen: anlagenDerRoute(pfad, bahnsteige, zuXY),
    pois: sammlePois(graph, bahnsteige),
    wechsel: sammleWechsel(pfad),
    ...(kreuzungswinkelGrad !== undefined ? { kreuzungswinkelGrad } : {}),
    vorbehalte,
  };
}
