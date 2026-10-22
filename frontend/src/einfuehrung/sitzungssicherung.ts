import { SCHLUESSEL as ENTWURF_SCHLUESSEL } from '../sitzung/eingabespeicher'
import { REISE_SCHLUESSEL } from '../sitzung/reisespeicher'

/**
 * Was der Nutzer vor der Einführungstour im Sitzungsspeicher hatte - roh, so
 * wie es dort stand. `null` heißt: Der Eintrag fehlte.
 *
 * Roh und nicht über `lies()`: Ein Entwurf, den die Speichermodule nicht
 * lesen können (ältere Fassung, zu alte Reise), wäre sonst nach der Tour
 * gelöscht, obwohl die Tour ihn gar nicht angefasst haben sollte.
 */
export interface Sicherung {
  eintraege: Record<string, string | null>
}

const SCHLUESSEL = [ENTWURF_SCHLUESSEL, REISE_SCHLUESSEL]

/** Wie in den Speichermodulen: Schon der Zugriff kann werfen (Safari privat). */
function speicher(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function sichere(): Sicherung {
  const s = speicher()
  const eintraege: Record<string, string | null> = {}
  for (const schluessel of SCHLUESSEL) {
    try {
      eintraege[schluessel] = s ? s.getItem(schluessel) : null
    } catch {
      eintraege[schluessel] = null
    }
  }
  return { eintraege }
}

export function stelleWiederHer(sicherung: Sicherung): void {
  const s = speicher()
  if (!s) return
  for (const [schluessel, wert] of Object.entries(sicherung.eintraege)) {
    try {
      if (wert === null) s.removeItem(schluessel)
      else s.setItem(schluessel, wert)
    } catch {
      // Gesperrter Speicher: Dann hat auch die Tour nichts hineingeschrieben.
    }
  }
}
