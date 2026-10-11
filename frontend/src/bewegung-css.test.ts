import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Bewegung nach `design/DESIGN.md` Abschnitt 6 – „flüssig auf jede Handlung,
 * still von selbst".
 *
 * Die Token (`--dauer-*`, `--verlauf-*` in index.css) standen seit dem
 * 20.09.2026, `App.css` nutzte sie nicht: Jeder Knopf hatte eigene Werte
 * (0.18s, 0.5s, 0.9s, `ease`), und `BRIEF.md` §11 führte „Bewegung
 * anschließen" als offen. Diese Regeln halten den Anschluss fest.
 */
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'App.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Der Inhalt jedes Blocks, der mit `kopf` beginnt – Klammern mitgezählt. */
function bloeckeAb(kopf: string, text = css): string[] {
  const bloecke: string[] = []
  let ab = text.indexOf(kopf)
  while (ab >= 0) {
    const auf = text.indexOf('{', ab)
    let tiefe = 0
    let i = auf
    for (; i < text.length; i++) {
      if (text[i] === '{') tiefe++
      if (text[i] === '}' && --tiefe === 0) break
    }
    bloecke.push(text.slice(auf + 1, i))
    ab = text.indexOf(kopf, i)
  }
  return bloecke
}

/** Die Deklarationen der Regel mit GENAU diesem Selektor. */
function regel(selektor: string): string[] {
  for (const t of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (t[1].trim() === selektor) {
      return t[2]
        .split(';')
        .map((z) => z.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    }
  }
  return []
}

describe('App.css: Übergänge laufen über die Token', () => {
  const uebergaenge = [...css.matchAll(/transition(?:-duration|-timing-function)?:\s*([^;]+);/g)].map(
    (t) => t[1].replace(/\s+/g, ' ').trim(),
  )

  it('nennt keine Dauer als Zahl', () => {
    // Ausgenommen die eine Ausnahme der reduzierten Bewegung: 0.01ms heisst
    // „sofort", nicht „schnell".
    const mitZahl = uebergaenge.filter((u) => /\d+(\.\d+)?m?s\b/.test(u) && !u.startsWith('0.01ms'))
    expect(mitZahl).toEqual([])
  })

  it('nennt keinen Verlauf am Token vorbei', () => {
    const eigene = uebergaenge.filter((u) => /\bease\b|ease-in|ease-out|linear|cubic-bezier/.test(u))
    expect(eigene).toEqual([])
  })
})

/**
 * „Keine Hover-Zustände — das Gerät hat keinen Mauszeiger." Auf dem Handy
 * bleibt `:hover` nach dem Antippen stehen: Der Hauptknopf blieb dunkler, bis
 * man woanders hintippte. Wo es einen Zeiger gibt, schadet der Hinweis nicht –
 * deshalb nur hinter `@media (hover: hover)`, statt ganz zu fallen.
 */
describe('App.css: Hover nur, wo es einen Zeiger gibt', () => {
  it('steht kein :hover ausserhalb von @media (hover: hover)', () => {
    let rest = css
    for (const block of bloeckeAb('@media (hover: hover)')) rest = rest.replace(block, '')
    expect(rest.match(/[^{}]*:hover[^{}]*\{/g) ?? []).toEqual([])
  })
})

/** „Beim Drücken scale(0.97) in 120 ms … Der Hauptknopf senkt zusätzlich seinen Schatten." */
describe('App.css: Druckgefühl', () => {
  it.each(['.knopf-primaer', '.knopf-angekommen', '.knopf-sekundaer', '.wahl-knopf', '.routenwahl-zeile'])(
    '%s gibt beim Drücken auf 0.97 nach',
    (knopf) => {
      expect(regel(`${knopf}:active`)).toContain('transform: scale(0.97)')
    },
  )

  it.each(['.knopf-primaer', '.knopf-angekommen'])('%s senkt dabei den Schatten', (knopf) => {
    expect(regel(`${knopf}:active`)).toContain('box-shadow: var(--shadow-md)')
  })
})

/**
 * Reduzierte Bewegung: Übergänge PAUSCHAL auf sofort. Die Liste einzelner
 * Bauteile hatte Lücken (Routenzeile, Angekommen-Knopf) – jeder neue Übergang
 * hätte sich selbst eintragen müssen. Animationen bleiben einzeln geregelt,
 * weil der Ladekreisel sich weiterdrehen soll.
 */
describe('App.css: reduzierte Bewegung', () => {
  it('setzt jeden Übergang auf sofort', () => {
    const block = bloeckeAb('@media (prefers-reduced-motion: reduce)').join('\n')
    expect(block.replace(/\s+/g, ' ')).toMatch(
      /\*, ::before, ::after \{ transition-duration: 0\.01ms !important; \}/,
    )
  })
})
