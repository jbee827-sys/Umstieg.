import { verteileGehzeit, ZUSCHLAG } from './gehzeit.js';
import type { Gehprofil, GraphKnoten, KantenTyp, RoutenPfad, Schritt } from './typen.js';

/** Peilung a→b in Grad (0 = Nord, 90 = Ost), äquirektangulare Näherung – Bahnhofsmaßstab. */
export function peilungGrad(a: GraphKnoten, b: GraphKnoten): number {
  const mittelLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lon - a.lon) * Math.cos(mittelLatRad);
  const dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

const MERGE_SCHWELLE_GRAD = 22.5;

/** Winkeländerung vorher→nachher, normalisiert auf −180…180 (positiv = Linksdrehung). */
function winkelDelta(vorher: number, nachher: number): number {
  let delta = (vorher - nachher) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/** Richtungsskala in 45°-Sektoren (Plan Task 9). */
function richtungsWort(delta: number): string {
  if (delta > 67.5) return 'links';
  if (delta > 22.5) return 'halblinks';
  if (delta >= -22.5) return 'geradeaus';
  if (delta >= -67.5) return 'halbrechts';
  return 'rechts';
}

// Ebene −1 heißt durchgehend „Unterführung (-1)" (konsistente Benennung statt
// gemischter Plan-Beispiele), alle anderen Ebenen „Ebene n".
function ebenenName(level: number): string {
  return level === -1 ? 'Unterführung (-1)' : `Ebene ${level}`;
}

function rund10(m: number): number {
  return Math.round(m / 10) * 10;
}

interface Segment {
  typ: KantenTyp;
  laengeM: number;
  /** Zuschlaege aller Kanten darin - nach dem Zusammenfassen mehr als einer. */
  zuschlagSek: number;
  peilungStart: number | null; // null = senkrecht (Aufzug ohne Ortsversatz)
  peilungEnde: number | null;
  deltaLevel: number;
  zielLevel: number;
  knotenVon: number;
  knotenBis: number;
}

/**
 * Unter dieser Querabweichung ist ein Knick kein Abbiegen, sondern der
 * Verlauf des Fußwegs.
 *
 * München Hbf, Gleis 5 → 82 (14.09.2026): Die kartierten Fußwege am Kopf des
 * Holzkirchner Flügelbahnhofs laufen als L-Treppe, und aus jeder Stufe wurde
 * ein Schritt – acht Anweisungen für 80 m, „wenige Meter links / 40 m
 * rechts / 20 m links …". 6 m ist breiter als ein Versatz um eine Säule und
 * schmaler als jeder Gang, in den man abbiegt.
 */
const GLAETTUNG_M = 6;

/**
 * Die Knoten eines ebenen Laufs, an denen sich die Richtung wirklich ändert
 * (Douglas-Peucker über die Knotenindizes). Anfang und Ende bleiben immer.
 */
function haltepunkte(knoten: GraphKnoten[], von: number, bis: number, glaettungM: number): number[] {
  const bezug = knoten[von];
  const mLat = 111_320;
  const mLon = mLat * Math.cos((bezug.lat * Math.PI) / 180);
  const xy = (k: GraphKnoten) => ({ x: (k.lon - bezug.lon) * mLon, y: (k.lat - bezug.lat) * mLat });
  const teile = (a: number, b: number): number[] => {
    if (b - a < 2) return [a, b];
    const p = xy(knoten[a]);
    const q = xy(knoten[b]);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const sehne = Math.hypot(dx, dy);
    let weiteste = a;
    let abstand = -1;
    for (let i = a + 1; i < b; i++) {
      const r = xy(knoten[i]);
      // Sehne der Länge null (der Weg kehrt an seinen Anfang zurück): Dann
      // zählt der Abstand zum Anfang - der Wendepunkt bleibt stehen.
      const d = sehne === 0
        ? Math.hypot(r.x - p.x, r.y - p.y)
        : Math.abs(dy * (r.x - p.x) - dx * (r.y - p.y)) / sehne;
      if (d > abstand) {
        abstand = d;
        weiteste = i;
      }
    }
    if (abstand <= glaettungM) return [a, b];
    return [...teile(a, weiteste).slice(0, -1), ...teile(weiteste, b)];
  };
  return teile(von, bis);
}

/**
 * Kanten zu Segmenten.
 *
 * Ein ebener Lauf (gleiche Ebene, nur `eben`) wird an seinen Haltepunkten
 * zerlegt; die Richtung eines Stücks ist die Sehne zwischen ihnen, die Länge
 * bleibt die echte Weglänge. Danach verschmelzen benachbarte Stücke gleicher
 * Richtung (±22,5°) wie bisher.
 */
function baueSegmente(pfad: RoutenPfad, glaettungM: number): Segment[] {
  const segmente: Segment[] = [];
  const haenge = (von: number, bis: number, typ: KantenTyp): void => {
    let laengeM = 0;
    let zuschlagSek = 0;
    for (let k = von; k < bis; k++) {
      laengeM += pfad.kanten[k].laengeM;
      zuschlagSek += ZUSCHLAG[pfad.kanten[k].typ] ?? 0;
    }
    const a = pfad.knoten[von];
    const b = pfad.knoten[bis];
    const degeneriert = a.lat === b.lat && a.lon === b.lon;
    const peilung = degeneriert ? null : peilungGrad(a, b);

    const letztes = segmente[segmente.length - 1];
    if (
      typ === 'eben' &&
      letztes?.typ === 'eben' &&
      letztes.peilungEnde !== null &&
      peilung !== null &&
      Math.abs(winkelDelta(letztes.peilungEnde, peilung)) <= MERGE_SCHWELLE_GRAD
    ) {
      letztes.laengeM += laengeM;
      letztes.peilungEnde = peilung;
      letztes.zielLevel = b.level;
      letztes.knotenBis = bis;
      return;
    }
    segmente.push({
      typ,
      laengeM,
      zuschlagSek,
      peilungStart: peilung,
      peilungEnde: peilung,
      // Laufrichtung zählt: die Kante kann rückwärts begangen werden,
      // kante.deltaLevel gilt nur für die Speicherrichtung von→nach.
      deltaLevel: b.level - a.level,
      zielLevel: b.level,
      knotenVon: von,
      knotenBis: bis,
    });
  };

  let i = 0;
  while (i < pfad.kanten.length) {
    if (pfad.kanten[i].typ !== 'eben') {
      haenge(i, i + 1, pfad.kanten[i].typ);
      i++;
      continue;
    }
    // Ein Lauf endet auch an einem Ebenenwechsel ohne Treppe: Die Schritte
    // müssen die Besuche des Schemas eins zu eins abbilden.
    const level = pfad.knoten[i].level;
    let j = i;
    while (j < pfad.kanten.length && pfad.kanten[j].typ === 'eben' && pfad.knoten[j + 1].level === level) j++;
    if (j === i) j = i + 1;
    const halte = haltepunkte(pfad.knoten, i, j, glaettungM);
    for (let h = 0; h < halte.length - 1; h++) haenge(halte[h], halte[h + 1], 'eben');
    i = j;
  }
  return segmente;
}

/*
 * Weniger kleine Schritte (Julian, 21.10.2026: „zu viele kleine Schritte“).
 * Gemessen ueber 364 Wege des Startbestands: 14 % aller Schritte waren
 * „wenige Meter“, dazu dieselbe Rampe dreimal hintereinander (Backnang) und
 * Podeste zwischen zwei Treppen als eigener Schritt (Aachen). Wer am
 * Bahnsteig steht, tippt fuer jeden davon „Weiter“.
 *
 * Im Bahnhofspfad wird nur INNERHALB einer Ebene zusammengefasst: Jede Ebene
 * des Wegs ist ein Band im Schema (`besucheDerRoute` in schema.ts), und das
 * Frontend ordnet die Schritte ueber genau diese Laeufe zu (`besuchJeSchritt`).
 * Ein Schritt ueber zwei Ebenen naehme dem Schema ein Band.
 */

/** Ein ebenes Stueck darunter ist kein eigener Schritt, wenn es auf derselben Ebene weitergeht. */
const KURZ_M = 15;
/** Ein Podest darunter gehoert zur Treppe davor („wenige Meter“). */
const PODEST_M = 10;

const istSenkrecht = (s: Segment): boolean => s.typ !== 'eben';

/** `b` folgt auf `a`: ein Segment ueber beide. Typ und Anfang von `a`, Ende von `b`. */
function verbinde(a: Segment, b: Segment, knoten: GraphKnoten[]): Segment {
  const beideEben = !istSenkrecht(a) && !istSenkrecht(b);
  // Zwei ebene Stuecke: Die Richtung ist die Sehne ueber beide - aus „70 m
  // geradeaus, 10 m rechts, 30 m links“ wird „40 m halbrechts“, nicht „rechts“.
  const sehne = beideEben
    ? (() => {
        const p = knoten[a.knotenVon];
        const q = knoten[b.knotenBis];
        return p.lat === q.lat && p.lon === q.lon ? null : peilungGrad(p, q);
      })()
    : undefined;
  return {
    typ: istSenkrecht(a) ? a.typ : b.typ,
    laengeM: a.laengeM + b.laengeM,
    zuschlagSek: a.zuschlagSek + b.zuschlagSek,
    peilungStart: sehne !== undefined ? sehne : a.peilungStart,
    peilungEnde: sehne !== undefined ? sehne : (b.peilungEnde ?? a.peilungEnde),
    deltaLevel: a.deltaLevel + b.deltaLevel,
    zielLevel: b.zielLevel,
    knotenVon: a.knotenVon,
    knotenBis: b.knotenBis,
  };
}

/** Ersetzt `s[i]` und `s[i + 1]` durch ihre Verbindung. */
function verbindeBei(s: Segment[], i: number, knoten: GraphKnoten[]): void {
  s.splice(i, 2, verbinde(s[i], s[i + 1], knoten));
}

function fasseZusammen(segmente: Segment[], knoten: GraphKnoten[], ueberEbenen: boolean): Segment[] {
  const s = [...segmente];
  const eben = (x: Segment | undefined, level: number) => x !== undefined && !istSenkrecht(x) && x.zielLevel === level;
  const richtung = (x: Segment) => Math.sign(x.deltaLevel);

  // 1. Dieselbe Anlage mehrmals hintereinander (Rampe, Rampe, Rampe), auch mit
  //    einem kurzen Stueck dazwischen auf derselben Ebene (Hennef: Rampe,
  //    „10 m rechts“, Rampe): OSM zerlegt sie, gegangen wird sie am Stueck.
  for (let i = 0; i < s.length - 1; ) {
    const a = s[i];
    let j = i + 1;
    while (j < s.length && eben(s[j], a.zielLevel) && s[j].laengeM < KURZ_M) j++;
    const b = s[j];
    if (istSenkrecht(a) && b && istSenkrecht(b) && a.typ === b.typ && a.zielLevel === b.zielLevel) {
      while (s[i + 1] !== b) verbindeBei(s, i, knoten);
      verbindeBei(s, i, knoten);
    } else i++;
  }

  // 2. Nur ohne Schema (Haltestellenpfad): Treppe, Podest, Treppe in dieselbe
  //    Richtung ist EINE Treppe - „hinunter zur Ebene 0.5“, „… 0.25“, „… 0“
  //    sagt am Ausgang niemandem etwas.
  if (ueberEbenen) {
    for (let i = 0; i < s.length - 1; ) {
      const a = s[i];
      let j = i + 1;
      while (j < s.length && !istSenkrecht(s[j]) && s[j].laengeM < KURZ_M) j++;
      const b = s[j];
      if (istSenkrecht(a) && b && istSenkrecht(b) && a.typ === b.typ && richtung(a) === richtung(b) && richtung(a) !== 0) {
        while (s[i + 1] !== b) verbindeBei(s, i, knoten);
        verbindeBei(s, i, knoten);
      } else i++;
    }
  }

  // 3. Ein kurzes ebenes Stueck geht im Nachbarn derselben Ebene auf - erst im
  //    folgenden, am Ende des Laufs im vorigen.
  for (let i = 0; i < s.length; ) {
    const x = s[i];
    if (istSenkrecht(x) || x.laengeM >= KURZ_M) {
      i++;
      continue;
    }
    if (eben(s[i + 1], x.zielLevel)) {
      verbindeBei(s, i, knoten);
      i = Math.max(0, i - 1);
    } else if (eben(s[i - 1], x.zielLevel)) {
      verbindeBei(s, i - 1, knoten);
      i = Math.max(0, i - 2);
    } else i++;
  }

  // 4. Ein Podest allein auf seiner Ebene gehoert zur Treppe davor - der
  //    Lauf dieser Ebene bleibt, nur ohne eigenen Schritt.
  for (let i = 1; i < s.length; ) {
    const [vorher, x] = [s[i - 1], s[i]];
    if (!istSenkrecht(x) && x.laengeM < PODEST_M && istSenkrecht(vorher) && vorher.zielLevel === x.zielLevel) {
      verbindeBei(s, i - 1, knoten);
    } else i++;
  }

  // 5. Was nach dem Zusammenfassen in eine Richtung laeuft, ist ein Stueck.
  for (let i = 0; i < s.length - 1; ) {
    const [a, b] = [s[i], s[i + 1]];
    if (
      eben(a, a.zielLevel) &&
      eben(b, a.zielLevel) &&
      a.peilungEnde !== null &&
      b.peilungStart !== null &&
      Math.abs(winkelDelta(a.peilungEnde, b.peilungStart)) <= MERGE_SCHWELLE_GRAD
    ) {
      verbindeBei(s, i, knoten);
    } else i++;
  }
  return s;
}

const TYP_NAME: Partial<Record<KantenTyp, string>> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  rampe: 'Rampe',
};

export interface TextOptionen {
  /** Stufe 3 (Synthesemodell): Distanzen sind Schätzungen → Präfix „ca. ". */
  ungefaehr?: boolean;
  /** Ohne Profil bleibt `sekunden` undefiniert (aeltere Aufrufer). */
  profil?: Gehprofil;
  /**
   * Haltestellenpfad (Umstieg 2.0): was am Ende steht, statt „zu Gleis X“ –
   * etwa „zu Steig B (Bus 245)“. Ohne Angabe bleibt der Bahnhofspfad, wie er ist.
   */
  zielZusatz?: string;
  /**
   * Treppen ueber Zwischenebenen zu einem Schritt zusammenfassen. Nur ohne
   * Ebenenschema (Haltestellenpfad) - dort nimmt das keinem Bild ein Band.
   */
  ueberEbenen?: boolean;
  /**
   * Querabweichung, unter der ein Knick kein Abbiegen ist. Vorgabe
   * `GLAETTUNG_M` (Bahnhofshalle). Draussen zeichnet MOTIS den Fussweg
   * zackig ueber Plaetze - dort mehr (`fussweg.ts`).
   */
  glaettungM?: number;
}

export function generiereSchritte(pfad: RoutenPfad, optionen: TextOptionen = {}): Schritt[] {
  const segmente = fasseZusammen(
    baueSegmente(pfad, optionen.glaettungM ?? GLAETTUNG_M),
    pfad.knoten,
    optionen.ueberEbenen ?? false,
  );
  const zeiten = optionen.profil ? verteileGehzeit(segmente, optionen.profil) : null;
  const schritte: Schritt[] = [];
  const distanzPraefix = optionen.ungefaehr ? 'ca. ' : '';
  let referenzPeilung: number | null = null;

  for (const segment of segmente) {
    let text: string;
    let distanzM: number | undefined;

    if (segment.typ === 'eben') {
      const delta =
        referenzPeilung === null || segment.peilungStart === null
          ? 0
          : winkelDelta(referenzPeilung, segment.peilungStart);
      const richtung = richtungsWort(delta);
      if (segment.laengeM < 10) {
        text = `wenige Meter ${richtung}`;
      } else {
        distanzM = rund10(segment.laengeM);
        text = `${distanzPraefix}${distanzM} m ${richtung}`;
      }
    } else if (segment.typ === 'aufzug') {
      text = `Aufzug zur ${ebenenName(segment.zielLevel)}`;
    } else {
      const hochRunter = segment.deltaLevel > 0 ? 'hoch' : 'hinunter';
      text = `${TYP_NAME[segment.typ]} ${hochRunter} zur ${ebenenName(segment.zielLevel)}`;
      if (segment.typ === 'rampe' && segment.laengeM >= 10) {
        distanzM = rund10(segment.laengeM);
      }
    }

    referenzPeilung = segment.peilungEnde ?? referenzPeilung;
    schritte.push({
      text,
      typ: segment.typ,
      ...(distanzM !== undefined ? { distanzM } : {}),
      ...(zeiten ? { sekunden: zeiten[schritte.length] } : {}),
      level: segment.zielLevel,
      knotenVon: segment.knotenVon,
      knotenBis: segment.knotenBis,
    });
  }

  if (schritte.length > 0) {
    schritte[0].text = `Nach Ausstieg ${schritte[0].text}`;
    for (let i = 1; i < schritte.length; i++) {
      const t = schritte[i].text;
      schritte[i].text = t.charAt(0).toUpperCase() + t.slice(1);
    }
    const zielGleis = pfad.knoten[pfad.knoten.length - 1]?.gleis;
    if (optionen.zielZusatz) {
      schritte[schritte.length - 1].text += ` ${optionen.zielZusatz}`;
    } else if (zielGleis) {
      schritte[schritte.length - 1].text += ` zu Gleis ${zielGleis}`;
    }
  }
  return schritte;
}
