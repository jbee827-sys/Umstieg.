import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RouteErgebnis } from '../api/typen'
import { Ebenenschema } from './Ebenenschema'
import { baueBandmodell } from '../schema/bandmodell'
import { leiteSchemaAb } from '../schema/ableitung'
import leipzigMitte from '../schema/testdaten/leipzig-6-16-mitte.json'
import leipzigEnde from '../schema/testdaten/leipzig-6-16-ende.json'

const MITTE = leipzigMitte as unknown as RouteErgebnis
const ENDE = leipzigEnde as unknown as RouteErgebnis

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

  it('schreibt die Treppe als Anweisung an die Stelle, an der man sie findet', () => {
    const { container } = zeige(MITTE, 0)
    expect(container.querySelector('.schema-wechseltext')?.textContent).toBe('Treppe ↓')
  })

  it('sagt beim Weg über den Kopf, dass es keinen Ebenenwechsel gibt', () => {
    const { container } = zeige(ENDE, 0)
    expect(container.querySelector('.schema-bandfuss')?.textContent).toMatch(
      /^Ohne Ebenenwechsel · \d+ m$/,
    )
    expect(container.querySelector('.schema-wechseltext')).toBeNull()
  })

  it('zeichnet den Weg auch auf der Gleisebene', () => {
    const { container } = zeige(ENDE, 0)
    expect(container.querySelector('path.schema-weg')).not.toBeNull()
  })
})
