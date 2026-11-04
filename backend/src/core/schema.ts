import { haversineM } from './graph.js';
import { lageZurLinie, querLagen, type Punkt } from './mittellinie.js';
import { bestimmeZugspitze, himmelsrichtungen, mittlereAchse, peilungGrad, type Zuglauf } from './richtung.js';
import type {
  BahnhofSchema,
  GraphKante,
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

/**
 * Quer zur Bahnsteigachse: weiter weg heisst, die Anlage gehört nicht dazu.
 * Gemessen wird an der Mittellinie. Ohne sie (Standardmodell) an der Geraden
 * von Ende zu Ende, und im Bogen kommt dann die Bogenhöhe hinzu
 * (`zugangQuerGrenze`): Die Mitte liegt auf dem Bahnsteig, ihr Abstand zur
 * Geraden ist genau diese Höhe. Berlin Hbf 13/14: 23 m.
 */
const ZUGANG_QUER_MAX_M = 30;

/**
 * So viel weiter als vom naechsten Bahnsteig darf eine Anlage von der
 * Mittellinie entfernt sein und gehoert trotzdem dazu.
 *
 * Sie gehoert dem Bahnsteig, dessen Mittellinie sie am naechsten liegt - aber
 * ein Inselbahnsteig ist in OSM oft zwei Flaechen, je Gleis eine: In
 * Saarbruecken teilen sich 5 und 12 sechzehn Umrissknoten, und eine Treppe
 * dort liegt 2,9 m von der einen und 3,0 m von der anderen Linie. Sie dient
 * beiden. Ueber ein Gleis hinweg sind es mehr: Die Abgaenge von 14/16 liegen
 * 2-4 m von deren Linien und 17-19 m von der von 12.
 */
const ZUGANG_GLEICH_NAH_M = 5;

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
  /** Mittellinie aus dem Graphen; fehlt sie, gilt die Sehne `anfang`–`ende`. */
  linie?: Punkt[];
  /** Wo `anfang` und `ende` auf der Linie liegen, in Metern ab ihrem ersten Punkt. */
  linieAnfangM?: number;
  linieEndeM?: number;
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
    const linie = graph.bahnsteigLinien?.get(eintrag.bahnsteigId);
    if (linie && linie.length >= 2 && eintrag.anfang && eintrag.ende) {
      const a = lageZurLinie(linie, eintrag.anfang).laengsM;
      const e = lageZurLinie(linie, eintrag.ende).laengsM;
      if (a !== e) Object.assign(eintrag, { linie, linieAnfangM: a, linieEndeM: e });
    }
  }
  return [...nachId.values()];
}

/**
 * Lage eines Punktes auf der Bahnsteigachse: Meter entlang ab `anfang`, Meter quer.
 *
 * Achse ist die Mittellinie, wo es eine gibt. Die Sehne von Ende zu Ende
 * liegt im Bogen neben dem Bahnsteig - an Saarbruecken Gleis 12 in der Mitte
 * 37 m -, und quer zu ihr gemessen lag der Nachbarbahnsteig naeher als der
 * eigene.
 */
function aufAchse(
  bahnsteig: Bahnsteigrohbau,
  knoten: { lat: number; lon: number },
): { laengsM: number; querM: number; laengeM: number } | null {
  const { anfang, ende, linie, linieAnfangM, linieEndeM } = bahnsteig;
  if (!anfang || !ende) return null;
  if (linie && linieAnfangM !== undefined && linieEndeM !== undefined) {
    // Laengs auf die Sehne umgerechnet: Die Antwort nennt als Laenge die
    // Sehne (`laengeM`), und `beiM` muss auf derselben Strecke liegen - im
    // Bogen ist die Linie laenger (Saarbruecken 12: 565 gegen 561 m).
    const lage = lageZurLinie(linie, knoten);
    const bogen = Math.abs(linieEndeM - linieAnfangM);
    const sehne = haversineM(anfang.lat, anfang.lon, ende.lat, ende.lon);
    const entlang = linieEndeM > linieAnfangM ? lage.laengsM - linieAnfangM : linieAnfangM - lage.laengsM;
    return { laengsM: (entlang * sehne) / bogen, querM: lage.querM, laengeM: sehne };
  }
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
 *
 * Und nicht nach der Mitte allein, wo Mittellinien da sind: In Saarbruecken
 * sind die Bahnsteige gebogen und verschieden lang, und die Mitten auf eine
 * Querachse projiziert ergaben 11, 16, 14, 8, 12, 6, 2, 5, 3, 1 statt
 * 1 | 2/3 | 5/6 | 8, 11 | 12 | 14/16. Gemessen wird dann dort, wo zwei
 * Bahnsteige nebeneinanderliegen (`querLagen`); wer mit keinem anderen
 * ueberlappt, behaelt die Projektion seiner Mitte.
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
  if (mitAchse.every((b) => b.linie)) {
    // `querLagen` zaehlt links der Richtung positiv, die Querachse hier
    // rechts - umgedreht, damit eine Ebene ohne ueberlappende Bahnsteige
    // genau so liegt wie bisher.
    const linksPositiv = querLagen(new Map(mitAchse.map((b) => [b.bahnsteigId, b.linie!])), {
      richtungGrad: richtung,
      mitten: new Map(mitAchse.map((b) => [b.bahnsteigId, b.mitte])),
    });
    for (const [id, lage] of linksPositiv) lagen.set(id, -lage);
  } else {
    for (const b of mitAchse) {
      const dx = (b.mitte.lon - bezug.lon) * mLon;
      const dy = (b.mitte.lat - bezug.lat) * M_LAT;
      lagen.set(b.bahnsteigId, dx * qx + dy * qy);
    }
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


/**
 * Eine Kante aus einer echten Anlage: Treppe, Rolltreppe, Aufzug - oder eine
 * Rampe aus einem OSM-Weg (`anlageSchluessel`) bzw. aus FaSta (`anlageId`).
 * Die geratenen Naehte und Treppenenden des Graphbaus (`zieheNaehte`,
 * `zieheTreppenenden`) sind Rampen ohne Schluessel - sie sind kein Zugang.
 */
const istEchteAnlage = (k: GraphKante): boolean =>
  k.typ !== 'rampe' || k.anlageSchluessel !== undefined || k.anlageId !== undefined;

/** Die Ebenenwechsel-Kanten des Graphen, jede genau einmal. */
function* ebenenwechselKanten(
  graph: StationGraph,
): Generator<{ typ: KantenTyp; von: GraphKnoten; nach: GraphKnoten; schluessel: string; anlage: string; echt: boolean }> {
  const gesehen = new Set<string>();
  for (const liste of graph.adjazenz.values()) {
    for (const kante of liste) {
      if (kante.deltaLevel === 0) continue;
      const schluessel = `${kante.von}|${kante.nach}`;
      if (gesehen.has(schluessel) || gesehen.has(`${kante.nach}|${kante.von}`)) continue;
      gesehen.add(schluessel);
      const von = graph.knoten.get(kante.von);
      const nach = graph.knoten.get(kante.nach);
      // Die Anlage hinter der Kante: ein Schacht ist eine Clique aus Kanten,
      // eine Treppe kann aus mehreren bestehen. Gezaehlt wird die Anlage.
      const anlage = kante.anlageSchluessel ?? kante.anlageId ?? schluessel;
      if (von && nach) yield { typ: kante.typ, von, nach, schluessel, anlage, echt: istEchteAnlage(kante) };
    }
  }
}

/**
 * Der Bahnsteig, an dem ein Knoten liegt – oder keiner.
 *
 * Bei einem 430-m-Bahnsteig sagt die Entfernung zur MITTE wenig; der halbe
 * Bahnsteig zaehlt deshalb als Spielraum mit.
 */
function zugangQuerGrenze(bahnsteig: Bahnsteigrohbau): number {
  // An der Mittellinie gibt es keine Bogenhoehe, die hinzukaeme.
  if (bahnsteig.linie) return ZUGANG_QUER_MAX_M;
  return ZUGANG_QUER_MAX_M + (aufAchse(bahnsteig, bahnsteig.mitte)?.querM ?? 0);
}

/**
 * Wo ein Ebenenwechsel an einem Bahnsteig liegt - oder `null`, wenn er nicht
 * zu ihm gehoert: zu weit quer, jenseits der Enden oder, wo Mittellinien da
 * sind, deutlich naeher an einem anderen Bahnsteig derselben Ebene.
 */
function lageAmBahnsteig(
  bahnsteig: Bahnsteigrohbau,
  knoten: GraphKnoten,
  bahnsteige: Bahnsteigrohbau[],
  eigen = false,
): { laengsM: number; querM: number; laengeM: number } | null {
  const lage = aufAchse(bahnsteig, knoten);
  // Die Anlage, ueber die die Route diesen Bahnsteig verlaesst oder erreicht,
  // gehoert ihm - ohne Grenze. Ueber 6.265 Routen mit Ebenenwechsel verloren
  // sonst 61 ihren genutzten Zugang (04.11.2026): die Treppe einer
  // Inselhaelfte mehr als 5 m naeher an der anderen Haelfte, ein Abgang
  // ueber 30 m neben der Linie, einer knapp hinter dem Ende. Der Weg geht
  // dort trotzdem hin. Am Kopfbahnsteig liegt die Treppe oft 60 bis 150 m
  // hinter dem Ende, und „bei <Bahnsteiglaenge> m“ stimmt dann. Das gilt nur
  // fuer echte Anlagen (`eigeneKantenDerRoute`): Eine geratene Naht 640 m
  // weiter wurde so zum Zugang ohne Anlage (Stuttgart Hbf 1/2, Schlussreview).
  if (eigen) return lage;
  if (!lage || lage.querM > zugangQuerGrenze(bahnsteig)) return null;
  if (lage.laengsM < -5 || lage.laengsM > lage.laengeM + 5) return null;
  if (!bahnsteig.linie) return lage;
  for (const anderer of bahnsteige) {
    if (anderer === bahnsteig || anderer.level !== bahnsteig.level || !anderer.linie) continue;
    const dort = aufAchse(anderer, knoten);
    if (!dort || dort.laengsM < -5 || dort.laengsM > dort.laengeM + 5) continue;
    if (dort.querM + ZUGANG_GLEICH_NAH_M < lage.querM) return null;
  }
  return lage;
}

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
  bahnsteige: Bahnsteigrohbau[],
  eigene: ReadonlySet<string>,
  graph: StationGraph,
  aufRoute: Set<string>,
  zuXY: (k: { lat: number; lon: number }) => SchemaPunkt,
): SchemaZugang[] | undefined {
  if (!bahnsteig.anfang || !bahnsteig.ende) return undefined;

  interface Treffer {
    typ: string;
    anlage: string;
    laengsM: number;
    knoten: GraphKnoten;
    aufRoute: boolean;
    echt: boolean;
  }
  const treffer: Treffer[] = [];

  for (const kante of ebenenwechselKanten(graph)) {
    for (const ende of [kante.von, kante.nach]) {
      if (ende.level !== bahnsteig.level) continue;
      const lage = lageAmBahnsteig(bahnsteig, ende, bahnsteige, eigene.has(kante.schluessel));
      if (!lage) continue;
      treffer.push({
        typ: kante.typ,
        anlage: kante.anlage,
        laengsM: lage.laengsM,
        knoten: ende,
        aufRoute: aufRoute.has(kante.schluessel) || aufRoute.has(`${kante.nach.id}|${kante.von.id}`),
        echt: kante.echt,
      });
      break;
    }
  }
  if (treffer.length === 0) return [];

  treffer.sort((a, b) => a.laengsM - b.laengsM);

  const zugaenge: SchemaZugang[] = [];
  let gruppe: Treffer[] = [treffer[0]];
  const schliesse = (): void => {
    // Nur geratene Naehte: kein Abgang. Als Zugang stuende er ohne eine
    // einzige Anlage da (Stuttgart Hbf 1/2 bei 432 m, Schlussreview
    // 04.11.2026). Liegt eine Naht der Route bei echten Anlagen, bleibt sie
    // in der Gruppe - die Route geht dort hin.
    if (!gruppe.some((t) => t.echt)) return;
    const zahl = { aufzug: 0, rolltreppe: 0, treppe: 0 };
    // Je Anlage einmal: Ein Schacht ueber fuenf Ebenen liefert vier Kanten
    // am selben Bahnsteig und ist doch ein Aufzug.
    const gezaehlt = new Set<string>();
    for (const t of gruppe) {
      if (t.typ !== 'aufzug' && t.typ !== 'rolltreppe' && t.typ !== 'treppe') continue;
      if (gezaehlt.has(`${t.typ}|${t.anlage}`)) continue;
      gezaehlt.add(`${t.typ}|${t.anlage}`);
      zahl[t.typ]++;
    }
    const mittelLaengs = gruppe.reduce((s, t) => s + t.laengsM, 0) / gruppe.length;
    const punkte = gruppe.map((t) => zuXY(t.knoten));
    zugaenge.push({
      beiM: aufDemBahnsteig(mittelLaengs, bahnsteig),
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

/** `beiM` liegt auf dem Bahnsteig: zwischen 0 und seiner Laenge. */
function aufDemBahnsteig(laengsM: number, bahnsteig: Bahnsteigrohbau): number {
  const { anfang, ende } = bahnsteig;
  const laenge = anfang && ende ? Math.round(haversineM(anfang.lat, anfang.lon, ende.lat, ende.lon)) : Infinity;
  return Math.min(Math.max(Math.round(laengsM), 0), laenge);
}

/**
 * Ueber welche Anlage die Route ihren Start- bzw. Zielbahnsteig verlaesst
 * oder erreicht - je Bahnsteig, in beiden Schreibrichtungen. Gezaehlt wird der
 * erste bzw. letzte Ebenenwechsel, der eine echte Anlage ist.
 */
function eigeneKantenDerRoute(pfad: RoutenPfad): Map<string, Set<string>> {
  const ergebnis = new Map<string, Set<string>>();
  const merke = (bahnsteigId: string | undefined, i: number): void => {
    if (!bahnsteigId) return;
    const k = pfad.kanten[i];
    const menge = ergebnis.get(bahnsteigId) ?? new Set<string>();
    menge.add(`${k.von}|${k.nach}`).add(`${k.nach}|${k.von}`);
    ergebnis.set(bahnsteigId, menge);
  };
  const wechsel = pfad.kanten
    .map((k, i) => (k.deltaLevel !== 0 && istEchteAnlage(k) ? i : -1))
    .filter((i) => i >= 0);
  const start = pfad.knoten[0];
  const ziel = pfad.knoten[pfad.knoten.length - 1];
  if (wechsel.length > 0 && start && pfad.knoten[wechsel[0]]?.level === start.level) {
    merke(start.bahnsteigId, wechsel[0]);
  }
  const letzter = wechsel[wechsel.length - 1];
  if (letzter !== undefined && ziel && pfad.knoten[letzter + 1]?.level === ziel.level) {
    merke(ziel.bahnsteigId, letzter);
  }
  return ergebnis;
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
      ...(lage && bahnsteig ? { beiM: aufDemBahnsteig(lage.laengsM, bahnsteig) } : {}),
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
  // Je Bahnsteig jede Anlage nur einmal, egal wie viele Kanten dort enden.
  const gezaehlt = new Set<string>();
  for (const kante of ebenenwechselKanten(graph)) {
    if (kante.typ !== 'aufzug' && kante.typ !== 'rolltreppe' && kante.typ !== 'treppe') continue;
    // Eine Anlage verbindet zwei Ebenen und gehört damit an beide Enden.
    for (const ende of [kante.von, kante.nach]) {
      const bahnsteig = bahnsteigBei(ende, bahnsteige);
      if (!bahnsteig) continue;
      const marke = `${bahnsteig.bahnsteigId}|${kante.typ}|${kante.anlage}`;
      if (gezaehlt.has(marke)) continue;
      gezaehlt.add(marke);
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
  eigeneKanten: Map<string, Set<string>>,
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
    let amBahnsteigId: string | undefined;
    // Die eigene Kante der Route zuerst: Sie gehoert ihrem Bahnsteig auch
    // dann, wenn ein anderer naeher laege (siehe `lageAmBahnsteig`).
    const kandidaten = bahnsteige
      .filter((kandidat) => kandidat.level === level && wichtigeBahnsteige.has(kandidat.bahnsteigId))
      .map((kandidat) => ({ b: kandidat, eigen: eigeneKanten.get(kandidat.bahnsteigId)?.has(kante.schluessel) ?? false }))
      .sort((p, q) => Number(q.eigen) - Number(p.eigen));
    for (const { b: bahnsteig, eigen } of kandidaten) {
      const lage = lageAmBahnsteig(bahnsteig, aufEbene, bahnsteige, eigen);
      if (!lage) continue;
      beiM = aufDemBahnsteig(lage.laengsM, bahnsteig);
      amBahnsteigId = bahnsteig.bahnsteigId;
      break;
    }

    const element: SchemaElement = {
      typ: kante.typ,
      punkte,
      aufRoute: aufRoute.has(kante.schluessel) || aufRoute.has(`${kante.nach.id}|${kante.von.id}`),
      ...(beiM !== undefined ? { beiM, bahnsteigId: amBahnsteigId } : {}),
    };

    // Am eigenen Bahnsteig zaehlt JEDE Anlage, auch die am fernen Ende: "wo
    // ist der naechste Aufgang" ist dort die Frage. Sonst nur, was in
    // Sichtweite des Wegs liegt.
    if (beiM !== undefined) {
      amBahnsteig.push(element);
      continue;
    }
    // Gemessen wird gegen den Weg DIESES Besuchs, auch fuer eine Anlage, die
    // die Route nutzt. Das ist Absicht, und es hat am 13.09.2026 kurzzeitig
    // anders ausgesehen: Eine Pruefung meldete „Treppe auf Ebene -1 nicht
    // markiert" und legte nahe, `aufRoute` vom Filter auszunehmen. Die
    // Meldung war falsch - sie suchte den ERSTEN Besuch der Ebene, waehrend
    // Berlin Hbf die -1 zweimal betritt und die Treppen auf dem zweiten
    // Besuch sehr wohl stehen. Eine Anlage vom Filter auszunehmen haette sie
    // in BEIDE Bilder gezeichnet, auch in das, in dem niemand sie benutzt.
    const abstand = abstandZumWeg(zuXY(aufEbene), weg);
    if (abstand > ELEMENT_RADIUS_M) continue;
    abseits.push({ abstand, element });
  }

  amBahnsteig.sort((a, b) => (a.beiM ?? 0) - (b.beiM ?? 0));
  abseits.sort((x, y) => x.abstand - y.abstand);
  return [...amBahnsteig, ...abseits.slice(0, ELEMENT_MAX_ABSEITS).map((g) => g.element)];
}

/** Was ueber den Ankunftszug bekannt ist - bestimmt die Zugspitze. */
export type SchemaOptionen = Zuglauf;

export function baueBahnhofSchema(
  graph: StationGraph,
  pfad: RoutenPfad,
  optionen: SchemaOptionen = {},
): BahnhofSchema {
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
  const eigeneKanten = eigeneKantenDerRoute(pfad);

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
      const zugaenge = rolle && hatAchse
          ? zugaengeFuer(b, bahnsteige, eigeneKanten.get(b.bahnsteigId) ?? new Set(), graph, aufRoute, zuXY)
          : undefined;
      // Wie die Himmelsrichtung nur bei gemessener Achse - im Standardmodell
      // gaebe es kein Ende, an das die Spitze sich stellen koennte.
      const zugspitze =
        rolle === 'start' && hatAchse && graph.stufe !== 3
          ? bestimmeZugspitze(b.anfang!, b.ende!, optionen)
          : undefined;
      return {
        bahnsteigId: b.bahnsteigId,
        gleise: b.gleise,
        ...(laengeM !== undefined ? { laengeM } : {}),
        ...(querM.has(b.bahnsteigId) ? { querM: Math.round(querM.get(b.bahnsteigId)!) } : {}),
        ...(rolle ? { rolle } : {}),
        ...(anlagenZahlen.has(b.bahnsteigId) ? { anlagen: anlagenZahlen.get(b.bahnsteigId)! } : {}),
        ...(hatAchse ? { von: zuXY(b.anfang!), bis: zuXY(b.ende!) } : {}),
        // Im Standardmodell waere die Richtung erfunden - dort sagen die
        // Knoepfe weiter nur „Anfang" und „Ende".
        ...(hatAchse && graph.stufe !== 3
          ? { himmelsrichtung: himmelsrichtungen(b.anfang!, b.ende!) }
          : {}),
        ...(zugspitze ? { zugspitze } : {}),
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
    const elemente = elementeFuer(graph, besuch.level, besuch.weg, bahnsteige, wichtige, eigeneKanten, aufRoute, zuXY);

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
