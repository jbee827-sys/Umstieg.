import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Eingabe } from './Eingabe'
import { holeTafel } from '../api/client'
import { sucheOrte } from '../api/orte'
import { holeHaltestellenTafel } from '../api/haltestellen'
import type { HaltestellenTafelEintrag, Ort, QuellenStand, TafelEintrag } from '../api/typen'
import type { EingabeEntwurf } from '../sitzung/eingabespeicher'
import { uhrzeit } from '../api/zeit'
import { raeumeBreiteAuf, stelleBreite } from '../aufbau/testbreite'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
vi.mock('../api/orte', () => ({ sucheOrte: vi.fn() }))
vi.mock('../api/haltestellen', () => ({ holeHaltestellenTafel: vi.fn() }))
const sucheMock = vi.mocked(sucheOrte)
const holeTafelMock = vi.mocked(holeTafel)

const BERLIN: Ort = { name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369, verkehrsmittel: ['bahn'] }
const BERNAU: Ort = { name: 'Bernau (b Berlin)', eva: '8010036', lat: 52.68, lon: 13.59, verkehrsmittel: ['bahn'] }

function orteAntwort(orte: Ort[], bahnhoefe: QuellenStand = 'ok') {
  return { ok: true as const, antwort: { orte, quellen: { bahnhoefe, haltestellen: 'ok' as QuellenStand } } }
}

function zeige(
  erkannt?: Ort[],
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

const feld = () => screen.getByLabelText('Ankunft: Bahnhof oder Haltestelle') as HTMLInputElement
/** Das zweite Ortsfeld steht seit dem 21.10.2026 hinter einem Knopf. */
const oeffneAndere = () => userEvent.click(screen.getByRole('button', { name: 'Andere Haltestelle' }))

describe('Eingabe: Bahnhofssuche', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue(orteAntwort([BERLIN, BERNAU]))
  })

  it('schlaegt Bahnhoefe erst ab zwei Zeichen vor', async () => {
    zeige()
    await userEvent.type(feld(), 'B')
    // Ein einzelnes Zeichen loest keine Suche aus - sonst fragte jede
    // Tastenanschlagsfolge die API.
    expect(sucheMock).not.toHaveBeenCalled()

    await userEvent.type(feld(), 'er')
    // 3 s wie in App.test: 300 ms Entprellung, und als erster Test der Datei
    // laeuft er waehrend des Aufwaermens.
    expect(await screen.findByRole('button', { name: /^Berlin Hbf/ }, { timeout: 3000 })).toBeDefined()
  })

  it('uebernimmt den angetippten Vorschlag und raeumt die Liste ab', async () => {
    zeige()
    await userEvent.type(feld(), 'Ber')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))

    expect(feld().value).toBe('Berlin Hbf')
    expect(screen.queryByRole('button', { name: /^Bernau \(b Berlin\)/ })).toBeNull()
  })

  it('blendet die Vorschlaege aus, wenn das Feld wieder zu kurz wird', async () => {
    zeige()
    await userEvent.type(feld(), 'Ber')
    await screen.findByRole('button', { name: /^Berlin Hbf/ })

    await userEvent.clear(feld())
    expect(screen.queryByRole('button', { name: /^Berlin Hbf/ })).toBeNull()
  })

  it('bietet bei fehlendem DB-Zugang die EVA zur Direkteingabe an', async () => {
    sucheMock.mockResolvedValue(orteAntwort([], 'zugang-fehlt'))
    zeige()
    await userEvent.type(feld(), 'Ber')
    expect(await screen.findByLabelText(/EVA/)).toBeDefined()
  })
})

describe('Eingabe: Vorbelegung aus dem Standort', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue(orteAntwort([]))
  })

  it('belegt ein leeres Feld mit dem einzigen erkannten Bahnhof vor', async () => {
    zeige([BERLIN])
    expect(await screen.findByDisplayValue('Berlin Hbf')).toBeDefined()
  })

  it('erkennt den einzigen Bahnhof auch zwischen Haltestellen (Gesamtreview Umstieg 2.0)', async () => {
    const halt = (n: string): Ort => ({ name: n, haltestelleId: n, lat: 52.52, lon: 13.37, verkehrsmittel: ['bus'] })
    zeige([BERLIN, halt('Washingtonplatz'), halt('Invalidenpark')])
    expect(await screen.findByDisplayValue('Berlin Hbf')).toBeDefined()
  })

  it('waehlt nichts unter mehreren Haltestellen ohne Bahnhof', () => {
    zeige([
      { name: 'Washingtonplatz', haltestelleId: 'w', lat: 52.52, lon: 13.37, verkehrsmittel: ['bus'] },
      { name: 'Invalidenpark', haltestelleId: 'i', lat: 52.53, lon: 13.37, verkehrsmittel: ['bus'] },
    ])
    expect(feld().value).toBe('')
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
    expect(await screen.findByText(/in deiner Nähe/)).toBeDefined()
    expect(feld().value).toBe('')

    await userEvent.click(screen.getByRole('button', { name: /^Bernau \(b Berlin\)/ }))
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
  anschlussText: '',
  anschlussOrt: null,
  evaManuell: '',
  gleisAn: '14',
  gleisAb: '6',
  wagenAn: '26',
  wagenAb: '7',
  profil: 'langsam',
  zugAnkunft: { zug: 'ICE 1006', zeitSoll: '14:26', gleisSoll: '14', ziel: 'Hamburg' },
  zugAbfahrt: null,
  fahrtAnkunft: null,
  fahrtAbfahrt: null,
}

describe('Eingabe: gespeicherter Entwurf', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue(orteAntwort([BERLIN, BERNAU]))
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
    sucheMock.mockResolvedValue(orteAntwort([BERLIN, BERNAU]))
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

  it('bietet „Reise importieren" als Knopf an', () => {
    zeige()
    expect(screen.getByRole('button', { name: 'Reise importieren' })).toBeTruthy()
  })

  it('oeffnet ein Fenster, keine Seite', async () => {
    zeige()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reise importieren' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  /**
   * Der eigentliche Zweck: Bahnhof und BEIDE Gleise stehen danach im
   * Formular, ohne dass jemand sie getippt hat.
   */
  it('uebernimmt Bahnhof und beide Gleise und schliesst das Fenster', async () => {
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Reise importieren' }))
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

    await userEvent.click(screen.getByRole('button', { name: 'Reise importieren' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Reise importieren' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(await screen.findByRole('button', { name: /^Berlin Hbf/ })).toBeTruthy()
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
    await userEvent.click(screen.getByRole('button', { name: 'Reise importieren' }))
    await userEvent.click(screen.getByRole('textbox', { name: /Text der Verbindung/i }))
    await userEvent.paste(REISE)
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Berlin Hbf/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))

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

/**
 * Rueckbau vom 12.10.2026: Auf dem Handy war die Zugauswahl seit dem 11.10.
 * im Aufklapper „Zuege und Wagennummer" verschwunden - beim Aufruf nicht zu
 * sehen. Das Handy hat wieder den Aufbau von davor: je ein Block Ankunft und
 * Abfahrt mit Zugauswahl, Gleis und Wagen. Titel und Gleiskacheln bleiben dem
 * breiten Layout.
 */
describe('Eingabe: Handy wie vor dem 11.10.2026', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue(orteAntwort([BERLIN]))
  })

  it('zeigt die Zugauswahl sofort, ohne Aufklapper', () => {
    zeige([BERLIN])
    expect(screen.getByRole('button', { name: 'Ankunftszug wählen' }).closest('details')).toBeNull()
    expect(screen.getByRole('button', { name: 'Anschlusszug wählen' }).closest('details')).toBeNull()
    expect(screen.queryByText(/Züge und Wagennummer/)).toBeNull()
  })

  it('fasst Zug, Gleis und Wagen je Reiseabschnitt zusammen', () => {
    zeige([BERLIN])
    const ankunft = screen.getByRole('group', { name: 'Ankunft' })
    expect(within(ankunft).getByRole('button', { name: 'Ankunftszug wählen' })).toBeDefined()
    expect(within(ankunft).getByLabelText('Ankunft: Gleis')).toBeDefined()
    expect(within(ankunft).getByLabelText('Ankunft: Wagen (optional)')).toBeDefined()
    const abfahrt = screen.getByRole('group', { name: 'Abfahrt' })
    expect(within(abfahrt).getByRole('button', { name: 'Anschlusszug wählen' })).toBeDefined()
    expect(within(abfahrt).getByLabelText('Anschluss: Gleis')).toBeDefined()
    expect(within(abfahrt).getByLabelText('Anschluss: Wagen (optional)')).toBeDefined()
  })

  it('traegt die Gleise in schlichte Felder statt in Kacheln, ohne Titel', () => {
    zeige()
    expect(screen.getByLabelText('Ankunft: Gleis').closest('.gleiskachel')).toBeNull()
    expect(screen.getByPlaceholderText('z. B. 6')).toBe(screen.getByLabelText('Ankunft: Gleis'))
    expect(screen.getByPlaceholderText('z. B. 14')).toBe(screen.getByLabelText('Anschluss: Gleis'))
    expect(screen.queryByRole('heading', { level: 2, name: 'Wo steigst du um?' })).toBeNull()
  })

  it('stellt den Hauptknopf fest unter den Rollbereich, ohne Pfeil', () => {
    zeige(undefined, null, { kopf: <p>KOPF</p>, fuss: <p>FUSS</p> })
    const knopf = screen.getByRole('button', { name: /Umstieg starten/ })
    expect(knopf.closest('.eingabe-rollbereich')).toBeNull()
    expect(knopf.classList.contains('knopf-schwebend')).toBe(true)
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
    sucheMock.mockResolvedValue(orteAntwort([BERLIN]))
    holeTafelMock.mockReset()
    holeTafelMock.mockImplementation(async (_eva, typ) => ({
      ok: true,
      eintraege: typ === 'arr' ? [RE3] : [],
    }))
  })
  afterEach(raeumeBreiteAuf)

  async function waehleBerlin() {
    await userEvent.type(feld(), 'Ber')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))
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

  /* Spec 2026-10-11, Abschnitt 4 - seit dem 12.10. nur noch im breiten Layout. */
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

  /**
   * Entscheidung vom 11.10.2026: Ein langes Teilgleis macht seine Kachel nicht
   * mehr kleiner als die andere - beide Felder tragen dieselben Klassen und
   * damit dieselbe Groesse.
   */
  it('gibt beiden Gleisnummern dieselbe Groesse, auch einem langen Teilgleis', async () => {
    zeige()
    const an = screen.getByLabelText('Ankunft: Gleis')
    const ab = screen.getByLabelText('Anschluss: Gleis')
    await userEvent.type(an, '2 A - D')
    await userEvent.type(ab, '1')
    expect(an.className).toBe(ab.className)
  })

  it('nennt den gewaehlten Zug in der Kachel', () => {
    zeige(undefined, {
      suchtext: 'Berlin Hbf',
      gewaehlt: BERLIN,
      anschlussText: '',
      anschlussOrt: null,
      evaManuell: '',
      gleisAn: '6',
      gleisAb: '14',
      wagenAn: '',
      wagenAb: '',
      profil: 'normal',
      zugAnkunft: { zug: 'RE 3', zeitSoll: '14:22', gleisSoll: '6', ziel: 'Stralsund' },
      zugAbfahrt: null,
      fahrtAnkunft: null,
      fahrtAbfahrt: null,
    })
    expect(within(kachel('Ankunft: Gleis')).getByText(/RE 3 · an 14:22/)).toBeDefined()
  })

  it('bietet „Verbindung einfügen" am Bahnhofsfeld an', () => {
    zeige()
    expect(screen.getByRole('button', { name: 'Verbindung einfügen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reise importieren' })).toBeNull()
  })

  it('sagt ohne DB-Zugang, warum keine Tafel kommt', async () => {
    sucheMock.mockResolvedValue(orteAntwort([], 'zugang-fehlt'))
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

describe('Eingabe: zwei Ortsfelder (Umstieg 2.0, E3)', () => {
  const LEIPZIG: Ort = { name: 'Leipzig Hbf', eva: '8010205', haltestelleId: 'h-l', lat: 51.345, lon: 12.382, verkehrsmittel: ['bahn', 'sbahn', 'tram'] }
  const WILLY: Ort = { name: 'Leipzig, Willy-Brandt-Platz', haltestelleId: 'h-w', lat: 51.343, lon: 12.381, verkehrsmittel: ['tram'] }

  beforeEach(() => {
    sucheMock.mockReset()
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [] })
  })

  it('das zweite Feld steht hinter „Andere Haltestelle“ und heisst auch so (Julian, 21.10.2026)', async () => {
    zeige()
    expect(screen.queryByLabelText('Anschluss: Bahnhof oder Haltestelle')).toBeNull()
    await oeffneAndere()
    const zweites = screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle') as HTMLInputElement
    expect(zweites.placeholder).toBe('z. B. Haltestelle in der Nähe')
    expect(screen.getByText('Andere Haltestelle', { selector: '.kicker' })).toBeDefined()
    // Wieder weg damit: dann gilt wieder der Ankunftsort.
    await userEvent.click(screen.getByRole('button', { name: 'Andere Haltestelle entfernen' }))
    expect(screen.queryByLabelText('Anschluss: Bahnhof oder Haltestelle')).toBeNull()
  })

  it('ein Entwurf mit anderer Haltestelle oeffnet das Feld gleich', () => {
    zeige(undefined, { ...ENTWURF, anschlussOrt: WILLY, anschlussText: WILLY.name })
    expect((screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle') as HTMLInputElement).value).toBe(WILLY.name)
  })

  it('ohne zweites Feld bleibt alles beim Bahnhof', async () => {
    sucheMock.mockResolvedValue(orteAntwort([LEIPZIG]))
    const onBerechnen = zeige()
    await userEvent.type(feld(), 'Leip')
    await userEvent.click(await screen.findByRole('button', { name: /^Leipzig Hbf/ }))
    await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '6')
    await userEvent.type(screen.getByLabelText('Anschluss: Gleis'), '16')
    await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
    const [werte, entwurf] = onBerechnen.mock.calls[0]
    expect(werte.eva).toBe('8010205')
    expect(werte.haltestellen).toBeUndefined()
    expect(entwurf.gewaehlt).toEqual(LEIPZIG)
    expect(entwurf.anschlussOrt).toBeNull()
  })

  it('Anschluss an einer anderen Haltestelle: kein Bahnhofsablauf mehr', async () => {
    sucheMock.mockImplementation(async (q: string) => orteAntwort(q.startsWith('Willy') ? [WILLY] : [LEIPZIG]))
    zeige()
    await userEvent.type(feld(), 'Leip')
    await userEvent.click(await screen.findByRole('button', { name: /^Leipzig Hbf/ }))
    expect(await screen.findByRole('button', { name: 'Ankunftszug wählen' })).toBeDefined()
    await oeffneAndere()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Willy')
    await userEvent.click(await screen.findByRole('button', { name: /^Leipzig, Willy-Brandt-Platz/ }))
    // Die Bahnhofstafeln gehoeren zum Bahnhofspfad - hier waeren sie falsch.
    expect(screen.queryByRole('button', { name: 'Ankunftszug wählen' })).toBeNull()
  })

  it('meldet einen Ausfall der Haltestellendaten, Bahnhoefe gehen weiter (K5)', async () => {
    sucheMock.mockResolvedValue({ ok: true, antwort: { orte: [LEIPZIG], quellen: { bahnhoefe: 'ok', haltestellen: 'ausfall' } } })
    zeige()
    await userEvent.type(feld(), 'Leip')
    expect(await screen.findByText('Haltestellendaten gerade nicht verfügbar – Bahnhöfe gehen weiter.')).toBeDefined()
  })
})

describe('Eingabe: Haltestellenpfad (Umstieg 2.0)', () => {
  const HBF: Ort = { name: 'Berlin Hbf', eva: '8011160', haltestelleId: 'h', lat: 52.525, lon: 13.369, verkehrsmittel: ['bahn', 'sbahn', 'bus'] }
  const ZOB: Ort = { name: 'Berlin ZOB', haltestelleId: 'z', lat: 52.507, lon: 13.28, verkehrsmittel: ['bus'] }
  const bald = new Date(Date.now() + 10 * 60_000).toISOString()
  const fahrt = (extra: Partial<HaltestellenTafelEintrag>): HaltestellenTafelEintrag => ({
    fahrtId: 'x', linie: 'x', verkehrsmittel: 'bus', ziel: 'Z', zeitSoll: bald, steigLat: 1, steigLon: 2, steigGenau: true, echtzeit: true, ausfall: false, ...extra,
  })
  const S5 = fahrt({ fahrtId: 'a1', linie: 'S5', verkehrsmittel: 'sbahn', ziel: 'Spandau', steigSoll: '15' })
  const BUS = fahrt({ fahrtId: 'b1', linie: 'Bus 245', ziel: 'Zoo', steigSoll: 'Pos. 11' })

  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockImplementation(async (q: string) => orteAntwort(q.includes('ZOB') ? [ZOB] : [HBF]))
    vi.mocked(holeHaltestellenTafel).mockReset()
    vi.mocked(holeHaltestellenTafel).mockImplementation(async (_o: Ort, typ: 'arr' | 'dep') => ({
      ok: true as const,
      stand: new Date().toISOString(),
      eintraege: typ === 'arr' ? [S5] : [BUS, fahrt({ fahrtId: 'b2', linie: 'Bus 100', ausfall: true })],
    }))
  })

  it('Berlin Hbf → Berlin ZOB: Fahrten statt Gleise, Absenden mit beiden Orten', async () => {
    const onBerechnen = zeige()
    await userEvent.type(feld(), 'Berlin H')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))
    await oeffneAndere()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Berlin ZOB')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin ZOB/ }))

    expect(screen.queryByLabelText('Ankunft: Gleis')).toBeNull()
    expect(screen.queryByLabelText('Ankunft: Wagen (optional)')).toBeNull()
    const knopf = screen.getByRole('button', { name: /Umstieg starten/ }) as HTMLButtonElement
    expect(knopf.disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Ankunft wählen' }))
    await userEvent.click(await screen.findByRole('button', { name: /S5/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    await userEvent.click(await screen.findByRole('button', { name: /Bus 245/ }))
    expect(screen.getByText('Pos. 11 · Bus 245')).toBeDefined()

    await userEvent.click(knopf)
    const [werte, entwurf] = onBerechnen.mock.calls[0]
    expect(werte.eva).toBe('')
    expect(werte.gleisAn).toBe('15')
    expect(werte.gleisAb).toBe('Pos. 11')
    expect(werte.bahnhofName).toBe('Berlin Hbf → Berlin ZOB')
    expect(werte.zugAnName).toBe('S5')
    expect(werte.haltestellen.ankunft.fahrt.fahrtId).toBe('a1')
    expect(werte.haltestellen.anschluss.ort.haltestelleId).toBe('z')
    expect(entwurf.fahrtAbfahrt.fahrtId).toBe('b1')
    // Die Ankunftstafel gehoert zum Ankunftsort, die Abfahrtstafel zum Anschlussort.
    expect(vi.mocked(holeHaltestellenTafel).mock.calls.map(([o, t]) => [o.haltestelleId, t])).toEqual([['h', 'arr'], ['z', 'dep']])
  })

  it('eine ausgefallene Fahrt laesst den Knopf gesperrt', () => {
    zeige(undefined, {
      ...ENTWURF,
      gewaehlt: HBF,
      anschlussOrt: ZOB,
      anschlussText: 'Berlin ZOB',
      fahrtAnkunft: S5,
      fahrtAbfahrt: { ...BUS, ausfall: true },
    })
    expect((screen.getByRole('button', { name: /Umstieg starten/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ein Wechsel des Anschlussorts hebt die gewaehlte Anschlussfahrt auf', async () => {
    zeige(undefined, { ...ENTWURF, gewaehlt: HBF, anschlussOrt: ZOB, anschlussText: 'Berlin ZOB', fahrtAnkunft: S5, fahrtAbfahrt: BUS })
    expect(screen.getByText('Pos. 11 · Bus 245')).toBeDefined()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'x')
    expect(screen.queryByText('Pos. 11 · Bus 245')).toBeNull()
  })

  it('Bahnhof ohne Haltestellen-ID: frischt auf, sonst Hinweis', async () => {
    sucheMock.mockImplementation(async (q: string) => orteAntwort(q.includes('ZOB') ? [ZOB] : [{ ...HBF, haltestelleId: undefined }]))
    zeige()
    await userEvent.type(feld(), 'Berlin H')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))
    await oeffneAndere()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Berlin ZOB')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin ZOB/ }))
    expect(await screen.findByText('Für diesen Bahnhof fehlen gerade Haltestellendaten.')).toBeDefined()
  })

  it('ein neuer Anschlussort holt seine eigene Abfahrtstafel (Review Paket 3)', async () => {
    vi.mocked(holeHaltestellenTafel).mockImplementation(async (o: Ort, typ: 'arr' | 'dep') => ({
      ok: true as const,
      stand: new Date().toISOString(),
      eintraege: typ === 'arr' ? [S5] : [o.haltestelleId === 'z' ? BUS : fahrt({ fahrtId: 'h1', linie: 'Bus 123', ziel: 'Mitte' })],
    }))
    zeige(undefined, { ...ENTWURF, gewaehlt: ZOB, suchtext: 'Berlin ZOB' })
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    expect(await screen.findByRole('button', { name: /Bus 245/ })).toBeDefined()
    await oeffneAndere()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Berlin H')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    expect(await screen.findByRole('button', { name: /Bus 123/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Bus 245/ })).toBeNull()
  })

  it('faellt das Nachschlagen aus, sagt die Eingabe das und versucht es auf Wunsch noch einmal (Review Paket 3)', async () => {
    let frisch = 0
    sucheMock.mockImplementation(async (q: string) => {
      if (q.includes('ZOB')) return orteAntwort([ZOB])
      if (q === 'Berlin Hbf') {
        frisch += 1
        if (frisch === 1) return { ok: false as const, fehler: 'netz' as const }
        return orteAntwort([HBF])
      }
      return orteAntwort([{ ...HBF, haltestelleId: undefined }])
    })
    zeige()
    await userEvent.type(feld(), 'Berlin H')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin Hbf/ }))
    await oeffneAndere()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Berlin ZOB')
    await userEvent.click(await screen.findByRole('button', { name: /^Berlin ZOB/ }))
    expect(await screen.findByText('Haltestellendaten gerade nicht erreichbar.')).toBeDefined()
    expect(screen.queryByText('Für diesen Bahnhof fehlen gerade Haltestellendaten.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('button', { name: 'Ankunft wählen' })).toBeDefined()
    expect(screen.queryByText('Haltestellendaten gerade nicht erreichbar.')).toBeNull()
  })
})

/*
 * Bus, Tram und U-Bahn am Bahnhof (Julian, 21.10.2026): Die Ortsuche zeigte am
 * Bahnhof Bus und Tram, waehlbar waren nur Zuege. Jetzt stehen sie in beiden
 * Tafeln; wer einen Bus waehlt, bekommt den Weg zu seinem Halt - auch zum ZOB
 * mit anderem Namen.
 */
describe('Eingabe: Bus am Bahnhof (21.10.2026)', () => {
  const GOE: Ort = { name: 'Göttingen', eva: '8000128', haltestelleId: 'h-goe', lat: 51.5364, lon: 9.9268, verkehrsmittel: ['bahn'] }
  const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
  const fahrt = (extra: Partial<HaltestellenTafelEintrag>): HaltestellenTafelEintrag => ({
    fahrtId: 'x', linie: 'x', verkehrsmittel: 'bus', ziel: 'Z', zeitSoll: inMin(20), steigLat: 51.537, steigLon: 9.928, steigGenau: true, echtzeit: true, ausfall: false, ...extra,
  })
  const RE_MOTIS = fahrt({ fahrtId: 'r1', linie: 'RE2', verkehrsmittel: 'bahn', ziel: 'Kassel', zeitSoll: inMin(10), steigSoll: '4', steigLevel: 0, haltId: 'h-goe-4', haltName: 'Göttingen' })
  const BUS = fahrt({ fahrtId: 'b1', linie: '11', ziel: 'Weende', steigSoll: 'C', haltId: 'h-zob-c', haltName: 'Göttingen Bahnhof/ZOB' })
  // Die DB-Tafel kennt die Zeit nur als „HH:MM“ in deutscher Ortszeit.
  const RE_DB: TafelEintrag = { zug: 'RE 2', zeitSoll: uhrzeit(RE_MOTIS.zeitSoll), gleisSoll: '4', ziel: 'Kassel' }
  const ICE_DB: TafelEintrag = { zug: 'ICE 5', zeitSoll: uhrzeit(inMin(30)), gleisSoll: '7', ziel: 'München' }
  const tafelMock = vi.mocked(holeHaltestellenTafel)

  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue(orteAntwort([GOE]))
    holeTafelMock.mockReset()
    // Je Tafel auch ein Zug - sonst waere der Bus die einzige Kategorie und schon offen.
    holeTafelMock.mockImplementation(async (_eva: string, typ: 'arr' | 'dep') => ({ ok: true, eintraege: typ === 'arr' ? [RE_DB] : [ICE_DB] }))
    tafelMock.mockReset()
    tafelMock.mockImplementation(async (_o: Ort, typ: 'arr' | 'dep') => ({
      ok: true as const,
      stand: inMin(0),
      eintraege: typ === 'arr' ? [RE_MOTIS] : [BUS],
    }))
  })

  async function waehleGoettingen() {
    await userEvent.type(feld(), 'Gött')
    await userEvent.click(await screen.findByRole('button', { name: /^Göttingen/ }))
  }

  it('Zug an, Bus ab: der Zug wird seiner Fahrt aus Transitous zugeordnet, der Bus haengt an seinem Halt', async () => {
    const onBerechnen = zeige()
    await waehleGoettingen()
    await userEvent.click(screen.getByRole('button', { name: 'Ankunftszug wählen' }))
    await userEvent.click(await screen.findByRole('button', { name: /RE 2/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Anschlusszug wählen' }))
    await userEvent.click(await screen.findByRole('heading', { name: 'Bus' }))
    await userEvent.click(screen.getByRole('button', { name: /ab Göttingen Bahnhof\/ZOB/ }))

    // Ein Bus hat kein Gleis und keinen Wagen - an ihrer Stelle steht sein Steig.
    expect(screen.queryByLabelText('Anschluss: Gleis')).toBeNull()
    expect(screen.queryByLabelText('Anschluss: Wagen (optional)')).toBeNull()
    expect(screen.getByLabelText('Ankunft: Gleis')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
    await vi.waitFor(() => expect(onBerechnen).toHaveBeenCalled())
    const [werte, entwurf] = onBerechnen.mock.calls[0]
    expect(werte.eva).toBe('')
    expect(werte.bahnhofName).toBe('Göttingen → Göttingen Bahnhof/ZOB')
    expect(werte.haltestellen.ankunft.fahrt.fahrtId).toBe('r1')
    expect(werte.haltestellen.ankunft.ort.haltestelleId).toBe('h-goe-4')
    expect(werte.haltestellen.anschluss.fahrt.fahrtId).toBe('b1')
    expect(werte.haltestellen.anschluss.ort).toMatchObject({ name: 'Göttingen Bahnhof/ZOB', haltestelleId: 'h-zob-c' })
    expect(werte.gleisAn).toBe('4')
    expect(werte.gleisAb).toBe('C')
    expect(entwurf.zugAnkunft).toEqual(RE_DB)
    expect(entwurf.fahrtAbfahrt.fahrtId).toBe('b1')
  })

  it('kennt Transitous den Zug nicht, beginnt der Weg am Bahnhof - mit Hinweis statt Abbruch', async () => {
    tafelMock.mockImplementation(async (_o: Ort, typ: 'arr' | 'dep') => ({
      ok: true as const, stand: inMin(0), eintraege: typ === 'arr' ? [] : [BUS],
    }))
    const onBerechnen = zeige()
    await waehleGoettingen()
    await userEvent.click(screen.getByRole('button', { name: 'Ankunftszug wählen' }))
    await userEvent.click(await screen.findByRole('button', { name: /RE 2/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Anschlusszug wählen' }))
    await userEvent.click(await screen.findByRole('heading', { name: 'Bus' }))
    await userEvent.click(screen.getByRole('button', { name: /11/ }))
    await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
    await vi.waitFor(() => expect(onBerechnen).toHaveBeenCalled())
    const ankunft = onBerechnen.mock.calls[0][0].haltestellen.ankunft
    expect(ankunft.ort).toEqual(GOE)
    expect(ankunft.fahrt).toMatchObject({ linie: 'RE 2', steigSoll: '4', steigLat: GOE.lat, steigGenau: false })
  })

  it('mit Bus auf einer Seite braucht die andere den Zug aus der Tafel, nicht nur ein Gleis', async () => {
    zeige()
    await waehleGoettingen()
    await userEvent.click(screen.getByRole('button', { name: 'Anschlusszug wählen' }))
    await userEvent.click(await screen.findByRole('heading', { name: 'Bus' }))
    await userEvent.click(screen.getByRole('button', { name: /11/ }))
    await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '4')
    expect((screen.getByRole('button', { name: /Umstieg starten/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Für den Weg zum Bus bitte den Zug aus der Tafel wählen.')).toBeDefined()
  })

  it('Zug zu Zug bleibt der Bahnhofsablauf wie bisher', async () => {
    const onBerechnen = zeige()
    await waehleGoettingen()
    await userEvent.type(screen.getByLabelText('Ankunft: Gleis'), '4')
    await userEvent.type(screen.getByLabelText('Anschluss: Gleis'), '7')
    await userEvent.click(screen.getByRole('button', { name: /Umstieg starten/ }))
    const [werte] = onBerechnen.mock.calls[0]
    expect(werte.eva).toBe('8000128')
    expect(werte.haltestellen).toBeUndefined()
  })

  it('breit: die Ankunftstafel zeigt den Bus vom ZOB ebenfalls', async () => {
    tafelMock.mockImplementation(async () => ({ ok: true as const, stand: inMin(0), eintraege: [BUS] }))
    stelleBreite(true)
    try {
      zeige(undefined, { ...ENTWURF, gewaehlt: GOE, suchtext: 'Göttingen', zugAnkunft: null })
      const ankunft = screen.getByRole('region', { name: 'Ankunft' })
      expect(await within(ankunft).findByRole('group', { name: 'Bus' })).toBeDefined()
    } finally {
      raeumeBreiteAuf()
    }
  })
})
