import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Angekommen } from './Angekommen'
import { istFernverkehr } from '../navigation/meldung'

describe('istFernverkehr', () => {
  it('erkennt ICE, IC und EC', () => {
    expect(istFernverkehr('ICE 1006')).toBe(true)
    expect(istFernverkehr('IC 2045')).toBe(true)
    expect(istFernverkehr('EC 115')).toBe(true)
  })
  it('verneint Nahverkehr und Unbekanntes', () => {
    // RE und S-Bahn haben keine Wagenreihung mit Abschnitten.
    expect(istFernverkehr('RE 3')).toBe(false)
    expect(istFernverkehr('S 5')).toBe(false)
    expect(istFernverkehr(undefined)).toBe(false)
  })
})

describe('Angekommen', () => {
  it('zeigt die grosse Bestaetigung', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.getByText('Du bist da.')).toBeDefined()
  })

  it('haelt die gruene Flaeche getrennt vom Rest', () => {
    // Nur die Flaeche ist gruen - darunter steht die App wie ueberall,
    // damit die untere Leiste gleich bleibt.
    const { container } = render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(container.querySelector('.angekommen-flaeche')).not.toBeNull()
  })

  it('nennt Puffer und Abfahrt als Kacheln', () => {
    const { container } = render(
      <Angekommen gleis="14" abfahrt="14:32" restSek={250} onNeu={() => {}} />,
    )
    const werte = [...container.querySelectorAll('.angekommen-kachel-wert')].map(
      (k) => k.textContent,
    )
    expect(werte).toEqual(['4:10', '14:32'])
  })

  it('zeigt den Wagenkasten nur im Fernverkehr', () => {
    const { container, rerender } = render(
      <Angekommen gleis="14" wagen="26" abschnitt="C" zugAbName="RE 3" onNeu={() => {}} />,
    )
    expect(container.querySelector('.angekommen-wagenkasten')).toBeNull()
    rerender(
      <Angekommen gleis="14" wagen="26" abschnitt="C" zugAbName="ICE 1006" onNeu={() => {}} />,
    )
    expect(container.querySelector('.angekommen-wagenkasten')?.textContent).toMatch(/26/)
  })

  it('laesst unbekannte Werte weg statt sie zu erfinden', () => {
    const { container } = render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(container.querySelector('.angekommen-kacheln')).toBeNull()
    expect(container.querySelector('.angekommen-wagenkasten')).toBeNull()
  })

  it('meldet den Wunsch nach einer neuen Reise', async () => {
    const onNeu = vi.fn()
    render(<Angekommen gleis="14" onNeu={onNeu} />)
    await userEvent.click(screen.getByRole('button', { name: /Neue Reise/ }))
    expect(onNeu).toHaveBeenCalled()
  })
})
