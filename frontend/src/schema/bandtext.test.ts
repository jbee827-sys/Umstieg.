import { describe, expect, it } from 'vitest'
import type { SchemaEbene } from '../api/typen'
import type { Band } from './bandmodell'
import { fusstext } from './bandtext'

function bandMitZugaengen(): Band {
  const ebene: SchemaEbene = {
    level: 0,
    art: 'gleise',
    rolle: 'start',
    richtungLokalGrad: 0,
    bahnsteige: [
      {
        bahnsteigId: 'a',
        gleise: ['1'],
        laengeM: 300,
        querM: 0,
        rolle: 'start',
        von: { x: 0, y: 0 },
        bis: { x: 300, y: 0 },
        zugaenge: [
          { beiM: 40, pos: { x: 40, y: 3 }, aufzug: 1, rolltreppe: 0, treppe: 1, aufRoute: false },
          { beiM: 195, pos: { x: 195, y: 3 }, aufzug: 3, rolltreppe: 0, treppe: 3, aufRoute: true },
        ],
      },
    ],
    weg: [{ x: 0, y: 0 }, { x: 195, y: 3 }],
    elemente: [],
  }
  return {
    nr: 0,
    level: 0,
    label: 'EBENE 0',
    art: 'gleise',
    rolle: 'start',
    erster: true,
    letzter: false,
    aktiv: true,
    besucht: false,
    rechts: '300 m Bahnsteig',
    wechselNachher: { vonLevel: 0, nachLevel: -1, typ: 'treppe' },
    ebene,
  }
}

describe('fusstext', () => {
  it('nennt nur die genutzte Anlage, nicht die Zahl der Anlagen am Zugang', () => {
    expect(fusstext(bandMitZugaengen())).toBe('Treppe hinunter bei 195 m')
  })
})
