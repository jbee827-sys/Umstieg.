import type { EingabeWerte } from '../components/Eingabe'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'

/**
 * Eine neu gerechnete Route samt der Eingabewerte, aus denen sie entstand.
 * Wohnte bis zum 03.09.2026 in `screens/Stoerung.tsx` - dort war sie der
 * einzige Zustand. Jetzt haengt sie an einer Meldung, und es kann mehrere
 * geben.
 */
export interface Vorschlag {
  route: RouteErgebnis
  werte: EingabeWerte
  anlass: LiveEreignis
}

export interface Meldung {
  /** Fortlaufend, damit die Route nachgetragen werden kann. Nie doppelt. */
  nr: number
  ereignis: LiveEreignis
  /**
   * Die neu gerechnete Route - oder `null`, solange sie noch laeuft oder
   * fehlgeschlagen ist. Ohne Vorschlag bleibt die Meldung eine Meldung: Der
   * Reisende erfaehrt vom Wechsel, nur uebernehmen kann er nichts.
   */
  vorschlag: Vorschlag | null
  gelesen: boolean
  /**
   * Die Route dieser Meldung ist die aktive. Danach ist „Route uebernehmen"
   * ein Knopf, der nichts mehr tut - und der waere schlimmer als keiner.
   */
  uebernommen: boolean
}

/**
 * Neueste Meldung nach vorn. Die Nummer zaehlt von der bisher hoechsten
 * hoch - `liste.length` genuegt nicht, wenn spaeter einmal etwas aus der
 * Liste faellt.
 */
export function ergaenze(liste: Meldung[], ereignis: LiveEreignis, vorschlag: Vorschlag | null = null): Meldung[] {
  const hoechste = liste.reduce((max, m) => Math.max(max, m.nr), 0)
  return [{ nr: hoechste + 1, ereignis, vorschlag, gelesen: false, uebernommen: false }, ...liste]
}

export function ungelesen(liste: Meldung[]): number {
  return liste.filter((m) => !m.gelesen).length
}

/**
 * Gibt die **unveraenderte** Liste zurueck, wenn nichts ungelesen war. Das
 * ist keine Sparmassnahme: Der Aufruf haengt in einem Effect, der auf die
 * Liste selbst hoert. Eine jedesmal frische Liste liefe endlos.
 */
export function alleGelesen(liste: Meldung[]): Meldung[] {
  if (ungelesen(liste) === 0) return liste
  return liste.map((m) => (m.gelesen ? m : { ...m, gelesen: true }))
}

/** Haelt fest, dass die Route dieser Meldung uebernommen wurde. */
export function markiereUebernommen(liste: Meldung[], nr: number): Meldung[] {
  if (!liste.some((m) => m.nr === nr)) return liste
  return liste.map((m) => (m.nr === nr ? { ...m, uebernommen: true } : m))
}

/** Traegt die nachgerechnete Route an einer Meldung nach. Reihenfolge und Gelesen-Stand bleiben. */
export function setzeVorschlag(liste: Meldung[], nr: number, vorschlag: Vorschlag | null): Meldung[] {
  if (!liste.some((m) => m.nr === nr)) return liste
  return liste.map((m) => (m.nr === nr ? { ...m, vorschlag } : m))
}

/**
 * Gab es auf dieser Reise ueberhaupt Meldungen? Gilt bis „Angekommen" und
 * traegt die leise Hervorhebung in der Leiste, wenn das Abzeichen mit dem
 * Lesen weggefallen ist. Eigene Funktion, weil das die Regel ist und nicht
 * nur eine Laengenpruefung: „Es gab welche" bleibt wahr, auch wenn nichts
 * mehr ungelesen ist.
 */
export function hervorgehoben(liste: Meldung[]): boolean {
  return liste.length > 0
}
