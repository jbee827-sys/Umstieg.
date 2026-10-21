import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Impressum } from './Impressum'

// Vorgerendert (Konzept Nutzergewinnung AP 3.4) gibt es keinen Rueckruf -
// und ohne JavaScript taete ein Knopf nichts.
describe('Impressum ohne Rueckruf', () => {
  it('fuehrt per Link zur Startseite statt per Knopf', () => {
    render(<Impressum />)
    expect(screen.getByRole('link', { name: 'Zur Startseite' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
  })
})

describe('Impressum: Fahrplan- und Haltestellendaten (Umstieg 2.0)', () => {
  it('nennt Transitous mit Quellenliste, DELFI mit Lizenzen und OSM fuer Fusswege', () => {
    render(<Impressum onZurueck={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Fahrplan- und Haltestellendaten' })).toBeDefined()
    expect(screen.getByRole('link', { name: /Quellenliste von Transitous/ }).getAttribute('href')).toBe(
      'https://transitous.org/sources',
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('DELFI e. V.')
    expect(text).toContain('CC BY 4.0')
    expect(text).toContain('CC BY-SA 4.0')
    expect(text).toMatch(/Fußwege[^.]*OpenStreetMap/)
  })
})
