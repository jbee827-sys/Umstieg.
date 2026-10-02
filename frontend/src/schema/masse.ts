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

/** Kopf, Fuß und Polster des aktiven Bandes – alles außer der Zeichenfläche. */
export const CHROME_H = POLSTER * 2 + KOPF_H + FUSS_H + 6

/** Kleinste Zeichenfläche, auf der ein Band noch etwas sagt. */
export const MIN_BILD_H = 60

/**
 * Höhe des aktiven Bandes auf einem kleinen Telefon (740 px): Kopf,
 * Schritt-Box und Leiste lassen dem Band rund 180 px. Bezugsgröße für Tests
 * und Simulation – die Komponente misst den echten Platz.
 */
export const AKTIV_KLEIN = 180

/**
 * Höhe des aktiven Bandes: so hoch, wie sein Bild es braucht, höchstens so
 * hoch, wie Platz ist.
 *
 * Bis zum 02.10.2026 war das eine feste Zahl (180, davor 356). Fest heißt:
 * Zwei Bahnsteige bekamen dieselbe Fläche wie siebzehn. München Hbf stapelte
 * so 17 Balken in 84 px, Gleisnamen und Balken lagen übereinander – in der
 * Simulation an 203 von 2082 Routen.
 *
 * Fest bleibt nur die Oberkante (`ANKER_H`, `stapelVersatz`): Das Bild
 * wächst nach unten, und was unter ihm liegt, rückt aus dem Fenster. Es
 * wandert nicht.
 *
 * `bildBedarf` ist die Zeichenfläche, die das Band ungestaucht braucht
 * (`bildBedarf` in bandbild.ts); `verfuegbar` der Platz unter dem Anker,
 * ungemessen unbegrenzt.
 */
export function aktivHoehe(bildBedarf: number, verfuegbar = Infinity): number {
  const gewuenscht = Math.max(bildBedarf, MIN_BILD_H) + CHROME_H
  return Math.max(MIN_BILD_H + CHROME_H, Math.min(gewuenscht, verfuegbar))
}

/** Die Zeichenfläche in einem aktiven Band dieser Höhe. */
export function bildflaeche(aktivH: number): { breite: number; hoehe: number } {
  return {
    breite: BREITE - POLSTER * 2,
    hoehe: Math.max(MIN_BILD_H, aktivH - CHROME_H),
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
