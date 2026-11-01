import { useSyncExternalStore } from 'react'
import { apiUrl } from '../api/basis'
import { vorfuehrungLaeuft } from '../einfuehrung/zustand'
import { istApp } from '../plattform/istApp'

/**
 * Nutzungszählung der iOS-App - nur mit Einwilligung (Plan App Store,
 * Paket 4; Richtlinie 5.1.1 (ii)).
 *
 * Die Website misst weiter mit Vercel und ohne Abfrage (ereignis.ts). In der
 * App gibt es kein Vercel: Dort geht, wer zugestimmt hat, mit jedem Ereignis
 * genau dessen Namen an unser Backend (`POST /api/zaehle`), das nur Summen je
 * Stunde protokolliert. Ohne Antwort oder mit „Nein“ geht nichts hinaus.
 *
 * Die Antwort steht im `localStorage` - als zweiter und letzter Eintrag
 * dort neben der Darstellung, und nur in der App (Datenschutzerklärung).
 */
export type Einwilligung = 'ja' | 'nein' | null

const SCHLUESSEL = 'umstieg.messung'
const hoerer = new Set<() => void>()

export function liesEinwilligung(): Einwilligung {
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL)
    return wert === 'ja' || wert === 'nein' ? wert : null
  } catch {
    return null
  }
}

/** Antwort auf die Abfrage oder Schalter in den Einstellungen - gilt sofort. */
export function setzeEinwilligung(wert: 'ja' | 'nein'): void {
  try {
    window.localStorage.setItem(SCHLUESSEL, wert)
  } catch {
    // Kein Speicher: Die Antwort gilt bis zum Neustart nicht - also wird
    // auch nichts gezählt. Lieber zu wenig als ohne Zustimmung.
  }
  for (const melde of hoerer) melde()
}

function abonniere(melde: () => void): () => void {
  hoerer.add(melde)
  return () => hoerer.delete(melde)
}

export function useEinwilligung(): Einwilligung {
  return useSyncExternalStore(abonniere, liesEinwilligung, () => null)
}

/** Ob die App fragen soll: nur in der App und nur, solange niemand geantwortet hat. */
export function sollFragen(einwilligung: Einwilligung): boolean {
  return istApp() && einwilligung === null
}

/**
 * Zählt ein Ereignis der App - nur in der App, nur mit Zustimmung und nie
 * während der Einführungstour. Nur der Name geht hinaus; der Rückgabewert
 * wird nie gelesen.
 */
export function zaehleInApp(name: string): void {
  if (!istApp() || vorfuehrungLaeuft() || liesEinwilligung() !== 'ja') return
  try {
    void fetch(apiUrl('/api/zaehle'), {
      method: 'POST',
      // text/plain: eine einfache Anfrage, keine CORS-Vorabfrage.
      headers: { 'Content-Type': 'text/plain' },
      body: name,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Die Messung darf die App nie stören.
  }
}
