import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'

/**
 * Reise-Import: den Zug aus dem Reisetext in der Tafel wiederfinden.
 *
 * Der DB Navigator schreibt „S6“, „RE3 (3352)“ oder „ICE 1134“, die VBB-App
 * „RE3“. Die Tafel fuehrt denselben Zug als „S 38617“ (Linie „S 6“),
 * „RE 3352“ (Linie „RE 3“) und „ICE 1134“. Live-Ueberwachung und die
 * Zuordnung „Ankunftszug oder Anschluss“ vergleichen den Namen der Tafel
 * woertlich - mit dem Namen aus dem Text kam bis zum 22.11.2026 keine einzige
 * Live-Meldung an (ausser beim Fernverkehr, der die Nummer in beiden nennt).
 */

/** "ICE 1006" → "1006", "RE3 (3352)" → "3352". */
export function zugnummer(zug: string): string | undefined {
  const letztes = zug.split(' ').pop() || undefined
  if (!letztes) return undefined
  // Geteilte Reisetexte schreiben die Nummer in Klammern hinter die Linie;
  // die Wagenreihung braucht die blanke Zahl.
  const inKlammern = /^\((\d+)\)$/.exec(letztes)
  return inKlammern ? inKlammern[1] : letztes
}

const kompakt = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/** "9:46" → "09:46" - die Tafel schreibt immer zwei Stellen. */
function zweistellig(zeit: string): string {
  const [h, m] = zeit.trim().split(':')
  return `${h.padStart(2, '0')}:${m}`
}

/** Passt die Bezeichnung aus dem Text auf diesen Tafeleintrag? */
function passt(name: string, eintrag: TafelEintrag): boolean {
  const klammer = /^(.*?)\s*\((\d+)\)\s*$/.exec(name)
  // Die Zugnummer in Klammern ist das sicherste Merkmal - sie ist eindeutig.
  if (klammer && zugnummer(eintrag.zug) === klammer[2]) return true
  const linie = kompakt(klammer ? klammer[1] : name)
  return linie === kompakt(eintrag.zug) || (eintrag.anzeige !== undefined && linie === kompakt(eintrag.anzeige))
}

/**
 * Der eine Tafeleintrag mit derselben Sollzeit und passender Bezeichnung.
 * Passen mehrere (Fluegelzug, zwei Teile unter einer Linie), gilt keiner: Ein
 * falscher Zug gaebe falsche Live-Meldungen - schlimmer als keine.
 */
export function findeZug(name: string, zeit: string, tafel: TafelEintrag[]): TafelEintrag | null {
  const soll = zweistellig(zeit)
  const treffer = tafel.filter((e) => e.zeitSoll === soll && passt(name, e))
  return treffer.length === 1 ? treffer[0] : null
}

export interface ZugAusText {
  name: string
  zeit: string
}

/**
 * Beide Zuege des Umstiegs in den Tafeln des Bahnhofs suchen: den
 * Ankunftszug in der Ankunfts-, den Anschluss in der Abfahrtstafel. Die Tafel
 * reicht etwa zwei Stunden voraus - spaetere Zuege finden sich erst spaeter
 * (`App` versucht es waehrend der Reise erneut). Wirft nie.
 */
export async function gleicheZuegeAb(
  eva: string,
  an: ZugAusText | undefined,
  ab: ZugAusText | undefined,
): Promise<{ an?: TafelEintrag; ab?: TafelEintrag }> {
  const suche = async (zug: ZugAusText | undefined, typ: 'arr' | 'dep') => {
    if (!zug) return undefined
    try {
      const tafel = await holeTafel(eva, typ)
      return tafel.ok ? (findeZug(zug.name, zug.zeit, tafel.eintraege) ?? undefined) : undefined
    } catch {
      return undefined
    }
  }
  const [anTreffer, abTreffer] = await Promise.all([suche(an, 'arr'), suche(ab, 'dep')])
  return { ...(anTreffer ? { an: anTreffer } : {}), ...(abTreffer ? { ab: abTreffer } : {}) }
}
