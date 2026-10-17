import type { Verkehrsmittel } from '../api/typen'
import { VERKEHRSMITTEL_NAME } from './verkehrsmittelNamen'

/** Kurz genug für eine Marke neben dem Namen. Keine Emoji (DESIGN.md 9). */
const KUERZEL: Record<Verkehrsmittel, string> = {
  bahn: 'Bahn',
  sbahn: 'S',
  ubahn: 'U',
  tram: 'Tram',
  bus: 'Bus',
  faehre: 'Fähre',
  sonstiges: '',
}

/** Feste Reihenfolge – vom Fernverkehr zum Bus, wie auf einer Haltestellentafel. */
const REIHENFOLGE: Verkehrsmittel[] = ['bahn', 'sbahn', 'ubahn', 'tram', 'bus', 'faehre']

/**
 * Kleine Kürzelmarken neben einem Ortsnamen. Für Vorleser eine Zeile
 * („Bahn, S-Bahn, Bus“), fürs Auge die Marken.
 */
export function VerkehrsmittelSymbole({ liste }: { liste: Verkehrsmittel[] }) {
  const sichtbar = REIHENFOLGE.filter((v) => liste.includes(v))
  if (sichtbar.length === 0) return null
  return (
    <span
      className="vm-symbole"
      role="img"
      aria-label={sichtbar.map((v) => VERKEHRSMITTEL_NAME[v]).join(', ')}
    >
      {sichtbar.map((v) => (
        <span key={v} className={`vm-marke vm-${v}`} aria-hidden="true">
          {KUERZEL[v]}
        </span>
      ))}
    </span>
  )
}
