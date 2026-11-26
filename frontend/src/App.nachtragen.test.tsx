import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { holeRoute } from './api/client'
import { sucheOrte } from './api/orte'
import type { LiveEreignis, RouteErgebnis, RouteParameter } from './api/typen'
import type { ZugestellteMeldung } from './plattform/push'

/**
 * Server-Mitteilungen nachtragen (Konzept Mitteilungen 6.2, Entscheidung A):
 * Was als Mitteilung kam, steht beim Oeffnen der App als Meldung da - genau
 * so, als waere es ueber den Live-Strom gekommen. Echter `App`, gemockt sind
 * nur Netz, Live-Strom und die Plugin-Grenze in `plattform/push.ts`.
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

const strom: { sende?: (e: LiveEreignis) => void } = {}
vi.mock('./api/sse', () => ({
  verbindeLive: (o: { onEreignis: (e: LiveEreignis) => void }) => {
    strom.sende = o.onEreignis
    return () => undefined
  },
}))

const push = vi.hoisted(() => ({
  tippe: undefined as ((m: ZugestellteMeldung) => void) | undefined,
  zugestellt: vi.fn(),
}))
vi.mock('./plattform/push', async () => {
  const echt = await vi.importActual<typeof import('./plattform/push')>('./plattform/push')
  return {
    ...echt,
    hoereAufAntippen: (f: (m: ZugestellteMeldung) => void) => {
      push.tippe = f
      return () => undefined
    },
    holeZugestellte: push.zugestellt,
  }
})

const routeMock = vi.mocked(holeRoute)

function antwort(p: RouteParameter): RouteErgebnis {
  return { stufe: 1, schritte: [{ text: `Zu Gleis ${p.gleisAb}`, typ: 'eben' }], gehzeitSek: 300, hinweise: [] }
}

const gleisMeldung = (aktion?: 'weg'): ZugestellteMeldung => ({
  ereignis: { typ: 'gleiswechsel', zug: 'ICE 1006', seite: 'ab', alt: '16', neu: '14', zeitstempel: '2026-11-26T15:00:00.000Z' },
  art: 'gleis-ab',
  ...(aktion ? { aktion } : {}),
  verbindung: false,
})

const vorschlaegeFuer = (gleis: string) =>
  (routeMock.mock.calls as unknown as [RouteParameter][]).filter(([p]) => p.gleisAb === gleis).length

async function bisZumDashboard(): Promise<void> {
  render(<App />)
  await userEvent.type(screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle'), 'Leip')
  await userEvent.click(await screen.findByRole('button', { name: /^Leipzig Hbf/ }, { timeout: 3000 }))
  await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '6')
  await userEvent.type(screen.getByLabelText('Anschluss: Gleis'), '16')
  await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
  expect(await screen.findByText(/Gehzeit/)).toBeDefined()
}

beforeEach(() => {
  vi.mocked(sucheOrte).mockResolvedValue({
    ok: true,
    antwort: {
      orte: [{ name: 'Leipzig Hbf', eva: '8010205', lat: 51.345, lon: 12.381, verkehrsmittel: ['bahn'] }],
      quellen: { bahnhoefe: 'ok', haltestellen: 'ok' },
    },
  })
  routeMock.mockReset()
  routeMock.mockImplementation(async (p: RouteParameter) => antwort(p))
  push.zugestellt.mockReset()
  push.zugestellt.mockResolvedValue([])
  push.tippe = undefined
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  strom.sende = undefined
})

describe('App: Server-Mitteilungen nachtragen', () => {
  it('traegt eine angetippte Gleis-Mitteilung als Meldung mit Wegvorschlag ein und oeffnet die Meldungen', async () => {
    await bisZumDashboard()
    act(() => push.tippe!(gleisMeldung()))
    await waitFor(() => expect(window.location.pathname).toBe('/meldungen'))
    await waitFor(() => expect(vorschlaegeFuer('14')).toBe(1))
    expect(await screen.findByRole('button', { name: 'Route übernehmen' })).toBeDefined()
  })

  it('traegt zugestellte Mitteilungen beim Oeffnen nach', async () => {
    push.zugestellt.mockResolvedValue([gleisMeldung()])
    await bisZumDashboard()
    await waitFor(() => expect(vorschlaegeFuer('14')).toBe(1))
    expect(screen.getByRole('button', { name: 'Meldung ansehen' })).toBeDefined()
    // Beim Oeffnen bleibt die Uebersicht stehen - nur Antippen wechselt die Seite.
    expect(window.location.pathname).toBe('/uebersicht')
  })

  it('traegt eine Meldung nicht doppelt ein, die der Live-Strom schon brachte', async () => {
    await bisZumDashboard()
    act(() => strom.sende!(gleisMeldung().ereignis!))
    await waitFor(() => expect(vorschlaegeFuer('14')).toBe(1))
    act(() => push.tippe!(gleisMeldung()))
    await waitFor(() => expect(window.location.pathname).toBe('/meldungen'))
    // Kein zweiter Vorschlag - und kein Verlauf: Eine doppelte Meldung
    // stuende dort als „Frueher auf dieser Fahrt“.
    expect(vorschlaegeFuer('14')).toBe(1)
    expect(await screen.findByRole('button', { name: 'Route übernehmen' })).toBeDefined()
    expect(screen.queryByText('Früher auf dieser Fahrt')).toBeNull()
  })

  it('oeffnet bei der Aktion weg den Weg zum neuen Gleis', async () => {
    await bisZumDashboard()
    act(() => push.tippe!(gleisMeldung('weg')))
    await waitFor(() => expect(window.location.pathname).toBe('/weg'))
    expect((await screen.findAllByText('Zu Gleis 14')).length).toBeGreaterThan(0)
  })

  it('oeffnet bei Rot die Uebersicht', async () => {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/weg'))
    act(() => push.tippe!({ ereignis: null, art: 'rot', verbindung: false }))
    await waitFor(() => expect(window.location.pathname).toBe('/uebersicht'))
  })
})
