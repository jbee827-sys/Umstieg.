import { describe, it, expect } from 'vitest'
import { adresseStatus, nachrichtStatus } from './regeln'

// „Etwas melden" (Spec 2026-11-10): dieselben Regeln wie im Backend
// (backend/src/core/meldung.ts). Leerzeichen zaehlen nicht (Julian).
describe('nachrichtStatus', () => {
  it('leer ist leer', () => expect(nachrichtStatus('')).toBe('leer'))
  it('nur Leerraum ist leer', () => expect(nachrichtStatus('   \n ')).toBe('leer'))
  it('Leerzeichen in der Mitte zaehlen nicht', () => expect(nachrichtStatus('a b c d')).toBe('zu-kurz'))
  it('ab 5 Zeichen ist sie ok', () => expect(nachrichtStatus('abcde')).toBe('ok'))
})

describe('adresseStatus', () => {
  it('leer ist erlaubt', () => expect(adresseStatus('')).toBe('leer'))
  it('ohne Endung unbrauchbar', () => expect(adresseStatus('anna@beispiel')).toBe('ungueltig'))
  it('Leerraum am Rand stoert nicht', () => expect(adresseStatus(' anna@beispiel.de ')).toBe('ok'))
  it('Zeilenumbruch ist unbrauchbar', () => expect(adresseStatus('a@b.de\nBcc: x@y.de')).toBe('ungueltig'))
})
