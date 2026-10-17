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

describe('reisespeicher Fassung 2 (Umstieg 2.0)', () => {
  beforeEach(() => sessionStorage.clear())
  const FAHRT = { fahrtId: 'f1', linie: 'Tram 6', verkehrsmittel: 'tram' as const, ziel: 'Zoo', zeitSoll: '2026-10-17T10:00:00Z', steigSoll: 'A', steigLat: 51.31, steigLon: 9.49, steigGenau: true, echtzeit: true, ausfall: false }
  const ORT = { name: 'Kassel Rathaus', lat: 51.31, lon: 9.49, verkehrsmittel: ['tram' as const], haltestelleId: 'h-ks' }
  const HALTESTELLEN_REISE: Reise = {
    ...REISE,
    werte: { ...REISE.werte, eva: '', bahnhofName: 'Kassel Rathaus', gleisAn: 'A', gleisAb: 'B', haltestellen: { ankunft: { ort: ORT, fahrt: FAHRT }, anschluss: { ort: ORT, fahrt: { ...FAHRT, fahrtId: 'f2', steigSoll: 'B' } } } },
  }

  it('liest eine Reise der Fassung 1 - sie ist ein Bahnhofspfad', () => {
    sessionStorage.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: 1, gespeichertUm: Date.now(), reise: REISE }))
    expect(liesReise()).toEqual(REISE)
  })

  it('liest eine Haltestellenreise', () => {
    schreibeReise(HALTESTELLEN_REISE)
    expect(liesReise()).toEqual(HALTESTELLEN_REISE)
  })

  it('verwirft eine kaputte Haltestellenwahl', () => {
    const kaputt = { ...HALTESTELLEN_REISE, werte: { ...HALTESTELLEN_REISE.werte, haltestellen: 'kaputt' } }
    sessionStorage.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: 2, gespeichertUm: Date.now(), reise: kaputt }))
    expect(liesReise()).toBeNull()
    const ohneFahrt = { ...HALTESTELLEN_REISE, werte: { ...HALTESTELLEN_REISE.werte, haltestellen: { ankunft: { ort: ORT }, anschluss: { ort: ORT, fahrt: FAHRT } } } }
    sessionStorage.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: 2, gespeichertUm: Date.now(), reise: ohneFahrt }))
    expect(liesReise()).toBeNull()
  })
})
