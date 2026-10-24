import { istApp } from '../plattform/istApp'

/**
 * Die Beispielreise ohne Tour, direkt auf einem Bildschirm - für die
 * Bildschirmfotos des Cloud-Builds (Plan App Store, Pakete 2 und 10).
 *
 * Gestartet über die Adresse: `/vorfuehrung/uebersicht`. Ein Pfad, keine
 * Abfrage: Capacitor setzt den Startpfad der App (`server.appStartPath`) als
 * Pfadbestandteil und würde ein `?` maskieren. Der Ablauf
 * `.github/workflows/ios.yml` trägt ihn für jedes Foto ein.
 *
 * Nur in der App und in der Entwicklung, nie auf www.umstieg.online: Ein
 * geteilter Link soll niemandem eine erfundene Reise zeigen.
 *
 * Klein, weil im Haupt-Chunk; Daten und Ablauf liegen in vorfuehrung.ts und
 * werden nur geladen, wenn die Adresse es verlangt.
 */
export type VorfuehrZiel = 'eingabe' | 'uebersicht' | 'weg'

const ZIELE: readonly VorfuehrZiel[] = ['eingabe', 'uebersicht', 'weg']

export function vorfuehrZiel(pfad: string): VorfuehrZiel | null {
  const wert = /^\/vorfuehrung\/([a-z]+)\/?$/.exec(pfad)?.[1]
  return ZIELE.find((z) => z === wert) ?? null
}

export function starteVorfuehrungAusAdresse(): void {
  if (!istApp() && !import.meta.env.DEV) return
  const ziel = vorfuehrZiel(window.location.pathname)
  if (!ziel) return
  void import('./vorfuehrung').then((v) => v.fuehreVor(ziel)).catch(() => undefined)
}
