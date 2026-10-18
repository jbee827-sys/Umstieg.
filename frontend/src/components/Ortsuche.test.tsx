import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ortsuche } from './Ortsuche'
import { sucheOrte } from '../api/orte'
import type { Ort } from '../api/typen'

vi.mock('../api/orte', () => ({ sucheOrte: vi.fn() }))
const suche = vi.mocked(sucheOrte)
afterEach(() => suche.mockReset())

const HBF: Ort = { name: 'Berlin Hbf', eva: '8011160', haltestelleId: 'h', lat: 52.5, lon: 13.3, verkehrsmittel: ['bahn', 'sbahn', 'bus'] }
const ZOB: Ort = { name: 'Berlin ZOB', haltestelleId: 'z', lat: 52.5, lon: 13.2, verkehrsmittel: ['bus'] }

function Huelle({ onWahl, onQuellen }: { onWahl: (o: Ort | null) => void; onQuellen?: (q: unknown) => void }) {
  const [t, setT] = useState('')
  const [g, setG] = useState<Ort | null>(null)
  return (
    <Ortsuche
      id="anschlussort"
      label="Anschluss: Bahnhof oder Haltestelle"
      platzhalter=""
      text={t}
      gewaehlt={g}
      onText={(x) => {
        setT(x)
        setG(null)
      }}
      onWahl={(o) => {
        setG(o)
        if (o) setT(o.name)
        onWahl(o)
      }}
      onQuellen={onQuellen}
    />
  )
}

describe('Ortsuche', () => {
  it('zeigt Haltestellen mit Verkehrsmittel und meldet die Wahl', async () => {
    suche.mockResolvedValue({ ok: true, antwort: { orte: [HBF, ZOB], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } })
    const onWahl = vi.fn()
    render(<Huelle onWahl={onWahl} />)
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Berlin')
    const zob = await screen.findByRole('button', { name: /Berlin ZOB/ }, { timeout: 3000 })
    expect(zob.textContent).toContain('Bus')
    expect(screen.getByRole('img', { name: 'Bahn, S-Bahn, Bus' })).toBeDefined()
    await userEvent.click(zob)
    expect(onWahl).toHaveBeenCalledWith(expect.objectContaining({ haltestelleId: 'z' }))
    expect(screen.getByText(/✓ Berlin ZOB/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Berlin Hbf/ })).toBeNull()
  })

  it('sucht erst ab zwei Zeichen und meldet den Stand der Quellen', async () => {
    const quellen = { bahnhoefe: 'ok' as const, haltestellen: 'ausfall' as const }
    suche.mockResolvedValue({ ok: true, antwort: { orte: [HBF], quellen } })
    const onQuellen = vi.fn()
    render(<Huelle onWahl={vi.fn()} onQuellen={onQuellen} />)
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'B')
    expect(suche).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'e')
    await screen.findByRole('button', { name: /Berlin Hbf/ })
    expect(onQuellen).toHaveBeenLastCalledWith(quellen)
  })

  it('meldet einen Netzfehler weiter', async () => {
    suche.mockResolvedValue({ ok: false, fehler: 'netz' })
    const onQuellen = vi.fn()
    render(<Huelle onWahl={vi.fn()} onQuellen={onQuellen} />)
    await userEvent.type(screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle'), 'Ber')
    await vi.waitFor(() => expect(onQuellen).toHaveBeenCalledWith('netz'))
  })
})

describe('Ortsuche: spaete Antworten (Review Paket 3)', () => {
  it('eine langsame Antwort fuer einen aelteren Suchtext ueberschreibt die neuere nicht', async () => {
    const KASSEL: Ort = { name: 'Kassel Rathaus', haltestelleId: 'k', lat: 51.3, lon: 9.5, verkehrsmittel: ['tram'] }
    const ALT: Ort = { name: 'Kastanienallee', haltestelleId: 'a', lat: 52.5, lon: 13.4, verkehrsmittel: ['tram'] }
    let gibAlt: (v: Awaited<ReturnType<typeof sucheOrte>>) => void = () => {}
    suche.mockImplementation((q: string) =>
      q === 'Kas'
        ? new Promise((r) => {
            gibAlt = r
          })
        : Promise.resolve({ ok: true, antwort: { orte: [KASSEL], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } }),
    )
    const onQuellen = vi.fn()
    render(<Huelle onWahl={vi.fn()} onQuellen={onQuellen} />)
    const eingabe = screen.getByLabelText('Anschluss: Bahnhof oder Haltestelle')
    await userEvent.type(eingabe, 'Kas')
    await waitFor(() => expect(suche).toHaveBeenCalledWith('Kas'), { timeout: 3000 })
    await userEvent.type(eingabe, 'sel Rathaus')
    await screen.findByRole('button', { name: /Kassel Rathaus/ }, { timeout: 3000 })
    onQuellen.mockClear()
    await act(async () => gibAlt({ ok: true, antwort: { orte: [ALT], quellen: { bahnhoefe: 'ok', haltestellen: 'ausfall' } } }))
    expect(screen.getByRole('button', { name: /Kassel Rathaus/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Kastanienallee/ })).toBeNull()
    expect(onQuellen).not.toHaveBeenCalled()
  })
})
