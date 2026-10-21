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

describe('Datenschutz ohne Rueckruf (vorgerendert)', () => {
  it('fuehrt per Link zur Startseite statt per Knopf', () => {
    const { container } = render(<Datenschutz />)
    expect(container.querySelector('a[href="/"]')?.textContent).toBe('Zur Startseite')
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('Datenschutzerklaerung sagt, was die App wirklich tut', () => {
  it('benennt den Sitzungsspeicher fuer die Eingabe', () => {
    const text = zeige()
    expect(text).toContain('sessionStorage')
    expect(text).toMatch(/Tab schließt/)
  })

  /** Seit dem 11.10.2026 liegt dort auch die Reise (sitzung/reisespeicher.ts). */
  it('nennt Route und Meldungen der Reise im Sitzungsspeicher', () => {
    expect(zeige()).toMatch(/berechnete Route und die Meldungen dieser Reise/)
  })

  /** Seit dem 11.10.2026 traegt jeder Bildschirm eine eigene Adresse. */
  it('sagt, dass die gemessene Adresse nur den Bildschirm nennt', () => {
    expect(zeige()).toMatch(/nennt nur den Bildschirm/)
  })

  it('behauptet nicht mehr, gar nichts zu speichern', () => {
    // Die beiden Formulierungen, die durch den Sitzungsspeicher falsch
    // geworden sind. Sie duerfen nicht zurueckkehren.
    const text = zeige()
    expect(text).not.toContain('speichert nichts auf deinem Gerät')
    expect(text).not.toMatch(/weder\s+localStorage\s+noch\s+sessionStorage/)
  })

  // Bis zum 05.10.2026 stand hier die Zusage „localStorage wird nicht
  // verwendet". Mit der Darstellungswahl (Hell/Dunkel) ist sie nicht mehr
  // wahr - die Seite muss benennen, was dort liegt, und wann nicht.
  it('benennt die Darstellungswahl im localStorage - und nur sie', () => {
    const text = zeige()
    expect(text).toContain('localStorage')
    expect(text).toMatch(/Hell\s+oder\s+Dunkel/)
    expect(text).toMatch(/wieder auf\s+System, wird der Eintrag gelöscht/)
    expect(text).toMatch(/Solange du nichts wählst/)
  })

  it('behauptet nicht mehr, localStorage gar nicht zu verwenden', () => {
    expect(zeige()).not.toMatch(/localStorage\s+wird\s+nach\s+wie\s+vor\s+nicht\s+verwendet/)
  })

  // Am 03.09.2026 kam Vercel Web Analytics dazu. Damit wurden drei Saetze
  // dieser Seite auf einen Schlag unwahr - zum dritten Mal in vier Tagen
  // waere sonst eine Zusage nebenbei verlorengegangen.
  it('benennt die Reichweitenmessung', () => {
    const text = zeige()
    expect(text).toMatch(/Vercel Web Analytics/)
    expect(text).toMatch(/Reichweitenmessung/)
  })

  // Seit dem 21.10.2026 (Konzept Nutzergewinnung AP 4): vier Ereignisse je
  // Umstieg. Die Zusage: nur der Name, keine Reisedaten - analytik/
  // messpunkte.test.ts haelt den Code darauf fest.
  it('benennt die vier Ereignisse und dass nur ihr Name uebermittelt wird', () => {
    const text = zeige()
    expect(text).toMatch(/Eingabe abgeschlossen/)
    expect(text).toMatch(/Navigation gestartet/)
    expect(text).toMatch(/erste Schritt erreicht/)
    expect(text).toMatch(/Ziel erreicht/)
    expect(text).toMatch(/nur der Name des Ereignisses/)
    expect(text).toMatch(/kein Bahnhof, kein Gleis, keine Uhrzeit und kein Standort/)
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

  /** Umstieg 2.0: Haltestellensuche und Fusswege laufen ueber Transitous. */
  it('sagt, dass die gerundete Koordinate ueber unseren Server an Transitous geht', () => {
    const text = zeige()
    expect(text).toContain('Haltestellensuche nach Standort')
    expect(text).toMatch(/drei Nachkommastellen[^.]*an Transitous/)
    expect(text).toContain('api.transitous.org')
    expect(text).toMatch(/nicht deine IP-Adresse/)
  })

  it('nennt Tafel und Fussweg der Haltestellen ebenso', () => {
    expect(zeige()).toMatch(/Steigkoordinaten/)
  })
})
