import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import App from '../App'
import daten from './daten/berlin-hbf-14-6.json'
import { schreibeBeispielEntwurf } from './beispielreise'
import { SCHRITTE, type TourBildschirm } from './schritte'
import { aktiviereVorfuehrquelle, deaktiviereVorfuehrquelle, type Vorfuehrdaten } from './vorfuehrquelle'

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/eingabe')
  aktiviereVorfuehrquelle(daten as unknown as Vorfuehrdaten)
  schreibeBeispielEntwurf(new Date())
})
afterEach(() => {
  deaktiviereVorfuehrquelle()
  sessionStorage.clear()
})

function ziel(wert: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${wert}"]`)
}

/** Jedes Ziel dieses Bildschirms steht genau einmal da. */
function pruefe(bildschirm: TourBildschirm): void {
  const ziele = SCHRITTE.filter((s) => s.bildschirm === bildschirm && s.ziel).map((s) => s.ziel!)
  expect(ziele.length).toBeGreaterThan(0)
  for (const wert of ziele) {
    expect({ wert, anzahl: document.querySelectorAll(`[data-tour="${wert}"]`).length }).toEqual({ wert, anzahl: 1 })
  }
}

/**
 * Plan Einführungstour, Paket 4: Die echte App mit der Beispielreise, einmal
 * durch Eingabe, Übersicht und Weg. Fällt später ein Knopf weg oder wird
 * doppelt, schlägt dieser Test an - statt dass die Tour ins Leere zeigt.
 */
describe('Ziele der Einführungstour', () => {
  it('stehen auf jedem Bildschirm genau einmal', async () => {
    render(<App />)
    await waitFor(() => expect(ziel('starten')?.hasAttribute('disabled')).toBe(false))
    pruefe('eingabe')

    act(() => ziel('starten')!.click())
    await waitFor(() => expect(ziel('ampel')).not.toBeNull())
    pruefe('uebersicht')

    act(() => ziel('navigation-starten')!.click())
    await waitFor(() => expect(ziel('schema')).not.toBeNull())
    pruefe('weg')
  })

  // Ab 700 px hat die Eingabe Kacheln und Tafelspalten statt Reiseblöcken.
  it('stehen auch in der breiten Eingabe genau einmal', async () => {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({
      matches: true,
      media: abfrage,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      render(<App />)
      await waitFor(() => expect(ziel('starten')?.hasAttribute('disabled')).toBe(false))
      expect(ziel('ankunft')?.classList.contains('gleiskachel')).toBe(true)
      pruefe('eingabe')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
