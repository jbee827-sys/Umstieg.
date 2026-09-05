import type { RouteErgebnis, RouteParameter, RoutenVariante } from './typen'

/** Angebotene Varianten in der Reihenfolge des Entwurfs. */
export const ANGEBOTENE: RoutenVariante[] = ['schnellste', 'barrierefrei', 'mit-stopp']

type Basis = Omit<RouteParameter, 'variante'>
type HoleFn = (p: RouteParameter) => Promise<RouteErgebnis>

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
  for (const weitere of ANGEBOTENE.filter((v) => v !== gewaehlt)) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Nacheinander ist hier der ZWECK, nicht das Versehen: Promise.all waere genau der Fehler, den der Kommentar oben beschreibt.
      const andere = await hole({ ...basis, variante: weitere })
      beiZweit(weitere, andere.gehzeitSek)
    } catch {
      // Kein Fehler fuer den Nutzer: Der Knopf zeigt dann keine Minuten.
      // 'barrierefrei' antwortet regelmaessig mit 404, wenn es keinen
      // nutzbaren Aufzug gibt - und 'mit-stopp', wenn der Bahnhof weder WC
      // noch Kiosk kartiert hat.
    }
  }
}
