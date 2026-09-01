import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Zugauswahl } from './Zugauswahl'
import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
const holeTafelMock = vi.mocked(holeTafel)

/** Uhrzeit in `minuten` Minuten, als "HH:MM" - die Tafel kennt kein Datum. */
function inMinuten(minuten: number): string {
  const d = new Date(Date.now() + minuten * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function zug(name: string, minuten: number, gleis = '1'): TafelEintrag {
  return { zug: name, zeitSoll: inMinuten(minuten), gleisSoll: gleis, ziel: 'Irgendwo' }
}

const ICE = zug('ICE 1006', 10, '14')

function zeige(auswahl: TafelEintrag | null = null, onAuswahl = vi.fn()) {
  render(
    <Zugauswahl eva="8011160" typ="dep" label="Abfahrt waehlen" auswahl={auswahl} onAuswahl={onAuswahl} />,
  )
  return onAuswahl
}

const aufklappen = () => userEvent.click(screen.getByRole('button', { name: 'Abfahrt waehlen' }))

describe('Zugauswahl', () => {
  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [ICE] })
  })

  it('fragt die Tafel erst beim Aufklappen ab', async () => {
    zeige()
    expect(holeTafelMock).not.toHaveBeenCalled()

    await aufklappen()

    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
  })

  it('holt die Tafel nur ein einziges Mal, auch nach Zu- und Aufklappen', async () => {
    zeige()
    await aufklappen()
    await screen.findByText(/ICE 1006/)
    await aufklappen() // zu
    await aufklappen() // wieder auf

    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
    expect(holeTafelMock).toHaveBeenCalledTimes(1)
  })

  it('meldet den angetippten Zug nach oben', async () => {
    const onAuswahl = zeige()
    await aufklappen()
    await userEvent.click(await screen.findByRole('button', { name: /ICE 1006/ }))
    expect(onAuswahl).toHaveBeenCalledWith(ICE)
  })

  it('nennt den fehlenden DB-Zugang beim Namen', async () => {
    holeTafelMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await aufklappen()
    expect(await screen.findByText(/kein DB-Zugang/)).toBeDefined()
  })
})

describe('Zugauswahl: Kategorien und Zeitfenster', () => {
  beforeEach(() => holeTafelMock.mockReset())

  it('gliedert die Tafel in benannte Kategorien statt in eine Bandwurmliste', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('S 5105', 12), zug('ICE 554', 8), zug('RE 3156', 20), zug('U 5', 30)],
    })
    zeige()
    await aufklappen()

    // Reihenfolge wie im Entwurf: Regional, Fern, S-Bahn, U-Bahn.
    const ueberschriften = await screen.findAllByRole('heading', { level: 3 })
    expect(ueberschriften.map((h) => h.textContent)).toEqual([
      'Regionalverkehr',
      'Fernverkehr',
      'S-Bahn',
      'U-Bahn',
    ])
  })

  it('haelt jede Kategorie in ihrer eigenen Gruppe', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('ICE 1', 5), zug('ICE 2', 15), zug('RE 9', 10)],
    })
    zeige()
    await aufklappen()

    const fern = await screen.findByRole('group', { name: 'Fernverkehr' })
    expect(within(fern).getAllByRole('button').map((b) => b.textContent)).toHaveLength(2)
    // Der RE gehoert nicht dazu, auch wenn er zeitlich dazwischenliegt.
    expect(within(fern).queryByText(/RE 9/)).toBeNull()
  })

  it('laesst weg, was laenger als 45 Minuten hin ist', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('RE 1', 40), zug('RE 2', 50)],
    })
    zeige()
    await aufklappen()

    expect(await screen.findByText(/RE 1/)).toBeDefined()
    expect(screen.queryByText(/RE 2/)).toBeNull()
  })

  it('laesst weg, was laenger als fuenf Minuten weg ist', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('RE 1', -3), zug('RE 2', -10)],
    })
    zeige()
    await aufklappen()

    expect(await screen.findByText(/RE 1/)).toBeDefined()
    expect(screen.queryByText(/RE 2/)).toBeNull()
  })

  it('sagt es, wenn das Fenster leer ist - und nennt den Grund', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 1', 120)] })
    zeige()
    await aufklappen()

    // Frueher stand hier "Keine Zuege in der aktuellen Stunde gefunden" -
    // das stimmte nicht mehr, sobald das Fenster 45 Minuten misst.
    expect(await screen.findByText(/45 Minuten/)).toBeDefined()
  })
})
