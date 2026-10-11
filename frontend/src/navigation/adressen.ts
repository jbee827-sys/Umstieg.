import type { Bildschirm } from './bildschirme'

/**
 * Die Adresse jedes Bildschirms (Spec 2026-10-11 Seitenuebergaenge, §3).
 *
 * Wie die Leiste, nicht wie die Schluessel: Adressen sieht man, Schluessel
 * nicht. `dashboard` heisst in der Leiste „Übersicht", also `/uebersicht`.
 * Bis zum 11.10.2026 lief alles unter `/` - die Reichweitenmessung hat nie
 * einen Bildschirm gesehen (BRIEF.md 3).
 */
export const PFAD: Record<Bildschirm, string> = {
  eingabe: '/eingabe',
  dashboard: '/uebersicht',
  navigation: '/weg',
  meldungen: '/meldungen',
  angekommen: '/angekommen',
}

const NACH_PFAD = new Map<string, Bildschirm>(
  Object.entries(PFAD).map(([b, p]) => [p, b as Bildschirm]),
)

/** Der Bildschirm einer Adresse, oder `null` fuer `/` und Unbekanntes. */
export function bildschirmAusPfad(pfad: string): Bildschirm | null {
  const ohneSchraegstrich = pfad.length > 1 ? pfad.replace(/\/+$/, '') : pfad
  return NACH_PFAD.get(ohneSchraegstrich) ?? null
}

/** Alles ausser der Eingabe zeigt eine Reise - ohne sie gibt es nichts zu zeigen. */
export function brauchtReise(b: Bildschirm): boolean {
  return b !== 'eingabe'
}

/** Womit die App startet: die Adresse, wenn es die Reise dazu gibt, sonst die Eingabe. */
export function startBildschirm(pfad: string, hatReise: boolean): Bildschirm {
  const b = bildschirmAusPfad(pfad)
  if (!b) return 'eingabe'
  return brauchtReise(b) && !hatReise ? 'eingabe' : b
}
