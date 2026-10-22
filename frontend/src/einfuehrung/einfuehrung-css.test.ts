import { describe, expect, it } from 'vitest'
import { bloeckeAb, cssVon, deklarationenVon } from '../testhilfen/css'

/**
 * Plan Einführungstour, Paket 6: Die Tour sieht aus wie die App - nur mit
 * deren Variablen, damit sie hell und dunkel ohne eigene Fassung stimmt.
 * jsdom zeichnet nicht; ohne diese Prüfung fiele eine harte Farbe erst im
 * Dunkelmodus auf.
 */
const tour = cssVon('einfuehrung/einfuehrung.css')
const app = cssVon('App.css')

describe('einfuehrung.css', () => {
  it('nimmt Farben nur aus den Variablen von index.css', () => {
    expect(tour).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(tour).not.toMatch(/\brgba?\(/)
  })

  it('setzt die Sprechblase in die Grundfarbe der App, Radius 20 px', () => {
    const blase = deklarationenVon(tour, '.driver-popover.umstieg-tour')
    expect(blase).toContain('background: var(--color-bg)')
    expect(blase).toContain('color: var(--color-text)')
    expect(blase).toContain('border-radius: var(--radius-mittel)')
  })

  it('macht Weiter zur Akzentpille und Zurück zur Umrisspille', () => {
    const knoepfe = deklarationenVon(tour, '.umstieg-tour .driver-popover-footer button')
    expect(knoepfe).toContain('border-radius: var(--radius-pille)')
    expect(knoepfe).toContain('background: transparent')
    const weiter = deklarationenVon(tour, '.umstieg-tour .driver-popover-footer .driver-popover-next-btn')
    expect(weiter).toContain('background: var(--color-accent)')
    expect(weiter).toContain('color: var(--color-auf-akzent)')
  })

  // Im Dunkelmodus ist das hervorgehobene Element vom abgedunkelten Rest
  // sonst kaum zu unterscheiden.
  it('rahmt das hervorgehobene Element mit dem Akzent', () => {
    const ziel = deklarationenVon(tour, '.driver-active-element')
    expect(ziel).toContain('outline: 3px solid var(--color-accent)')
    expect(ziel).toContain('outline-offset: 4px')
  })

  // DESIGN.md 4: keine spitzen Ecken - auch nicht am Fokusring des ×.
  it('rundet das × wie jeden Knopf', () => {
    expect(deklarationenVon(tour, '.umstieg-tour .driver-popover-close-btn')).toContain('border-radius: var(--radius-pille)')
  })

  it('hält die Schrift der Blase nicht unter --schrift-label', () => {
    for (const groesse of tour.matchAll(/font-size:\s*([^;]+);/g)) {
      expect(groesse[1].trim()).toMatch(/^var\(--schrift-(label|text|anweisung|titel)\)$/)
    }
  })

  it('schaltet die Bewegung bei reduzierter Bewegung ab', () => {
    const ruhig = bloeckeAb(tour, '@media (prefers-reduced-motion: reduce)').join('')
    expect(ruhig).toMatch(/transition:\s*none/)
    expect(ruhig).toMatch(/animation:\s*none/)
  })
})

describe('App.css: das „i“ im Kopf', () => {
  it('ist ein runder Knopf von 34 px mit Rand in Textfarbe', () => {
    const knopf = deklarationenVon(app, '.tour-knopf')
    expect(knopf).toContain('width: 34px')
    expect(knopf).toContain('height: 34px')
    expect(knopf).toContain('border-radius: var(--radius-pille)')
    expect(knopf).toContain('border: 2px solid var(--color-text)')
  })

  it('hat einen sichtbaren Fokus', () => {
    expect(deklarationenVon(app, '.tour-knopf:focus-visible')).toContain('outline: 3px solid var(--color-accent)')
  })

  it('hält rechts im Kopf Platz frei', () => {
    expect(deklarationenVon(app, '.app-eingabe .kopf .lockup')).toContain('padding-right: 44px')
  })
})
