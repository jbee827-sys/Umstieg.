import type { ReactNode } from 'react'
import type { Schritt } from '../api/typen'
import { istSymboltyp } from '../schema/symbole'
import { AnlagenSymbol } from './AnlagenSymbol'
import { Schrittliste } from './Schrittliste'

interface SchrittsheetProps {
  schritte: Schritt[]
  position: number
  onZurueck: () => void
  onWeiter: () => void
  /** Beim LETZTEN Schritt tritt dieser Knopf an die Stelle von „Weiter". */
  onAngekommen: () => void
  /** Nebeninhalte, die unter der vollen Liste im Aufklapper stehen. */
  zusatz?: ReactNode
}

function detail(schritt: Schritt): string | null {
  const teile: string[] = []
  if (schritt.distanzM !== undefined) teile.push(`${Math.round(schritt.distanzM)} m`)
  if (schritt.sekunden !== undefined) teile.push(`ca. ${Math.max(1, Math.round(schritt.sekunden))} s`)
  return teile.length > 0 ? teile.join(' · ') : null
}

// Unteres Sheet nach Screen 3: EIN Schritt zur Zeit, gross lesbar. Es klebt
// am unteren Bildschirmrand wie die Navileiste - man soll den naechsten
// Schritt weiterschalten koennen, ohne das Bild oben wegzurollen.
//
// Die vollstaendige Liste bleibt aufklappbar erreichbar - unterwegs will man
// einen Schritt, beim Planen den ganzen Weg. Was sonst noch zur Route gehoert
// (Karte, Streckenhinweise), steht als `zusatz` darunter: erreichbar, aber
// nicht im Weg.
export function Schrittsheet({
  schritte,
  position,
  onZurueck,
  onWeiter,
  onAngekommen,
  zusatz,
}: SchrittsheetProps) {
  const aktuell = schritte[position]
  if (!aktuell) return null
  const zusatztext = detail(aktuell)
  const amZiel = position >= schritte.length - 1
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
      {zusatztext && <p className="schrittsheet-detail">{zusatztext}</p>}
      <div className="schrittsheet-knoepfe">
        <button
          type="button"
          className="knopf-sekundaer"
          onClick={onZurueck}
          disabled={position === 0}
        >
          Zurück
        </button>
        {/* Am Ziel gibt es kein „Weiter" mehr. Ein ausgegrauter Knopf sagte
            nur, dass es nicht weitergeht; die naechste Handlung ist aber
            bekannt - und sie steht in Gruen, wie die Angekommen-Seite. */}
        {amZiel ? (
          <button type="button" className="knopf-angekommen" onClick={onAngekommen}>
            <span>Angekommen</span>
          </button>
        ) : (
          <button type="button" className="knopf-primaer" onClick={onWeiter}>
            <span>Weiter</span>
          </button>
        )}
      </div>
      <details className="schrittsheet-liste">
        <summary>Alle Schritte</summary>
        <Schrittliste schritte={schritte} aktiv={position} />
        {zusatz}
      </details>
    </section>
  )
}
