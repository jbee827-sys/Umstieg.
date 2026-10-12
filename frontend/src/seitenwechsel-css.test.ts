import { describe, expect, it } from 'vitest'
import { bloeckeAb, cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Spec 2026-10-11 Seitenuebergaenge, §5 - die Bewegung steht im CSS, die Art
 * setzt `navigation/uebergang.ts` als `data-uebergang` an <html>.
 */
const css = cssVon('App.css')

describe('App.css: Seitenwechsel', () => {
  it('schiebt vorwaerts von rechts herein, ueber die Token', () => {
    expect(deklarationenVon(css, "html[data-uebergang='vor']::view-transition-new(root)")).toContain(
      'animation: seite-herein-rechts var(--dauer-ruhig) var(--verlauf-ein) both',
    )
    expect(bloeckeAb(css, '@keyframes seite-herein-rechts').join(' ')).toMatch(/translateX\(24px\)/)
  })

  it('spiegelt rueckwaerts', () => {
    expect(
      deklarationenVon(css, "html[data-uebergang='zurueck']::view-transition-new(root)"),
    ).toContain('animation: seite-herein-links var(--dauer-ruhig) var(--verlauf-ein) both')
    expect(bloeckeAb(css, '@keyframes seite-herein-links').join(' ')).toMatch(/translateX\(-24px\)/)
  })

  it('blendet sonst quer in --dauer-normal', () => {
    expect(deklarationenVon(css, '::view-transition-new(root)')).toContain(
      'animation-duration: var(--dauer-normal)',
    )
  })

  it('haelt die Leiste still', () => {
    expect(deklarationenVon(css, '.navileiste')).toContain('view-transition-name: navileiste')
  })

  it('schaltet bei reduzierter Bewegung ab', () => {
    const block = bloeckeAb(css, '@media (prefers-reduced-motion: reduce)')
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(block).toMatch(
      /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/,
    )
  })
})
