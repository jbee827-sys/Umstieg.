import { describe, expect, it } from 'vitest'
import daten from './daten/berlin-hbf-14-6.json'
import { SCHRITTE } from './schritte'
import type { Vorfuehrdaten } from './vorfuehrquelle'

const DATEN = daten as unknown as Vorfuehrdaten

function antwort(schluessel: string) {
  const a = DATEN.routen[schluessel]
  if (a.status !== 200) throw new Error(`${schluessel} ist nicht aufgezeichnet`)
  return a.antwort
}

function text(titel: string): string {
  const schritt = SCHRITTE.find((s) => s.titel === titel)
  if (!schritt) throw new Error(`kein Schritt „${titel}“`)
  return schritt.text
}

/**
 * Die Tour nennt Zahlen und Anlagen aus der Aufzeichnung. Nach `npm run
 * vorfuehrdaten` können sie sich ändern (04.11.2026: Aufzug als Schacht -
 * 14→6 fährt jetzt in einem Zug von 2 nach -2, statt 9/6 sind es 8/4
 * Minuten). Diese Tests machen das sichtbar, statt den alten Satz stehen zu
 * lassen.
 */
describe('Tourtexte passen zur Aufzeichnung', () => {
  it('Standort: Minuten vom Anfang (Westende) und von der Mitte, aufgerundet wie die App', () => {
    const vomAnfang = Math.ceil((antwort('schnellste|anfang').gehzeitSek as number) / 60)
    const vonDerMitte = Math.ceil((antwort('schnellste|mitte').gehzeitSek as number) / 60)
    expect(text('Wo steigst du aus?')).toContain(`vom Westende sind es hier ${vomAnfang} statt ${vonDerMitte} Minuten`)
  })

  it('Ebenenschema: nennt die Anlage, die die schnellste Route ab der Mitte zuerst nimmt', () => {
    const namen: Record<string, string> = { aufzug: 'dem nächsten Aufzug', rolltreppe: 'der nächsten Rolltreppe', treppe: 'der nächsten Treppe' }
    const erste = (antwort('schnellste|mitte').schritte as { typ: string }[]).find((s) => s.typ in namen)
    expect(erste).toBeDefined()
    expect(text('Das Ebenenschema')).toContain(`mit ${namen[erste!.typ]}.`)
  })
})
