/**
 * Warten auf Elemente der echten App - für die Einführungstour und die
 * Vorführung der Bildschirmfotos (vorfuehrung.ts).
 */

/** Das Element mit diesem `data-tour`-Wert (Ziele siehe schritte.ts). */
export function ziel(wert: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${wert}"]`)
}

/**
 * Wartet, bis `finde` etwas liefert - und bis ein Seitenübergang fertig ist
 * (navigation/uebergang.ts setzt `data-uebergang`, solange er läuft). Erst
 * dann stimmt die Lage, an der driver.js die Blase ausrichtet.
 */
export function warte<T>(finde: () => T | null | undefined | false, ms: number): Promise<T> {
  const bis = Date.now() + ms
  return new Promise((fertig, fehler) => {
    const pruefe = () => {
      const gefunden = finde()
      if (gefunden && !document.documentElement.dataset.uebergang) return fertig(gefunden)
      if (Date.now() > bis) return fehler(new Error('Einführung: Ziel nicht erschienen'))
      setTimeout(pruefe, 50)
    }
    pruefe()
  })
}
