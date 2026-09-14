import type { Schritt } from '../api/typen'
import { istSymboltyp } from '../schema/symbole'
import { AnlagenSymbol } from './AnlagenSymbol'
import { Schrittliste } from './Schrittliste'

interface SchrittsheetProps {
  schritte: Schritt[]
  position: number
  onZurueck: () => void
  onWeiter: () => void
}

function detail(schritt: Schritt): string | null {
  const teile: string[] = []
  if (schritt.distanzM !== undefined) teile.push(`${Math.round(schritt.distanzM)} m`)
  if (schritt.sekunden !== undefined) teile.push(`ca. ${Math.max(1, Math.round(schritt.sekunden))} s`)
  return teile.length > 0 ? teile.join(' · ') : null
}

// Unteres Sheet nach Screen 3: EIN Schritt zur Zeit, gross lesbar.
// Die vollstaendige Liste bleibt aufklappbar erreichbar - unterwegs will man
// einen Schritt, beim Planen den ganzen Weg.
export function Schrittsheet({ schritte, position, onZurueck, onWeiter }: SchrittsheetProps) {
  const aktuell = schritte[position]
  if (!aktuell) return null
  const zusatz = detail(aktuell)
  return (
    <section className="schrittsheet" aria-live="polite">
      <div className="schrittsheet-zaehler">
        Schritt {position + 1} von {schritte.length}
      </div>
      {istSymboltyp(aktuell.typ) ? (
        <p className="schrittsheet-text mit-symbol">
          <AnlagenSymbol typ={aktuell.typ} groesse={30} strich={2.3} />
          <span>{aktuell.text}</span>
        </p>
      ) : (
        <p className="schrittsheet-text">{aktuell.text}</p>
      )}
      {zusatz && <p className="schrittsheet-detail">{zusatz}</p>}
      <div className="schrittsheet-knoepfe">
        <button
          type="button"
          className="knopf-sekundaer"
          onClick={onZurueck}
          disabled={position === 0}
        >
          Zurück
        </button>
        <button
          type="button"
          className="knopf-primaer"
          onClick={onWeiter}
          disabled={position >= schritte.length - 1}
        >
          <span>Weiter</span>
        </button>
      </div>
      <details className="schrittsheet-liste">
        <summary>Alle Schritte</summary>
        <Schrittliste schritte={schritte} aktiv={position} />
      </details>
    </section>
  )
}
