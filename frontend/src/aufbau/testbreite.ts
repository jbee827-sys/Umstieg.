import { vi } from 'vitest'

/**
 * jsdom kennt `matchMedia` nicht. Fuer Tests des breiten Aufbaus wird es
 * hier nachgestellt - samt `change`, damit sich das Drehen pruefen laesst.
 */
export function stelleBreite(breit: boolean): { drehe(neu: boolean): void } {
  const hoerer = new Set<() => void>()
  const abfrage = {
    matches: breit,
    addEventListener: (_typ: string, f: () => void) => hoerer.add(f),
    removeEventListener: (_typ: string, f: () => void) => hoerer.delete(f),
  }
  window.matchMedia = vi.fn().mockReturnValue(abfrage) as unknown as typeof window.matchMedia
  return {
    drehe(neu: boolean) {
      abfrage.matches = neu
      hoerer.forEach((f) => f())
    },
  }
}

export function raeumeBreiteAuf(): void {
  Reflect.deleteProperty(window, 'matchMedia')
}
