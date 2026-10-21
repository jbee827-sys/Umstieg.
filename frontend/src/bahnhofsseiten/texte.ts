import type { Anlage, Gleispaar, Lage } from './typen'

/** Aufgerundet - wer 61 Sekunden braucht, braucht nicht „1 min". */
export function minuten(sek: number): number {
  return Math.max(1, Math.ceil(sek / 60))
}

export function gehzeitText(p: Gleispaar): string {
  if (p.gleicherBahnsteig) return 'Gleicher Bahnsteig'
  if (p.sek === null) return 'kein Weg im Plan'
  return `${minuten(p.sek)} min`
}

const ANLAGE: Record<Anlage, string> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  aufzug: 'Aufzug',
  rampe: 'Rampe',
}

const LAGE: Record<Lage, string> = {
  ebenerdig: 'ebenerdig',
  unterfuehrung: 'Unterführung',
  ueberfuehrung: 'Überführung',
  'nach-unten': 'nach unten',
  'nach-oben': 'nach oben',
}

/** „Treppe, Unterführung" - die Anlagen in Wegreihenfolge, dann die Lage. */
export function wegText(p: Gleispaar): string {
  if (p.gleicherBahnsteig) return 'über den Bahnsteig'
  if (p.sek === null) return '–'
  const teile = p.anlagen.map((a) => ANLAGE[a])
  if (p.lage !== 'ebenerdig' || teile.length === 0) teile.push(LAGE[p.lage])
  return teile.join(', ')
}

export function stufenfreiText(p: Gleispaar): string {
  if (p.gleicherBahnsteig) return 'ja'
  if (p.stufenfreiSek === null) return 'nicht möglich'
  return `${minuten(p.stufenfreiSek)} min`
}

/**
 * Titel im Suchergebnis (Konzept 4.2). Google kuerzt ab etwa 60 Zeichen;
 * bei langen Namen wird der Zusatz kuerzer, bei sehr langen entfaellt er.
 *
 * Das Konzept setzt die Grenze bei 25 Zeichen Name. Gemessen wird hier am
 * fertigen Titel: „Berlin Frankfurter Allee" (24 Zeichen) ergaebe mit dem
 * langen Zusatz genau 65 Zeichen.
 */
const TITEL_GRENZE = 65

export function titelFuer(name: string): string {
  const lang = `Umsteigen in ${name}: Gehzeit von Gleis zu Gleis`
  if (lang.length < TITEL_GRENZE) return lang
  const kurz = `Umsteigen in ${name}: Gehzeit je Gleis`
  return kurz.length < TITEL_GRENZE ? kurz : `Umsteigen in ${name}`
}

export function beschreibungFuer(name: string): string {
  return `Wie lange dauert der Umstieg in ${name}? Gehzeiten für alle Gleispaare, mit Treppen, Aufzügen und Ebenen. Kostenlos und ohne Anmeldung.`
}

/** „13.10.2026" - deutsche Ortszeit, wie ueberall in der App. */
export function standText(geholtAm: string): string {
  return new Date(geholtAm).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })
}

/** Die laengsten Umstiege mit bekanntem Weg, laengster zuerst - ohne die am gleichen Bahnsteig. */
export function laengsteUmstiege(paare: Gleispaar[], anzahl: number): Gleispaar[] {
  return paare
    .filter((p) => p.sek !== null && !p.gleicherBahnsteig)
    .sort((a, b) => b.sek! - a.sek!)
    .slice(0, anzahl)
}

const GRUNDBUCHSTABE: Record<string, string> = { Ä: 'A', Ö: 'O', Ü: 'U' }

/** Nach deutschem Alphabet sortiert, Umlaute beim Grundbuchstaben. */
export function gruppiereNachBuchstabe<T>(
  eintraege: T[],
  name: (t: T) => string = (t) => String(t),
): [string, T[]][] {
  const sortiert = [...eintraege].sort((a, b) => name(a).localeCompare(name(b), 'de'))
  const gruppen = new Map<string, T[]>()
  for (const e of sortiert) {
    const erster = name(e).charAt(0).toUpperCase()
    const buchstabe = GRUNDBUCHSTABE[erster] ?? erster
    if (!gruppen.has(buchstabe)) gruppen.set(buchstabe, [])
    gruppen.get(buchstabe)!.push(e)
  }
  return [...gruppen.entries()]
}
