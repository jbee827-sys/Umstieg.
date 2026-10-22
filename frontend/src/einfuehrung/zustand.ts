/**
 * Ob gerade die Einführungstour läuft.
 *
 * Eigene, winzige Datei: Die Messung (analytik/ereignis.ts) liest den Merker
 * bei jedem Aufruf, liegt also im Haupt-Chunk. Die Tour selbst mit driver.js
 * und den Daten wird erst beim Tipp auf das „i" nachgeladen und darf von
 * hier aus nicht mitgezogen werden.
 */
let laeuft = false

export function vorfuehrungLaeuft(): boolean {
  return laeuft
}

export function setzeVorfuehrung(an: boolean): void {
  laeuft = an
}
