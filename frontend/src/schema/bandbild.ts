import type { KantenTyp, SchemaEbene, SchemaPunkt, SchemaWechsel } from '../api/typen'

/**
 * Die Geometrie eines Bandes, fertig in Zeichenkoordinaten.
 *
 * Getrennt vom Modell (`bandmodell.ts`) und getrennt von der Komponente,
 * weil das Einpassen der fehleranfälligste Teil ist: Ein Vorzeichenfehler
 * dreht den Bahnhof, ein Maßstabsfehler legt den Weg neben das Bild. Beides
 * ist hier ohne DOM prüfbar – und die Simulation prüft es über alle
 * abgelegten Bahnhöfe.
 *
 * Zwei Bildsprachen, weil zwei Fragen: Eine Gleisebene beantwortet „wo am
 * Bahnsteig bin ich, und wo ist der nächste Abgang" — dafür trägt der
 * Bahnsteig die Orientierung, als waagerechter Balken. Eine Übergangsebene
 * beantwortet „woran biege ich ab" — dort gibt es keinen Bahnsteig, also
 * muss der Grundriss selbst tragen.
 *
 * Auf BEIDEN liegt der Weg als gemessener Linienzug. Bis zum 14.09.2026
 * zeichnete die Gleisebene nur Balken; die U-Form eines Kopfbahnhofs – vom
 * Gleis zum Kopf, quer, zum Gleis – kam im Bild nicht vor, obwohl sie der
 * ganze Weg ist.
 */

/** Ein Punkt in Zeichenkoordinaten (nicht in Metern). */
export interface Bildpunkt {
  x: number
  y: number
}

export interface Bildstrich {
  x1: number
  y1: number
  x2: number
  y2: number
  typ: KantenTyp
  aufRoute: boolean
}

export interface Bildkasten {
  x: number
  y: number
  seite: number
  aufRoute: boolean
}

/** Eine Anlagenmarke IM Bahnsteigbalken, an ihrer gemessenen Stelle. */
export interface Balkenmarke {
  x: number
  typ: KantenTyp
  aufRoute: boolean
}

/**
 * Wo der Weg die Ebene wechselt.
 *
 * An BEIDEN Enden eines Wechsels steht eine: am Ende des einen Besuchs
 * („verlassen") und am Anfang des nächsten („ankommen"). Sie hängt am Weg,
 * nicht an der Anlagenliste – eine Treppe, die der Weg nimmt, muss im Bild
 * stehen, auch wenn das Kartenmaterial ihren Grundriss nicht kennt.
 */
export interface Wechselmarke {
  x: number
  y: number
  typ: KantenTyp
  richtung: 'hinunter' | 'hinauf'
  art: 'verlassen' | 'ankommen'
}

/** Anfang, Mitte, Ende des Ankunftsbahnsteigs – die Standortwahl, im Bild. */
export interface Standortmarke {
  x: number
  name: 'Anfang' | 'Mitte' | 'Ende'
  /** Hier startet der Weg. */
  hier: boolean
}

export interface Bildbalken {
  gleise: string[]
  y: number
  x1: number
  x2: number
  rolle?: 'start' | 'ziel'
  /** Liegt der Balken nach seinen echten Enden? Sonst darf er keinen Maßstab suggerieren. */
  massstaeblich: boolean
  laengeM?: number
  marken: Balkenmarke[]
  /** Der Zugang, den die Route nimmt — die Stelle, auf die es ankommt. */
  zugang?: { x: number; beiM: number; aufzug: number; rolltreppe: number; treppe: number }
  /** Position der Beschriftung links. */
  lx: number
  ly: number
}

/** Was jedes Band trägt, egal welcher Art. */
interface Wegbild {
  weg: Bildpunkt[]
  /** Anlagen, die der Weg auf dieser Ebene nutzt, mit Grundriss. */
  anlagen: Bildstrich[]
  aufzuege: Bildkasten[]
  wechsel: Wechselmarke[]
  /** Nur beim ersten Besuch: wo der Reisende steht. */
  start?: Bildpunkt
  /** Nur beim letzten Besuch: wo der Weg endet. */
  ziel?: Bildpunkt
}

export interface Gleisbild extends Wegbild {
  art: 'gleise'
  balken: Bildbalken[]
  /** Nur beim ersten Besuch, unter dem Ankunftsbahnsteig. */
  standorte?: { y: number; marken: Standortmarke[] }
}

export interface Uebergangsbild extends Wegbild {
  art: 'verbindung'
  netz: Bildpunkt[][]
  /** Anlagen in Sichtweite, die der Weg NICHT nutzt. */
  striche: Bildstrich[]
  kaesten: Bildkasten[]
  /** Nur ein Punkt: Die Ebene wird senkrecht durchquert, kein Meter Weg. */
  nurDurchquert: boolean
}

export type Bandbild = Gleisbild | Uebergangsbild

/**
 * Wie ALLE Bänder liegen – für die ganze Route einmal entschieden.
 *
 * Das Schema hat keinen Kompass; welche Seite links ist, ist frei. Frei heißt
 * aber nicht zufällig: Der Anfang des Ankunftsbahnsteigs liegt links, weil
 * die Standortknöpfe „Anfang · Mitte · Ende" von links nach rechts stehen.
 * Wer „Anfang" antippt, sieht den Punkt links.
 *
 * Gedreht wird um 180°, NICHT gespiegelt. Ein Spiegelbild machte aus dem
 * „links" der Schrittansage einen Knick nach rechts.
 */
export interface Bildlage {
  gedreht180: boolean
}

export interface Bandoptionen {
  lage: Bildlage
  /** Erster Besuch: Startpunkt und Standortmarken. */
  erster: boolean
  /** Letzter Besuch: Zielpunkt. */
  letzter: boolean
  /** Der Wechsel, über den der Weg auf diese Ebene kam. */
  wechselVorher?: SchemaWechsel
  /** Der Wechsel, über den er sie verlässt. */
  wechselNachher?: SchemaWechsel
}

/** Rand um das eingepasste Bild, in Zeichenkoordinaten. */
const RAND = 14
/**
 * Grösster Maßstab: Zeichenpunkte je Meter.
 *
 * Ohne Obergrenze bläst ein kleiner Ausschnitt — zwei Rolltreppen im Abstand
 * von acht Metern — auf die volle Fläche auf und behauptet damit eine
 * Genauigkeit, die die Daten nicht haben.
 */
const MAX_SKALA = 6
/** Breite der Beschriftungsspalte links neben den Bahnsteigbalken. */
const GASSE_LINKS = 46
const RAND_RECHTS = 12
/** Platz unter dem Stapel für „Anfang · Mitte · Ende". */
const STANDORT_ZEILE = 16
/**
 * Maßstab quer AUSSERHALB der Bahnsteigreihe, Punkte je Meter.
 *
 * Zwischen zwei Balken ist der Querabstand gestaucht (siehe `gasseZwischen`);
 * jenseits des äußersten Balkens gibt es keinen Nachbarn, an dem sich die
 * Stauchung ablesen ließe. Der Querbahnsteig eines Kopfbahnhofs liegt wenige
 * Meter hinter der Bahnsteigkante – er soll dort erscheinen, nicht am Rand.
 */
const QUER_AUSSEN = 0.8
/** Eine Anlage gehört zu einem Bahnsteig, wenn sie so nah an seiner Achse liegt. */
const ANLAGE_QUER_MAX_M = 30
/** So weit über sein Ende hinaus ordnet ein Bahnsteig noch Punkte ein (der Kopf, ein Vorplatz). */
const LAENGS_REICHWEITE_M = 30
/** Näher als das an seiner Achse: Der Punkt liegt AUF dem Bahnsteig. */
const AUF_DEM_BAHNSTEIG_M = 3

const BOGEN = Math.PI / 180

/** Die Lage für eine Route: Anfang des Ankunftsbahnsteigs nach links. */
export function bildlageFuer(ebenen: SchemaEbene[]): Bildlage {
  for (const ebene of ebenen) {
    const start = ebene.bahnsteige.find((b) => b.rolle === 'start')
    if (start?.von && start.bis) return { gedreht180: start.von.x > start.bis.x }
  }
  return { gedreht180: false }
}

/**
 * Meter im Bezugsrahmen → Meter im Bild dieses Bandes, noch ohne Maßstab.
 *
 * Eine Gleisebene, die quer zur Ankunftsebene liegt (Berlin: 81°), wird so
 * gedreht, dass IHRE Bahnsteige waagerecht liegen – auf einem Bahnsteig
 * fragt niemand nach der Lage im Haus, sondern nach vorn und hinten. Dass
 * die Ebenen sich kreuzen, sagt das Bild unter dem Stapel in Worten.
 */
export function ausrichtung(
  ebene: SchemaEbene,
  lage: Bildlage,
): (p: SchemaPunkt) => SchemaPunkt {
  const d = ebene.art === 'gleise' ? (ebene.richtungLokalGrad ?? 0) * BOGEN : 0
  const cos = Math.cos(d)
  const sin = Math.sin(d)
  const v = lage.gedreht180 ? -1 : 1
  return (p) => ({ x: v * (p.x * cos + p.y * sin), y: v * (-p.x * sin + p.y * cos) })
}

/** Halbe Pixel geben dünnen Linien eine klare Kante statt eines Schleiers. */
function kante(wert: number): number {
  return Math.round(wert) + 0.5
}

function begrenze(wert: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, wert))
}

/**
 * Bildet Meter auf Zeichenkoordinaten ab, so dass alles hineinpasst.
 *
 * `null`, wenn es nichts einzupassen gibt. Ein Maßstab über nichts wäre
 * NaN, und NaN in einem SVG-Pfad lässt das Bild verschwinden — still.
 */
export function passeEin(
  punkte: SchemaPunkt[],
  breite: number,
  hoehe: number,
): ((p: SchemaPunkt) => Bildpunkt) | null {
  if (punkte.length === 0) return null
  const xs = punkte.map((p) => p.x)
  const ys = punkte.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  if (![x0, x1, y0, y1].every(Number.isFinite)) return null

  const skala = Math.min(
    (breite - RAND * 2) / Math.max(x1 - x0, 1),
    (hoehe - RAND * 2) / Math.max(y1 - y0, 1),
    MAX_SKALA,
  )
  const vx = RAND + (breite - RAND * 2 - (x1 - x0) * skala) / 2 - x0 * skala
  const vy = RAND + (hoehe - RAND * 2 - (y1 - y0) * skala) / 2 - y0 * skala
  return (p) => ({ x: kante(vx + p.x * skala), y: kante(vy + p.y * skala) })
}

function richtungVon(w: SchemaWechsel): 'hinunter' | 'hinauf' {
  return w.nachLevel < w.vonLevel ? 'hinunter' : 'hinauf'
}

/**
 * Die Marken an den Enden des Wegs – und Start und Ziel.
 *
 * Bei einem Besuch, der nur senkrecht durchquert wird, fallen Anfang und
 * Ende auf einen Punkt; dann stehen dort beide Marken, und das ist richtig:
 * Man kommt über die eine Treppe an und nimmt gleich die nächste.
 */
function wegenden(weg: Bildpunkt[], opt: Bandoptionen): Pick<Wegbild, 'wechsel' | 'start' | 'ziel'> {
  const wechsel: Wechselmarke[] = []
  const erster = weg[0]
  const letzter = weg[weg.length - 1]
  if (erster && opt.wechselVorher) {
    wechsel.push({
      ...erster,
      typ: opt.wechselVorher.typ,
      richtung: richtungVon(opt.wechselVorher),
      art: 'ankommen',
    })
  }
  if (letzter && opt.wechselNachher) {
    wechsel.push({
      ...letzter,
      typ: opt.wechselNachher.typ,
      richtung: richtungVon(opt.wechselNachher),
      art: 'verlassen',
    })
  }
  return {
    wechsel,
    ...(opt.erster && erster ? { start: erster } : {}),
    ...(opt.letzter && letzter ? { ziel: letzter } : {}),
  }
}

/** Anlagen, die der Weg nutzt: Treppe als Strecke, Aufzug als Kasten. */
function routenanlagen(
  ebene: SchemaEbene,
  bild: (p: SchemaPunkt) => Bildpunkt,
): Pick<Wegbild, 'anlagen' | 'aufzuege'> {
  const anlagen: Bildstrich[] = []
  const aufzuege: Bildkasten[] = []
  for (const element of ebene.elemente ?? []) {
    if (!element.aufRoute || element.punkte.length === 0) continue
    if (element.typ === 'aufzug' || element.punkte.length === 1) {
      const p = bild(element.punkte[0])
      aufzuege.push({ x: p.x, y: p.y, seite: 9, aufRoute: true })
      continue
    }
    const a = bild(element.punkte[0])
    const b = bild(element.punkte[1])
    anlagen.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, typ: element.typ, aufRoute: true })
  }
  return { anlagen, aufzuege }
}

/** Alle Punkte einer Übergangsebene, die ins Bild müssen. */
function punkteVon(ebene: SchemaEbene): SchemaPunkt[] {
  const alle: SchemaPunkt[] = []
  for (const stueck of ebene.netz ?? []) alle.push(...stueck.punkte)
  for (const element of ebene.elemente ?? []) alle.push(...element.punkte)
  alle.push(...(ebene.weg ?? []))
  return alle
}

/**
 * Der Grundriss einer Übergangsebene: Gänge, Anlagen, Weg.
 *
 * Berlins Ebene 0 ist der Fall, für den das gebaut ist: Der Weg läuft 26 m
 * hinaus und kommt fast an derselben Stelle zurück — die beiden Rolltreppen
 * liegen hintereinander, man muss sich umdrehen. Ein Bild, das dort
 * „geradeaus weiter" zeigt, schickt den Reisenden in die falsche Richtung.
 */
export function zeichneUebergang(
  ebene: SchemaEbene,
  breite: number,
  hoehe: number,
  opt: Bandoptionen,
): Uebergangsbild | null {
  const drehe = ausrichtung(ebene, opt.lage)
  const passend = passeEin(punkteVon(ebene).map(drehe), breite, hoehe)
  if (!passend) return null
  const bild = (p: SchemaPunkt): Bildpunkt => passend(drehe(p))

  const netz = (ebene.netz ?? []).map((stueck) => stueck.punkte.map(bild))
  const striche: Bildstrich[] = []
  const kaesten: Bildkasten[] = []
  for (const element of ebene.elemente ?? []) {
    if (element.aufRoute) continue // die zeichnet `routenanlagen`, hervorgehoben
    // Ein Aufzug steht still und ist ein Punkt; eine Treppe läuft waagerecht
    // mit und ist eine Strecke. Die Form kommt aus der Sache, nicht aus der
    // Gestaltung.
    if (element.typ === 'aufzug' || element.punkte.length === 1) {
      const p = bild(element.punkte[0])
      kaesten.push({ x: p.x, y: p.y, seite: 7, aufRoute: false })
      continue
    }
    const a = bild(element.punkte[0])
    const b = bild(element.punkte[1])
    striche.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, typ: element.typ, aufRoute: false })
  }

  const weg = (ebene.weg ?? []).map(bild)
  return {
    art: 'verbindung',
    netz,
    striche,
    kaesten,
    weg,
    nurDurchquert: weg.length < 2,
    ...routenanlagen(ebene, bild),
    ...wegenden(weg, opt),
  }
}

/** Abstand zwischen zwei Bahnsteigbalken, aus ihrer echten Querlage. */
function gasseZwischen(querMeter: number): number {
  // Gedeckelt: Berlins Gleis 22 liegt 48 m neben 7/8, das wäre sonst die
  // halbe Bildhöhe für eine Lücke. Die REIHENFOLGE ist die Aussage, der
  // Abstand nur ihre Andeutung.
  return Math.min(52, 24 + Math.abs(querMeter) * 0.4)
}

/**
 * Eine Gleisebene: waagerechte Balken in echter Reihenfolge und echter Lage.
 *
 * Längs maßstäblich – samt Versatz der Bahnsteige zueinander, denn `von` und
 * `bis` liegen im Bezugsrahmen. Quer stimmt die Reihenfolge und ungefähr der
 * Abstand; gestaucht, damit acht Bahnsteige auf ein Telefon passen. Der Weg
 * folgt beidem: längs im selben Maßstab wie die Balken, quer über die
 * Balkenlagen gestaucht. So liegt ein Punkt auf Bahnsteig 16/17 auch im Bild
 * auf dem Balken 16/17 – und die U-Form um den Kopf ist eine U-Form.
 */
export function zeichneGleisebene(
  ebene: SchemaEbene,
  breite: number,
  hoehe: number,
  opt: Bandoptionen,
): Gleisbild | null {
  if (ebene.bahnsteige.length === 0) return null
  const drehe = ausrichtung(ebene, opt.lage)

  const platziert = ebene.bahnsteige
    .filter((b) => b.von && b.bis)
    .map((b) => {
      const a = drehe(b.von!)
      const e = drehe(b.bis!)
      return { b, a, e, yM: (a.y + e.y) / 2 }
    })
    .sort((p, q) => p.yM - q.yM)
  // Ohne Achse keine Lage: unten angehängt, in voller Breite, als ungemessen.
  const frei = ebene.bahnsteige.filter((b) => !(b.von && b.bis))

  const startBs = platziert.find((p) => p.b.rolle === 'start')
  const mitStandorten = opt.erster && startBs !== undefined
  const nutzH = hoehe - (mitStandorten ? STANDORT_ZEILE : 0)

  // --- quer: Balkenlagen ---
  const roh = [
    ...platziert.map((p, i) => (i === 0 ? 0 : gasseZwischen(p.yM - platziert[i - 1].yM))),
    ...frei.map((_, i) => (i === 0 && platziert.length === 0 ? 0 : 34)),
  ]
  // Eingepasst, nicht abgeschnitten: München Hbf trägt auf Ebene 0 über
  // fünfzehn Bahnsteige, und ungestaucht liefe der Stapel unten aus dem Bild
  // – gemessen von der Simulation am 14.09.2026, an 126 Routen.
  const verfuegbar = Math.max(1, nutzH - RAND * 2)
  const rohGesamt = roh.reduce((a, b) => a + b, 0)
  const stauchung = rohGesamt > verfuegbar ? verfuegbar / rohGesamt : 1
  const abstaende = roh.map((a) => a * stauchung)
  const gesamt = rohGesamt * stauchung
  let y = RAND + (verfuegbar - gesamt) / 2
  const bildY = abstaende.map((abstand) => {
    y += abstand
    return kante(y)
  })

  /**
   * Quer gemessen an den BAHNSTEIGLINIEN, nicht am y des Bezugsrahmens.
   *
   * Ein Bahnsteig liegt selten genau parallel zur mittleren Gleisrichtung:
   * 3° Abweichung sind auf 400 m zwanzig Meter quer. Über das globale y
   * gerechnet, landete sein Ende zwischen zwei Balken – der Startpunkt am
   * Bahnsteiganfang stand in der Simulation an 149 Routen neben dem eigenen
   * Bahnsteig, bis zu 92 px. Gemessen am Abstand zu den Linien selbst liegt
   * jeder Punkt eines Bahnsteigs genau auf seinem Balken, und dazwischen wird
   * zwischen den beiden Nachbarlinien geteilt.
   */
  const linien = platziert.map((p, i) => {
    const lx = p.e.x - p.a.x
    const ly = p.e.y - p.a.y
    const l = Math.hypot(lx, ly) || 1
    // Die Normale zeigt nach +y – dorthin, wo im Bild die nächsten Balken liegen.
    const v = lx / l < 0 ? -1 : 1
    return { a: p.a, ux: lx / l, uy: ly / l, l, nx: (-ly / l) * v, ny: (lx / l) * v, bild: bildY[i] }
  })
  /**
   * Nur Bahnsteige, neben denen der Punkt der LÄNGE nach liegt.
   *
   * Eine Bahnsteiglinie, weit über ihr Ende verlängert, sagt über einen
   * Punkt nichts – und sie lügt, sobald die Bahnsteige nicht parallel liegen:
   * In Aachen Hbf lag die Verlängerung von 6/7 am Ende von 2/3 schon ÜBER dem
   * Ankunftsbahnsteig, 79 m jenseits ihres eigenen Endes. In Augsburg setzt
   * Bahnsteig 101 den Bahnsteig 1 in gerader Linie fort; seine Linie klemmte
   * den Startpunkt zwischen zwei falsche Balken.
   */
  const imBereich = (l: (typeof linien)[number], q: SchemaPunkt): boolean => {
    const t = (q.x - l.a.x) * l.ux + (q.y - l.a.y) * l.uy
    return t >= -LAENGS_REICHWEITE_M && t <= l.l + LAENGS_REICHWEITE_M
  }
  const quer = (q: SchemaPunkt): number => {
    if (linien.length === 0) return kante(nutzH / 2)
    const nah = linien.filter((l) => imBereich(l, q))
    const kandidaten = nah.length > 0 ? nah : linien
    const s = kandidaten.map((l) => (q.x - l.a.x) * l.nx + (q.y - l.a.y) * l.ny)
    let naechste = 0
    for (let k = 1; k < s.length; k++) if (Math.abs(s[k]) < Math.abs(s[naechste])) naechste = k
    const an = (k: number): number => kandidaten[k].bild + s[k] * QUER_AUSSEN

    let wert: number | undefined
    // Auf einem Bahnsteig steht man auf seinem Balken.
    if (Math.abs(s[naechste]) <= AUF_DEM_BAHNSTEIG_M) wert = an(naechste)
    else if (s.every((x) => x < 0)) wert = an(0)
    else if (s.every((x) => x > 0)) wert = an(s.length - 1)
    else {
      for (let k = 0; k < s.length - 1; k++) {
        if (s[k] >= 0 && s[k + 1] < 0) {
          const t = s[k] / (s[k] - s[k + 1])
          wert = kandidaten[k].bild + t * (kandidaten[k + 1].bild - kandidaten[k].bild)
          break
        }
      }
      // Keine saubere Ordnung (Linien, die sich kreuzen): der nächste Balken.
      if (wert === undefined) wert = an(naechste)
    }
    return kante(begrenze(wert, 4, nutzH - 4))
  }

  // --- längs: ein Maßstab für Balken und Weg ---
  const innenW = Math.max(40, breite - GASSE_LINKS - RAND_RECHTS)
  const xs: number[] = []
  for (const p of platziert) xs.push(p.a.x, p.e.x)
  for (const w of ebene.weg ?? []) xs.push(drehe(w).x)
  for (const el of ebene.elemente ?? []) if (el.aufRoute) for (const q of el.punkte) xs.push(drehe(q).x)
  const x0 = xs.length > 0 ? Math.min(...xs) : 0
  const x1 = xs.length > 0 ? Math.max(...xs) : 1
  const skala = Math.min(innenW / Math.max(x1 - x0, 1), MAX_SKALA)
  const vx = GASSE_LINKS + (innenW - (x1 - x0) * skala) / 2
  const laengs = (x: number): number => kante(vx + (x - x0) * skala)
  const bild = (p: SchemaPunkt): Bildpunkt => {
    const q = drehe(p)
    return { x: laengs(q.x), y: quer(q) }
  }

  // --- Anlagen am Ankunfts- und Abfahrtsbahnsteig ---
  // Nur dort verortet: an den Nachbarbahnsteigen wäre jede Marke Gewirr —
  // dort zählt die Zahl, und die steht in der Kopfzeile. Jede Anlage an den
  // Bahnsteig, dessen Achse ihr am nächsten liegt; sonst trüge der
  // Ankunftsbahnsteig auch die Treppen des Abfahrtsbahnsteigs.
  const wichtige = platziert.filter((p) => p.b.rolle && p.b.laengeM !== undefined)
  const markenJe = new Map<string, Balkenmarke[]>()
  const gesehen = new Set<string>()
  for (const element of ebene.elemente ?? []) {
    if (element.beiM === undefined || element.punkte.length === 0) continue
    const mitte = drehe({
      x: element.punkte.reduce((s, q) => s + q.x, 0) / element.punkte.length,
      y: element.punkte.reduce((s, q) => s + q.y, 0) / element.punkte.length,
    })
    let bester: (typeof wichtige)[number] | undefined
    for (const w of wichtige) {
      const abstand = Math.abs(mitte.y - w.yM)
      if (abstand > ANLAGE_QUER_MAX_M) continue
      if (!bester || abstand < Math.abs(mitte.y - bester.yM)) bester = w
    }
    if (!bester) continue
    const x = laengs(mitte.x)
    // Was im Bild dichter als fünf Punkte beieinanderliegt, fällt zusammen —
    // sonst steht dort ein Fleck statt einer Auskunft.
    const schluessel = `${bester.b.bahnsteigId}:${element.typ}:${Math.round(x / 5)}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    const liste = markenJe.get(bester.b.bahnsteigId) ?? []
    liste.push({ x, typ: element.typ, aufRoute: element.aufRoute })
    markenJe.set(bester.b.bahnsteigId, liste)
  }

  const balken: Bildbalken[] = [
    ...platziert.map((p, i) => {
      const genutzt = p.b.rolle ? (p.b.zugaenge ?? []).find((z) => z.aufRoute) : undefined
      return {
        gleise: p.b.gleise,
        y: bildY[i],
        x1: laengs(Math.min(p.a.x, p.e.x)),
        x2: laengs(Math.max(p.a.x, p.e.x)),
        ...(p.b.rolle ? { rolle: p.b.rolle } : {}),
        massstaeblich: p.b.laengeM !== undefined,
        ...(p.b.laengeM !== undefined ? { laengeM: p.b.laengeM } : {}),
        marken: markenJe.get(p.b.bahnsteigId) ?? [],
        ...(genutzt
          ? {
              zugang: {
                x: laengs(drehe(genutzt.pos).x),
                beiM: genutzt.beiM,
                aufzug: genutzt.aufzug,
                rolltreppe: genutzt.rolltreppe,
                treppe: genutzt.treppe,
              },
            }
          : {}),
        lx: GASSE_LINKS - 8,
        ly: bildY[i] + 4,
      }
    }),
    ...frei.map((b, k) => {
      const y = bildY[platziert.length + k]
      return {
        gleise: b.gleise,
        y,
        x1: GASSE_LINKS,
        x2: GASSE_LINKS + innenW,
        ...(b.rolle ? { rolle: b.rolle } : {}),
        massstaeblich: false,
        marken: [],
        lx: GASSE_LINKS - 8,
        ly: y + 4,
      }
    }),
  ]

  // --- Standortwahl am Ankunftsbahnsteig ---
  let standorte: Gleisbild['standorte']
  if (mitStandorten && startBs) {
    // Wo der Weg beginnt, entscheidet, welcher der drei Punkte „hier" ist –
    // gemessen, nicht aus der Eingabe übernommen. Fiel das Backend still auf
    // die Mitte zurück, zeigt das Bild die Mitte.
    const ursprung = drehe({ x: 0, y: 0 })
    const dx = startBs.e.x - startBs.a.x
    const dy = startBs.e.y - startBs.a.y
    const t = begrenze(
      ((ursprung.x - startBs.a.x) * dx + (ursprung.y - startBs.a.y) * dy) / Math.max(dx * dx + dy * dy, 1),
      0,
      1,
    )
    const namen: Standortmarke['name'][] = ['Anfang', 'Mitte', 'Ende']
    const naechster = Math.round(t * 2)
    standorte = {
      y: kante(nutzH + STANDORT_ZEILE / 2),
      marken: [0, 0.5, 1].map((anteil, i) => ({
        x: laengs(startBs.a.x + anteil * dx),
        name: namen[i],
        hier: i === naechster,
      })),
    }
  }

  const weg = (ebene.weg ?? []).map(bild)
  return {
    art: 'gleise',
    balken,
    weg,
    ...(standorte ? { standorte } : {}),
    ...routenanlagen(ebene, bild),
    ...wegenden(weg, opt),
  }
}

/** Das Bild eines Bandes — welche Sprache, entscheidet seine Art. */
export function zeichneBand(
  ebene: SchemaEbene,
  breite: number,
  hoehe: number,
  opt: Bandoptionen,
): Bandbild | null {
  return ebene.art === 'gleise'
    ? zeichneGleisebene(ebene, breite, hoehe, opt)
    : zeichneUebergang(ebene, breite, hoehe, opt)
}
