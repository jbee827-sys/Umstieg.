import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Nutzungszählung der App (Plan App Store, Paket 4): ohne Zustimmung geht
 * nichts hinaus, die Einführungstour zählt nie, und Vercel bleibt in der App
 * stumm.
 */
const umgebung = vi.hoisted(() => ({ app: true, track: vi.fn() }))
vi.mock('../plattform/istApp', () => ({ istApp: () => umgebung.app }))
vi.mock('@vercel/analytics', () => ({ track: umgebung.track }))

const { liesEinwilligung, setzeEinwilligung, sollFragen, zaehleInApp } = await import('./einwilligung')
const { melde } = await import('./ereignis')
const { setzeVorfuehrung } = await import('../einfuehrung/zustand')

const fetchAttrappe = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))

beforeEach(() => {
  umgebung.app = true
  window.localStorage.clear()
  fetchAttrappe.mockClear()
  umgebung.track.mockClear()
  vi.stubGlobal('fetch', fetchAttrappe)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setzeVorfuehrung(false)
})

describe('Einwilligung', () => {
  it('ohne Antwort wird gefragt - nur in der App', () => {
    expect(liesEinwilligung()).toBeNull()
    expect(sollFragen(null)).toBe(true)
    umgebung.app = false
    expect(sollFragen(null)).toBe(false)
  })

  it('die Antwort bleibt und ist widerrufbar', () => {
    setzeEinwilligung('ja')
    expect(liesEinwilligung()).toBe('ja')
    expect(sollFragen('ja')).toBe(false)
    setzeEinwilligung('nein')
    expect(liesEinwilligung()).toBe('nein')
  })
})

describe('Zählen in der App', () => {
  it('ohne Antwort geht nichts hinaus', () => {
    zaehleInApp('start')
    melde('navigation-start')
    expect(fetchAttrappe).not.toHaveBeenCalled()
  })

  it('mit „Nein“ geht nichts hinaus', () => {
    setzeEinwilligung('nein')
    zaehleInApp('start')
    melde('ziel')
    expect(fetchAttrappe).not.toHaveBeenCalled()
  })

  it('mit „Ja“ geht genau der Name ans eigene Backend - und nie an Vercel', () => {
    setzeEinwilligung('ja')
    melde('navigation-start')
    expect(fetchAttrappe).toHaveBeenCalledOnce()
    const [adresse, optionen] = fetchAttrappe.mock.calls[0] as unknown as [string, RequestInit]
    expect(adresse).toMatch(/\/api\/zaehle$/)
    expect(optionen.method).toBe('POST')
    expect(optionen.body).toBe('navigation-start')
    expect(umgebung.track).not.toHaveBeenCalled()
  })

  it('die Einführungstour zählt nie, auch mit „Ja“', () => {
    setzeEinwilligung('ja')
    setzeVorfuehrung(true)
    zaehleInApp('bildschirm-weg')
    melde('schritt-1')
    expect(fetchAttrappe).not.toHaveBeenCalled()
  })
})

describe('Im Browser wie bisher', () => {
  it('Vercel zählt ohne Abfrage, das Backend nie', () => {
    umgebung.app = false
    setzeEinwilligung('ja')
    melde('eingabe-fertig')
    zaehleInApp('start')
    expect(umgebung.track).toHaveBeenCalledWith('eingabe-fertig')
    expect(fetchAttrappe).not.toHaveBeenCalled()
  })
})
