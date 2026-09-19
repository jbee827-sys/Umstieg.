/**
 * Die Maße des Bandstapels — EINE Quelle für die Komponente und die
 * Simulation.
 *
 * Die Simulation zeichnet jedes Band jedes abgelegten Bahnhofs und prüft, ob
 * Weg und Marken im Bild liegen. Das beweist nur etwas, wenn sie auf
 * derselben Fläche zeichnet wie das Telefon.
 *
 * Der Platz folgt dem Reisenden: Die Ebene, auf der er steht, bekommt das
 * Bild, die übrigen schrumpfen auf eine Zeile — sie beantworten nur noch
 * „wo liegt das im Haus", und dafür genügt der Name.
 */
export const RUHIG_H = 34
export const WECHSEL_H = 22
export const BREITE = 356
export const POLSTER = 12
/** Kopfzeile im aktiven Band: Name links, Kurzfassung rechts. */
export const KOPF_H = 18
/** Fußzeile im aktiven Band: die Auskunft, die dort zählt. */
export const FUSS_H = 20

/**
 * Höhe des aktiven Bandes — fest, unabhängig von der Zahl der Besuche.
 *
 * Bis zum 19.09.2026 war das `STAPEL_H - (anzahl - 1) * (RUHIG_H + WECHSEL_H)`:
 * Der Stapel hatte eine feste Gesamthöhe von 468 px, und das aktive Band bekam
 * davon, was die ruhigen Zeilen übrig ließen. Das passte, solange die Seite
 * rollte. Seit sie das nicht mehr tut, ist nicht der Stapel der feste Rahmen,
 * sondern das Sichtfeld: Kopf, Schritt-Box und Leiste nehmen sich ihre Höhe,
 * das Bild bekommt den Rest — rund 180 px auf einem Telefon mit 740 px.
 *
 * 180 statt der alten 356: Das Bild wird für diese Höhe NEU GEZEICHNET, nicht
 * kleingerechnet. Die Bahnsteige rücken zusammen, die Beschriftung bleibt
 * lesbar. Ein auf 180 px skaliertes 356er Bild hätte auch die Schrift halbiert.
 *
 * Auf höheren Geräten bleibt das Bild bei 180 px und es werden dafür mehr
 * Nachbarebenen sichtbar — das ist die nützlichere Verwendung des Platzes als
 * ein gedehntes Bild derselben Ebene.
 */
export const AKTIV_H = 180

/** Höhe des aktiven Bandes. `anzahl` spielt keine Rolle mehr — siehe AKTIV_H. */
export function aktivHoehe(_anzahl: number): number {
  return AKTIV_H
}

/** Die Zeichenfläche im aktiven Band. */
export function bildflaeche(anzahl: number): { breite: number; hoehe: number } {
  return {
    breite: BREITE - POLSTER * 2,
    hoehe: Math.max(60, aktivHoehe(anzahl) - POLSTER * 2 - KOPF_H - FUSS_H - 6),
  }
}

/**
 * Luft über dem aktiven Band — genau eine ruhige Zeile samt Wechsel.
 *
 * Das aktive Band steht IMMER hier, gleich welcher Schritt läuft. Wer eine
 * Ebene weiterzieht, sieht das Bild an derselben Stelle stehen bleiben; nur
 * die Nachbarebenen wandern darum herum. Vorher wanderte das große Band mit
 * dem Fortschritt nach unten aus dem Sichtfeld.
 */
export const ANKER_H = RUHIG_H + WECHSEL_H

/**
 * Wie weit der Bandstapel verschoben wird, damit das aktive Band am Anker
 * steht. Negativ: nach oben.
 *
 * Vor dem aktiven Band liegen `index` ruhige Bänder mit je einem Wechsel
 * darunter — mehr braucht die Rechnung nicht, weil immer genau EIN Band
 * aktiv ist. Deshalb kommt sie ohne Messen im Browser aus.
 */
export function stapelVersatz(aktiverIndex: number): number {
  // `0 -` statt `-aktiverIndex *`: Letzteres liefert bei Index 0 die
  // Fliesskomma-Kuriositaet -0, die in einem `translateY(-0px)` landet.
  return 0 - aktiverIndex * (RUHIG_H + WECHSEL_H)
}
