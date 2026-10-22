import type { EingabeEntwurf } from '../sitzung/eingabespeicher'

/**
 * Das Formular der Eingabe über den Neuaufbau nach der Einführungstour
 * tragen - im Speicher der Seite, nicht im Sitzungsspeicher.
 *
 * Die Eingabe sichert ihren Entwurf erst beim Absenden (App.tsx,
 * `onBerechnen`). Was halb eingetippt dasteht, gibt es nur in ihrem Zustand;
 * der Neuaufbau nach der Tour würde es verwerfen. Es in den Sitzungsspeicher
 * zu schreiben hieße, etwas nie Abgeschicktes über ein Neuladen hinaus
 * aufzubewahren - das sagt die Datenschutzerklärung nicht zu.
 *
 * Klein und ohne Abhängigkeiten: Die Eingabe liegt im Haupt-Chunk.
 */
let lies: (() => EingabeEntwurf) | null = null
let vorgabe: EingabeEntwurf | null = null

/** Die Eingabe meldet, wie ihr Formular gerade steht. Rückgabe meldet ab. */
export function meldeFormularAn(abbild: () => EingabeEntwurf): () => void {
  lies = abbild
  return () => {
    if (lies === abbild) lies = null
  }
}

/** Wie das Formular gerade steht - `null`, wenn keine Eingabe zu sehen ist. */
export function formularStand(): EingabeEntwurf | null {
  return lies ? lies() : null
}

/** Für den nächsten Aufbau der App: Mit diesem Stand beginnt die Eingabe. */
export function setzeFormularVorgabe(stand: EingabeEntwurf | null): void {
  vorgabe = stand
}

export function formularVorgabe(): EingabeEntwurf | null {
  return vorgabe
}
