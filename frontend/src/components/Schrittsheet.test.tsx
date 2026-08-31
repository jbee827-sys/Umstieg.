import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Schrittsheet } from './Schrittsheet'
import type { Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Nach Ausstieg 30 m geradeaus', typ: 'start' },
  { text: 'Treppe hoch zur Halle', typ: 'treppe' },
  { text: 'Rechts zu Gleis 14', typ: 'ziel' },
]

describe('Schrittsheet', () => {
  it('hebt genau einen Schritt hervor', () => {
    // Die uebrigen Schritte stehen im zugeklappten <details> - im DOM, aber
    // nicht sichtbar. Geprueft wird deshalb der hervorgehobene Text.
    const { container } = render(
      <Schrittsheet schritte={schritte} position={1} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    const hervorgehoben = container.querySelector('.schrittsheet-text')
    expect(hervorgehoben?.textContent).toBe('Treppe hoch zur Halle')
  })

  it('haelt die uebrigen Schritte eingeklappt', () => {
    const { container } = render(
      <Schrittsheet schritte={schritte} position={1} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('nennt Position und Gesamtzahl', () => {
    render(<Schrittsheet schritte={schritte} position={1} onZurueck={() => {}} onWeiter={() => {}} />)
    expect(screen.getByText(/Schritt 2 von 3/)).toBeDefined()
  })

  it('meldet Weiter und Zurueck', async () => {
    const onWeiter = vi.fn()
    const onZurueck = vi.fn()
    render(
      <Schrittsheet schritte={schritte} position={1} onZurueck={onZurueck} onWeiter={onWeiter} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }))
    await userEvent.click(screen.getByRole('button', { name: /Zurück/ }))
    expect(onWeiter).toHaveBeenCalled()
    expect(onZurueck).toHaveBeenCalled()
  })

  it('sperrt Zurueck am Anfang und Weiter am Ende', () => {
    const { rerender } = render(
      <Schrittsheet schritte={schritte} position={0} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Zurück/ }).hasAttribute('disabled')).toBe(true)
    rerender(
      <Schrittsheet schritte={schritte} position={2} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Weiter/ }).hasAttribute('disabled')).toBe(true)
  })

  it('macht die volle Liste aufklappbar erreichbar', async () => {
    render(<Schrittsheet schritte={schritte} position={0} onZurueck={() => {}} onWeiter={() => {}} />)
    await userEvent.click(screen.getByText(/Alle Schritte/))
    expect(screen.getByText(/Rechts zu Gleis 14/)).toBeDefined()
  })
})
