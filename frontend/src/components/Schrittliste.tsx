import type { Schritt } from '../api/typen'

const EBENENWECHSEL = new Set(['treppe', 'rolltreppe', 'aufzug', 'rampe'])

interface SchrittlisteProps {
  schritte: Schritt[]
  /** Index des aktiven Schritts; undefiniert = keine Hervorhebung. */
  aktiv?: number
}

// Nummerierte Schrittliste in großer Schrift – Text vor Karte (Konzept).
// Ebenenwechsel-Schritte bekommen eine dunkle Nummernkachel als Orientierung.
// Der aktive Schritt wird hervorgehoben, die übrigen bleiben lesbar: Der
// Nutzer soll den Weg im Ganzen behalten, nicht durch ein Guckloch laufen.
export function Schrittliste({ schritte, aktiv }: SchrittlisteProps) {
  return (
    <ol className="schrittliste">
      {schritte.map((schritt, i) => (
        <li
          className={`schritt${aktiv === i ? ' schritt-aktiv' : ''}${
            aktiv !== undefined && i < aktiv ? ' schritt-erledigt' : ''
          }`}
          key={`${i}-${schritt.text}`}
          aria-current={aktiv === i ? 'step' : undefined}
        >
          <span
            className={`schritt-nummer${EBENENWECHSEL.has(schritt.typ) ? ' ebenenwechsel' : ''}`}
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className="schritt-text">{schritt.text}</span>
        </li>
      ))}
    </ol>
  )
}
