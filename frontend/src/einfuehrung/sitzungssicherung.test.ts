import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHLUESSEL } from '../sitzung/eingabespeicher'
import { REISE_SCHLUESSEL } from '../sitzung/reisespeicher'
import { sichere, stelleWiederHer } from './sitzungssicherung'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

/**
 * Plan Einführungstour, Paket 3: Die Tour schreibt ihren eigenen Entwurf und
 * ihre eigene Reise. Was der Nutzer vorher hatte, ist danach wieder genau so
 * da - auch das Fehlen.
 */
describe('Sitzungssicherung', () => {
  it('stellt Entwurf und Reise roh wieder her, wie sie vorher waren', () => {
    sessionStorage.setItem(SCHLUESSEL, '{"fassung":2,"entwurf":"vom Nutzer"}')
    sessionStorage.setItem(REISE_SCHLUESSEL, '{"reise":"vom Nutzer"}')
    const sicherung = sichere()
    sessionStorage.setItem(SCHLUESSEL, '{"fassung":2,"entwurf":"der Tour"}')
    sessionStorage.setItem(REISE_SCHLUESSEL, '{"reise":"der Tour"}')

    stelleWiederHer(sicherung)

    expect(sessionStorage.getItem(SCHLUESSEL)).toBe('{"fassung":2,"entwurf":"vom Nutzer"}')
    expect(sessionStorage.getItem(REISE_SCHLUESSEL)).toBe('{"reise":"vom Nutzer"}')
  })

  it('räumt weg, was die Tour angelegt hat, wenn vorher nichts da war', () => {
    const sicherung = sichere()
    sessionStorage.setItem(SCHLUESSEL, '{"fassung":2,"entwurf":"der Tour"}')
    sessionStorage.setItem(REISE_SCHLUESSEL, '{"reise":"der Tour"}')

    stelleWiederHer(sicherung)

    expect(sessionStorage.getItem(SCHLUESSEL)).toBeNull()
    expect(sessionStorage.getItem(REISE_SCHLUESSEL)).toBeNull()
  })

  // Safari im privaten Modus: Schon der Zugriff auf sessionStorage wirft.
  it('wirft nicht, wenn der Speicher fehlt', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('gesperrt', 'SecurityError')
    })
    expect(() => stelleWiederHer(sichere())).not.toThrow()
  })
})
