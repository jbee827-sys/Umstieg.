import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navileiste } from './Navileiste'

describe('Navileiste', () => {
  it('sperrt Eintraege ohne Route', async () => {
    const onWechsel = vi.fn()
    render(
      <Navileiste
        aktuell="eingabe"
        hatRoute={false}
        ungelesen={0}
        hervorgehoben={false}
        onWechsel={onWechsel}
      />,
    )
    const dash = screen.getByRole('button', { name: /Übersicht/ })
    expect(dash.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(dash)
    expect(onWechsel).not.toHaveBeenCalled()
  })

  it('meldet den Wechsel bei freigegebenem Eintrag', async () => {
    const onWechsel = vi.fn()
    render(
      <Navileiste aktuell="eingabe" hatRoute ungelesen={0} hervorgehoben={false} onWechsel={onWechsel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Übersicht/ }))
    expect(onWechsel).toHaveBeenCalledWith('dashboard')
  })

  it('traegt die Zahl der ungelesenen Meldungen als Abzeichen', () => {
    render(<Navileiste aktuell="dashboard" hatRoute ungelesen={2} hervorgehoben onWechsel={() => {}} />)
    const abzeichen = screen.getByLabelText(/2 ungelesene Meldungen/)
    expect(abzeichen.textContent).toBe('2')
  })

  // Ein Punkt, der dauerhaft steht, verliert seine Warnwirkung - nach der
  // zweiten Meldung schaut niemand mehr hin. Deshalb faellt das Abzeichen
  // beim Lesen weg; dass es Meldungen gab, bleibt an der Hervorhebung
  // sichtbar.
  it('nimmt das Abzeichen weg, sobald alles gelesen ist - die Hervorhebung bleibt', () => {
    render(<Navileiste aktuell="dashboard" hatRoute ungelesen={0} hervorgehoben onWechsel={() => {}} />)
    expect(screen.queryByLabelText(/ungelesene Meldung/)).toBeNull()
    const knopf = screen.getByRole('button', { name: /Meldungen/ })
    expect(knopf.className).toContain('hervorgehoben')
  })

  it('laesst Meldungen unauffaellig, solange es keine gab', () => {
    render(
      <Navileiste aktuell="dashboard" hatRoute ungelesen={0} hervorgehoben={false} onWechsel={() => {}} />,
    )
    const knopf = screen.getByRole('button', { name: /Meldungen/ })
    expect(knopf.className).not.toContain('hervorgehoben')
    expect(screen.queryByLabelText(/ungelesene Meldung/)).toBeNull()
  })

  it('nennt eine einzelne Meldung in der Einzahl', () => {
    render(<Navileiste aktuell="dashboard" hatRoute ungelesen={1} hervorgehoben onWechsel={() => {}} />)
    expect(screen.getByLabelText('1 ungelesene Meldung')).toBeDefined()
  })
})
