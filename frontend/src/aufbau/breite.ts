import { useSyncExternalStore } from 'react'

/** Ab hier hat die Eingabe ihren breiten Aufbau: iPad und Desktop (Spec 2026-10-11). */
export const BREIT_AB_PX = 700
const ABFRAGE = `(min-width: ${BREIT_AB_PX}px)`

function hatMedienabfrage(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function abonniere(melde: () => void): () => void {
  if (!hatMedienabfrage()) return () => {}
  const abfrage = window.matchMedia(ABFRAGE)
  abfrage.addEventListener('change', melde)
  return () => abfrage.removeEventListener('change', melde)
}

function istBreit(): boolean {
  return hatMedienabfrage() && window.matchMedia(ABFRAGE).matches
}

/**
 * Ob der breite Aufbau gilt - auch wenn sich das unterwegs aendert (iPad
 * gedreht, Fenster gezogen). CSS allein reicht nicht: Im breiten Aufbau laden
 * die Tafeln von selbst, auf dem Handy erst auf Knopfdruck.
 */
export function useBreitesLayout(): boolean {
  return useSyncExternalStore(abonniere, istBreit, () => false)
}
