import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fahrtauswahl } from './Fahrtauswahl'
import { holeHaltestellenTafel } from '../api/haltestellen'
import type { HaltestellenTafelEintrag, Ort } from '../api/typen'

vi.mock('../api/haltestellen', () => ({ holeHaltestellenTafel: vi.fn() }))

const ORT: Ort = { name: 'Kassel Rathaus', haltestelleId: 'h', lat: 51.3, lon: 9.4, verkehrsmittel: ['tram'] }
const in10 = new Date(Date.now() + 10 * 60_000).toISOString()
const basis: HaltestellenTafelEintrag = { fahrtId: 'f1', linie: '6', verkehrsmittel: 'tram', ziel: 'Ihringshäuser Straße', zeitSoll: in10, steigSoll: 'A', steigLat: 1, steigLon: 2, steigGenau: true, echtzeit: true, ausfall: false }

describe('Fahrtauswahl', () => {
  it('kennzeichnet Fahrten ohne Echtzeit als „laut Fahrplan“ (K3) und Ausfaelle', async () => {
    vi.mocked(holeHaltestellenTafel).mockResolvedValue({ ok: true, stand: new Date().toISOString(), eintraege: [
      basis, { ...basis, fahrtId: 'f2', linie: '245', verkehrsmittel: 'bus', echtzeit: false }, { ...basis, fahrtId: 'f3', linie: '1', ausfall: true },
    ] })
    const onAuswahl = vi.fn()
    render(<Fahrtauswahl ort={ORT} typ="dep" label="Anschluss wählen" auswahl={null} onAuswahl={onAuswahl} />)
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    await userEvent.click(await screen.findByRole('heading', { name: 'Bus' }))
    await userEvent.click(screen.getByRole('heading', { name: 'Tram' }))
    const bus = await screen.findByRole('button', { name: /245/ })
    expect(within(bus).getByText('laut Fahrplan')).toBeDefined()
    expect((screen.getByRole('button', { name: /fällt aus/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(screen.getByRole('button', { name: /Tram 6/ })).queryByText('laut Fahrplan')).toBeNull()
    expect(within(screen.getByRole('button', { name: /Tram 6/ })).getByText('Steig A')).toBeDefined()
    await userEvent.click(bus)
    expect(onAuswahl).toHaveBeenCalledWith(expect.objectContaining({ fahrtId: 'f2' }))
  })

  it('meldet den Ausfall von MOTIS verstaendlich', async () => {
    vi.mocked(holeHaltestellenTafel).mockResolvedValue({ ok: false, fehler: 'nicht-verfuegbar' })
    render(<Fahrtauswahl ort={ORT} typ="dep" label="Anschluss wählen" auswahl={null} onAuswahl={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    expect(await screen.findByText('Haltestellendaten gerade nicht verfügbar.')).toBeDefined()
  })

  it('zeigt die gewaehlte Fahrt mit Linie, Steig und Kennzeichen', () => {
    render(<Fahrtauswahl ort={ORT} typ="arr" label="Ankunft wählen" auswahl={{ ...basis, echtzeit: false }} onAuswahl={vi.fn()} />)
    expect(screen.getByText(/aus Ihringshäuser Straße/)).toBeDefined()
    expect(screen.getByText('laut Fahrplan')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Ändern' })).toBeDefined()
  })

  it('offen: laedt sofort und markiert die gewaehlte Fahrt ueber die Fahrt-ID', async () => {
    vi.mocked(holeHaltestellenTafel).mockResolvedValue({ ok: true, stand: new Date().toISOString(), eintraege: [
      basis, { ...basis, fahrtId: 'f2' },
    ] })
    render(<Fahrtauswahl ort={ORT} typ="dep" label="Abfahrt · Kassel Rathaus" auswahl={{ ...basis, fahrtId: 'f2' }} onAuswahl={vi.fn()} immerOffen />)
    const zeilen = await screen.findAllByRole('button', { name: /Tram 6/ })
    expect(zeilen.map((z) => z.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })
})

describe('Fahrtauswahl: Kennzeichen sichtbar (Browserpruefung 18.10.2026)', () => {
  it('„laut Fahrplan“ steht neben dem gekuerzten Text, nicht darin - sonst wird es zu „la…“', async () => {
    vi.mocked(holeHaltestellenTafel).mockResolvedValue({ ok: true, stand: new Date().toISOString(), eintraege: [
      { ...basis, fahrtId: 'f2', linie: '245', verkehrsmittel: 'bus', ziel: 'S+U Zoologischer Garten', echtzeit: false },
    ] })
    render(<Fahrtauswahl ort={ORT} typ="dep" label="Anschluss wählen" auswahl={null} onAuswahl={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Anschluss wählen' }))
    const kennzeichen = within(await screen.findByRole('button', { name: /245/ })).getByText('laut Fahrplan')
    expect(kennzeichen.closest('.tafel-zug')).toBeNull()
  })
})

describe('Fahrtauswahl: Verkehrsmittel zum Aufklappen (Julian, 19.10.2026)', () => {
  it('mehrere Verkehrsmittel: alle zu; aufgeklappt steht nur das eine offen', async () => {
    vi.mocked(holeHaltestellenTafel).mockResolvedValue({ ok: true, stand: new Date().toISOString(), eintraege: [
      basis, { ...basis, fahrtId: 'f2', linie: '245', verkehrsmittel: 'bus' }, { ...basis, fahrtId: 'f3', linie: '100', verkehrsmittel: 'bus' },
    ] })
    render(<Fahrtauswahl ort={ORT} typ="dep" label="Abfahrt · Kassel Rathaus" auswahl={null} onAuswahl={vi.fn()} immerOffen />)
    const bus = (await screen.findByRole('group', { name: 'Bus' })) as HTMLDetailsElement
    const tram = screen.getByRole('group', { name: 'Tram' }) as HTMLDetailsElement
    expect([tram.open, bus.open]).toEqual([false, false])
    expect(bus.querySelector('summary')!.textContent).toContain('2')

    await userEvent.click(screen.getByRole('heading', { name: 'Bus' }))
    expect(within(bus).getAllByRole('button', { name: /Bus/ })).toHaveLength(2)
    expect(tram.open).toBe(false)
  })
})
