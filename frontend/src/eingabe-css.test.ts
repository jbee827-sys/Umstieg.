import { describe, expect, it } from 'vitest'
import { bloeckeAb, cssVon, deklarationenVon } from './testhilfen/css'
import { BREIT_ABFRAGE } from './aufbau/breite'

/**
 * Die Eingabe hat seit dem 11.10.2026 den Aufbau der Uebersicht: Spalte auf
 * Sichtfeldhoehe, der Inhalt rollt, „Umstieg starten" steht fest darunter.
 * jsdom rechnet kein Layout - ohne diese Regeln laege der Knopf wieder unter
 * dem Falz, und alle Komponententests blieben gruen.
 */
const css = cssVon('App.css')

describe('App.css: die Eingabe', () => {
  it('haelt die Spalte auf Sichtfeldhoehe', () => {
    const spalte = deklarationenVon(css, '.app-eingabe')
    expect(spalte).toContain('height: 100dvh')
    expect(spalte).toContain('overflow: hidden')
  })

  it('laesst den Rollbereich rollen und schrumpfen', () => {
    const bereich = deklarationenVon(css, '.eingabe-rollbereich')
    expect(bereich).toContain('flex: 1')
    expect(bereich).toContain('min-height: 0')
    expect(bereich).toContain('overflow-y: auto')
  })

  /**
   * Entscheidung vom 11.10.2026: Beide Gleisnummern gleich gross. Vorher 56 px
   * und ab vier Zeichen 28 px - mit „2 A - D" links und „1" rechts standen
   * zwei ungleich hohe Felder nebeneinander. Teilgleise passen auf 320 px nur
   * in 28 px, also bekommen beide diese Stufe.
   */
  it('setzt beide Gleisnummern in dieselbe Stufe: 28 px', () => {
    expect(deklarationenVon(css, '.gleiskachel-feld')).toContain('font-size: var(--schrift-titel)')
    expect(deklarationenVon(css, '.gleiskachel-feld.lang')).toEqual([])
  })

  it('behaelt die rote Gleisnummer im Anschluss', () => {
    expect(deklarationenVon(css, '.gleiskachel.ziel .gleiskachel-feld')).toContain(
      'color: var(--color-accent-700)',
    )
  })
})

describe('App.css: breites Layout der Eingabe', () => {
  const ab700 = bloeckeAb(css, `@media ${BREIT_ABFRAGE}`).join(' ')
  const ab900 = bloeckeAb(css, '@media (min-width: 900px) and (min-height: 600px)').join(' ')

  it('nimmt dieselbe Abfrage wie der Hook, der die Tafeln laden laesst', () => {
    // Liefen CSS und Hook auseinander, stuenden Tafeln in der Telefonspalte
    // oder Platzhalter ohne Tafeln im breiten Raster.
    expect(css).toContain(`@media ${BREIT_ABFRAGE} {`)
  })

  it('gibt den Tafeln gestapelt hoechstens 420 px, bei wenig Hoehe weniger', () => {
    expect(deklarationenVon(ab700, '.eingabe-flaeche')).toContain(
      'grid-template-rows: minmax(0, 1fr) clamp(240px, 36dvh, 420px) auto',
    )
  })

  it('wird ab 700 px breiter als die Telefonspalte', () => {
    expect(deklarationenVon(ab700, '.app-eingabe')).toContain('max-width: 1280px')
  })

  it('stellt ab 900 px Formular, Ankunft und Abfahrt nebeneinander', () => {
    expect(deklarationenVon(ab900, '.eingabe-flaeche')).toContain(
      'grid-template-columns: minmax(340px, 400px) 1fr 1fr',
    )
  })
})

describe('App.css: die Tafeln klappen nach rechts auf', () => {
  it('laeuft als Uebergang ueber die Token', () => {
    const regel = deklarationenVon(css, '.mit-bewegung .tafel-spalte-inhalt').join('; ')
    expect(regel).toMatch(/clip-path var\(--dauer-normal\) var\(--verlauf-ein\)/)
  })

  it('ist zugeklappt von rechts her verdeckt', () => {
    expect(
      deklarationenVon(css, ".tafel-spalte[data-offen='nein'] .tafel-spalte-inhalt"),
    ).toContain('clip-path: inset(0 100% 0 0)')
  })

  it('klappt auch beim ersten Erscheinen auf', () => {
    expect(bloeckeAb(css, '@starting-style').join(' ')).toMatch(/clip-path: inset\(0 100% 0 0\)/)
  })

  it('laesst die Abfahrt um --dauer-schnell nachfolgen', () => {
    expect(
      deklarationenVon(
        css,
        ".mit-bewegung .tafel-spalte.abfahrt[data-offen='ja'] .tafel-spalte-inhalt",
      ),
    ).toContain('transition-delay: var(--dauer-schnell)')
  })
})

/**
 * Sichtpruefung 11.10.2026: In drei Spalten ragte der Rollbereich mit seinem
 * `margin: 0 -20px` 2 px in die Ankunftstafel - seine Rollleiste laege auf
 * deren Rand. Ab 900 px reicht er rechts nur 8 px in den Spaltenabstand.
 */
describe('App.css: der Rollbereich bleibt in seiner Spalte', () => {
  it('reicht ab 900 px rechts nur in den Abstand, nicht in die Tafel', () => {
    const ab900 = bloeckeAb(css, '@media (min-width: 900px) and (min-height: 600px)').join(' ')
    const regel = deklarationenVon(ab900, '.eingabe-rollbereich')
    expect(regel).toContain('margin-right: -8px')
    expect(regel).toContain('padding-right: 8px')
  })
})
