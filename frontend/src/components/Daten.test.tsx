import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Daten, QUELLCODE_URL } from './Daten'

/*
 * „Daten“ (Julian, 21.10.2026): Quellcode, Bahnhofsliste, Transitous und die
 * uebrigen Quellen auf einer Seite statt verstreut in der Fusszeile.
 */
describe('Daten', () => {
  const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href')

  it('verlinkt die Umsteigezeiten aller Bahnhoefe', () => {
    render(<Daten />)
    expect(href(/Umsteigezeiten aller Bahnhöfe/)).toBe('/bahnhoefe')
  })

  it('verlinkt den Quellcode (§ 13 AGPL) und nennt die Lizenz', () => {
    render(<Daten />)
    expect(href(/Quellcode auf GitHub/)).toBe(QUELLCODE_URL)
    expect(screen.getByText(/AGPL-3\.0/)).toBeDefined()
  })

  it('nennt Transitous mit Link auf die Quellenliste (F7), DELFI, DB und OpenStreetMap', () => {
    render(<Daten />)
    expect(href(/Quellenliste von Transitous/)).toBe('https://transitous.org/sources')
    expect(screen.getByText(/DELFI/)).toBeDefined()
    expect(screen.getByText(/DB API Marketplace/)).toBeDefined()
    expect(href(/Open Database License/)).toBe('https://www.openstreetmap.org/copyright')
  })

  it('mit Rueckruf ein Zurueck-Knopf, vorgerendert ein Link zur Startseite', async () => {
    const zurueck = vi.fn()
    const { unmount } = render(<Daten onZurueck={zurueck} />)
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(zurueck).toHaveBeenCalled()
    unmount()
    render(<Daten />)
    expect(href('Zur Startseite')).toBe('/')
  })
})
