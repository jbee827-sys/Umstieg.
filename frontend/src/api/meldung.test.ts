import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendeMeldung } from './meldung'
import { apiUrl } from './basis'

afterEach(() => vi.unstubAllGlobals())

describe('sendeMeldung', () => {
  it('schickt Text und Adresse als JSON an /api/meldung', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', f)
    expect(await sendeMeldung('Gleis 6 fehlt.', 'anna@beispiel.de')).toBe(true)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(apiUrl('/api/meldung'))
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Gleis 6 fehlt.', email: 'anna@beispiel.de' })
  })

  it('laesst eine leere Adresse weg', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', f)
    await sendeMeldung('Gleis 6 fehlt.', '   ')
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ text: 'Gleis 6 fehlt.' })
  })

  it('502 ist ein Fehlschlag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
    expect(await sendeMeldung('Gleis 6 fehlt.', '')).toBe(false)
  })

  it('ein Netzfehler ist ein Fehlschlag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await sendeMeldung('Gleis 6 fehlt.', '')).toBe(false)
  })
})
