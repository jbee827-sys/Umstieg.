import { describe, it, expect } from 'vitest'
import { ohneAbfrage } from './ereignis'

const seitenaufruf = (url: string) => ({ type: 'pageview' as const, url })

describe('ohneAbfrage', () => {
  it('laesst eine gewoehnliche Adresse durch', () => {
    expect(ohneAbfrage(seitenaufruf('https://umstieg.online/'))?.url).toBe(
      'https://umstieg.online/',
    )
  })

  // Die Rechtsseiten haengen am Hash. Er sagt, welche Seite gelesen wurde -
  // harmlos und der einzige Grund, warum die Messung hier ueberhaupt etwas
  // unterscheiden kann.
  it('behaelt den Hash der Rechtsseiten', () => {
    expect(ohneAbfrage(seitenaufruf('https://umstieg.online/#datenschutz'))?.url).toBe(
      'https://umstieg.online/#datenschutz',
    )
  })

  // Der eigentliche Zweck. Heute traegt keine Adresse der App eine
  // Abfragezeichenkette - die Koordinate geht an die API, nicht in die URL.
  // Diese Funktion sorgt dafuer, dass das auch dann gilt, wenn jemand spaeter
  // einen Parameter einbaut, ohne an die Messung zu denken.
  it('schneidet jede Abfragezeichenkette ab', () => {
    expect(ohneAbfrage(seitenaufruf('https://umstieg.online/?lat=52.52&lon=13.37'))?.url).toBe(
      'https://umstieg.online/',
    )
  })

  it('schneidet die Abfrage ab und behaelt den Hash', () => {
    expect(ohneAbfrage(seitenaufruf('https://umstieg.online/?eva=8011160#impressum'))?.url).toBe(
      'https://umstieg.online/#impressum',
    )
  })

  it('behaelt den Ereignistyp', () => {
    expect(ohneAbfrage({ type: 'event', url: 'https://umstieg.online/?x=1' })).toEqual({
      type: 'event',
      url: 'https://umstieg.online/',
    })
  })

  // Eine unbrauchbare Adresse ist kein Grund, etwas Ungeprueftes zu senden.
  it('verwirft ein Ereignis mit unlesbarer Adresse, statt es durchzulassen', () => {
    expect(ohneAbfrage(seitenaufruf('kaputt'))).toBeNull()
  })
})
