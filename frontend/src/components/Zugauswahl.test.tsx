import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Zugauswahl } from './Zugauswahl'
import { holeTafel } from '../api/client'
import { holeHaltestellenTafel } from '../api/haltestellen'
import type { HaltestellenTafelEintrag, TafelEintrag } from '../api/typen'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
vi.mock('../api/haltestellen', () => ({ holeHaltestellenTafel: vi.fn() }))
const holeTafelMock = vi.mocked(holeTafel)
const haltestellenTafelMock = vi.mocked(holeHaltestellenTafel)

/** Uhrzeit in `minuten` Minuten, als "HH:MM" - die Tafel kennt kein Datum. */
function inMinuten(minuten: number): string {
  const d = new Date(Date.now() + minuten * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function zug(name: string, minuten: number, gleis = '1'): TafelEintrag {
  return { zug: name, zeitSoll: inMinuten(minuten), gleisSoll: gleis, ziel: 'Irgendwo' }
}

const ICE = zug('ICE 1006', 10, '14')

function zeige(auswahl: TafelEintrag | null = null, onAuswahl = vi.fn()) {
  render(
    <Zugauswahl eva="8011160" typ="dep" label="Abfahrt waehlen" auswahl={auswahl} onAuswahl={onAuswahl} />,
  )
  return onAuswahl
}

const aufklappen = () => userEvent.click(screen.getByRole('button', { name: 'Abfahrt waehlen' }))

describe('Zugauswahl', () => {
  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [ICE] })
  })

  it('fragt die Tafel erst beim Aufklappen ab', async () => {
    zeige()
    expect(holeTafelMock).not.toHaveBeenCalled()

    await aufklappen()

    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
  })

  it('holt die Tafel nur ein einziges Mal, auch nach Zu- und Aufklappen', async () => {
    zeige()
    await aufklappen()
    await screen.findByText(/ICE 1006/)
    await aufklappen() // zu
    await aufklappen() // wieder auf

    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
    expect(holeTafelMock).toHaveBeenCalledTimes(1)
  })

  it('meldet den angetippten Zug nach oben', async () => {
    const onAuswahl = zeige()
    await aufklappen()
    await userEvent.click(await screen.findByRole('button', { name: /ICE 1006/ }))
    expect(onAuswahl).toHaveBeenCalledWith(ICE)
  })

  it('nennt den fehlenden DB-Zugang beim Namen', async () => {
    holeTafelMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await aufklappen()
    expect(await screen.findByText(/kein DB-Zugang/)).toBeDefined()
  })
})

describe('Zugauswahl: Kategorien und Zeitfenster', () => {
  beforeEach(() => holeTafelMock.mockReset())

  it('gliedert die Tafel in benannte Kategorien statt in eine Bandwurmliste', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('S 5105', 12), zug('ICE 554', 8), zug('RE 3156', 20), zug('U 5', 30)],
    })
    zeige()
    await aufklappen()

    // Reihenfolge wie im Entwurf: Regional, Fern, S-Bahn, U-Bahn.
    const ueberschriften = await screen.findAllByRole('heading', { level: 3 })
    expect(ueberschriften.map((h) => h.textContent)).toEqual([
      'Regionalverkehr',
      'Fernverkehr',
      'S-Bahn',
      'U-Bahn',
    ])
  })

  it('haelt jede Kategorie in ihrer eigenen Gruppe', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('ICE 1', 5), zug('ICE 2', 15), zug('RE 9', 10)],
    })
    zeige()
    await aufklappen()

    const fern = await screen.findByRole('group', { name: 'Fernverkehr' })
    await userEvent.click(within(fern).getByRole('heading', { name: 'Fernverkehr' }))
    expect(within(fern).getAllByRole('button').map((b) => b.textContent)).toHaveLength(2)
    // Der RE gehoert nicht dazu, auch wenn er zeitlich dazwischenliegt.
    expect(within(fern).queryByText(/RE 9/)).toBeNull()
  })

  it('laesst weg, was laenger als 45 Minuten hin ist', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('RE 1', 40), zug('RE 2', 50)],
    })
    zeige()
    await aufklappen()

    expect(await screen.findByText(/RE 1/)).toBeDefined()
    expect(screen.queryByText(/RE 2/)).toBeNull()
  })

  it('laesst weg, was laenger als fuenf Minuten weg ist', async () => {
    holeTafelMock.mockResolvedValue({
      ok: true,
      eintraege: [zug('RE 1', -3), zug('RE 2', -10)],
    })
    zeige()
    await aufklappen()

    expect(await screen.findByText(/RE 1/)).toBeDefined()
    expect(screen.queryByText(/RE 2/)).toBeNull()
  })

  it('sagt es, wenn das Fenster leer ist - und nennt den Grund', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 1', 120)] })
    zeige()
    await aufklappen()

    // Frueher stand hier "Keine Zuege in der aktuellen Stunde gefunden" -
    // das stimmte nicht mehr, sobald das Fenster 45 Minuten misst.
    expect(await screen.findByText(/45 Minuten/)).toBeDefined()
  })
})

/**
 * `holeTafel` faengt heute jeden Netzfehler selbst ab und antwortet mit
 * `{ ok: false }` - deshalb hatte die `.then()`-Kette nie ein `.catch()`.
 * Das ist eine Zusicherung des Aufgerufenen, keine des Aufrufers: Bricht sie
 * (ein Umbau des Clients, ein Wurf im Rueckgabepfad), bleibt `setLaden(false)`
 * ungelaufen. Der Nutzer sieht dann "Tafel wird geladen ..." bis zum Neuladen
 * der Seite, und in der Konsole steht eine unbehandelte Rejection, die
 * niemand sucht.
 */
describe('Zugauswahl: die Tafel bleibt nicht ewig am Laden', () => {
  it('kommt aus dem Ladezustand heraus, wenn der Abruf wirft', async () => {
    holeTafelMock.mockRejectedValue(new Error('kaputt'))
    zeige()
    await aufklappen()

    expect(screen.queryByText(/Tafel wird geladen/)).toBeNull()
    expect(screen.getByText(/nicht erreichbar/i)).toBeTruthy()
  })
})

/**
 * Breites Layout (Spec 2026-10-11): Die Tafel steht offen neben dem Formular,
 * laedt von selbst, reicht weiter und bleibt nach der Wahl stehen.
 */
describe('Zugauswahl: immer offen (breites Layout)', () => {
  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [ICE] })
  })

  function zeigeOffen(auswahl: TafelEintrag | null = null, onAuswahl = vi.fn()) {
    const r = render(
      <Zugauswahl
        eva="8011160"
        typ="dep"
        label="Abfahrt · Berlin Hbf"
        auswahl={auswahl}
        onAuswahl={onAuswahl}
        immerOffen
      />,
    )
    return { ...r, onAuswahl }
  }

  it('laedt ohne Klick und hat keinen Knopf zum Aufklappen', async () => {
    zeigeOffen()
    expect(document.querySelector('[aria-expanded]')).toBeNull()
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Abfahrt · Berlin Hbf' })).toBeDefined()
  })

  it('zeigt beim Laden Skelettzeilen statt eines Satzes', () => {
    holeTafelMock.mockReturnValue(new Promise(() => {}))
    zeigeOffen()
    expect(screen.getByRole('status', { name: 'Tafel wird geladen' })).toBeDefined()
    expect(screen.queryByText(/Tafel wird geladen …/)).toBeNull()
  })

  it('reicht weiter als 45 Minuten', async () => {
    // 55 Minuten: ausserhalb des kurzen Fensters, aber immer vor dem Ende
    // der naechsten Stunde (das liegt mindestens 60 Minuten voraus).
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 9', 55)] })
    zeigeOffen()
    expect(await screen.findByText(/RE 9/)).toBeDefined()
  })

  it('markiert den gewaehlten Zug und laesst die Tafel stehen', async () => {
    zeigeOffen(ICE)
    const zeile = await screen.findByRole('button', { name: /ICE 1006/ })
    expect(zeile.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Ändern' })).toBeNull()
  })

  it('hebt die Wahl mit einem zweiten Tipp auf', async () => {
    const { onAuswahl } = zeigeOffen(ICE)
    await userEvent.click(await screen.findByRole('button', { name: /ICE 1006/ }))
    expect(onAuswahl).toHaveBeenCalledWith(null)
  })

  it('laedt neu, wenn der Bahnhof wechselt, und verwirft die alte Antwort', async () => {
    let loese!: (wert: Awaited<ReturnType<typeof holeTafel>>) => void
    holeTafelMock.mockReturnValueOnce(new Promise((r) => (loese = r)))
    holeTafelMock.mockResolvedValueOnce({ ok: true, eintraege: [zug('RE 7', 10)] })
    const { rerender } = zeigeOffen()
    rerender(
      <Zugauswahl
        eva="8000105"
        typ="dep"
        label="Abfahrt · Frankfurt"
        auswahl={null}
        onAuswahl={vi.fn()}
        immerOffen
      />,
    )
    expect(await screen.findByText(/RE 7/)).toBeDefined()
    loese({ ok: true, eintraege: [ICE] })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/ICE 1006/)).toBeNull()
  })
})

/*
 * Die Tafel wurde zu unuebersichtlich (Julian, 19.10.2026): Jede Kategorie
 * ist jetzt ein Aufklappblock - man oeffnet nur die, die man braucht.
 */
describe('Zugauswahl: Kategorien zum Aufklappen', () => {
  beforeEach(() => holeTafelMock.mockReset())

  const DREI = [zug('ICE 1', 5), zug('ICE 2', 15), zug('RE 9', 10), zug('S 5', 12)]

  function zeigeOffen(auswahl: TafelEintrag | null = null) {
    render(
      <Zugauswahl eva="8011160" typ="dep" label="Abfahrt · Berlin Hbf" auswahl={auswahl} onAuswahl={vi.fn()} immerOffen />,
    )
  }
  const block = (titel: string) => screen.getByRole('group', { name: titel }) as HTMLDetailsElement

  it('mehrere Kategorien: alle zu, die Zuege erst nach dem Aufklappen', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: DREI })
    zeigeOffen()
    await screen.findByRole('heading', { name: 'Fernverkehr' })

    expect([block('Regionalverkehr').open, block('Fernverkehr').open, block('S-Bahn').open]).toEqual([false, false, false])
    expect(screen.queryByRole('button', { name: /ICE 1/ })).toBeNull()

    await userEvent.click(screen.getByRole('heading', { name: 'Fernverkehr' }))

    expect(block('Fernverkehr').open).toBe(true)
    expect(within(block('Fernverkehr')).getAllByRole('button', { name: /ICE/ })).toHaveLength(2)
    // Die anderen bleiben zu.
    expect(block('Regionalverkehr').open).toBe(false)
  })

  it('nennt im Kopf, wie viele Zuege darin stehen', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: DREI })
    zeigeOffen()
    await screen.findByRole('heading', { name: 'Fernverkehr' })
    expect(block('Fernverkehr').querySelector('summary')!.textContent).toContain('2')
    expect(block('S-Bahn').querySelector('summary')!.textContent).toContain('1')
  })

  it('eine einzige Kategorie ist sofort offen - ein Klick mehr braechte nichts', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 1', 5), zug('RE 2', 10)] })
    zeigeOffen()
    expect(await screen.findByRole('button', { name: /RE 2/ })).toBeDefined()
    expect(block('Regionalverkehr').open).toBe(true)
  })

  it('die Kategorie der gewaehlten Fahrt ist offen, damit die Markierung zu sehen ist', async () => {
    const gewaehlt = DREI[3]
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: DREI })
    zeigeOffen(gewaehlt)
    const zeile = await screen.findByRole('button', { name: /S 5/ })
    expect(zeile.getAttribute('aria-pressed')).toBe('true')
    expect(block('S-Bahn').open).toBe(true)
    expect(block('Fernverkehr').open).toBe(false)
  })

  it('auch die Tafel zum Aufklappen (Handy) gliedert sich so', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: DREI })
    zeige()
    await aufklappen()
    await screen.findByRole('heading', { name: 'S-Bahn' })
    expect(block('S-Bahn').open).toBe(false)
    await userEvent.click(screen.getByRole('heading', { name: 'S-Bahn' }))
    expect(await screen.findByRole('button', { name: /S 5/ })).toBeDefined()
  })
})

/*
 * Bus, Tram und U-Bahn am Bahnhof (Julian, 21.10.2026): Die Ortsuche zeigte am
 * Bahnhof Bus und Tram an, die Tafel nur Zuege. Jetzt stehen sie darunter -
 * aus der Haltestellentafel des Bahnhofs, auch vom ZOB mit anderem Namen.
 */
describe('Zugauswahl: Bus und Tram am Bahnhof', () => {
  const GOE = {
    name: 'Göttingen',
    eva: '8000128',
    lat: 51.5364,
    lon: 9.9268,
    verkehrsmittel: ['bahn' as const],
    haltestelleId: 'de-DELFI_de:03152:33817',
  }
  const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
  const fahrt = (id: string, linie: string, vm: HaltestellenTafelEintrag['verkehrsmittel'], halt: string, m: number) =>
    ({
      fahrtId: id,
      linie,
      verkehrsmittel: vm,
      ziel: 'Weende',
      zeitSoll: inMin(m),
      steigSoll: 'C',
      steigLat: 51.537,
      steigLon: 9.928,
      steigGenau: true,
      echtzeit: true,
      ausfall: false,
      haltId: `id-${id}`,
      haltName: halt,
    }) satisfies HaltestellenTafelEintrag
  const BUS = fahrt('b1', '11', 'bus', 'Göttingen Bahnhof/ZOB', 8)
  const RE_MOTIS = fahrt('r1', 'RE2', 'bahn', 'Göttingen', 9)

  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 2', 9, '4')] })
    haltestellenTafelMock.mockReset()
    haltestellenTafelMock.mockResolvedValue({ ok: true, eintraege: [BUS, RE_MOTIS], stand: inMin(0) })
  })

  function zeigeMitBus(o: { auswahl?: TafelEintrag | null; fahrt?: HaltestellenTafelEintrag | null; immerOffen?: boolean } = {}) {
    const onAuswahl = vi.fn()
    const onFahrt = vi.fn()
    render(
      <Zugauswahl
        eva="8000128"
        typ="dep"
        label="Abfahrt waehlen"
        auswahl={o.auswahl ?? null}
        onAuswahl={onAuswahl}
        nahverkehr={{ ort: GOE, auswahl: o.fahrt ?? null, onAuswahl: onFahrt }}
        immerOffen={o.immerOffen}
      />,
    )
    return { onAuswahl, onFahrt }
  }

  it('breit: Bus unter den Zuegen, mit dem Namen des anderen Halts; der RE aus Transitous nicht doppelt', async () => {
    const { onFahrt } = zeigeMitBus({ immerOffen: true })
    const bus = (await screen.findByRole('group', { name: 'Bus' })) as HTMLDetailsElement
    expect(screen.getByRole('group', { name: 'Regionalverkehr' })).toBeDefined()
    expect(screen.queryByRole('group', { name: 'Bahn' })).toBeNull()
    expect(haltestellenTafelMock).toHaveBeenCalledWith(GOE, 'dep')

    await userEvent.click(within(bus).getByRole('heading', { name: 'Bus' }))
    const zeile = within(bus).getByRole('button', { name: /11/ })
    expect(zeile.textContent).toContain('ab Göttingen Bahnhof/ZOB')
    await userEvent.click(zeile)
    expect(onFahrt).toHaveBeenCalledWith(BUS)
  })

  it('Handy: beim Aufklappen beide Tafeln; die gewaehlte Busfahrt steht da wie ein Zug', async () => {
    const { onFahrt } = zeigeMitBus()
    await aufklappen()
    await userEvent.click(await screen.findByRole('heading', { name: 'Bus' }))
    await userEvent.click(screen.getByRole('button', { name: /11/ }))
    expect(onFahrt).toHaveBeenCalledWith(BUS)

    cleanup()
    zeigeMitBus({ fahrt: BUS })
    expect(screen.getByText(/nach Weende/)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Ändern' }))
  })

  it('faellt die Haltestellentafel aus, bleibt es still bei den Zuegen', async () => {
    haltestellenTafelMock.mockResolvedValue({ ok: false, fehler: 'nicht-verfuegbar' })
    zeigeMitBus({ immerOffen: true })
    expect(await screen.findByRole('group', { name: 'Regionalverkehr' })).toBeDefined()
    expect(screen.queryByRole('group', { name: 'Bus' })).toBeNull()
    expect(screen.queryByText(/nicht verfügbar/)).toBeNull()
  })
})
