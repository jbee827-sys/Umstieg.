import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  abschnitt: 'mitte',
}
const route: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }

function zeige(ueber: Partial<Parameters<typeof Dashboard>[0]> = {}) {
  const props = {
    werte,
    route,
    restSek: undefined as number | undefined,
    abgefahren: false,
    varianten: { schnellste: 300, gewaehlt: 'schnellste' as const },
    standorte: { mitte: 300, gewaehlt: 'mitte' as const },
    hinweis: false,
    onVariante: vi.fn(),
    onStandort: vi.fn(),
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

/**
 * Standortwahl am Ankunftsgleis (Entwurf: Artboard „Kopfbahnhof").
 *
 * Sie ist keine Verzierung. An Leipzig Hbf, Gleis 6 nach 16, fuehrt „Anfang"
 * durch die Unterfuehrung (343 s) und „Ende" ueber den Bahnhofskopf (251 s) -
 * derselbe Umstieg, zwei Wege, 100 s Unterschied. Solange die Wagenreihung
 * tot ist, ist diese Wahl die einzige Eingabe, die den Weg kennt.
 */
describe('Dashboard: Standortwahl am Ankunftsgleis', () => {
  const LEIPZIG = { anfang: 343, mitte: 354, ende: 251, gewaehlt: 'mitte' as const }

  it('nennt das Gleis, um das es geht', () => {
    zeige({ standorte: LEIPZIG })
    expect(screen.getByText(/Wo stehst du auf Gleis 6\?/)).toBeDefined()
  })

  it('bietet Anfang, Mitte und Ende an - in der Reihenfolge des Bahnsteigs', () => {
    zeige({ standorte: LEIPZIG })
    const gruppe = screen.getByRole('group', { name: /Wo stehst du/ })
    const namen = within(gruppe)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(namen).toEqual(['Anfang6 min', 'Mitte6 min', 'Ende5 min'])
  })

  it('markiert die gewaehlte Stelle', () => {
    zeige({ standorte: LEIPZIG })
    expect(screen.getByRole('button', { name: /^Mitte/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Ende/ }).getAttribute('aria-pressed')).toBe('false')
  })

  /** Dieselbe Regel wie bei den Varianten: lieber keine Zahl als eine geratene. */
  it('laesst die Minuten weg, solange sie nicht gerechnet sind', () => {
    zeige({ standorte: { mitte: 354, gewaehlt: 'mitte' } })
    expect(screen.getByRole('button', { name: /^Anfang/ }).textContent).toBe('Anfang')
  })

  it('meldet den Tipp nach oben', async () => {
    const props = zeige({ standorte: LEIPZIG })
    await userEvent.click(screen.getByRole('button', { name: /^Anfang/ }))
    expect(props.onStandort).toHaveBeenCalledWith('anfang')
  })

  it('zeigt am getippten Knopf, dass er laedt', () => {
    zeige({ standorte: LEIPZIG, standortLaedt: 'anfang' })
    const knopf = screen.getByRole('button', { name: /^Anfang/ })
    expect(knopf.getAttribute('aria-busy')).toBe('true')
    expect(knopf.textContent).toMatch(/lädt/i)
  })

  /**
   * Ein laufender Wechsel sperrt BEIDE Reihen. Sonst stapeln sich auf dem
   * Handy Anfragen, von denen die zuletzt beantwortete gewinnt - und das muss
   * nicht die zuletzt getippte sein.
   */
  it('sperrt die Routenwahl, solange ein Standort geholt wird', () => {
    zeige({ standorte: LEIPZIG, standortLaedt: 'anfang' })
    expect(
      (screen.getByRole('button', { name: /Barrierefrei/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('sperrt die Standortwahl, solange eine Variante geholt wird', () => {
    zeige({ standorte: LEIPZIG, laedt: 'barrierefrei' })
    expect((screen.getByRole('button', { name: /^Ende/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
