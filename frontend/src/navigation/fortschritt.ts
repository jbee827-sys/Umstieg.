/**
 * Welcher Schritt ist gerade dran?
 *
 * Der Nutzer schaltet weiter, nicht die Uhr. Bis zum 02.09.2026 schaetzte
 * diese Datei aus den Gehzeiten der Schritte, wo jemand sein duerfte, und
 * rueckte die Anzeige alle zehn Sekunden von selbst vor; der Nutzer konnte
 * diese Schaetzung nur korrigieren.
 *
 * Eine Uhr weiss aber nicht, ob jemand vor der Rolltreppe wartet, sich
 * verlaufen hat oder stehengeblieben ist, um das Schild zu lesen. Sie
 * schaltet trotzdem weiter - und dann steht auf dem Bildschirm ein anderer
 * Schritt als der, den der Mensch gerade geht. Genau in dem Moment, in dem
 * man sich auf die Anzeige verlassen will, wird sie unzuverlaessig.
 *
 * Uebrig bleibt das Begrenzen: `zaehler` ist die Summe der Weiter- und
 * Zurueck-Tipps und darf die Liste nach keiner Seite verlassen. Eine leere
 * Liste ergibt 0 - sonst waere die Position -1 und der Zugriff darauf
 * `undefined`.
 */
export function schrittPosition(zaehler: number, laenge: number): number {
  if (laenge === 0) return 0;
  return Math.min(Math.max(zaehler, 0), laenge - 1);
}
