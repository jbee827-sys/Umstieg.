import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Ampel } from './Ampel'

describe('Ampel', () => {
  it('nennt ohne Abfahrtszeit den Grund, warum sie schweigt', () => {
    render(<Ampel farbe={null} gehzeitSek={300} />)
    expect(screen.getByText(/Zugauswahl für die Ampel nötig/)).toBeDefined()
  })

  it('zeigt mit Abfahrtszeit Restzeit und Gehzeit', () => {
    render(<Ampel farbe="gruen" gehzeitSek={300} restSek={900} />)
    expect(screen.getByText(/15:00 bis Abfahrt/)).toBeDefined()
    expect(screen.getByText(/Entspannt erreichbar/)).toBeDefined()
  })
})
