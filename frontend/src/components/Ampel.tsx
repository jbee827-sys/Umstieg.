import type { Ampelfarbe } from '../api/typen'

interface AmpelProps {
  /** null = keine Live-Daten (keine Zugauswahl) → graue Ampel */
  farbe: Ampelfarbe | null
  gehzeitSek: number
  /** verbleibende Sekunden bis zur Abfahrt (nur mit Zugauswahl) */
  restSek?: number
  /** Abfahrtszeit ist verstrichen – die Ampel trifft keine Aussage mehr. */
  abgefahren?: boolean
}

const STATUS_TEXT: Record<Ampelfarbe, string> = {
  gruen: 'Entspannt erreichbar',
  gelb: 'Machbar – direkt losgehen',
  rot: 'Sehr knapp – Anschluss gefährdet',
}

function gehzeitText(sek: number): string {
  const min = Math.ceil(sek / 60)
  return min <= 1 ? 'ca. 1 Minute Gehzeit' : `ca. ${min} Minuten Gehzeit`
}

function restText(sek: number): string {
  if (sek <= 0) return 'Abfahrt jetzt'
  const min = Math.floor(sek / 60)
  const rest = Math.floor(sek % 60)
  return `${min}:${String(rest).padStart(2, '0')} bis Abfahrt`
}

// Ampel relativ zur Gehzeit (Konzeptkorrektur 4). Ohne Zugauswahl gibt es
// keine Abfahrtszeit → grau "ohne Live-Daten", nur die Gehzeit wird gezeigt.
export function Ampel({ farbe, gehzeitSek, restSek, abgefahren }: AmpelProps) {
  return (
    <div className="ampel-leiste" role="status">
      <div className="ampel-lampen" aria-hidden="true">
        <span className={`ampel-lampe${farbe === 'gruen' ? ' an-gruen' : ''}`} />
        <span className={`ampel-lampe${farbe === 'gelb' ? ' an-gelb' : ''}`} />
        <span className={`ampel-lampe${farbe === 'rot' ? ' an-rot' : ''}`} />
      </div>
      <div className="ampel-text">
        <div className={`ampel-status${farbe === null ? ' grau' : ''}`}>
          {farbe !== null ? STATUS_TEXT[farbe] : abgefahren ? 'Zug abgefahren' : 'Ohne Live-Daten'}
        </div>
        <div className="ampel-untertitel">
          {abgefahren
            ? gehzeitText(gehzeitSek)
            : farbe === null || restSek === undefined
              ? `${gehzeitText(gehzeitSek)} · Zugauswahl für die Ampel nötig`
              : `${restText(restSek)} · ${gehzeitText(gehzeitSek)}`}
        </div>
      </div>
    </div>
  )
}
