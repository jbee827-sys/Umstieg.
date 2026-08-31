import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Angekommen } from './Angekommen'

describe('Angekommen', () => {
  it('zeigt die grosse Bestaetigung', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.getByText('Du bist da.')).toBeDefined()
  })

  it('nennt das Zielgleis', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.getByText(/Gleis 14/)).toBeDefined()
  })

  it('laesst unbekannte Werte weg statt sie zu erfinden', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.queryByText(/Wagen/)).toBeNull()
    expect(screen.queryByText(/Abfahrt/)).toBeNull()
    expect(screen.queryByText(/Abschnitt/)).toBeNull()
  })

  it('nennt Wagen, Abschnitt und Abfahrt, wenn bekannt', () => {
    const { container } = render(
      <Angekommen gleis="14" wagen="26" abschnitt="C" abfahrt="14:32" onNeu={() => {}} />,
    )
    const kacheln = [...container.querySelectorAll('.angekommen-kachel')].map((k) => ({
      label: k.querySelector('.angekommen-kachel-label')?.textContent,
      wert: k.querySelector('.angekommen-kachel-wert')?.textContent,
    }))
    expect(kacheln).toEqual([
      { label: 'Abfahrt', wert: '14:32' },
      { label: 'Wagen', wert: '26' },
      { label: 'Abschnitt', wert: 'C' },
    ])
  })

  it('meldet den Wunsch nach einer neuen Reise', async () => {
    const onNeu = vi.fn()
    render(<Angekommen gleis="14" onNeu={onNeu} />)
    await userEvent.click(screen.getByRole('button', { name: /Neue Reise/ }))
    expect(onNeu).toHaveBeenCalled()
  })
})
