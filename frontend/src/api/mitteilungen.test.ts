import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { meldeReiseAb, meldeReiseAn, schickeTestmitteilung, type ReiseAnmeldung } from './mitteilungen'

const reise: ReiseAnmeldung = {
  ort: { pfad: 'bahnhof', eva: '8011160' },
  bahnhofName: 'Berlin Hbf',
  haltWort: 'Gleis',
  ab: { name: 'RE 3352', anzeige: 'RE 3', soll: '2026-11-26T16:05:00.000Z', gleis: '3', richtung: 'Stralsund' },
  gehzeitSek: 240,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('Reise beim Server anmelden', () => {
  it('schickt PUT mit JSON und wertet 204 als ok, 503 als abgelehnt', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await meldeReiseAn('tok', 'ios', reise)).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/mitteilungen\/reise$/)
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ token: 'tok', plattform: 'ios', reise })

    fetchMock.mockResolvedValueOnce(new Response('{"fehler":"voll"}', { status: 503 }))
    expect(await meldeReiseAn('tok', 'ios', reise)).toBe('abgelehnt')
  })

  it('wertet ein fehlendes Netz als abgelehnt', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    expect(await meldeReiseAn('tok', 'ios', reise)).toBe('abgelehnt')
  })
})

describe('Reise abmelden', () => {
  it('schickt DELETE mit dem Token und wirft auch ohne Netz nicht', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await meldeReiseAb('tok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/mitteilungen\/reise$/)
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body)).toEqual({ token: 'tok' })

    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(meldeReiseAb('tok')).resolves.toBeUndefined()
  })
})

describe('Testmitteilung', () => {
  it('ist nur bei 204 verschickt', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await schickeTestmitteilung('tok')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/mitteilungen\/test$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ token: 'tok', plattform: 'ios' })

    fetchMock.mockResolvedValueOnce(new Response('{"fehler":"token-ungueltig"}', { status: 502 }))
    expect(await schickeTestmitteilung('tok')).toBe(false)
  })
})
