import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Eingabe } from './Eingabe'

/**
 * „Etwas melden" (Spec 2026-11-10): Textknopf direkt unter „Einstellungen",
 * linksbuendig. Vorerst nur auf der Website - in der App blieben sonst die
 * Datenschutzangaben in App Store Connect unwahr (Julian).
 */
const umgebung = vi.hoisted(() => ({ app: false }))
vi.mock('../plattform/istApp', () => ({ istApp: () => umgebung.app }))
vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
vi.mock('../api/orte', () => ({ sucheOrte: vi.fn() }))
vi.mock('../api/haltestellen', () => ({ holeHaltestellenTafel: vi.fn() }))
vi.mock('../api/meldung', () => ({ sendeMeldung: vi.fn() }))

afterEach(() => {
  umgebung.app = false
})

const zeige = () => render(<Eingabe laden={false} fehler={null} onBerechnen={vi.fn()} />)

describe('Eingabe: „Etwas melden"', () => {
  it('zeigt „Etwas melden" direkt nach den Einstellungen', () => {
    zeige()
    const einstellungen = screen.getByText('Einstellungen').closest('details')!
    const knopf = screen.getByRole('button', { name: 'Etwas melden' })
    expect(einstellungen.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(einstellungen.contains(knopf)).toBe(false)
    expect(knopf.className).toBe('textknopf')
    expect(knopf.parentElement?.className).toBe('etwas-melden-einstieg')
    expect(einstellungen.nextElementSibling).toBe(knopf.parentElement)
  })

  it('oeffnet den Meldedialog', async () => {
    zeige()
    await userEvent.click(screen.getByRole('button', { name: 'Etwas melden' }))
    screen.getByRole('dialog', { name: 'Etwas melden' })
  })

  // Abschluss-Review 11.11.2026: nach dem Schliessen zurueck, wo man war.
  it('gibt den Fokus beim Schliessen an „Etwas melden" zurueck', async () => {
    zeige()
    const knopf = screen.getByRole('button', { name: 'Etwas melden' })
    await userEvent.click(knopf)
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(knopf)
  })

  it('zeigt den Knopf in der App nicht', () => {
    umgebung.app = true
    zeige()
    expect(screen.queryByRole('button', { name: 'Etwas melden' })).toBeNull()
  })
})
