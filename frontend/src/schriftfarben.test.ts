import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * index.css legt fest: neutral-500 (2,4 bis 2,9:1) und neutral-600 (hell 3,6
 * bis 4,3:1) sind als SCHRIFTFARBE unbrauchbar, Text nimmt neutral-700
 * (hell ab 5,4:1, dunkel ab 7,1:1).
 *
 * Der Farbdurchgang vom 20.09.2026 hat das an 13 Stellen nicht erreicht -
 * darunter die Gehzeit neben der Ampel, die Gruppentitel der Zugtafel und
 * die Detailzeile unter jedem Schritt. Gefunden bei der Sichtpruefung am
 * 05.10.2026. Linien, Flaechen und Raender duerfen die hellen Stufen weiter
 * tragen - nur `color:` nicht.
 */
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'App.css'), 'utf8')

describe('App.css: Schriftfarben', () => {
  it('setzt keine Schrift in neutral-500 oder neutral-600', () => {
    const treffer = css
      .split('\n')
      .map((zeile, i) => ({ zeile: zeile.trim(), nr: i + 1 }))
      .filter(({ zeile }) => /^color:\s*var\(--color-neutral-[56]00/.test(zeile))
    expect(treffer).toEqual([])
  })
})

/**
 * Sichtpruefung 11.10.2026: Signalrot (`--color-accent`, #ec3013) erreicht
 * auf Weiss nur 4,2:1, auf dem Rotschleier der Anschlusskarte 3,8:1. Als
 * Schrift unter 22 px ist es deshalb verboten; rote Schrift auf hellem Grund
 * nimmt Rotschrift (`--color-accent-700`, 7,2:1) - DESIGN.md 2. Getroffen
 * hatte es die Kicker („Du kommst an"), den Schrittzaehler und „Meldungen"
 * in der Leiste. Grafik darf Signalrot tragen (3:1 genuegt dort).
 */
describe('App.css: Signalrot als Schrift', () => {
  const GRAFIK = new Set(['.schema-scheibe.ankunft'])
  /*
   * Ab 22 px fett ist es grosse Schrift (WCAG 1.4.3: 3:1 genuegt), Signalrot
   * hat 4,2:1. Die Ortsueberschriften der Eingabe tragen es seit dem
   * 21.10.2026 im Rot von „Umstieg starten" (Julian).
   */
  const GROSSE_SCHRIFT = new Set(['.ortsfeld .kicker'])

  const regeln = () => {
    const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    return [...ohneKommentare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((t) => ({ selektor: t[1].trim(), rumpf: t[2] }))
  }
  const signalrot = (rumpf: string) => /(^|;)\s*color:\s*var\(--color-accent\)\s*(;|$)/.test(rumpf)

  it('steht nur an Grafik und grosser Schrift, nie an Fliesstext', () => {
    const treffer = regeln()
      .filter((r) => signalrot(r.rumpf))
      .map((r) => r.selektor)
    expect(treffer.filter((s) => !GRAFIK.has(s) && !GROSSE_SCHRIFT.has(s))).toEqual([])
  })

  it('wo es Schrift ist, ist sie mindestens 22 px', () => {
    for (const regel of regeln().filter((r) => GROSSE_SCHRIFT.has(r.selektor) && signalrot(r.rumpf))) {
      expect(regel.rumpf).toMatch(/font-size:\s*var\(--schrift-(anweisung|titel|gleis)\)/)
    }
  })
})
