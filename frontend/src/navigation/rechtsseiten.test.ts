import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RECHTSPFAD,
  leiteRauteUm,
  oeffneRechtsseite,
  rechtsseiteAusPfad,
  schliesseRechtsseite,
} from './rechtsseiten'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('rechtsseiteAusPfad', () => {
  it('kennt Impressum und Datenschutz', () => {
    expect(rechtsseiteAusPfad('/impressum')).toBe('impressum')
    expect(rechtsseiteAusPfad('/datenschutz')).toBe('datenschutz')
  })

  it('verzeiht einen Schraegstrich am Ende', () => {
    expect(rechtsseiteAusPfad('/impressum/')).toBe('impressum')
  })

  it('kennt die Bildschirme der App nicht', () => {
    expect(rechtsseiteAusPfad('/')).toBeNull()
    expect(rechtsseiteAusPfad('/eingabe')).toBeNull()
    expect(rechtsseiteAusPfad('/weg')).toBeNull()
  })

  it('nennt die Pfade wie die Seiten', () => {
    expect(RECHTSPFAD).toEqual({ impressum: '/impressum', datenschutz: '/datenschutz', daten: '/daten' })
  })
})

/**
 * Bis zum 21.10.2026 hingen die Rechtsseiten am Hash (#impressum). Solche
 * Links sind geteilt worden und stehen womoeglich in fremden Seiten - sie
 * muessen weiter funktionieren.
 */
describe('leiteRauteUm', () => {
  it('macht aus #impressum die Adresse /impressum, ohne neuen Verlaufseintrag', () => {
    window.history.replaceState(null, '', '/#impressum')
    const laenge = window.history.length
    leiteRauteUm()
    expect(window.location.pathname).toBe('/impressum')
    expect(window.location.hash).toBe('')
    expect(window.history.length).toBe(laenge)
  })

  it('macht aus /uebersicht#datenschutz die Adresse /datenschutz', () => {
    window.history.replaceState(null, '', '/uebersicht#datenschutz')
    leiteRauteUm()
    expect(window.location.pathname).toBe('/datenschutz')
  })

  it('laesst andere Hashes stehen', () => {
    window.history.replaceState(null, '', '/eingabe#irgendwas')
    leiteRauteUm()
    expect(window.location.pathname).toBe('/eingabe')
    expect(window.location.hash).toBe('#irgendwas')
  })
})

describe('oeffneRechtsseite und schliesseRechtsseite', () => {
  it('oeffnet per pushState - das zaehlt die Reichweitenmessung als Seitenaufruf', () => {
    window.history.replaceState(null, '', '/uebersicht')
    const push = vi.spyOn(window.history, 'pushState')
    oeffneRechtsseite('impressum')
    expect(push).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/impressum')
    push.mockRestore()
  })

  it('meldet den Wechsel, damit die App neu zeichnet', () => {
    const gemeldet = vi.fn()
    window.addEventListener('umstieg:adresse', gemeldet)
    oeffneRechtsseite('datenschutz')
    expect(gemeldet).toHaveBeenCalledTimes(1)
    window.removeEventListener('umstieg:adresse', gemeldet)
  })

  it('geht beim Schliessen einen Schritt zurueck, wenn die App die Seite geoeffnet hat', () => {
    window.history.replaceState(null, '', '/uebersicht')
    oeffneRechtsseite('impressum')
    const zurueck = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    schliesseRechtsseite('/eingabe')
    expect(zurueck).toHaveBeenCalledTimes(1)
    zurueck.mockRestore()
  })

  // Direkt aufgerufen (Lesezeichen, Suchergebnis): Davor liegt keine Seite
  // der App - zurueck fuehrte aus ihr hinaus.
  it('ersetzt die Adresse, wenn die Seite direkt aufgerufen wurde', () => {
    window.history.replaceState(null, '', '/impressum')
    const zurueck = vi.spyOn(window.history, 'back')
    schliesseRechtsseite('/eingabe')
    expect(zurueck).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/eingabe')
    zurueck.mockRestore()
  })
})
