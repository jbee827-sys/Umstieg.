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
//   - Liegt der Start auf dem Ankunfts-, das Ziel auf dem Abfahrtsbahnsteig?
//   - Steht der gewählte Standort (Anfang/Mitte/Ende) dort, wo der Weg beginnt,
//     und stehen die drei von links nach rechts wie die Knöpfe?
//   - Ergeben die Schritte genau so viele Besuche wie das Schema?
//
// Dazu zwei Zählungen ohne Urteil: Wege, die als U-Form um einen Kopf
// führen, und Stellen, an denen der gezeichnete Weg zwischen zwei Balken
// hindurch über die Gleise geht. Letzteres kann echt sein (ein
// Reisendenübergang) oder ein Bildfehler – das entscheidet ein Blick.
//
// Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/simulation-bild.ts <routen.jsonl>
import { readFileSync } from 'node:fs'
import type { BahnhofSchema, Schritt } from '../src/api/typen'
import { baueBandmodell, besuchJeSchritt } from '../src/schema/bandmodell'
import { zeichneBand } from '../src/schema/bandbild'
import type { Bandbild, Bildpunkt } from '../src/schema/bandbild'
import { bildflaeche } from '../src/schema/masse'

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
}

function punkteVon(bild: Bandbild): Bildpunkt[] {
  const p: Bildpunkt[] = [...bild.weg, ...bild.wechsel]
  if (bild.start) p.push(bild.start)
  if (bild.ziel) p.push(bild.ziel)
  for (const s of bild.anlagen) p.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
  for (const k of bild.aufzuege) p.push(k)
  if (bild.art === 'gleise') {
    for (const b of bild.balken) p.push({ x: b.x1, y: b.y }, { x: b.x2, y: b.y })
    for (const m of bild.standorte?.marken ?? []) p.push({ x: m.x, y: bild.standorte!.y })
  } else {
    for (const n of bild.netz) p.push(...n)
  }
  return p
}

function pruefe(z: Zeile): Ergebnis {
  const fehler: string[] = []
  const queren: string[] = []
  let uform = false

  const modell = baueBandmodell(z.schema, z.schritte, 0)
  if (!modell) return { fehler: ['kein Bandmodell trotz Schema'], queren, uform, baender: 0 }

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
    if ((band.ebene.weg?.length ?? 0) >= 2 && bild.weg.length < 2) fehler.push(`${wo}: Weg nicht gezeichnet`)
    verlassen += bild.wechsel.filter((w) => w.art === 'verlassen').length
    ankommen += bild.wechsel.filter((w) => w.art === 'ankommen').length

    if (bild.art !== 'gleise') continue
    const start = bild.balken.find((b) => b.rolle === 'start')
    const ziel = bild.balken.find((b) => b.rolle === 'ziel')
    if (band.erster && bild.start && start && start.massstaeblich && Math.abs(bild.start.y - start.y) > 8) {
      fehler.push(`${wo}: Start liegt ${Math.round(Math.abs(bild.start.y - start.y))} px neben dem Ankunftsbahnsteig`)
    }
    if (band.letzter && bild.ziel && ziel && ziel.massstaeblich && Math.abs(bild.ziel.y - ziel.y) > 8) {
      fehler.push(`${wo}: Ziel liegt ${Math.round(Math.abs(bild.ziel.y - ziel.y))} px neben dem Abfahrtsbahnsteig`)
    }
    if (band.erster && bild.standorte) {
      const [a, m, e] = bild.standorte.marken
      if (!(a.x < m.x && m.x < e.x)) fehler.push(`${wo}: Anfang, Mitte, Ende nicht von links nach rechts`)
      const hier = bild.standorte.marken.find((x) => x.hier)
      if (z.echt && hier && hier.name.toLowerCase() !== z.abschnitt) {
        fehler.push(`${wo}: gewählt ${z.abschnitt}, im Bild steht „${hier.name}"`)
      }
    }

    // U-Form: eine einzige Ebene, zwei verschiedene Bahnsteige, und der Weg
    // verlässt die Länge des Ankunftsbahnsteigs – er geht um den Kopf.
    if (modell.baender.length === 1 && start && ziel && start !== ziel) {
      if (bild.weg.some((p) => p.x > start.x2 + 3 || p.x < start.x1 - 3)) uform = true
    }

    // Quert der gezeichnete Weg die Gleise ZWISCHEN zwei Balken, innerhalb
    // ihrer beider Länge?
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
          queren.push(`${wo}: zwischen ${oben.gleise.join('/')} und ${unten.gleise.join('/')}`)
        }
      }
    }
  }
  const zahl = z.schema.wechsel.length
  if (verlassen !== zahl || ankommen !== zahl) {
    fehler.push(`Wechselmarken ${verlassen} verlassen / ${ankommen} ankommen für ${zahl} Wechsel`)
  }
  return { fehler, queren: [...new Set(queren)], uform, baender: modell.baender.length }
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
  const mitFehler: { z: Zeile; fehler: string[] }[] = []
  const queren = new Map<string, Set<string>>()
  const uformen = new Map<string, string[]>()
  const verteilung = new Map<number, number>()
  const t0 = Date.now()
  for (const z of zeilen) {
    const e = pruefe(z)
    baender += e.baender
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

  console.log(`\nBEFUNDE: ${mitFehler.length} Routen an ${new Set(mitFehler.map((m) => m.z.bahnhof)).size} Bahnhöfen`)
  const nachArt = new Map<string, number>()
  for (const { fehler } of mitFehler) {
    for (const f of fehler) {
      const art = f.replace(/-?\d+/g, 'N').replace(/„[^"]*"/g, '„X"')
      nachArt.set(art, (nachArt.get(art) ?? 0) + 1)
    }
  }
  for (const [art, n] of [...nachArt.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}× ${art}`)
  for (const { z, fehler } of mitFehler.slice(0, 20)) {
    console.log(`  ${z.bahnhof} ${z.gleisAn}→${z.gleisAb} ${z.abschnitt} ${z.variante}: ${fehler.join(' | ')}`)
  }

  console.log(`\nU-FORM (eine Ebene, um den Kopf): ${[...uformen.values()].flat().length} Routen an ${uformen.size} Bahnhöfen`)
  for (const [b, ls] of uformen) console.log(`  ${b}: ${ls.slice(0, 4).join(', ')}${ls.length > 4 ? ` … (+${ls.length - 4})` : ''}`)

  console.log(`\nWEG QUERT DIE GLEISE im Bild: ${queren.size} Gleispaare – ansehen, nicht urteilen`)
  for (const [k, s] of [...queren.entries()].slice(0, 25)) console.log(`  ${k}: ${[...s].join('; ')}`)
}

main()
