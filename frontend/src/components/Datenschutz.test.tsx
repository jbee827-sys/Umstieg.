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

  // Am 03.09.2026 kam Vercel Web Analytics dazu. Damit wurden drei Saetze
  // dieser Seite auf einen Schlag unwahr - zum dritten Mal in vier Tagen
  // waere sonst eine Zusage nebenbei verlorengegangen.
  it('benennt die Reichweitenmessung', () => {
    const text = zeige()
    expect(text).toMatch(/Vercel Web Analytics/)
    expect(text).toMatch(/Reichweitenmessung/)
  })

  it('behauptet nicht mehr, ohne Analyse und ohne Reichweitenmessung zu arbeiten', () => {
    const text = zeige()
    expect(text).not.toMatch(/bindet keine Analyse-\s*oder\s*Werbedienste ein/)
    expect(text).not.toMatch(/Es gibt keine Reichweitenmessung/)
  })

  // Die Zusage, die BLEIBT - und die einzige, die die Messung ueberhaupt
  // vertretbar macht: keine Cookies, kein Speicher auf dem Geraet, deshalb
  // kein Zustimmungsbanner.
  it('haelt fest, dass die Messung ohne Cookies auskommt', () => {
    expect(zeige()).toMatch(/ohne Cookies/)
  })

  it('nennt das Widerspruchsrecht bei berechtigtem Interesse', () => {
    const text = zeige()
    expect(text).toMatch(/Art\. 6 Abs\. 1 lit\. f/)
    expect(text).toMatch(/Art\. 21/)
  })

  /**
   * Am 03.09.2026 kamen Ratenbegrenzung und Sicherheitsprotokoll dazu (P1 und
   * P18 der Haertungsrunde). Damit wurde „Die Anwendung selbst schreibt keine
   * Protokolle" unwahr - es waere das vierte Mal in fuenf Tagen gewesen, dass
   * eine Zusage nebenbei verlorengeht.
   *
   * Der Gegenwert: Das Backend haelt die neue Fassung nachweislich ein, siehe
   * backend/test/datenschutz.test.ts („meldet eine gegriffene Grenze - ohne
   * Adresse, ohne URL, ohne Koordinate").
   */
  it('behauptet nicht mehr, gar keine Protokolle zu schreiben', () => {
    expect(zeige()).not.toMatch(/schreibt keine Protokolle/)
  })

  it('haelt fest, dass die Eintraege ohne Personenbezug sind', () => {
    expect(zeige()).toMatch(/ohne Personenbezug/)
  })

  it('benennt die Missbrauchsabwehr und was dabei mit der Adresse geschieht', () => {
    const text = zeige()
    expect(text).toMatch(/Missbrauch/)
    expect(text).toMatch(/nicht gespeichert/)
  })

  // Diese Zusage BLEIBT wahr und ist die wichtigste der Seite: Die URL der
  // Bahnhofssuche traegt die Koordinate.
  it('haelt an der Zusage zum Koordinaten-Zugriffsprotokoll fest', () => {
    expect(zeige()).toMatch(/Zugriffsprotokoll mit Koordinaten wird nicht/)
  })

  it('nennt die Rechtsgrundlage der Speicherung', () => {
    // Ohne sie steht dort eine Tatsache ohne Begruendung, und beim naechsten
    // Mal fragt jemand wieder nach einem Zustimmungsbanner.
    expect(zeige()).toContain('TTDSG')
  })
})
