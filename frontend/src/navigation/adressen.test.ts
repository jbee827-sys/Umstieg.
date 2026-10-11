import { describe, expect, it } from 'vitest'
import { PFAD, bildschirmAusPfad, brauchtReise, startBildschirm } from './adressen'

/** Spec 2026-10-11 Seitenuebergaenge, §3. */
describe('Adressen der Bildschirme', () => {
  it('heissen wie die Leiste', () => {
    expect(PFAD).toEqual({
      eingabe: '/eingabe',
      dashboard: '/uebersicht',
      navigation: '/weg',
      meldungen: '/meldungen',
      angekommen: '/angekommen',
    })
  })

  it('lesen sich in beide Richtungen', () => {
    for (const [b, p] of Object.entries(PFAD)) expect(bildschirmAusPfad(p)).toBe(b)
  })

  it('vertragen einen Schraegstrich am Ende', () => {
    expect(bildschirmAusPfad('/weg/')).toBe('navigation')
  })

  it('kennen / und Unbekanntes nicht', () => {
    expect(bildschirmAusPfad('/')).toBeNull()
    expect(bildschirmAusPfad('/dashboard')).toBeNull()
  })

  it('wissen, welche Bildschirme eine Reise brauchen', () => {
    expect(brauchtReise('eingabe')).toBe(false)
    for (const b of ['dashboard', 'navigation', 'meldungen', 'angekommen'] as const) {
      expect(brauchtReise(b)).toBe(true)
    }
  })

  it('starten auf der Adresse, wenn es die Reise dazu gibt, sonst auf der Eingabe', () => {
    expect(startBildschirm('/weg', true)).toBe('navigation')
    expect(startBildschirm('/weg', false)).toBe('eingabe')
    expect(startBildschirm('/', true)).toBe('eingabe')
    expect(startBildschirm('/irgendwas', true)).toBe('eingabe')
  })
})
