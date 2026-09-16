import type {
  BahnhofSchema,
  Bahnsteigabschnitt,
  Himmelsrichtung,
  RouteErgebnis,
  RouteParameter,
  RoutenVariante,
  SchemaBahnsteig,
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

const ENDE_NACH_RICHTUNG: Record<Himmelsrichtung, string> = {
  N: 'Nordende',
  O: 'Ostende',
  S: 'Südende',
  W: 'Westende',
}

/**
 * Wie die drei Stellen am Ankunftsgleis heissen.
 *
 * Seit dem 15.09.2026 ist der Anfang das Nord- bzw. Westende (ToDo 31), und
 * die Knoepfe sagen es: „Nordende · Mitte · Südende". „Anfang" allein hiess
 * nichts - welches Ende das im Bahnhof ist, stand nirgends, und in OSM war es
 * das zufaellig zuerst gezeichnete. Ohne gemessene Achse (Standardmodell)
 * bleibt es bei Anfang und Ende: Dort waere eine Himmelsrichtung erfunden.
 */
export function standortNamen(
  richtung?: SchemaBahnsteig['himmelsrichtung'],
): Record<Bahnsteigabschnitt, string> {
  if (!richtung) return ABSCHNITT_NAMEN
  return {
    anfang: ENDE_NACH_RICHTUNG[richtung.von],
    mitte: ABSCHNITT_NAMEN.mitte,
    ende: ENDE_NACH_RICHTUNG[richtung.bis],
  }
}

/** Die Himmelsrichtung des Ankunftsbahnsteigs, wenn das Schema sie kennt. */
export function ankunftsRichtung(
  schema: BahnhofSchema | undefined,
): SchemaBahnsteig['himmelsrichtung'] {
  for (const ebene of schema?.ebenen ?? []) {
    const start = ebene.bahnsteige.find((b) => b.rolle === 'start')
    if (start) return start.himmelsrichtung
  }
  return undefined
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
