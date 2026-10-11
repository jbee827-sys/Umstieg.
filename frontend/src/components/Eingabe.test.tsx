import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Eingabe } from './Eingabe'
import { holeTafel, sucheStationen } from '../api/client'
import type { BahnhofTreffer, TafelEintrag } from '../api/typen'
import type { EingabeEntwurf } from '../sitzung/eingabespeicher'
import { raeumeBreiteAuf, stelleBreite } from '../aufbau/testbreite'

vi.mock('../api/client', () => ({ sucheStationen: vi.fn(), holeTafel: vi.fn() }))
const sucheMock = vi.mocked(sucheStationen)
const holeTafelMock = vi.mocked(holeTafel)

const BERLIN: BahnhofTreffer = { name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369 }
const BERNAU: BahnhofTreffer = { name: 'Bernau (b Berlin)', eva: '8010036', lat: 52.68, lon: 13.59 }

function zeige(
  erkannt?: BahnhofTreffer[],
  entwurf?: EingabeEntwurf | null,
  extra: { kopf?: React.ReactNode; fuss?: React.ReactNode } = {},
) {
  const onBerechnen = vi.fn()
  render(
    <Eingabe
      laden={false}
      fehler={null}
      erkannt={erkannt}
      entwurf={entwurf}
      onBerechnen={onBerechnen}
      {...extra}
    />,
  )
  return onBerechnen
}

const feld = () => screen.getByLabelText('Umstiegsbahnhof') as HTMLInputElement

describe('Eingabe: Bahnhofssuche', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN, BERNAU] })
  })

  it('schlaegt Bahnhoefe erst ab zwei Zeichen vor', async () => {
    zeige()
    await userEvent.type(feld(), 'B')
    // Ein einzelnes Zeichen loest keine Suche aus - sonst fragte jede
    // Tastenanschlagsfolge die API.
    expect(sucheMock).not.toHaveBeenCalled()

    await userEvent.type(feld(), 'er')
    expect(await screen.findByRole('button', { name: 'Berlin Hbf' })).toBeDefined()
  })

  it('uebernimmt den angetippten Vorschlag und raeumt die Liste ab', async () => {
    zeige()
    await userEvent.type(feld(), 'Ber')
    await userEvent.click(await screen.findByRole('button', { name: 'Berlin Hbf' }))

    expect(feld().value).toBe('Berlin Hbf')
    expect(screen.queryByRole('button', { name: 'Bernau (b Berlin)' })).toBeNull()
  })

  it('blendet die Vorschlaege aus, wenn das Feld wieder zu kurz wird', async () => {
    zeige()
    await userEvent.type(feld(), 'Ber')
    await screen.findByRole('button', { name: 'Berlin Hbf' })

    await userEvent.clear(feld())
    expect(screen.queryByRole('button', { name: 'Berlin Hbf' })).toBeNull()
  })

  it('bietet bei fehlendem DB-Zugang die EVA zur Direkteingabe an', async () => {
    sucheMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await userEvent.type(feld(), 'Ber')
    expect(await screen.findByLabelText(/EVA/)).toBeDefined()
  })
})

describe('Eingabe: Vorbelegung aus dem Standort', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [] })
  })

  it('belegt ein leeres Feld mit dem einzigen erkannten Bahnhof vor', async () => {
    zeige([BERLIN])
    expect(await screen.findByDisplayValue('Berlin Hbf')).toBeDefined()
  })

  it('ueberschreibt eine bereits getippte Eingabe nicht', async () => {
    const { rerender } = render(
      <Eingabe laden={false} fehler={null} onBerechnen={vi.fn()} />,
    )
    await userEvent.type(feld(), 'Han')

    // Die Erkennung trifft verzoegert ein - nach der Tastatur, nicht davor.
    rerender(<Eingabe laden={false} fehler={null} erkannt={[BERLIN]} onBerechnen={vi.fn()} />)

    expect(feld().value).toBe('Han')
  })

  it('laesst bei mehreren Treffern den Nutzer waehlen', async () => {
    zeige([BERLIN, BERNAU])
    expect(await screen.findByText(/Bahnhöfe in deiner Nähe/)).toBeDefined()
    expect(feld().value).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Bernau (b Berlin)' }))
    expect(feld().value).toBe('Bernau (b Berlin)')
  })
})

/**
 * Wer vom Dashboard zurueck zur Eingabe geht - oder unterwegs die Seite neu
 * laedt -, fand bisher ein leeres Formular vor und musste Bahnhof, Gleise und
 * Zugauswahl erneut zusammensuchen. Am Bahnsteig, mit dem Anschluss im
 * Nacken, ist das die teuerste Stelle fuer verlorene Eingaben.
 */
const ENTWURF: EingabeEntwurf = {
  suchtext: 'Berlin Hbf',
  gewaehlt: BERLIN,
  evaManuell: '',
  gleisAn: '14',
  gleisAb: '6',
  wagenAn: '26',
  wagenAb: '7',
  profil: 'langsam',
  zugAnkunft: { zug: 'ICE 1006', zeitSoll: '14:26', gleisSoll: '14', ziel: 'Hamburg' },
  zugAbfahrt: null,
}

describe('Eingabe: gespeicherter Entwurf', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN, BERNAU] })
  })

  it('fuellt die Felder aus dem Entwurf', () => {
    zeige(undefined, ENTWURF)

    expect(feld().value).toBe('Berlin Hbf')
    expect((screen.getByLabelText('Ankunft: Gleis') as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText('Anschluss: Gleis') as HTMLInputElement).value).toBe('6')
    expect((screen.getByLabelText('Ankunft: Wagen (optional)') as HTMLInputElement).value).toBe('26')
    expect((screen.getByLabelText('Anschluss: Wagen (optional)') as HTMLInputElement).value).toBe(
      '7',
    )
  })

  it('uebernimmt den gewaehlten Bahnhof, nicht nur seinen Namen', () => {
    // Ohne das Objekt waere der Bahnhof nur Text im Feld: Die Maske haelt
    // sich fuer "noch nichts gewaehlt", startet eine Suche und laesst den
    // Rechnen-Knopf gesperrt, obwohl alles ausgefuellt aussieht.
    zeige(undefined, ENTWURF)
    expect(screen.getByText(/Berlin Hbf/, { selector: '.bahnhof-gewaehlt' })).toBeTruthy()
  })

  it('haelt das gewaehlte Gehtempo', () => {
    zeige(undefined, ENTWURF)
    // aria-pressed ist hier der Zustand, nicht eine Klasse - die Maske
    // drueckt die Auswahl fuer Screenreader aus, und danach richtet sich
    // auch die Darstellung.
    expect(
      screen.getByRole('button', { name: 'Langsam / Gepäck' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('startet leer, wenn kein Entwurf vorliegt', () => {
    zeige(undefined, null)
    expect(feld().value).toBe('')
    expect((screen.getByLabelText('Ankunft: Gleis') as HTMLInputElement).value).toBe('')
  })

  it('laesst die Standorterkennung den Entwurf NICHT ueberschreiben', async () => {
    // Die Erkennung trifft verzoegert ein. Sie darf einen wiederhergestellten
    // Bahnhof so wenig ueberschreiben wie eine frisch getippte Eingabe -
    // sonst springt das Feld um, waehrend der Nutzer schon liest.
    zeige([BERNAU], ENTWURF)
    expect(feld().value).toBe('Berlin Hbf')
  })
})

describe('Eingabe: Reise importieren', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN, BERNAU] })
  })

  const REISE = [
    'Mannheim Hbf → Berlin Hbf',
    '15.08.2026',
    '',
    'ICE 74',
    'Nach Hamburg Hbf',
    'Ab 11:03 Mannheim Hbf, Gleis 2',
    'An 11:40 Berlin Hbf, Gleis 8',
    '',
    'ICE 1134',
    'Nach Berlin Hbf',
    'Ab 12:02 Berlin Hbf, Gleis 7',
    'An 16:01 Eberswalde Hbf, Gleis 3',
  ].join('\n')

  it('bietet „Verbindung einfügen" am Bahnhofsfeld an', () => {
    zeige()
    expect(screen.getByRole('button', { name: 'Verbindung einfügen' })).toBeTruthy()
  })

  it('oeffnet ein Fenster, keine Seite', async () => {
    zeige()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung einfügen' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  /**
   * Der eigentliche Zweck: Bahnhof und BEIDE Gleise stehen danach im
   * Formular, ohne dass jemand sie getippt hat.
   */
  it('uebernimmt Bahnhof und beide Gleise und schliesst das Fenster', async () => {
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung einfügen' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)

    // Nichts wird ungefragt uebernommen - erst die Bestaetigung im Fenster.
    expect(feld().value).toBe('')
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(feld().value).toBe('Berlin Hbf')
    expect((screen.getByLabelText('Ankunft: Gleis') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('Anschluss: Gleis') as HTMLInputElement).value).toBe('7')
  })

  /**
   * Wagennummern stehen in keinem geteilten Reisetext - weder der DB-Export
   * noch die Rechnung fuehren sie. Eine vorher getippte gehoert damit zur
   * ERSETZTEN Reise: Bliebe sie stehen, haftete sie an einem fremden Zug.
   * Dieselbe Fehlerklasse, fuer die dort schon `zeitIst`/`gleisIst` bewusst
   * leer bleiben.
   */
  it('leert vorher getippte Wagennummern, statt sie an den neuen Zug zu heften', async () => {
    zeige(undefined, ENTWURF) // ENTWURF traegt Wagen 26 / 7
    expect((screen.getByLabelText('Ankunft: Wagen (optional)') as HTMLInputElement).value).toBe('26')

    await userEvent.click(screen.getByRole('button', { name: 'Verbindung einfügen' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect((screen.getByLabelText('Ankunft: Wagen (optional)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Anschluss: Wagen (optional)') as HTMLInputElement).value).toBe('')
  })

  /**
   * Der Name allein reicht nicht: Berlin Hbf fuehrt drei EVA-Nummern, und
   * 8011160 hat ueberhaupt keinen Fahrplan (gemessen 03.09.2026). Welche
   * Verkehrsstelle gemeint ist, entscheidet die Bahnhofssuche - deshalb steht
   * der Bahnhof danach als Suchtext da und nicht als getroffene Wahl.
   */
  it('laesst die Verkehrsstelle weiterhin von der Bahnhofssuche bestimmen', async () => {
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung einfügen' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(await screen.findByRole('button', { name: 'Berlin Hbf' })).toBeTruthy()
  })

  /**
   * Wie bei der normalen Auswahl aus der Live-Tafel: Nicht nur Bahnhof und
   * Gleise, sondern auch die beiden Zuege. Sie sind es, an denen die
   * Live-Ueberwachung spaeter filtert - ohne sie kaeme jede Meldung des
   * ganzen Bahnhofs an.
   *
   * Sichtbar werden sie erst, wenn ein Bahnhof gewaehlt ist: Die Zugauswahl
   * haengt an der EVA.
   */
  it('belegt auch Ankunfts- und Anschlusszug', async () => {
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung einfügen' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Berlin Hbf' }))

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/ICE 74/)
    expect(text).toMatch(/ICE 1134/)
    // Und mit Ziel und Zeit, nicht nur der Zugname.
    expect(text).toMatch(/Hamburg Hbf/)
    expect(text).toMatch(/11:40/)
  })
})

describe('Eingabe: Einstellungen', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.darstellung
  })

  it('heisst „Einstellungen" und traegt Gehtempo und Darstellung', () => {
    zeige()
    expect(screen.getByText('Einstellungen')).toBeDefined()
    expect(screen.queryByText('Mehr einstellen')).toBeNull()
    expect(screen.getByRole('group', { name: 'Gehtempo' })).toBeDefined()
    const darstellung = screen.getByRole('group', { name: 'Darstellung' })
    expect(within(darstellung).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'System',
      'Hell',
      'Dunkel',
    ])
  })

  it('folgt ohne Wahl dem System', () => {
    zeige()
    const darstellung = screen.getByRole('group', { name: 'Darstellung' })
    expect(within(darstellung).getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('schaltet beim Antippen sofort um und merkt sich die Wahl', async () => {
    zeige()
    const darstellung = screen.getByRole('group', { name: 'Darstellung' })
    await userEvent.click(within(darstellung).getByRole('button', { name: 'Dunkel' }))

    expect(document.documentElement.dataset.darstellung).toBe('dunkel')
    expect(within(darstellung).getByRole('button', { name: 'Dunkel' }).getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('umstieg.darstellung')).toBe('dunkel')

    await userEvent.click(within(darstellung).getByRole('button', { name: 'System' }))
    expect(document.documentElement.dataset.darstellung).toBeUndefined()
    expect(localStorage.getItem('umstieg.darstellung')).toBeNull()
  })

  it('zeigt eine frueher getroffene Wahl', () => {
    localStorage.setItem('umstieg.darstellung', 'hell')
    zeige()
    const darstellung = screen.getByRole('group', { name: 'Darstellung' })
    expect(within(darstellung).getByRole('button', { name: 'Hell' }).getAttribute('aria-pressed')).toBe('true')
  })
})

/** Spec 2026-10-11, Abschnitt 4: die neue Handy-Eingabe. */
describe('Eingabe: der neue Aufbau', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN] })
  })

  const kachel = (feldname: string) =>
    (screen.getByLabelText(feldname) as HTMLElement).closest('.gleiskachel') as HTMLElement

  it('fragt „Wo steigst du um?"', () => {
    zeige()
    expect(screen.getByRole('heading', { level: 2, name: 'Wo steigst du um?' })).toBeDefined()
  })

  it('traegt die Gleise in zwei Kacheln mit den Woertern der Uebersicht', () => {
    zeige()
    expect(within(kachel('Ankunft: Gleis')).getByText('Du kommst an')).toBeDefined()
    expect(within(kachel('Anschluss: Gleis')).getByText('Dein Anschluss')).toBeDefined()
    expect(kachel('Anschluss: Gleis').classList.contains('ziel')).toBe(true)
  })

  it('schaltet die Gleisnummer ab vier Zeichen auf die kleinere Stufe', async () => {
    zeige()
    const an = screen.getByLabelText('Ankunft: Gleis')
    await userEvent.type(an, '14')
    expect(an.classList.contains('lang')).toBe(false)
    await userEvent.clear(an)
    await userEvent.type(an, '7A-D')
    expect(an.classList.contains('lang')).toBe(true)
  })

  it('nennt den gewaehlten Zug in der Kachel', () => {
    zeige(undefined, {
      suchtext: 'Berlin Hbf',
      gewaehlt: BERLIN,
      evaManuell: '',
      gleisAn: '6',
      gleisAb: '14',
      wagenAn: '',
      wagenAb: '',
      profil: 'normal',
      zugAnkunft: { zug: 'RE 3', zeitSoll: '14:22', gleisSoll: '6', ziel: 'Stralsund' },
      zugAbfahrt: null,
    })
    expect(within(kachel('Ankunft: Gleis')).getByText(/RE 3 · an 14:22/)).toBeDefined()
  })

  it('klappt Zuege und Wagennummer auf dem Handy ein', () => {
    zeige()
    const aufklapper = screen.getByLabelText('Ankunft: Wagen (optional)').closest('details')
    expect(aufklapper).not.toBeNull()
    expect(aufklapper!.open).toBe(false)
    expect(within(aufklapper!).getByText(/Züge und Wagennummer/)).toBeDefined()
  })

  it('stellt den Hauptknopf fest unter den Rollbereich, ohne Pfeil', () => {
    zeige(undefined, null, { kopf: <p>KOPF</p>, fuss: <p>FUSS</p> })
    const knopf = screen.getByRole('button', { name: /Umstieg starten/ })
    expect(knopf.closest('.eingabe-rollbereich')).toBeNull()
    expect(knopf.querySelector('svg')).toBeNull()
    const bereich = document.querySelector('.eingabe-rollbereich') as HTMLElement
    expect(within(bereich).getByText('KOPF')).toBeDefined()
    expect(within(bereich).getByText('FUSS')).toBeDefined()
  })
})

/** Uhrzeit in `minuten` Minuten, als "HH:MM" - die Tafel kennt kein Datum. */
function inMinuten(minuten: number): string {
  const d = new Date(Date.now() + minuten * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Spec 2026-10-11, Abschnitt 5: iPad und Desktop. */
describe('Eingabe: breites Layout', () => {
  const RE3: TafelEintrag = { zug: 'RE 3', zeitSoll: inMinuten(12), gleisSoll: '6', ziel: 'Stralsund' }

  beforeEach(() => {
    stelleBreite(true)
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN] })
    holeTafelMock.mockReset()
    holeTafelMock.mockImplementation(async (_eva, typ) => ({
      ok: true,
      eintraege: typ === 'arr' ? [RE3] : [],
    }))
  })
  afterEach(raeumeBreiteAuf)

  async function waehleBerlin() {
    await userEvent.type(feld(), 'Ber')
    await userEvent.click(await screen.findByRole('button', { name: 'Berlin Hbf' }))
  }

  it('zeigt ohne Bahnhof zwei Platzhalter und laedt nichts', () => {
    zeige()
    expect(screen.getAllByText(/Wähle einen Bahnhof/)).toHaveLength(2)
    expect(holeTafelMock).not.toHaveBeenCalled()
  })

  it('oeffnet beide Tafeln, sobald ein Bahnhof gewaehlt ist', async () => {
    zeige()
    await waehleBerlin()
    expect(await screen.findByRole('heading', { name: 'Ankunft · Berlin Hbf' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Abfahrt · Berlin Hbf' })).toBeDefined()
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'arr')
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
  })

  it('traegt einen angetippten Zug in die Kachel ein', async () => {
    zeige()
    await waehleBerlin()
    await userEvent.click(await screen.findByRole('button', { name: /RE 3/ }))
    expect((screen.getByLabelText('Ankunft: Gleis') as HTMLInputElement).value).toBe('6')
  })

  it('stellt die Wagenfelder offen hin, ohne Aufklapper', () => {
    zeige()
    expect(screen.getByLabelText('Ankunft: Wagen (optional)').closest('details')).toBeNull()
  })

  it('sagt ohne DB-Zugang, warum keine Tafel kommt', async () => {
    sucheMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await userEvent.type(feld(), 'Ber')
    expect(await screen.findAllByText(/Ohne DB-Zugang keine Live-Tafel/)).toHaveLength(2)
    expect(holeTafelMock).not.toHaveBeenCalled()
  })

  /** Spec 2026-10-11, Abschnitt 6: Die Tafeln klappen nach rechts auf. */
  const spalte = (name: string) => screen.getByRole('region', { name }) as HTMLElement
  const formular = () => document.querySelector('form.eingabe-flaeche') as HTMLElement

  it('klappt die Tafeln mit Bewegung auf, wenn der Nutzer waehlt', async () => {
    zeige()
    await waehleBerlin()
    expect(spalte('Ankunft').dataset.offen).toBe('ja')
    expect(spalte('Abfahrt').dataset.offen).toBe('ja')
    expect(formular().classList.contains('mit-bewegung')).toBe(true)
  })

  it('zeigt die Tafeln ohne Bewegung, wenn die Erkennung den Bahnhof setzt', () => {
    // DESIGN.md 6: Bewegung, die von selbst Aufmerksamkeit fordert, ist verboten.
    zeige([BERLIN])
    expect(spalte('Ankunft').dataset.offen).toBe('ja')
    expect(formular().classList.contains('mit-bewegung')).toBe(false)
  })

  it('klappt beim Aufheben der Wahl zu und sperrt die Tafel', async () => {
    zeige()
    await waehleBerlin()
    await userEvent.type(feld(), 'x')
    expect(spalte('Ankunft').dataset.offen).toBe('nein')
    const inhalt = spalte('Ankunft').querySelector('.tafel-spalte-inhalt') as HTMLElement
    expect(inhalt.hasAttribute('inert')).toBe(true)
    expect(within(spalte('Ankunft')).getByText(/Wähle einen Bahnhof/)).toBeDefined()
  })
})
