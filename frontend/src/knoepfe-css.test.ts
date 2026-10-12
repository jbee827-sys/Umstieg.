import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Die Hauptknoepfe (Wunsch vom 12.10.2026): Schrift eine Stufe kleiner und
 * mittig, an jedem roten Knopf und am gruenen „Angekommen" daneben. Zuerst an
 * „Umstieg starten", dann fuer alle.
 *
 * Wo ein Knopf angeheftet ist - „Umstieg starten" auf dem Handy, „Navigation
 * starten" -, ist es nur noch der Knopf: Er schwebt ueber dem Rollbereich,
 * der Inhalt rollt darunter durch. Vorher endete der Rollbereich ueber ihm,
 * und der Knopf stand in einem eigenen Streifen vor der Leiste.
 *
 * jsdom rechnet kein Layout - ohne diese Regeln stuende der Knopf wieder im
 * Streifen, und alle Komponententests blieben gruen.
 */
const css = cssVon('App.css')
const pixel = (deklaration: string) => parseInt(deklaration.split(' ').pop()!, 10)

describe('App.css: die Schrift der Hauptknoepfe', () => {
  it.each(['.knopf-primaer', '.knopf-angekommen'])('%s setzt sie kleiner und mittig', (knopf) => {
    const regel = deklarationenVon(css, knopf)
    expect(regel).toContain('justify-content: center')
    expect(regel).toContain('font-size: var(--schrift-text)')
  })
})

describe('App.css: der schwebende Knopf', () => {
  const schwebend = () => deklarationenVon(css, '.knopf-schwebend')

  it('liegt ueber dem Rollbereich, nicht in einem Streifen darunter', () => {
    expect(schwebend()).toContain('position: absolute')
    expect(schwebend()).toContain('z-index: 1')
  })

  it.each(['.eingabe-flaeche', '.dashboard-flaeche'])('%s ist seine Bezugsflaeche', (flaeche) => {
    expect(deklarationenVon(css, flaeche)).toContain('position: relative')
  })

  /** Sonst bliebe das Letzte im Rollbereich am Ende unter dem Knopf. */
  it.each(['.eingabe-rollbereich', '.dashboard-rollbereich'])(
    '%s laesst unten so viel Platz, dass das Letzte ueber dem Knopf steht',
    (bereich) => {
      const polster = deklarationenVon(css, bereich).find((d) => d.startsWith('padding:'))!
      const abstand = schwebend().find((d) => d.startsWith('bottom:'))!
      const hoehe = deklarationenVon(css, '.knopf-primaer').find((d) => d.startsWith('min-height:'))!
      expect(pixel(polster)).toBeGreaterThanOrEqual(pixel(hoehe) + pixel(abstand))
    },
  )

  /**
   * Sichtpruefung 12.10.2026: Gesperrt war der Knopf zu 45 % deckend - ueber
   * dem Rollbereich schien „Einstellungen" durch ihn hindurch. Er sieht
   * gesperrt aus wie vorher, ist aber voll deckend gemischt.
   */
  it('bleibt auch gesperrt deckend, damit nichts durch ihn scheint', () => {
    const gesperrt = deklarationenVon(css, '.knopf-schwebend:disabled')
    expect(gesperrt).toContain('opacity: 1')
    expect(gesperrt.join(' ')).toMatch(
      /background: color-mix\(in srgb, var\(--color-accent\) 45%, var\(--color-bg\)\)/,
    )
  })
})
