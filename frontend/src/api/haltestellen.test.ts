import { describe, it, expect, vi, afterEach } from 'vitest'
import { holeHaltestellenTafel, holeWeg, steigpunktAus } from './haltestellen'
import { RouteFehler } from './client'
afterEach(() => vi.unstubAllGlobals())
const ORT = { name: 'Kassel Rathaus', lat: 51.31263, lon: 9.49286, verkehrsmittel: ['tram' as const], haltestelleId: 'de-DELFI_de:06611:200003::A' }
describe('holeHaltestellenTafel', () => {
  it('schickt ID und Koordinate (Rueckfall A5)', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ eintraege: [], stand: '2026-10-16T14:00:00Z' })))
    vi.stubGlobal('fetch', f)
    expect(await holeHaltestellenTafel(ORT, 'dep')).toEqual({ ok: true, eintraege: [], stand: '2026-10-16T14:00:00Z' })
    expect(String(f.mock.calls[0][0])).toBe('/api/haltestelle/tafel?id=de-DELFI_de%3A06611%3A200003%3A%3AA&lat=51.31263&lon=9.49286&typ=dep')
  })
  it.each([
    [503, { fehler: 'haltestellen-nicht-verfuegbar' }, 'nicht-verfuegbar'],
    [503, { fehler: 'haltestellen-nicht-eingerichtet' }, 'nicht-eingerichtet'],
    [404, { fehler: 'haltestelle-unbekannt' }, 'unbekannt'],
  ])('%i %j -> %s', async (status, body, fehler) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
    expect(await holeHaltestellenTafel(ORT, 'dep')).toEqual({ ok: false, fehler })
  })
  it('ohne Haltestellen-ID kein Abruf', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await holeHaltestellenTafel({ ...ORT, haltestelleId: undefined }, 'dep')).toEqual({ ok: false, fehler: 'unbekannt' })
    expect(f).not.toHaveBeenCalled()
  })
})
describe('holeWeg', () => {
  it('baut die Abfrage und wirft RouteFehler mit Code', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ fehler: 'haltestellen-nicht-verfuegbar', detail: 'Haltestellendaten gerade nicht verfügbar.' }), { status: 503 }))
    vi.stubGlobal('fetch', f)
    await expect(holeWeg({ von: { lat: 1, lon: 2, level: -2 }, nach: { lat: 1, lon: 2.001 }, profil: 'normal', variante: 'barrierefrei', ziel: 'Steig B' })).rejects.toMatchObject({ code: 'haltestellen-nicht-verfuegbar' })
    expect(String(f.mock.calls[0][0])).toBe('/api/weg?vonLat=1&vonLon=2&nachLat=1&nachLon=2.001&profil=normal&variante=barrierefrei&vonLevel=-2&ziel=Steig+B')
    expect(RouteFehler).toBeDefined()
  })
})
describe('steigpunktAus', () => {
  it('mit und ohne Ebene', () => {
    expect(steigpunktAus({ steigLat: 1, steigLon: 2, steigLevel: -2 } as never)).toEqual({ lat: 1, lon: 2, level: -2 })
    expect(steigpunktAus({ steigLat: 1, steigLon: 2 } as never)).toEqual({ lat: 1, lon: 2 })
  })
})
