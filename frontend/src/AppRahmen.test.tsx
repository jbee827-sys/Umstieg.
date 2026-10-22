import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppRahmen } from './AppRahmen'
import { baueAppNeu } from './einfuehrung/neuaufbau'

let aufbauten = 0
vi.mock('./App', () => ({
  default: function App() {
    // Wie die echte App: Der Startzustand wird EINMAL je Aufbau gelesen.
    const [nr] = useState(() => ++aufbauten)
    return <p>Aufbau {nr}</p>
  },
}))

/**
 * Plan Einführungstour, Paket 3: App liest ihren Startzustand nur beim
 * Aufbau aus Adresse und Speicher. Nach der Tour wird sie deshalb neu
 * aufgebaut, statt ihren Zustand zurückzubiegen.
 */
describe('AppRahmen', () => {
  it('baut die App auf Zuruf neu auf', () => {
    render(<AppRahmen />)
    expect(screen.getByText('Aufbau 1')).toBeTruthy()
    act(() => baueAppNeu())
    expect(screen.getByText('Aufbau 2')).toBeTruthy()
  })

  it('tut nichts, solange kein Rahmen steht', () => {
    expect(() => baueAppNeu()).not.toThrow()
  })
})
