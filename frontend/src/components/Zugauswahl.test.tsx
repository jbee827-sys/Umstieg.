import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Zugauswahl } from './Zugauswahl'
import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
const holeTafelMock = vi.mocked(holeTafel)

const ICE: TafelEintrag = {
  zug: 'ICE 1006',
  zeitSoll: '14:26',
  gleisSoll: '14',
  ziel: 'Hamburg-Altona',
}

function zeige(auswahl: TafelEintrag | null = null, onAuswahl = vi.fn()) {
  render(
    <Zugauswahl eva="8011160" typ="dep" label="Abfahrt waehlen" auswahl={auswahl} onAuswahl={onAuswahl} />,
  )
  return onAuswahl
}

describe('Zugauswahl', () => {
  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [ICE] })
  })

  it('fragt die Tafel erst beim Aufklappen ab', async () => {
    zeige()
    expect(holeTafelMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Abfahrt waehlen' }))

    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
  })

  it('holt die Tafel nur ein einziges Mal, auch nach Zu- und Aufklappen', async () => {
    zeige()
    const knopf = screen.getByRole('button', { name: 'Abfahrt waehlen' })

    await userEvent.click(knopf)
    await screen.findByText(/ICE 1006/)
    await userEvent.click(knopf) // zu
    await userEvent.click(knopf) // wieder auf

    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
    expect(holeTafelMock).toHaveBeenCalledTimes(1)
  })

  it('meldet den angetippten Zug nach oben', async () => {
    const onAuswahl = zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Abfahrt waehlen' }))
    await userEvent.click(await screen.findByRole('button', { name: /ICE 1006/ }))
    expect(onAuswahl).toHaveBeenCalledWith(ICE)
  })

  it('nennt den fehlenden DB-Zugang beim Namen', async () => {
    holeTafelMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Abfahrt waehlen' }))
    expect(await screen.findByText(/kein DB-Zugang/)).toBeDefined()
  })
})
