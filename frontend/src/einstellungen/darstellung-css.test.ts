import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Die dunkle Palette steht in index.css zweimal: einmal fuer „System ist
 * dunkel", einmal fuer „ausdruecklich Dunkel gewaehlt" (Begruendung dort).
 * Zwei Kopien laufen auseinander, sobald jemand nur eine aendert - dann sieht
 * die App nachts anders aus, je nachdem, WIE sie dunkel geworden ist.
 */
// Nicht `new URL('../index.css', import.meta.url)`: Vite schreibt das im
// Test zu einer Asset-Adresse um, und readFileSync bekaeme kein file:-URL.
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8')

/** Die Deklarationen eines Blocks, ohne Kommentare und Einrueckung. */
function deklarationen(block: string): string[] {
  return block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function blockNach(kopf: string): string {
  const start = css.indexOf(kopf)
  expect(start, `Block „${kopf}" fehlt in index.css`).toBeGreaterThanOrEqual(0)
  const auf = css.indexOf('{', start)
  const zu = css.indexOf('}', auf)
  return css.slice(auf + 1, zu)
}

describe('index.css: die dunkle Palette', () => {
  it('ist fuer System und fuer die eigene Wahl dieselbe', () => {
    const system = deklarationen(blockNach(":root:not([data-darstellung='hell'])"))
    const gewaehlt = deklarationen(blockNach(":root[data-darstellung='dunkel']"))
    expect(system.length).toBeGreaterThan(30)
    expect(gewaehlt).toEqual(system)
  })

  /* Bis zum 01.11.2026 hatten die Nachtgraus einen Violettstich, waehrend die
     helle Palette warm ist. Rot und Akzent sind hier nicht gemeint. */
  it.each([
    '--color-bg',
    '--color-papier',
    '--color-surface',
    '--color-feld',
    '--zugknopf-flaeche',
    '--color-neutral-100',
    '--color-neutral-300',
    '--color-neutral-500',
    '--color-neutral-600',
    '--color-neutral-700',
    '--color-neutral-800',
    '--color-schema-band',
    '--color-schema-band-besucht',
    '--color-schema-bahnsteig',
    '--color-schema-netz',
    '--color-ampel-gehaeuse',
    '--color-ampel-lampe-aus',
  ])('haelt %s nachts warm: Rot >= Gruen >= Blau', (token) => {
    const zeile = deklarationen(blockNach(":root[data-darstellung='dunkel']")).find((d) => d.startsWith(`${token}:`))
    const hex = zeile?.split('#')[1] ?? ''
    expect(hex).toHaveLength(6)
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    expect(r).toBeGreaterThanOrEqual(g)
    expect(g).toBeGreaterThanOrEqual(b)
  })

  it('haelt die Systempalette in der Medienabfrage', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-darstellung='hell'\]\)/)
  })

  it('setzt die Grundgroesse an der Wurzel, damit rem mit 18 px rechnet', () => {
    expect(deklarationen(blockNach('\nhtml {'))).toContain('font-size: 112.5%')
  })
})
