import { useCallback, useEffect, useRef } from 'react'
import type { Bildschirm } from '../navigation/bildschirme'
import { melde, type Messpunkt } from './ereignis'

/**
 * Wann welcher Messpunkt faellig ist (Konzept Nutzergewinnung AP 4).
 *
 * Abgelesen am Bildschirm, nicht an einzelnen Knoepfen: Die Uebersicht
 * erreicht man nur mit einer berechneten Reise, den Weg nur ueber sie. So
 * bleibt die Messung an EINER Stelle und muss nicht in jede Schaltflaeche
 * der Schrittnavigation eingebaut werden.
 */
export function faelligeMesspunkte(bildschirm: Bildschirm, schritt: number): Messpunkt[] {
  switch (bildschirm) {
    case 'dashboard':
      return ['eingabe-fertig']
    case 'navigation':
      // „Schritt 1 erreicht" = der erste Wechsel von Schritt 0 auf Schritt 1.
      return schritt >= 1 ? ['navigation-start', 'schritt-1'] : ['navigation-start']
    case 'angekommen':
      return ['ziel']
    default:
      return []
  }
}

/**
 * Was eine nach dem Neuladen wiederhergestellte Reise belegt schon hinter
 * sich hat - das wird nicht noch einmal gezaehlt. `versatz` ist die Summe
 * der Weiter- und Zurueck-Tipps; ueber 0 heisst, Schritt 1 war erreicht.
 */
export function bereitsErreicht(reise: { versatz: number } | null, bildschirm: Bildschirm): Messpunkt[] {
  if (!reise) return []
  const erreicht: Messpunkt[] = ['eingabe-fertig']
  if (bildschirm === 'navigation' || reise.versatz >= 1) erreicht.push('navigation-start')
  if (reise.versatz >= 1) erreicht.push('schritt-1')
  return erreicht
}

/**
 * Meldet jeden Messpunkt genau einmal je Reise. `neueReise` vor jeder neuen
 * Berechnung aufrufen - danach zaehlt alles wieder von vorn. Hin und Her
 * ueber die Leiste zaehlt nicht doppelt.
 */
export function useMesspunkte(
  bildschirm: Bildschirm,
  schritt: number,
  start: { reise: { versatz: number } | null; bildschirm: Bildschirm },
): { neueReise: () => void } {
  const gemeldet = useRef<Set<Messpunkt> | null>(null)
  if (gemeldet.current === null) gemeldet.current = new Set(bereitsErreicht(start.reise, start.bildschirm))

  useEffect(() => {
    const schon = gemeldet.current!
    for (const punkt of faelligeMesspunkte(bildschirm, schritt)) {
      if (schon.has(punkt)) continue
      schon.add(punkt)
      melde(punkt)
    }
  }, [bildschirm, schritt])

  const neueReise = useCallback(() => {
    gemeldet.current = new Set()
  }, [])
  return { neueReise }
}
