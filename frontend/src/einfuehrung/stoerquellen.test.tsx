import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import App from '../App'
import daten from './daten/berlin-hbf-14-6.json'
import { beispielEntwurf } from './beispielreise'
import { setzeFormularVorgabe } from './formularstand'
import { aktiviereVorfuehrquelle, deaktiviereVorfuehrquelle, type Vorfuehrdaten } from './vorfuehrquelle'
import { setzeVorfuehrung } from './zustand'

const verfolgung = vi.fn(() => 1)

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/eingabe')
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: vi.fn(),
      watchPosition: verfolgung,
      clearWatch: vi.fn(),
    },
  })
  aktiviereVorfuehrquelle(daten as unknown as Vorfuehrdaten)
  setzeFormularVorgabe(beispielEntwurf(new Date()))
})
afterEach(() => {
  // Erst abbauen: Beim Abbau ruft die App clearWatch - am gestellten Navigator.
  cleanup()
  setzeVorfuehrung(false)
  deaktiviereVorfuehrquelle()
  vi.unstubAllGlobals()
  verfolgung.mockClear()
  sessionStorage.clear()
})

function ziel(wert: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${wert}"]`)
}

async function zurUebersicht(): Promise<void> {
  render(<App />)
  await waitFor(() => expect(ziel('starten')?.hasAttribute('disabled')).toBe(false))
  act(() => ziel('starten')!.click())
  await waitFor(() => expect(ziel('ampel')).not.toBeNull())
  // Die Verfolgung startet in einem Effekt nach dem Wechsel - abwarten.
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 50))
  })
}

/**
 * Plan Einführungstour 5.3: Ein echter Standort darf in die Vorführung nicht
 * hineinreden - kein „Angekommen“ am Beispielgleis, nur weil jemand gerade
 * in Berlin Hbf steht. Ohne Verfolgung gibt es dafür keinen Anlass.
 */
describe('Störquellen der Einführungstour', () => {
  it('verfolgt den Standort während der Vorführung nicht', async () => {
    setzeVorfuehrung(true)
    await zurUebersicht()
    expect(verfolgung).not.toHaveBeenCalled()
  })

  it('verfolgt ihn außerhalb der Vorführung wie bisher', async () => {
    await zurUebersicht()
    expect(verfolgung).toHaveBeenCalled()
  })
})
