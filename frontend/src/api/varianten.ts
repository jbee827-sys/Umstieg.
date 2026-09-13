import type { RouteErgebnis, RouteParameter, RoutenVariante } from './typen'

/** Angebotene Varianten in der Reihenfolge des Entwurfs. */
export const ANGEBOTENE: RoutenVariante[] = ['schnellste', 'barrierefrei', 'mit-stopp']

/**
 * Welche Variante zuerst geladen wird.
 *
 * Bis zum 07.09.2026 stand diese Entscheidung als Aufzaehlung in `App.tsx`
 * neben der Liste oben - und war seit dem 05.09. falsch, weil 'mit-stopp'
 * nur der Liste beitrat, nicht der Aufzaehlung. Die Wahl des Nutzers fiel
 * still auf 'schnellste' zurueck.
 *
 * Jetzt entscheidet die angebotene Liste selbst. Eine neue Variante
 * einzutragen reicht damit aus; es gibt keine zweite Stelle mehr, die
 * vergessen werden kann.
 */
export function ersteVariante(gewuenscht: RoutenVariante): RoutenVariante {
  return ANGEBOTENE.includes(gewuenscht) ? gewuenscht : 'schnellste'
}

type Basis = Omit<RouteParameter, 'variante'>
type HoleFn = (p: RouteParameter) => Promise<RouteErgebnis>

/**
 * Die uebrigen Varianten, der Reihe nach, aus derselben Basis.
 *
 * Eigene Funktion, seit es einen ZWEITEN Anlass gibt, sie zu holen: Wechselt
 * der Standort am Ankunftsgleis, gelten die Minuten an den Variantenknoepfen
 * nicht mehr - sie waren fuer den alten Standort gerechnet.
 */
export async function ladeWeitereVarianten(
  basis: Basis,
  gewaehlt: RoutenVariante,
  hole: HoleFn,
  beiWert: (variante: RoutenVariante, gehzeitSek: number) => void,
  /** Was schon im Gehzeit-Speicher liegt, wird nicht zweimal geholt. */
  schonBekannt: (variante: RoutenVariante) => boolean = () => false,
): Promise<void> {
  for (const weitere of ANGEBOTENE.filter((v) => v !== gewaehlt && !schonBekannt(v))) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Nacheinander ist hier der ZWECK, nicht das Versehen: Promise.all waere genau der Fehler, den der Kommentar an `ladeVarianten` beschreibt.
      const andere = await hole({ ...basis, variante: weitere })
      beiWert(weitere, andere.gehzeitSek)
    } catch {
      // Kein Fehler fuer den Nutzer: Der Knopf zeigt dann keine Minuten.
      // 'barrierefrei' antwortet regelmaessig mit 404, wenn es keinen
      // nutzbaren Aufzug gibt - und 'mit-stopp', wenn der Bahnhof weder WC
      // noch Kiosk kartiert hat.
    }
  }
}

/**
 * Laedt die Routenvarianten NACHEINANDER, nicht gleichzeitig.
 *
 * Urspruenglich war das ein Notbehelf: Zwei gleichzeitige Anfragen fuer
 * denselben Bahnhof fanden beide den Graph-Cache leer und fragten Overpass
 * doppelt - am 31.08.2026 gemessen 24 s und 61 s statt 2 s. Das ist seit dem
 * 01.09.2026 im Backend behoben (gebuendelte Graphbauten in `routes/api.ts`);
 * gleichzeitig waere jetzt gefahrlos.
 *
 * Geblieben ist es trotzdem, aus einem eigenen Grund: Die gewaehlte Variante
 * kommt zuerst, und sobald sie da ist, kann das Dashboard stehen. Die zweite
 * liefert nur noch die Minutenangabe fuer ihren Knopf; faellt sie aus, bleibt
 * der Knopf ohne Minuten - das ist kein Fehler. Gleichzeitiges Laden wuerde
 * daran nichts beschleunigen, nur die Nebensache frueher liefern.
 */
export async function ladeVarianten(
  basis: Basis,
  gewaehlt: RoutenVariante,
  hole: HoleFn,
  beiHaupt: (route: RouteErgebnis) => void,
  beiZweit: (variante: RoutenVariante, gehzeitSek: number) => void,
): Promise<void> {
  const haupt = await hole({ ...basis, variante: gewaehlt })
  beiHaupt(haupt)

  // Die uebrigen der Reihe nach, aus demselben Grund wie oben: Jede weitere
  // gleichzeitige Anfrage waere eine, die auf denselben Bahnhof wartet.
  await ladeWeitereVarianten(basis, gewaehlt, hole, beiZweit)
}
