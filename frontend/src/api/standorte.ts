import type {
  Bahnsteigabschnitt,
  RouteErgebnis,
  RouteParameter,
  RoutenVariante,
} from './typen'

/**
 * Wo am Ankunftsgleis jemand steht - in der Reihenfolge des Bahnsteigs.
 *
 * Der Entwurf („Kopfbahnhof"-Artboard) zeigt drei Knoepfe, und das ist keine
 * Bequemlichkeit: An Leipzig Hbf, Gleis 6 nach 16, gewinnt vom Anfang aus die
 * Unterfuehrung (343 s), von der Mitte und vom Ende aus die U-Form ueber den
 * Bahnhofskopf (354 s bzw. 251 s). Derselbe Umstieg, drei Wege, 100 s
 * Unterschied. Solange die Wagenreihung tot ist, ist diese Wahl die einzige
 * Eingabe, die den Weg kennt.
 */
export const ABSCHNITTE: Bahnsteigabschnitt[] = ['anfang', 'mitte', 'ende']

export const ABSCHNITT_NAMEN: Record<Bahnsteigabschnitt, string> = {
  anfang: 'Anfang',
  mitte: 'Mitte',
  ende: 'Ende',
}

/**
 * Voreinstellung. Die Mitte ist die ehrlichste Annahme ohne Wagenreihung -
 * und dieselbe, die das Backend nimmt, wenn `abschnitt` fehlt.
 */
export const STANDORT_VOREINSTELLUNG: Bahnsteigabschnitt = 'mitte'

/**
 * Schluessel im Gehzeit-Speicher.
 *
 * BEIDE Achsen gehoeren hinein. Eine Gehzeit gilt fuer genau eine Variante an
 * genau einem Standort; sie nur nach der Variante abzulegen hiesse, nach dem
 * Wechsel des Standorts alte Minuten an neuen Knoepfen zu zeigen.
 */
export function gehzeitSchluessel(
  variante: RoutenVariante,
  abschnitt: Bahnsteigabschnitt,
): string {
  return `${variante}|${abschnitt}`
}

type Basis = Omit<RouteParameter, 'variante' | 'abschnitt'>
type HoleFn = (p: RouteParameter) => Promise<RouteErgebnis>

/**
 * Die uebrigen Standorte am selben Gleis, mit derselben Variante.
 *
 * Nacheinander, aus demselben Grund wie bei den Varianten (siehe
 * `ladeVarianten`): Jede gleichzeitige Anfrage waere eine, die auf denselben
 * Bahnhof wartet. Faellt eine aus, bleibt ihr Knopf ohne Minuten - das ist
 * kein Fehler, sondern die Regel dieser App: lieber keine Zahl als eine
 * geratene.
 */
export async function ladeStandorte(
  basis: Basis,
  variante: RoutenVariante,
  gewaehlt: Bahnsteigabschnitt,
  hole: HoleFn,
  beiWert: (abschnitt: Bahnsteigabschnitt, gehzeitSek: number) => void,
  /**
   * Was bereits im Gehzeit-Speicher liegt, wird nicht zweimal geholt. Wer
   * zwischen zwei Standorten hin und her tippt, loest sonst bei jedem Tipp
   * dieselben zwei Anfragen aus - im Bahnhof, ueber Mobilfunk.
   */
  schonBekannt: (abschnitt: Bahnsteigabschnitt) => boolean = () => false,
): Promise<void> {
  for (const weiterer of ABSCHNITTE.filter((a) => a !== gewaehlt && !schonBekannt(a))) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Nacheinander ist der ZWECK, siehe Kopfkommentar.
      const andere = await hole({ ...basis, variante, abschnitt: weiterer })
      beiWert(weiterer, andere.gehzeitSek)
    } catch {
      // Kein Fehler fuer den Nutzer - der Knopf zeigt dann keine Minuten.
    }
  }
}
