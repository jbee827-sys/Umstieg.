import { describe, expect, it } from 'vitest'
import type { RouteErgebnis } from '../api/typen'
import { baueBandmodell } from './bandmodell'
import type { Bandmodell } from './bandmodell'
import { bildlageFuer, zeichneBand } from './bandbild'
import type { Bandbild, Bildpunkt, Gleisbild, Uebergangsbild } from './bandbild'
import { bildflaeche } from './masse'
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
})

describe('Kopfbahnhof: die U-Form ist im Bild eine U-Form', () => {
  // Leipzig ab Bahnsteigende: vom Gleis 6 zum Kopf, quer, auf Gleis 16 zurück.
  // Bis zum 14.09.2026 zeichnete die Gleisebene nur Balken – der ganze Weg
  // fehlte im Bild.
  const bild = gleisbild(alleBilder(ROUTEN.leipzigEnde).bilder[0])

  it('zeichnet den Weg auf der Gleisebene', () => {
    expect(bild.weg.length).toBeGreaterThanOrEqual(4)
  })

  it('beginnt auf dem Ankunfts- und endet auf dem Abfahrtsbahnsteig', () => {
    expect(Math.abs(bild.start!.y - balken(bild, 'start').y)).toBeLessThanOrEqual(8)
    expect(Math.abs(bild.ziel!.y - balken(bild, 'ziel').y)).toBeLessThanOrEqual(8)
  })

  it('führt um den Kopf herum – jenseits des Bahnsteigendes, nicht quer über die Gleise', () => {
    // Der Querbahnsteig liegt hinter dem Ende von Gleis 6/7. Der senkrechte
    // Schenkel des U muss dort liegen; läge er innerhalb des Balkens, zeigte
    // das Bild einen Weg über die Gleise.
    // Geprüft an den STRECKEN, nicht an den Punkten: Der Schenkel ist eine
    // Gerade vom einen Balken zum anderen, zwischen den beiden liegt kein
    // Stützpunkt.
    const ende = balken(bild, 'start').x2
    const mitteY = (balken(bild, 'start').y + balken(bild, 'ziel').y) / 2
    const querungen: number[] = []
    for (let i = 1; i < bild.weg.length; i++) {
      const p = bild.weg[i - 1]
      const q = bild.weg[i]
      if ((p.y - mitteY) * (q.y - mitteY) >= 0) continue
      querungen.push(p.x + ((mitteY - p.y) / (q.y - p.y)) * (q.x - p.x))
    }
    expect(querungen.length).toBeGreaterThan(0)
    for (const x of querungen) expect(x).toBeGreaterThanOrEqual(ende - 4)
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

  it('markiert die Treppe hinunter am Ende des ersten Besuchs', () => {
    const erstes = gleisbild(bilder[0])
    expect(erstes.wechsel).toHaveLength(1)
    expect(erstes.wechsel[0]).toMatchObject({ typ: 'treppe', richtung: 'hinunter', art: 'verlassen' })
    expect(erstes.wechsel[0].x).toBe(erstes.weg[erstes.weg.length - 1].x)
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

  it('kommt auf dem letzten Besuch über die Treppe an und endet am Abfahrtsbahnsteig', () => {
    const letztes = gleisbild(bilder[2])
    expect(letztes.wechsel.map((w) => [w.art, w.richtung])).toEqual([['ankommen', 'hinauf']])
    expect(Math.abs(letztes.ziel!.y - balken(letztes, 'ziel').y)).toBeLessThanOrEqual(8)
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
        for (const b of bild.balken) punkte.push({ x: b.x1, y: b.y }, { x: b.x2, y: b.y })
      } else {
        for (const n of bild.netz) punkte.push(...n)
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

describe('Berlin Hbf 14 → 6: fünf Besuche, eine gekreuzte Ebene', () => {
  const { bilder } = alleBilder(ROUTEN.berlin)

  it('legt auch die um 81° gedrehte Ebene −2 waagerecht', () => {
    const letztes = gleisbild(bilder[bilder.length - 1])
    // Waagerecht heißt: jeder Balken hat EIN y – das ist konstruktiv so. Die
    // Probe ist, dass der Weg dort auf dem Zielbalken endet.
    expect(Math.abs(letztes.ziel!.y - balken(letztes, 'ziel').y)).toBeLessThanOrEqual(8)
  })

  it('reiht die Tiefbahnsteige nach ihrer echten Lage, nicht nach Gleisnummer', () => {
    // Gleis 22 liegt neben 7/8, nicht hinter 1/2 (Spike vom 13.09.2026).
    const reihe = gleisbild(bilder[bilder.length - 1]).balken.map((b) => b.gleise.join('/'))
    const i22 = reihe.indexOf('22')
    const i78 = reihe.indexOf('7/8')
    expect(Math.abs(i22 - i78)).toBe(1)
  })
})
