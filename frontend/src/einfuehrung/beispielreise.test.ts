import { describe, expect, it } from 'vitest'
import { beispielEntwurf } from './beispielreise'

/**
 * Die Tour tippt nicht (Plan 5.2): Sie gibt der Eingabe die Beispielreise als
 * Entwurf vor, und die Eingabe beginnt beim Neuaufbau mit ihm.
 */
describe('beispielEntwurf', () => {
  it('ist Berlin Hbf mit ICE 945 auf Gleis 14 und ICE 1007 auf Gleis 6', () => {
    expect(beispielEntwurf(new Date(2026, 9, 22, 14, 58))).toMatchObject({
      suchtext: 'Berlin Hbf',
      gewaehlt: { name: 'Berlin Hbf', eva: '8011160' },
      gleisAn: '14',
      gleisAb: '6',
      wagenAn: '',
      wagenAb: '',
      profil: 'normal',
      zugAnkunft: { zug: 'ICE 945', zeitSoll: '15:00', gleisSoll: '14' },
      zugAbfahrt: { zug: 'ICE 1007', zeitSoll: '15:11', gleisSoll: '6' },
      anschlussOrt: null,
      fahrtAnkunft: null,
      fahrtAbfahrt: null,
    })
  })
})
