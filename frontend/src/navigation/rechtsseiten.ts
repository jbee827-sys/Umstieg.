import { useSyncExternalStore } from 'react'

/**
 * Impressum und Datenschutz mit eigener Adresse (Konzept Nutzergewinnung,
 * AP 3, 21.10.2026).
 *
 * Bis dahin hingen sie am Hash (`#impressum`). Fuer Google waren das keine
 * eigenen Seiten, und die Reichweitenmessung sah sie nie: `@vercel/analytics`
 * zaehlt Aufrufe ueber `pushState`, nicht ueber `hashchange` (BRIEF.md 3).
 *
 * Die Rechtsseiten sind keine Bildschirme (DESIGN.md 8: die fuenf sind
 * abschliessend) - sie liegen ueber dem Bildschirm, der gerade dran ist, und
 * Zurueck fuehrt wieder auf ihn. Deshalb eine eigene Tabelle neben `PFAD`.
 */
export type Rechtsseite = 'impressum' | 'datenschutz' | 'daten'

/** „Daten“ (21.10.2026) liegt wie die Rechtsseiten ueber dem Bildschirm. */
export const RECHTSPFAD: Record<Rechtsseite, string> = {
  impressum: '/impressum',
  datenschutz: '/datenschutz',
  daten: '/daten',
}

/** Wird bei jedem Wechsel ausgeloest, den `popstate` nicht meldet. */
const EREIGNIS = 'umstieg:adresse'

/** Die Rechtsseite einer Adresse, oder `null`. */
export function rechtsseiteAusPfad(pfad: string): Rechtsseite | null {
  const ohneSchraegstrich = pfad.length > 1 ? pfad.replace(/\/+$/, '') : pfad
  if (ohneSchraegstrich === RECHTSPFAD.impressum) return 'impressum'
  if (ohneSchraegstrich === RECHTSPFAD.datenschutz) return 'datenschutz'
  if (ohneSchraegstrich === RECHTSPFAD.daten) return 'daten'
  return null
}

/**
 * Alte Raute-Links (`#impressum`, `#datenschutz`) auf die neue Adresse
 * umschreiben - ohne neuen Verlaufseintrag. Sie sind geteilt worden und
 * stehen womoeglich in fremden Seiten. Laeuft vor dem ersten Zeichnen
 * (main.tsx).
 */
export function leiteRauteUm(): void {
  const seite = window.location.hash.slice(1)
  if (seite !== 'impressum' && seite !== 'datenschutz') return
  window.history.replaceState(null, '', RECHTSPFAD[seite])
}

/** Merkt sich, dass davor eine Seite der App liegt - Zurueck fuehrt auf sie. */
interface Verlaufsvermerk {
  rechtsseite: Rechtsseite
  ausDerApp: true
}

export function oeffneRechtsseite(seite: Rechtsseite): void {
  const vermerk: Verlaufsvermerk = { rechtsseite: seite, ausDerApp: true }
  window.history.pushState(vermerk, '', RECHTSPFAD[seite])
  window.dispatchEvent(new Event(EREIGNIS))
}

/**
 * Zurueck dorthin, woher die Rechtsseite geoeffnet wurde. Wurde sie direkt
 * aufgerufen (Suchergebnis, Lesezeichen), liegt davor keine Seite der App -
 * dann ersetzt `ersatz` die Adresse, statt aus der App hinauszufuehren.
 */
export function schliesseRechtsseite(ersatz: string): void {
  const vermerk = window.history.state as Partial<Verlaufsvermerk> | null
  if (vermerk?.ausDerApp === true) {
    window.history.back()
    return
  }
  window.history.replaceState(null, '', ersatz)
  window.dispatchEvent(new Event(EREIGNIS))
}

function abonniere(neuZeichnen: () => void): () => void {
  window.addEventListener('popstate', neuZeichnen)
  window.addEventListener(EREIGNIS, neuZeichnen)
  return () => {
    window.removeEventListener('popstate', neuZeichnen)
    window.removeEventListener(EREIGNIS, neuZeichnen)
  }
}

/** Die Rechtsseite der aktuellen Adresse - folgt Zurueck, Vor und Links. */
export function useRechtsseite(): Rechtsseite | null {
  return useSyncExternalStore(abonniere, () => rechtsseiteAusPfad(window.location.pathname))
}
