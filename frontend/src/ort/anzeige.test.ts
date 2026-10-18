import { describe, it, expect } from 'vitest'
import { haltestellenHinweise, linienName, ortsangabe } from './anzeige'
import type { EingabeWerte, HaltestellenWahl } from '../components/Eingabe'
import type { HaltestellenTafelEintrag, Ort } from '../api/typen'

const ORT: Ort = { name: 'Washingtonplatz', haltestelleId: 'h', lat: 1, lon: 2, verkehrsmittel: ['bus'] }
const fahrt = (extra: Partial<HaltestellenTafelEintrag>): HaltestellenTafelEintrag => ({
  fahrtId: 'x', linie: '245', verkehrsmittel: 'bus', ziel: 'Zoo', zeitSoll: '2026-10-18T10:00:00Z',
  steigLat: 1, steigLon: 2, steigGenau: true, echtzeit: true, ausfall: false, ...extra,
})
const BAHNHOF: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '7', gleisAb: '14', wagenAn: '', wagenAb: '',
  profil: 'normal', variante: 'schnellste', abschnitt: 'mitte',
}
function mit(an: Partial<HaltestellenTafelEintrag>, ab: Partial<HaltestellenTafelEintrag>): EingabeWerte {
  const haltestellen: HaltestellenWahl = {
    ankunft: { ort: ORT, fahrt: fahrt(an) },
    anschluss: { ort: ORT, fahrt: fahrt(ab) },
  }
  return { ...BAHNHOF, eva: '', haltestellen }
}

describe('ortsangabe', () => {
  it('Bahnhofspfad: Gleis', () => {
    expect(ortsangabe(BAHNHOF, 'an')).toBe('Gleis 7')
    expect(ortsangabe(BAHNHOF, 'ab')).toBe('Gleis 14')
  })
  it('Haltestelle, Bus: Steig vor der Kennung', () => {
    expect(ortsangabe(mit({}, { steigSoll: 'Pos. 11' }), 'ab')).toBe('Steig Pos. 11')
    expect(ortsangabe(mit({}, { steigSoll: 'A' }), 'ab')).toBe('Steig A')
  })
  it('Haltestelle, Bahn und S-Bahn: Gleis', () => {
    expect(ortsangabe(mit({ verkehrsmittel: 'bahn', steigSoll: '7' }, {}), 'an')).toBe('Gleis 7')
    expect(ortsangabe(mit({ verkehrsmittel: 'sbahn', steigSoll: '15' }, {}), 'an')).toBe('Gleis 15')
  })
  it('der geänderte Steig gilt vor dem geplanten', () => {
    expect(ortsangabe(mit({}, { steigSoll: 'A', steigIst: 'B' }), 'ab')).toBe('Steig B')
  })
  it('ohne Steig: Haltestelle', () => {
    expect(ortsangabe(mit({}, {}), 'ab')).toBe('Haltestelle')
  })
})

describe('linienName', () => {
  it('eine nackte Liniennummer bekommt das Verkehrsmittel davor', () => {
    expect(linienName(fahrt({ linie: '245' }))).toBe('Bus 245')
    expect(linienName(fahrt({ linie: '6', verkehrsmittel: 'tram' }))).toBe('Tram 6')
  })
  it('was sich selbst benennt, bleibt', () => {
    expect(linienName(fahrt({ linie: 'ICE 1206', verkehrsmittel: 'bahn' }))).toBe('ICE 1206')
    expect(linienName(fahrt({ linie: 'S5', verkehrsmittel: 'sbahn' }))).toBe('S5')
    expect(linienName(fahrt({ linie: 'M10', verkehrsmittel: 'tram' }))).toBe('M10')
  })
})

describe('haltestellenHinweise', () => {
  it('nichts, wenn Steige genau und der Anschluss Echtzeit hat', () => {
    expect(haltestellenHinweise(mit({}, {}).haltestellen!)).toEqual([])
  })
  it('Steig unbekannt (Spec 5.6) – an welchem Ende auch immer', () => {
    expect(haltestellenHinweise(mit({ steigGenau: false }, {}).haltestellen!)).toEqual([
      'Steig unbekannt – der Weg führt zur Haltestelle.',
    ])
    expect(haltestellenHinweise(mit({}, { steigGenau: false }).haltestellen!)).toEqual([
      'Steig unbekannt – der Weg führt zur Haltestelle.',
    ])
  })
  it('Anschluss ohne Echtzeit: laut Fahrplan (F5); die Ankunft zählt dafür nicht', () => {
    expect(haltestellenHinweise(mit({}, { echtzeit: false }).haltestellen!)).toEqual([
      'Anschluss laut Fahrplan – keine Echtzeitdaten.',
    ])
    expect(haltestellenHinweise(mit({ echtzeit: false }, {}).haltestellen!)).toEqual([])
  })
})
