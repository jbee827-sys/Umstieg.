import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { holeRoute } from './api/client'
import { sucheOrte } from './api/orte'
import type { RouteErgebnis, RouteParameter } from './api/typen'
import { leiteRauteUm, oeffneRechtsseite } from './navigation/rechtsseiten'
import { schreibeReise } from './sitzung/reisespeicher'

/**
 * Konzept Nutzergewinnung (21.10.2026) am echten `App`: Rechtsseiten mit
 * eigener Adresse (AP 3). Nur die Netzgrenze ist gemockt - wie in
 * `App.test.tsx`, dessen Faelle hier bewusst nicht wiederholt werden.
 */
vi.mock('./api/client', async () => {
  const echt = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    RouteFehler: echt.RouteFehler,
    holeRoute: vi.fn(),
    holeTafel: vi.fn(async () => ({ ok: true, eintraege: [] })),
  }
})
vi.mock('./api/orte', () => ({
  sucheOrte: vi.fn(),
  orteNahebei: vi.fn(async () => ({ ok: true, antwort: { orte: [], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } })),
}))
vi.mock('./api/sse', () => ({
  verbindeLive: () => () => undefined,
}))

const sucheMock = vi.mocked(sucheOrte)
const routeMock = vi.mocked(holeRoute)

function antwort(p: RouteParameter): RouteErgebnis {
  return {
    stufe: 1,
    schritte: [
      { text: 'Treppe hinunter', typ: 'treppe', sekunden: 60 },
      { text: 'Durch die Unterführung', typ: 'eben', sekunden: 120 },
      { text: 'Treppe hinauf zu Gleis 16', typ: 'ziel', sekunden: 60 },
    ],
    gehzeitSek: p.variante === 'barrierefrei' ? 360 : 240,
    hinweise: [],
  }
}

/** Eine laufende Reise in Leipzig, wie sie nach dem Neuladen im Speicher liegt. */
function sichereReise(versatz = 0): void {
  const route = antwort({ eva: '8010205', gleisAn: '6', gleisAb: '16', profil: 'normal', variante: 'schnellste', abschnitt: 'mitte' })
  schreibeReise({
    werte: {
      eva: '8010205',
      bahnhofName: 'Leipzig Hbf',
      gleisAn: '6',
      gleisAb: '16',
      wagenAn: '',
      wagenAb: '',
      profil: 'normal',
      variante: 'schnellste',
      abschnitt: 'mitte',
    },
    route,
    variante: 'schnellste',
    standort: 'mitte',
    gehzeiten: { 'schnellste|mitte': route.gehzeitSek },
    meldungen: [],
    versatz,
  })
}

beforeEach(() => {
  sucheMock.mockReset()
  sucheMock.mockResolvedValue({
    ok: true,
    antwort: {
      orte: [{ name: 'Leipzig Hbf', eva: '8010205', lat: 51.345, lon: 12.381, verkehrsmittel: ['bahn'] }],
      quellen: { bahnhoefe: 'ok', haltestellen: 'ok' },
    },
  })
  routeMock.mockReset()
  routeMock.mockImplementation(async (p: RouteParameter) => antwort(p))
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('App: Rechtsseiten mit eigener Adresse (AP 3)', () => {
  it('zeigt auf /impressum das Impressum und laesst die Adresse stehen', () => {
    window.history.replaceState(null, '', '/impressum')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeDefined()
    expect(window.location.pathname).toBe('/impressum')
  })

  it('oeffnet das Impressum aus der Fusszeile ohne Neuladen und fuehrt zurueck zur Eingabe', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: 'Impressum' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeDefined()
    expect(window.location.pathname).toBe('/impressum')
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByLabelText('Ankunft: Bahnhof oder Haltestelle')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('fuehrt von der Datenschutzerklaerung zurueck auf die Uebersicht der laufenden Reise', async () => {
    sichereReise()
    window.history.replaceState(null, '', '/uebersicht')
    render(<App />)
    act(() => oeffneRechtsseite('datenschutz'))
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutz' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('button', { name: /Navigation starten/ })).toBeDefined()
    expect(window.location.pathname).toBe('/uebersicht')
  })

  // Vorwaerts im Browser landet wieder auf der Rechtsseite - die App darf die
  // Adresse dabei nicht auf einen Bildschirm umbiegen.
  it('kommt mit Vorwaerts wieder auf die Rechtsseite', async () => {
    sichereReise()
    window.history.replaceState(null, '', '/uebersicht')
    render(<App />)
    act(() => oeffneRechtsseite('impressum'))
    act(() => window.history.back())
    expect(await screen.findByRole('button', { name: /Navigation starten/ })).toBeDefined()
    act(() => window.history.forward())
    expect(await screen.findByRole('heading', { level: 1, name: 'Impressum' })).toBeDefined()
    expect(window.location.pathname).toBe('/impressum')
  })

  // Direkt aufgerufen (Suchergebnis, Lesezeichen) liegt davor keine Seite der
  // App - Zurueck fuehrt dann zur Eingabe, nicht aus der App hinaus.
  it('fuehrt von einer direkt aufgerufenen Rechtsseite zur Eingabe', async () => {
    window.history.replaceState(null, '', '/datenschutz')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByLabelText('Ankunft: Bahnhof oder Haltestelle')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('oeffnet alte Raute-Links (#impressum) auf der neuen Adresse', () => {
    window.history.replaceState(null, '', '/#impressum')
    leiteRauteUm()
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeDefined()
    expect(window.location.pathname).toBe('/impressum')
  })
})
