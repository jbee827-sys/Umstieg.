import { describe, expect, it } from 'vitest'
import { bloeckeAb, cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Die Eingabe hat seit dem 11.10.2026 den Aufbau der Uebersicht: Spalte auf
 * Sichtfeldhoehe, der Inhalt rollt, „Umstieg starten" steht fest darunter.
 * jsdom rechnet kein Layout - ohne diese Regeln laege der Knopf wieder unter
 * dem Falz, und alle Komponententests blieben gruen.
 */
const css = cssVon('App.css')

describe('App.css: die Eingabe', () => {
  it('haelt die Spalte auf Sichtfeldhoehe', () => {
    const spalte = deklarationenVon(css, '.app-eingabe')
    expect(spalte).toContain('height: 100dvh')
    expect(spalte).toContain('overflow: hidden')
  })

  it('laesst den Rollbereich rollen und schrumpfen', () => {
    const bereich = deklarationenVon(css, '.eingabe-rollbereich')
    expect(bereich).toContain('flex: 1')
    expect(bereich).toContain('min-height: 0')
    expect(bereich).toContain('overflow-y: auto')
  })

  it('setzt die Gleisnummer in die Staffel: 56 px, ab vier Zeichen 28 px', () => {
    expect(deklarationenVon(css, '.gleiskachel-feld')).toContain('font-size: var(--schrift-gleis)')
    expect(deklarationenVon(css, '.gleiskachel-feld.lang')).toContain(
      'font-size: var(--schrift-titel)',
    )
  })
})

describe('App.css: breites Layout der Eingabe', () => {
  const ab700 = bloeckeAb(css, '@media (min-width: 700px)').join(' ')
  const ab900 = bloeckeAb(css, '@media (min-width: 900px)').join(' ')

  it('wird ab 700 px breiter als die Telefonspalte', () => {
    expect(deklarationenVon(ab700, '.app-eingabe')).toContain('max-width: 1280px')
  })

  it('stellt ab 900 px Formular, Ankunft und Abfahrt nebeneinander', () => {
    expect(deklarationenVon(ab900, '.eingabe-flaeche')).toContain(
      'grid-template-columns: minmax(340px, 400px) 1fr 1fr',
    )
  })
})

describe('App.css: die Tafeln klappen nach rechts auf', () => {
  it('laeuft als Uebergang ueber die Token', () => {
    const regel = deklarationenVon(css, '.mit-bewegung .tafel-spalte-inhalt').join('; ')
    expect(regel).toMatch(/clip-path var\(--dauer-normal\) var\(--verlauf-ein\)/)
  })

  it('ist zugeklappt von rechts her verdeckt', () => {
    expect(
      deklarationenVon(css, ".tafel-spalte[data-offen='nein'] .tafel-spalte-inhalt"),
    ).toContain('clip-path: inset(0 100% 0 0)')
  })

  it('klappt auch beim ersten Erscheinen auf', () => {
    expect(bloeckeAb(css, '@starting-style').join(' ')).toMatch(/clip-path: inset\(0 100% 0 0\)/)
  })

  it('laesst die Abfahrt um --dauer-schnell nachfolgen', () => {
    expect(
      deklarationenVon(
        css,
        ".mit-bewegung .tafel-spalte.abfahrt[data-offen='ja'] .tafel-spalte-inhalt",
      ),
    ).toContain('transition-delay: var(--dauer-schnell)')
  })
})
