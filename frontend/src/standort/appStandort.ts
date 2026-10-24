import { Geolocation, type Position } from '@capacitor/geolocation'
import type { Standort } from './typen'

/**
 * Der Standort in der iOS-App (Plan App Store, Paket 5): über das native
 * Plugin statt über die Browser-Schnittstelle der WebView. Nur so fragt iOS
 * mit dem Zwecktext aus Info.plist („Beim Verwenden der App“) - und nicht
 * zusätzlich die WebView für `capacitor://localhost`.
 *
 * Die Entscheidungslogik bleibt in useStandort.ts; hier steht nur der Zugang.
 */
export type Freigabe = 'erteilt' | 'verweigert' | 'offen'

const OPTIONEN = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

function zuFreigabe(zustand: string): Freigabe {
  if (zustand === 'granted') return 'erteilt'
  if (zustand === 'denied') return 'verweigert'
  return 'offen'
}

function zuStandort(pos: Position): Standort {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    genauigkeitM: pos.coords.accuracy,
    zeitstempel: pos.timestamp,
  }
}

/** Wirft, wenn die Ortungsdienste des Geräts ganz aus sind. */
export async function appFreigabe(): Promise<Freigabe> {
  return zuFreigabe((await Geolocation.checkPermissions()).location)
}

/** Zeigt die Systemabfrage - erst, nachdem die Oberfläche erklärt hat, wozu. */
export async function frageAppFreigabe(): Promise<Freigabe> {
  return zuFreigabe((await Geolocation.requestPermissions({ permissions: ['location'] })).location)
}

export async function appPosition(): Promise<Standort> {
  return zuStandort(await Geolocation.getCurrentPosition(OPTIONEN))
}

/** Rückgabe beendet die Verfolgung. */
export function verfolgeAppPosition(melde: (s: Standort) => void, fehler: () => void): () => void {
  let id: string | null = null
  let beendet = false
  void Geolocation.watchPosition(OPTIONEN, (pos, err) => {
    if (beendet) return
    if (pos) melde(zuStandort(pos))
    else if (err) fehler()
  })
    .then((neu) => {
      id = neu
      if (beendet) void Geolocation.clearWatch({ id: neu })
    })
    .catch(fehler)
  return () => {
    beendet = true
    if (id) void Geolocation.clearWatch({ id }).catch(() => undefined)
  }
}
