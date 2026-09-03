import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Datenschutz } from './Datenschutz'

/**
 * Diese Seite ist die einzige Stelle im Projekt, an der wir etwas zusichern
 * statt etwas zu tun. Zusicherungen veralten leise: Am 02.09.2026 wurde die
 * Protokollierung im Backend eingeschaltet, und damit war „Die Anwendung
 * schreibt keine Protokolle" zwei Tage lang unwahr, ohne dass etwas rot wurde.
 *
 * Am selben Tag kam der Sitzungsspeicher für die Eingabe dazu. Vorher stand
 * hier „weder localStorage noch sessionStorage" – dieser Test hält fest, dass
 * die Seite den neuen Zustand benennt und die alte Zusage nicht wieder
 * auftaucht.
 */
function zeige() {
  render(<Datenschutz onZurueck={() => {}} />)
  return document.body.textContent ?? ''
}

describe('Datenschutzerklaerung sagt, was die App wirklich tut', () => {
  it('benennt den Sitzungsspeicher fuer die Eingabe', () => {
    const text = zeige()
    expect(text).toContain('sessionStorage')
    expect(text).toMatch(/Tab schließt/)
  })

  it('behauptet nicht mehr, gar nichts zu speichern', () => {
    // Die beiden Formulierungen, die durch den Sitzungsspeicher falsch
    // geworden sind. Sie duerfen nicht zurueckkehren.
    const text = zeige()
    expect(text).not.toContain('speichert nichts auf deinem Gerät')
    expect(text).not.toMatch(/weder\s+localStorage\s+noch\s+sessionStorage/)
  })

  it('haelt an der Zusage zu localStorage fest', () => {
    // Die gilt weiterhin - und wird auf der Codeseite von
    // sitzung/eingabespeicher.test.ts nachgewiesen, nicht nur behauptet.
    expect(zeige()).toContain('localStorage')
  })

  it('nennt die Rechtsgrundlage der Speicherung', () => {
    // Ohne sie steht dort eine Tatsache ohne Begruendung, und beim naechsten
    // Mal fragt jemand wieder nach einem Zustimmungsbanner.
    expect(zeige()).toContain('TTDSG')
  })
})
