import { describe, it, expect, vi } from 'vitest'
import { frischeOrtAuf, gleicherBahnhof, ortAusBahnhof, pfadFuer } from './ortmodell'
import type { Ort } from '../api/typen'
const HBF: Ort = { name: 'Berlin Hbf', eva: '8011160', haltestelleId: 'h-hbf', lat: 52.5256, lon: 13.3695, verkehrsmittel: ['bahn'] }
const ZOB: Ort = { name: 'Berlin ZOB', haltestelleId: 'h-zob', lat: 52.5078, lon: 13.2798, verkehrsmittel: ['bus'] }
const RATHAUS: Ort = { name: 'Kassel Rathaus', haltestelleId: 'h-ks', lat: 51.31, lon: 9.49, verkehrsmittel: ['tram'] }
describe('pfadFuer (Weiche, Spec 4)', () => {
  it.each([
    [HBF, null, 'bahnhof'],
    [HBF, HBF, 'bahnhof'],
    [HBF, { ...HBF, haltestelleId: 'anders' }, 'bahnhof'],
    [HBF, ZOB, 'haltestelle'],
    [RATHAUS, null, 'haltestelle'],
    [ZOB, HBF, 'haltestelle'],
  ])('%o + %o -> %s', (a, b, pfad) => expect(pfadFuer(a as Ort, b as Ort | null)).toBe(pfad))
  it('ohne Ankunft keine Weiche', () => expect(pfadFuer(null, ZOB)).toBeNull())
})
describe('gleicherBahnhof', () => {
  it('nur mit zwei gleichen EVA', () => {
    expect(gleicherBahnhof(HBF, { ...HBF })).toBe(true)
    expect(gleicherBahnhof(RATHAUS, { ...RATHAUS })).toBe(false)
  })
})
describe('ortAusBahnhof', () => {
  it('Bahnhofstreffer wird Ort mit Bahn', () =>
    expect(ortAusBahnhof({ name: 'Leipzig Hbf', eva: '8010205', lat: 51.3, lon: 12.3 })).toEqual({ name: 'Leipzig Hbf', eva: '8010205', lat: 51.3, lon: 12.3, verkehrsmittel: ['bahn'] }))
})
describe('frischeOrtAuf (A5)', () => {
  it('uebernimmt die neue ID des gleichen Orts', async () => {
    const suche = vi.fn(async () => ({ ok: true as const, antwort: { orte: [{ ...RATHAUS, haltestelleId: 'h-ks-2027' }], quellen: { bahnhoefe: 'ok' as const, haltestellen: 'ok' as const } } }))
    expect((await frischeOrtAuf(RATHAUS, suche)).haltestelleId).toBe('h-ks-2027')
    expect(suche).toHaveBeenCalledWith('Kassel Rathaus')
  })
  it('behaelt den alten Ort, wenn die Suche nichts Passendes liefert oder ausfaellt', async () => {
    expect(await frischeOrtAuf(RATHAUS, async () => ({ ok: false, fehler: 'netz' }))).toEqual(RATHAUS)
    const fern = { ...RATHAUS, haltestelleId: 'x', lat: 52 }
    expect(await frischeOrtAuf(RATHAUS, async () => ({ ok: true, antwort: { orte: [fern], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } }))).toEqual(RATHAUS)
  })
})
