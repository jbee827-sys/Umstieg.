import type { TafelEintrag } from './typen'

/**
 * Die Auswahlliste zeigte alles, was die Tafel hergab - in Berlin Hbf ueber
 * die drei Verkehrsstellen mehr als hundert Zuege. Das Zeichnen dauerte
 * laenger als 30 Sekunden, und auf dem Handy war die Liste unbenutzbar.
 *
 * Zwei Griffe: ein Zeitfenster um jetzt, und vier Kategorien statt einer
 * Bandwurmliste.
 */

/** Wer gerade weg ist, ist meist noch da - fuenf Minuten Nachlauf. */
export const FENSTER_VOR_MIN = 5
/** Weiter voraus zu planen ist Sache des Fahrplans, nicht des Umstiegs. */
export const FENSTER_NACH_MIN = 45

/**
 * Ende der NAECHSTEN vollen Stunde: 14:20 -> 16:00.
 *
 * So weit reicht, was das Backend ohnehin holt - die laufende und die
 * naechste Stunde (`backend/src/clients/timetables.ts`). Im breiten Layout
 * plant man im Zug vorab; dort reicht das kurze Fenster nicht.
 */
export function endeNaechsteStunde(jetzt: Date): Date {
  const ende = new Date(jetzt)
  ende.setHours(jetzt.getHours() + 2, 0, 0, 0)
  return ende
}

export type Zugkategorie = 'regional' | 'fern' | 'sbahn' | 'ubahn'

export interface Kategorieblock {
  kategorie: Zugkategorie
  titel: string
  eintraege: TafelEintrag[]
}

/** Reihenfolge der Bloecke - fest, damit die Liste nicht bei jedem Poll springt. */
const REIHENFOLGE: { kategorie: Zugkategorie; titel: string }[] = [
  { kategorie: 'regional', titel: 'Regionalverkehr' },
  { kategorie: 'fern', titel: 'Fernverkehr' },
  { kategorie: 'sbahn', titel: 'S-Bahn' },
  { kategorie: 'ubahn', titel: 'U-Bahn' },
]

/**
 * Fernverkehrsgattungen sind eine geschlossene, kurze Liste. Die der
 * Regionalbetreiber ist es nicht: OE, NEB, ODEG, ERB, WFB, VIA ... Eine
 * Whitelist dafuer waere immer lueckenhaft, und ein danebenliegender Zug
 * verschwaende in einer Kategorie "Sonstige", die dem Reisenden nichts sagt.
 * Deshalb ist Regionalverkehr die Restklasse.
 */
const FERNVERKEHR = new Set([
  'ICE', 'IC', 'EC', 'ECE', 'IR', 'ICN',
  'RJ', 'RJX', 'NJ', 'EN', 'D', 'TGV', 'THA', 'FLX',
])

/** "ICE 1006" -> "ICE"; ohne Leerzeichen bleibt die ganze Bezeichnung. */
function gattung(zug: string): string {
  return zug.trim().split(/\s+/)[0].toUpperCase()
}

export function kategorieVon(zug: string): Zugkategorie {
  const g = gattung(zug)
  if (g === 'S') return 'sbahn'
  if (g === 'U') return 'ubahn'
  if (FERNVERKEHR.has(g)) return 'fern'
  return 'regional'
}

/** "14:26" -> Minuten seit Mitternacht; unlesbares gibt null. */
function minutenSeitMitternacht(hhmm: string): number | null {
  const treffer = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!treffer) return null
  return Number(treffer[1]) * 60 + Number(treffer[2])
}

/**
 * Abstand in Minuten, vorzeichenbehaftet, ueber Mitternacht hinweg.
 *
 * Die Tafel fuehrt nur "HH:MM" ohne Datum. Um 23:50 ist "00:20" nicht
 * dreiundzwanzigeinhalb Stunden zurueck, sondern dreissig Minuten voraus -
 * ohne diese Faltung faellt der halbe Nachtverkehr aus der Liste.
 */
function abstandMinuten(zeit: string, jetztMinuten: number): number | null {
  const t = minutenSeitMitternacht(zeit)
  if (t === null) return null
  let delta = t - jetztMinuten
  const TAG = 24 * 60
  if (delta > TAG / 2) delta -= TAG
  if (delta <= -TAG / 2) delta += TAG
  return delta
}

/** Die Zeit, die zaehlt: die wirkliche, nicht die geplante. */
function effektiveZeit(eintrag: TafelEintrag): string {
  return eintrag.zeitIst ?? eintrag.zeitSoll
}

/**
 * Filtert die Tafel auf das Zeitfenster um `jetzt` und gruppiert sie in
 * Kategorien. Leere Kategorien fallen weg, jede ist nach Zeit sortiert.
 */
export function gruppiereTafel(
  eintraege: TafelEintrag[],
  jetzt: Date,
  /** Fensterende; ohne Angabe die 45 Minuten des Handys. */
  bis?: Date,
): Kategorieblock[] {
  const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes()
  const nachMin = bis ? Math.round((bis.getTime() - jetzt.getTime()) / 60_000) : FENSTER_NACH_MIN

  const imFenster: { eintrag: TafelEintrag; abstand: number }[] = []
  for (const eintrag of eintraege) {
    const abstand = abstandMinuten(effektiveZeit(eintrag), jetztMinuten)
    if (abstand === null) continue
    if (abstand < -FENSTER_VOR_MIN || abstand > nachMin) continue
    imFenster.push({ eintrag, abstand })
  }
  // Nach Abstand sortieren, nicht nach der Zeichenkette: ueber Mitternacht
  // stuende "00:20" sonst vor "23:47".
  imFenster.sort((a, b) => a.abstand - b.abstand)

  const bloecke: Kategorieblock[] = []
  for (const { kategorie, titel } of REIHENFOLGE) {
    const eigene = imFenster
      .filter((x) => kategorieVon(x.eintrag.zug) === kategorie)
      .map((x) => x.eintrag)
    if (eigene.length > 0) bloecke.push({ kategorie, titel, eintraege: eigene })
  }
  return bloecke
}
