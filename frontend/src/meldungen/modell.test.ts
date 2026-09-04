import { describe, it, expect } from 'vitest'
import {
  alleGelesen, ergaenze, hervorgehoben, markiereUebernommen, setzeVorschlag, ungelesen,
  type Vorschlag,
} from './modell'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'

const werte: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '6', gleisAb: '14',
  wagenAn: '',
  wagenAb: '', profil: 'normal', variante: 'schnellste', abfahrtZeit: '14:36',
}

function ereignis(neu: string, zeit = '2026-09-02T12:32:10.000Z'): LiveEreignis {
  return { typ: 'gleiswechsel', zug: 'ICE 1006', alt: '14', neu, zeitstempel: zeit }
}

const route: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 480, hinweise: [] }
const vorschlag: Vorschlag = { route, werte: { ...werte, gleisAb: '12' }, anlass: ereignis('12') }

describe('Meldungsliste', () => {
  it('stellt die neueste Meldung nach vorn', () => {
    const liste = ergaenze(ergaenze([], ereignis('12')), ereignis('9'))
    expect(liste.map((m) => m.ereignis.neu)).toEqual(['9', '12'])
  })

  it('vergibt fortlaufende Nummern, die sich nicht wiederholen', () => {
    const liste = ergaenze(ergaenze(ergaenze([], ereignis('12')), ereignis('9')), ereignis('7'))
    expect(liste.map((m) => m.nr)).toEqual([3, 2, 1])
  })

  it('legt jede neue Meldung als ungelesen an', () => {
    const liste = ergaenze([], ereignis('12'))
    expect(liste[0].gelesen).toBe(false)
    expect(ungelesen(liste)).toBe(1)
  })

  it('zaehlt nur die ungelesenen', () => {
    const liste = ergaenze(alleGelesen(ergaenze([], ereignis('12'))), ereignis('9'))
    expect(liste).toHaveLength(2)
    expect(ungelesen(liste)).toBe(1)
  })

  // Die Liste haengt in einem useEffect, der auf sie selbst hoert. Gaebe
  // alleGelesen jedes Mal eine neue Liste zurueck, liefe der Effect endlos.
  it('gibt dieselbe Liste zurueck, wenn nichts mehr ungelesen ist', () => {
    const gelesen = alleGelesen(ergaenze([], ereignis('12')))
    expect(alleGelesen(gelesen)).toBe(gelesen)
    expect(alleGelesen([])).toHaveLength(0)
  })

  // Ein Gleiswechsel wird gemeldet, bevor die neue Route steht. Die Meldung
  // entsteht sofort - sonst zaehlte der Zaehler erst nach dem Routenabruf,
  // und bei dessen Fehlschlag nie.
  it('traegt die Route nach, ohne die Reihenfolge zu aendern', () => {
    const liste = ergaenze(ergaenze([], ereignis('12')), ereignis('9'))
    expect(liste[0].vorschlag).toBeNull()
    const nachgetragen = setzeVorschlag(liste, liste[0].nr, vorschlag)
    expect(nachgetragen.map((m) => m.nr)).toEqual(liste.map((m) => m.nr))
    expect(nachgetragen[0].vorschlag).toBe(vorschlag)
    expect(nachgetragen[1].vorschlag).toBeNull()
  })

  it('laesst eine unbekannte Nummer in Ruhe', () => {
    const liste = ergaenze([], ereignis('12'))
    expect(setzeVorschlag(liste, 99, vorschlag)).toBe(liste)
  })

  // Ein Punkt, der dauerhaft steht, verliert seine Warnwirkung - nach der
  // zweiten Meldung schaut niemand mehr hin. Dass es Meldungen GAB, bleibt
  // trotzdem sichtbar, nur leiser.
  it('setzt beim Oeffnen den Zaehler zurueck, ohne die Hervorhebung zu nehmen', () => {
    const gelesen = alleGelesen(ergaenze(ergaenze([], ereignis('12')), ereignis('9')))
    expect(ungelesen(gelesen)).toBe(0)
    expect(hervorgehoben(gelesen)).toBe(true)
  })

  it('nimmt mit dem Ende der Reise beides zurueck', () => {
    expect(ungelesen([])).toBe(0)
    expect(hervorgehoben([])).toBe(false)
  })

  // Sonst stuende nach dem Uebernehmen weiter ein Knopf da, der nichts mehr
  // tut - schlimmer als keiner.
  it('haelt fest, dass eine Route uebernommen wurde', () => {
    const liste = setzeVorschlag(ergaenze([], ereignis('12')), 1, vorschlag)
    expect(liste[0].uebernommen).toBe(false)
    const danach = markiereUebernommen(liste, 1)
    expect(danach[0].uebernommen).toBe(true)
    expect(danach[0].vorschlag).toBe(vorschlag)
  })

  it('laesst beim Uebernehmen eine unbekannte Nummer in Ruhe', () => {
    const liste = ergaenze([], ereignis('12'))
    expect(markiereUebernommen(liste, 99)).toBe(liste)
  })

  it('behaelt den Gelesen-Stand beim Nachtragen der Route', () => {
    const liste = alleGelesen(ergaenze([], ereignis('12')))
    expect(setzeVorschlag(liste, liste[0].nr, vorschlag)[0].gelesen).toBe(true)
  })
})
