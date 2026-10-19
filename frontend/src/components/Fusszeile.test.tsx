import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Fusszeile, QUELLCODE_URL } from './Fusszeile'

describe('Fusszeile', () => {
  it('nennt Transitous mit Link auf die Quellenliste (F7)', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Transitous' }).getAttribute('href')).toBe('https://transitous.org/sources')
    expect(screen.getByText(/DELFI/)).toBeDefined()
    expect(screen.getByText(/OpenStreetMap/)).toBeDefined()
  })

  it('behaelt Impressum und Datenschutz', () => {
    render(<Fusszeile />)
    expect(screen.getByRole('link', { name: 'Impressum' }).getAttribute('href')).toBe('#impressum')
    expect(screen.getByRole('link', { name: 'Datenschutz' }).getAttribute('href')).toBe('#datenschutz')
  })

  it('verlinkt den Quellcode (§ 13 AGPL)', () => {
    render(<Fusszeile />)
    const link = screen.getByRole('link', { name: 'Quellcode' })
    expect(link.getAttribute('href')).toBe(QUELLCODE_URL)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
