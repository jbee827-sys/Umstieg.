import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Eingabe } from './Eingabe'

/**
 * Testmitteilung (Plan Mitteilungen, Task 8): VORUEBERGEHEND fuer TestFlight,
 * vor der Einreichung samt Test entfernen - wie die Teilen-Diagnose.
 */
const umgebung = vi.hoisted(() => ({ app: false, test: vi.fn() }))
vi.mock('../plattform/istApp', () => ({ istApp: () => umgebung.app }))
vi.mock('../plattform/push', () => ({ testmitteilung: umgebung.test }))
vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
vi.mock('../api/orte', () => ({ sucheOrte: vi.fn() }))
vi.mock('../api/haltestellen', () => ({ holeHaltestellenTafel: vi.fn() }))

afterEach(() => {
  umgebung.app = false
  vi.clearAllMocks()
})

const zeige = () => render(<Eingabe laden={false} fehler={null} onBerechnen={vi.fn()} />)

describe('Eingabe: Testmitteilung', () => {
  it('gibt es im Browser nicht', () => {
    zeige()
    expect(screen.queryByRole('button', { name: 'Testmitteilung senden' })).toBeNull()
  })

  it('schickt in der App eine Testmitteilung und sagt, ob sie raus ist', async () => {
    umgebung.app = true
    umgebung.test.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    zeige()
    const knopf = screen.getByRole('button', { name: 'Testmitteilung senden' })
    await userEvent.click(knopf)
    expect(umgebung.test).toHaveBeenCalledTimes(1)
    await screen.findByText('Verschickt. Bei offener App zeigt iOS kein Banner – zum Prüfen tippen und gleich das Handy sperren.')
    await userEvent.click(knopf)
    await screen.findByText('Nicht verschickt – Mitteilungen erlaubt? Netz da?')
  })
})
