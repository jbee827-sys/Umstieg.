import type { Schritt } from '../api/typen'

const EBENENWECHSEL = new Set(['treppe', 'rolltreppe', 'aufzug', 'rampe'])

// Nummerierte Schrittliste in großer Schrift – Text vor Karte (Konzept).
// Ebenenwechsel-Schritte bekommen eine dunkle Nummernkachel als Orientierung.
export function Schrittliste({ schritte }: { schritte: Schritt[] }) {
  return (
    <ol className="schrittliste">
      {schritte.map((schritt, i) => (
        <li className="schritt" key={`${i}-${schritt.text}`}>
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
