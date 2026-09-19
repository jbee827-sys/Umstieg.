import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function zeige(
  r: RouteErgebnis,
  position: number,
  rueckrufe: { onAngekommen?: () => void; zusatz?: React.ReactNode } = {},
) {
  return render(
    <Navigation
      route={r}
      gleisAn="6"
      gleisAb="14"
      bahnhofName="Berlin Hbf"
      position={position}
      standort={null}
      onZurueck={() => {}}
      onWeiter={() => {}}
      onAngekommen={rueckrufe.onAngekommen ?? (() => {})}
      {...(rueckrufe.zusatz !== undefined ? { zusatz: rueckrufe.zusatz } : {})}
    />,
  )
}

describe('Navigation', () => {
  it('zeigt das Ebenenschema mit den Gleisen', () => {
    const { container } = zeige(route(1, true), 0)
    const gleise = [...container.querySelectorAll('.schema-grobgleis')].map((g) => g.textContent)
    expect(gleise).toContain('6')
    expect(gleise).toContain('14')
  })

  it('bietet bei Stufe 1 die echte Karte hinter Mehr an', () => {
    zeige(route(1, true), 0)
    expect(screen.getByText(/Echte Karte anzeigen/)).toBeDefined()
  })

  it('bietet bei Stufe 3 KEINE Karte an', () => {
    // Stufe-3-Koordinaten sind konstruiert - eine Karte darueber waere gelogen.
    zeige(route(3, false), 0)
    expect(screen.queryByText(/Echte Karte anzeigen/)).toBeNull()
  })

  it('legt die Karte in den Aufklapper der Schritt-Box', () => {
    // Der Bildbereich ist fest; nur das Schema steht dort. Die Karte ist
    // Nebensache und wandert zu den uebrigen Schritten.
    const { container } = zeige(route(1, true), 0)
    expect(container.querySelector('.schrittsheet-liste .karte-aufklappbar')).not.toBeNull()
  })

  it('zeigt den aktiven Schritt im Sheet', () => {
    const { container } = zeige(route(1, true), 1)
    expect(container.querySelector('.schrittsheet-text')?.textContent).toBe('Treppe hoch')
  })

  it('reicht Zusatzinhalte von aussen in den Aufklapper weiter', () => {
    const { container } = zeige(route(1, true), 0, {
      zusatz: <p className="probe">Aufzug außer Betrieb</p>,
    })
    expect(container.querySelector('.schrittsheet-liste .probe')).not.toBeNull()
  })
})

describe('Navigation: Weg zur Angekommen-Seite', () => {
  it('bietet den Knopf beim letzten Schritt an, an der Stelle von Weiter', async () => {
    const onAngekommen = vi.fn()
    zeige(route(1, true), schritte.length - 1, { onAngekommen })
    await userEvent.click(screen.getByRole('button', { name: /^Angekommen$/ }))
    expect(onAngekommen).toHaveBeenCalled()
  })

  it('hat unterhalb der Schritt-Box keinen eigenen Angekommen-Knopf mehr', () => {
    // Bis zum 19.09.2026 stand er dort lose unter dem Sheet - und zwar auf
    // jedem Schritt, auch mitten im Bahnhof.
    const { container } = zeige(route(1, true), 0)
    expect(screen.queryByRole('button', { name: /^Angekommen$/ })).toBeNull()
    expect(container.querySelector('.schrittsheet ~ button')).toBeNull()
  })
})
