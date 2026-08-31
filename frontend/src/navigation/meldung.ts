import type { LiveEreignis } from '../api/typen'

/** Text der Störmeldung – eigene Datei, damit die Komponente nur sich selbst exportiert. */
export function meldungsText(ereignis: LiveEreignis): { titel: string; text: string } {
  const zug = ereignis.zug ? `${ereignis.zug} ` : ''
  if (ereignis.typ === 'gleiswechsel') {
    return {
      titel: 'Gleiswechsel',
      text: `${zug}fährt heute von Gleis ${ereignis.neu} statt ${ereignis.alt}.`,
    }
  }
  return {
    titel: 'Neue Abfahrtszeit',
    text: `${zug}fährt um ${ereignis.neu} statt ${ereignis.alt}.`,
  }
}

/** Nur der Fernverkehr hat eine Wagenreihung mit Bahnsteigabschnitten. */
export function istFernverkehr(zug?: string): boolean {
  return /^(ICE|IC|EC|ECE)\b/i.test((zug ?? '').trim())
}
