import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navileiste } from './Navileiste'

describe('Navileiste', () => {
  it('sperrt Eintraege ohne Route', async () => {
    const onWechsel = vi.fn()
    render(<Navileiste aktuell="eingabe" hatRoute={false} hinweis={false} onWechsel={onWechsel} />)
    const dash = screen.getByRole('button', { name: /Dashboard/ })
    expect(dash.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(dash)
    expect(onWechsel).not.toHaveBeenCalled()
  })

  it('meldet den Wechsel bei freigegebenem Eintrag', async () => {
    const onWechsel = vi.fn()
    render(<Navileiste aktuell="eingabe" hatRoute hinweis={false} onWechsel={onWechsel} />)
    await userEvent.click(screen.getByRole('button', { name: /Dashboard/ }))
    expect(onWechsel).toHaveBeenCalledWith('dashboard')
  })

  it('zeigt das Stoerungs-Kennzeichen am Dashboard', () => {
    render(<Navileiste aktuell="dashboard" hatRoute hinweis onWechsel={() => {}} />)
    expect(screen.getByLabelText(/Gleiswechsel liegt vor/)).toBeDefined()
  })
})
