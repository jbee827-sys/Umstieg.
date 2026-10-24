import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Der Standort in der App (Plan App Store, Paket 5): erst erklären, dann
 * fragen. Die Browser-Schnittstelle der WebView bleibt dabei unberührt.
 */
const nativ = vi.hoisted(() => ({
  freigabe: vi.fn<() => Promise<'erteilt' | 'verweigert' | 'offen'>>(),
  frage: vi.fn<() => Promise<'erteilt' | 'verweigert' | 'offen'>>(),
  position: vi.fn(() => Promise.resolve({ lat: 52.525, lon: 13.369, genauigkeitM: 12, zeitstempel: 1 })),
  verfolge: vi.fn(() => () => undefined),
}))

vi.mock('../plattform/istApp', () => ({ istApp: () => true }))
vi.mock('./appStandort', () => ({
  appFreigabe: nativ.freigabe,
  frageAppFreigabe: nativ.frage,
  appPosition: nativ.position,
  verfolgeAppPosition: nativ.verfolge,
}))

const { useStandort } = await import('./useStandort')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: vi.fn(), watchPosition: vi.fn() } })
})

describe('useStandort in der App', () => {
  it('fragt beim Start nicht, sondern lässt erst erklären', async () => {
    nativ.freigabe.mockResolvedValue('offen')
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erklaeren'))
    expect(nativ.frage).not.toHaveBeenCalled()
    expect(nativ.position).not.toHaveBeenCalled()
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('erst der Knopf zeigt die Systemabfrage - dann wird geortet', async () => {
    nativ.freigabe.mockResolvedValue('offen')
    nativ.frage.mockResolvedValue('erteilt')
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erklaeren'))
    act(() => result.current.erlaube())
    await waitFor(() => expect(result.current.status).toBe('erteilt'))
    expect(result.current.standort?.lat).toBe(52.525)
  })

  it('abgelehnt am Knopf heißt verweigert', async () => {
    nativ.freigabe.mockResolvedValue('offen')
    nativ.frage.mockResolvedValue('verweigert')
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erklaeren'))
    act(() => result.current.erlaube())
    await waitFor(() => expect(result.current.status).toBe('verweigert'))
  })

  it('mit Freigabe von früher wird sofort geortet', async () => {
    nativ.freigabe.mockResolvedValue('erteilt')
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erteilt'))
    expect(nativ.frage).not.toHaveBeenCalled()
  })

  it('Ortungsdienste aus: nicht verfügbar', async () => {
    nativ.freigabe.mockRejectedValue(new Error('Location services are not enabled'))
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('nicht-verfuegbar'))
  })

  it('verfolgt nur mit Freigabe - sonst käme die Systemabfrage ohne Erklärung', async () => {
    nativ.freigabe.mockResolvedValue('offen')
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erklaeren'))
    act(() => result.current.starteVerfolgung())
    expect(nativ.verfolge).not.toHaveBeenCalled()
  })

  it('mit Freigabe startet und endet die Verfolgung über das Plugin', async () => {
    nativ.freigabe.mockResolvedValue('erteilt')
    const beende = vi.fn()
    nativ.verfolge.mockReturnValue(beende)
    const { result } = renderHook(() => useStandort())
    await waitFor(() => expect(result.current.status).toBe('erteilt'))
    act(() => result.current.starteVerfolgung())
    expect(nativ.verfolge).toHaveBeenCalledOnce()
    act(() => result.current.stoppeVerfolgung())
    expect(beende).toHaveBeenCalledOnce()
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled()
  })
})
