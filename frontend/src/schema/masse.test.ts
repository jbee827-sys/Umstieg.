import { describe, expect, it } from 'vitest'
import { AKTIV_KLEIN, ANKER_H, CHROME_H, MIN_BILD_H, RUHIG_H, WECHSEL_H, aktivHoehe, bildflaeche, stapelVersatz } from './masse'

describe('stapelVersatz', () => {
  it('haelt das aktive Band bei jedem Schritt auf derselben Hoehe', () => {
    // Der Sinn der Rechnung: Oberkante des aktiven Bandes = ANKER_H + Versatz.
    // Diese Summe muss konstant sein, sonst wandert das Bild beim Durchklicken.
    const oberkanten = [0, 1, 2, 3, 4].map((i) => ANKER_H + stapelVersatz(i) + i * (RUHIG_H + WECHSEL_H))
    expect(new Set(oberkanten)).toEqual(new Set([ANKER_H]))
  })

  it('laesst beim ersten Band genau eine Bandzeile Luft nach oben', () => {
    // Beim ersten Besuch liegt nichts darueber. Der Anker bleibt trotzdem
    // stehen - sonst ruckte das Bild beim ersten Weiter um eine Zeile hoch.
    expect(stapelVersatz(0)).toBe(0)
  })

  it('schiebt je weiteres Band um eine ruhige Zeile samt Wechsel hoch', () => {
    expect(stapelVersatz(1)).toBe(-(RUHIG_H + WECHSEL_H))
    expect(stapelVersatz(3)).toBe(-3 * (RUHIG_H + WECHSEL_H))
  })

  it('verankert eine Bandzeile hoch, damit die Ebene davor angeschnitten sichtbar bleibt', () => {
    expect(ANKER_H).toBe(RUHIG_H + WECHSEL_H)
  })

  it('haengt nicht von der Hoehe des aktiven Bandes ab – das Bild darf wachsen, ohne zu wandern', () => {
    // Die Oberkante des aktiven Bandes rechnet nur mit den ruhigen Baendern
    // DAVOR. Wie hoch es selbst ist, verschiebt nichts nach oben.
    expect(stapelVersatz(2)).toBe(-2 * (RUHIG_H + WECHSEL_H))
  })
})

describe('aktivHoehe: so hoch, wie das Bild es braucht – nicht mehr, als Platz ist', () => {
  it('gibt dem Bild seinen Bedarf samt Kopf- und Fusszeile', () => {
    expect(aktivHoehe(200, 400)).toBe(200 + CHROME_H)
  })

  it('kappt am verfuegbaren Platz', () => {
    expect(aktivHoehe(500, 300)).toBe(300)
  })

  it('wird nie kleiner als ein lesbares Bild', () => {
    expect(aktivHoehe(10, 400)).toBe(MIN_BILD_H + CHROME_H)
  })

  it('ohne gemessenen Platz: der Bedarf', () => {
    expect(aktivHoehe(300)).toBe(300 + CHROME_H)
  })

  it('die Zeichenflaeche ist das Band ohne Kopf, Fuss und Polster', () => {
    expect(bildflaeche(AKTIV_KLEIN).hoehe).toBe(AKTIV_KLEIN - CHROME_H)
  })
})
