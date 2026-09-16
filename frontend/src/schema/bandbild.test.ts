import { describe, expect, it } from 'vitest'
import type { RouteErgebnis, SchemaEbene } from '../api/typen'
import { baueBandmodell } from './bandmodell'
import type { Bandmodell } from './bandmodell'
import { bildlageFuer, zeichneBand } from './bandbild'
import type { Bandbild, Bildpunkt, Gleisbild, Uebergangsbild } from './bandbild'
import { bildflaeche } from './masse'
import { SYMBOL_PX } from './symbole'
import leipzigAnfang from './testdaten/leipzig-6-16-anfang.json'
import leipzigMitte from './testdaten/leipzig-6-16-mitte.json'
import leipzigEnde from './testdaten/leipzig-6-16-ende.json'
import berlin from './testdaten/berlin-14-6-mitte.json'

// Echte Antworten aus `backend/scripts/routenabzug.ts`, nicht erfunden: Ein
// erfundener Datensatz zeigt genau die Fälle nicht, an denen ein Bild
// scheitert – den Kopf hinter dem Bahnsteigende, die Treppe am falschen Ende.
const ROUTEN = {
  leipzigAnfang: leipzigAnfang as unknown as RouteErgebnis,
  leipzigMitte: leipzigMitte as unknown as RouteErgebnis,
  leipzigEnde: leipzigEnde as unknown as RouteErgebnis,
  berlin: berlin as unknown as RouteErgebnis,
}

/** Jedes Band einer Route so, wie es aktiv auf dem Telefon stünde. */
function alleBilder(route: RouteErgebnis): { modell: Bandmodell; bilder: Bandbild[] } {
  const modell = baueBandmodell(route.schema, route.schritte, 0)!
  const { breite, hoehe } = bildflaeche(modell.baender.length)
  const bilder = modell.baender.map(
    (band) =>
      zeichneBand(band.ebene, breite, hoehe, {
        lage: modell.lage,
        erster: band.erster,
        letzter: band.letzter,
        ...(band.wechselVorher ? { wechselVorher: band.wechselVorher } : {}),
        ...(band.wechselNachher ? { wechselNachher: band.wechselNachher } : {}),
      })!,
  )
  return { modell, bilder }
}

function gleisbild(bild: Bandbild): Gleisbild {
  if (bild.art !== 'gleise') throw new Error('keine Gleisebene')
  return bild
}

function uebergang(bild: Bandbild): Uebergangsbild {
  if (bild.art !== 'verbindung') throw new Error('keine Übergangsebene')
  return bild
}

function balken(bild: Gleisbild, rolle: 'start' | 'ziel') {
  return bild.balken.find((b) => b.rolle === rolle)!
}

describe('Bildlage: der Anfang des Ankunftsbahnsteigs liegt links', () => {
  it('dreht Leipzig um 180°, weil der Anfang dort im Bezugsrahmen rechts liegt', () => {
    // Gleis 6/7: von (206, −3) nach (0, 0) – der Anfang liegt bei +x.
    expect(bildlageFuer(ROUTEN.leipzigEnde.schema!.ebenen)).toEqual({ gedreht180: true })
  })

  it('stellt Anfang, Mitte und Ende von links nach rechts – wie die Knöpfe', () => {
    for (const route of Object.values(ROUTEN)) {
      const standorte = gleisbild(alleBilder(route).bilder[0]).standorte!
      const [anfang, mitte, ende] = standorte.marken
      expect(anfang.name).toBe('Anfang')
      expect(anfang.x).toBeLessThan(mitte.x)
      expect(mitte.x).toBeLessThan(ende.x)
    }
  })

  it('markiert den Standort, an dem der Weg wirklich beginnt', () => {
    const hier = (route: RouteErgebnis) =>
      gleisbild(alleBilder(route).bilder[0]).standorte!.marken.find((m) => m.hier)!.name
    expect(hier(ROUTEN.leipzigAnfang)).toBe('Anfang')
    expect(hier(ROUTEN.leipzigMitte)).toBe('Mitte')
    expect(hier(ROUTEN.leipzigEnde)).toBe('Ende')
  })

  /** ToDo 31 (15.09.2026): dieselben Wörter wie auf den Knöpfen. */
  it('schreibt die Himmelsrichtung unter die Enden, wenn das Schema sie kennt', () => {
    const route = structuredClone(ROUTEN.leipzigMitte)
    for (const ebene of route.schema!.ebenen) {
      for (const b of ebene.bahnsteige) {
        if (b.rolle === 'start') b.himmelsrichtung = { von: 'N', bis: 'S' }
      }
    }
    const marken = gleisbild(alleBilder(route).bilder[0]).standorte!.marken
    expect(marken.map((m) => m.text)).toEqual(['Nordende', 'Mitte', 'Südende'])
  })

  it('bleibt ohne Himmelsrichtung bei Anfang und Ende', () => {
    const marken = gleisbild(alleBilder(ROUTEN.leipzigMitte).bilder[0]).standorte!.marken
    expect(marken.map((m) => m.text)).toEqual(['Anfang', 'Mitte', 'Ende'])
  })
})

describe('Kopfbahnhof ab dem Ende: auf der Gleisebene nur Start und Ziel', () => {
  // Leipzig ab Bahnsteigende: vom Gleis 6 um den Kopf zu Gleis 16, eine Ebene.
  // Seit dem 14.09.2026 zeichnet das Band mit Ankunfts- und Abfahrtsgleis
  // keinen Weg mehr – den sagt der Text. Das Bild sagt, wo man steht und wo
  // der Zug abfährt.
  const bild = gleisbild(alleBilder(ROUTEN.leipzigEnde).bilder[0])

  it('zeichnet keinen Weg', () => {
    expect(bild.zeigeWeg).toBe(false)
  })

  it('setzt den Start auf den Ankunftsbahnsteig, an den gewählten Standort', () => {
    const b = balken(bild, 'start')
    const hier = bild.standorte!.marken.find((m) => m.hier)!
    expect(bild.start!.y).toBe(b.y)
    // Höchstens um seinen Radius versetzt: Am Bahnsteigende rückt der Punkt
    // in den Balken, statt über ihn hinauszuhängen.
    expect(Math.abs(bild.start!.x - hier.x)).toBeLessThanOrEqual(7.5)
    expect(bild.start!.x).toBeGreaterThanOrEqual(b.x1)
    expect(bild.start!.x).toBeLessThanOrEqual(b.x2)
  })

  it('setzt das Ziel auf den Abfahrtsbahnsteig', () => {
    const b = balken(bild, 'ziel')
    expect(bild.ziel!.y).toBe(b.y)
    expect(bild.ziel!.x).toBeGreaterThanOrEqual(b.x1)
    expect(bild.ziel!.x).toBeLessThanOrEqual(b.x2)
  })

  it('zeigt keine Treppe, wo der Weg keine nimmt', () => {
    expect(bild.wechsel).toEqual([])
  })
})

describe('Kopfbahnhof ab der Mitte: hinunter und wieder herauf', () => {
  // Seit der Kettenkorrektur vom 14.09.2026 gewinnt ab der Mitte die
  // Unterführung (323 s gegen 354 s über den Kopf). Das Bild muss beide
  // Treppen zeigen, an beiden Enden, und die richtige Richtung.
  const { bilder } = alleBilder(ROUTEN.leipzigMitte)

  it('hat drei Bänder: Gleisebene, Unterführung, Gleisebene', () => {
    expect(bilder.map((b) => b.art)).toEqual(['gleise', 'verbindung', 'gleise'])
  })

  it('zeichnet den Weg nur in der Unterführung', () => {
    expect(bilder.map((b) => b.zeigeWeg)).toEqual([false, true, false])
  })

  it('legt die Treppe hinunter auf den Ankunftsbahnsteig, an ihren Zugang', () => {
    const erstes = gleisbild(bilder[0])
    const b = balken(erstes, 'start')
    expect(erstes.wechsel).toHaveLength(1)
    expect(erstes.wechsel[0]).toMatchObject({
      typ: 'treppe',
      richtung: 'hinunter',
      art: 'verlassen',
      aufBalken: true,
      beiM: 32,
    })
    expect(erstes.wechsel[0].y).toBe(b.y)
    expect(erstes.wechsel[0].x).toBe(b.zugang!.x)
  })

  it('legt die Treppe bei 32 m zwischen Anfang und Mitte – nicht ans andere Ende', () => {
    // Der Fehler, den eine vertauschte Richtung macht: Das Bild schickt den
    // Reisenden 100 m in die falsche Richtung, zum Kopf statt zur Treppe.
    const erstes = gleisbild(bilder[0])
    const [anfang, mitte] = erstes.standorte!.marken
    expect(erstes.wechsel[0].x).toBeGreaterThan(anfang.x)
    expect(erstes.wechsel[0].x).toBeLessThan(mitte.x)
  })

  it('markiert in der Unterführung beide Treppen – an- und abgehend', () => {
    const unten = uebergang(bilder[1])
    expect(unten.wechsel.map((w) => [w.art, w.typ, w.richtung])).toEqual([
      ['ankommen', 'treppe', 'hinunter'],
      ['verlassen', 'treppe', 'hinauf'],
    ])
  })

  it('kommt auf dem letzten Besuch über die Treppe am Abfahrtsbahnsteig an – dort ist das Ziel', () => {
    const letztes = gleisbild(bilder[2])
    const b = balken(letztes, 'ziel')
    expect(letztes.wechsel.map((w) => [w.art, w.richtung, w.aufBalken, w.alsZiel])).toEqual([
      ['ankommen', 'hinauf', true, true],
    ])
    expect(letztes.ziel).toMatchObject({ y: b.y, typ: 'treppe', beiM: 31 })
    expect(letztes.start).toBeUndefined()
  })
})

describe('Jeder Ebenenwechsel steht im Bild – auf beiden Ebenen', () => {
  it.each(Object.entries(ROUTEN))('%s', (_name, route) => {
    const { bilder } = alleBilder(route)
    const zahl = route.schema!.wechsel.length
    const verlassen = bilder.flatMap((b) => b.wechsel).filter((w) => w.art === 'verlassen')
    const ankommen = bilder.flatMap((b) => b.wechsel).filter((w) => w.art === 'ankommen')
    expect(verlassen).toHaveLength(zahl)
    expect(ankommen).toHaveLength(zahl)
    // Und in der Reihenfolge des Wegs, mit dem Typ aus `schema.wechsel`.
    expect(verlassen.map((w) => w.typ)).toEqual(route.schema!.wechsel.map((w) => w.typ))
  })
})

describe('Anlagen stehen als Symbole im Balken', () => {
  it.each(Object.entries(ROUTEN))('%s: ohne Überlappung, im Balken, neben den Punkten', (_name, route) => {
    for (const bild of alleBilder(route).bilder) {
      if (bild.art !== 'gleise') continue
      for (const b of bild.balken) {
        const xs = b.symbole.map((s) => s.x).sort((p, q) => p - q)
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(SYMBOL_PX - 0.001)
        for (const s of b.symbole) {
          expect(s.x - SYMBOL_PX / 2).toBeGreaterThanOrEqual(b.x1 - 0.001)
          expect(s.x + SYMBOL_PX / 2).toBeLessThanOrEqual(b.x2 + 0.001)
        }
        const punkte: Bildpunkt[] = [
          ...(bild.start && bild.start.y === b.y ? [bild.start] : []),
          ...(bild.ziel && bild.ziel.y === b.y ? [bild.ziel] : []),
          ...bild.wechsel.filter((w) => w.aufBalken && w.y === b.y),
        ]
        for (const p of punkte) {
          for (const s of b.symbole) expect(Math.abs(s.x - p.x)).toBeGreaterThanOrEqual(7.5 + SYMBOL_PX / 2 - 0.001)
        }
      }
    }
  })

  it('stehen nur an Ankunfts- und Abfahrtsbahnsteig', () => {
    for (const bild of alleBilder(ROUTEN.berlin).bilder) {
      if (bild.art !== 'gleise') continue
      for (const b of bild.balken) if (!b.rolle) expect(b.symbole).toEqual([])
    }
  })

  it('zeigen Berlins Gleis 5/6 an seinen Zugängen', () => {
    // 27 Anlagen an acht Stellen (README, 13.09.2026) – ohne die, an der der
    // Weg ankommt, bleibt je Stelle höchstens Rolltreppe oder Treppe, dazu
    // ein Aufzug.
    const letztes = gleisbild(alleBilder(ROUTEN.berlin).bilder.at(-1)!)
    const symbole = balken(letztes, 'ziel').symbole
    expect(symbole.length).toBeGreaterThan(0)
    expect(symbole.length).toBeLessThanOrEqual(16)
  })
})

describe('Übergangsebene: Anlagen als Symbole, der Weg als Linie', () => {
  const uebergaenge = alleBilder(ROUTEN.berlin).bilder.filter((b) => b.art === 'verbindung').map(uebergang)

  it('zeichnet den Weg', () => {
    for (const u of uebergaenge) expect(u.zeigeWeg).toBe(true)
  })

  it('zeigt die Anlagen als Orte – je Ort höchstens Treppe ODER Rolltreppe', () => {
    expect(uebergaenge.flatMap((u) => u.orte).length).toBeGreaterThan(0)
    for (const o of uebergaenge.flatMap((u) => u.orte)) {
      expect(o.symbole.length).toBeGreaterThan(0)
      expect(o.symbole.filter((s) => s !== 'aufzug').length).toBeLessThanOrEqual(1)
    }
  })

  it('überlässt die genommenen Anlagen den roten Scheiben', () => {
    for (const u of uebergaenge) {
      for (const o of u.orte) for (const w of u.wechsel) expect(Math.hypot(o.x - w.x, o.y - w.y)).toBeGreaterThan(14)
    }
  })
})

describe('Alles liegt in der Zeichenfläche', () => {
  it.each(Object.entries(ROUTEN))('%s', (_name, route) => {
    const { modell, bilder } = alleBilder(route)
    const { breite, hoehe } = bildflaeche(modell.baender.length)
    const punkte: Bildpunkt[] = []
    for (const bild of bilder) {
      punkte.push(...bild.weg, ...bild.wechsel)
      if (bild.start) punkte.push(bild.start)
      if (bild.ziel) punkte.push(bild.ziel)
      if (bild.art === 'gleise') {
        for (const b of bild.balken) {
          punkte.push({ x: b.x1, y: b.y }, { x: b.x2, y: b.y })
          for (const s of b.symbole) punkte.push({ x: s.x, y: b.y })
        }
      } else {
        for (const n of bild.netz) punkte.push(...n)
        punkte.push(...bild.orte)
      }
    }
    for (const p of punkte) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(breite)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(hoehe)
    }
  })
})

describe('Ein Ebenenwechsel am genutzten Zugang liegt auf dem Balken', () => {
  // Gefunden von der Simulation am 14.09.2026: 126 Scheiben lagen 8–12 px
  // neben ihrem Balken, halb auf der Kante – Treppen, die auf einem breiten
  // Inselbahnsteig mehr als 3 m neben der Achse ansetzen. Die Querlage
  // teilt einen solchen Punkt zwischen die Balken. Dass die Treppe trotzdem
  // am Bahnsteig liegt, sagt der Zugang, den die Route nimmt.
  const ebene = (mitZugang: boolean): SchemaEbene => ({
    level: 0,
    art: 'gleise',
    rolle: 'start',
    richtungLokalGrad: 0,
    bahnsteige: [
      {
        bahnsteigId: 'a',
        gleise: ['1'],
        laengeM: 200,
        querM: 0,
        rolle: 'start',
        von: { x: 0, y: 0 },
        bis: { x: 200, y: 0 },
        zugaenge: [{ beiM: 100, pos: { x: 100, y: 7 }, aufzug: 0, rolltreppe: 0, treppe: 1, aufRoute: mitZugang }],
      },
      { bahnsteigId: 'b', gleise: ['2'], laengeM: 200, querM: 30, von: { x: 0, y: 30 }, bis: { x: 200, y: 30 } },
    ],
    weg: [{ x: 0, y: 0 }, { x: 100, y: 7 }],
    elemente: [{ typ: 'treppe', punkte: [{ x: 100, y: 7 }, { x: 100, y: 12 }], aufRoute: true, beiM: 100 }],
  })
  const zeichne = (e: SchemaEbene) =>
    gleisbild(
      zeichneBand(e, 332, 288, {
        lage: bildlageFuer([e]),
        erster: true,
        letzter: false,
        wechselNachher: { vonLevel: 0, nachLevel: -1, typ: 'treppe' },
      })!,
    )

  it('zieht eine Treppe 7 m neben der Achse auf den Balken, wenn sie der genutzte Zugang ist', () => {
    const bild = zeichne(ebene(true))
    expect(bild.wechsel[0]).toMatchObject({ aufBalken: true, y: balken(bild, 'start').y, beiM: 100 })
  })

  it('lässt einen Wechsel ohne Zugang dort, wo er ist', () => {
    const bild = zeichne(ebene(false))
    expect(bild.wechsel[0].aufBalken).toBe(false)
  })
})

describe('Berlin Hbf 14 → 6: fünf Besuche, eine gekreuzte Ebene', () => {
  const { bilder } = alleBilder(ROUTEN.berlin)

  it('legt auch die um 81° gedrehte Ebene −2 waagerecht', () => {
    const letztes = gleisbild(bilder[bilder.length - 1])
    // Waagerecht heißt: jeder Balken hat EIN y – das ist konstruktiv so. Die
    // Probe ist, dass das Ziel dort auf dem Zielbalken steht.
    expect(letztes.ziel!.y).toBe(balken(letztes, 'ziel').y)
  })

  it('reiht die Tiefbahnsteige nach ihrer echten Lage, nicht nach Gleisnummer', () => {
    // Gleis 22 liegt neben 7/8, nicht hinter 1/2 (Spike vom 13.09.2026).
    const reihe = gleisbild(bilder[bilder.length - 1]).balken.map((b) => b.gleise.join('/'))
    const i22 = reihe.indexOf('22')
    const i78 = reihe.indexOf('7/8')
    expect(Math.abs(i22 - i78)).toBe(1)
  })
})
