import { describe, it, expect, vi } from 'vitest'
import { ANGEBOTENE, ersteVariante, ladeVarianten } from './varianten'
import type { RouteErgebnis, RouteParameter } from './typen'

const basis = {
  eva: '8011160', gleisAn: '6', gleisAb: '14', profil: 'normal' as const,
}
function route(sek: number): RouteErgebnis {
  return { stufe: 1, schritte: [], gehzeitSek: sek, hinweise: [] }
}

/**
 * Regression: Beide Varianten gleichzeitig zu holen liess bei kaltem
 * Graph-Cache ZWEI Anfragen fuer denselben Bahnhof laufen. Beide bauten den
 * Graphen unabhaengig und fragten Overpass doppelt. Am 31.08.2026 gemessen:
 * 24 s und 61 s statt 2 s - die App wirkte eingefroren.
 *
 * Deshalb: erst die gewaehlte Variante, Dashboard zeigen, danach die zweite.
 * Die zweite trifft dann den warmen Cache.
 */
describe('ladeVarianten', () => {
  it('holt die gewaehlte Variante ZUERST und allein', async () => {
    const reihenfolge: string[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      reihenfolge.push(`start:${p.variante}`)
      await new Promise((f) => setTimeout(f, 5))
      reihenfolge.push(`fertig:${p.variante}`)
      return route(p.variante === 'barrierefrei' ? 540 : 300)
    })
    const beiHaupt = vi.fn()
    await ladeVarianten(basis, 'schnellste', hole, beiHaupt, vi.fn())

    // Entscheidend: die zweite Anfrage startet erst, wenn die erste FERTIG ist.
    expect(reihenfolge).toEqual([
      'start:schnellste',
      'fertig:schnellste',
      'start:barrierefrei',
      'fertig:barrierefrei',
      'start:mit-stopp',
      'fertig:mit-stopp',
    ])
    expect(beiHaupt).toHaveBeenCalledWith(route(300))
  })

  it('meldet die Hauptroute, bevor die weiteren Varianten laufen', async () => {
    const zustand: string[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      zustand.push(`anfrage:${p.variante}`)
      return route(300)
    })
    await ladeVarianten(basis, 'schnellste', hole, () => zustand.push('dashboard'), vi.fn())
    expect(zustand).toEqual([
      'anfrage:schnellste',
      'dashboard',
      'anfrage:barrierefrei',
      'anfrage:mit-stopp',
    ])
  })

  it('meldet die Gehzeit der zweiten Variante nach', async () => {
    const beiZweit = vi.fn()
    const hole = vi.fn(async (p: RouteParameter) =>
      route(p.variante === 'barrierefrei' ? 540 : 300),
    )
    await ladeVarianten(basis, 'schnellste', hole, vi.fn(), beiZweit)
    expect(beiZweit).toHaveBeenCalledWith('barrierefrei', 540)
  })

  it('wirft, wenn die gewaehlte Variante fehlschlaegt', async () => {
    const hole = vi.fn(async () => {
      throw new Error('404')
    })
    await expect(ladeVarianten(basis, 'schnellste', hole, vi.fn(), vi.fn())).rejects.toThrow()
  })

  it('ein Fehlschlag einer Nebenvariante bleibt folgenlos', async () => {
    // Und er nimmt die uebrigen nicht mit: 'barrierefrei' faellt aus,
    // 'mit-stopp' wird trotzdem noch geholt.
    const beiHaupt = vi.fn()
    const beiZweit = vi.fn()
    const hole = vi.fn(async (p: RouteParameter) => {
      if (p.variante === 'barrierefrei') throw new Error('keine barrierefreie Route')
      return route(300)
    })
    await ladeVarianten(basis, 'schnellste', hole, beiHaupt, beiZweit)
    expect(beiHaupt).toHaveBeenCalled()
    expect(beiZweit).not.toHaveBeenCalledWith('barrierefrei', expect.anything())
    expect(beiZweit).toHaveBeenCalledWith('mit-stopp', 300)
  })

  it('kehrt die Reihenfolge um, wenn barrierefrei gewaehlt ist', async () => {
    const reihenfolge: string[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      reihenfolge.push(p.variante)
      return route(300)
    })
    await ladeVarianten(basis, 'barrierefrei', hole, vi.fn(), vi.fn())
    expect(reihenfolge).toEqual(['barrierefrei', 'schnellste', 'mit-stopp'])
  })
})

/**
 * Regression (Mobilabnahme 07.09.2026): "Mit Stopp: WC & Kiosk" liess sich
 * nicht auswaehlen. In `App.tsx` stand die Wahl als Aufzaehlung neben der
 * angebotenen Liste:
 *
 *     eingabe.variante === 'barrierefrei' ? 'barrierefrei' : 'schnellste'
 *
 * Geschrieben am 31.08.2026, als es genau diese zwei Varianten gab. Am
 * 05.09. kam 'mit-stopp' dazu (ToDo 9c) - die Zeile wurde nie nachgezogen
 * und verwarf die Wahl still: getippt wurde 'mit-stopp', geladen wurde
 * 'schnellste', der Punkt sprang zurueck. Nichts sagte etwas.
 *
 * Die Liste der angebotenen Varianten steht seither an EINER Stelle.
 */
describe('ersteVariante', () => {
  it('laesst jede angebotene Variante durch - auch mit-stopp', () => {
    for (const v of ANGEBOTENE) expect(ersteVariante(v)).toBe(v)
  })

  it('faengt ab, was die Oberflaeche gar nicht anbietet', () => {
    // 'einfachste' steht im Typ, hat aber keinen Knopf. Ohne Rueckfall ginge
    // eine Anfrage raus, die kein Bildschirm je ausloesen kann.
    expect(ersteVariante('einfachste')).toBe('schnellste')
  })
})
