import { describe, expect, it } from 'vitest'
import { AKTIV_KLEIN, ANKER_H, CHROME_H, MIN_BILD_H, RUHIG_H, WECHSEL_H, aktivHoehe, ausschnittVersatz, bildflaeche, stapelVersatz } from './masse'

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

describe('ausschnittVersatz: das Gleisbild wird beschnitten, nicht gestaucht (16.11.2026)', () => {
  it('passt das Bild ganz hinein, bleibt es stehen', () => {
    expect(ausschnittVersatz(100, 100, 20, 80)).toBe(0)
    expect(ausschnittVersatz(80, 100, 20, 60)).toBe(0)
  })

  it('zeigt Standpunkt und Ziel zusammen, wenn beide in den Ausschnitt passen', () => {
    // 600 hoch, 100 zu sehen; Stand bei 300, Ziel bei 340: Mitte 320.
    expect(ausschnittVersatz(600, 100, 300, 340)).toBe(270)
  })

  it('liegen sie zu weit auseinander, folgt der Ausschnitt dem Standpunkt', () => {
    // München 9 → 25: Ankunft unten, Abfahrt oben.
    expect(ausschnittVersatz(600, 100, 500, 150)).toBe(450)
    expect(ausschnittVersatz(600, 100, 150, 150)).toBe(100)
  })

  it('schiebt nie über den Rand des Bildes', () => {
    expect(ausschnittVersatz(600, 100, 10, 10)).toBe(0)
    expect(ausschnittVersatz(600, 100, 590, 590)).toBe(500)
  })
})
