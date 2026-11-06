import { describe, expect, it } from 'vitest'
import { schrittStueck } from './kartenstueck'

const linie = (ab: number | undefined, lons: number[]) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: lons.map((lon) => [lon, 52]) },
  properties: { route: true, ...(ab !== undefined ? { knotenAb: ab } : {}) },
})

// Pfad: 0,1,2 auf Ebene 0 - Treppe - 3,4,5 auf Ebene -1 - Treppe - 6,7 auf Ebene 0
const karte = {
  '0': { type: 'FeatureCollection', features: [linie(0, [1, 2, 3]), linie(6, [7, 8])] },
  '-1': { type: 'FeatureCollection', features: [linie(3, [4, 5, 6])] },
}

describe('schrittStueck (Konzept 09: Karte zum Text)', () => {
  it('schneidet den Schritt aus der richtigen Ebene, nach Pfadindex', () => {
    expect(schrittStueck(karte, 3, 5)).toEqual([
      { ebene: '-1', koordinaten: [[4, 52], [5, 52], [6, 52]] },
    ])
  })

  it('ein Schritt ueber zwei Ebenen bekommt beide Teile, in der Reihenfolge des Wegs', () => {
    // „Zweiter Aufgang rechts, Treppe hoch zu Gleis 3“: unten 4..5, oben 6..7
    expect(schrittStueck(karte, 4, 7)).toEqual([
      { ebene: '-1', koordinaten: [[5, 52], [6, 52]] },
      { ebene: '0', koordinaten: [[7, 52], [8, 52]] },
    ])
  })

  it('eine Treppe allein beruehrt zwei Ebenen mit je einem Punkt', () => {
    expect(schrittStueck(karte, 2, 3)).toEqual([
      { ebene: '0', koordinaten: [[3, 52]] },
      { ebene: '-1', koordinaten: [[4, 52]] },
    ])
  })

  it('ohne Pfadindex (aeltere Antwort) und ohne Schrittbereich: null', () => {
    const alt = { '0': { type: 'FeatureCollection', features: [linie(undefined, [1, 2])] } }
    expect(schrittStueck(alt, 0, 1)).toBeNull()
    expect(schrittStueck(karte, undefined, 1)).toBeNull()
  })
})
