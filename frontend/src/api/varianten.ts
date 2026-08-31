import type { RouteErgebnis, RouteParameter, RoutenVariante } from './typen'

/** Angebotene Varianten in der Reihenfolge des Entwurfs. */
export const ANGEBOTENE: RoutenVariante[] = ['schnellste', 'barrierefrei']

type Basis = Omit<RouteParameter, 'variante'>
type HoleFn = (p: RouteParameter) => Promise<RouteErgebnis>

/**
 * Laedt die Routenvarianten NACHEINANDER, nicht gleichzeitig.
 *
 * Der Grund ist gemessen: Zwei gleichzeitige Anfragen fuer denselben Bahnhof
 * finden beide den Graph-Cache leer, bauen den Graphen unabhaengig und fragen
 * Overpass doppelt. Am 31.08.2026 kostete das 24 s und 61 s statt 2 s - die
 * App wirkte eingefroren. Nacheinander trifft die zweite Anfrage den warmen
 * Cache und ist praktisch umsonst.
 *
 * Die gewaehlte Variante kommt zuerst: Sobald sie da ist, kann das Dashboard
 * stehen. Die zweite liefert nur noch die Minutenangabe fuer ihren Knopf;
 * faellt sie aus, bleibt der Knopf ohne Minuten - das ist kein Fehler.
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

  const zweite = ANGEBOTENE.find((v) => v !== gewaehlt)
  if (!zweite) return
  try {
    const andere = await hole({ ...basis, variante: zweite })
    beiZweit(zweite, andere.gehzeitSek)
  } catch {
    // Kein Fehler fuer den Nutzer: Der Knopf zeigt dann keine Minuten.
    // 'barrierefrei' antwortet regelmaessig mit 404, wenn es keinen
    // nutzbaren Aufzug gibt.
  }
}
