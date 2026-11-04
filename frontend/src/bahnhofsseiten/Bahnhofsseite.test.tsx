import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bahnhofsseite } from './Bahnhofsseite'
import { ABDECKUNG_SATZ, ohneLuecken } from './texte'
import type { Bahnhofsdaten, Gleispaar } from './typen'

/**
 * Reiter Zuege / S-Bahn / U-Bahn (Spec 6.2). Die Fixtures sind klein und
 * stehen hier, nicht in den erzeugten Dateien: Die tragen die neuen Felder
 * erst nach dem naechsten Lauf von `npm run bahnhofsseiten`.
 */
const paar = (von: string, nach: string, sek = 100): Gleispaar => ({
  von,
  nach,
  gleicherBahnsteig: false,
  sek,
  wechsel: 1,
  anlagen: ['treppe'],
  lage: 'unterfuehrung',
  stufenfreiSek: sek + 60,
})

const GRUND: Bahnhofsdaten = {
  name: 'Beispielstadt Hbf',
  eva: '8000001',
  slug: 'beispielstadt-hbf',
  lat: 48,
  lon: 11,
  stufe: 1,
  geholtAm: '2026-11-01T10:00:00.000Z',
  gleise: ['1', '2', '101'],
  paare: [
    paar('1', '2'), paar('1', '101'),
    paar('2', '1'), paar('2', '101'),
    paar('101', '1'), paar('101', '2'),
  ],
}

const MIT_ARTEN: Bahnhofsdaten = {
  ...GRUND,
  gleisArt: { '1': 'zug', '2': 'zug', '101': 'sbahn' },
  ubahn: [{ id: 'u1', label: 'U4 U5', paare: [paar('U4 U5', '1', 200), paar('U4 U5', '2', 210), paar('U4 U5', '101', 220)] }],
}

const seite = (d: Bahnhofsdaten) =>
  new DOMParser().parseFromString(renderToStaticMarkup(<Bahnhofsseite d={d} nachbarn={[]} />), 'text/html')

const tabs = (doc: Document) => [...doc.querySelectorAll('[role="tab"]')]

describe('Bahnhofsseite: Reiter', () => {
  it('drei Reiter, Züge aktiv', () => {
    const doc = seite(MIT_ARTEN)
    expect(tabs(doc).map((t) => t.textContent)).toEqual(['Züge', 'S-Bahn', 'U-Bahn'])
    expect(tabs(doc).map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    const felder = [...doc.querySelectorAll('[role="tabpanel"]')]
    expect(felder.map((f) => f.hasAttribute('hidden'))).toEqual([false, true, true])
  })

  it('jeder Reiter verweist auf sein Feld und das Feld zurueck', () => {
    const doc = seite(MIT_ARTEN)
    for (const t of tabs(doc)) {
      const feld = doc.getElementById(t.getAttribute('aria-controls')!)
      expect(feld?.getAttribute('role')).toBe('tabpanel')
      expect(feld?.getAttribute('aria-labelledby')).toBe(t.id)
    }
  })

  it('nur Züge: keine Reiterleiste, Blöcke wie bisher', () => {
    const doc = seite(GRUND)
    expect(doc.querySelector('[role="tablist"]')).toBeNull()
    expect(doc.querySelector('[role="tabpanel"]')).toBeNull()
    expect([...doc.querySelectorAll('.bs-gleis summary')].map((s) => s.textContent)).toEqual([
      'Ankunft Gleis 1',
      'Ankunft Gleis 2',
      'Ankunft Gleis 101',
    ])
  })

  it('gleisArt ohne S-Bahn und ohne U-Bahn: ebenfalls keine Leiste', () => {
    const doc = seite({ ...GRUND, gleisArt: { '1': 'zug', '2': 'zug', '101': 'zug' }, ubahn: [] })
    expect(doc.querySelector('[role="tablist"]')).toBeNull()
  })

  it('Ankunftsgleise nach Art, Zeilen zu allen Gleisen; fehlender Eintrag zählt als Zug', () => {
    const doc = seite({ ...MIT_ARTEN, gleisArt: { '2': 'zug', '101': 'sbahn' }, ubahn: undefined })
    const [zuege, sbahn] = [...doc.querySelectorAll('[role="tabpanel"]')]
    expect([...zuege.querySelectorAll('summary')].map((s) => s.textContent)).toEqual(['Ankunft Gleis 1', 'Ankunft Gleis 2'])
    expect([...sbahn.querySelectorAll('summary')].map((s) => s.textContent)).toEqual(['Ankunft Gleis 101'])
    const zeilen = [...sbahn.querySelectorAll('tbody th')].map((t) => t.textContent)
    expect(zeilen).toEqual(['Gleis 1', 'Gleis 2'])
    expect([...zuege.querySelectorAll('details')[0].querySelectorAll('tbody th')].map((t) => t.textContent)).toEqual([
      'Gleis 2',
      'Gleis 101',
    ])
  })

  it('nur S-Bahn und Züge: zwei Reiter', () => {
    const doc = seite({ ...MIT_ARTEN, ubahn: undefined })
    expect(tabs(doc).map((t) => t.textContent)).toEqual(['Züge', 'S-Bahn'])
  })

  it('U-Bahn-Inhalt steht im HTML, auch wenn der Reiter nicht aktiv ist', () => {
    const html = renderToStaticMarkup(<Bahnhofsseite d={MIT_ARTEN} nachbarn={[]} />)
    expect(html).toContain('U-Bahn U4 U5')
    const doc = seite(MIT_ARTEN)
    const ubahn = doc.querySelectorAll('[role="tabpanel"]')[2]
    expect(ubahn.hasAttribute('hidden')).toBe(true)
    expect([...ubahn.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Abfahrt', 'Gehzeit', 'Weg', 'Stufenfrei'])
    expect([...ubahn.querySelectorAll('tbody th')].map((t) => t.textContent)).toEqual(['Gleis 1', 'Gleis 2', 'Gleis 101'])
  })

  it('Satz zur Auswahl steht auf jeder Seite', () => {
    expect(ABDECKUNG_SATZ).toBe(
      'Vorab berechnet sind die Bahnhöfe der DB-Preisklassen 1 bis 3. Für jeden anderen Bahnhof rechnet die App den Weg live.',
    )
    for (const d of [GRUND, MIT_ARTEN]) expect(seite(d).body.textContent).toContain(ABDECKUNG_SATZ)
  })
})

describe('ohneLuecken: U-Bahn', () => {
  it('entfernt U-Bahn-Wege ohne Weg und Steige ohne verbleibenden Weg', () => {
    const d = ohneLuecken({
      ...MIT_ARTEN,
      ubahn: [
        { id: 'u1', label: 'U4 U5', paare: [paar('U4 U5', '1'), { ...paar('U4 U5', '2'), sek: null }] },
        { id: 'u2', label: 'U9', paare: [{ ...paar('U9', '1'), sek: null }] },
      ],
    })!
    expect(d.ubahn?.map((s) => [s.label, s.paare.map((p) => p.nach)])).toEqual([['U4 U5', ['1']]])
  })

  it('laesst Daten ohne U-Bahn unveraendert', () => {
    expect('ubahn' in ohneLuecken(GRUND)!).toBe(false)
  })
})

describe('reiter.js', () => {
  const code = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'reiter.js'), 'utf8')

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function lade() {
    document.body.innerHTML = renderToStaticMarkup(<Bahnhofsseite d={MIT_ARTEN} nachbarn={[]} />)
    new Function(code)()
    return [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
  }

  const zustand = () =>
    [...document.querySelectorAll('[role="tabpanel"]')].map((f) => !f.hasAttribute('hidden'))

  it('Klick zeigt das Feld und verbirgt die anderen', () => {
    const [, sbahn] = lade()
    sbahn.click()
    expect(zustand()).toEqual([false, true, false])
    expect(sbahn.getAttribute('aria-selected')).toBe('true')
    expect(sbahn.tabIndex).toBe(0)
  })

  it('Pfeiltasten wechseln zwischen den Reitern, rund herum; Pos1/Ende springen', () => {
    const [zuege, sbahn, ubahn] = lade()
    zuege.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(zustand()).toEqual([false, true, false])
    expect(document.activeElement).toBe(sbahn)
    zuege.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(document.activeElement).toBe(ubahn)
    expect(zustand()).toEqual([false, false, true])
    ubahn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(zuege)
    zuege.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(ubahn)
  })
})
