import { describe, expect, it } from 'vitest'
import { ohneGenutzte, orteAuf, orteImGrundriss, schildBreite, setzeSymbole, SYMBOL_PX, symboleAm } from './symbole'

describe('Welches Symbol an einem Ort steht', () => {
  it('Treppe und Rolltreppe am selben Ort: nur die Rolltreppe', () => {
    expect(symboleAm(['treppe', 'rolltreppe'])).toEqual(['rolltreppe'])
  })

  it('Rolltreppe und Aufzug: beide Symbole', () => {
    expect(symboleAm(['aufzug', 'rolltreppe'])).toEqual(['rolltreppe', 'aufzug'])
  })

  it('Treppe und Aufzug: beide Symbole', () => {
    expect(symboleAm(['treppe', 'aufzug'])).toEqual(['treppe', 'aufzug'])
  })

  it('alle drei: Rolltreppe und Aufzug', () => {
    expect(symboleAm(['treppe', 'aufzug', 'rolltreppe'])).toEqual(['rolltreppe', 'aufzug'])
  })
})

describe('Was ein Ort ist', () => {
  it('fasst Anlagen zusammen, die im Bild höchstens 10 px auseinanderliegen', () => {
    const orte = orteAuf([
      { x: 100, typ: 'treppe' },
      { x: 106, typ: 'rolltreppe' },
      { x: 130, typ: 'aufzug' },
    ])
    expect(orte).toHaveLength(2)
    expect([...orte[0].typen].sort()).toEqual(['rolltreppe', 'treppe'])
    expect(orte[0].x).toBe(103)
    expect([...orte[1].typen]).toEqual(['aufzug'])
  })

  it('kennt keine Rampe und keinen ebenen Weg als Anlage', () => {
    expect(orteAuf([{ x: 10, typ: 'rampe' }, { x: 40, typ: 'eben' }])).toEqual([])
  })
})

describe('Die rote Scheibe zeigt die genommene Anlage selbst', () => {
  it('nimmt dem Ort Treppe und Rolltreppe ab, der Aufzug bleibt daneben', () => {
    const orte = orteAuf([
      { x: 98, typ: 'rolltreppe' },
      { x: 100, typ: 'treppe' },
      { x: 102, typ: 'aufzug' },
    ])
    const rest = ohneGenutzte(orte, [{ x: 100, typ: 'treppe' }])
    expect(rest.map((o) => Array.from(o.typen))).toEqual([['aufzug']])
  })

  it('nimmt beim Aufzug nur den Aufzug', () => {
    const orte = orteAuf([{ x: 50, typ: 'rolltreppe' }, { x: 52, typ: 'aufzug' }])
    expect(ohneGenutzte(orte, [{ x: 51, typ: 'aufzug' }]).map((o) => Array.from(o.typen))).toEqual([['rolltreppe']])
  })

  it('lässt Orte weiter als 12 px vom Punkt unberührt', () => {
    const orte = orteAuf([{ x: 50, typ: 'treppe' }])
    expect(ohneGenutzte(orte, [{ x: 70, typ: 'treppe' }]).map((o) => Array.from(o.typen))).toEqual([['treppe']])
  })
})

describe('Orte im Grundriss einer Übergangsebene', () => {
  const kasten = (o: { x: number; y: number; symbole: unknown[] }) => {
    const w = schildBreite(o.symbole.length)
    return { x1: o.x - w / 2, x2: o.x + w / 2, y1: o.y - 7.5, y2: o.y + 7.5 }
  }

  it('fasst Anlagen zusammen, deren Schilder sich überdecken würden', () => {
    // 846 Schilderpaare überdeckten sich in der Simulation vom 14.09.2026.
    const orte = orteImGrundriss(
      [
        { x: 100, y: 100, typ: 'rolltreppe' },
        { x: 100, y: 100, typ: 'aufzug' },
        { x: 118, y: 104, typ: 'treppe' },
      ],
      [],
    )
    expect(orte).toHaveLength(1)
    expect(orte[0].symbole).toEqual(['rolltreppe', 'aufzug'])
  })

  it('lässt keine zwei Schilder übereinander liegen', () => {
    const typen = ['treppe', 'rolltreppe', 'aufzug'] as const
    const anlagen = []
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 4; k++) anlagen.push({ x: 50 + i * 9, y: 50 + k * 11, typ: typen[(i + k) % 3] })
    }
    const kaesten = orteImGrundriss(anlagen, []).map(kasten)
    for (let i = 0; i < kaesten.length; i++) {
      for (let k = i + 1; k < kaesten.length; k++) {
        const a = kaesten[i]
        const b = kaesten[k]
        expect(a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2).toBe(false)
      }
    }
  })

  it('lässt den Platz um eine rote Scheibe frei – sie IST die Anlage', () => {
    expect(orteImGrundriss([{ x: 50, y: 50, typ: 'treppe' }], [{ x: 56, y: 50 }])).toEqual([])
  })

  it('kennt keine Rampe als Symbol', () => {
    expect(orteImGrundriss([{ x: 50, y: 50, typ: 'rampe' }], [])).toEqual([])
  })
})

describe('Setzen auf dem Balken', () => {
  const abstandOk = (xs: number[], mindest: number) => {
    const s = [...xs].sort((a, b) => a - b)
    for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(mindest - 0.001)
  }

  it('lässt ein freies Symbol an seinem Ort stehen', () => {
    const gesetzt = setzeSymbole(orteAuf([{ x: 120, typ: 'treppe' }]), [], 40, 300)
    expect(gesetzt).toEqual([{ x: 120, typ: 'treppe' }])
  })

  it('stellt die Symbole eines Orts nebeneinander, mittig um den Ort', () => {
    const gesetzt = setzeSymbole(orteAuf([{ x: 120, typ: 'rolltreppe' }, { x: 121, typ: 'aufzug' }]), [], 40, 300)
    expect(gesetzt.map((s) => s.typ)).toEqual(['rolltreppe', 'aufzug'])
    expect((gesetzt[0].x + gesetzt[1].x) / 2).toBeCloseTo(120.5, 5)
    abstandOk(gesetzt.map((s) => s.x), SYMBOL_PX)
  })

  it('schiebt zu dichte Orte auseinander – nie übereinander', () => {
    const orte = orteAuf([
      { x: 88, typ: 'rolltreppe' },
      { x: 90, typ: 'aufzug' },
      { x: 104, typ: 'treppe' },
      { x: 106, typ: 'aufzug' },
    ])
    const gesetzt = setzeSymbole(orte, [], 40, 300)
    expect(gesetzt).toHaveLength(4)
    abstandOk(gesetzt.map((s) => s.x), SYMBOL_PX)
  })

  it('bleibt innerhalb des Balkens', () => {
    const orte = orteAuf([{ x: 298, typ: 'rolltreppe' }, { x: 299, typ: 'aufzug' }, { x: 41, typ: 'treppe' }])
    for (const s of setzeSymbole(orte, [], 40, 300)) {
      expect(s.x - SYMBOL_PX / 2).toBeGreaterThanOrEqual(40)
      expect(s.x + SYMBOL_PX / 2).toBeLessThanOrEqual(300)
    }
  })

  it('legt auf einem kurzen Balken benachbarte Orte zusammen, statt über das Ende zu ragen', () => {
    // Gefunden von der Simulation am 14.09.2026: 191 Symbole ragten über
    // ihren Balken, 28 davon aus dem Bild.
    const orte = orteAuf([{ x: 45, typ: 'treppe' }, { x: 57, typ: 'aufzug' }, { x: 69, typ: 'rolltreppe' }])
    const gesetzt = setzeSymbole(orte, [], 40, 70)
    expect(gesetzt.length).toBeGreaterThan(0)
    for (const s of gesetzt) {
      expect(s.x - SYMBOL_PX / 2).toBeGreaterThanOrEqual(40 - 0.001)
      expect(s.x + SYMBOL_PX / 2).toBeLessThanOrEqual(70 + 0.001)
    }
    abstandOk(gesetzt.map((s) => s.x), SYMBOL_PX)
  })

  it('stellt nie ein Symbol auf einen Punkt – auch wenn zwischen zwei Punkten kein Platz ist', () => {
    // 304 Mal in der Simulation: Das Symbol wurde nach rechts geschoben,
    // bis es auf dem nächsten Punkt stand.
    const punkte = [{ x: 100, breite: 15 }, { x: 122, breite: 19 }]
    const gesetzt = setzeSymbole(orteAuf([{ x: 111, typ: 'treppe' }, { x: 112, typ: 'aufzug' }]), punkte, 40, 300)
    expect(gesetzt.length).toBeGreaterThan(0)
    for (const s of gesetzt) {
      for (const p of punkte) expect(Math.abs(s.x - p.x)).toBeGreaterThanOrEqual(p.breite / 2 + SYMBOL_PX / 2)
    }
    abstandOk(gesetzt.map((s) => s.x), SYMBOL_PX)
  })

  it('lässt auf einem Balken, der kürzer ist als ein Symbol, keines stehen', () => {
    expect(setzeSymbole(orteAuf([{ x: 50, typ: 'treppe' }]), [], 45, 53)).toEqual([])
  })

  it('weicht einem Punkt aus, der auf dem Balken steht', () => {
    const punkt = { x: 120, breite: 15 }
    const gesetzt = setzeSymbole(orteAuf([{ x: 122, typ: 'treppe' }]), [punkt], 40, 300)
    expect(Math.abs(gesetzt[0].x - punkt.x)).toBeGreaterThanOrEqual(punkt.breite / 2 + SYMBOL_PX / 2)
  })
})
