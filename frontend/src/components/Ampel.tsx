import type { Ampelfarbe } from '../api/typen'
import { balkenProzent, restZeitText } from '../navigation/ampel'

interface AmpelProps {
  /** null = keine Abfahrtszeit bekannt → graue Ampel ohne Bewertung */
  farbe: Ampelfarbe | null
  gehzeitSek: number
  /** verbleibende Sekunden bis zur Abfahrt (nur mit Zugauswahl) */
  restSek?: number
  /** Puffer beim Öffnen des Dashboards – Bezugspunkt der Zeitleiste. */
  startPufferSek?: number
  /** Abfahrtszeit ist verstrichen – die Ampel trifft keine Aussage mehr. */
  abgefahren?: boolean
}

const STATUS_TEXT: Record<Ampelfarbe, string> = {
  gruen: 'Entspannt erreichbar',
  gelb: 'Machbar – direkt losgehen',
  rot: 'Sehr knapp – Anschluss gefährdet',
}

function gehzeitText(sek: number): string {
  return `Gehzeit ${Math.ceil(sek / 60)} min`
}

// Ampel nach Screen 2 des Entwurfs: drei Lampen in dunkler Pille, grosse
// Restzeit in Tabellenziffern, darunter eine Zeitleiste, die den Puffer
// ablaufen laesst. Die Leiste bewertet nicht - das macht die Farbe.
export function Ampel({ farbe, gehzeitSek, restSek, startPufferSek, abgefahren }: AmpelProps) {
  const zeigtLeiste = farbe !== null && restSek !== undefined && !abgefahren
  return (
    <div className={`ampel-leiste ampel-${farbe ?? 'grau'}`} role="status">
      <div className="ampel-kopf">
        <div className="ampel-lampen" aria-hidden="true">
          <span className={`ampel-lampe${farbe === 'gruen' ? ' an-gruen' : ''}`} />
          <span className={`ampel-lampe${farbe === 'gelb' ? ' an-gelb' : ''}`} />
          <span className={`ampel-lampe${farbe === 'rot' ? ' an-rot' : ''}`} />
        </div>
        {/* Ohne Abfahrtszeit gar keine Zahl: Ein Platzhalter in 40 px sieht
            aus wie ein Fehler, nicht wie eine fehlende Angabe. */}
        {restSek !== undefined && !abgefahren && farbe !== null && (
          <div className="ampel-rest">{restZeitText(restSek)}</div>
        )}
        <div className="ampel-gehzeit">{gehzeitText(gehzeitSek)}</div>
      </div>

      {zeigtLeiste && (
        <div className="ampel-zeitleiste" aria-hidden="true">
          <div
            className="ampel-zeitleiste-fuellung"
            style={{ width: `${balkenProzent(restSek, startPufferSek ?? restSek)}%` }}
          />
        </div>
      )}

      <div className="ampel-status">
        {farbe !== null
          ? STATUS_TEXT[farbe]
          : abgefahren
            ? 'Zug abgefahren'
            : 'Für die Bewertung fehlt die Abfahrtszeit – wähle deinen Anschlusszug.'}
      </div>
    </div>
  )
}
