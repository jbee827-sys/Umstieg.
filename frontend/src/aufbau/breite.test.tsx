import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { BREIT_AB_PX, useBreitesLayout } from './breite'
import { raeumeBreiteAuf, stelleBreite } from './testbreite'

afterEach(raeumeBreiteAuf)

describe('useBreitesLayout', () => {
  it('ist ohne matchMedia schmal', () => {
    expect(renderHook(useBreitesLayout).result.current).toBe(false)
  })

  it('fragt ab 700 px', () => {
    stelleBreite(true)
    expect(renderHook(useBreitesLayout).result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(`(min-width: ${BREIT_AB_PX}px)`)
    expect(BREIT_AB_PX).toBe(700)
  })

  it('folgt dem Drehen des Geraets', () => {
    const geraet = stelleBreite(false)
    const { result } = renderHook(useBreitesLayout)
    act(() => geraet.drehe(true))
    expect(result.current).toBe(true)
  })
})
