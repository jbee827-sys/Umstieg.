import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LiveBanner } from './LiveBanner'

afterEach(cleanup)

describe('LiveBanner', () => {
  it('nennt die Linie, nicht die Zugnummer', () => {
    render(
      <LiveBanner
        ereignis={{ typ: 'gleiswechsel', zug: 'S 15632', anzeige: 'S 15', alt: '22', neu: '21', zeitstempel: '2026-11-22T20:00:00Z' }}
        onSchliessen={vi.fn()}
      />,
    )
    expect(screen.getByText(/Gleiswechsel · S 15$/)).toBeDefined()
    expect(screen.queryByText(/15632/)).toBeNull()
  })

  it('bleibt ohne Linie bei der Zugnummer', () => {
    render(
      <LiveBanner
        ereignis={{ typ: 'verspaetung', zug: 'ICE 1006', alt: '14:26', neu: '14:35', zeitstempel: '2026-11-22T20:00:00Z' }}
        onSchliessen={vi.fn()}
      />,
    )
    expect(screen.getByText(/Neue Zeit · ICE 1006/)).toBeDefined()
  })
})
