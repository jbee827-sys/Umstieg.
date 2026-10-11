import { useSyncExternalStore } from 'react'

/** Ab hier hat die Eingabe ihren breiten Aufbau: iPad und Desktop (Spec 2026-10-11). */
export const BREIT_AB_PX = 700
/**
 * Und erst ab dieser Hoehe: Ein Handy quer (etwa 844 x 390) ist breiter als
 * 700 px, hat aber keinen Platz fuer Formular UND Tafeln - die Formularzeile
 * fiel dort auf 0 px (Schlusspruefung 11.10.2026). Das kleinste iPad quer ist
 * 744 px hoch und bleibt breit.
 */
export const BREIT_MIN_HOEHE_PX = 600
/** Dieselbe Abfrage steht in App.css - `eingabe-css.test.ts` haelt beide gleich. */
export const BREIT_ABFRAGE = `(min-width: ${BREIT_AB_PX}px) and (min-height: ${BREIT_MIN_HOEHE_PX}px)`

function hatMedienabfrage(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function abonniere(melde: () => void): () => void {
  if (!hatMedienabfrage()) return () => {}
  const abfrage = window.matchMedia(BREIT_ABFRAGE)
  abfrage.addEventListener('change', melde)
  return () => abfrage.removeEventListener('change', melde)
}

function istBreit(): boolean {
  return hatMedienabfrage() && window.matchMedia(BREIT_ABFRAGE).matches
}

/**
 * Ob der breite Aufbau gilt - auch wenn sich das unterwegs aendert (iPad
 * gedreht, Fenster gezogen). CSS allein reicht nicht: Im breiten Aufbau laden
 * die Tafeln von selbst, auf dem Handy erst auf Knopfdruck.
 */
export function useBreitesLayout(): boolean {
  return useSyncExternalStore(abonniere, istBreit, () => false)
}
