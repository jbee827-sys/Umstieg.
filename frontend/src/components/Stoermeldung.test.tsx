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

describe('meldungsText im Haltestellenpfad (Umstieg 2.0)', () => {
  const stamp = '2026-10-18T12:32:10.000Z'
  it('nennt beim Ausfall die Linie, nicht die Fahrt-ID', () => {
    expect(meldungsText({ typ: 'ausfall', zug: 'trip-7f3a', anzeige: 'Bus 245', zeitstempel: stamp })).toEqual({
      titel: 'Fahrt fällt aus',
      text: 'Bus 245 fällt aus. Bitte eine andere Verbindung wählen.',
    })
  })
  it('heisst den Wechsel an einer Haltestelle Steigwechsel', () => {
    expect(
      meldungsText({ typ: 'gleiswechsel', zug: 'trip-7f3a', anzeige: 'Bus 245', haltWort: 'Steig', alt: 'A', neu: 'B', zeitstempel: stamp }),
    ).toEqual({ titel: 'Steigwechsel', text: 'Bus 245 fährt heute von Steig B statt A.' })
  })
  it('nennt bei der Verspaetung die Linie', () => {
    expect(
      meldungsText({ typ: 'verspaetung', zug: 'trip-7f3a', anzeige: 'Bus 245', alt: '10:20', neu: '10:24', zeitstempel: stamp }).text,
    ).toBe('Bus 245 fährt um 10:24 statt 10:20.')
  })
  it('die Stoermeldung zeigt den Ausfall', () => {
    render(
      <Stoermeldung
        ereignis={{ typ: 'ausfall', zug: 'trip-7f3a', anzeige: 'Bus 245', zeitstempel: stamp }}
        onAnsehen={vi.fn()}
        onSchliessen={vi.fn()}
      />,
    )
    expect(screen.getByText('Bus 245 fällt aus. Bitte eine andere Verbindung wählen.')).toBeDefined()
  })
})

describe('meldungsText: welche Fahrt, welcher Halt (Review Paket 3)', () => {
  const stamp = '2026-10-18T12:32:10.000Z'
  it('eine verspaetete Ankunft heisst Ankunftszeit, nicht Abfahrtszeit', () => {
    expect(meldungsText({ typ: 'verspaetung', zug: 'RE 3', seite: 'an', alt: '14:32', neu: '14:40', zeitstempel: stamp })).toEqual({
      titel: 'Neue Ankunftszeit',
      text: 'RE 3 kommt um 14:40 statt 14:32 an.',
    })
  })
  it('ein Bahnsteig der Bahn an einer Haltestelle bleibt ein Gleis', () => {
    expect(
      meldungsText({ typ: 'gleiswechsel', zug: 't', anzeige: 'S5', haltWort: 'Gleis', alt: '2', neu: '3', zeitstempel: stamp }),
    ).toEqual({ titel: 'Gleiswechsel', text: 'S5 fährt heute von Gleis 3 statt 2.' })
  })
})
