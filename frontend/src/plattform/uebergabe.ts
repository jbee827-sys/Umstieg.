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

async function hole(): Promise<string | null> {
  try {
    const { text } = await Uebergabe.hole()
    return text?.trim() ? text.trim() : null
  } catch {
    return null
  }
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
    if (vorfuehrungLaeuft()) return
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
