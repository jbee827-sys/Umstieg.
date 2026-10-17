import { describe, it, expect, vi, afterEach } from 'vitest'
import { verbindeHaltestelleLive, verbindeLive } from './sse'
import type { LiveEreignis, Ort } from './typen'

/** Zeichnet URL und abonnierte Ereignisse auf - jsdom kennt kein EventSource. */
class AttrappenQuelle {
  static letzte: AttrappenQuelle | undefined
  url: string
  ereignisse = new Map<string, (n: MessageEvent<string>) => void>()
  geschlossen = false
  onopen: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    AttrappenQuelle.letzte = this
  }
  addEventListener(name: string, f: (n: MessageEvent<string>) => void) {
    this.ereignisse.set(name, f)
  }
  close() {
    this.geschlossen = true
  }
}

afterEach(() => vi.unstubAllGlobals())

const AN: Ort = { name: 'Berlin Hbf', lat: 52.525, lon: 13.369, verkehrsmittel: ['bahn'], haltestelleId: 'h1' }
const AB: Ort = { name: 'Washingtonplatz', lat: 52.523, lon: 13.37, verkehrsmittel: ['bus'], haltestelleId: 'de:h 2' }

describe('verbindeHaltestelleLive', () => {
  it('oeffnet einen Strom fuer beide Haltestellen und abonniert den Ausfall', () => {
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const trenne = verbindeHaltestelleLive({ an: AN, ab: AB, fahrtAn: 'f0', fahrtAb: 'f1', onEreignis: () => {}, onWiederverbunden: () => {} })
    const q = AttrappenQuelle.letzte!
    expect(q.url).toBe('/api/live/haltestelle?an=h1&anLat=52.525&anLon=13.369&ab=de%3Ah+2&abLat=52.523&abLon=13.37&fahrtAn=f0&fahrtAb=f1')
    expect([...q.ereignisse.keys()]).toContain('ausfall')
    trenne()
    expect(q.geschlossen).toBe(true)
  })

  it('reicht den Ausfall mit Typ weiter', () => {
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const e: LiveEreignis[] = []
    verbindeHaltestelleLive({ ab: AB, fahrtAb: 'f1', onEreignis: (x) => e.push(x), onWiederverbunden: () => {} })
    AttrappenQuelle.letzte!.ereignisse.get('ausfall')!({ data: JSON.stringify({ zug: 'f1', anzeige: 'Bus 245', zeitstempel: 'z' }) } as MessageEvent<string>)
    expect(e).toEqual([{ typ: 'ausfall', zug: 'f1', anzeige: 'Bus 245', zeitstempel: 'z' }])
  })

  it('Orte ohne Haltestellen-ID werden nicht beobachtet', () => {
    vi.stubGlobal('EventSource', AttrappenQuelle)
    verbindeHaltestelleLive({ an: { ...AN, haltestelleId: undefined }, ab: AB, onEreignis: () => {}, onWiederverbunden: () => {} })
    expect(AttrappenQuelle.letzte!.url).toBe('/api/live/haltestelle?ab=de%3Ah+2&abLat=52.523&abLon=13.37')
  })

  it('ohne jede Haltestelle kein Strom - der Server antwortete nur 400, EventSource versuchte es endlos', () => {
    AttrappenQuelle.letzte = undefined
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const trenne = verbindeHaltestelleLive({ onEreignis: () => {}, onWiederverbunden: () => {} })
    expect(AttrappenQuelle.letzte).toBeUndefined()
    trenne()
  })
})

describe('verbindeLive', () => {
  it('abonniert auch im Bahnhofspfad den Ausfall', () => {
    vi.stubGlobal('EventSource', AttrappenQuelle)
    verbindeLive({ eva: '8011160', zugAn: 'ICE 1', onEreignis: () => {}, onWiederverbunden: () => {} })
    expect(AttrappenQuelle.letzte!.url).toBe('/api/live/8011160?zugAn=ICE+1')
    expect([...AttrappenQuelle.letzte!.ereignisse.keys()]).toContain('ausfall')
  })
})
