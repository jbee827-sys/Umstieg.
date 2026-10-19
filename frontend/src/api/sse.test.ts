import { describe, it, expect, vi, afterEach } from 'vitest'
import { verbindeHaltestelleLive, verbindeLive } from './sse'
import type { LiveEreignis, Ort } from './typen'

/** Zeichnet URL und abonnierte Ereignisse auf - jsdom kennt kein EventSource. */
class AttrappenQuelle {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static letzte: AttrappenQuelle | undefined
  static alle: AttrappenQuelle[] = []
  url: string
  ereignisse = new Map<string, (n: MessageEvent<string>) => void>()
  geschlossen = false
  readyState = AttrappenQuelle.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    AttrappenQuelle.letzte = this
    AttrappenQuelle.alle.push(this)
  }
  addEventListener(name: string, f: (n: MessageEvent<string>) => void) {
    this.ereignisse.set(name, f)
  }
  close() {
    this.geschlossen = true
    this.readyState = AttrappenQuelle.CLOSED
  }
  oeffne() {
    this.readyState = AttrappenQuelle.OPEN
    this.onopen?.()
  }
  /** Wie der Browser bei einer Antwort ausser 200 (etwa 503): endgueltig zu, kein eigener neuer Versuch. */
  abgewiesen() {
    this.readyState = AttrappenQuelle.CLOSED
    this.onerror?.()
  }
  /** Wie der Browser bei einem Netzabbruch: Er versucht es selbst wieder. */
  abgebrochen() {
    this.readyState = AttrappenQuelle.CONNECTING
    this.onerror?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  AttrappenQuelle.alle = []
})

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

/*
 * Browserpruefung 19.10.2026: Der Server wies einen Strom mit 503 ab (zu viele
 * Verbindungen). EventSource gibt nach einer Antwort ausser 200 endgueltig auf -
 * der Umstieg lief danach ohne Live-Daten weiter, und nichts sagte es.
 */
describe('Strom nach einer Abweisung', () => {
  const oeffne = (onWiederverbunden = () => {}) =>
    verbindeLive({ eva: '8011160', onEreignis: () => {}, onWiederverbunden })

  it('baut nach 5 s selbst neu auf und meldet die Neuverbindung', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const wieder = vi.fn()
    oeffne(wieder)
    AttrappenQuelle.alle[0].abgewiesen()

    vi.advanceTimersByTime(4_999)
    expect(AttrappenQuelle.alle).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(AttrappenQuelle.alle).toHaveLength(2)
    expect(AttrappenQuelle.alle[1].url).toBe('/api/live/8011160')

    // In der Luecke kann etwas passiert sein - deshalb neu rechnen.
    AttrappenQuelle.alle[1].oeffne()
    expect(wieder).toHaveBeenCalledTimes(1)
  })

  it('wartet nach jeder weiteren Abweisung doppelt so lange, hoechstens eine Minute', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    oeffne()
    const pausen: number[] = []
    for (let i = 0; i < 6; i++) {
      const vorher = AttrappenQuelle.alle.length
      AttrappenQuelle.alle[vorher - 1].abgewiesen()
      let ms = 0
      while (AttrappenQuelle.alle.length === vorher && ms < 120_000) {
        vi.advanceTimersByTime(1_000)
        ms += 1_000
      }
      pausen.push(ms)
    }
    expect(pausen).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
  })

  it('nach einer geglueckten Verbindung beginnt die Wartezeit wieder bei 5 s', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    oeffne()
    AttrappenQuelle.alle[0].abgewiesen()
    vi.advanceTimersByTime(5_000)
    AttrappenQuelle.alle[1].abgewiesen()
    vi.advanceTimersByTime(10_000)
    AttrappenQuelle.alle[2].oeffne()
    AttrappenQuelle.alle[2].abgewiesen()
    vi.advanceTimersByTime(5_000)
    expect(AttrappenQuelle.alle).toHaveLength(4)
  })

  it('getrennt waehrend der Wartezeit: kein neuer Strom', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const trenne = oeffne()
    AttrappenQuelle.alle[0].abgewiesen()
    trenne()
    vi.advanceTimersByTime(120_000)
    expect(AttrappenQuelle.alle).toHaveLength(1)
  })

  it('trennen schliesst auch den neu aufgebauten Strom', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const trenne = oeffne()
    AttrappenQuelle.alle[0].abgewiesen()
    vi.advanceTimersByTime(5_000)
    trenne()
    expect(AttrappenQuelle.alle[1].geschlossen).toBe(true)
  })

  it('ein Netzabbruch bleibt EventSource ueberlassen - es verbindet selbst neu', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    oeffne()
    AttrappenQuelle.alle[0].oeffne()
    AttrappenQuelle.alle[0].abgebrochen()
    vi.advanceTimersByTime(120_000)
    expect(AttrappenQuelle.alle).toHaveLength(1)
  })

  it('der neue Strom hoert auf dieselben Ereignisse', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', AttrappenQuelle)
    const e: LiveEreignis[] = []
    verbindeLive({ eva: '8011160', onEreignis: (x) => e.push(x), onWiederverbunden: () => {} })
    AttrappenQuelle.alle[0].abgewiesen()
    vi.advanceTimersByTime(5_000)
    AttrappenQuelle.alle[1].ereignisse.get('verspaetung')!({ data: JSON.stringify({ zug: 'ICE 1', neu: '10:05', zeitstempel: 'z' }) } as MessageEvent<string>)
    expect(e).toEqual([{ typ: 'verspaetung', zug: 'ICE 1', neu: '10:05', zeitstempel: 'z' }])
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
