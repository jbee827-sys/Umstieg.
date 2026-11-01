import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Redesign vom 01.11.2026 (DESIGN.md 4): Kaesten und Rahmen sind weg. Bloecke
 * gliedern sich ueber Abstand, Tonflaeche und Trennlinie. jsdom zeichnet nicht -
 * ohne diese Regeln kaeme ein Rahmen unbemerkt zurueck.
 */
const css = cssVon('App.css')
const basis = cssVon('index.css')

describe('App.css: keine Rahmen um Bloecke', () => {
  it.each([
    '.eingabefeld',
    '.reiseblock-box',
    '.vorschlaege',
    '.wahl-knopf',
    '.knopf-sekundaer',
    '.fehler-box',
    '.live-banner',
    '.quelle-weg',
    '.schritt',
    '.schritt-aktiv',
    '.tafel-bloecke',
    '.zug-gewaehlt',
    '.karte-rahmen',
    '.karte-ebene-knopf',
    '.schema-band',
    '.schema-band.aktiv',
    '.schrittsheet',
    '.dashboard-block',
    '.dashboard-block.ziel',
    '.angekommen-kachel',
    '.stoerung-seite',
    '.stoerung-neu',
    '.routenwahl-zeile',
    '.gleiskachel',
    '.tafel-spalte-inhalt',
    '.tafel-platzhalter',
  ])('%s hat keinen Rahmen', (selektor) => {
    const rahmen = deklarationenVon(css, selektor).filter(
      (d) => /^border(-(left|right|width|color|style))?:/.test(d) && d !== 'border: 0',
    )
    expect(rahmen).toEqual([])
  })

  it('zeichnet die Ampelplatten nicht mehr schwarz (nachts waeren sie weiss)', () => {
    for (const selektor of ['.stoerung-ampel', '.angekommen-wagenkasten']) {
      expect(deklarationenVon(css, selektor)).toContain('background: var(--color-surface)')
    }
  })

  it('haelt die Rundung klein', () => {
    expect(basis).toContain('--radius-klein: 6px')
    expect(basis).toContain('--radius-mittel: 8px')
    expect(basis).toContain('--radius-gross: 10px')
  })
})

describe('App.css: Beschriftungen ohne Sperrung', () => {
  it.each(['.kicker', '.tafel-block-titel', '.schrittsheet-zaehler', '.angekommen-kachel-label'])(
    '%s ist nicht gesperrt',
    (selektor) => {
      expect(deklarationenVon(css, selektor).filter((d) => d.startsWith('letter-spacing'))).toEqual([])
    },
  )

  it('hat keine Zeile mehr, die den Kicker als Ueberschrift aufbaut', () => {
    expect(deklarationenVon(css, '.ortsfeld .kicker')).toEqual([])
  })
})

/**
 * Die rote Eingabeflaeche vom 01.11.2026 ist noch am selben Tag zurueckgenommen
 * (Julian): Die Eingabe steht auf dem normalen Grund. Ohne Rahmen muessen sich
 * die Felder ueber ihren Ton abheben.
 */
describe('App.css: die Eingabe auf dem normalen Grund', () => {
  it('hat keine eigene Flaeche und keine Flaechenfarben', () => {
    expect(css).not.toContain('eingabe-feldflaeche')
    expect(basis).not.toContain('--color-flaeche')
    expect(basis).not.toContain('--color-auf-flaeche')
  })

  it('laesst den Hauptknopf rot', () => {
    expect(deklarationenVon(css, '.knopf-primaer')).toContain('background: var(--color-accent)')
    expect(deklarationenVon(css, '.eingabe-flaeche > .knopf-schwebend')).toEqual([])
  })

  it('hebt die Felder ueber ihren Ton ab, hell wie nachts', () => {
    expect(deklarationenVon(css, '.eingabefeld')).toContain('background: var(--color-feld)')
    expect(deklarationenVon(css, '.eingabefeld::placeholder')).toContain('color: var(--color-neutral-700)')
    expect(basis).toContain('--color-feld: #dedcdc')
    expect(basis).toContain('--color-feld: #454240')
  })

  it('setzt im Feld des Anschlusses keinen Grund, der im Weiss verschwaende', () => {
    expect(deklarationenVon(css, '.gleiskachel.ziel .gleiskachel-feld').filter((d) => d.startsWith('background'))).toEqual([])
  })
})
