import type { Band, Bandmodell } from './bandmodell'
import { massgeblicherBahnsteig, wechselAnweisung, wegLaengeM } from './bandmodell'

/**
 * Die Sätze des Bandstapels: Titel, Fußzeile, der ganze Weg in einem Satz.
 *
 * Getrennt von `Ebenenschema.tsx`, damit die Komponente nur Komponenten
 * exportiert (Fast Refresh) – und damit Tests und Planmappe dieselben Sätze
 * lesen wie das Telefon.
 */

function mehrzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`
}

/** Die Fußzeile eines aktiven Bandes — die Auskunft, die dort zählt. */
export function fusstext(band: Band): string | null {
  const meter = wegLaengeM(band.ebene.weg)
  if (band.art === 'verbindung') {
    const teile = [
      meter > 0 ? `${meter} m` : 'nur durchqueren',
      band.wechselNachher ? `dann ${wechselAnweisung(band.wechselNachher)}` : null,
    ]
    return teile.filter(Boolean).join(' · ')
  }

  const bahnsteig = massgeblicherBahnsteig(band.ebene, band.erster, band.letzter)
  const genutzt = (bahnsteig?.zugaenge ?? []).find((z) => z.aufRoute)
  if (band.wechselNachher) {
    if (!genutzt) return `${wechselAnweisung(band.wechselNachher)} nach ${meter} m`
    const anlagen = [
      genutzt.rolltreppe > 0 ? mehrzahl(genutzt.rolltreppe, 'Rolltreppe', 'Rolltreppen') : null,
      genutzt.treppe > 0 ? mehrzahl(genutzt.treppe, 'Treppe', 'Treppen') : null,
      genutzt.aufzug > 0 ? mehrzahl(genutzt.aufzug, 'Aufzug', 'Aufzüge') : null,
    ]
      .filter(Boolean)
      .join(', ')
    return `${wechselAnweisung(band.wechselNachher)} bei ${genutzt.beiM} m${anlagen ? ` · ${anlagen}` : ''}`
  }
  if (band.wechselVorher) {
    return genutzt
      ? `Oben bei ${genutzt.beiM} m · dann ${meter} m zum Zug`
      : `${meter} m zum Zug`
  }
  return `Ohne Ebenenwechsel · ${meter} m`
}

export function bandTitel(band: Band): string {
  const rolle = band.rolle === 'start' ? ' · Ankunft' : band.rolle === 'ziel' ? ' · Abfahrt' : ''
  const art = band.art === 'verbindung' ? ' · Übergang' : ''
  return `${band.label}${art}${rolle}`
}

/** Der ganze Weg in einem Satz — für Screenreader, und als Probe für Tests. */
export function wegBeschreibung(modell: Bandmodell, bahnhofName: string): string {
  const teile: string[] = []
  for (const band of modell.baender) {
    teile.push(`${bandTitel(band)}${band.aktiv ? ' (hier)' : ''}`)
    if (band.wechselNachher) teile.push(wechselAnweisung(band.wechselNachher))
  }
  return `Weg durch ${bahnhofName}: ${teile.join(', ')}`
}
