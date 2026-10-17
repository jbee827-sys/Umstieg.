import { describe, it, expect, vi, afterEach } from 'vitest'
import { sucheOrte, orteNahebei } from './orte'
afterEach(() => vi.unstubAllGlobals())
const ANTWORT = { orte: [{ name: 'Kassel Rathaus', lat: 51.3, lon: 9.4, verkehrsmittel: ['tram'], haltestelleId: 'de-DELFI_de:06611:200003::A' }], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } }
describe('sucheOrte', () => {
  it('kodiert den Suchtext und liefert die Antwort', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(ANTWORT)))
    vi.stubGlobal('fetch', f)
    expect(await sucheOrte('Kassel Rathaus')).toEqual({ ok: true, antwort: ANTWORT })
    expect(String(f.mock.calls[0][0])).toBe('/api/orte?q=Kassel%20Rathaus')
  })
  it('503 heisst nicht verfuegbar, Netzfehler heisst netz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    expect(await sucheOrte('x')).toEqual({ ok: false, fehler: 'nicht-verfuegbar' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await sucheOrte('x')).toEqual({ ok: false, fehler: 'netz' })
  })
  it('Standortsuche schickt die Koordinate so, wie sie kommt (gerundet wird vorher)', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(ANTWORT)))
    vi.stubGlobal('fetch', f)
    await orteNahebei(51.313, 9.493)
    expect(String(f.mock.calls[0][0])).toBe('/api/orte?lat=51.313&lon=9.493')
  })
})
