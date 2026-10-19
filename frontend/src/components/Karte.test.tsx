import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Karte } from './Karte'

/**
 * MapLibre zeichnet in jsdom nichts - die Karte wird hier nachgestellt und
 * nur aufgezeichnet, welche Daten sie beim Laden bekommt.
 */
// vi.mock wird nach oben gehoben - die Liste muss es auch.
const { workerAdressen } = vi.hoisted(() => ({ workerAdressen: [] as string[] }))
const karten: {
  quellen: Record<string, unknown>
  laden?: () => void
  grenzen: unknown[]
  einpassungen: { maxZoom?: number }[]
  optionen: { maxZoom?: number }
}[] = []
vi.mock('maplibre-gl', () => {
  class Map {
    quellen: Record<string, unknown> = {}
    grenzen: unknown[] = []
    einpassungen: unknown[] = []
    optionen: unknown
    constructor(optionen: unknown) {
      this.optionen = optionen
      karten.push(this as never)
    }
    on(ereignis: string, f: () => void) {
      if (ereignis === 'load') (this as unknown as { laden: () => void }).laden = f
    }
    addSource(id: string, q: { data: unknown }) {
      this.quellen[id] = q.data
    }
    addLayer() {}
    getSource() {
      return undefined
    }
    fitBounds(b: unknown, o: unknown) {
      this.grenzen.push(b)
      this.einpassungen.push(o)
    }
    remove() {}
  }
  class LngLatBounds {
    extend() {
      return this
    }
  }
  return { Map, LngLatBounds, setWorkerUrl: (u: string) => workerAdressen.push(u) }
})

const linie = (lon: number) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lon, 52.5], [lon + 0.001, 52.5]] }, properties: { route: true } }],
})

describe('Karte (Browserpruefung 18.10.2026)', () => {
  it('offen gestartet, laedt sie die Ebene des aktiven Schritts, nicht Ebene 0', () => {
    karten.length = 0
    render(
      <Karte
        karte={{ '0': linie(13.37), '-2': linie(13.369) }}
        aktiverSchritt={{ text: 'Nach Ausstieg 80 m geradeaus', typ: 'eben', sekunden: 75, level: -2, knotenVon: 0, knotenBis: 1 }}
        anfangsOffen
      />,
    )
    const map = karten[0] as unknown as { laden: () => void; quellen: Record<string, unknown> }
    map.laden()
    expect(map.quellen.route).toEqual(linie(13.369))
  })
})

/*
 * Browserpruefung 19.10.2026: Beim Schritt zoomte die Karte auf 19. MapLibre
 * holt 256er-Kacheln eine Stufe tiefer - also Stufe 20, und die liefert
 * tile.openstreetmap.org nicht. Jeder Schritt endete mit fehlgeschlagenen
 * Kachelabrufen. Hoechstens 18 heisst: Kacheln hoechstens Stufe 19.
 */
describe('Karte: Zoom hoechstens 18 (Browserpruefung 19.10.2026)', () => {
  it('weder die Karte noch ein Einpassen geht ueber 18', () => {
    karten.length = 0
    render(
      <Karte
        karte={{ '0': linie(13.37) }}
        aktiverSchritt={{ text: 'Nach Ausstieg 80 m geradeaus', typ: 'eben', sekunden: 75, level: 0, knotenVon: 0, knotenBis: 1 }}
        anfangsOffen
      />,
    )
    const map = karten[0]
    map.laden!()
    expect(map.optionen.maxZoom).toBe(18)
    expect(map.einpassungen.length).toBeGreaterThan(0)
    for (const e of map.einpassungen) expect(e.maxZoom).toBeLessThanOrEqual(18)
  })
})

describe('Karte: MapLibre-Worker (Browserpruefung 18.10.2026)', () => {
  it('gibt MapLibre eine gebuendelte Worker-Adresse - sonst lud der Browser index.html und keine Linie erschien', () => {
    expect(workerAdressen.length).toBeGreaterThan(0)
    expect(workerAdressen[0]).toMatch(/maplibre-gl-worker/)
  })
})
