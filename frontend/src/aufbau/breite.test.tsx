import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { BREIT_ABFRAGE, useBreitesLayout } from './breite'
import { raeumeBreiteAuf, stelleBreite } from './testbreite'

afterEach(raeumeBreiteAuf)

describe('useBreitesLayout', () => {
  it('ist ohne matchMedia schmal', () => {
    expect(renderHook(useBreitesLayout).result.current).toBe(false)
  })

  /**
   * Schlusspruefung 11.10.2026: Ein Handy quer (844 x 390) ist breiter als
   * 700 px, hat aber keinen Platz fuer Formular UND Tafeln - die
   * Formularzeile fiel auf 0 px. Breit heisst deshalb auch hoch genug.
   */
  it('fragt ab 700 px Breite und 600 px Hoehe', () => {
    stelleBreite(true)
    expect(renderHook(useBreitesLayout).result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(BREIT_ABFRAGE)
    expect(BREIT_ABFRAGE).toBe('(min-width: 700px) and (min-height: 600px)')
  })

  it('folgt dem Drehen des Geraets', () => {
    const geraet = stelleBreite(false)
    const { result } = renderHook(useBreitesLayout)
    act(() => geraet.drehe(true))
    expect(result.current).toBe(true)
  })
})
