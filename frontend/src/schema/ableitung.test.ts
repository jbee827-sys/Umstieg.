import { describe, it, expect } from 'vitest'
import { leiteSchemaAb } from './ableitung'
import type { Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Start', typ: 'start', level: -2 },
  { text: 'Treppe hoch', typ: 'treppe', level: 0 },
  { text: 'Halle queren', typ: 'eben', level: 0 },
  { text: 'Rolltreppe hoch', typ: 'rolltreppe', level: 1 },
  { text: 'Ziel', typ: 'ziel', level: 1 },
]

describe('leiteSchemaAb', () => {
  it('bildet ein Band je Ebene, von oben nach unten', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.baender.map((b) => b.level)).toEqual([1, 0, -2])
  })

  it('haengt Ankunfts- und Zielgleis an ihre Ebenen', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.baender.find((b) => b.level === -2)?.gleise).toContain('6')
    expect(m.baender.find((b) => b.level === 1)?.gleise).toContain('14')
  })

  it('markiert das Band des aktiven Schritts', () => {
    const m = leiteSchemaAb(schritte, 2, '6', '14')
    expect(m.baender.find((b) => b.aktiv)?.level).toBe(0)
  })

  it('nennt die Ebenenwechsel mit ihrem Typ', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.wechsel).toEqual([
      { vonLevel: -2, nachLevel: 0, typ: 'treppe' },
      { vonLevel: 0, nachLevel: 1, typ: 'rolltreppe' },
    ])
  })

  it('beschriftet die Ebenen mit echtem Minuszeichen', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.baender.map((b) => b.label)).toEqual(['EBENE +1', 'EBENE 0', 'EBENE \u22122'])
  })

  it('kommt mit fehlenden Ebenenangaben zurecht', () => {
    // Stufe 3 und aeltere Antworten tragen kein level - dann ein Band.
    const ohne: Schritt[] = [
      { text: 'a', typ: 'start' },
      { text: 'b', typ: 'ziel' },
    ]
    const m = leiteSchemaAb(ohne, 0, '1', '2')
    expect(m.baender).toHaveLength(1)
    expect(m.baender[0].gleise).toEqual(['1', '2'])
    expect(m.wechsel).toEqual([])
  })

  it('zaehlt einen Ebenenwechsel ohne Hoehenaenderung nicht', () => {
    // Ein Aufzug, der auf derselben Ebene endet, ist kein Wechsel.
    const flach: Schritt[] = [
      { text: 'Start', typ: 'start', level: 0 },
      { text: 'Aufzug', typ: 'aufzug', level: 0 },
    ]
    expect(leiteSchemaAb(flach, 0, '1', '2').wechsel).toEqual([])
  })
})
