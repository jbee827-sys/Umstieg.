import { describe, expect, it } from 'vitest'
import type { HaltestellenTafelEintrag, Ort, TafelEintrag } from '../api/typen'
import { anderHalt, ersatzFahrt, nahverkehrAmBahnhof, ordneZugZu, ortAusHalt } from './bahnhofsumfeld'

const GOETTINGEN: Ort = {
  name: 'Göttingen',
  eva: '8000128',
  lat: 51.5364,
  lon: 9.9268,
  verkehrsmittel: ['bahn'],
  haltestelleId: 'de-DELFI_de:03152:33817',
}

const basis: HaltestellenTafelEintrag = {
  fahrtId: 'f1',
  linie: 'RE2',
  verkehrsmittel: 'bahn',
  ziel: 'Kassel',
  zeitSoll: '2026-10-21T12:32:00Z', // 14:32 in Berlin
  steigSoll: '4',
  steigLat: 51.5365,
  steigLon: 9.9265,
  steigLevel: 0,
  steigGenau: true,
  echtzeit: true,
  ausfall: false,
  haltId: 'de-DELFI_de:03152:33817:1:4',
  haltName: 'Göttingen',
}
const bus: HaltestellenTafelEintrag = {
  ...basis,
  fahrtId: 'b1',
  linie: '11',
  verkehrsmittel: 'bus',
  steigSoll: 'C',
  steigLat: 51.5375,
  steigLon: 9.9281,
  haltId: 'de-DELFI_de:03152:30001::C',
  haltName: 'Göttingen Bahnhof/ZOB',
}
const zug = (z: Partial<TafelEintrag> = {}): TafelEintrag => ({
  zug: 'RE 2',
  zeitSoll: '14:32',
  gleisSoll: '4',
  ziel: 'Kassel',
  ...z,
})

describe('nahverkehrAmBahnhof', () => {
  it('nur U-Bahn, Tram, Bus, Faehre - Zuege stehen schon in der DB-Tafel', () => {
    const tram = { ...bus, fahrtId: 't', verkehrsmittel: 'tram' as const }
    const sbahn = { ...basis, fahrtId: 's', verkehrsmittel: 'sbahn' as const }
    const ubahn = { ...bus, fahrtId: 'u', verkehrsmittel: 'ubahn' as const }
    expect(nahverkehrAmBahnhof([basis, sbahn, bus, tram, ubahn], false).map((e) => e.fahrtId)).toEqual(['b1', 't', 'u'])
  })

  it('U-Bahn nicht doppelt, wenn die DB-Tafel sie schon fuehrt', () => {
    const ubahn = { ...bus, fahrtId: 'u', verkehrsmittel: 'ubahn' as const }
    expect(nahverkehrAmBahnhof([bus, ubahn], true).map((e) => e.fahrtId)).toEqual(['b1'])
  })
})

describe('ordneZugZu', () => {
  it('gleiche Minute und gleiches Gleis', () => {
    const anderesGleis = { ...basis, fahrtId: 'f2', linie: 'ICE 1', steigSoll: '7' }
    expect(ordneZugZu(zug(), [anderesGleis, bus, basis])?.fahrtId).toBe('f1')
  })

  it('Gleis unbekannt: gleiche Linie, Leerzeichen egal („RE 2“ = „RE2“)', () => {
    const ohneGleis = { ...basis, steigSoll: undefined }
    const andereLinie = { ...basis, fahrtId: 'f2', linie: 'RB 85', steigSoll: undefined }
    expect(ordneZugZu(zug(), [andereLinie, ohneGleis])?.fahrtId).toBe('f1')
  })

  it('andere Minute: kein Treffer', () => {
    expect(ordneZugZu(zug({ zeitSoll: '14:33' }), [basis])).toBeNull()
  })

  it('ein Bus zur selben Minute am selben Steig ist kein Zug', () => {
    expect(ordneZugZu(zug({ gleisSoll: 'C', zug: '11' }), [bus])).toBeNull()
  })

  it('zwei Kandidaten ohne Gleis und Linie: lieber keiner als der falsche', () => {
    const a = { ...basis, fahrtId: 'a', linie: 'X', steigSoll: undefined }
    const b = { ...basis, fahrtId: 'b', linie: 'Y', steigSoll: undefined }
    expect(ordneZugZu(zug(), [a, b])).toBeNull()
  })
})

describe('ersatzFahrt', () => {
  it('Bahnhofskoordinate, ungenauer Steig, keine Echtzeit, heutiges Datum', () => {
    const jetzt = new Date(2026, 9, 21, 14, 0)
    const e = ersatzFahrt(zug(), GOETTINGEN, jetzt)
    expect(e).toMatchObject({
      linie: 'RE 2',
      verkehrsmittel: 'bahn',
      steigSoll: '4',
      steigLat: GOETTINGEN.lat,
      steigLon: GOETTINGEN.lon,
      steigGenau: false,
      echtzeit: false,
      ausfall: false,
    })
    const zeit = new Date(e.zeitSoll)
    expect([zeit.getDate(), zeit.getHours(), zeit.getMinutes()]).toEqual([21, 14, 32])
  })

  it('kurz nach Mitternacht zaehlt eine fruehe Zeit als morgen', () => {
    const e = ersatzFahrt(zug({ zeitSoll: '00:10' }), GOETTINGEN, new Date(2026, 9, 21, 23, 50))
    expect(new Date(e.zeitSoll).getDate()).toBe(22)
  })
})

describe('ortAusHalt', () => {
  it('der Halt der Fahrt - an ihm haengt die Live-Ueberwachung', () => {
    expect(ortAusHalt(bus, GOETTINGEN)).toEqual({
      name: 'Göttingen Bahnhof/ZOB',
      lat: bus.steigLat,
      lon: bus.steigLon,
      verkehrsmittel: ['bus'],
      haltestelleId: bus.haltId,
    })
  })

  it('ohne Halt-Angabe bleibt der Bahnhof', () => {
    const ohne = { ...bus, haltId: undefined, haltName: undefined }
    expect(ortAusHalt(ohne, GOETTINGEN)).toBe(GOETTINGEN)
  })
})

describe('anderHalt', () => {
  it('nennt den Halt nur, wenn er anders heisst als der Bahnhof', () => {
    expect(anderHalt(bus, 'Göttingen')).toBe('Göttingen Bahnhof/ZOB')
    expect(anderHalt(basis, 'Göttingen')).toBeUndefined()
    expect(anderHalt({ ...bus, haltName: undefined }, 'Göttingen')).toBeUndefined()
  })
})
