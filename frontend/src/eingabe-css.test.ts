import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

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
