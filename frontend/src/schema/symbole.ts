import type { KantenTyp } from '../api/typen'

/**
 * Anlagen als Symbole, nicht als Striche.
 *
 * Bis zum 14.09.2026 stand eine Rolltreppe als durchgezogener, eine Treppe als
 * gestrichelter Strich im Balken, ein Aufzug als Kasten. Auf dem Telefon war
 * das kaum zu unterscheiden, und wo mehrere Anlagen an einer Stelle liegen
 * (München, Gleis 81/82: 22 Anlagen an fünf Stellen), stand ein Fleck.
 *
 * Hier steht, was an einem Ort gezeigt wird und wo es im Balken sitzt – ohne
 * DOM, damit die Simulation es über alle abgelegten Bahnhöfe prüfen kann.
 */
export type Symboltyp = 'rolltreppe' | 'treppe' | 'aufzug'

/** Seitenlänge eines Symbols im Balken, in Zeichenpunkten. */
export const SYMBOL_PX = 11
/** Luft zwischen den Symbolen EINES Orts. */
const INNEN_PX = 2
/** Luft zwischen zwei Orten und zwischen Symbol und Punkt. */
const LUFT_PX = 2.5
/** Näher als das im Bild: derselbe Ort. */
const ORT_PX = 10
/** So nah an einer roten Scheibe gibt ein Ort seine Anlage an sie ab. */
const ABGABE_PX = 12

export function istSymboltyp(typ: string): typ is Symboltyp {
  return typ === 'rolltreppe' || typ === 'treppe' || typ === 'aufzug'
}

/** Anlagen, die im Bild beieinanderliegen. */
export interface Anlagenort {
  x: number
  typen: Set<Symboltyp>
}

/** Ein Symbol, fertig gesetzt: Mitte in Zeichenkoordinaten. */
export interface GesetztesSymbol {
  x: number
  typ: Symboltyp
}

/** Etwas, das auf dem Balken stehen bleibt – der Standort, eine rote Scheibe. */
export interface Hindernis {
  x: number
  breite: number
}

/** Fasst Marken zu Orten zusammen: höchstens `ORT_PX` bis zur nächsten. */
export function orteAuf(marken: readonly { x: number; typ: KantenTyp }[]): Anlagenort[] {
  const sortiert = marken.filter((m) => istSymboltyp(m.typ)).sort((a, b) => a.x - b.x)
  const gruppen: { xs: number[]; typen: Set<Symboltyp> }[] = []
  for (const m of sortiert) {
    const letzte = gruppen[gruppen.length - 1]
    if (letzte && m.x - letzte.xs[letzte.xs.length - 1] <= ORT_PX) {
      letzte.xs.push(m.x)
      letzte.typen.add(m.typ as Symboltyp)
    } else {
      gruppen.push({ xs: [m.x], typen: new Set([m.typ as Symboltyp]) })
    }
  }
  return gruppen.map((g) => ({ x: g.xs.reduce((s, x) => s + x, 0) / g.xs.length, typen: g.typen }))
}

/**
 * Was an einem Ort steht: höchstens EIN Symbol für Treppe oder Rolltreppe –
 * die Rolltreppe, wenn es sie gibt –, und der Aufzug daneben.
 */
export function symboleAm(typen: Iterable<Symboltyp>): Symboltyp[] {
  const da = new Set(typen)
  const symbole: Symboltyp[] = []
  if (da.has('rolltreppe')) symbole.push('rolltreppe')
  else if (da.has('treppe')) symbole.push('treppe')
  if (da.has('aufzug')) symbole.push('aufzug')
  return symbole
}

/**
 * Wo eine rote Scheibe steht, zeigt SIE die Anlage, die der Weg nimmt.
 *
 * Der Ort daneben gibt deshalb ab: Treppe UND Rolltreppe, wenn der Weg eine
 * von beiden nimmt – sonst stünde neben der Scheibe „Treppe" noch eine
 * Rolltreppe, und die Regel „ein Symbol je Ort" gälte nicht mehr. Ein Aufzug
 * am selben Ort bleibt stehen.
 */
export function ohneGenutzte(
  orte: readonly Anlagenort[],
  genutzt: readonly { x: number; typ: KantenTyp }[],
): Anlagenort[] {
  const rest = orte.map((o) => ({ x: o.x, typen: new Set(o.typen) }))
  for (const g of genutzt) {
    if (!istSymboltyp(g.typ)) continue
    const naechster = rest
      .filter((o) => Math.abs(o.x - g.x) <= ABGABE_PX)
      .sort((a, b) => Math.abs(a.x - g.x) - Math.abs(b.x - g.x))[0]
    if (!naechster) continue
    if (g.typ === 'aufzug') naechster.typen.delete('aufzug')
    else {
      naechster.typen.delete('rolltreppe')
      naechster.typen.delete('treppe')
    }
  }
  return rest.filter((o) => o.typen.size > 0)
}

/** Ein Ort, der auf einen Abschnitt wartet – `n` zählt, wie viele Orte in ihm aufgingen. */
interface Stueck {
  x: number
  n: number
  typen: Set<Symboltyp>
}

function breiteVon(typen: Set<Symboltyp>): number {
  const zahl = symboleAm(typen).length
  return zahl * SYMBOL_PX + Math.max(0, zahl - 1) * INNEN_PX
}

function gesamtBreite(stuecke: readonly Stueck[]): number {
  return stuecke.reduce((s, st) => s + breiteVon(st.typen), 0) + Math.max(0, stuecke.length - 1) * LUFT_PX
}

/**
 * Setzt die Symbole aller Orte auf einen Balken von `x1` bis `x2`.
 *
 * Punkte (`hindernisse`) bleiben stehen: Sie sagen, wo jemand ist, und das
 * verschiebt man nicht, um Platz zu schaffen. Der Balken zerfällt an ihnen in
 * freie Abschnitte; jeder Ort kommt in den Abschnitt, in dem er liegt, sonst
 * in den nächsten. Passt ein Abschnitt nicht, werden die beiden nächsten Orte
 * EIN Ort – mit derselben Regel, Rolltreppe vor Treppe, Aufzug daneben. So
 * steht nie ein Symbol über dem Balkenende, auf einem Punkt oder auf einem
 * anderen Symbol: nicht, weil es geprüft, sondern weil es so gebaut ist.
 *
 * Bis zum 14.09.2026 wurde nur geschoben. Auf kurzen Balken und zwischen zwei
 * dichten Punkten fand das keine Lösung – die Simulation zählte 191 Symbole
 * über dem Balkenende und 304 auf einem Punkt.
 */
export function setzeSymbole(
  orte: readonly Anlagenort[],
  hindernisse: readonly Hindernis[],
  x1: number,
  x2: number,
): GesetztesSymbol[] {
  const abschnitte: { von: number; bis: number; stuecke: Stueck[] }[] = []
  let von = x1
  for (const h of [...hindernisse].sort((a, b) => a.x - b.x)) {
    const bis = h.x - h.breite / 2 - LUFT_PX
    if (bis - von >= SYMBOL_PX) abschnitte.push({ von, bis, stuecke: [] })
    von = Math.max(von, h.x + h.breite / 2 + LUFT_PX)
  }
  if (x2 - von >= SYMBOL_PX) abschnitte.push({ von, bis: x2, stuecke: [] })
  if (abschnitte.length === 0) return []

  for (const o of orte) {
    if (symboleAm(o.typen).length === 0) continue
    const abstand = (a: (typeof abschnitte)[number]): number =>
      o.x < a.von ? a.von - o.x : o.x > a.bis ? o.x - a.bis : 0
    const ziel = abschnitte.reduce((best, a) => (abstand(a) < abstand(best) ? a : best))
    ziel.stuecke.push({ x: o.x, n: 1, typen: new Set(o.typen) })
  }

  const gesetzt: GesetztesSymbol[] = []
  for (const a of abschnitte) {
    const st = a.stuecke.sort((p, q) => p.x - q.x)
    const laenge = a.bis - a.von
    while (st.length > 1 && gesamtBreite(st) > laenge) {
      let k = 0
      for (let i = 1; i < st.length - 1; i++) if (st[i + 1].x - st[i].x < st[k + 1].x - st[k].x) k = i
      const [p, q] = [st[k], st[k + 1]]
      st.splice(k, 2, {
        x: (p.x * p.n + q.x * q.n) / (p.n + q.n),
        n: p.n + q.n,
        typen: new Set([...p.typen, ...q.typen]),
      })
    }
    // Zwei Symbole, aber nur Platz für eines: Der Aufzug bleibt. Er ist
    // seltener, und für manche ist er der einzige Weg.
    if (st.length === 1 && breiteVon(st[0].typen) > laenge) {
      const [erstes] = symboleAm(st[0].typen)
      st[0].typen = new Set([st[0].typen.has('aufzug') ? 'aufzug' : erstes])
    }

    const links = st.map((s) => Math.max(a.von, s.x - breiteVon(s.typen) / 2))
    for (let i = 1; i < st.length; i++) {
      links[i] = Math.max(links[i], links[i - 1] + breiteVon(st[i - 1].typen) + LUFT_PX)
    }
    let grenze = a.bis
    for (let i = st.length - 1; i >= 0; i--) {
      const w = breiteVon(st[i].typen)
      if (links[i] + w > grenze) links[i] = grenze - w
      grenze = links[i] - LUFT_PX
    }
    st.forEach((s, i) => {
      symboleAm(s.typen).forEach((typ, k) => {
        gesetzt.push({ x: links[i] + SYMBOL_PX / 2 + k * (SYMBOL_PX + INNEN_PX), typ })
      })
    })
  }
  return gesetzt.sort((p, q) => p.x - q.x)
}

/** Anlagen im Grundriss näher als das: ein Ort. */
const ORT_GRUNDRISS_PX = 12
/** Um eine rote Scheibe bleibt der Grundriss frei – sie IST die Anlage. */
const FREI_UM_SCHEIBE_PX = 14
/** Höhe eines Schilds im Grundriss. */
const SCHILD_H = 15

/** Breite des hellen Schilds, auf dem die Symbole eines Orts im Grundriss stehen. */
export function schildBreite(anzahl: number): number {
  return anzahl * (SYMBOL_PX + 2) + 2
}

export interface Grundrissort {
  x: number
  y: number
  symbole: Symboltyp[]
}

/**
 * Die Anlagen einer Übergangsebene als Orte im Grundriss.
 *
 * Was näher als `ORT_GRUNDRISS_PX` beieinanderliegt, ist ein Ort; dort gilt
 * dieselbe Regel wie im Balken. Und was sich dann noch überdecken würde, wird
 * ebenfalls ein Ort – bis kein Schild mehr ein anderes berührt. Wo eine rote
 * Scheibe steht (`frei`), bleibt der Grundriss frei.
 */
export function orteImGrundriss(
  anlagen: readonly { x: number; y: number; typ: KantenTyp }[],
  frei: readonly { x: number; y: number }[],
): Grundrissort[] {
  const orte: { x: number; y: number; n: number; typen: Set<Symboltyp> }[] = []
  for (const a of anlagen) {
    if (!istSymboltyp(a.typ)) continue
    const ort = orte.find((o) => Math.hypot(o.x - a.x, o.y - a.y) <= ORT_GRUNDRISS_PX)
    if (ort) {
      ort.x = (ort.x * ort.n + a.x) / (ort.n + 1)
      ort.y = (ort.y * ort.n + a.y) / (ort.n + 1)
      ort.n += 1
      ort.typen.add(a.typ)
    } else {
      orte.push({ x: a.x, y: a.y, n: 1, typen: new Set([a.typ]) })
    }
  }

  const deckt = (p: (typeof orte)[number], q: (typeof orte)[number]): boolean =>
    Math.abs(p.x - q.x) < (schildBreite(symboleAm(p.typen).length) + schildBreite(symboleAm(q.typen).length)) / 2 &&
    Math.abs(p.y - q.y) < SCHILD_H
  let paar = true
  while (paar) {
    paar = false
    for (let i = 0; i < orte.length && !paar; i++) {
      for (let k = i + 1; k < orte.length && !paar; k++) {
        if (!deckt(orte[i], orte[k])) continue
        const [p, q] = [orte[i], orte[k]]
        orte[i] = {
          x: (p.x * p.n + q.x * q.n) / (p.n + q.n),
          y: (p.y * p.n + q.y * q.n) / (p.n + q.n),
          n: p.n + q.n,
          typen: new Set([...p.typen, ...q.typen]),
        }
        orte.splice(k, 1)
        paar = true
      }
    }
  }

  return orte
    .filter((o) => !frei.some((f) => Math.hypot(f.x - o.x, f.y - o.y) <= FREI_UM_SCHEIBE_PX))
    .map((o) => ({ x: o.x, y: o.y, symbole: symboleAm(o.typen) }))
}
