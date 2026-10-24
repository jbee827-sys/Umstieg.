import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from '../testhilfen/css'

/**
 * Die iOS-App reicht unter Statusleiste und Home-Balken (`viewport-fit=cover`,
 * appHtml.ts). Ohne diese Regeln stuende der Kopf jeder Seite unter der
 * Uhrzeit - und jsdom rechnet kein Layout, alle Komponententests blieben gruen.
 */
const app = cssVon('App.css')
const basis = cssVon('index.css')

describe('sichere Raender in der App', () => {
  it('die Spalte beginnt unter der Statusleiste', () => {
    expect(deklarationenVon(app, '.app')).toContain('padding: calc(24px + env(safe-area-inset-top)) 20px 0')
  })

  it('die Leiste endet ueber dem Home-Balken', () => {
    expect(deklarationenVon(app, '.navileiste').join(';')).toContain('env(safe-area-inset-bottom)')
  })

  it('ein Dialog bleibt in allen vier Richtungen frei', () => {
    const polster = deklarationenVon(app, '.dialog-grund').find((d) => d.startsWith('padding:'))
    for (const seite of ['top', 'right', 'bottom', 'left']) {
      expect(polster).toContain(`env(safe-area-inset-${seite})`)
    }
  })
})

describe('App-Verhalten nur mit ist-app', () => {
  it('die Seite federt nicht als Ganzes nach', () => {
    expect(basis).toMatch(/\.ist-app,\s*\.ist-app body\s*\{[^}]*overscroll-behavior: none/)
  })

  it('Knoepfe und Links lassen sich nicht als Text markieren', () => {
    const regel = basis.match(/\.ist-app button,[^{]*\{([^}]*)\}/)
    expect(regel?.[0]).toContain('.ist-app a,')
    expect(regel?.[1]).toContain('user-select: none')
    expect(regel?.[1]).toContain('-webkit-touch-callout: none')
  })

  it('Eingabefelder bleiben auswaehlbar', () => {
    expect(basis).not.toMatch(/\.ist-app (input|textarea)/)
  })
})
