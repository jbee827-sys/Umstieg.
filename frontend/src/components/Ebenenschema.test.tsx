import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RouteErgebnis } from '../api/typen'
import { Ebenenschema } from './Ebenenschema'
import { baueBandmodell, besuchJeSchritt } from '../schema/bandmodell'
import { leiteSchemaAb } from '../schema/ableitung'
import { ANKER_H, RUHIG_H, WECHSEL_H } from '../schema/masse'
import leipzigMitte from '../schema/testdaten/leipzig-6-16-mitte.json'
import leipzigEnde from '../schema/testdaten/leipzig-6-16-ende.json'
import muenchenDicht from '../schema/testdaten/muenchen-dicht.json'

const MITTE = leipzigMitte as unknown as RouteErgebnis
const ENDE = leipzigEnde as unknown as RouteErgebnis
const MUENCHEN = muenchenDicht as unknown as RouteErgebnis

function zeige(route: RouteErgebnis, position: number) {
  return render(
    <Ebenenschema
      modell={baueBandmodell(route.schema, route.schritte, position)}
      ersatz={leiteSchemaAb(route.schritte, position, '6', '16')}
      bahnhofName="Leipzig Hbf"
    />,
  )
}

describe('Ebenenschema mit echter Geometrie', () => {
  it('beschreibt den ganzen Weg in einem Satz, in der Reihenfolge des Wegs', () => {
    zeige(MITTE, 0)
    const bild = screen.getByRole('img')
    expect(bild.getAttribute('aria-label')).toBe(
      'Weg durch Leipzig Hbf: EBENE +1 · Ankunft (hier), Treppe hinunter, ' +
        'EBENE 0 · Übergang, Treppe hinauf, EBENE +1 · Abfahrt',
    )
  })

  it('nennt am Ankunftsbahnsteig den Abgang und seine Anlagen', () => {
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-bandfuss')?.textContent).toBe(
      'Treppe hinunter bei 32 m · 2 Treppen',
    )
  })

  it('nennt am Abfahrtsbahnsteig, wo man oben ankommt – nicht den Abgang von Gleis 6', () => {
    const { container } = zeige(MITTE, MITTE.schritte.length - 1)
    expect(container.querySelector('.schema-bandfuss')?.textContent).toMatch(
      /^Oben bei 31 m · dann \d+ m zum Zug$/,
    )
  })

  it('zeigt den Standort am Ankunftsbahnsteig', () => {
    zeige(MITTE, 0)
    expect(screen.getByText('▲ Mitte')).toBeDefined()
    expect(screen.getByText('Anfang')).toBeDefined()
    expect(screen.getByText('Ende')).toBeDefined()
  })

  it('schreibt die Treppe als Anweisung an ihren Zugang, mit Meter', () => {
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-wechseltext')?.textContent).toBe('Treppe ↓ · 32 m')
  })

  it('zeigt die genommene Treppe als Symbol in der roten Scheibe', () => {
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-bild .schema-scheibe [data-symbol="treppe"]')).not.toBeNull()
  })

  it('nennt am Abfahrtsbahnsteig das Ziel dort, wo man ankommt', () => {
    const { container } = zeige(MITTE, MITTE.schritte.length - 1)
    expect(container.querySelector('.schema-wechseltext')?.textContent).toBe('Ziel · 31 m')
  })

  it('sagt beim Weg über den Kopf, dass es keinen Ebenenwechsel gibt', () => {
    const { container } = zeige(ENDE, 0)
    expect(container.querySelector('.schema-bandfuss')?.textContent).toMatch(
      /^Ohne Ebenenwechsel · \d+ m$/,
    )
    expect(container.querySelector('.schema-bild .schema-scheibe')).toBeNull()
  })

  it('zeichnet auf dem Band mit Ankunfts- und Abfahrtsgleis keinen Weg', () => {
    const { container } = zeige(ENDE, 0)
    expect(container.querySelector('path.schema-weg')).toBeNull()
    expect(container.querySelector('.schema-start')).not.toBeNull()
    expect(container.querySelector('.schema-ziel')).not.toBeNull()
  })

  it('zeichnet den Weg in der Unterführung als Linie', () => {
    const { container } = zeige(MITTE, besuchJeSchritt(MITTE.schritte).indexOf(1))
    expect(container.querySelector('path.schema-weg')).not.toBeNull()
  })

  it('trägt unter dem Bild weder Legende noch Fließtext', () => {
    // Der feste Bildbereich hat nur Platz für das Bild. Legende und
    // Vorbehalte füllten ihn mit Text, der bei jedem Schritt derselbe war.
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-legende')).toBeNull()
    expect(container.querySelector('.schema-hinweis')).toBeNull()
  })

  it('nennt den Bahnhof nicht mehr als Text, aber weiter im Bildnamen', () => {
    // Der Name war der Anfang des Fußtextes. Ohne ihn müsste ein
    // Screenreader raten, welches Haus das Bild zeigt - er steht im aria-label.
    const { container } = zeige(MITTE, 0)
    expect(container.textContent).not.toContain('Leipzig Hbf')
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Leipzig Hbf')
  })

  it('verankert das aktive Band unabhängig vom Schritt auf derselben Höhe', () => {
    const oben = (route: RouteErgebnis, position: number) => {
      const { container } = zeige(route, position)
      const stapel = container.querySelector<HTMLElement>('.schema-stapel')!
      const aktiv = container.querySelector<HTMLElement>('.schema-band.aktiv')!
      const index = [...container.querySelectorAll('.schema-band')].indexOf(aktiv)
      // jsdom rechnet kein Layout. Die Oberkante ergibt sich deshalb aus den
      // Massen: Verschiebung des Stapels plus die ruhigen Bänder darüber.
      return ANKER_H + versatzAus(stapel) + index * (RUHIG_H + WECHSEL_H)
    }
    const erster = oben(MITTE, 0)
    const mittlerer = oben(MITTE, besuchJeSchritt(MITTE.schritte).indexOf(1))
    const letzter = oben(MITTE, MITTE.schritte.length - 1)
    expect([mittlerer, letzter]).toEqual([erster, erster])
  })

  it('schneidet den Stapel am Bildrand ab, statt ihn zu stauchen', () => {
    // Die Nachbarebenen wandern aus dem Bild heraus. Ohne `overflow: hidden`
    // im Fenster stünden sie über dem Kopf und unter der Schritt-Box.
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-fenster .schema-stapel')).not.toBeNull()
  })
})

describe('Die Höhe des aktiven Bandes folgt der Bahnsteigdichte', () => {
  afterEach(() => vi.restoreAllMocks())

  const aktivH = (route: RouteErgebnis) => {
    const { container, unmount } = zeige(route, 0)
    const h = parseFloat(container.querySelector<HTMLElement>('.schema-band.aktiv')!.style.height)
    unmount()
    return h
  }

  it('gibt 17 Bahnsteigen mehr Höhe als zwei', () => {
    expect(aktivH(MUENCHEN)).toBeGreaterThan(aktivH(MITTE))
  })

  it('wächst nie über den Platz unter dem Anker hinaus', () => {
    // jsdom rechnet kein Layout – die Fensterhöhe wird gestellt.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    expect(aktivH(MUENCHEN)).toBeLessThanOrEqual(300 - ANKER_H)
  })

  it('schreibt keinen Gleisnamen über einen anderen', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(236)
    const { container } = zeige(MUENCHEN, 0)
    const ys = [...container.querySelectorAll('.schema-gleisname')].map((t) => Number(t.getAttribute('y'))).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(10)
  })
})

/** Die px-Zahl aus `transform: translateY(-56px)`. */
function versatzAus(stapel: HTMLElement): number {
  const treffer = /translateY\((-?[\d.]+)px\)/.exec(stapel.style.transform)
  expect(treffer).not.toBeNull()
  return Number(treffer![1])
}
