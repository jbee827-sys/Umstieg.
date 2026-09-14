/**
 * Die Maße des Bandstapels — EINE Quelle für die Komponente und die
 * Simulation.
 *
 * Die Simulation zeichnet jedes Band jedes abgelegten Bahnhofs und prüft, ob
 * Weg und Marken im Bild liegen. Das beweist nur etwas, wenn sie auf
 * derselben Fläche zeichnet wie das Telefon.
 *
 * Der Platz folgt dem Reisenden: Die Ebene, auf der er steht, bekommt alles,
 * was die übrigen nicht brauchen. Die übrigen schrumpfen auf eine Zeile —
 * sie beantworten nur noch „wo liegt das im Haus", und dafür genügt der Name.
 */
export const STAPEL_H = 468
export const RUHIG_H = 34
export const WECHSEL_H = 22
export const BREITE = 356
export const POLSTER = 12
/** Kopfzeile im aktiven Band: Name links, Kurzfassung rechts. */
export const KOPF_H = 18
/** Fußzeile im aktiven Band: die Auskunft, die dort zählt. */
export const FUSS_H = 20

/** Höhe des aktiven Bandes bei `anzahl` Besuchen. */
export function aktivHoehe(anzahl: number): number {
  return Math.max(150, STAPEL_H - (anzahl - 1) * (RUHIG_H + WECHSEL_H))
}

/** Die Zeichenfläche im aktiven Band. */
export function bildflaeche(anzahl: number): { breite: number; hoehe: number } {
  return {
    breite: BREITE - POLSTER * 2,
    hoehe: Math.max(60, aktivHoehe(anzahl) - POLSTER * 2 - KOPF_H - FUSS_H - 6),
  }
}
