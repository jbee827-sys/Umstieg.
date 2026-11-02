import { describe, expect, it } from 'vitest'
import type { Bahnhofsdaten, Gleispaar } from './typen'
import {
  bahnsteige,
  dauerSatz,
  gleiseSatz,
  naechsteBahnhoefe,
  stufenfreiSatz,
  ueberblickSaetze,
} from './ueberblick'

/**
 * Eigener Text je Bahnhof (26.10.2026): 310 von 377 Bahnhofsseiten standen
 * in der Search Console auf „Gefunden – zurzeit nicht indexiert“, weil sie
 * bis auf die Zahlen gleich waren. Die Saetze entstehen allein aus den
 * Daten des Bahnhofsplans - keine Behauptung, die der Plan nicht traegt.
 */
const paar = (von: string, nach: string, p: Partial<Gleispaar> = {}): Gleispaar => ({
  von,
  nach,
  gleicherBahnsteig: false,
  sek: 120,
  wechsel: 2,
  anlagen: ['treppe'],
  lage: 'unterfuehrung',
  stufenfreiSek: 200,
  ...p,
})

/** Beide Richtungen eines Gleispaars. */
const hinUndZurueck = (a: string, b: string, p: Partial<Gleispaar> = {}): Gleispaar[] => [
  paar(a, b, p),
  paar(b, a, p),
]

const gleicherBs = { gleicherBahnsteig: true, sek: 15, wechsel: 0, anlagen: [], lage: 'ebenerdig' as const, stufenfreiSek: 15 }

const ort = { eva: '1', lat: 48.476475, lon: 7.946723, stufe: 1 as const, geholtAm: '2026-10-14T12:31:58.847Z' }

// Offenburg im Kleinen: 1/2 und 3/4 je an einem Bahnsteig, 5 allein.
const OFFENBURG: Bahnhofsdaten = {
  ...ort,
  name: 'Offenburg',
  slug: 'offenburg',
  gleise: ['1', '2', '3', '4', '5'],
  paare: [
    ...hinUndZurueck('1', '2', gleicherBs),
    ...hinUndZurueck('3', '4', gleicherBs),
    ...hinUndZurueck('1', '3', { sek: 100, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 100 }),
    ...hinUndZurueck('1', '4', { sek: 110, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 110 }),
    ...hinUndZurueck('2', '3', { sek: 100, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 100 }),
    ...hinUndZurueck('2', '4', { sek: 110, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 110 }),
    ...hinUndZurueck('1', '5', { sek: 290, anlagen: ['treppe', 'rampe'], stufenfreiSek: 400 }),
    ...hinUndZurueck('2', '5', { sek: 280, anlagen: ['treppe'], stufenfreiSek: 390 }),
    ...hinUndZurueck('3', '5', { sek: 200, anlagen: ['treppe'], stufenfreiSek: 300 }),
    ...hinUndZurueck('4', '5', { sek: 210, anlagen: ['rolltreppe'], stufenfreiSek: 310 }),
  ],
}

// München Hackerbrücke: zwei Gleise, ein Bahnsteig.
const EIN_BAHNSTEIG: Bahnhofsdaten = {
  ...ort,
  name: 'München Hackerbrücke',
  slug: 'muenchen-hackerbruecke',
  gleise: ['1', '2'],
  paare: hinUndZurueck('1', '2', gleicherBs),
}

// Herford, Hof Hbf u. a.: mehrere Bahnsteige, aber kein Weg dazwischen im Plan.
const OHNE_WEG_DAZWISCHEN: Bahnhofsdaten = {
  ...ort,
  name: 'Herford',
  slug: 'herford',
  gleise: ['1', '2', '3', '4'],
  paare: [...hinUndZurueck('1', '2', gleicherBs), ...hinUndZurueck('3', '4', gleicherBs)],
}

describe('bahnsteige', () => {
  it('fasst Gleise am gleichen Bahnsteig zusammen, in der Reihenfolge der Gleise', () => {
    expect(bahnsteige(OFFENBURG)).toEqual([['1', '2'], ['3', '4'], ['5']])
  })

  it('verbindet auch drei Gleise an einem Bahnsteig', () => {
    const d: Bahnhofsdaten = {
      ...OFFENBURG,
      gleise: ['1', '2', '3'],
      paare: [...hinUndZurueck('1', '2', gleicherBs), ...hinUndZurueck('2', '3', gleicherBs)],
    }
    expect(bahnsteige(d)).toEqual([['1', '2', '3']])
  })
})

describe('gleiseSatz', () => {
  it('nennt Gleise und Bahnsteige', () => {
    expect(gleiseSatz(OFFENBURG)).toBe('Offenburg hat 5 Gleise an 3 Bahnsteigen.')
  })

  it('sagt „an einem Bahnsteig“', () => {
    expect(gleiseSatz(EIN_BAHNSTEIG)).toBe('München Hackerbrücke hat 2 Gleise an einem Bahnsteig.')
  })
})

describe('ueberblickSaetze', () => {
  it('nennt die Gleise am gleichen Bahnsteig', () => {
    expect(ueberblickSaetze(OFFENBURG)).toContain(
      'Am selben Bahnsteig liegen Gleis 1 und 2 sowie Gleis 3 und 4 – dort geht der Umstieg ohne Treppe über den Bahnsteig.',
    )
  })

  it('nennt den haeufigsten Weg zwischen den Bahnsteigen mit seinen Anlagen', () => {
    // Zwei weitere Unterfuehrungs-Wege: 10 gegen 8 ebenerdige.
    const d: Bahnhofsdaten = { ...OFFENBURG, paare: [...OFFENBURG.paare, ...hinUndZurueck('5', '1', {})] }
    expect(ueberblickSaetze(d)).toContain(
      'Zwischen den Bahnsteigen führt der schnellste Weg meist durch eine Unterführung, mit Treppen, Rampen und Rolltreppen.',
    )
  })

  it('am einzigen Bahnsteig: ein Satz statt Wegbeschreibung', () => {
    expect(ueberblickSaetze(EIN_BAHNSTEIG)).toEqual([
      'München Hackerbrücke hat 2 Gleise an einem Bahnsteig.',
      'Der Umstieg geht ohne Treppe über den Bahnsteig.',
    ])
  })

  it('mehrere Bahnsteige ohne Weg dazwischen: sagt das, statt „über den Bahnsteig“ fuer alle', () => {
    expect(ueberblickSaetze(OHNE_WEG_DAZWISCHEN)).toEqual([
      'Herford hat 4 Gleise an 2 Bahnsteigen.',
      'Am selben Bahnsteig liegen Gleis 1 und 2 sowie Gleis 3 und 4 – dort geht der Umstieg ohne Treppe über den Bahnsteig.',
      'Einen Weg zwischen den Bahnsteigen kennt der Bahnhofsplan nicht.',
    ])
  })

  it('ganz ebenerdig ohne Anlagen: kein „mit …“', () => {
    const d: Bahnhofsdaten = {
      ...OFFENBURG,
      gleise: ['1', '3'],
      paare: hinUndZurueck('1', '3', { anlagen: [], lage: 'ebenerdig' }),
    }
    expect(ueberblickSaetze(d)).toContain('Zwischen den Bahnsteigen führt der schnellste Weg meist ebenerdig.')
  })

  it('zaehlt viele Bahnsteige nur noch, statt sie aufzuzaehlen', () => {
    const gleise = Array.from({ length: 14 }, (_, i) => String(i + 1))
    const paare = [
      ...gleise.flatMap((g, i) => (i % 2 === 0 ? hinUndZurueck(g, gleise[i + 1], gleicherBs) : [])),
      ...hinUndZurueck('1', '3'),
    ]
    const d: Bahnhofsdaten = { ...OFFENBURG, gleise, paare }
    expect(ueberblickSaetze(d)).toContain(
      'An 7 Bahnsteigen liegen sich zwei Gleise gegenüber – dort geht der Umstieg ohne Treppe über den Bahnsteig.',
    )
  })
})

describe('dauerSatz', () => {
  it('nennt die Spanne der Gehzeit zwischen den Bahnsteigen', () => {
    expect(dauerSatz(OFFENBURG)).toBe(
      'Bei normalem Gehtempo dauert ein Wechsel des Bahnsteigs 2 bis 5 Minuten, am selben Bahnsteig etwa 1 Minute.',
    )
  })

  it('nur ein Bahnsteig', () => {
    expect(dauerSatz(EIN_BAHNSTEIG)).toBe('Alle Gleise liegen an einem Bahnsteig, der Umstieg dauert etwa 1 Minute.')
  })

  it('mehrere Bahnsteige ohne Weg dazwischen', () => {
    expect(dauerSatz(OHNE_WEG_DAZWISCHEN)).toBe(
      'Am selben Bahnsteig dauert der Umstieg etwa 1 Minute; einen Weg zwischen den Bahnsteigen kennt der Bahnhofsplan nicht.',
    )
  })

  // Leipzig Hbf: am Kopfbahnhof fuehrt der Weg um das Bahnsteigende herum.
  it('am selben Bahnsteig laenger als 1 Minute: „bis zu“, weil es der Hoechstwert ist', () => {
    const d: Bahnhofsdaten = {
      ...OFFENBURG,
      paare: OFFENBURG.paare.map((p) => (p.von === '1' && p.nach === '2' ? { ...p, sek: 170 } : p)),
    }
    expect(dauerSatz(d)).toBe(
      'Bei normalem Gehtempo dauert ein Wechsel des Bahnsteigs 2 bis 5 Minuten, am selben Bahnsteig bis zu 3 Minuten.',
    )
  })

  it('gleiche Minuten: keine Spanne', () => {
    const d: Bahnhofsdaten = { ...OFFENBURG, gleise: ['1', '3'], paare: hinUndZurueck('1', '3', { sek: 170 }) }
    expect(dauerSatz(d)).toBe('Bei normalem Gehtempo dauert ein Wechsel des Bahnsteigs etwa 3 Minuten.')
  })
})

describe('stufenfreiSatz', () => {
  it('alle stufenfrei: nennt den Umweg', () => {
    expect(stufenfreiSatz(OFFENBURG)).toBe(
      'Laut Bahnhofsplan gibt es für jeden Umstieg einen stufenfreien Weg, dann bis zu 2 Minuten länger. Ob die Aufzüge gerade laufen, sagt der Plan nicht.',
    )
  })

  it('stufenfrei ohne Umweg', () => {
    const d: Bahnhofsdaten = { ...OFFENBURG, gleise: ['1', '3'], paare: hinUndZurueck('1', '3', { stufenfreiSek: 120 }) }
    expect(stufenfreiSatz(d)).toBe(
      'Laut Bahnhofsplan gibt es für jeden Umstieg einen stufenfreien Weg. Ob die Aufzüge gerade laufen, sagt der Plan nicht.',
    )
  })

  it('teils ohne stufenfreien Weg: zaehlt und nennt ein Beispiel', () => {
    const d: Bahnhofsdaten = {
      ...OFFENBURG,
      paare: OFFENBURG.paare.map((p) => (p.von === '5' && p.nach === '1' ? { ...p, stufenfreiSek: null } : p)),
    }
    expect(stufenfreiSatz(d)).toBe(
      'Für 1 von 20 Umstiegen kennt der Bahnhofsplan keinen stufenfreien Weg, zum Beispiel von Gleis 5 nach Gleis 1.',
    )
  })

  it('kein stufenfreier Weg zwischen den Bahnsteigen', () => {
    const d: Bahnhofsdaten = { ...OFFENBURG, gleise: ['1', '3'], paare: hinUndZurueck('1', '3', { stufenfreiSek: null }) }
    expect(stufenfreiSatz(d)).toBe('Der Bahnhofsplan kennt keinen stufenfreien Weg zwischen den Bahnsteigen.')
  })

  it('mehrere Bahnsteige ohne Weg dazwischen', () => {
    expect(stufenfreiSatz(OHNE_WEG_DAZWISCHEN)).toBe(
      'Am selben Bahnsteig ja; einen Weg zwischen den Bahnsteigen kennt der Bahnhofsplan nicht.',
    )
  })

  it('ein Bahnsteig', () => {
    expect(stufenfreiSatz(EIN_BAHNSTEIG)).toBe('Ja, alle Gleise liegen an einem Bahnsteig.')
  })
})

describe('naechsteBahnhoefe', () => {
  const bei = (slug: string, lat: number, lon: number): Bahnhofsdaten => ({ ...OFFENBURG, name: slug, slug, lat, lon })
  // Abstaende ab Offenburg: Appenweier ~7 km, Lahr ~16 km, Freiburg ~54 km, Karlsruhe ~66 km.
  const alle = [
    OFFENBURG,
    bei('karlsruhe-hbf', 48.993512, 8.401904),
    bei('appenweier', 48.539, 7.98),
    bei('freiburg-breisgau-hbf', 47.997589, 7.84117),
    bei('lahr-schwarzw', 48.341, 7.873),
  ]

  it('nimmt die naechsten, ohne den Bahnhof selbst, naechster zuerst', () => {
    expect(naechsteBahnhoefe(OFFENBURG, alle, 3).map((n) => n.d.slug)).toEqual([
      'appenweier',
      'lahr-schwarzw',
      'freiburg-breisgau-hbf',
    ])
  })

  it('rechnet die Luftlinie in Kilometern', () => {
    const [appenweier] = naechsteBahnhoefe(OFFENBURG, alle, 1)
    expect(appenweier.km).toBeGreaterThan(6.5)
    expect(appenweier.km).toBeLessThan(8)
  })
})
