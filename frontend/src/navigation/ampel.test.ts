import { describe, it, expect } from 'vitest'
import {
  abfahrtNachAnkunft,
  ampelFarbe,
  anschlussUnerreichbar,
  balkenProzent,
  restZeitText,
  umstiegRestSek,
} from './ampel'

function um(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 10, 4, h, m, 0, 0)
}

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

describe('Ampel rechnet ab Ankunft (Spec 7.1)', () => {
  it('Erfurt: Ankunft 16:21, Abfahrt 16:20 → unerreichbar', () => {
    expect(anschlussUnerreichbar(um('16:20'), um('16:21'))).toBe(true)
  })
  it('Abfahrt gleich Ankunft ist nicht unerreichbar (0 s Rest, rot über die Gehzeit)', () => {
    expect(anschlussUnerreichbar(um('16:21'), um('16:21'))).toBe(false)
  })
  it('ohne Ankunft: nie unerreichbar, Rest wie bisher Abfahrt − jetzt', () => {
    expect(anschlussUnerreichbar(um('16:20'), undefined)).toBe(false)
    expect(umstiegRestSek(um('16:30'), undefined, um('16:25').getTime())).toBe(300)
  })
  it('vor der Ankunft zählt Abfahrt − Ankunft, nicht Abfahrt − jetzt', () => {
    expect(umstiegRestSek(um('16:30'), um('16:21'), um('15:00').getTime())).toBe(540)
  })
  it('nach der Ankunft zählt jetzt', () => {
    expect(umstiegRestSek(um('16:30'), um('16:21'), um('16:25').getTime())).toBe(300)
  })
  it('Mitternacht: an 23:58, ab 00:10 → erreichbar, 720 s', () => {
    // heuteUm legt beide auf denselben Tag; die Abfahrt liegt 23 h 48 min VOR der Ankunft.
    expect(anschlussUnerreichbar(um('00:10'), um('23:58'))).toBe(false)
    expect(umstiegRestSek(um('00:10'), um('23:58'), um('23:00').getTime())).toBe(720)
  })
  it('Mitternacht: abfahrtNachAnkunft verschiebt nur bei mehr als 12 h Abstand', () => {
    expect(abfahrtNachAnkunft(um('00:10'), um('23:58')).getDate()).toBe(5)
    expect(abfahrtNachAnkunft(um('16:20'), um('16:21')).getDate()).toBe(4)
    expect(abfahrtNachAnkunft(um('12:00'), um('23:59')).getDate()).toBe(4)
  })
})
