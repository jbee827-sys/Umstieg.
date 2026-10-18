import type { LiveEreignis } from '../api/typen'

/** Text der Störmeldung – eigene Datei, damit die Komponente nur sich selbst exportiert. */
export function meldungsText(ereignis: LiveEreignis): { titel: string; text: string } {
  // Im Haltestellenpfad ist `zug` eine Fahrt-ID; zu lesen ist `anzeige`.
  const name = ereignis.anzeige ?? ereignis.zug
  const zug = name ? `${name} ` : ''
  if (ereignis.typ === 'ausfall') {
    return {
      titel: 'Fahrt fällt aus',
      text: `${name ?? 'Deine Fahrt'} fällt aus. Bitte eine andere Verbindung wählen.`,
    }
  }
  if (ereignis.typ === 'gleiswechsel') {
    // `anzeige` traegt nur der Haltestellenpfad - dort ist es ein Steig.
    const ort = ereignis.anzeige !== undefined ? 'Steig' : 'Gleis'
    return {
      titel: `${ort}wechsel`,
      text: `${zug}fährt heute von ${ort} ${ereignis.neu} statt ${ereignis.alt}.`,
    }
  }
  return {
    titel: 'Neue Abfahrtszeit',
    text: `${zug}fährt um ${ereignis.neu} statt ${ereignis.alt}.`,
  }
}

/** "2026-08-27T14:32:10.000Z" → "14:32" in Ortszeit. */
export function uhrzeit(iso: string): string {
  const zeitpunkt = new Date(iso)
  if (Number.isNaN(zeitpunkt.getTime())) return '–'
  return zeitpunkt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/** Nur der Fernverkehr hat eine Wagenreihung mit Bahnsteigabschnitten. */
export function istFernverkehr(zug?: string): boolean {
  return /^(ICE|IC|EC|ECE)\b/i.test((zug ?? '').trim())
}
