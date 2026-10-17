import { describe, it, expect } from 'vitest'
import { steigText } from './steig'
import type { HaltestellenTafelEintrag } from '../api/typen'

const e = (extra: Partial<HaltestellenTafelEintrag>) => ({ verkehrsmittel: 'tram', ...extra }) as HaltestellenTafelEintrag

describe('steigText', () => {
  it.each([
    [e({ steigSoll: 'A' }), 'Steig A'],
    [e({ steigSoll: '3' }), 'Steig 3'],
    [e({ steigSoll: 'Pos. 11', verkehrsmittel: 'bus' }), 'Pos. 11'],
    [e({ steigSoll: '7', verkehrsmittel: 'bahn' }), 'Gl. 7'],
    [e({ steigSoll: '2', verkehrsmittel: 'sbahn' }), 'Gl. 2'],
    [e({ steigSoll: 'A', steigIst: 'B' }), 'Steig B'],
    [e({}), 'Steig ?'],
  ])('%o -> %s', (eintrag, text) => expect(steigText(eintrag)).toBe(text))
})
