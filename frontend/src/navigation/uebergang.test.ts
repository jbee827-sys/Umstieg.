import { afterEach, describe, expect, it, vi } from 'vitest'
import { mitUebergang, uebergangsart } from './uebergang'

/** Spec 2026-10-11 Seitenuebergaenge, §5. */
describe('uebergangsart', () => {
  it('geht im Ablauf vorwaerts und rueckwaerts', () => {
    expect(uebergangsart('eingabe', 'dashboard', 'ablauf')).toBe('vor')
    expect(uebergangsart('dashboard', 'navigation', 'ablauf')).toBe('vor')
    expect(uebergangsart('navigation', 'angekommen', 'ablauf')).toBe('vor')
    expect(uebergangsart('angekommen', 'eingabe', 'ablauf')).toBe('zurueck')
    expect(uebergangsart('navigation', 'dashboard', 'verlauf')).toBe('zurueck')
    expect(uebergangsart('eingabe', 'navigation', 'verlauf')).toBe('vor')
  })

  it('blendet quer ueber die Leiste und bei den Meldungen', () => {
    expect(uebergangsart('dashboard', 'navigation', 'leiste')).toBe('quer')
    expect(uebergangsart('meldungen', 'dashboard', 'ablauf')).toBe('quer')
    expect(uebergangsart('dashboard', 'meldungen', 'verlauf')).toBe('quer')
  })
})

describe('mitUebergang', () => {
  const wurzel = document.documentElement
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
    Reflect.deleteProperty(window, 'matchMedia')
    delete wurzel.dataset.uebergang
  })

  function stelleUebergangBereit(finished: Promise<unknown> = Promise.resolve()) {
    const arten: (string | undefined)[] = []
    const start = vi.fn((cb: () => void) => {
      arten.push(wurzel.dataset.uebergang)
      cb()
      return {
        finished,
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition() {},
      }
    })
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    return { start, arten }
  }

  it('aendert sofort, wenn der Browser keine View Transitions kennt', () => {
    const aendere = vi.fn()
    mitUebergang('vor', aendere)
    expect(aendere).toHaveBeenCalledOnce()
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('setzt die Art fuer das CSS und raeumt danach auf', async () => {
    const { start, arten } = stelleUebergangBereit()
    const aendere = vi.fn()
    mitUebergang('zurueck', aendere)
    expect(start).toHaveBeenCalledOnce()
    expect(arten).toEqual(['zurueck'])
    expect(aendere).toHaveBeenCalledOnce()
    await new Promise((r) => setTimeout(r, 0))
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('raeumt auch auf, wenn der Uebergang abgelehnt wird', async () => {
    stelleUebergangBereit(Promise.reject(new Error('verdeckt')))
    mitUebergang('vor', vi.fn())
    await new Promise((r) => setTimeout(r, 0))
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('bewegt nichts bei reduzierter Bewegung', () => {
    const { start } = stelleUebergangBereit()
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const aendere = vi.fn()
    mitUebergang('vor', aendere)
    expect(start).not.toHaveBeenCalled()
    expect(aendere).toHaveBeenCalledOnce()
  })

  it('bewegt nichts, wenn der Browser schon selbst animiert', () => {
    const { start } = stelleUebergangBereit()
    const aendere = vi.fn()
    mitUebergang('zurueck', aendere, { browserAnimiert: true })
    expect(start).not.toHaveBeenCalled()
    expect(aendere).toHaveBeenCalledOnce()
  })
})
