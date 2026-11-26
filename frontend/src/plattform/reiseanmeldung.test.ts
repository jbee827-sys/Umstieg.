import { describe, expect, it } from 'vitest'
import type { HaltestellenTafelEintrag, Ort, RouteErgebnis } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'
import { reiseFuerWache } from './reiseanmeldung'

// Ortszeit wie in der App (`abfahrtUm` rechnet mit setHours) - so passt der
// Test in jeder Zeitzone, auch im Cloud-Bau (UTC).
const lokal = (tag: number, h: number, m: number) => new Date(2026, 10, tag, h, m)
const iso = (tag: number, h: number, m: number) => lokal(tag, h, m).toISOString()
const JETZT = lokal(26, 15, 0)

const route = { gehzeitSek: 240 } as RouteErgebnis

const BAHNHOF: EingabeWerte = {
  eva: '8011160',
  bahnhofName: 'Berlin Hbf',
  gleisAn: '7',
  gleisAb: '14',
  wagenAn: '',
  wagenAb: '',
  profil: 'normal',
  variante: 'schnellste',
  abschnitt: 'mitte',
  zugAnName: 'ICE 1006',
  zugAbName: 'RE 3352',
  zugAbAnzeige: 'RE 3',
  zugAnVon: 'München Hbf',
  zugAbNach: 'Stralsund Hbf',
  ankunftZeit: '15:52',
  abfahrtZeit: '16:05',
}

describe('Reise fuer die Wache', () => {
  it('baut die Anmeldung fuer den Bahnhofspfad mit Tafelnamen, Linie, ISO-Zeiten und Gehzeit', () => {
    expect(reiseFuerWache(BAHNHOF, route, JETZT)).toEqual({
      ort: { pfad: 'bahnhof', eva: '8011160' },
      bahnhofName: 'Berlin Hbf',
      haltWort: 'Gleis',
      an: { name: 'ICE 1006', soll: iso(26, 15, 52), gleis: '7', richtung: 'München Hbf' },
      ab: { name: 'RE 3352', anzeige: 'RE 3', soll: iso(26, 16, 5), gleis: '14', richtung: 'Stralsund Hbf' },
      gehzeitSek: 240,
    })
  })

  it('legt eine Ankunft kurz vor Mitternacht auf den Vortag der Abfahrt', () => {
    const spaet = lokal(26, 23, 50)
    const r = reiseFuerWache({ ...BAHNHOF, ankunftZeit: '23:58', abfahrtZeit: '00:10' }, route, spaet)
    expect(r?.an?.soll).toBe(iso(26, 23, 58))
    expect(r?.ab.soll).toBe(iso(27, 0, 10))
  })

  it('meldet einen Zug aus dem Reisetext erst an, wenn er gefunden ist', () => {
    expect(reiseFuerWache({ ...BAHNHOF, zugAbAusText: true }, route, JETZT)).toBeNull()
    const ohneAn = reiseFuerWache({ ...BAHNHOF, zugAnAusText: true }, route, JETZT)
    expect(ohneAn?.an).toBeUndefined()
    expect(ohneAn?.ab.name).toBe('RE 3352')
  })

  it('braucht einen Anschlusszug mit Zeit und eine Gehzeit', () => {
    expect(reiseFuerWache({ ...BAHNHOF, zugAbName: undefined }, route, JETZT)).toBeNull()
    expect(reiseFuerWache({ ...BAHNHOF, abfahrtZeit: undefined }, route, JETZT)).toBeNull()
    expect(reiseFuerWache(BAHNHOF, { gehzeitSek: Number.NaN } as RouteErgebnis, JETZT)).toBeNull()
  })

  it('laesst eine Ankunft ohne Zug oder Zeit weg', () => {
    expect(reiseFuerWache({ ...BAHNHOF, zugAnName: undefined }, route, JETZT)?.an).toBeUndefined()
    expect(reiseFuerWache({ ...BAHNHOF, ankunftZeit: undefined }, route, JETZT)?.an).toBeUndefined()
  })

  it('kappt die Gehzeit auf das, was der Server annimmt', () => {
    expect(reiseFuerWache(BAHNHOF, { gehzeitSek: 9999.6 } as RouteErgebnis, JETZT)?.gehzeitSek).toBe(7200)
    expect(reiseFuerWache(BAHNHOF, { gehzeitSek: 241.4 } as RouteErgebnis, JETZT)?.gehzeitSek).toBe(241)
  })

  it('baut fuer den Haltestellenpfad Steige, Fahrt-IDs und Koordinaten', () => {
    const ort = (id: string): Ort => ({ name: id, lat: 52.5, lon: 13.4, verkehrsmittel: ['bus'], haltestelleId: id })
    const fahrt = (id: string, linie: string, ziel: string, ist?: string): HaltestellenTafelEintrag => ({
      fahrtId: id,
      linie,
      verkehrsmittel: 'bus',
      ziel,
      zeitSoll: '2026-11-26T15:10:00Z',
      ...(ist ? { zeitIst: ist } : {}),
      steigLat: 0,
      steigLon: 0,
      steigGenau: false,
      echtzeit: true,
      ausfall: false,
    })
    const werte: EingabeWerte = {
      ...BAHNHOF,
      eva: '',
      gleisAn: 'A',
      gleisAb: 'C',
      bahnhofName: 'S Buch → Buch Klinikum',
      haltestellen: {
        ankunft: { ort: ort('h-an'), fahrt: fahrt('f-an', 'S2', 'Bernau', '2026-11-26T15:12:00Z') },
        anschluss: { ort: ort('h-ab'), fahrt: fahrt('f-ab', '353', 'Hobrechtsfelde') },
      },
    }
    expect(reiseFuerWache(werte, route, JETZT)).toEqual({
      ort: { pfad: 'haltestelle', an: { id: 'h-an', lat: 52.5, lon: 13.4 }, ab: { id: 'h-ab', lat: 52.5, lon: 13.4 } },
      bahnhofName: 'S Buch → Buch Klinikum',
      haltWort: 'Steig',
      an: { name: 'f-an', anzeige: 'S2', soll: '2026-11-26T15:10:00Z', ist: '2026-11-26T15:12:00Z', gleis: 'A', richtung: 'Bernau' },
      ab: { name: 'f-ab', anzeige: '353', soll: '2026-11-26T15:10:00Z', gleis: 'C', richtung: 'Hobrechtsfelde' },
      gehzeitSek: 240,
    })
    const ohneId = { ...werte, haltestellen: { ...werte.haltestellen!, anschluss: { ...werte.haltestellen!.anschluss, ort: { ...ort('x'), haltestelleId: undefined } } } }
    expect(reiseFuerWache(ohneId, route, JETZT)).toBeNull()
  })
})
