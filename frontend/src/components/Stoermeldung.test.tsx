import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stoermeldung } from './Stoermeldung'
import { meldungsText } from '../navigation/meldung'
import type { LiveEreignis } from '../api/typen'

const gleiswechsel: LiveEreignis = {
  typ: 'gleiswechsel', zug: 'ICE 1006', alt: '14', neu: '12',
  zeitstempel: '2026-08-31T12:32:10.000Z',
}
const verspaetung: LiveEreignis = {
  typ: 'verspaetung', zug: 'ICE 1006', alt: '14:36', neu: '14:44',
  zeitstempel: '2026-08-31T12:32:10.000Z',
}

describe('meldungsText', () => {
  it('nennt beim Gleiswechsel altes und neues Gleis', () => {
    expect(meldungsText(gleiswechsel)).toEqual({
      titel: 'Gleiswechsel',
      text: 'ICE 1006 fährt heute von Gleis 12 statt 14.',
    })
  })
  it('nennt bei der Verspaetung alte und neue Zeit', () => {
    expect(meldungsText(verspaetung)).toEqual({
      titel: 'Neue Abfahrtszeit',
      text: 'ICE 1006 fährt um 14:44 statt 14:36.',
    })
  })
})

describe('Stoermeldung', () => {
  it('fuehrt auf Wunsch zur Stoerungsseite', async () => {
    const onAnsehen = vi.fn()
    render(<Stoermeldung ereignis={gleiswechsel} onAnsehen={onAnsehen} onSchliessen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Was heißt das/ }))
    expect(onAnsehen).toHaveBeenCalled()
  })

  it('laesst sich wegschieben, ohne etwas zu uebernehmen', async () => {
    const onSchliessen = vi.fn()
    const onAnsehen = vi.fn()
    render(
      <Stoermeldung ereignis={gleiswechsel} onAnsehen={onAnsehen} onSchliessen={onSchliessen} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Später/ }))
    expect(onSchliessen).toHaveBeenCalled()
    expect(onAnsehen).not.toHaveBeenCalled()
  })

  it('traegt den Zeitstempel der Meldung', () => {
    render(<Stoermeldung ereignis={gleiswechsel} onAnsehen={vi.fn()} onSchliessen={vi.fn()} />)
    expect(screen.getByText(/Stand: /)).toBeDefined()
  })
})
