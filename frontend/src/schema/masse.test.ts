import { describe, expect, it } from 'vitest'
import { ANKER_H, RUHIG_H, WECHSEL_H, aktivHoehe, stapelVersatz } from './masse'

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

  it('bleibt mit aktivHoehe vertraeglich: Stapel und Fenster passen zusammen', () => {
    // Beim letzten Band muss unter dem aktiven Band nichts mehr stehen; die
    // Fensterhoehe ist also ANKER_H + aktivHoehe.
    const anzahl = 3
    const letzter = anzahl - 1
    const unterkante = ANKER_H + stapelVersatz(letzter) + letzter * (RUHIG_H + WECHSEL_H) + aktivHoehe(anzahl)
    expect(unterkante).toBe(ANKER_H + aktivHoehe(anzahl))
  })
})
