import { describe, expect, it, vi, beforeEach } from 'vitest'
import { track } from '@vercel/analytics'
import { setzeVorfuehrung } from '../einfuehrung/zustand'
import { melde } from './ereignis'
import { bereitsErreicht, faelligeMesspunkte } from './messpunkte'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
const trackMock = vi.mocked(track)

// mockClear statt mockReset: Nach mockReset meldet Vitest 3 einen im Mock
// geworfenen Fehler auch dann, wenn der Aufrufer ihn faengt.
beforeEach(() => trackMock.mockClear())

/**
 * Die vier Messpunkte aus BRIEF.md 3 (Konzept Nutzergewinnung AP 4).
 * Datenschutz: Es geht NUR der Name des Ereignisses hinaus - kein Bahnhof,
 * kein Gleis, keine Zeit, kein Standort.
 */
describe('melde', () => {
  it('sendet nur den Ereignisnamen, ohne Eigenschaften', () => {
    melde('schritt-1')
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock.mock.calls[0]).toEqual(['schritt-1'])
  })

  // Die Messung darf die App nie stoeren.
  it('verschluckt einen Fehler der Messung', () => {
    trackMock.mockImplementationOnce(() => {
      throw new Error('kaputt')
    })
    let gefangen: unknown = null
    try {
      melde('ziel')
    } catch (e) {
      gefangen = e
    }
    expect(gefangen).toBeNull()
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  // Einführungstour: Jede Tour liefe sonst als Reise durch die Zahlen des
  // Konzepts Nutzergewinnung.
  it('sendet nichts, solange die Einführung vorgeführt wird', () => {
    setzeVorfuehrung(true)
    try {
      melde('eingabe-fertig')
    } finally {
      setzeVorfuehrung(false)
    }
    expect(trackMock).not.toHaveBeenCalled()
    melde('eingabe-fertig')
    expect(trackMock).toHaveBeenCalledTimes(1)
  })
})

describe('faelligeMesspunkte', () => {
  it('Uebersicht: Eingabe abgeschlossen', () => {
    expect(faelligeMesspunkte('dashboard', 0)).toEqual(['eingabe-fertig'])
  })

  it('Weg: Navigation gestartet, ab Schritt 1 auch dieser', () => {
    expect(faelligeMesspunkte('navigation', 0)).toEqual(['navigation-start'])
    expect(faelligeMesspunkte('navigation', 1)).toEqual(['navigation-start', 'schritt-1'])
    expect(faelligeMesspunkte('navigation', 3)).toEqual(['navigation-start', 'schritt-1'])
  })

  it('Angekommen: Ziel erreicht', () => {
    expect(faelligeMesspunkte('angekommen', 0)).toEqual(['ziel'])
  })

  it('Eingabe und Meldungen: nichts', () => {
    expect(faelligeMesspunkte('eingabe', 0)).toEqual([])
    expect(faelligeMesspunkte('meldungen', 0)).toEqual([])
  })
})

/**
 * Nach dem Neuladen mitten in einer Reise darf nichts doppelt gezaehlt
 * werden, was belegt schon geschehen ist.
 */
describe('bereitsErreicht', () => {
  it('ohne gesicherte Reise: nichts', () => {
    expect(bereitsErreicht(null, 'eingabe')).toEqual([])
  })

  it('mit Reise auf der Uebersicht: die Eingabe ist abgeschlossen', () => {
    expect(bereitsErreicht({ versatz: 0 }, 'dashboard')).toEqual(['eingabe-fertig'])
  })

  it('mit Reise auf dem Weg: auch die Navigation lief schon', () => {
    expect(bereitsErreicht({ versatz: 0 }, 'navigation')).toEqual(['eingabe-fertig', 'navigation-start'])
  })

  it('weitergetippt: auch Schritt 1 ist erreicht', () => {
    expect(bereitsErreicht({ versatz: 2 }, 'dashboard')).toEqual([
      'eingabe-fertig',
      'navigation-start',
      'schritt-1',
    ])
  })
})
