/**
 * Die vorberechneten Gehzeiten eines Bahnhofs - gespiegelt aus
 * `backend/scripts/bahnhofsseiten-daten.ts`, das die Dateien in `daten/`
 * schreibt (Konzept Nutzergewinnung AP 5a). Alle Zeiten in Sekunden,
 * normales Gehtempo; gerundet wird erst hier im Frontend.
 */
export type Anlage = 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe'

export type Lage = 'ebenerdig' | 'unterfuehrung' | 'ueberfuehrung' | 'nach-unten' | 'nach-oben'

export interface Gleispaar {
  von: string
  nach: string
  gleicherBahnsteig: boolean
  /** Schnellste Route ab Bahnsteigmitte; null = kein Weg im Plan. */
  sek: number | null
  wechsel: number
  anlagen: Anlage[]
  lage: Lage
  /** Barrierefreie Route; null = nicht moeglich. */
  stufenfreiSek: number | null
}

/** Ein U-Bahn-Steig mit den Wegen zu den Gleisen (`von` = Beschriftung des Steigs). */
export interface UbahnSteigDaten {
  id: string
  label: string
  paare: Gleispaar[]
}

export interface Bahnhofsdaten {
  name: string
  eva: string
  slug: string
  lat: number
  lon: number
  stufe: 1 | 2 | 3
  /** Wann die OSM-Daten geholt wurden (ISO). */
  geholtAm: string
  gleise: string[]
  /** Art je Gleis; fehlt in Daten von vor dem 04.11.2026 (dann: alles Zuege). */
  gleisArt?: Record<string, 'zug' | 'sbahn'>
  /** U-Bahn-Steige; fehlt in Daten von vor dem 04.11.2026. */
  ubahn?: UbahnSteigDaten[]
  paare: Gleispaar[]
}
