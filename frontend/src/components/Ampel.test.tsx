import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Ampel } from './Ampel'

describe('Ampel', () => {
  it('nennt ohne Abfahrtszeit den Grund, warum sie schweigt', () => {
    render(<Ampel farbe={null} gehzeitSek={300} />)
    expect(screen.getByText(/fehlt die Abfahrtszeit/)).toBeDefined()
  })

  it('zeigt ohne Abfahrtszeit trotzdem die Gehzeit', () => {
    render(<Ampel farbe={null} gehzeitSek={300} />)
    expect(screen.getByText('Gehzeit 5 min')).toBeDefined()
  })

  it('zeigt mit Abfahrtszeit die Restzeit als Countdown', () => {
    render(<Ampel farbe="gruen" gehzeitSek={300} restSek={900} startPufferSek={900} />)
    expect(screen.getByText('15:00')).toBeDefined()
    expect(screen.getByText(/Entspannt erreichbar/)).toBeDefined()
  })

  it('zeichnet die Zeitleiste anteilig zum Startpuffer', () => {
    const { container } = render(
      <Ampel farbe="gelb" gehzeitSek={300} restSek={300} startPufferSek={600} />,
    )
    const fuellung = container.querySelector('.ampel-zeitleiste-fuellung') as HTMLElement
    expect(fuellung.style.width).toBe('50%')
  })

  it('zeigt keine Zeitleiste ohne Abfahrtszeit', () => {
    const { container } = render(<Ampel farbe={null} gehzeitSek={300} />)
    expect(container.querySelector('.ampel-zeitleiste')).toBeNull()
  })

  it('trifft nach der Abfahrt keine Aussage mehr', () => {
    const { container } = render(
      <Ampel farbe={null} gehzeitSek={300} restSek={-90} abgefahren />,
    )
    expect(screen.getByText(/Zug abgefahren/)).toBeDefined()
    expect(container.querySelector('.ampel-zeitleiste')).toBeNull()
  })

  it('zeigt „Anschluss nicht erreichbar“ in Rot, ohne Countdown', () => {
    const { container } = render(
      <Ampel farbe="gruen" gehzeitSek={300} restSek={-60} unerreichbar />,
    )
    expect(screen.getByText('Anschluss nicht erreichbar')).toBeDefined()
    expect(container.querySelector('.ampel-rot')).not.toBeNull()
    expect(container.querySelector('.ampel-rest')).toBeNull()
    expect(container.querySelector('.ampel-zeitleiste')).toBeNull()
  })

  it('„Zug abgefahren“ geht vor „nicht erreichbar“', () => {
    render(<Ampel farbe={null} gehzeitSek={300} restSek={-600} abgefahren unerreichbar />)
    expect(screen.getByText('Zug abgefahren')).toBeDefined()
  })
})
