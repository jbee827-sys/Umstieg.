import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Navigation } from './Navigation'
import type { RouteErgebnis, Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Start an Gleis 6', typ: 'start', level: -2 },
  { text: 'Treppe hoch', typ: 'treppe', level: 0 },
  { text: 'Ziel an Gleis 14', typ: 'ziel', level: 1 },
]

function route(stufe: 1 | 3, mitKarte: boolean): RouteErgebnis {
  return {
    stufe,
    schritte,
    gehzeitSek: 300,
    hinweise: [],
    ...(mitKarte ? { karte: { '0': { type: 'FeatureCollection', features: [] } } } : {}),
  }
}

describe('Navigation', () => {
  it('zeigt das Ebenenschema mit den Gleisen', () => {
    render(
      <Navigation route={route(1, true)} gleisAn="6" gleisAb="14" bahnhofName="Berlin Hbf"
        position={0} standort={null} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.getByText(/Schema, keine Karte/)).toBeDefined()
  })

  it('bietet bei Stufe 1 die echte Karte hinter Mehr an', () => {
    render(
      <Navigation route={route(1, true)} gleisAn="6" gleisAb="14" bahnhofName="Berlin Hbf"
        position={0} standort={null} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.getByText(/Echte Karte anzeigen/)).toBeDefined()
  })

  it('bietet bei Stufe 3 KEINE Karte an', () => {
    // Stufe-3-Koordinaten sind konstruiert - eine Karte darueber waere gelogen.
    render(
      <Navigation route={route(3, false)} gleisAn="6" gleisAb="14" bahnhofName="Berlin Hbf"
        position={0} standort={null} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.queryByText(/Echte Karte anzeigen/)).toBeNull()
  })

  it('zeigt den aktiven Schritt im Sheet', () => {
    const { container } = render(
      <Navigation route={route(1, true)} gleisAn="6" gleisAb="14" bahnhofName="Berlin Hbf"
        position={1} standort={null} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(container.querySelector('.schrittsheet-text')?.textContent).toBe('Treppe hoch')
  })
})
