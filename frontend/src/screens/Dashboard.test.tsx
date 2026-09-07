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
  wagenAn: '',
  wagenAb: '',
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

  it('bietet Schnellste, Barrierefrei und Mit Stopp an - aber nicht Einfachste', () => {
    zeige({ varianten: { schnellste: 300, barrierefrei: 540, gewaehlt: 'schnellste' } })
    expect(screen.getByRole('button', { name: /Schnellste/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Barrierefrei/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Mit Stopp/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Einfachste/ })).toBeNull()
  })

  it('nennt WC und Kiosk in EINEM Knopf', () => {
    // Der Entwurf laesst den Nutzer nicht zwischen beiden waehlen - welches
    // Zwischenziel es wird, entscheidet die kuerzere Gehzeit.
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' } })
    const knopf = screen.getByRole('button', { name: /Mit Stopp/ })
    expect(knopf.textContent).toMatch(/WC/)
    expect(knopf.textContent).toMatch(/Kiosk/)
  })

  it('laesst den Stopp-Knopf ohne Minuten, wenn der Bahnhof keine kartiert hat', () => {
    // 'mit-stopp' antwortet 404, wenn weder WC noch Kiosk erreichbar ist -
    // dann steht am Knopf keine Zahl statt einer geratenen.
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' } })
    expect(screen.getByRole('button', { name: /Mit Stopp/ }).textContent).not.toMatch(/min/)
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

/**
 * Regression (Mobilabnahme 07.09.2026): Die Routenzeilen fuehlten sich tot an.
 *
 * Der Tipp feuerte - nur war JEDER Ausgang unsichtbar. `laden` und `fehler`
 * lagen in `App.tsx` und wurden ausschliesslich an `Eingabe` durchgereicht;
 * auf dem Dashboard zeichnete sie niemand. Wer auf "Barrierefrei" tippte,
 * bekam bei einem kalten Bahnhof sekundenlang nichts zu sehen - und bei
 * einem Bahnhof ohne nutzbaren Aufzug (HTTP 404, im Backend ein eigener
 * Text) fuer immer nichts.
 *
 * Das Dashboard muss beides selbst zeigen.
 */
describe('Dashboard: Rueckmeldung beim Variantenwechsel', () => {
  it('zeigt an der getippten Zeile, dass sie laedt', () => {
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' }, laedt: 'barrierefrei' })
    const bf = screen.getByRole('button', { name: /Barrierefrei/ })
    expect(bf.getAttribute('aria-busy')).toBe('true')
    expect(bf.textContent).toMatch(/lädt/i)
  })

  it('markiert nur die getippte Zeile als ladend', () => {
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' }, laedt: 'barrierefrei' })
    expect(
      screen.getByRole('button', { name: /Schnellste/ }).getAttribute('aria-busy'),
    ).not.toBe('true')
  })

  it('zeigt den Fehler, wenn die Variante nicht berechnet werden konnte', () => {
    zeige({
      varianten: { schnellste: 300, gewaehlt: 'schnellste' },
      variantenFehler: 'Kein WC und kein Kiosk auf dem Weg gefunden.',
    })
    expect(screen.getByText(/Kein WC und kein Kiosk/)).toBeDefined()
  })

  it('schweigt ohne Fehler', () => {
    zeige({ varianten: { schnellste: 300, gewaehlt: 'schnellste' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
