import { afterEach, describe, expect, it } from 'vitest'
import { lies } from '../sitzung/eingabespeicher'
import { schreibeBeispielEntwurf } from './beispielreise'

afterEach(() => sessionStorage.clear())

/**
 * Die Tour tippt nicht (Plan 5.2): Sie legt die Beispielreise als Entwurf ab,
 * und die Eingabe liest ihn beim Neuaufbau wie nach einem Neuladen.
 */
describe('schreibeBeispielEntwurf', () => {
  it('legt Berlin Hbf mit ICE 945 auf Gleis 14 und ICE 1007 auf Gleis 6 ab', () => {
    schreibeBeispielEntwurf(new Date(2026, 9, 22, 14, 58))
    const entwurf = lies()
    expect(entwurf).toMatchObject({
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
