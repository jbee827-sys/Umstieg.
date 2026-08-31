import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stoerung } from './Stoerung'
import type { EingabeWerte } from '../components/Eingabe'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'

const alteWerte: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '6', gleisAb: '14',
  wagen: '', profil: 'normal', variante: 'schnellste', abfahrtZeit: '14:36',
}
const alteRoute: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }
const anlass: LiveEreignis = {
  typ: 'gleiswechsel', zug: 'ICE 1006', alt: '14', neu: '12',
  zeitstempel: '2026-08-31T12:32:10.000Z',
}
const vorschlag = {
  route: { stufe: 1, schritte: [], gehzeitSek: 480, hinweise: [] } as RouteErgebnis,
  werte: { ...alteWerte, gleisAb: '12', abfahrtZeit: '14:32' },
  anlass,
}

function zeige(onUebernehmen = vi.fn(), onBehalten = vi.fn(), restSek = 240) {
  render(
    <Stoerung
      vorschlag={vorschlag}
      alteRoute={alteRoute}
      alteWerte={alteWerte}
      restSek={restSek}
      onUebernehmen={onUebernehmen}
      onBehalten={onBehalten}
    />,
  )
  return { onUebernehmen, onBehalten }
}

describe('Stoerung', () => {
  it('stellt altes und neues Gleis gegenueber', () => {
    zeige()
    expect(screen.getByText(/Gl\. 14/)).toBeDefined()
    expect(screen.getByText(/Gl\. 12/)).toBeDefined()
  })

  it('nennt die neue Gehzeit', () => {
    zeige()
    expect(screen.getByText(/8 Minuten/)).toBeDefined()
  })

  it('sagt die Ampelaussage im Klartext', () => {
    // 240 s Rest gegen 480 s Gehzeit -> weniger als die Gehzeit -> Rot.
    zeige()
    expect(screen.getByText(/Rot/)).toBeDefined()
  })

  it('uebernimmt NUR auf Knopfdruck', async () => {
    const { onUebernehmen } = zeige()
    expect(onUebernehmen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Route übernehmen/ }))
    expect(onUebernehmen).toHaveBeenCalled()
  })

  it('verwirft den Vorschlag mit Behalten', async () => {
    const onBehalten = vi.fn()
    zeige(vi.fn(), onBehalten)
    await userEvent.click(screen.getByRole('button', { name: /Alte Route behalten/ }))
    expect(onBehalten).toHaveBeenCalled()
  })

  it('nennt die neue Abfahrt und um wie viel sie sich verschiebt', () => {
    zeige()
    expect(screen.getByText(/14:32/)).toBeDefined()
    expect(screen.getByText(/4 min früher/)).toBeDefined()
  })
})
