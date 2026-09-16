import { describe, it, expect, vi } from 'vitest'
import {
  ABSCHNITTE,
  ankunftsRichtung,
  gehzeitSchluessel,
  ladeStandorte,
  STANDORT_VOREINSTELLUNG,
  standortNamen,
} from './standorte'
import type { BahnhofSchema, RouteErgebnis, RouteParameter } from './typen'

const basis = {
  eva: '8010205', gleisAn: '6', gleisAb: '16', profil: 'normal' as const,
}
function route(sek: number): RouteErgebnis {
  return { stufe: 1, schritte: [], gehzeitSek: sek, hinweise: [] }
}

/**
 * Gemessen an Leipzig Hbf, Gleis 6 nach 16 (README, 13.09.2026): Anfang 343 s
 * durch die Unterfuehrung, Mitte 354 s und Ende 251 s ueber den Bahnhofskopf.
 */
const LEIPZIG: Record<string, number> = { anfang: 343, mitte: 354, ende: 251 }

describe('Standorte am Ankunftsgleis', () => {
  it('kennt drei Stellen in der Reihenfolge des Bahnsteigs', () => {
    expect(ABSCHNITTE).toEqual(['anfang', 'mitte', 'ende'])
  })

  it('nimmt ohne Wahl die Mitte an - wie das Backend', () => {
    expect(STANDORT_VOREINSTELLUNG).toBe('mitte')
  })

  /**
   * Der Schluessel traegt BEIDE Achsen. Truege er nur die Variante, stuenden
   * nach einem Standortwechsel die alten Minuten an den neuen Knoepfen.
   */
  it('schluesselt nach Variante UND Standort', () => {
    expect(gehzeitSchluessel('schnellste', 'anfang')).not.toBe(
      gehzeitSchluessel('schnellste', 'ende'),
    )
    expect(gehzeitSchluessel('schnellste', 'anfang')).not.toBe(
      gehzeitSchluessel('barrierefrei', 'anfang'),
    )
  })
})

/**
 * Was „Anfang" heisst (ToDo 31, 15.09.2026): das Nord- bzw. Westende. Der
 * Knopf nennt es, statt ein Wort zu zeigen, das im Bahnhof nichts bedeutet.
 */
describe('standortNamen', () => {
  it('nennt die Enden nach der Himmelsrichtung', () => {
    expect(standortNamen({ von: 'N', bis: 'S' })).toEqual({
      anfang: 'Nordende',
      mitte: 'Mitte',
      ende: 'Südende',
    })
    expect(standortNamen({ von: 'W', bis: 'O' })).toEqual({
      anfang: 'Westende',
      mitte: 'Mitte',
      ende: 'Ostende',
    })
  })

  it('bleibt ohne gemessene Achse bei Anfang und Ende – lieber vage als erfunden', () => {
    expect(standortNamen(undefined)).toEqual({ anfang: 'Anfang', mitte: 'Mitte', ende: 'Ende' })
  })
})

describe('ankunftsRichtung', () => {
  const schema = {
    ebenen: [
      { level: 1, bahnsteige: [{ bahnsteigId: 'a', gleise: ['9'] }] },
      {
        level: 0,
        bahnsteige: [
          { bahnsteigId: 'b', gleise: ['5'], rolle: 'ziel', himmelsrichtung: { von: 'N', bis: 'S' } },
          { bahnsteigId: 'c', gleise: ['6'], rolle: 'start', himmelsrichtung: { von: 'W', bis: 'O' } },
        ],
      },
    ],
    anlagen: [],
    pois: [],
    wechsel: [],
    vorbehalte: [],
  } as unknown as BahnhofSchema

  it('liest die Richtung am Ankunftsbahnsteig, nicht am Ziel', () => {
    expect(ankunftsRichtung(schema)).toEqual({ von: 'W', bis: 'O' })
  })

  it('schweigt ohne Schema', () => {
    expect(ankunftsRichtung(undefined)).toBeUndefined()
  })
})

describe('ladeStandorte', () => {
  it('holt die uebrigen zwei Stellen, nicht die gewaehlte', async () => {
    const gefragt: (string | undefined)[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      gefragt.push(p.abschnitt)
      return route(LEIPZIG[p.abschnitt ?? 'mitte'])
    })
    const beiWert = vi.fn()
    await ladeStandorte(basis, 'schnellste', 'mitte', hole, beiWert)

    expect(gefragt).toEqual(['anfang', 'ende'])
    expect(beiWert).toHaveBeenCalledWith('anfang', 343)
    expect(beiWert).toHaveBeenCalledWith('ende', 251)
  })

  // Derselbe Grund wie bei den Varianten: Zwei gleichzeitige Anfragen fuer
  // denselben Bahnhof warten beide auf denselben Graphbau.
  it('holt sie NACHEINANDER', async () => {
    const reihenfolge: string[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      reihenfolge.push(`start:${p.abschnitt}`)
      await new Promise((f) => setTimeout(f, 5))
      reihenfolge.push(`fertig:${p.abschnitt}`)
      return route(300)
    })
    await ladeStandorte(basis, 'schnellste', 'mitte', hole, vi.fn())
    expect(reihenfolge).toEqual(['start:anfang', 'fertig:anfang', 'start:ende', 'fertig:ende'])
  })

  it('reicht die gewaehlte Variante durch', async () => {
    const hole = vi.fn(async () => route(300))
    await ladeStandorte(basis, 'barrierefrei', 'mitte', hole, vi.fn())
    for (const aufruf of hole.mock.calls as unknown as [RouteParameter][]) {
      expect(aufruf[0].variante).toBe('barrierefrei')
    }
  })

  it('ueberspringt, was schon im Speicher liegt', async () => {
    const gefragt: (string | undefined)[] = []
    const hole = vi.fn(async (p: RouteParameter) => {
      gefragt.push(p.abschnitt)
      return route(300)
    })
    await ladeStandorte(basis, 'schnellste', 'mitte', hole, vi.fn(), (a) => a === 'anfang')
    expect(gefragt).toEqual(['ende'])
  })

  it('ein Fehlschlag bleibt folgenlos und nimmt den naechsten nicht mit', async () => {
    const beiWert = vi.fn()
    const hole = vi.fn(async (p: RouteParameter) => {
      if (p.abschnitt === 'anfang') throw new Error('404')
      return route(251)
    })
    await expect(
      ladeStandorte(basis, 'schnellste', 'mitte', hole, beiWert),
    ).resolves.toBeUndefined()
    expect(beiWert).toHaveBeenCalledTimes(1)
    expect(beiWert).toHaveBeenCalledWith('ende', 251)
  })
})
