import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Fusszeile, QUELLCODE_URL } from './Fusszeile'

describe('Fusszeile', () => {
  it('verlinkt den Quellcode (§ 13 AGPL)', () => {
    render(<Fusszeile />)
    const link = screen.getByRole('link', { name: 'Quellcode' })
    expect(link.getAttribute('href')).toBe(QUELLCODE_URL)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
