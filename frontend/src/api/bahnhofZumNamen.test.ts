import { describe, it, expect, vi, afterEach } from 'vitest'
import { bahnhofZumNamen } from './bahnhofZumNamen'

afterEach(() => vi.unstubAllGlobals())

const ORT = { name: 'Bernau (b Berlin)', lat: 52.68, lon: 13.59, verkehrsmittel: ['bahn'], eva: '8010020' }

describe('bahnhofZumNamen', () => {
  it('liefert den Ort und kodiert den Namen', async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ ort: ORT })))
    vi.stubGlobal('fetch', f)
    expect(await bahnhofZumNamen('Bernau (S)')).toEqual(ORT)
    expect(String(f.mock.calls[0][0])).toContain('name=Bernau%20(S)')
  })

  it('200 mit ort null heisst null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ort: null }))))
    expect(await bahnhofZumNamen('Nirgendwo')).toBeNull()
  })

  it('502 heisst null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
    expect(await bahnhofZumNamen('x')).toBeNull()
  })

  it('Netzfehler heisst null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await bahnhofZumNamen('x')).toBeNull()
  })

  it('kaputtes JSON heisst null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('kein json')))
    expect(await bahnhofZumNamen('x')).toBeNull()
  })
})
