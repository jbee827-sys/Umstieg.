import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Eingabe } from './Eingabe'
import { sucheStationen } from '../api/client'
import type { BahnhofTreffer } from '../api/typen'
import type { EingabeEntwurf } from '../sitzung/eingabespeicher'

vi.mock('../api/client', () => ({ sucheStationen: vi.fn() }))
const sucheMock = vi.mocked(sucheStationen)

const BERLIN: BahnhofTreffer = { name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369 }
const BERNAU: BahnhofTreffer = { name: 'Bernau (b Berlin)', eva: '8010036', lat: 52.68, lon: 13.59 }

function zeige(erkannt?: BahnhofTreffer[], entwurf?: EingabeEntwurf | null) {
  const onBerechnen = vi.fn()
  render(
    <Eingabe
      laden={false}
      fehler={null}
      erkannt={erkannt}
      entwurf={entwurf}
      onBerechnen={onBerechnen}
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
  wagen: '26',
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
    expect((screen.getByLabelText('Wagennummer (optional)') as HTMLInputElement).value).toBe('26')
  })

  it('uebernimmt den gewaehlten Bahnhof, nicht nur seinen Namen', () => {
    // Ohne das Objekt waere der Bahnhof nur Text im Feld: Die Maske haelt
    // sich fuer "noch nichts gewaehlt", startet eine Suche und laesst den
    // Rechnen-Knopf gesperrt, obwohl alles ausgefuellt aussieht.
    zeige(undefined, ENTWURF)
    expect(screen.getByText(/Berlin Hbf/, { selector: '.gewaehlt' })).toBeTruthy()
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
