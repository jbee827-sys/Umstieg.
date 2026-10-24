import { passeStatusleisteAn } from '../plattform/geraet'

/**
 * Hell, Dunkel oder wie das Geraet - die Wahl unter „Einstellungen".
 *
 * Ohne Wahl folgt die App `prefers-color-scheme` (index.css). Wer selbst
 * waehlt, setzt `data-darstellung` an der Wurzel; die Farbtoken in index.css
 * richten sich danach.
 *
 * Gemerkt wird die Wahl im `localStorage` - als EINZIGER Eintrag dort, und nur,
 * wenn jemand ausdruecklich Hell oder Dunkel waehlt. Zurueck auf System
 * loescht ihn. So steht es in der Datenschutzerklaerung.
 */
export type Darstellung = 'system' | 'hell' | 'dunkel'

const SCHLUESSEL = 'umstieg.darstellung'

/**
 * `localStorage` ist nicht garantiert: In Safaris privatem Modus und bei
 * blockierten Site-Daten wirft schon der Zugriff. Dann gibt es kein
 * Gedaechtnis, die Wahl wirkt trotzdem bis zum Neuladen.
 */
function speicher(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function ladeDarstellung(): Darstellung {
  try {
    const wert = speicher()?.getItem(SCHLUESSEL)
    return wert === 'hell' || wert === 'dunkel' ? wert : 'system'
  } catch {
    return 'system'
  }
}

export function wendeDarstellungAn(darstellung: Darstellung, wurzel: HTMLElement = document.documentElement): void {
  if (darstellung === 'system') delete wurzel.dataset.darstellung
  else wurzel.dataset.darstellung = darstellung
}

/** Wahl aus den Einstellungen: sofort anwenden und merken. */
export function waehleDarstellung(darstellung: Darstellung): void {
  wendeDarstellungAn(darstellung)
  passeStatusleisteAn()
  try {
    const s = speicher()
    if (darstellung === 'system') s?.removeItem(SCHLUESSEL)
    else s?.setItem(SCHLUESSEL, darstellung)
  } catch {
    // Kein Speicher - die Wahl gilt bis zum Neuladen.
  }
}
