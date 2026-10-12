import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REISE_HOECHSTALTER_MS,
  REISE_SCHLUESSEL,
  leereReise,
  liesReise,
  schreibeReise,
  type Reise,
} from './reisespeicher'

const REISE: Reise = {
  werte: {
    eva: '8010205',
    bahnhofName: 'Leipzig Hbf',
    gleisAn: '6',
    gleisAb: '16',
    wagenAn: '',
    wagenAb: '',
    profil: 'normal',
    variante: 'schnellste',
    abschnitt: 'mitte',
  },
  route: {
    stufe: 1,
    schritte: [{ text: 'Über den Bahnhofskopf', typ: 'eben' }],
    gehzeitSek: 354,
    hinweise: [],
  },
  variante: 'schnellste',
  standort: 'mitte',
  gehzeiten: { 'schnellste|mitte': 354 },
  meldungen: [],
  versatz: 0,
}

/** Spec 2026-10-11 Seitenuebergaenge, §4. */
describe('reisespeicher', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('liest zurueck, was geschrieben wurde', () => {
    schreibeReise(REISE, 1000)
    expect(liesReise(2000)).toEqual(REISE)
  })

  it('verwirft eine Reise, die aelter als sechs Stunden ist', () => {
    schreibeReise(REISE, 0)
    expect(liesReise(REISE_HOECHSTALTER_MS)).toEqual(REISE)
    expect(liesReise(REISE_HOECHSTALTER_MS + 1)).toBeNull()
  })

  it('verwirft Kaputtes und fremde Fassungen', () => {
    window.sessionStorage.setItem(REISE_SCHLUESSEL, '{kaputt')
    expect(liesReise()).toBeNull()
    window.sessionStorage.setItem(
      REISE_SCHLUESSEL,
      JSON.stringify({ fassung: 99, gespeichertUm: Date.now(), reise: REISE }),
    )
    expect(liesReise()).toBeNull()
    window.sessionStorage.setItem(
      REISE_SCHLUESSEL,
      JSON.stringify({ fassung: 1, gespeichertUm: Date.now(), reise: { werte: {} } }),
    )
    expect(liesReise()).toBeNull()
  })

  it('loescht auf Wunsch', () => {
    schreibeReise(REISE)
    leereReise()
    expect(liesReise()).toBeNull()
  })

  it('faellt nicht um, wenn es keinen Sitzungsspeicher gibt', () => {
    const spion = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(() => schreibeReise(REISE)).not.toThrow()
    expect(liesReise()).toBeNull()
    expect(() => leereReise()).not.toThrow()
    spion.mockRestore()
  })

  it('fasst localStorage nicht an', () => {
    window.localStorage.clear()
    schreibeReise(REISE)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.getItem(REISE_SCHLUESSEL)).not.toBeNull()
  })
})
