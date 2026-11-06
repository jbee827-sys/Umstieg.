/**
 * Das Stück der Route, das zu EINEM Schritt gehört (Konzept 09: Die Karte
 * muss zum Text passen).
 *
 * Ein Schritt nennt seinen Bereich im Routenpfad (`knotenVon`..`knotenBis`).
 * Die Karte trägt die Route je Ebene als Linien; seit dem 06.11.2026 weiß
 * jede Linie, ab welchem Pfadindex sie beginnt (`knotenAb`). Vorher schnitt
 * die Karte den Bereich aus der Koordinatenliste der gerade gezeigten Ebene -
 * auf jeder Ebene außer der ersten ein anderes Stück als das, das der Text
 * beschreibt.
 *
 * Ein Schritt kann mehrere Ebenen berühren („Zweiter Aufgang rechts, Treppe
 * hoch zu Gleis 3“ läuft unten durch den Gang und endet oben). Deshalb liefert
 * die Funktion die Teile je Ebene.
 */

interface Linie {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties?: Record<string, unknown>
}

interface Sammlung {
  type: 'FeatureCollection'
  features: Linie[]
}

export interface Stueck {
  /** Ebene als Schlüssel der Karte ("-1", "0"). */
  ebene: string
  koordinaten: [number, number][]
}

/**
 * Die Teile des Schritts je Ebene, in der Reihenfolge des Wegs - oder `null`,
 * wenn die Karte keine Pfadindizes trägt (ältere Antworten). Dann weiß
 * niemand, welches Stück gemeint ist, und die Karte zeigt die Ebene ganz.
 */
export function schrittStueck(
  karte: Record<string, unknown>,
  von: number | undefined,
  bis: number | undefined,
): Stueck[] | null {
  if (von === undefined || bis === undefined) return null
  const teile: (Stueck & { ab: number })[] = []
  let mitIndex = false
  for (const [ebene, roh] of Object.entries(karte)) {
    const sammlung = roh as Sammlung
    for (const f of sammlung?.features ?? []) {
      if (f.geometry.type !== 'LineString') continue
      const ab = f.properties?.knotenAb
      if (typeof ab !== 'number') continue
      mitIndex = true
      const punkte = f.geometry.coordinates as [number, number][]
      const anfang = Math.max(von, ab)
      const ende = Math.min(bis, ab + punkte.length - 1)
      if (anfang > ende) continue
      teile.push({ ebene, ab: anfang, koordinaten: punkte.slice(anfang - ab, ende - ab + 1) })
    }
  }
  if (!mitIndex) return null
  return teile.sort((a, b) => a.ab - b.ab).map(({ ebene, koordinaten }) => ({ ebene, koordinaten }))
}
