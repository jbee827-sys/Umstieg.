import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findeZug, gleicheZuegeAb, zugnummer } from './zugabgleich'
import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'

vi.mock('../api/client', () => ({ holeTafel: vi.fn() }))
const holeTafelMock = vi.mocked(holeTafel)

/**
 * Reise-Import: Zug aus dem Reisetext in der Tafel wiederfinden (22.11.2026).
 *
 * Der DB Navigator schreibt „S6“, „RE3 (3352)“ oder „ICE 1134“, die VBB-App
 * „RE3“. Die Tafel fuehrt denselben Zug als „S 6xxxx“ (Linie „S 6“),
 * „RE 3352“ (Linie „RE 3“) und „ICE 1134“. Live-Ueberwachung und die
 * Zuordnung „Ankunftszug oder Anschluss“ brauchen den Namen der Tafel - mit
 * dem Namen aus dem Text kam keine einzige Live-Meldung an.
 */

const RE3: TafelEintrag = { zug: 'RE 3352', anzeige: 'RE 3', zeitSoll: '16:23', gleisSoll: '6', ziel: 'Schwedt(Oder)' }
const S6: TafelEintrag = { zug: 'S 38617', anzeige: 'S 6', zeitSoll: '10:17', gleisSoll: '1', ziel: 'Worms Hbf' }
const ICE: TafelEintrag = { zug: 'ICE 1134', zeitSoll: '16:01', gleisSoll: '3', ziel: 'Berlin Hbf' }
const RE3_SPAETER: TafelEintrag = { ...RE3, zug: 'RE 3354', zeitSoll: '17:23' }

describe('zugnummer', () => {
  it('liest die Nummer aus Tafel und Reisetext', () => {
    expect(zugnummer('ICE 1006')).toBe('1006')
    expect(zugnummer('RE3 (3352)')).toBe('3352')
  })
})

describe('findeZug', () => {
  const tafel = [RE3, S6, ICE, RE3_SPAETER]

  it('findet die Linie aus dem Text: S6 -> S 6', () => {
    expect(findeZug('S6', '10:17', tafel)).toBe(S6)
  })

  it('findet die Zugnummer in Klammern: RE3 (3352) -> RE 3352', () => {
    expect(findeZug('RE3 (3352)', '16:23', tafel)).toBe(RE3)
  })

  it('findet den vollen Namen: ICE 1134', () => {
    expect(findeZug('ICE 1134', '16:01', tafel)).toBe(ICE)
  })

  it('unterscheidet gleiche Linien ueber die Sollzeit', () => {
    expect(findeZug('RE3', '17:23', tafel)).toBe(RE3_SPAETER)
  })

  it('nimmt auch eine Uhrzeit ohne fuehrende Null', () => {
    const frueh = { ...S6, zeitSoll: '09:46' }
    expect(findeZug('S6', '9:46', [frueh])).toBe(frueh)
  })

  it('waehlt keinen, wenn die Zeit nicht passt', () => {
    expect(findeZug('RE3', '16:24', tafel)).toBeNull()
  })

  it('waehlt keinen, wenn die Linie nicht passt', () => {
    expect(findeZug('RE4', '16:23', tafel)).toBeNull()
  })

  it('waehlt keinen, wenn zwei Zuege passen - ein falscher waere schlimmer als keiner', () => {
    const fluegel = { ...RE3, zug: 'RE 3362', gleisSoll: '7' }
    expect(findeZug('RE3', '16:23', [RE3, fluegel])).toBeNull()
  })
})

describe('gleicheZuegeAb', () => {
  beforeEach(() => holeTafelMock.mockReset())

  it('sucht den Ankunftszug in der Ankunfts-, den Anschluss in der Abfahrtstafel', async () => {
    const ankunft: TafelEintrag = { ...ICE, ziel: 'Frankfurt(Main)Hbf' }
    holeTafelMock.mockImplementation(async (_eva, typ) => ({ ok: true, eintraege: typ === 'arr' ? [ankunft] : [RE3] }))
    const ergebnis = await gleicheZuegeAb('8011160', { name: 'ICE 1134', zeit: '16:01' }, { name: 'RE3 (3352)', zeit: '16:23' })
    expect(ergebnis).toEqual({ an: ankunft, ab: RE3 })
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'arr')
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
  })

  it('fragt nur die Tafel, die gebraucht wird', async () => {
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [RE3] })
    await gleicheZuegeAb('8011160', undefined, { name: 'RE3', zeit: '16:23' })
    expect(holeTafelMock).toHaveBeenCalledTimes(1)
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
  })

  it('liefert bei einer ausgefallenen Tafel nichts statt zu werfen', async () => {
    holeTafelMock.mockResolvedValue({ ok: false, fehler: 'netz' })
    expect(await gleicheZuegeAb('8011160', { name: 'ICE 1134', zeit: '16:01' }, undefined)).toEqual({})
  })
})
