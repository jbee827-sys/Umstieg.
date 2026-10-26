import { minuten } from './texte'
import type { Anlage, Bahnhofsdaten, Gleispaar, Lage } from './typen'

/**
 * Eigener Text je Bahnhof (26.10.2026): Bis dahin unterschieden sich die
 * Bahnhofsseiten nur in Zahlen und Gleisnummern, und Google liess 310 von
 * 377 als „Gefunden – zurzeit nicht indexiert“ liegen. Jeder Satz hier
 * entsteht allein aus dem Bahnhofsplan und sagt nur, was der Plan traegt -
 * „kennt keinen stufenfreien Weg“, nicht „hat keinen Aufzug“.
 */

/** Paare mit bekanntem Weg; die Seiten bekommen sie schon ohne Luecken, die Tests nicht immer. */
function mitWeg(d: Bahnhofsdaten): Gleispaar[] {
  return d.paare.filter((p) => p.sek !== null)
}

function zwischenBahnsteigen(d: Bahnhofsdaten): Gleispaar[] {
  return mitWeg(d).filter((p) => !p.gleicherBahnsteig)
}

/** Gleise am gleichen Bahnsteig, zusammengefasst - Reihenfolge wie in `d.gleise`. */
export function bahnsteige(d: Bahnhofsdaten): string[][] {
  const wurzel = new Map(d.gleise.map((g) => [g, g]))
  const finde = (g: string): string => {
    const w = wurzel.get(g) ?? g
    return w === g ? g : finde(w)
  }
  for (const p of d.paare) {
    if (!p.gleicherBahnsteig || !wurzel.has(p.von) || !wurzel.has(p.nach)) continue
    const a = finde(p.von)
    const b = finde(p.nach)
    if (a !== b) wurzel.set(b, a)
  }
  const gruppen = new Map<string, string[]>()
  for (const g of d.gleise) {
    const w = finde(g)
    if (!gruppen.has(w)) gruppen.set(w, [])
    gruppen.get(w)!.push(g)
  }
  return [...gruppen.values()]
}

/** „a“, „a und b“, „a, b und c“ - mit `letztes` als letztem Bindewort. */
function aufzaehlung(teile: string[], letztes = 'und'): string {
  if (teile.length <= 1) return teile.join('')
  return `${teile.slice(0, -1).join(', ')} ${letztes} ${teile[teile.length - 1]}`
}

function minutenWort(m: number): string {
  return m === 1 ? '1 Minute' : `${m} Minuten`
}

export function gleiseSatz(d: Bahnhofsdaten): string {
  const n = bahnsteige(d).length
  return `${d.name} hat ${d.gleise.length} Gleise an ${n === 1 ? 'einem Bahnsteig' : `${n} Bahnsteigen`}.`
}

/** Bis zu so vielen Bahnsteigen werden die Gleise einzeln genannt, darueber nur gezaehlt. */
const AUFZAEHLEN_BIS = 6

const UEBER_DEN_BAHNSTEIG = 'dort geht der Umstieg ohne Treppe über den Bahnsteig.'

/** Herford, Hof Hbf u. a.: mehrere Bahnsteige, aber kein Weg dazwischen im Plan. */
const KEIN_WEG_DAZWISCHEN = 'einen Weg zwischen den Bahnsteigen kennt der Bahnhofsplan nicht.'

function einBahnsteig(d: Bahnhofsdaten): boolean {
  return bahnsteige(d).length === 1
}

function bahnsteigSatz(d: Bahnhofsdaten): string | null {
  const mehrere = bahnsteige(d).filter((b) => b.length > 1)
  if (mehrere.length === 0) return null
  if (mehrere.length > AUFZAEHLEN_BIS) {
    const wie = mehrere.every((b) => b.length === 2) ? 'liegen sich zwei Gleise gegenüber' : 'liegen mehrere Gleise'
    return `An ${mehrere.length} Bahnsteigen ${wie} – ${UEBER_DEN_BAHNSTEIG}`
  }
  const genannt = mehrere.map((b) => `Gleis ${aufzaehlung(b)}`)
  return `Am selben Bahnsteig liegen ${aufzaehlung(genannt, 'sowie')} – ${UEBER_DEN_BAHNSTEIG}`
}

const LAGE: Record<Lage, string> = {
  ebenerdig: 'ebenerdig',
  unterfuehrung: 'durch eine Unterführung',
  ueberfuehrung: 'über eine Überführung',
  'nach-unten': 'über eine andere Ebene',
  'nach-oben': 'über eine andere Ebene',
}

const ANLAGEN: Record<Anlage, string> = {
  treppe: 'Treppen',
  rolltreppe: 'Rolltreppen',
  aufzug: 'Aufzügen',
  rampe: 'Rampen',
}

/** Haeufigstes zuerst; bei Gleichstand, was zuerst vorkommt. */
function nachHaeufigkeit<T>(werte: T[]): T[] {
  const zahl = new Map<T, number>()
  for (const w of werte) zahl.set(w, (zahl.get(w) ?? 0) + 1)
  return [...zahl.keys()].sort((a, b) => zahl.get(b)! - zahl.get(a)!)
}

function wegSatz(paare: Gleispaar[]): string {
  const [lage] = nachHaeufigkeit(paare.map((p) => LAGE[p.lage]))
  const anlagen = nachHaeufigkeit(paare.flatMap((p) => p.anlagen)).map((a) => ANLAGEN[a])
  const mit = anlagen.length > 0 ? `, mit ${aufzaehlung(anlagen)}` : ''
  return `Zwischen den Bahnsteigen führt der schnellste Weg meist ${lage}${mit}.`
}

/** Absatz „Der Bahnhof im Überblick“. */
export function ueberblickSaetze(d: Bahnhofsdaten): string[] {
  if (einBahnsteig(d)) return [gleiseSatz(d), 'Der Umstieg geht ohne Treppe über den Bahnsteig.']
  const zwischen = zwischenBahnsteigen(d)
  const weg = zwischen.length > 0 ? wegSatz(zwischen) : 'Einen Weg zwischen den Bahnsteigen kennt der Bahnhofsplan nicht.'
  return [gleiseSatz(d), bahnsteigSatz(d), weg].filter((s): s is string => s !== null)
}

/** Antwort auf „Wie lange dauert der Umstieg?“. */
export function dauerSatz(d: Bahnhofsdaten): string {
  const zwischen = zwischenBahnsteigen(d).map((p) => minuten(p.sek!))
  const amBahnsteig = mitWeg(d)
    .filter((p) => p.gleicherBahnsteig)
    .map((p) => minuten(p.sek!))
  // Der Hoechstwert - am Kopfbahnhof fuehrt der Weg um das Bahnsteigende (Leipzig Hbf).
  const amBahnsteigMax = Math.max(1, ...amBahnsteig)
  const amBahnsteigWort = amBahnsteigMax === 1 ? 'etwa 1 Minute' : `bis zu ${minutenWort(amBahnsteigMax)}`
  if (einBahnsteig(d)) return `Alle Gleise liegen an einem Bahnsteig, der Umstieg dauert ${amBahnsteigWort}.`
  if (zwischen.length === 0) return `Am selben Bahnsteig dauert der Umstieg ${amBahnsteigWort}; ${KEIN_WEG_DAZWISCHEN}`
  const kurz = Math.min(...zwischen)
  const lang = Math.max(...zwischen)
  const spanne = kurz === lang ? `etwa ${minutenWort(lang)}` : `${kurz} bis ${minutenWort(lang)}`
  const bahnsteig = amBahnsteig.length > 0 ? `, am selben Bahnsteig ${amBahnsteigWort}` : ''
  return `Bei normalem Gehtempo dauert ein Wechsel des Bahnsteigs ${spanne}${bahnsteig}.`
}

/** Antwort auf „Kann ich stufenfrei umsteigen?“. */
export function stufenfreiSatz(d: Bahnhofsdaten): string {
  if (einBahnsteig(d)) return 'Ja, alle Gleise liegen an einem Bahnsteig.'
  const zwischen = zwischenBahnsteigen(d)
  if (zwischen.length === 0) return `Am selben Bahnsteig ja; ${KEIN_WEG_DAZWISCHEN}`
  const ohne = zwischen.filter((p) => p.stufenfreiSek === null)
  if (ohne.length === zwischen.length) return 'Der Bahnhofsplan kennt keinen stufenfreien Weg zwischen den Bahnsteigen.'
  if (ohne.length > 0) {
    const [beispiel] = ohne
    return `Für ${ohne.length} von ${mitWeg(d).length} Umstiegen kennt der Bahnhofsplan keinen stufenfreien Weg, zum Beispiel von Gleis ${beispiel.von} nach Gleis ${beispiel.nach}.`
  }
  const umweg = Math.max(...zwischen.map((p) => minuten(p.stufenfreiSek!) - minuten(p.sek!)))
  return `Ja, laut Bahnhofsplan geht jeder Umstieg auch stufenfrei${umweg > 0 ? `, dann bis zu ${minutenWort(umweg)} länger` : ''}.`
}

export interface Frage {
  frage: string
  antwort: string
}

/** Sichtbar auf der Seite und gleichlautend als FAQPage (JSON-LD). */
export function fragen(d: Bahnhofsdaten): Frage[] {
  return [
    { frage: `Wie lange dauert der Umstieg in ${d.name}?`, antwort: dauerSatz(d) },
    { frage: `Kann ich in ${d.name} stufenfrei umsteigen?`, antwort: stufenfreiSatz(d) },
  ]
}

export function kmText(km: number): string {
  return km < 1 ? 'unter 1 km' : `${Math.round(km)} km`
}

export interface Nachbar {
  d: Bahnhofsdaten
  /** Luftlinie */
  km: number
}

/** Luftlinie nach Haversine, Erdradius 6371 km. */
function abstandKm(a: Bahnhofsdaten, b: Bahnhofsdaten): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Die naechsten Bahnhoefe mit eigener Seite - verlinkt die Seiten untereinander. */
export function naechsteBahnhoefe(d: Bahnhofsdaten, alle: Bahnhofsdaten[], anzahl: number): Nachbar[] {
  return alle
    .filter((n) => n.slug !== d.slug)
    .map((n) => ({ d: n, km: abstandKm(d, n) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, anzahl)
}
