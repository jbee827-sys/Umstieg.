import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { holeRoute } from './api/client'
import { sucheOrte } from './api/orte'
import type { LiveEreignis, RouteErgebnis, RouteParameter } from './api/typen'
import { REISE_SCHLUESSEL, schreibeReise } from './sitzung/reisespeicher'

/**
 * DIE NAHT ZWISCHEN KNOPF UND WIRKUNG.
 *
 * Der schwerste Fund dieses Projekts (Mobilabnahme 07.09.2026): Die
 * Routenwahl war auf dem Handy tot, vier Fehler uebereinander - und KEINER
 * lag in einer getesteten Datei. `Dashboard.test.tsx` mockte `onVariante`
 * weg, `varianten.test.ts` prueft den Lader, und dazwischen lag ungeprueft
 * genau der Code, in dem alle vier sassen.
 *
 * Diese Datei prueft das Dazwischen: echter `App`, echte Verdrahtung, nur die
 * Netzgrenze gemockt. Ein Tipp auf einen Knopf muss eine Anfrage mit den
 * richtigen Parametern ausloesen und ihr Ergebnis auf den Schirm bringen.
 */
vi.mock('./api/client', async () => {
  const echt = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    // `RouteFehler` wird mit `instanceof` geprueft - die echte Klasse bleibt.
    RouteFehler: echt.RouteFehler,
    holeRoute: vi.fn(),
    holeTafel: vi.fn(async () => ({ ok: true, eintraege: [] })),
  }
})
/**
 * Kein EventSource in jsdom. Der Strom wird hier nicht nachgebaut, sondern
 * aufgezeichnet: Der Test haelt den Rueckkanal in der Hand und kann ein
 * Ereignis einspeisen - so wie es am 03.09.2026 fuer P4/P5 im Browser gemacht
 * wurde, statt auf einen echten Gleiswechsel zu warten.
 */
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

const sucheMock = vi.mocked(sucheOrte)
const routeMock = vi.mocked(holeRoute)

/**
 * Leipzig Hbf, Gleis 6 nach 16 - der Fall aus dem README (13.09.2026).
 * Vom Bahnsteiganfang gewinnt die Unterfuehrung, von der Mitte und vom Ende
 * die U-Form ueber den Bahnhofskopf.
 */
const LEIPZIG: Record<string, { sek: number; weg: string }> = {
  anfang: { sek: 343, weg: 'Durch die Unterführung' },
  mitte: { sek: 354, weg: 'Über den Bahnhofskopf' },
  ende: { sek: 251, weg: 'Über den Bahnhofskopf' },
}

function antwort(p: RouteParameter): RouteErgebnis {
  const fall = LEIPZIG[p.abschnitt ?? 'mitte']
  // Barrierefrei ist im Kopfbahnhof laenger - so ist an der Zahl ablesbar,
  // welche Variante die Antwort beschreibt.
  const zuschlag = p.variante === 'barrierefrei' ? 120 : 0
  return {
    stufe: 1,
    schritte: [{ text: fall.weg, typ: 'eben' }],
    gehzeitSek: fall.sek + zuschlag,
    // Der Hinweis benennt den WEG. Er steht auf dem Dashboard und belegt
    // damit, dass die ganze Antwort uebernommen wird - nicht nur die Zahl.
    hinweise: [fall.weg],
  }
}

function abrufe(): RouteParameter[] {
  return (routeMock.mock.calls as unknown as [RouteParameter][]).map(([p]) => p)
}

async function bisZumDashboard(): Promise<void> {
  render(<App />)
  await userEvent.type(screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle'), 'Leip')
  // 3 s statt der ueblichen 1 s: Hinter dem Vorschlag stehen 300 ms
  // Entprellung, und im ersten Lauf nach einer Aenderung uebersetzt Vitest
  // die geaenderten Dateien, waehrend 40 Testdateien parallel laufen - am
  // 11.10.2026 riss dieser Test dabei einmal die Sekunde.
  await userEvent.click(
    await screen.findByRole('button', { name: /^Leipzig Hbf/ }, { timeout: 3000 }),
  )
  await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '6')
  await userEvent.type(screen.getByLabelText('Anschluss: Gleis'), '16')
  await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
  expect(await screen.findByText(/Gehzeit/)).toBeDefined()
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
  // Jeder Test beginnt auf `/` - die Adresse ueberlebt sonst den Test davor.
  window.history.replaceState(null, '', '/')
})

/**
 * Die Uebersicht rollt nur innen, „Navigation starten" steht fest ueber der
 * Leiste (`BRIEF.md`, Dashboard c). Dafuer braucht die Spalte `.app-dashboard`
 * - die Regeln dazu prueft `screens/dashboard-css.test.ts`, hier nur, dass
 * `App` sie der Uebersicht auch gibt.
 */
describe('App: die Uebersicht', () => {
  // Mehr Zeit als die 5 s Voreinstellung: Als erster Test der Datei zahlt er
  // das Aufwaermen von App samt aller Bildschirme. Unter voller Suite lag er
  // am 17.10.2026 bei 3,7 s und riss mit den zwei Ortsfeldern die Grenze -
  // einzeln braucht er 2,3 s.
  it('steht in der Spalte, die nur innen rollt', async () => {
    await bisZumDashboard()
    expect(document.querySelector('main.app-dashboard')).not.toBeNull()
  }, 15_000)

  it('stellt die Eingabe in die Spalte, die nur innen rollt', () => {
    render(<App />)
    expect(document.querySelector('main.app-eingabe')).not.toBeNull()
  })
})

describe('App: Standortwahl am Ankunftsgleis', () => {
  it('rechnet zunaechst ab der Bahnsteigmitte', async () => {
    await bisZumDashboard()
    expect(abrufe()[0].abschnitt).toBe('mitte')
    expect(screen.getByText('Gehzeit 6 min')).toBeDefined()
  })

  /**
   * Der eigentliche Zweck der Wahl: ein anderer Standort ist ein anderer WEG,
   * nicht nur eine andere Zahl.
   */
  it('holt beim Tipp auf Anfang die Route fuer den Bahnsteiganfang', async () => {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: /^Anfang/ }))

    await waitFor(() => expect(abrufe().some((p) => p.abschnitt === 'anfang')).toBe(true))
    const erster = abrufe().find((p) => p.abschnitt === 'anfang')!
    expect(erster.gleisAn).toBe('6')
    expect(erster.gleisAb).toBe('16')
  })

  it('zeigt danach den Weg und die Gehzeit des neuen Standorts', async () => {
    await bisZumDashboard()
    // Ab der Mitte fuehrt der Weg ueber den Bahnhofskopf.
    expect(screen.getByText('Über den Bahnhofskopf')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: /^Anfang/ }))
    // Ab dem Anfang durch die Unterfuehrung - und 343 s statt 354 s.
    expect(await screen.findByText('Durch die Unterführung')).toBeDefined()
    expect(screen.getByText('Gehzeit 6 min')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: /^Ende/ }))
    // 251 s -> 5 min, wieder ueber den Bahnhofskopf.
    expect(await screen.findByText('Gehzeit 5 min')).toBeDefined()
    expect(screen.getByText('Über den Bahnhofskopf')).toBeDefined()
  })

  it('traegt die Gehzeiten der uebrigen Standorte an ihren Knoepfen nach', async () => {
    await bisZumDashboard()
    // 343 s -> 6 min, 354 s -> 6 min, 251 s -> 5 min
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Ende/ }).textContent).toBe('Ende5 min'),
    )
    expect(screen.getByRole('button', { name: /^Anfang/ }).textContent).toBe('Anfang6 min')
  })

  /**
   * Der Fehler, gegen den der gemeinsame Gehzeit-Speicher gebaut ist: Nach
   * einem Standortwechsel duerfen an den Variantenknoepfen keine Minuten vom
   * ALTEN Standort stehenbleiben.
   */
  it('rechnet die Variantenminuten fuer den neuen Standort neu', async () => {
    await bisZumDashboard()
    // Ab Mitte: barrierefrei 354 + 120 = 474 s -> 8 min.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Barrierefrei/ }).textContent).toMatch(/8 min/),
    )

    await userEvent.click(screen.getByRole('button', { name: /^Ende/ }))
    // Ab Ende: 251 + 120 = 371 s -> 7 min. Stuende hier weiter 8 min, waere
    // die Zahl fuer einen Standort gerechnet, an dem niemand mehr steht.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Barrierefrei/ }).textContent).toMatch(/7 min/),
    )
  })

  it('behaelt den Standort beim Variantenwechsel bei', async () => {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: /^Anfang/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Anfang/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )

    routeMock.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /Barrierefrei/ }))
    await waitFor(() => expect(abrufe().some((p) => p.variante === 'barrierefrei')).toBe(true))
    expect(abrufe().find((p) => p.variante === 'barrierefrei')!.abschnitt).toBe('anfang')
  })

  /**
   * Regressionsschutz fuer die Sparsamkeit: Wer hin und her tippt, soll nicht
   * bei jedem Tipp dieselben Nebenzeiten neu holen - im Bahnhof, ueber
   * Mobilfunk.
   */
  it('holt bereits bekannte Gehzeiten nicht noch einmal', async () => {
    await bisZumDashboard()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Ende/ }).textContent).toBe('Ende5 min'),
    )
    await userEvent.click(screen.getByRole('button', { name: /^Ende/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Ende/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )

    routeMock.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /^Mitte/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Mitte/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
    // Nur die Route fuer die Mitte selbst - Anfang und Ende liegen schon vor.
    expect(abrufe().filter((p) => p.abschnitt === 'anfang')).toHaveLength(0)
    expect(abrufe().filter((p) => p.abschnitt === 'ende')).toHaveLength(0)
  })
})

/**
 * Der Gleiswechsel ist die zweite Stelle, an der eine Route neu gerechnet
 * wird - und die einzige, an der es niemand angetippt hat. Genau deshalb
 * faellt dort ein vergessener Parameter nicht auf.
 */
describe('App: Standort ueberlebt einen Gleiswechsel', () => {
  async function gleiswechselAufGleis(neu: string): Promise<void> {
    await bisZumDashboard()
    await userEvent.click(screen.getByRole('button', { name: /^Anfang/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Anfang/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
    routeMock.mockClear()
    act(() =>
      strom.sende!({
        typ: 'gleiswechsel',
        zug: 'ICE 1006',
        alt: '16',
        neu,
        zeitstempel: '2026-09-13T20:00:00.000Z',
      }),
    )
  }

  it('rechnet den Vorschlag mit dem gewaehlten Standort, nicht ab der Mitte', async () => {
    await gleiswechselAufGleis('14')
    await waitFor(() => expect(routeMock).toHaveBeenCalled())
    expect(abrufe()[0].abschnitt).toBe('anfang')
    expect(abrufe()[0].gleisAb).toBe('14')
  })

  /**
   * Und nach dem Uebernehmen duerfen an den Knoepfen keine Minuten vom ALTEN
   * Gleis stehenbleiben: Der Speicher gehoerte zu einer Route, die es nicht
   * mehr gibt.
   */
  it('raeumt die Gehzeiten des alten Gleises weg, wenn der Vorschlag uebernommen wird', async () => {
    await gleiswechselAufGleis('14')
    await waitFor(() => expect(routeMock).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Meldung ansehen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Route übernehmen' }))

    // Die Minuten der beiden anderen Standorte sind weg, bis sie neu gerechnet
    // sind - und der Anfang bleibt gewaehlt.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Anfang/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
    expect(screen.getByRole('button', { name: /^Mitte/ }).textContent).toBe('Mitte')
    expect(screen.getByRole('button', { name: /^Ende/ }).textContent).toBe('Ende')
  })
})

/** Spec 2026-10-11 Seitenuebergaenge, §3/§4. */
describe('App: Adressen, Zurueck-Taste und Neuladen', () => {
  it('beginnt auf /eingabe und berichtigt /', () => {
    render(<App />)
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('traegt nach „Umstieg starten" /uebersicht in den Verlauf ein', async () => {
    await bisZumDashboard()
    expect(window.location.pathname).toBe('/uebersicht')
  })

  it('geht mit der Zurueck-Taste zur Eingabe', async () => {
    await bisZumDashboard()
    act(() => window.history.back())
    expect(await screen.findByLabelText('Ankunft: Bahnhof oder Haltestelle')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('laesst den Bildschirm stehen, wenn nur der Hash wechselt', async () => {
    await bisZumDashboard()
    act(() => {
      window.history.pushState(null, '', '/uebersicht#impressum')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(window.location.pathname).toBe('/uebersicht')
    expect(screen.getByRole('button', { name: /Navigation starten/ })).toBeDefined()
  })

  it('stellt nach dem Neuladen auf /weg den Weg wieder her', () => {
    const route = antwort({
      eva: '8010205',
      gleisAn: '6',
      gleisAb: '16',
      profil: 'normal',
      variante: 'schnellste',
      abschnitt: 'mitte',
    })
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
      versatz: 0,
    })
    window.history.replaceState(null, '', '/weg')
    render(<App />)
    expect(screen.getAllByText('Über den Bahnhofskopf').length).toBeGreaterThan(0)
    expect(window.location.pathname).toBe('/weg')
  })

  it('zeigt ohne gesicherte Reise auf /weg die Eingabe und berichtigt die Adresse', () => {
    window.history.replaceState(null, '', '/weg')
    render(<App />)
    expect(screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('sichert die Reise auf der Uebersicht und loescht sie mit „Angekommen"', async () => {
    await bisZumDashboard()
    expect(window.sessionStorage.getItem(REISE_SCHLUESSEL)).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Angekommen/ }))
    expect(await screen.findByText(/Du bist da/)).toBeDefined()
    expect(window.sessionStorage.getItem(REISE_SCHLUESSEL)).toBeNull()
  })
})

/** Spec 2026-10-11 Seitenuebergaenge, §5. */
describe('App: Seitenwechsel bewegen sich gerichtet', () => {
  let arten: (string | undefined)[]
  beforeEach(() => {
    arten = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (cb: () => void) => {
        arten.push(document.documentElement.dataset.uebergang)
        cb()
        return {
          finished: Promise.resolve(),
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition() {},
        }
      },
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('geht mit „Navigation starten" vorwaerts', async () => {
    await bisZumDashboard()
    arten.length = 0
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    expect(arten).toEqual(['vor'])
  })

  it('blendet ueber die Leiste quer', async () => {
    await bisZumDashboard()
    arten.length = 0
    await userEvent.click(screen.getByRole('button', { name: 'Weg' }))
    expect(arten).toEqual(['quer'])
  })
})
