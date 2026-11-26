import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ABGLEICH_ABSTAND_MS, mitTreffer, useZugabgleich } from './useZugabgleich'
import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
const holeTafelMock = vi.mocked(holeTafel)

/**
 * Spaeter Abgleich (22.11.2026): Die Tafel reicht etwa zwei Stunden voraus.
 * Wer die Reise in Frankfurt teilt und in Berlin umsteigt, findet den
 * Anschluss beim Import noch nicht - erst unterwegs.
 */
const WERTE: EingabeWerte = {
  eva: '8011160',
  bahnhofName: 'Berlin Hbf',
  gleisAn: '8',
  gleisAb: '6',
  wagenAn: '',
  wagenAb: '',
  profil: 'normal',
  variante: 'schnellste',
  abschnitt: 'mitte',
  zugAnName: 'ICE 1134',
  zugAbName: 'RE3 (3352)',
  ankunftZeit: '16:01',
  abfahrtZeit: '16:23',
  zugAbAusText: true,
}
const RE3: TafelEintrag = { zug: 'RE 3352', anzeige: 'RE 3', zeitSoll: '16:23', zeitIst: '16:25', gleisSoll: '6', ziel: 'Schwedt(Oder)' }

describe('mitTreffer', () => {
  it('setzt Name, Linie und Zeit der Tafel und vergisst die Herkunft aus dem Text', () => {
    const neu = mitTreffer(WERTE, { ab: RE3 })
    expect(neu.zugAbName).toBe('RE 3352')
    expect(neu.zugAbAnzeige).toBe('RE 3')
    expect(neu.abfahrtZeit).toBe('16:25')
    expect(neu.zugAbAusText).toBeUndefined()
    // Der Ankunftszug bleibt, wie er war.
    expect(neu.zugAnName).toBe('ICE 1134')
  })

  it('traegt beim Ankunftszug auch Zugnummer und Nachbarhalte', () => {
    const ice: TafelEintrag = { zug: 'ICE 1134', zeitSoll: '16:01', gleisSoll: '8', ziel: 'Frankfurt', vonHalt: 'Berlin Südkreuz' }
    const neu = mitTreffer({ ...WERTE, zugAnAusText: true }, { an: ice })
    expect(neu.zugAn).toBe('1134')
    expect(neu.vonHalt).toBe('Berlin Südkreuz')
    expect(neu.zugAnAusText).toBeUndefined()
  })

  it('nimmt Herkunft und Ziel der Tafel fuer die Server-Mitteilungen', () => {
    const ice: TafelEintrag = { zug: 'ICE 1134', zeitSoll: '16:01', gleisSoll: '8', ziel: 'Frankfurt' }
    const neu = mitTreffer({ ...WERTE, zugAnAusText: true }, { an: ice, ab: RE3 })
    expect(neu.zugAnVon).toBe('Frankfurt')
    expect(neu.zugAbNach).toBe(RE3.ziel)
  })
})

describe('useZugabgleich', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    holeTafelMock.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('versucht es sofort und dann in Abstaenden, bis der Zug in der Tafel steht', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [] })
    const uebernimm = vi.fn()
    renderHook(() => useZugabgleich(WERTE, true, uebernimm))

    await act(async () => {})
    expect(holeTafelMock).toHaveBeenCalledTimes(1)
    expect(uebernimm).not.toHaveBeenCalled()

    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [RE3] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ABGLEICH_ABSTAND_MS)
    })
    expect(uebernimm).toHaveBeenCalledTimes(1)
    expect(uebernimm.mock.calls[0][0].zugAbName).toBe('RE 3352')
  })

  it('fragt nicht, wenn nichts aus dem Text stammt', async () => {
    const uebernimm = vi.fn()
    renderHook(() => useZugabgleich({ ...WERTE, zugAbAusText: undefined }, true, uebernimm))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ABGLEICH_ABSTAND_MS * 2)
    })
    expect(holeTafelMock).not.toHaveBeenCalled()
  })

  it('fragt nicht, solange keine Reise laeuft', async () => {
    renderHook(() => useZugabgleich(WERTE, false, vi.fn()))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ABGLEICH_ABSTAND_MS)
    })
    expect(holeTafelMock).not.toHaveBeenCalled()
  })
})
