import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { RouteFehler } from './api/client'
import { sucheOrte } from './api/orte'
import { holeHaltestellenTafel, holeWeg } from './api/haltestellen'
import type { HaltestellenTafelEintrag, LiveEreignis, Ort, Weg } from './api/typen'
import type { EingabeWerte } from './components/Eingabe'
import { schreibeReise } from './sitzung/reisespeicher'

/**
 * Der Haltestellenpfad Ende-zu-Ende (Umstieg 2.0, Task 18): echter `App`,
 * nur die Netzgrenze gemockt - wie `App.test.tsx` fuer den Bahnhofspfad.
 */
vi.mock('./api/client', async () => {
  const echt = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    RouteFehler: echt.RouteFehler,
    holeRoute: vi.fn(async () => {
      throw new Error('holeRoute darf im Haltestellenpfad nicht laufen')
    }),
    holeTafel: vi.fn(async () => ({ ok: true, eintraege: [] })),
  }
})
vi.mock('./api/orte', () => ({
  sucheOrte: vi.fn(),
  orteNahebei: vi.fn(async () => ({ ok: true, antwort: { orte: [], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } })),
}))
vi.mock('./api/haltestellen', async () => ({
  ...(await vi.importActual<object>('./api/haltestellen')),
  holeHaltestellenTafel: vi.fn(),
  holeWeg: vi.fn(),
}))
const strom: {
  sende?: (e: LiveEreignis) => void
  optionen?: Record<string, unknown>
  bahnhof: number
  haltestelle: number
  offen: number
} = { bahnhof: 0, haltestelle: 0, offen: 0 }
vi.mock('./api/sse', () => ({
  verbindeLive: () => {
    strom.bahnhof += 1
    return () => undefined
  },
  verbindeHaltestelleLive: (o: { onEreignis: (e: LiveEreignis) => void }) => {
    strom.sende = o.onEreignis
    strom.optionen = o as unknown as Record<string, unknown>
    strom.haltestelle += 1
    strom.offen += 1
    return () => {
      strom.offen -= 1
    }
  },
}))

const HBF: Ort = { name: 'Berlin Hbf', eva: '8011160', haltestelleId: 'h-hbf', lat: 52.5256, lon: 13.3695, verkehrsmittel: ['bahn', 'bus'] }
const BUS: Ort = { name: 'S+U Hauptbahnhof/Washingtonplatz (Berlin)', haltestelleId: 'h-bus', lat: 52.5233, lon: 13.3702, verkehrsmittel: ['bus'] }
const bald = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
const ICE: HaltestellenTafelEintrag = { fahrtId: 'ice', linie: 'ICE 1206', verkehrsmittel: 'bahn', ziel: 'München', zeitSoll: bald(5), steigSoll: '7', steigLat: 52.5249, steigLon: 13.3691, steigLevel: -2, steigGenau: true, echtzeit: true, ausfall: false }
const BUS245: HaltestellenTafelEintrag = { fahrtId: 'bus', linie: '245', verkehrsmittel: 'bus', ziel: 'S+U Zoologischer Garten', zeitSoll: bald(20), steigSoll: 'Pos. 11', steigLat: 52.5233, steigLon: 13.3702, steigGenau: true, echtzeit: false, ausfall: false }
const WEG: Weg = { stufe: 1, schritte: [{ text: 'Nach Ausstieg 90 m geradeaus', typ: 'eben', sekunden: 90 }, { text: 'Treppe hoch zur Unterführung (-1)', typ: 'treppe', sekunden: 30 }], gehzeitSek: 257, hinweise: [], distanzM: 309, herkunft: 'fussweg' }

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  strom.sende = undefined
  strom.optionen = undefined
  strom.bahnhof = 0
  strom.haltestelle = 0
  strom.offen = 0
  vi.mocked(sucheOrte).mockImplementation(async (q) => ({ ok: true, antwort: { orte: q.startsWith('Wash') ? [BUS] : [HBF], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } }))
  vi.mocked(holeHaltestellenTafel).mockReset()
  vi.mocked(holeHaltestellenTafel).mockImplementation(async (ort, typ) => ({ ok: true, stand: new Date().toISOString(), eintraege: typ === 'arr' && ort.haltestelleId === 'h-hbf' ? [ICE] : [BUS245] }))
  vi.mocked(holeWeg).mockReset()
  vi.mocked(holeWeg).mockImplementation(async (p) => (p.variante === 'barrierefrei' ? { ...WEG, gehzeitSek: 420 } : WEG))
})

async function starteUmstieg() {
  render(<App />)
  await userEvent.type(screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle'), 'Berlin')
  await userEvent.click(await screen.findByRole('button', { name: /Berlin Hbf/ }, { timeout: 3000 }))
  // Das zweite Ortsfeld klappt seit dem 21.10.2026 unter „Andere Haltestelle als Ankunft“ auf.
  await userEvent.click(screen.getByText('Andere Haltestelle als Ankunft'))
  await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Washington')
  await userEvent.click(await screen.findByRole('button', { name: /Washingtonplatz/ }, { timeout: 3000 }))
  await userEvent.click(screen.getByRole('button', { name: 'Ankunft wählen' }))
  await userEvent.click(await screen.findByRole('button', { name: /ICE 1206/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
  await userEvent.click(await screen.findByRole('button', { name: /245/ }))
  await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
}

describe('Haltestellenpfad Ende-zu-Ende (Paket 3.5)', () => {
  it('Berlin Hbf Gleis 7 → Bus 245: Weg, Ampel, „laut Fahrplan“, Live', async () => {
    await starteUmstieg()

    expect(await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })).toBeDefined()
    expect(vi.mocked(holeWeg)).toHaveBeenCalledWith(expect.objectContaining({
      von: { lat: 52.5249, lon: 13.3691, level: -2 }, nach: { lat: 52.5233, lon: 13.3702 }, variante: 'schnellste', ziel: 'Steig Pos. 11 (245)',
    }))
    expect(screen.getByText(/laut Fahrplan/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Mit Stopp/ })).toBeNull()
    expect(strom.optionen).toMatchObject({ fahrtAn: 'ice', fahrtAb: 'bus' })
    expect(strom.bahnhof).toBe(0)
    // Die zweite Variante kommt nach, ueber denselben Fussweg-Abruf.
    await waitFor(() => expect(screen.getByRole('button', { name: /Barrierefrei/ }).textContent).toContain('7 min'))
    // Der erste Test der Datei zahlt den Kaltstart; in der vollen Suite riss
    // er zweimal knapp die 5 s (19.10.2026) - wie der erste in App.test.tsx.
  }, 15_000)

  it('ein Ausfall des Anschlusses kommt als Stoermeldung mit der Linie', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    act(() => strom.sende!({ typ: 'ausfall', zug: 'bus', anzeige: '245', zeitstempel: new Date().toISOString() }))
    expect(await screen.findByText(/Bus 245 fällt aus/)).toBeDefined()
  })

  it('MOTIS weg: die Eingabe sagt es, statt still zu scheitern', async () => {
    vi.mocked(holeWeg).mockRejectedValue(new RouteFehler('haltestellen-nicht-verfuegbar', 'Haltestellendaten gerade nicht verfügbar.'))
    await starteUmstieg()
    expect(await screen.findByText('Haltestellendaten gerade nicht verfügbar. Bahnhöfe gehen weiter.')).toBeDefined()
  })

  it('zu weit auseinander: eigener Text', async () => {
    vi.mocked(holeWeg).mockRejectedValue(new RouteFehler('zu-weit', 'x'))
    await starteUmstieg()
    expect(await screen.findByText('Die beiden Steige liegen für einen Umstieg zu weit auseinander.')).toBeDefined()
  })

  it('Steigwechsel: neue Tafel, neuer Weg zum neuen Steig - als Vorschlag, nicht still', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    const neu = { ...BUS245, steigIst: 'Pos. 3', steigLat: 52.524, steigLon: 13.371 }
    vi.mocked(holeHaltestellenTafel).mockImplementation(async () => ({ ok: true, stand: new Date().toISOString(), eintraege: [neu] }))
    vi.mocked(holeWeg).mockClear()
    act(() => strom.sende!({ typ: 'gleiswechsel', zug: 'bus', anzeige: '245', alt: 'Pos. 11', neu: 'Pos. 3', zeitstempel: new Date().toISOString() }))
    await waitFor(() =>
      expect(vi.mocked(holeWeg)).toHaveBeenCalledWith(expect.objectContaining({ nach: { lat: 52.524, lon: 13.371 }, ziel: 'Steig Pos. 3 (245)' })),
    )
    expect(vi.mocked(holeHaltestellenTafel)).toHaveBeenCalledWith(BUS, 'dep')
    await userEvent.click(screen.getByRole('button', { name: /Was heißt das/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Route übernehmen/ }))
    expect(await screen.findByText('Steig Pos. 3')).toBeDefined()
  })

  it('Verspaetung des Anschlusses: neue Abfahrtszeit im Vorschlag', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    act(() => strom.sende!({ typ: 'verspaetung', zug: 'bus', anzeige: '245', alt: '10:20', neu: '23:59', zeitstempel: new Date().toISOString() }))
    await userEvent.click(await screen.findByRole('button', { name: /Was heißt das/ }))
    expect(await screen.findByText(/23:59/, { selector: 'dd' })).toBeDefined()
  })

  it('die Schrittansicht nennt Gleis und Steig im Titel', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: 'Navigation starten' }))
    expect(await screen.findByRole('heading', { name: 'Gleis 7 → Steig Pos. 11' })).toBeDefined()
  })

  it('eine gesicherte Haltestellenreise oeffnet nach dem Neuladen wieder mit Live', async () => {
    const werte: EingabeWerte = {
      eva: '', bahnhofName: 'Berlin Hbf → Washingtonplatz', gleisAn: '7', gleisAb: 'Pos. 11', wagenAn: '', wagenAb: '',
      profil: 'normal', variante: 'schnellste', abschnitt: 'mitte', zugAnName: 'ICE 1206', zugAbName: '245',
      haltestellen: { ankunft: { ort: HBF, fahrt: ICE }, anschluss: { ort: BUS, fahrt: BUS245 } },
    }
    schreibeReise({ werte, route: WEG, variante: 'schnellste', standort: 'mitte', gehzeiten: { 'schnellste|mitte': 257 }, meldungen: [], versatz: 0 })
    window.history.replaceState(null, '', '/uebersicht')
    render(<App />)
    expect(screen.getByText('Steig Pos. 11')).toBeDefined()
    expect(strom.optionen).toMatchObject({ fahrtAn: 'ice', fahrtAb: 'bus' })
    expect(strom.bahnhof).toBe(0)
  })
})

describe('Haltestellenpfad: Review Paket 3', () => {
  it('eine verspaetete Ankunft meldet die Ankunftszeit', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    act(() => strom.sende!({ typ: 'verspaetung', zug: 'ice', anzeige: 'ICE 1206', alt: '10:20', neu: '23:59', zeitstempel: new Date().toISOString() }))
    expect(await screen.findByText('Neue Ankunftszeit')).toBeDefined()
    expect(screen.getByText('ICE 1206 kommt um 23:59 statt 10:20 an.')).toBeDefined()
  })

  it('der Gleiswechsel des ICE heisst Gleiswechsel, nicht Steigwechsel', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    act(() => strom.sende!({ typ: 'gleiswechsel', zug: 'ice', anzeige: 'ICE 1206', alt: '7', neu: '8', zeitstempel: new Date().toISOString() }))
    expect(await screen.findByText('ICE 1206 fährt heute von Gleis 8 statt 7.')).toBeDefined()
  })
})

/*
 * Browserpruefung 19.10.2026: Der Strom wurde bei jedem Reiterwechsel und bei
 * jeder nachgeladenen Gehzeit geschlossen und neu geoeffnet. Kamen die neuen
 * Verbindungen schneller an als die Abmeldungen der alten, wies der Server
 * den Strom ab - und der Umstieg lief ohne Live-Daten.
 */
describe('Haltestellenpfad: ein Strom je Reise', () => {
  it('Gehzeiten nachladen und zwischen den Reitern wechseln oeffnet keinen neuen Strom', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    await waitFor(() => expect(screen.getByRole('button', { name: /Barrierefrei/ }).textContent).toContain('7 min'))
    await userEvent.click(screen.getByRole('button', { name: 'Navigation starten' }))
    await screen.findByRole('heading', { name: 'Gleis 7 → Steig Pos. 11' })
    await userEvent.click(screen.getByRole('button', { name: /Meldungen/ }))
    await userEvent.click(screen.getByRole('button', { name: /Übersicht/ }))
    await screen.findByText('Gehzeit 5 min')

    expect(strom.haltestelle).toBe(1)
    expect(strom.offen).toBe(1)
  })

  it('zurueck zur Eingabe schliesst den Strom', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: /Eingabe/ }))
    expect(strom.offen).toBe(0)
  })
})

describe('Haltestellenpfad: Gesamtreview Umstieg 2.0', () => {
  it('die Schrittansicht zeigt kein Ebenenschema, sondern sagt, warum keine Karte da ist', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: 'Navigation starten' }))
    await screen.findByRole('heading', { name: 'Gleis 7 → Steig Pos. 11' })
    expect(screen.queryByRole('img', { name: /Ebenenschema/ })).toBeNull()
    expect(document.querySelector('.schema-stapel')).toBeNull()
    expect(screen.getByText(/Für diesen Weg gibt es keine Karte/)).toBeDefined()
  })

  it('ein zweites Ausfall-Ereignis derselben Fahrt (Neuverbindung) meldet nicht doppelt', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    act(() => strom.sende!({ typ: 'ausfall', zug: 'bus', anzeige: '245', zeitstempel: new Date().toISOString() }))
    await userEvent.click(await screen.findByRole('button', { name: /Später/ }))
    act(() => strom.sende!({ typ: 'ausfall', zug: 'bus', anzeige: '245', zeitstempel: new Date().toISOString() }))
    expect(screen.queryByText(/Bus 245 fällt aus/)).toBeNull()
  })

  it('Steigwechsel, die Tafel kennt den neuen Steig noch nicht: kein Vorschlag zum alten Steig', async () => {
    await starteUmstieg()
    await screen.findByText('Gehzeit 5 min', {}, { timeout: 3000 })
    vi.mocked(holeWeg).mockClear()
    act(() => strom.sende!({ typ: 'gleiswechsel', zug: 'bus', anzeige: '245', alt: 'Pos. 11', neu: 'Pos. 3', zeitstempel: new Date().toISOString() }))
    await waitFor(() => expect(vi.mocked(holeHaltestellenTafel)).toHaveBeenCalledWith(BUS, 'dep'))
    await userEvent.click(screen.getByRole('button', { name: /Was heißt das/ }))
    expect(await screen.findByText(/lässt sich gerade nicht berechnen/)).toBeDefined()
    expect(vi.mocked(holeWeg)).not.toHaveBeenCalled()
  })
})
