import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Die Übersicht hat seit dem 07.10.2026 den Aufbau der Wegseite: Die Spalte
 * ist genau so hoch wie das Sichtfeld, nur der Inhalt rollt, und darunter
 * stehen fest „Navigation starten" und die Leiste (`BRIEF.md`, Dashboard c).
 *
 * Ein Komponententest sieht das nicht – jsdom rechnet kein Layout. Ohne diese
 * Regeln läge der Knopf wieder unter dem Falz, und alle Tests blieben grün.
 */
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../App.css'), 'utf8')

/** Die Deklarationen eines Blocks, ohne Kommentare und Einrueckung. */
function deklarationen(block: string): string[] {
  return block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Alle Blöcke, deren Selektor GENAU `selektor` ist. */
function bloeckeFuer(selektor: string): string[][] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const bloecke: string[][] = []
  for (const treffer of ohneKommentare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (treffer[1].trim() === selektor) bloecke.push(deklarationen(treffer[2]))
  }
  return bloecke
}

function blockFuer(selektor: string): string[] {
  const bloecke = bloeckeFuer(selektor)
  expect(bloecke.length, `Block „${selektor}" fehlt in App.css`).toBeGreaterThan(0)
  return bloecke.flat()
}

describe('App.css: die Übersicht rollt nur innen', () => {
  it('haelt die Spalte auf Sichtfeldhoehe', () => {
    const spalte = blockFuer('.app-dashboard')
    expect(spalte).toContain('height: 100dvh')
    expect(spalte).toContain('overflow: hidden')
  })

  it('laesst allein den Rollbereich rollen und schrumpfen', () => {
    const bereich = blockFuer('.dashboard-rollbereich')
    expect(bereich).toContain('flex: 1')
    expect(bereich).toContain('min-height: 0')
    expect(bereich).toContain('overflow-y: auto')
  })
})

/**
 * `BRIEF.md`, Dashboard a): Standortwahl und Routenwahl sahen gleich aus –
 * drei Knöpfe, die gewählte Fläche schwarz gefüllt. Auf dem Bahnsteigstreifen
 * zeigt der Standortpunkt die Wahl; die Fläche bleibt der Bahnsteig.
 */
describe('App.css: der Bahnsteigstreifen', () => {
  it('fuellt die gewaehlte Stelle nicht wie eine Routenzeile', () => {
    const gewaehlt = bloeckeFuer('.standortwahl-knopf.gewaehlt').flat()
    expect(gewaehlt.filter((d) => d.startsWith('background'))).toEqual([])
  })
})

/**
 * Sichtpruefung 07.10.2026: Die gewaehlte Stelle auf dem Streifen sass 8 px
 * tiefer als die anderen, und die gewaehlte Routenzeile ebenso - seit August.
 * Eine Regel fuer die blanke Klasse `.gewaehlt` (gemeint war das Abzeichen
 * „✓ Bahnhof" in der Eingabe) gab JEDEM gewaehlten Element `margin-top: 8px`.
 * `gewaehlt` ist eine Zustandsklasse und traegt allein keine Gestalt.
 */
describe('App.css: die Zustandsklasse gewaehlt', () => {
  it('hat keine eigene Regel, die in Routen- und Standortwahl durchschlaegt', () => {
    expect(bloeckeFuer('.gewaehlt')).toEqual([])
  })
})
