import type { KantenTyp, Schritt } from '../api/typen'

export interface SchemaBand {
  level: number
  /** "EBENE +1", "EBENE 0", "EBENE −2" – mit echtem Minuszeichen wie im Entwurf. */
  label: string
  gleise: string[]
  aktiv: boolean
}

export interface SchemaWechsel {
  vonLevel: number
  nachLevel: number
  typ: KantenTyp
}

export interface SchemaModell {
  baender: SchemaBand[]
  wechsel: SchemaWechsel[]
}

const EBENENWECHSEL = new Set<string>(['treppe', 'rolltreppe', 'aufzug', 'rampe'])

/** U+2212 statt Bindestrich – der Entwurf schreibt „EBENE −2". */
function ebenenLabel(level: number): string {
  if (level === 0) return 'EBENE 0'
  return level > 0 ? `EBENE +${level}` : `EBENE \u2212${Math.abs(level)}`
}

/**
 * Leitet aus den Schritten einer Route ein maßstabsfreies Ebenenschema ab.
 *
 * Bewusst KEINE Landkarte: Der Entwurf zeigt drei Ebenenbänder mit
 * Gleisnummern, keine Geografie. Eine Straßenkarte hilft in einer
 * geschlossenen Halle nicht, und bei Stufe 3 wäre sie sogar gelogen.
 *
 * Reine Funktion, damit der fehleranfälligste Teil des Umbaus ohne DOM
 * prüfbar bleibt.
 */
export function leiteSchemaAb(
  schritte: Schritt[],
  aktiv: number,
  gleisAn: string,
  gleisAb: string,
): SchemaModell {
  const mitLevel = schritte.filter((s) => s.level !== undefined)

  // Ohne Ebenenangaben (Stufe 3, ältere Antworten) bleibt ein einziges Band.
  // Ein erfundener Ebenenaufbau wäre schlechter als gar keiner.
  if (mitLevel.length === 0) {
    return {
      baender: [
        {
          level: 0,
          label: ebenenLabel(0),
          gleise: gleisAn === gleisAb ? [gleisAn] : [gleisAn, gleisAb],
          aktiv: true,
        },
      ],
      wechsel: [],
    }
  }

  const ebenen = [...new Set(mitLevel.map((s) => s.level!))].sort((a, b) => b - a)
  const aktivesLevel = schritte[aktiv]?.level

  const startLevel = mitLevel[0].level!
  const zielLevel = mitLevel[mitLevel.length - 1].level!

  const baender: SchemaBand[] = ebenen.map((level) => {
    const gleise: string[] = []
    if (level === startLevel) gleise.push(gleisAn)
    if (level === zielLevel && gleisAb !== gleisAn) gleise.push(gleisAb)
    return { level, label: ebenenLabel(level), gleise, aktiv: level === aktivesLevel }
  })

  // Ein Wechsel zählt nur, wenn sich die Ebene tatsächlich ändert – ein
  // Aufzug, der auf derselben Ebene endet, ist keiner.
  const wechsel: SchemaWechsel[] = []
  for (let i = 1; i < schritte.length; i++) {
    const s = schritte[i]
    const vorher = schritte[i - 1]
    if (!EBENENWECHSEL.has(s.typ)) continue
    if (s.level === undefined || vorher.level === undefined) continue
    if (s.level === vorher.level) continue
    wechsel.push({ vonLevel: vorher.level, nachLevel: s.level, typ: s.typ as KantenTyp })
  }

  return { baender, wechsel }
}
