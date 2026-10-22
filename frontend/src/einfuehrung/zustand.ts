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

/**
 * Ob Entwurfs- und Reisespeicher gerade stillhalten (sitzung/).
 *
 * Ein eigener Merker neben `vorfuehrungLaeuft`, weil beide zu verschiedenen
 * Zeitpunkten fallen: Am Ende der Tour muss der Speicher WIEDER lesbar sein,
 * bevor die App neu aufgebaut wird - sie liest dabei die Reise des Nutzers.
 * Die Messung dagegen schweigt bis danach.
 */
let speicherGesperrt = false

export function sitzungsspeicherGesperrt(): boolean {
  return speicherGesperrt
}

export function sperreSitzungsspeicher(an: boolean): void {
  speicherGesperrt = an
}
