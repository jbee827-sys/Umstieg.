// SIMULATION, Bildstufe: Hält jede Route dem Ebenendesign stand?
//
// Liest die Routen aus `backend/scripts/simulation-lauf3.ts` und zeichnet
// jedes Band jeder Route mit dem ECHTEN Bildcode – `bandmodell.ts`,
// `bandbild.ts`, `masse.ts`, dieselben Module und dieselbe Fläche wie auf dem
// Telefon. Ein Nachbau der Zeichnung prüfte den Nachbau.
//
// Geprüft wird, was ein Reisender sonst im Bahnhof ausbadet:
//   - Liegt jeder Punkt in der Zeichenfläche und ist er endlich?
//   - Steht JEDER Ebenenwechsel an beiden Enden im Bild – mit Typ?
//   - Steht die Linie nur dort, wo sie hingehört? (Seit 14.09.2026: nicht auf
//     dem Band mit Ankunfts- oder Abfahrtsgleis.)
//   - Sitzt der Start auf dem Ankunfts-, das Ziel auf dem Abfahrtsbahnsteig –
//     genau auf dem Balken, nicht daneben?
//   - Steht der gewählte Standort (Anfang/Mitte/Ende) dort, wo der Weg beginnt,
//     und stehen die drei von links nach rechts wie die Knöpfe?
//   - Symbole: überlappen sie, ragen sie über den Balken, liegen sie auf einem
//     Punkt?
//   - Ergeben die Schritte genau so viele Besuche wie das Schema?
//
// Dazu Zählungen ohne Urteil: Wege, die als U-Form um einen Kopf führen (im
// Bild nicht mehr gezeichnet), Stellen, an denen die gezeichnete Linie
// zwischen zwei Balken hindurch über die Gleise geht, Scheiben abseits der
// Bahnsteige und Symbolschilder im Grundriss, die sich überdecken.
//
// Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/simulation-bild.ts <routen.jsonl>
import { readFileSync } from 'node:fs'
import type { BahnhofSchema, Schritt } from '../src/api/typen'
import { baueBandmodell, besuchJeSchritt } from '../src/schema/bandmodell'
import { zeichneBand } from '../src/schema/bandbild'
import type { Bandbild, Bildpunkt } from '../src/schema/bandbild'
import { bildflaeche } from '../src/schema/masse'
import { schildBreite, SYMBOL_PX } from '../src/schema/symbole'

interface Zeile {
  bahnhof: string
  eva: string
  gleisAn: string
  gleisAb: string
  abschnitt: 'anfang' | 'mitte' | 'ende'
  variante: string
  echt: boolean
  gehzeitSek: number
  ebenenfolge: string
  schema: BahnhofSchema
  schritte: Schritt[]
  metropole: boolean
}

interface Ergebnis {
  fehler: string[]
  queren: string[]
  uform: boolean
  baender: number
  symbole: number
  scheibenAufBalken: number
  scheibenAbseits: number
  schilder: number
  schilderUeberdeckt: number
}

function punkteVon(bild: Bandbild): Bildpunkt[] {
  const p: Bildpunkt[] = [...bild.weg, ...bild.wechsel]
  if (bild.start) p.push(bild.start)
  if (bild.ziel) p.push(bild.ziel)
  if (bild.art === 'gleise') {
    for (const b of bild.balken) {
      p.push({ x: b.x1, y: b.y }, { x: b.x2, y: b.y })
      for (const s of b.symbole) p.push({ x: s.x - SYMBOL_PX / 2, y: b.y }, { x: s.x + SYMBOL_PX / 2, y: b.y })
    }
    for (const m of bild.standorte?.marken ?? []) p.push({ x: m.x, y: bild.standorte!.y })
  } else {
    for (const n of bild.netz) p.push(...n)
    p.push(...bild.orte)
  }
  return p
}

function pruefe(z: Zeile): Ergebnis {
  const e: Ergebnis = {
    fehler: [],
    queren: [],
    uform: false,
    baender: 0,
    symbole: 0,
    scheibenAufBalken: 0,
    scheibenAbseits: 0,
    schilder: 0,
    schilderUeberdeckt: 0,
  }
  const { fehler } = e

  const modell = baueBandmodell(z.schema, z.schritte, 0)
  if (!modell) return { ...e, fehler: ['kein Bandmodell trotz Schema'] }
  e.baender = modell.baender.length

  const zuordnung = besuchJeSchritt(z.schritte)
  const besuche = Math.max(...zuordnung) + 1
  if (besuche !== z.schema.ebenen.length) {
    fehler.push(`Schritte ergeben ${besuche} Besuche, das Schema ${z.schema.ebenen.length} – das aktive Band wäre falsch`)
  }

  const { breite, hoehe } = bildflaeche(modell.baender.length)
  let verlassen = 0
  let ankommen = 0
  for (const band of modell.baender) {
    const bild = zeichneBand(band.ebene, breite, hoehe, {
      lage: modell.lage,
      erster: band.erster,
      letzter: band.letzter,
      ...(band.wechselVorher ? { wechselVorher: band.wechselVorher } : {}),
      ...(band.wechselNachher ? { wechselNachher: band.wechselNachher } : {}),
    })
    const wo = `Band ${band.nr + 1} (Ebene ${band.level})`
    if (!bild) {
      fehler.push(`${wo} ohne Bild`)
      continue
    }

    const punkte = punkteVon(bild)
    if (punkte.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      fehler.push(`${wo}: Punkt ohne endliche Koordinate`)
    } else if (punkte.some((p) => p.x < -1 || p.x > breite + 1 || p.y < -1 || p.y > hoehe + 1)) {
      fehler.push(`${wo}: Punkt außerhalb der Zeichenfläche`)
    }
    const ohneLinie = bild.art === 'gleise' && (band.erster || band.letzter)
    if (bild.zeigeWeg === ohneLinie) fehler.push(`${wo}: Linie auf dem falschen Band`)
    if (bild.zeigeWeg && (band.ebene.weg?.length ?? 0) >= 2 && bild.weg.length < 2) fehler.push(`${wo}: Weg nicht gezeichnet`)
    verlassen += bild.wechsel.filter((w) => w.art === 'verlassen').length
    ankommen += bild.wechsel.filter((w) => w.art === 'ankommen').length

    if (bild.art !== 'gleise') {
      // Schilder im Grundriss: Wie oft decken sie sich? Gezählt, nicht verurteilt.
      const kasten = bild.orte.map((o) => {
        const w = schildBreite(o.symbole.length)
        return { x1: o.x - w / 2, x2: o.x + w / 2, y1: o.y - 7.5, y2: o.y + 7.5 }
      })
      e.schilder += kasten.length
      for (let i = 0; i < kasten.length; i++) {
        for (let k = i + 1; k < kasten.length; k++) {
          const a = kasten[i]
          const b = kasten[k]
          if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) e.schilderUeberdeckt++
        }
      }
      continue
    }

    const start = bild.balken.find((b) => b.rolle === 'start')
    const ziel = bild.balken.find((b) => b.rolle === 'ziel')
    if (ohneLinie) {
      if (band.erster && bild.start && start && (bild.start.y !== start.y || bild.start.x < start.x1 || bild.start.x > start.x2)) {
        fehler.push(`${wo}: Start nicht auf dem Ankunftsbahnsteig`)
      }
      if (band.letzter && bild.ziel && ziel && (bild.ziel.y !== ziel.y || bild.ziel.x < ziel.x1 || bild.ziel.x > ziel.x2)) {
        fehler.push(`${wo}: Ziel nicht auf dem Abfahrtsbahnsteig`)
      }
      for (const w of bild.wechsel) {
        if (w.aufBalken) e.scheibenAufBalken++
        else e.scheibenAbseits++
      }
    }
    if (band.erster && bild.standorte) {
      const [a, m, en] = bild.standorte.marken
      if (!(a.x < m.x && m.x < en.x)) fehler.push(`${wo}: Anfang, Mitte, Ende nicht von links nach rechts`)
      const hier = bild.standorte.marken.find((x) => x.hier)
      if (z.echt && hier && hier.name.toLowerCase() !== z.abschnitt) {
        fehler.push(`${wo}: gewählt ${z.abschnitt}, im Bild steht „${hier.name}"`)
      }
      if (hier && bild.start && Math.abs(bild.start.x - hier.x) > 7.5) {
        fehler.push(`${wo}: Startpunkt ${Math.round(Math.abs(bild.start.x - hier.x))} px neben „${hier.name}"`)
      }
    }

    // Symbole im Balken: nie übereinander, nie über das Ende, nie auf einem Punkt.
    for (const b of bild.balken) {
      e.symbole += b.symbole.length
      if (!b.rolle && b.symbole.length > 0) fehler.push(`${wo}: Symbole am Nachbarbahnsteig ${b.gleise.join('/')}`)
      const xs = b.symbole.map((s) => s.x).sort((p, q) => p - q)
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] - xs[i - 1] < SYMBOL_PX - 0.01) fehler.push(`${wo}: Symbole überlappen auf ${b.gleise.join('/')}`)
      }
      for (const s of b.symbole) {
        if (s.x - SYMBOL_PX / 2 < b.x1 - 0.01 || s.x + SYMBOL_PX / 2 > b.x2 + 0.01) {
          fehler.push(`${wo}: Symbol ragt über ${b.gleise.join('/')} hinaus`)
        }
      }
      const aufDiesem: Bildpunkt[] = [
        ...(ohneLinie && bild.start && bild.start.y === b.y ? [bild.start] : []),
        ...(ohneLinie && bild.ziel && bild.ziel.y === b.y ? [bild.ziel] : []),
        ...bild.wechsel.filter((w) => w.aufBalken && w.y === b.y),
      ]
      for (const p of aufDiesem) {
        for (const s of b.symbole) {
          if (Math.abs(s.x - p.x) < 7.5 + SYMBOL_PX / 2 - 0.01) fehler.push(`${wo}: Symbol auf einem Punkt (${b.gleise.join('/')})`)
        }
      }
    }

    // U-Form: eine einzige Ebene, zwei verschiedene Bahnsteige, und der Weg
    // verlässt die Länge des Ankunftsbahnsteigs – er geht um den Kopf.
    if (modell.baender.length === 1 && start && ziel && start !== ziel) {
      if (bild.weg.some((p) => p.x > start.x2 + 3 || p.x < start.x1 - 3)) e.uform = true
    }

    // Quert die gezeichnete Linie die Gleise ZWISCHEN zwei Balken, innerhalb
    // ihrer beider Länge? Nur, wo überhaupt eine Linie steht.
    if (!bild.zeigeWeg) continue
    const reihe = [...bild.balken].filter((b) => b.massstaeblich).sort((p, q) => p.y - q.y)
    for (let i = 1; i < bild.weg.length; i++) {
      const p = bild.weg[i - 1]
      const q = bild.weg[i]
      for (let k = 1; k < reihe.length; k++) {
        const oben = reihe[k - 1]
        const unten = reihe[k]
        const mitteY = (oben.y + unten.y) / 2
        if ((p.y - mitteY) * (q.y - mitteY) >= 0 || q.y === p.y) continue
        const x = p.x + ((mitteY - p.y) / (q.y - p.y)) * (q.x - p.x)
        const von = Math.max(oben.x1, unten.x1) + 3
        const bis = Math.min(oben.x2, unten.x2) - 3
        if (x > von && x < bis) {
          e.queren.push(`${wo}: zwischen ${oben.gleise.join('/')} und ${unten.gleise.join('/')}`)
        }
      }
    }
  }
  const zahl = z.schema.wechsel.length
  if (verlassen !== zahl || ankommen !== zahl) {
    fehler.push(`Wechselmarken ${verlassen} verlassen / ${ankommen} ankommen für ${zahl} Wechsel`)
  }
  e.queren = [...new Set(e.queren)]
  return e
}

function main(): void {
  const datei = process.argv[2]
  if (!datei) {
    console.error('Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/simulation-bild.ts <routen.jsonl>')
    process.exit(2)
  }
  const zeilen = readFileSync(datei, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Zeile)

  let baender = 0
  let symbole = 0
  let aufBalken = 0
  let abseits = 0
  let schilder = 0
  let ueberdeckt = 0
  const mitFehler: { z: Zeile; fehler: string[] }[] = []
  const queren = new Map<string, Set<string>>()
  const uformen = new Map<string, string[]>()
  const verteilung = new Map<number, number>()
  const t0 = Date.now()
  for (const z of zeilen) {
    const e = pruefe(z)
    baender += e.baender
    symbole += e.symbole
    aufBalken += e.scheibenAufBalken
    abseits += e.scheibenAbseits
    schilder += e.schilder
    ueberdeckt += e.schilderUeberdeckt
    verteilung.set(e.baender, (verteilung.get(e.baender) ?? 0) + 1)
    if (e.fehler.length > 0) mitFehler.push({ z, fehler: e.fehler })
    for (const q of e.queren) {
      const k = `${z.bahnhof} ${z.gleisAn}→${z.gleisAb}`
      queren.set(k, (queren.get(k) ?? new Set()).add(q))
    }
    if (e.uform) {
      uformen.set(z.bahnhof, [...(uformen.get(z.bahnhof) ?? []), `${z.gleisAn}→${z.gleisAb} ${z.abschnitt}`])
    }
  }

  const trenner = '='.repeat(78)
  const bahnhoefe = new Set(zeilen.map((z) => z.bahnhof)).size
  console.log(`${trenner}\nBILDSTUFE: ${zeilen.length} Routen an ${bahnhoefe} Bahnhöfen, ${baender} Bänder gezeichnet (${Date.now() - t0} ms)\n${trenner}`)
  console.log(
    'Bänder je Route:',
    [...verteilung.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n}: ${k}`).join(' · '),
  )
  console.log(`Symbole in Balken: ${symbole} · Scheiben auf dem Balken: ${aufBalken}, abseits: ${abseits}`)
  console.log(`Symbolschilder im Grundriss: ${schilder}, davon überdecken sich ${ueberdeckt} Paare`)

  console.log(`\nBEFUNDE: ${mitFehler.length} Routen an ${new Set(mitFehler.map((m) => m.z.bahnhof)).size} Bahnhöfen`)
  const nachArt = new Map<string, number>()
  for (const { fehler } of mitFehler) {
    for (const f of fehler) {
      const art = f.replace(/-?\d+/g, 'N').replace(/„[^"]*"/g, '„X"').replace(/auf [^ ]+$/, 'auf X').replace(/\([^)]*\)/g, '(X)')
      nachArt.set(art, (nachArt.get(art) ?? 0) + 1)
    }
  }
  for (const [art, n] of [...nachArt.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}× ${art}`)
  for (const { z, fehler } of mitFehler.slice(0, 20)) {
    console.log(`  ${z.bahnhof} ${z.gleisAn}→${z.gleisAb} ${z.abschnitt} ${z.variante}: ${fehler.join(' | ')}`)
  }

  console.log(`\nU-FORM (eine Ebene, um den Kopf – steht nur noch im Text): ${[...uformen.values()].flat().length} Routen an ${uformen.size} Bahnhöfen`)
  for (const [b, ls] of uformen) console.log(`  ${b}: ${ls.slice(0, 4).join(', ')}${ls.length > 4 ? ` … (+${ls.length - 4})` : ''}`)

  console.log(`\nLINIE QUERT DIE GLEISE im Bild: ${queren.size} Gleispaare – ansehen, nicht urteilen`)
  for (const [k, s] of [...queren.entries()].slice(0, 25)) console.log(`  ${k}: ${[...s].join('; ')}`)
}

main()
