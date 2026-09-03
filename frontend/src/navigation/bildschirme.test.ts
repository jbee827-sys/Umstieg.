import { describe, it, expect } from 'vitest'
import { leisteneintraege } from './bildschirme'

describe('leisteneintraege', () => {
  it('zeigt ohne Route nur die Eingabe als aktiv', () => {
    const e = leisteneintraege(false)
    expect(e.map((x) => x.id)).toEqual(['eingabe', 'dashboard', 'navigation', 'meldungen'])
    expect(e.filter((x) => x.aktiv).map((x) => x.id)).toEqual(['eingabe'])
  })

  it('gibt mit Route alle Eintraege frei', () => {
    expect(leisteneintraege(true).every((x) => x.aktiv)).toBe(true)
  })

  it('fuehrt die Meldungen als festen Eintrag', () => {
    // Frueher fehlte die Stoerung hier bewusst: Sie war nur bei einem
    // Gleiswechsel erreichbar und waere sonst ein Knopf gewesen, der meistens
    // ins Leere fuehrt. Die Meldungsseite hat einen leeren Zustand - sie
    // fuehrt nie ins Leere, sondern sagt, dass es nichts gibt.
    expect(leisteneintraege(true).some((x) => x.id === 'meldungen')).toBe(true)
  })

  it('fuehrt Angekommen nie als Eintrag', () => {
    // Angekommen ist das Ende der Reise, kein Ort zum Nachschlagen. Als
    // Dauerknopf lud die Leiste dazu ein, ihn mitten im Umstieg zu treffen -
    // und damit die laufende Navigation zu beenden. Erreichbar ist der
    // Bildschirm ueber den Knopf auf der Weg-Seite.
    expect(leisteneintraege(true).some((x) => x.id === 'angekommen')).toBe(false)
  })
})
