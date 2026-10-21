import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { track } from '@vercel/analytics'
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
vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

const sucheMock = vi.mocked(sucheOrte)
const routeMock = vi.mocked(holeRoute)
const trackMock = vi.mocked(track)

/**
 * Die Ablauftests tippen sich durch Eingabe, Uebersicht und Weg. In der
 * vollen, parallelen Suite auf diesem Rechner reissen sie die 5 s
 * (21.10.2026: 5,08 s) - wie der erste Test in `App.test.tsx`.
 */
const ABLAUF_MS = 20_000

/** Die gesendeten Messpunkte, in der Reihenfolge des Sendens. */
const gemeldet = () => trackMock.mock.calls.map(([name]) => name)

async function bisZumDashboard(): Promise<void> {
  render(<App />)
  await userEvent.type(screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle'), 'Leip')
  await userEvent.click(await screen.findByRole('button', { name: /^Leipzig Hbf/ }, { timeout: 3000 }))
  await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '6')
  await userEvent.type(screen.getByLabelText('Anschluss: Gleis'), '16')
  await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
  expect(await screen.findByRole('button', { name: /Navigation starten/ })).toBeDefined()
}

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
  trackMock.mockReset()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

/**
 * Die vier Messpunkte aus BRIEF.md 3 (AP 4). Drei davon sind zugleich
 * Seitenaufrufe (/uebersicht, /weg, /angekommen); die zaehlt
 * `@vercel/analytics` nur, wenn sie per pushState entstehen - replaceState
 * sieht die Messung nicht.
 */
describe('App: die vier Messpunkte (AP 4)', () => {
  it('meldet jeden Punkt einer Reise genau einmal, in der Reihenfolge des Ablaufs', async () => {
    await bisZumDashboard()
    expect(gemeldet()).toEqual(['eingabe-fertig'])
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    expect(gemeldet()).toEqual(['eingabe-fertig', 'navigation-start'])
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(gemeldet()).toEqual(['eingabe-fertig', 'navigation-start', 'schritt-1'])
    // „Angekommen" steht erst am letzten Schritt.
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(screen.getByRole('button', { name: /Angekommen/ }))
    expect(gemeldet()).toEqual(['eingabe-fertig', 'navigation-start', 'schritt-1', 'ziel'])
  }, ABLAUF_MS)

  it('zaehlt Hin und Her ueber die Leiste nicht doppelt', async () => {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }))
    await userEvent.click(screen.getByRole('button', { name: 'Weg' }))
    await userEvent.click(screen.getByRole('button', { name: 'Eingabe' }))
    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }))
    expect(gemeldet()).toEqual(['eingabe-fertig', 'navigation-start'])
  }, ABLAUF_MS)

  it('zaehlt eine neue Reise neu', async () => {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: 'Eingabe' }))
    await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
    expect(await screen.findByRole('button', { name: /Navigation starten/ })).toBeDefined()
    expect(gemeldet()).toEqual(['eingabe-fertig', 'eingabe-fertig'])
  }, ABLAUF_MS)

  // Nach dem Neuladen mitten im Weg ist die Navigation schon gestartet.
  it('zaehlt nach dem Neuladen nicht nach, was schon geschehen ist', () => {
    sichereReise(1)
    window.history.replaceState(null, '', '/weg')
    render(<App />)
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDefined()
    expect(gemeldet()).toEqual([])
  })

  it('erzeugt Uebersicht, Weg und Angekommen per pushState', async () => {
    await bisZumDashboard()
    const push = vi.spyOn(window.history, 'pushState')
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(screen.getByRole('button', { name: /Angekommen/ }))
    expect(push.mock.calls.map(([, , adresse]) => adresse)).toEqual(['/weg', '/angekommen'])
    push.mockRestore()
  }, ABLAUF_MS)

  it('traegt die Uebersicht per pushState ein', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    await bisZumDashboard()
    expect(push.mock.calls.map(([, , adresse]) => adresse)).toContain('/uebersicht')
    push.mockRestore()
  }, ABLAUF_MS)
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
