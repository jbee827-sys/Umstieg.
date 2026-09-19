import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Schrittsheet } from './Schrittsheet'
import type { Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Nach Ausstieg 30 m geradeaus', typ: 'start' },
  { text: 'Treppe hoch zur Halle', typ: 'treppe' },
  { text: 'Rechts zu Gleis 14', typ: 'ziel' },
]

/** Die drei Rückrufe sind in jedem Test nötig; nur die Position wechselt. */
function zeige(position: number, rueckrufe: Partial<Parameters<typeof Schrittsheet>[0]> = {}) {
  return render(
    <Schrittsheet
      schritte={schritte}
      position={position}
      onZurueck={() => {}}
      onWeiter={() => {}}
      onAngekommen={() => {}}
      {...rueckrufe}
    />,
  )
}

describe('Schrittsheet', () => {
  it('hebt genau einen Schritt hervor', () => {
    // Die uebrigen Schritte stehen im zugeklappten <details> - im DOM, aber
    // nicht sichtbar. Geprueft wird deshalb der hervorgehobene Text.
    const { container } = zeige(1)
    const hervorgehoben = container.querySelector('.schrittsheet-text')
    expect(hervorgehoben?.textContent).toBe('Treppe hoch zur Halle')
  })

  it('haelt die uebrigen Schritte eingeklappt', () => {
    const { container } = zeige(1)
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('nennt Position und Gesamtzahl', () => {
    zeige(1)
    expect(screen.getByText(/Schritt 2 von 3/)).toBeDefined()
  })

  it('meldet Weiter und Zurueck', async () => {
    const onWeiter = vi.fn()
    const onZurueck = vi.fn()
    zeige(1, { onWeiter, onZurueck })
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }))
    await userEvent.click(screen.getByRole('button', { name: /Zurück/ }))
    expect(onWeiter).toHaveBeenCalled()
    expect(onZurueck).toHaveBeenCalled()
  })

  it('sperrt Zurueck am Anfang', () => {
    zeige(0)
    expect(screen.getByRole('button', { name: /Zurück/ }).hasAttribute('disabled')).toBe(true)
  })

  it('zeigt neben einem Schritt über eine Treppe ihr Symbol', () => {
    const { container } = zeige(1)
    expect(container.querySelector('.schrittsheet-text [data-symbol="treppe"]')).not.toBeNull()
  })

  it('zeigt bei einem ebenen Schritt kein Symbol', () => {
    const { container } = zeige(0)
    expect(container.querySelector('.schrittsheet-text [data-symbol]')).toBeNull()
  })

  it('trägt das Symbol auch in „Alle Schritte" – genau am Treppenschritt', () => {
    const { container } = zeige(0)
    const zeilen = [...container.querySelectorAll('.schrittliste .schritt')]
    expect(zeilen.map((z) => z.querySelector('[data-symbol]')?.getAttribute('data-symbol') ?? null)).toEqual([
      null,
      'treppe',
      null,
    ])
  })

  it('macht die volle Liste aufklappbar erreichbar', async () => {
    zeige(0)
    await userEvent.click(screen.getByText(/Alle Schritte/))
    expect(screen.getByText(/Rechts zu Gleis 14/)).toBeDefined()
  })

  it('haengt Nebeninhalte unter die volle Liste', () => {
    // Karte und Streckenhinweise gehoeren nicht in den festen Bildbereich,
    // verschwinden aber auch nicht: Sie stehen im Aufklapper.
    const { container } = zeige(0, { zusatz: <p className="probe">Aufzug außer Betrieb</p> })
    expect(container.querySelector('.schrittsheet-liste .probe')).not.toBeNull()
  })
})

describe('Schrittsheet: der letzte Schritt', () => {
  it('ersetzt Weiter beim letzten Schritt durch Angekommen', () => {
    // Ein ausgegrautes „Weiter" sagt nur, dass es nicht weitergeht. Am Ziel
    // ist die naechste Handlung aber bekannt - sie gehoert auf den Knopf.
    zeige(2)
    expect(screen.queryByRole('button', { name: /Weiter/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Angekommen$/ })).toBeDefined()
  })

  it('bietet Angekommen vor dem letzten Schritt nicht an', () => {
    zeige(1)
    expect(screen.queryByRole('button', { name: /^Angekommen$/ })).toBeNull()
  })

  it('meldet Angekommen', async () => {
    const onAngekommen = vi.fn()
    zeige(2, { onAngekommen })
    await userEvent.click(screen.getByRole('button', { name: /^Angekommen$/ }))
    expect(onAngekommen).toHaveBeenCalled()
  })

  it('stellt Angekommen neben Zurueck und gibt ihm die gruene Klasse', () => {
    // Die runde Form und das Gruen sind CSS. Der Test haelt nur fest, dass
    // der Knopf die Klasse traegt, an der beides haengt.
    const { container } = zeige(2)
    const knoepfe = [...container.querySelectorAll('.schrittsheet-knoepfe > button')]
    expect(knoepfe.map((k) => k.textContent)).toEqual(['Zurück', 'Angekommen'])
    expect(knoepfe[1].className).toContain('knopf-angekommen')
  })
})
