/**
 * Neuaufbau der App nach der Einführungstour (Plan Paket 3).
 *
 * `App` liest ihren Startzustand einmal aus Adresse und Sitzungsspeicher
 * (`useState(() => liesReise() …)`). Nach der Tour den Zustand von außen
 * zurückzubiegen hieße, jede dieser Stellen zu kennen; ein neuer Aufbau liest
 * einfach wieder, was nach `stelleWiederHer()` im Speicher steht.
 *
 * Eigene Datei, damit die nachgeladene Tour `AppRahmen` nicht importieren muss.
 */
let neuAufbauen: (() => void) | null = null

/** Meldet den Rahmen an; Rückgabe meldet ihn wieder ab. */
export function meldeRahmenAn(baue: () => void): () => void {
  neuAufbauen = baue
  return () => {
    if (neuAufbauen === baue) neuAufbauen = null
  }
}

export function baueAppNeu(): void {
  neuAufbauen?.()
}
