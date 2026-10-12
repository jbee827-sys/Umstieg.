import { flushSync } from 'react-dom'
import type { Bildschirm } from './bildschirme'

/** Wer den Wechsel ausloest: ein Knopf im Ablauf, die Leiste, Zurueck/Vor. */
export type Ausloeser = 'ablauf' | 'leiste' | 'verlauf'
export type Uebergangsart = 'vor' | 'zurueck' | 'quer'

/** Die Reihenfolge des Ablaufs (DESIGN.md 6). `meldungen` liegt ausserhalb. */
const ABLAUF: Bildschirm[] = ['eingabe', 'dashboard', 'navigation', 'angekommen']

/**
 * Die Richtung sagt, wo man im Ablauf steht: weiter vorn oder zurueck. Ein
 * Sprung ueber die Leiste hat keine Reihenfolge, die Meldungen liegen
 * daneben - beides ist eine reine Querblende (Spec 2026-10-11
 * Seitenuebergaenge, §5).
 */
export function uebergangsart(
  von: Bildschirm,
  nach: Bildschirm,
  ausloeser: Ausloeser,
): Uebergangsart {
  if (ausloeser === 'leiste') return 'quer'
  const a = ABLAUF.indexOf(von)
  const b = ABLAUF.indexOf(nach)
  if (a < 0 || b < 0) return 'quer'
  return b > a ? 'vor' : 'zurueck'
}

function ruhigGewuenscht(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Fuehrt den Wechsel aus - mit View Transition, wo es sie gibt und wo sie
 * erwuenscht ist, sonst sofort. Die Bewegung selbst steht in App.css und
 * liest die Art aus `data-uebergang` an <html>.
 *
 * Keine Bewegung ohne `startViewTransition` (Safari < 18, Firefox < 144), bei
 * reduzierter Bewegung und wenn der Browser schon selbst animiert - die
 * Zurueck-Wischgeste auf dem iPhone zeigt ihre eigene, und zwei uebereinander
 * waeren schlimmer als keine.
 */
export function mitUebergang(
  art: Uebergangsart,
  aendere: () => void,
  { browserAnimiert = false }: { browserAnimiert?: boolean } = {},
): void {
  if (
    typeof document.startViewTransition !== 'function' ||
    ruhigGewuenscht() ||
    browserAnimiert
  ) {
    aendere()
    return
  }
  const wurzel = document.documentElement
  wurzel.dataset.uebergang = art
  const raeumeAuf = () => {
    delete wurzel.dataset.uebergang
  }
  try {
    // flushSync: Der neue Zustand muss im Rueckruf im DOM stehen, sonst
    // fotografiert der Browser zweimal dieselbe Seite. Auch ein abgelehnter
    // Uebergang (etwa im verdeckten Tab) raeumt die Art wieder weg - der
    // Wechsel selbst ist dann schon geschehen.
    document.startViewTransition(() => flushSync(aendere)).finished.then(raeumeAuf).catch(raeumeAuf)
  } catch {
    raeumeAuf()
    aendere()
  }
}
