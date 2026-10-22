import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Config, DriveStep, Driver } from 'driver.js'
import { AppRahmen } from '../AppRahmen'
import { holeApi } from '../api/basis'
import { SCHLUESSEL } from '../sitzung/eingabespeicher'
import { REISE_SCHLUESSEL, schreibeReise } from '../sitzung/reisespeicher'
import { SCHRITTE } from './schritte'
import { starteTour } from './tour'
import { vorfuehrungLaeuft } from './zustand'

/**
 * driver.js gestellt: Er hält fest, was hervorgehoben wird, und gibt dem
 * Test die Knöpfe der Sprechblase in die Hand. Alles andere ist echt - die
 * App, die Vorführquelle, der Sitzungsspeicher.
 */
function gestellterDriver() {
  const stand = {
    config: undefined as Config | undefined,
    schritte: [] as DriveStep[],
    zerstoert: 0,
  }
  const erzeuge = (config: Config): Driver => {
    stand.config = config
    return {
      highlight: (s: DriveStep) => stand.schritte.push(s),
      destroy: () => {
        stand.zerstoert++
      },
      isActive: () => stand.zerstoert === 0,
      refresh: () => {},
    } as unknown as Driver
  }
  const aktuell = () => stand.schritte[stand.schritte.length - 1]
  const element = () => aktuell()?.element as HTMLElement | undefined
  const drueck = (knopf: 'onNextClick' | 'onPrevClick' | 'onCloseClick') =>
    act(() => aktuell().popover![knopf]!(element(), aktuell(), {} as never))
  return { stand, erzeuge, aktuell, element, drueck }
}

const NUTZER_ENTWURF = '{"fassung":2,"entwurf":"halb ausgefüllt"}'
const NUTZER_REISE = '{"reise":"läuft"}'

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/eingabe')
})
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// starteTour läuft bewusst AUSSERHALB von act: Sie wartet darauf, dass die
// App neu aufgebaut ist - und act hielte genau diesen Aufbau bis zu ihrem
// Ende zurück.

/** Wartet, bis die Tour bei Schritt `nr` steht. */
async function beiSchritt(d: ReturnType<typeof gestellterDriver>, nr: number): Promise<void> {
  await waitFor(() => expect(d.aktuell()?.popover?.title).toBe(SCHRITTE[nr].titel), { timeout: 3000 })
}

describe('Einführungstour', () => {
  it('führt durch Eingabe, Übersicht und Weg und stellt danach alles wieder her', async () => {
    sessionStorage.setItem(SCHLUESSEL, NUTZER_ENTWURF)
    sessionStorage.setItem(REISE_SCHLUESSEL, NUTZER_REISE)
    render(<AppRahmen />)
    const d = gestellterDriver()

    void starteTour({ erzeugeDriver: d.erzeuge })
    expect(vorfuehrungLaeuft()).toBe(true)
    await beiSchritt(d, 0)
    expect(d.element()).toBeUndefined()

    for (let nr = 1; nr < SCHRITTE.length; nr++) {
      d.drueck('onNextClick')
      // eslint-disable-next-line no-await-in-loop -- Die Schritte folgen aufeinander; nacheinander ist der Zweck.
      await beiSchritt(d, nr)
      const ziel = SCHRITTE[nr].ziel
      if (ziel) expect(d.element()?.dataset.tour).toBe(ziel)
      else expect(d.element()).toBeUndefined()
    }
    // Unterwegs wirklich auf dem Weg angekommen - die echte App hat gewechselt.
    expect(window.location.pathname).toBe('/weg')

    // Letzter Schritt: „Eigene Reise eingeben“ beendet die Tour.
    expect(d.aktuell().popover?.nextBtnText).toBe('Eigene Reise eingeben')
    d.drueck('onNextClick')
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))
    expect(d.stand.zerstoert).toBe(1)
    expect(sessionStorage.getItem(SCHLUESSEL)).toBe(NUTZER_ENTWURF)
    expect(sessionStorage.getItem(REISE_SCHLUESSEL)).toBe(NUTZER_REISE)
    expect(window.location.pathname).toBe('/eingabe')
    // Der Fokus steht wieder dort, wo die Tour begann.
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Einführung starten'))
    // Die Vorführquelle ist aus: /api/* geht wieder ans Netz.
    const netz = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))
    await holeApi('/api/health')
    expect(netz).toHaveBeenCalled()
  })

  it('zählt die zwölf Schritte und zeigt Zurück nur innerhalb eines Bildschirms', async () => {
    render(<AppRahmen />)
    const d = gestellterDriver()
    void starteTour({ erzeugeDriver: d.erzeuge })
    await beiSchritt(d, 0)
    expect(d.aktuell().popover?.showProgress).toBe(false)
    expect(d.aktuell().popover?.showButtons).not.toContain('previous')

    d.drueck('onNextClick')
    await beiSchritt(d, 1)
    expect(d.aktuell().popover).toMatchObject({ showProgress: true, progressText: '1 von 12' })
    // Davor steht die Begrüßung auf derselben Seite.
    expect(d.aktuell().popover?.showButtons).toContain('previous')

    d.drueck('onNextClick')
    await beiSchritt(d, 2)
    d.drueck('onPrevClick')
    await beiSchritt(d, 1)

    for (let nr = 2; nr <= 5; nr++) {
      d.drueck('onNextClick')
      // eslint-disable-next-line no-await-in-loop -- Die Schritte folgen aufeinander; nacheinander ist der Zweck.
      await beiSchritt(d, nr)
    }
    // Erster Schritt der Übersicht: kein Weg zurück auf die Eingabe.
    expect(SCHRITTE[5].bildschirm).toBe('uebersicht')
    expect(d.aktuell().popover?.showButtons).not.toContain('previous')
    d.drueck('onCloseClick')
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))
  })

  it('beendet mit Esc und räumt weg, was vorher nicht da war', async () => {
    render(<AppRahmen />)
    const d = gestellterDriver()
    void starteTour({ erzeugeDriver: d.erzeuge })
    await beiSchritt(d, 0)
    expect(sessionStorage.getItem(SCHLUESSEL)).not.toBeNull()

    // driver.js meldet Esc, ×, und den Klick daneben über onDestroyStarted.
    act(() => d.stand.config!.onDestroyStarted!(undefined, d.aktuell(), { reason: 'escape' } as never))
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))
    expect(d.stand.zerstoert).toBe(1)
    expect(sessionStorage.getItem(SCHLUESSEL)).toBeNull()
    expect(sessionStorage.getItem(REISE_SCHLUESSEL)).toBeNull()
    // Auch hier, wo die Tour auf der Eingabe endet: Fokus auf dem NEUEN „i“.
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Einführung starten'))
    expect(document.activeElement?.isConnected).toBe(true)
  })

  it('beendet sauber, wenn der nächste Bildschirm nicht kommt', async () => {
    render(<AppRahmen />)
    const d = gestellterDriver()
    void starteTour({ erzeugeDriver: d.erzeuge, wartezeitMs: 300 })
    await beiSchritt(d, 0)
    for (let nr = 1; nr <= 4; nr++) {
      d.drueck('onNextClick')
      // eslint-disable-next-line no-await-in-loop -- Die Schritte folgen aufeinander; nacheinander ist der Zweck.
      await beiSchritt(d, nr)
    }
    // Die Übersicht bleibt aus: Der Knopf „Umstieg starten“ ist nicht mehr zu finden.
    d.element()!.setAttribute('data-tour', 'weg-damit')
    d.drueck('onNextClick')
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false), { timeout: 3000 })
    expect(d.stand.zerstoert).toBe(1)
  })

  it('bewegt bei reduzierter Bewegung nichts', async () => {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({
      matches: abfrage.includes('prefers-reduced-motion'),
      media: abfrage,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      render(<AppRahmen />)
      const d = gestellterDriver()
      void starteTour({ erzeugeDriver: d.erzeuge })
      await beiSchritt(d, 0)
      expect(d.stand.config).toMatchObject({ animate: false, smoothScroll: false })
      d.drueck('onCloseClick')
      await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // Plan 7.5 (b): Die Eingabe sichert ihren Entwurf erst beim Absenden. Was
  // halb eingetippt dasteht, gibt es nur im Formular - und das baut die Tour
  // neu auf. Es muss danach trotzdem dastehen, ohne im Speicher zu landen.
  it('lässt eine halb ausgefüllte, nicht abgeschickte Eingabe stehen', async () => {
    render(<AppRahmen />)
    fireEvent.change(screen.getByLabelText('Ankunft: Gleis'), { target: { value: '7' } })
    const d = gestellterDriver()
    void starteTour({ erzeugeDriver: d.erzeuge })
    await beiSchritt(d, 0)
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Ankunft: Gleis').value).toBe('14'))

    d.drueck('onCloseClick')
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Ankunft: Gleis').value).toBe('7'))
    expect(sessionStorage.getItem(SCHLUESSEL)).toBeNull()
  })

  // Plan 7.5 (c): eine laufende Reise auf /weg, über die Leiste zur Eingabe,
  // dort das „i“. Danach führt die Leiste wieder zu DIESER Reise.
  it('führt nach der Tour zurück zur laufenden Reise des Nutzers', async () => {
    const route = { stufe: 1 as const, schritte: [{ text: 'Zum Leipziger Kopf', typ: 'eben' as const }], gehzeitSek: 200, hinweise: [] }
    schreibeReise({
      werte: { eva: '8010205', bahnhofName: 'Leipzig Hbf', gleisAn: '6', gleisAb: '16', wagenAn: '', wagenAb: '', profil: 'normal', variante: 'schnellste', abschnitt: 'mitte' },
      route,
      variante: 'schnellste',
      standort: 'mitte',
      gehzeiten: { 'schnellste|mitte': 200 },
      meldungen: [],
      versatz: 0,
    })
    // Außerhalb der Tour hängt die Reise am Live-Strom; jsdom kennt keinen.
    vi.stubGlobal(
      'EventSource',
      class {
        static CLOSED = 2
        readyState = 0
        close() {}
        addEventListener() {}
      },
    )
    window.history.replaceState(null, '', '/weg')
    render(<AppRahmen />)
    act(() => screen.getByRole('button', { name: /Eingabe/ }).click())
    await waitFor(() => expect(window.location.pathname).toBe('/eingabe'))

    const d = gestellterDriver()
    void starteTour({ erzeugeDriver: d.erzeuge })
    await beiSchritt(d, 0)
    d.drueck('onCloseClick')
    await waitFor(() => expect(vorfuehrungLaeuft()).toBe(false))

    act(() => screen.getByRole('button', { name: /Weg/ }).click())
    await waitFor(() => expect(screen.getAllByText('Zum Leipziger Kopf').length).toBeGreaterThan(0))
    expect(window.location.pathname).toBe('/weg')
    cleanup()
    vi.unstubAllGlobals()
  })
})
