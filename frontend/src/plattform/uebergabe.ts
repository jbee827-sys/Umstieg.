import { useSyncExternalStore } from 'react'
import { registerPlugin } from '@capacitor/core'
import { vorfuehrungLaeuft } from '../einfuehrung/zustand'
import { istApp } from './istApp'

/**
 * „An Umstieg senden“ (Plan App Store, Paket 7).
 *
 * Die Teilen-Erweiterung (ios/App/Teilen) legt den geteilten Text einer
 * Verbindung in den gemeinsamen Speicher der App Group. Die App holt ihn
 * beim Start und jedes Mal, wenn sie wieder sichtbar wird, über das eigene
 * Plugin `Uebergabe` (ios/App/App/UebergabePlugin.swift) - einmal, danach
 * ist er dort gelöscht. Ausgewertet wird er wie ein eingefügter Text im
 * Dialog „Reise importieren“ (components/ReiseImport.tsx): Nichts wird ohne
 * Blick und Tipp übernommen.
 *
 * Der Text bleibt nur im Speicher der Seite, bis der Dialog zu ist.
 */
interface UebergabePlugin {
  hole(): Promise<{ text?: string }>
  zustand(): Promise<SpeicherZustand>
}

/** Der Stand des gemeinsamen Speichers (UebergabeSpeicher.swift) - nie der Text. */
interface SpeicherZustand {
  gruppe?: boolean
  wartet?: boolean
  zeichen?: number
  wartetSeitSek?: number
  abgelegtVorSek?: number
  abgelegtZahl?: number
  abgeholtVorSek?: number
  abgeholtZahl?: number
}

const Uebergabe = registerPlugin<UebergabePlugin>('Uebergabe')

let wartend: string | null = null
const hoerer = new Set<() => void>()

function melde(): void {
  for (const h of hoerer) h()
}

function abonniere(h: () => void): () => void {
  hoerer.add(h)
  return () => hoerer.delete(h)
}

/** Der geteilte Text, der auf den Dialog wartet - `null`, wenn keiner. */
export function useGeteilterText(): string | null {
  return useSyncExternalStore(abonniere, () => wartend, () => null)
}

/** Der Dialog ist zu: Der Text ist erledigt, ob übernommen oder nicht. */
export function verwirfGeteiltenText(): void {
  wartend = null
  melde()
}

/** Für die Tests und die Vorführung: einen Text so setzen, als wäre er geteilt worden. */
export function setzeGeteiltenText(text: string | null): void {
  wartend = text
  melde()
}

/**
 * Was der letzte Abruf ergab - für die Diagnose (16.11.2026).
 *
 * Bis dahin verschwand jeder Fehler des Plugins still: Kam ein geteilter
 * Text nicht an, ließ sich nicht sagen, ob die Erweiterung ihn nie abgelegt,
 * die App ihn nie gelesen oder der Dialog ihn nie gezeigt hatte.
 */
let letzterAbruf: { wann: number; ergebnis: string } | null = null

function vermerke(ergebnis: string): void {
  letzterAbruf = { wann: Date.now(), ergebnis }
}

async function hole(): Promise<string | null> {
  try {
    const { text } = await Uebergabe.hole()
    const gekuerzt = text?.trim() ? text.trim() : null
    vermerke(gekuerzt ? `Text geholt (${gekuerzt.length} Zeichen)` : 'nichts da')
    return gekuerzt
  } catch (fehler) {
    vermerke(`Fehler des Plugins: ${fehler instanceof Error ? fehler.message : String(fehler)}`)
    return null
  }
}

function vor(sek: number | undefined): string {
  if (sek === undefined) return 'nie'
  if (sek < 90) return `vor ${sek} s`
  if (sek < 5400) return `vor ${Math.round(sek / 60)} min`
  return `vor ${Math.round(sek / 3600)} h`
}

/**
 * Die Diagnose der Übergabe, Zeile für Zeile - für „Einstellungen“ in der App.
 *
 * Verändert nichts und zeigt nie den geteilten Text, nur Zeiten und Längen.
 * Vorübergehend: Sie fällt wieder weg, sobald die Übergabe am iPhone belegt ist.
 */
export async function uebergabeDiagnose(): Promise<string[]> {
  if (!istApp()) return ['Nur in der App.']
  const zeilen: string[] = []
  try {
    const z = await Uebergabe.zustand()
    zeilen.push(`Plugin: erreichbar`)
    zeilen.push(`Gemeinsamer Speicher (App Group): ${z.gruppe ? 'erreichbar' : 'NICHT erreichbar'}`)
    zeilen.push(`Erweiterung hat abgelegt: ${z.abgelegtZahl ?? 0}×, zuletzt ${vor(z.abgelegtVorSek)}`)
    zeilen.push(`App hat abgeholt: ${z.abgeholtZahl ?? 0}×, zuletzt ${vor(z.abgeholtVorSek)}`)
    zeilen.push(z.wartet ? `Es wartet ein Text: ${z.zeichen ?? 0} Zeichen, seit ${vor(z.wartetSeitSek).replace('vor ', '')}` : 'Es wartet kein Text.')
  } catch (fehler) {
    zeilen.push(`Plugin: NICHT erreichbar (${fehler instanceof Error ? fehler.message : String(fehler)})`)
  }
  zeilen.push(
    letzterAbruf
      ? `Letzter Abruf der Seite: ${vor(Math.round((Date.now() - letzterAbruf.wann) / 1000))} – ${letzterAbruf.ergebnis}`
      : 'Letzter Abruf der Seite: noch keiner',
  )
  zeilen.push(wartend !== null ? `Im Dialog wartet: ${wartend.length} Zeichen` : 'Im Dialog wartet nichts.')
  return zeilen
}

/**
 * Fragt beim Start und bei jeder Rückkehr in die App nach einem geteilten
 * Text. `angekommen` läuft, sobald einer da ist - die App wechselt dann auf
 * die Eingabe, wo der Dialog aufgeht. Rückgabe beendet das Beobachten.
 */
export function beobachteUebergabe(angekommen: () => void): () => void {
  if (!istApp()) return () => undefined
  let aus = false
  const pruefe = () => {
    // Während der Einführungstour bleibt der Text liegen - die Tour zeigt
    // eine Beispielreise, nicht die des Nutzers.
    if (vorfuehrungLaeuft()) {
      vermerke('übersprungen – die Einführungstour läuft')
      return
    }
    void hole().then((text) => {
      if (aus || !text) return
      setzeGeteiltenText(text)
      angekommen()
    })
  }
  const beiSichtbar = () => {
    if (document.visibilityState === 'visible') pruefe()
  }
  pruefe()
  document.addEventListener('visibilitychange', beiSichtbar)
  return () => {
    aus = true
    document.removeEventListener('visibilitychange', beiSichtbar)
  }
}
