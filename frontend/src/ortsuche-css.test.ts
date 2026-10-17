import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Die Ortsvorschlaege tragen seit Umstieg 2.0 Kuerzelmarken der
 * Verkehrsmittel. jsdom rechnet kein Layout - ohne diese Regeln stuenden die
 * Marken unter dem Namen oder in Browserschrift.
 */
const css = cssVon('App.css')

describe('App.css: Ortsuche', () => {
  it('stellt Name und Marken in eine Zeile, Name links', () => {
    const zeile = deklarationenVon(css, '.ort-vorschlag')
    expect(zeile).toContain('display: flex')
    expect(zeile).toContain('justify-content: space-between')
  })

  it('setzt die Marken in Tokenfarben und nicht unter die Schriftuntergrenze (DESIGN.md)', () => {
    const marke = deklarationenVon(css, '.vm-marke')
    expect(marke).toContain('font-size: var(--schrift-label)')
    expect(marke.some((d) => d.startsWith('color: var(--color-'))).toBe(true)
    expect(marke.some((d) => d.startsWith('background: var(--color-'))).toBe(true)
  })

  it('laesst Marken nicht umbrechen', () => {
    expect(deklarationenVon(css, '.vm-symbole')).toContain('white-space: nowrap')
  })
})

describe('App.css: Fahrtauswahl an Haltestellen', () => {
  it('„laut Fahrplan“ als ruhiges Nebenzeichen, nicht in Rot', () => {
    const k = deklarationenVon(css, '.kennzeichen-fahrplan')
    expect(k).toContain('color: var(--color-neutral-700)')
    expect(k).toContain('font-size: var(--schrift-label)')
  })

  it('„fällt aus“ in Rotschrift - der Satz sagt es, die Farbe stuetzt nur (DESIGN.md 2)', () => {
    expect(deklarationenVon(css, '.kennzeichen-ausfall')).toContain('color: var(--color-accent-700)')
  })

  it('eine ausgefallene Fahrt sieht nicht antippbar aus', () => {
    expect(deklarationenVon(css, '.tafel button.faellt-aus')).toContain('cursor: not-allowed')
  })
})
