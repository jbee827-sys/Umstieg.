import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Fusszeile, QUELLCODE_URL } from './Fusszeile'

describe('Fusszeile', () => {
  it('nennt Transitous mit Link auf die Quellenliste (F7)', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Transitous' }).getAttribute('href')).toBe('https://transitous.org/sources')
    expect(screen.getByText(/DELFI/)).toBeDefined()
    expect(screen.getByText(/OpenStreetMap/)).toBeDefined()
  })

  // Seit dem 21.10.2026 echte Adressen statt Raute - fuer Google eigene
  // Seiten, fuer die Reichweitenmessung sichtbar (Konzept Nutzergewinnung AP 3).
  it('verlinkt Impressum und Datenschutz unter eigenen Adressen', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Impressum' }).getAttribute('href')).toBe('/impressum')
    expect(screen.getByRole('link', { name: 'Datenschutz' }).getAttribute('href')).toBe('/datenschutz')
  })

  it('oeffnet die Rechtsseite in der App, ohne die Seite neu zu laden', () => {
    window.history.replaceState(null, '', '/eingabe')
    render(<Fusszeile />)
    const klick = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getByRole('link', { name: 'Datenschutz' }).dispatchEvent(klick)
    expect(klick.defaultPrevented).toBe(true)
    expect(window.location.pathname).toBe('/datenschutz')
    window.history.replaceState(null, '', '/')
  })

  // Strg-/Cmd-Klick oeffnet wie ueberall einen neuen Tab - das ist der
  // Browser, nicht die App.
  it('laesst einen Klick mit Strg dem Browser', () => {
    window.history.replaceState(null, '', '/eingabe')
    render(<Fusszeile />)
    const klick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    screen.getByRole('link', { name: 'Impressum' }).addEventListener('click', (e) => e.preventDefault())
    screen.getByRole('link', { name: 'Impressum' }).dispatchEvent(klick)
    expect(window.location.pathname).toBe('/eingabe')
    window.history.replaceState(null, '', '/')
  })

  // Konzept Nutzergewinnung 5c.3: die zentrale interne Verlinkung.
  it('verlinkt die Umsteigezeiten aller Bahnhoefe', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Bahnhöfe' }).getAttribute('href')).toBe('/bahnhoefe')
  })

  it('verlinkt den Quellcode (§ 13 AGPL)', () => {
    render(<Fusszeile />)
    const link = screen.getByRole('link', { name: 'Quellcode' })
    expect(link.getAttribute('href')).toBe(QUELLCODE_URL)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
