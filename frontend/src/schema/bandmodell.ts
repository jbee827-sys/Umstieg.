import type {
  BahnhofSchema,
  KantenTyp,
  RouteErgebnis,
  SchemaBahnsteig,
  SchemaEbene,
  SchemaWechsel,
  Schritt,
} from '../api/typen'
import type { Bildlage } from './bandbild'
import { bildlageFuer } from './bandbild'

/**
 * Ein Band im Bild: EIN BESUCH einer Ebene.
 *
 * Nicht eine Ebene. Wer in Leipzig vom Bahnsteiganfang startet, geht
 * hinunter in die Unterführung und wieder herauf — das sind drei Bänder auf
 * zwei Stockwerken. Die alte Ableitung aus den Schritttexten sortierte nach
 * Höhe und machte daraus zwei; die Reihenfolge, der jemand folgt, ging dabei
 * verloren.
 */
export interface Band {
  /** Stelle in `schema.ebenen` — der Besuch, nicht das Stockwerk. */
  nr: number
  level: number
  /** "EBENE +1", "EBENE 0", "EBENE −2" — mit echtem Minuszeichen. */
  label: string
  art: 'gleise' | 'verbindung'
  rolle?: 'start' | 'ziel'
  /** Erster bzw. letzter Besuch der Route. */
  erster: boolean
  letzter: boolean
  /** Der Reisende ist gerade hier. */
  aktiv: boolean
  /** Schon durchlaufen — liegt hinter ihm. */
  besucht: boolean
  /** Kurzfassung rechts in der Kopfzeile: "428 m Bahnsteig", "126 m". */
  rechts: string
  /** Der Ebenenwechsel, über den der Weg auf diesen Besuch kam. */
  wechselVorher?: SchemaWechsel
  /** Der Ebenenwechsel zum NÄCHSTEN Band; fehlt beim letzten. */
  wechselNachher?: SchemaWechsel
  /** Die Daten dieses Besuchs, für das Bild. */
  ebene: SchemaEbene
}

export interface Bandmodell {
  baender: Band[]
  /** Wie alle Bänder liegen: Anfang des Ankunftsbahnsteigs links. */
  lage: Bildlage
  /** Was das Bild NICHT belegt — gehört sichtbar an die Darstellung. */
  vorbehalte: string[]
  /** Winkel zwischen Ankunfts- und Abfahrtsebene, wenn er nennenswert ist. */
  kreuzungswinkelGrad?: number
}

const WECHSEL_NAME: Record<string, string> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  aufzug: 'Aufzug',
  rampe: 'Rampe',
}

export function wechselName(typ: KantenTyp): string {
  return WECHSEL_NAME[typ] ?? typ
}

/** "Treppe hinunter", "Aufzug hinauf" — die Anweisung, nicht nur das Ding. */
export function wechselAnweisung(w: SchemaWechsel): string {
  return `${wechselName(w.typ)} ${w.nachLevel < w.vonLevel ? 'hinunter' : 'hinauf'}`
}

/**
 * Die Ebene als Zahl mit Vorzeichen: „−2", „+1", „0", „−0,3".
 *
 * U+2212 statt Bindestrich — der Entwurf schreibt „EBENE −2". Zwischenebenen
 * (OSM `level=-0.3`) mit Komma, wie überall in der App.
 */
export function ebenenZahl(level: number): string {
  if (level === 0) return '0'
  const betrag = Math.abs(level)
  const zahl = Number.isInteger(betrag) ? String(betrag) : betrag.toFixed(1).replace('.', ',')
  return level > 0 ? `+${zahl}` : `−${zahl}`
}

export function ebenenLabel(level: number): string {
  return `EBENE ${ebenenZahl(level)}`
}

/**
 * Auf welcher Ebene Ankunfts- und Abfahrtsgleis liegen – für die Karten der
 * Übersicht.
 *
 * Der erste Besuch ist das Ankunftsgleis, der letzte das Abfahrtsgleis; so
 * vergibt das Backend `rolle`. Im Standardmodell (Stufe 3) sind die Ebenen
 * geraten – dort zeichnet die Wegseite das Ersatzbild, und hier steht
 * dieselbe Antwort: keine Angabe statt einer geratenen.
 */
export function gleisEbenen(route: RouteErgebnis): { an: number; ab: number } | undefined {
  const ebenen = route.schema?.ebenen
  if (route.stufe === 3 || !ebenen || ebenen.length === 0) return undefined
  return { an: ebenen[0].level, ab: ebenen[ebenen.length - 1].level }
}

/** Länge eines Linienzugs in Metern — die Punkte stehen in Metern. */
export function wegLaengeM(punkte: { x: number; y: number }[] | undefined): number {
  if (!punkte || punkte.length < 2) return 0
  let summe = 0
  for (let i = 1; i < punkte.length; i++) {
    summe += Math.hypot(punkte[i].x - punkte[i - 1].x, punkte[i].y - punkte[i - 1].y)
  }
  return Math.round(summe)
}

/**
 * Zu welchem BESUCH gehört jeder Schritt?
 *
 * Schritte und Ebenenbesuche stehen beide in der Reihenfolge des Wegs. Ein
 * neuer Besuch beginnt genau dort, wo sich `level` ändert — also bilden die
 * Läufe gleicher Ebene in der Schrittliste die Besuche ab, eins zu eins.
 * Nachgemessen an Berlin Hbf (fünf Läufe, fünf Besuche) und an Leipzig ab
 * Bahnsteiganfang (1 → 0 → 1, drei Läufe, drei Besuche). Die Simulation
 * prüft die Zusicherung über alle abgelegten Bahnhöfe.
 *
 * Über den `level` allein ginge es NICHT: Er kommt mehrfach vor, und ein
 * `find` fände den falschen Besuch.
 */
export function besuchJeSchritt(schritte: Schritt[]): number[] {
  const zuordnung: number[] = []
  let lauf = -1
  let letztes: number | undefined
  for (const schritt of schritte) {
    if (schritt.level !== undefined && schritt.level !== letztes) {
      lauf += 1
      letztes = schritt.level
    }
    // Schritte vor dem ersten mit Ebenenangabe gehören zum ersten Besuch.
    zuordnung.push(Math.max(0, lauf))
  }
  return zuordnung
}

/**
 * Der Ebenenwechsel zwischen Besuch `i` und `i + 1`.
 *
 * `schema.wechsel` steht in der Reihenfolge des Wegs und hat genau einen
 * Eintrag je Übergang — dann passt der Index. Stimmen die Zahlen nicht
 * überein (ältere Antwort, unerwarteter Graph), wird über das Ebenenpaar
 * gesucht statt geraten; findet sich nichts, bleibt der Übergang unbenannt.
 * Einen Typ zu erfinden wäre schlechter als keiner: „Rolltreppe" an einer
 * Treppe schickt jemanden mit Koffer die Stufen hinauf.
 */
function wechselZwischen(schema: BahnhofSchema, i: number): SchemaWechsel | undefined {
  if (i < 0 || i >= schema.ebenen.length - 1) return undefined
  if (schema.wechsel.length === schema.ebenen.length - 1) return schema.wechsel[i]
  const von = schema.ebenen[i].level
  const nach = schema.ebenen[i + 1].level
  return schema.wechsel.find((w) => w.vonLevel === von && w.nachLevel === nach)
}

/**
 * Welcher Bahnsteig zählt auf DIESEM Besuch?
 *
 * Beim ersten der Ankunftsbahnsteig, beim letzten der Abfahrtsbahnsteig.
 * Liegen beide auf derselben Ebene (Leipzig: Ebene 1 zweimal besucht), trägt
 * JEDER Besuch beide – ein `find` nach irgendeiner Rolle gäbe auf dem zweiten
 * Besuch den Ankunftsbahnsteig zurück, und die Fußzeile nennte den Abgang
 * vom falschen Gleis.
 */
export function massgeblicherBahnsteig(
  ebene: SchemaEbene,
  erster: boolean,
  letzter: boolean,
): SchemaBahnsteig | undefined {
  const start = ebene.bahnsteige.find((b) => b.rolle === 'start')
  const ziel = ebene.bahnsteige.find((b) => b.rolle === 'ziel')
  if (erster && start) return start
  if (letzter && ziel) return ziel
  return ziel ?? start
}

/** Die Kurzfassung rechts in der Kopfzeile eines Bandes. */
function rechtsText(ebene: SchemaEbene, erster: boolean, letzter: boolean): string {
  if (ebene.art === 'gleise') {
    const wichtig = massgeblicherBahnsteig(ebene, erster, letzter) ?? ebene.bahnsteige[0]
    if (wichtig?.laengeM !== undefined) return `${wichtig.laengeM} m Bahnsteig`
    if (wichtig) return 'Länge unbekannt'
    return `${ebene.bahnsteige.length} Bahnsteige`
  }
  const meter = wegLaengeM(ebene.weg)
  return meter > 0 ? `${meter} m` : 'Übergang'
}

/**
 * Baut das Bild-Modell aus der Antwort.
 *
 * `null`, wenn die Antwort kein `schema` trägt — ältere Antworten und das
 * Standardmodell. Dann zeichnet die alte Ableitung aus den Schritttexten
 * weiter; ein leeres Bild wäre schlechter als ein grobes.
 */
export function baueBandmodell(
  schema: BahnhofSchema | undefined,
  schritte: Schritt[],
  position: number,
): Bandmodell | null {
  if (!schema || schema.ebenen.length === 0) return null

  const zuordnung = besuchJeSchritt(schritte)
  const roh = zuordnung[Math.min(Math.max(position, 0), zuordnung.length - 1)] ?? 0
  const aktiverBesuch = Math.min(roh, schema.ebenen.length - 1)
  const letzterIndex = schema.ebenen.length - 1

  const baender: Band[] = schema.ebenen.map((ebene, i) => {
    const wechselVorher = wechselZwischen(schema, i - 1)
    const wechselNachher = wechselZwischen(schema, i)
    return {
      nr: i,
      level: ebene.level,
      label: ebenenLabel(ebene.level),
      art: ebene.art,
      ...(ebene.rolle ? { rolle: ebene.rolle } : {}),
      erster: i === 0,
      letzter: i === letzterIndex,
      aktiv: i === aktiverBesuch,
      besucht: i < aktiverBesuch,
      rechts: rechtsText(ebene, i === 0, i === letzterIndex),
      ...(wechselVorher ? { wechselVorher } : {}),
      ...(wechselNachher ? { wechselNachher } : {}),
      ebene,
    }
  })

  return {
    baender,
    lage: bildlageFuer(schema.ebenen),
    vorbehalte: schema.vorbehalte ?? [],
    // Unter 20° ist die Drehung kleiner als das, was ein Bild ohnehin
    // abstrahiert — sie zu nennen wäre Lärm.
    ...(schema.kreuzungswinkelGrad !== undefined && schema.kreuzungswinkelGrad > 20
      ? { kreuzungswinkelGrad: schema.kreuzungswinkelGrad }
      : {}),
  }
}
