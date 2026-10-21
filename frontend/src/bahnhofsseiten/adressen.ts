import type { Bahnhofsdaten } from './typen'

/** Adresse einer Bahnhofsseite - ohne Schraegstrich am Ende (vercel.json: trailingSlash false). */
export const BAHNHOF_PFAD = (slug: string) => `/bahnhof/${slug}`

/**
 * In die App, mit vorbelegtem Bahnhof (Konzept 5c.1). Name und Lage reisen
 * mit, damit die Eingabe den Ort ohne Nachschlagen setzen kann
 * (sitzung/vorbelegung.ts). Die Abfragezeichenkette erreicht die Messung
 * nicht - `ohneAbfrage` schneidet sie ab.
 */
export function eingabeLink(d: Bahnhofsdaten): string {
  const abfrage = new URLSearchParams({ bahnhof: d.eva, name: d.name, lat: String(d.lat), lon: String(d.lon) })
  return `/eingabe?${abfrage.toString()}`
}
