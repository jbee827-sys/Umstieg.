import { describe, expect, it } from 'vitest'
import type { RouteErgebnis } from '../api/typen'
import { baueBandmodell, besuchJeSchritt, massgeblicherBahnsteig } from './bandmodell'
import leipzigAnfang from './testdaten/leipzig-6-16-anfang.json'
import leipzigMitte from './testdaten/leipzig-6-16-mitte.json'
import leipzigEnde from './testdaten/leipzig-6-16-ende.json'
import berlin from './testdaten/berlin-14-6-mitte.json'

const ROUTEN = {
  leipzigAnfang: leipzigAnfang as unknown as RouteErgebnis,
  leipzigMitte: leipzigMitte as unknown as RouteErgebnis,
  leipzigEnde: leipzigEnde as unknown as RouteErgebnis,
  berlin: berlin as unknown as RouteErgebnis,
}

describe('Bandmodell: ein Band je Besuch, in der Reihenfolge des Wegs', () => {
  it('führt Leipzig ab der Mitte als EBENE +1, EBENE 0, EBENE +1', () => {
    const modell = baueBandmodell(ROUTEN.leipzigMitte.schema, ROUTEN.leipzigMitte.schritte, 0)!
    expect(modell.baender.map((b) => b.label)).toEqual(['EBENE +1', 'EBENE 0', 'EBENE +1'])
    expect(modell.baender.map((b) => b.rolle)).toEqual(['start', undefined, 'ziel'])
  })

  it('kennt je Band den Wechsel davor und danach', () => {
    const [a, b, c] = baueBandmodell(ROUTEN.leipzigMitte.schema, ROUTEN.leipzigMitte.schritte, 0)!.baender
    expect(a.wechselVorher).toBeUndefined()
    expect(a.wechselNachher).toEqual({ vonLevel: 1, nachLevel: 0, typ: 'treppe' })
    expect(b.wechselVorher).toEqual(a.wechselNachher)
    expect(b.wechselNachher).toEqual({ vonLevel: 0, nachLevel: 1, typ: 'treppe' })
    expect(c.wechselNachher).toBeUndefined()
  })

  it('führt einen Weg ohne Ebenenwechsel als ein Band', () => {
    const modell = baueBandmodell(ROUTEN.leipzigEnde.schema, ROUTEN.leipzigEnde.schritte, 0)!
    expect(modell.baender).toHaveLength(1)
    expect(modell.baender[0]).toMatchObject({ erster: true, letzter: true })
  })

  it('schaltet das aktive Band mit dem Schritt weiter – auch zurück auf dieselbe Ebene', () => {
    const route = ROUTEN.leipzigMitte
    const ersterUnten = route.schritte.findIndex((s) => s.level === 0)
    const letzter = route.schritte.length - 1
    const aktiv = (position: number) =>
      baueBandmodell(route.schema, route.schritte, position)!.baender.findIndex((b) => b.aktiv)
    expect(aktiv(0)).toBe(0)
    expect(aktiv(ersterUnten)).toBe(1)
    // Derselbe `level` wie Band 0 – ein `find` nach Ebene fände das falsche.
    expect(aktiv(letzter)).toBe(2)
  })
})

describe('Der maßgebliche Bahnsteig eines Besuchs', () => {
  it('ist beim zweiten Besuch derselben Ebene der Abfahrtsbahnsteig', () => {
    // Leipzig trägt 6/7 (Ankunft) UND 16/17 (Abfahrt) auf Ebene 1, und beide
    // Besuche führen beide. Die Fußzeile des letzten Besuchs nannte vorher
    // den Abgang von 6/7.
    const ebenen = ROUTEN.leipzigMitte.schema!.ebenen
    expect(massgeblicherBahnsteig(ebenen[0], true, false)?.gleise).toEqual(['6', '7'])
    expect(massgeblicherBahnsteig(ebenen[2], false, true)?.gleise).toEqual(['16', '17'])
  })
})

describe('Schritte und Besuche passen zueinander', () => {
  // Die Zusicherung, auf der das aktive Band steht: Jeder Lauf gleicher
  // Ebene in der Schrittliste ist genau ein Besuch in `schema.ebenen`.
  it.each(Object.entries(ROUTEN))('%s', (_name, route) => {
    const zuordnung = besuchJeSchritt(route.schritte)
    expect(Math.max(...zuordnung) + 1).toBe(route.schema!.ebenen.length)
  })
})
