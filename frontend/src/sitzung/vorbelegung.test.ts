import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lies as liesEntwurf, schreibe as schreibeEntwurf, type EingabeEntwurf } from './eingabespeicher'
import { uebernimmBahnhofAusAdresse } from './vorbelegung'

/**
 * Von einer Bahnhofsseite in die App (Konzept Nutzergewinnung 5c.1):
 * /eingabe?bahnhof=<eva>&name=…&lat=…&lon=… setzt den Bahnhof in die
 * Eingabe. Die Adresse verliert die Abfrage danach - sie soll weder im
 * Verlauf noch in einem geteilten Link stehen bleiben.
 */
const HANNOVER = '/eingabe?bahnhof=8000152&name=Hannover+Hbf&lat=52.376761&lon=9.741021'

beforeEach(() => window.sessionStorage.clear())
afterEach(() => window.history.replaceState(null, '', '/'))

describe('uebernimmBahnhofAusAdresse', () => {
  it('legt den Bahnhof als Entwurf ab', () => {
    window.history.replaceState(null, '', HANNOVER)
    uebernimmBahnhofAusAdresse()
    const entwurf = liesEntwurf()
    expect(entwurf?.gewaehlt).toEqual({
      name: 'Hannover Hbf',
      eva: '8000152',
      lat: 52.376761,
      lon: 9.741021,
      verkehrsmittel: ['bahn'],
    })
    expect(entwurf?.suchtext).toBe('Hannover Hbf')
    expect(entwurf?.gleisAn).toBe('')
  })

  it('nimmt die Abfrage aus der Adresse, ohne neuen Verlaufseintrag', () => {
    window.history.replaceState(null, '', HANNOVER)
    const laenge = window.history.length
    uebernimmBahnhofAusAdresse()
    expect(window.location.pathname).toBe('/eingabe')
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(laenge)
  })

  // Ein neuer Bahnhof heisst neue Gleise - die alten gehoeren zum alten.
  it('ersetzt einen alten Entwurf, behaelt aber das Gehtempo', () => {
    schreibeEntwurf({
      suchtext: 'Leipzig Hbf',
      gewaehlt: { name: 'Leipzig Hbf', eva: '8010205', lat: 51.345, lon: 12.381, verkehrsmittel: ['bahn'] },
      anschlussText: '',
      anschlussOrt: null,
      evaManuell: '',
      gleisAn: '6',
      gleisAb: '16',
      wagenAn: '',
      wagenAb: '',
      profil: 'langsam',
      zugAnkunft: null,
      zugAbfahrt: null,
      fahrtAnkunft: null,
      fahrtAbfahrt: null,
    } satisfies EingabeEntwurf)
    window.history.replaceState(null, '', HANNOVER)
    uebernimmBahnhofAusAdresse()
    const entwurf = liesEntwurf()
    expect(entwurf?.gewaehlt?.eva).toBe('8000152')
    expect(entwurf?.gleisAn).toBe('')
    expect(entwurf?.gleisAb).toBe('')
    expect(entwurf?.profil).toBe('langsam')
  })

  it('tut nichts ohne Bahnhof in der Adresse', () => {
    window.history.replaceState(null, '', '/eingabe')
    uebernimmBahnhofAusAdresse()
    expect(liesEntwurf()).toBeNull()
  })

  // Was in der Adresse steht, hat jeder in der Hand.
  it.each([
    ['/eingabe?bahnhof=abc&name=X&lat=1&lon=2', 'EVA ohne Ziffern'],
    ['/eingabe?bahnhof=8000152&lat=52&lon=9', 'ohne Namen'],
    ['/eingabe?bahnhof=8000152&name=X&lat=kaputt&lon=9', 'Lage unlesbar'],
    ['/eingabe?bahnhof=8000152&name=X&lat=95&lon=9', 'Breite ausserhalb'],
    ['/uebersicht?bahnhof=8000152&name=X&lat=52&lon=9', 'nicht auf /eingabe'],
  ])('verwirft %s (%s)', (adresse) => {
    window.history.replaceState(null, '', adresse)
    uebernimmBahnhofAusAdresse()
    expect(liesEntwurf()).toBeNull()
  })

  it('kuerzt einen ueberlangen Namen nicht still, sondern verwirft ihn', () => {
    window.history.replaceState(null, '', `/eingabe?bahnhof=8000152&name=${'x'.repeat(200)}&lat=52&lon=9`)
    uebernimmBahnhofAusAdresse()
    expect(liesEntwurf()).toBeNull()
  })
})
