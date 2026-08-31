import { describe, it, expect } from 'vitest'
import { ampelFarbe, balkenProzent, restZeitText } from './ampel'

describe('ampelFarbe', () => {
  it('gruen ab doppelter Gehzeit', () => {
    expect(ampelFarbe(600, 300)).toBe('gruen')
    expect(ampelFarbe(601, 300)).toBe('gruen')
  })
  it('gelb zwischen einfacher und doppelter Gehzeit', () => {
    expect(ampelFarbe(300, 300)).toBe('gelb')
    expect(ampelFarbe(599, 300)).toBe('gelb')
  })
  it('rot unter der Gehzeit und nach der Abfahrt', () => {
    expect(ampelFarbe(299, 300)).toBe('rot')
    expect(ampelFarbe(-10, 300)).toBe('rot')
  })
})

describe('balkenProzent', () => {
  it('voll zu Beginn', () => {
    expect(balkenProzent(600, 600)).toBe(100)
  })
  it('halb nach der Haelfte', () => {
    expect(balkenProzent(300, 600)).toBe(50)
  })
  it('bleibt am Ende sichtbar statt zu verschwinden', () => {
    expect(balkenProzent(0, 600)).toBe(2)
    expect(balkenProzent(-50, 600)).toBe(2)
  })
  it('ueberschreitet nie 100', () => {
    expect(balkenProzent(900, 600)).toBe(100)
  })
  it('kommt ohne brauchbaren Startpuffer zurecht', () => {
    expect(balkenProzent(300, 0)).toBe(2)
    expect(balkenProzent(300, Number.NaN)).toBe(2)
  })
})

describe('restZeitText', () => {
  it('zeigt Minuten und Sekunden mit fuehrender Null', () => {
    expect(restZeitText(250)).toBe('4:10')
    expect(restZeitText(65)).toBe('1:05')
  })
  it('sagt bei abgelaufener Zeit Bescheid', () => {
    // Zuege fahren zur vollen Minute - ab dann ist der Zug weg.
    expect(restZeitText(0)).toBe('Abfahrt jetzt')
    expect(restZeitText(-1)).toBe('Abfahrt jetzt')
  })
})
