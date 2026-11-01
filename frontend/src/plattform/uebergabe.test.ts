import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die Uebergabe aus der Teilen-Erweiterung (Plan App Store, Paket 7): Die App
 * holt den Text beim Start und bei jeder Rueckkehr - in der Tour nie, im
 * Browser nie.
 */
const nativ = vi.hoisted(() => ({ app: true, hole: vi.fn() }))
vi.mock('./istApp', () => ({ istApp: () => nativ.app }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ hole: nativ.hole }) }))

const u = await import('./uebergabe')
const { setzeVorfuehrung } = await import('../einfuehrung/zustand')

const abwarten = () => new Promise((fertig) => setTimeout(fertig, 0))

function sichtbar(ja: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (ja ? 'visible' : 'hidden') })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  nativ.app = true
  nativ.hole.mockReset()
  u.verwirfGeteiltenText()
})

afterEach(() => setzeVorfuehrung(false))

describe('Uebergabe', () => {
  it('holt beim Start einen geteilten Text und meldet ihn', async () => {
    nativ.hole.mockResolvedValue({ text: '  Mannheim Hbf → Berlin Hbf  ' })
    const angekommen = vi.fn()
    const { result } = renderHook(() => u.useGeteilterText())
    const ende = u.beobachteUebergabe(angekommen)
    await act(abwarten)
    expect(result.current).toBe('Mannheim Hbf → Berlin Hbf')
    expect(angekommen).toHaveBeenCalledOnce()
    ende()
  })

  it('fragt bei jeder Rueckkehr in die App erneut', async () => {
    nativ.hole.mockResolvedValueOnce({}).mockResolvedValueOnce({ text: 'geteilt' })
    const angekommen = vi.fn()
    const ende = u.beobachteUebergabe(angekommen)
    await abwarten()
    expect(angekommen).not.toHaveBeenCalled()
    sichtbar(false)
    sichtbar(true)
    await abwarten()
    expect(angekommen).toHaveBeenCalledOnce()
    ende()
  })

  it('verworfen, sobald der Dialog zu ist', async () => {
    u.setzeGeteiltenText('etwas')
    const { result } = renderHook(() => u.useGeteilterText())
    act(() => u.verwirfGeteiltenText())
    expect(result.current).toBeNull()
  })

  it('in der Einfuehrungstour bleibt der Text liegen', async () => {
    setzeVorfuehrung(true)
    u.beobachteUebergabe(vi.fn())()
    await abwarten()
    expect(nativ.hole).not.toHaveBeenCalled()
  })

  it('im Browser gibt es nichts zu holen', async () => {
    nativ.app = false
    u.beobachteUebergabe(vi.fn())()
    await abwarten()
    expect(nativ.hole).not.toHaveBeenCalled()
  })

  it('ein Fehler des Plugins stoert nicht', async () => {
    nativ.hole.mockRejectedValue(new Error('kein Plugin'))
    const angekommen = vi.fn()
    u.beobachteUebergabe(angekommen)()
    await abwarten()
    expect(angekommen).not.toHaveBeenCalled()
  })
})
