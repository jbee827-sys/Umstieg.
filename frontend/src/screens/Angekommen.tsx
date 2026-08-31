import { istFernverkehr } from '../navigation/meldung'

interface AngekommenProps {
  gleis: string
  /** Gleisabschnitt aus der Wagenreihung, falls bekannt. */
  abschnitt?: string
  abfahrt?: string
  wagen?: string
  /** Restzeit bis zur Abfahrt in Sekunden. */
  restSek?: number
  /** Name des Anschlusszugs – entscheidet über den Wagenkasten. */
  zugAbName?: string
  onNeu: () => void
}

function pufferText(sek?: number): string | null {
  if (sek === undefined) return null
  if (sek <= 0) return 'Abfahrt jetzt'
  return `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`
}

// Screen 6 des Entwurfs: Die gruene Flaeche traegt nur den Haken und die
// Bestaetigung - sie bedeckt etwa ein Drittel. Darunter steht die App wie
// ueberall, damit die untere Leiste gleich bleibt.
export function Angekommen({
  gleis,
  abschnitt,
  abfahrt,
  wagen,
  restSek,
  zugAbName,
  onNeu,
}: AngekommenProps) {
  const puffer = pufferText(restSek)
  const zeigtWagen = istFernverkehr(zugAbName) && (wagen || abschnitt)
  return (
    <>
      <section className="angekommen-flaeche">
        <svg
          width="54"
          height="54"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 13l6 6L21 6" />
        </svg>
        <h1>Du bist da.</h1>
        <p className="angekommen-satz">
          Gleis {gleis}
          {abschnitt ? `, Abschnitt ${abschnitt}` : ''}
        </p>
      </section>

      {(puffer || abfahrt) && (
        <div className="angekommen-kacheln">
          {puffer && (
            <div className="angekommen-kachel">
              <div className="angekommen-kachel-label">Puffer</div>
              <div className="angekommen-kachel-wert">{puffer}</div>
            </div>
          )}
          {abfahrt && (
            <div className="angekommen-kachel">
              <div className="angekommen-kachel-label">Abfahrt</div>
              <div className="angekommen-kachel-wert">{abfahrt}</div>
            </div>
          )}
        </div>
      )}

      {zeigtWagen && (
        <div className="angekommen-wagenkasten">
          {wagen && (
            <>
              Wagen <strong>{wagen}</strong>
              {abschnitt ? ' · ' : ''}
            </>
          )}
          {abschnitt && (
            <>
              Bahnsteigabschnitt <strong>{abschnitt}</strong>
            </>
          )}
        </div>
      )}

      <button type="button" className="knopf-primaer" onClick={onNeu}>
        <span>Neue Reise</span>
      </button>
    </>
  )
}
