import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuelleWeg } from './QuelleWeg'

/**
 * Degradationstabelle Zeile 2: Faellt Timetables aus, verlangt das Konzept
 * ein Banner „Echtzeitdaten derzeit nicht verfuegbar". Bis zum 04.09.2026 gab
 * es keines - der Strom wurde stumm, und stumm ist vom Fall „es aendert sich
 * gerade nichts" nicht zu unterscheiden.
 */
describe('QuelleWeg', () => {
  it('sagt, dass die Echtzeitdaten fehlen', () => {
    render(<QuelleWeg seit="2026-09-04T12:32:10.000Z" />)
    expect(screen.getByRole('status').textContent).toMatch(/Echtzeitdaten derzeit nicht verfügbar/i)
  })

  it('traegt einen Zeitstempel, wie jede Live-Anzeige', () => {
    // Konzept Abschnitt 3: keine vorgetaeuschte Aktualitaet.
    render(<QuelleWeg seit="2026-09-04T12:32:10.000Z" />)
    expect(screen.getByRole('status').textContent).toMatch(/\d{2}:\d{2}/)
  })

  it('sagt, dass der Weg weiter berechnet wird', () => {
    // Der zweite Teil der Konzeptzeile: „Routing laeuft mit manuellen
    // Eingaben weiter." Ohne diesen Satz liest sich das Banner wie ein
    // Totalausfall, und der Nutzer bricht ab, obwohl der Weg noch steht.
    render(<QuelleWeg seit="2026-09-04T12:32:10.000Z" />)
    expect(screen.getByRole('status').textContent).toMatch(/Weg|Route/i)
  })

  it('hat keinen Wegklick-Knopf', () => {
    // Der Ausfall ist ein Zustand, kein Ereignis. Wegklicken hiesse, eine
    // Aussage zu verbergen, die noch gilt.
    render(<QuelleWeg seit="2026-09-04T12:32:10.000Z" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
