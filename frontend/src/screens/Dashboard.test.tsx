import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dashboard } from './Dashboard'
import type { EingabeWerte } from '../components/Eingabe'
import type { RouteErgebnis } from '../api/typen'

const werte: EingabeWerte = {
  eva: '8011160',
  bahnhofName: 'Berlin Hbf',
  gleisAn: '6',
  gleisAb: '14',
  wagen: '',
  profil: 'normal',
  variante: 'schnellste',
}
const route: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }

function zeige(ueber: Partial<Parameters<typeof Dashboard>[0]> = {}) {
  const props = {
    werte,
    route,
    restSek: undefined as number | undefined,
    abgefahren: false,
    varianten: { schnellste: 300, gewaehlt: 'schnellste' as const },
    hinweis: false,
    onVariante: vi.fn(),
    onNavigation: vi.fn(),
    onMeldungen: vi.fn(),
    ...ueber,
  }
  render(<Dashboard {...props} />)
  return props
}

describe('Dashboard', () => {
  it('zeigt die Gehzeit auch ohne Abfahrtszeit', () => {
    zeige()
    expect(screen.getByText("Gehzeit 5 min")).toBeDefined()
  })

  it('bietet nur Schnellste und Barrierefrei an', () => {
    zeige({ varianten: { schnellste: 300, barrierefrei: 540, gewaehlt: 'schnellste' } })
    expect(screen.getByRole('button', { name: /Schnellste/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Barrierefrei/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Einfachste/ })).toBeNull()
  })

  it('nennt die Minuten am Knopf, wenn sie bekannt sind', () => {
    zeige({ varianten: { schnellste: 300, barrierefrei: 540, gewaehlt: 'schnellste' } })
    expect(screen.getByRole('button', { name: /Barrierefrei.*9 min/ })).toBeDefined()
  })

  it('laesst die Minuten weg, wenn die Berechnung fehlschlug', () => {
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' } })
    const bf = screen.getByRole('button', { name: /Barrierefrei/ })
    expect(bf.textContent).not.toMatch(/min/)
  })

  it('zeigt die Abkuerzung zu den Meldungen nur bei Hinweis', () => {
    zeige({ hinweis: false })
    expect(screen.queryByRole('button', { name: /Meldung/ })).toBeNull()
  })

  it('meldet den Klick auf die Abkuerzung zu den Meldungen', async () => {
    const props = zeige({ hinweis: true })
    await userEvent.click(screen.getByRole('button', { name: /Meldung/ }))
    expect(props.onMeldungen).toHaveBeenCalled()
  })

  it('startet die Navigation auf Knopfdruck', async () => {
    const props = zeige()
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    expect(props.onNavigation).toHaveBeenCalled()
  })

  it('nennt Ankunfts- und Zielgleis', () => {
    zeige()
    expect(screen.getByText(/Gl\. 6/)).toBeDefined()
    expect(screen.getByText(/Gl\. 14/)).toBeDefined()
  })
})
