import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Fusszeile } from './Fusszeile'

describe('Fusszeile', () => {
  // Seit dem 21.10.2026 echte Adressen statt Raute - fuer Google eigene
  // Seiten, fuer die Reichweitenmessung sichtbar (Konzept Nutzergewinnung AP 3).
  it('verlinkt Impressum und Datenschutz unter eigenen Adressen', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Impressum' }).getAttribute('href')).toBe('/impressum')
    expect(screen.getByRole('link', { name: 'Datenschutz' }).getAttribute('href')).toBe('/datenschutz')
  })

  /*
   * Quellcode, Bahnhofsliste, Transitous und die uebrigen Quellen stehen seit
   * dem 21.10.2026 zusammen unter „Daten“ (Julian) - die Fusszeile hat drei
   * Eintraege statt einer zweiten Zeile.
   */
  it('fuehrt Quellcode, Bahnhoefe und Quellen unter „Daten“ zusammen', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Daten' }).getAttribute('href')).toBe('/daten')
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Impressum', 'Datenschutz', 'Daten'])
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

  it('oeffnet auch „Daten“ in der App', () => {
    window.history.replaceState(null, '', '/eingabe')
    render(<Fusszeile />)
    const klick = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getByRole('link', { name: 'Daten' }).dispatchEvent(klick)
    expect(klick.defaultPrevented).toBe(true)
    expect(window.location.pathname).toBe('/daten')
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
})
