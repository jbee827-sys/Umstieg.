import type { Ampelfarbe } from '../api/typen'

interface AmpelProps {
  /** null = keine Live-Daten (keine Zugauswahl) → graue Ampel */
  farbe: Ampelfarbe | null
  gehzeitSek: number
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

// Ampel relativ zur Gehzeit (Konzeptkorrektur 4). Ohne Zugauswahl gibt es
// keine Abfahrtszeit → grau "ohne Live-Daten", nur die Gehzeit wird gezeigt.
export function Ampel({ farbe, gehzeitSek }: AmpelProps) {
  return (
    <div className="ampel-leiste" role="status">
      <div className="ampel-lampen" aria-hidden="true">
        <span className={`ampel-lampe${farbe === 'gruen' ? ' an-gruen' : ''}`} />
        <span className={`ampel-lampe${farbe === 'gelb' ? ' an-gelb' : ''}`} />
        <span className={`ampel-lampe${farbe === 'rot' ? ' an-rot' : ''}`} />
      </div>
      <div className="ampel-text">
        <div className={`ampel-status${farbe === null ? ' grau' : ''}`}>
          {farbe === null ? 'Ohne Live-Daten' : STATUS_TEXT[farbe]}
        </div>
        <div className="ampel-untertitel">
          {farbe === null
            ? `${gehzeitText(gehzeitSek)} · Zugauswahl folgt`
            : gehzeitText(gehzeitSek)}
        </div>
      </div>
    </div>
  )
}
