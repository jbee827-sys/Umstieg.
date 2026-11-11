import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from '../testhilfen/css'

/**
 * „Etwas melden" (Spec 2026-11-10): Felder im Aufbau des Halo-Field von
 * cult-ui - aber ohne Halo, in den Farben von Umstieg. Die Huelle traegt
 * Grund, Rand und Lichtkante aus Token, mit Nachtfassung.
 */
const css = cssVon('App.css')

describe('App.css: die Feldhuelle von „Etwas melden"', () => {
  it('traegt Grund, Rand, Lichtkante und 14 px Radius aus den Token', () => {
    const huelle = deklarationenVon(css, '.feldhuelle')
    expect(huelle).toContain('background: var(--feldhuelle-grund)')
    expect(huelle).toContain('border: 1px solid var(--feldhuelle-rand)')
    expect(huelle).toContain('box-shadow: var(--feldhuelle-glanz)')
    expect(huelle).toContain('border-radius: 14px')
  })

  /**
   * Sichtpruefung 11.11.2026: „Schreib ein paar Worte." stand dunkel und fett
   * da - `.feld-hinweis` gab es schon (Hinweis neben dem Gleisfeld). Der leise
   * Hinweis braucht einen eigenen Namen.
   */
  it('setzt den Hinweis bei leerem Feld leise, mit eigener Klasse', () => {
    expect(deklarationenVon(css, '.etwas-melden-hinweis')).toContain('color: var(--color-neutral-700)')
    expect(cssVon('components/EtwasMelden.tsx')).toContain('className="etwas-melden-hinweis"')
    expect(cssVon('components/EtwasMelden.tsx')).not.toContain('feld-hinweis')
  })

  it('hat eine Nachtfassung in beiden dunklen Bloecken', () => {
    const treffer = cssVon('index.css').match(/--feldhuelle-grund: color-mix\(in srgb, #222120 80%, #171615\)/g) ?? []
    expect(treffer).toHaveLength(2)
  })
})
