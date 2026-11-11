/**
 * „Etwas melden" (Spec docs/superpowers/specs/2026-11-10-etwas-melden-design.md).
 *
 * Dieselben Regeln prueft das Backend (backend/src/core/meldung.ts) noch
 * einmal - wer die App umgeht, kommt dort nicht durch. Aendert sich eine
 * Regel, dann an beiden Stellen.
 */

/** Mindestens so viele Zeichen OHNE Leerraum - Leerzeichen zaehlen nicht (Julian). */
export const MIN_ZEICHEN = 5
/** Hoechstens so viele Zeichen, gezaehlt wie im Feld. */
export const MAX_ZEICHEN = 2000

/** Wie im Backend: nichts, was eine zweite Adresse oder Kopfzeile einschleust. */
const ADRESSE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/
const MAX_ADRESSE = 254

export function nachrichtStatus(text: string): 'leer' | 'zu-kurz' | 'ok' {
  const zeichen = text.replace(/\s/g, '').length
  if (zeichen === 0) return 'leer'
  return zeichen < MIN_ZEICHEN ? 'zu-kurz' : 'ok'
}

export function adresseStatus(adresse: string): 'leer' | 'ungueltig' | 'ok' {
  const a = adresse.trim()
  if (a === '') return 'leer'
  return a.length <= MAX_ADRESSE && ADRESSE.test(a) ? 'ok' : 'ungueltig'
}
