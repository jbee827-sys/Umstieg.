import { Capacitor } from '@capacitor/core'

/**
 * Ob Umstieg als App läuft (iOS, Capacitor) statt im Browser.
 *
 * Web und App teilen sich EINEN Code (Plan App Store, Abschnitt 2.2). Was nur
 * in der App gilt, fragt hier nach - kein zweiter Code-Zweig, kein eigener
 * Build-Schalter. Im Browser und in den Tests ist das immer `false`.
 */
export function istApp(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Setzt `ist-app` an <html>, damit das CSS die App-Regeln findet (sichere
 * Ränder, kein Überrollen der Seite, keine Textauswahl auf Knöpfen). Vor dem
 * ersten Zeichnen aufrufen.
 */
export function markiereApp(): void {
  if (istApp()) document.documentElement.classList.add('ist-app')
}
