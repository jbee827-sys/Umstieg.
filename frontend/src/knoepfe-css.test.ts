import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Die Hauptknoepfe (Wunsch vom 12.10.2026): Schrift eine Stufe kleiner und
 * mittig, an jedem roten Knopf und am gruenen „Angekommen" daneben. Zuerst an
 * „Umstieg starten", dann fuer alle.
 *
 * Wo ein Knopf angeheftet ist - „Umstieg starten" auf dem Handy, „Navigation
 * starten" -, ist es nur noch der Knopf: Er schwebt ueber dem Rollbereich,
 * der Inhalt rollt darunter durch. Vorher endete der Rollbereich ueber ihm,
 * und der Knopf stand in einem eigenen Streifen vor der Leiste.
 *
 * jsdom rechnet kein Layout - ohne diese Regeln stuende der Knopf wieder im
 * Streifen, und alle Komponententests blieben gruen.
 */
const css = cssVon('App.css')
const pixel = (deklaration: string) => parseInt(deklaration.split(' ').pop()!, 10)

describe('App.css: die Schrift der Hauptknoepfe', () => {
  it.each(['.knopf-primaer', '.knopf-angekommen'])('%s setzt sie kleiner und mittig', (knopf) => {
    const regel = deklarationenVon(css, knopf)
    expect(regel).toContain('justify-content: center')
    expect(regel).toContain('font-size: var(--schrift-text)')
  })
})

/**
 * Danach (Wunsch vom 12.10.2026): Die Knoepfe schrumpfen im selben Verhaeltnis
 * wie ihre Schrift, 22 → 18 px. Vorher 58 px hoch mit 26 px Rand, das Paar
 * auf der Wegseite 56 px.
 */
describe('App.css: die Groesse der Hauptknoepfe', () => {
  const verhaeltnis = 18 / 22
  const wert = (selektor: string, eigenschaft: string) =>
    deklarationenVon(css, selektor).find((d) => d.startsWith(`${eigenschaft}:`))

  it.each(['.knopf-primaer', '.knopf-angekommen'])('%s schrumpft mit der Schrift', (knopf) => {
    expect(wert(knopf, 'min-height')).toBe(`min-height: ${Math.round(58 * verhaeltnis)}px`)
    expect(wert(knopf, 'padding')).toBe(`padding: 0 ${Math.round(26 * verhaeltnis)}px`)
  })

  it('laesst auch das Paar auf der Wegseite mitschrumpfen', () => {
    expect(wert('.schrittsheet-knoepfe > *', 'min-height')).toBe(
      `min-height: ${Math.round(56 * verhaeltnis)}px`,
    )
  })

  it('bleibt ein bequemes Tippziel (DESIGN.md 4: mindestens 44 px)', () => {
    expect(Math.round(56 * verhaeltnis)).toBeGreaterThanOrEqual(44)
  })
})

/**
 * Die Knoepfe der Zugauswahl tragen seit dem 01.11.2026 den Look des
 * Neumorph-Buttons von cult-ui, Fassung „secondary": Grund im Feldton, Rand, eine
 * Kante unten, weicher Schatten. Nur der Look - ohne Tailwind, Motion,
 * Grossbuchstaben, Federn und Spinner, dafuer mit Nachtfassung.
 */
describe('App.css: die Knoepfe der Zugauswahl', () => {
  it('traegt Grund, Rand, Schatten und 9 px Radius aus den Token', () => {
    const knopf = deklarationenVon(css, '.knopf-zugwahl')
    expect(knopf).toContain('background: var(--zugknopf-flaeche)')
    expect(knopf).toContain('border: 1px solid var(--zugknopf-rand)')
    expect(knopf).toContain('box-shadow: var(--zugknopf-schatten)')
    expect(knopf).toContain('border-radius: 9px')
  })

  it('senkt sich beim Druecken und bleibt dabei bei 0.97 aus .knopf-sekundaer', () => {
    const gedrueckt = deklarationenVon(css, '.knopf-zugwahl:active')
    expect(gedrueckt).toContain('background: var(--zugknopf-druck)')
    expect(gedrueckt).toContain('box-shadow: var(--zugknopf-schatten-druck)')
    expect(gedrueckt.filter((d) => d.startsWith('transform'))).toEqual([])
  })

  it('wird von .zug-gewaehlt nicht uebermalt', () => {
    expect(deklarationenVon(css, '.zug-gewaehlt .knopf-sekundaer').filter((d) => d.startsWith('background'))).toEqual([])
  })

  it('hat eine Nachtfassung in beiden dunklen Bloecken', () => {
    const treffer = cssVon('index.css').match(/--zugknopf-flaeche: #454240/g) ?? []
    expect(treffer).toHaveLength(2)
  })

  it.each(['components/Zugauswahl.tsx', 'components/Fahrtauswahl.tsx'])(
    '%s nutzt ihn fuer Waehlen und Aendern',
    (datei) => {
      const quelle = cssVon(datei)
      expect(quelle.match(/knopf-sekundaer knopf-zugwahl/g)).toHaveLength(2)
      expect(quelle).not.toContain('className="knopf-sekundaer"')
    },
  )
})

/**
 * „Umstieg starten", „Navigation starten" und „Weiter" tragen seit dem
 * 10.11.2026 die Farben des Texture-Buttons von cult-ui: roter Verlauf, ein
 * 1-px-Lichtrand von fast Weiss nach Tiefrot, ein feiner dunkler Ring aussen,
 * weisse Schrift. Form und Schrift bleiben die von `.knopf-primaer` (Pille,
 * Archivo 800) - nur das Farbdesign ist uebernommen.
 */
describe('App.css: der Texture-Look der Hauptknoepfe', () => {
  it('malt Verlauf und Lichtrand aus den Token, ohne die Form anzufassen', () => {
    const knopf = deklarationenVon(css, '.knopf-textur')
    expect(knopf).toContain('color: var(--texturknopf-schrift)')
    expect(knopf).toContain('border: 1px solid transparent')
    expect(knopf.join(' ')).toMatch(/var\(--texturknopf-oben\), var\(--texturknopf-unten\)\) padding-box/)
    expect(knopf.join(' ')).toMatch(/var\(--texturknopf-licht-oben\), var\(--texturknopf-licht-unten\)\) border-box/)
    expect(knopf.filter((d) => /^(border-radius|font|min-height|padding)/.test(d))).toEqual([])
  })

  it('hat eigene Verlaeufe fuer Darueberfahren und Druecken', () => {
    expect(deklarationenVon(css, '.knopf-textur:hover').join(' ')).toContain('var(--texturknopf-oben-hover)')
    expect(deklarationenVon(css, '.knopf-textur:active').join(' ')).toContain('var(--texturknopf-oben-druck)')
  })

  it('hat eine Nachtfassung in beiden dunklen Bloecken', () => {
    const treffer = cssVon('index.css').match(/--texturknopf-oben: #ff5a3d/g) ?? []
    expect(treffer).toHaveLength(2)
  })

  it.each([
    ['components/Eingabe.tsx', 'knopf-primaer knopf-textur knopf-schwebend'],
    ['screens/Dashboard.tsx', 'knopf-primaer knopf-textur knopf-schwebend'],
    ['components/Schrittsheet.tsx', 'knopf-primaer knopf-textur'],
  ])('%s nutzt ihn', (datei, klassen) => {
    expect(cssVon(datei)).toContain(`className="${klassen}"`)
  })
})

describe('App.css: der schwebende Knopf', () => {
  const schwebend = () => deklarationenVon(css, '.knopf-schwebend')

  it('liegt ueber dem Rollbereich, nicht in einem Streifen darunter', () => {
    expect(schwebend()).toContain('position: absolute')
    expect(schwebend()).toContain('z-index: 1')
  })

  it.each(['.eingabe-flaeche', '.dashboard-flaeche'])('%s ist seine Bezugsflaeche', (flaeche) => {
    expect(deklarationenVon(css, flaeche)).toContain('position: relative')
  })

  /** Sonst bliebe das Letzte im Rollbereich am Ende unter dem Knopf. */
  it.each(['.eingabe-rollbereich', '.dashboard-rollbereich'])(
    '%s laesst unten so viel Platz, dass das Letzte ueber dem Knopf steht',
    (bereich) => {
      const polster = deklarationenVon(css, bereich).find((d) => d.startsWith('padding:'))!
      const abstand = schwebend().find((d) => d.startsWith('bottom:'))!
      const hoehe = deklarationenVon(css, '.knopf-primaer').find((d) => d.startsWith('min-height:'))!
      expect(pixel(polster)).toBeGreaterThanOrEqual(pixel(hoehe) + pixel(abstand))
    },
  )

  /**
   * Sichtpruefung 12.10.2026: Gesperrt war der Knopf zu 45 % deckend - ueber
   * dem Rollbereich schien „Einstellungen" durch ihn hindurch. Er sieht
   * gesperrt aus wie vorher, ist aber voll deckend gemischt.
   */
  it('bleibt auch gesperrt deckend, damit nichts durch ihn scheint', () => {
    const gesperrt = deklarationenVon(css, '.knopf-schwebend:disabled')
    expect(gesperrt).toContain('opacity: 1')
    expect(gesperrt.join(' ')).toMatch(
      /background: color-mix\(in srgb, var\(--color-accent\) 45%, var\(--color-bg\)\)/,
    )
  })
})
