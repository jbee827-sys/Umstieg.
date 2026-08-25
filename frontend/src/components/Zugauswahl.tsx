import { useEffect, useState } from 'react'
import { holeTafel } from '../api/client'
import type { TafelEintrag } from '../api/typen'

interface ZugauswahlProps {
  eva: string
  typ: 'arr' | 'dep'
  label: string
  auswahl: TafelEintrag | null
  onAuswahl: (eintrag: TafelEintrag | null) => void
}

// Live-Tafel zum Antippen: übernimmt Zug, Gleis und Zeit inklusive bekannter
// Änderungen (Gleiswechsel rot markiert). Optional – reine Gleiseingabe bleibt möglich.
export function Zugauswahl({ eva, typ, label, auswahl, onAuswahl }: ZugauswahlProps) {
  const [offen, setOffen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [eintraege, setEintraege] = useState<TafelEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!offen || eintraege !== null || laden) return
    setLaden(true)
    holeTafel(eva, typ).then((ergebnis) => {
      setLaden(false)
      if (ergebnis.ok) {
        setEintraege(ergebnis.eintraege)
        setFehler(null)
      } else {
        setFehler(
          ergebnis.fehler === 'db-zugang-fehlt'
            ? 'Live-Tafel nicht verfügbar (kein DB-Zugang) – Gleis bitte manuell eingeben.'
            : 'Live-Tafel derzeit nicht erreichbar.',
        )
      }
    })
  }, [offen, eintraege, laden, eva, typ])

  if (auswahl) {
    return (
      <div className="zug-gewaehlt">
        <div className="zug-gewaehlt-text">
          <strong>{auswahl.zug}</strong>
          <span>
            {typ === 'arr' ? 'aus' : 'nach'} {auswahl.ziel} ·{' '}
            {auswahl.zeitIst ?? auswahl.zeitSoll}
            {auswahl.gleisIst ? (
              <strong className="gleiswechsel"> · Gleis {auswahl.gleisIst} (geändert!)</strong>
            ) : (
              <> · Gleis {auswahl.gleisSoll}</>
            )}
          </span>
        </div>
        <button type="button" className="knopf-sekundaer" onClick={() => onAuswahl(null)}>
          Ändern
        </button>
      </div>
    )
  }

  return (
    <div className="zugauswahl">
      <button
        type="button"
        className="knopf-sekundaer"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        {label}
      </button>
      {offen && laden && <div className="lade-hinweis">Tafel wird geladen …</div>}
      {offen && fehler && <div className="hinweis-box">{fehler}</div>}
      {offen && eintraege && eintraege.length === 0 && (
        <div className="hinweis-box">Keine Züge in der aktuellen Stunde gefunden.</div>
      )}
      {offen && eintraege && eintraege.length > 0 && (
        <ul className="tafel">
          {eintraege.map((eintrag, i) => (
            <li key={`${eintrag.zug}-${eintrag.zeitSoll}-${i}`}>
              <button type="button" onClick={() => onAuswahl(eintrag)}>
                <span className="tafel-zeit">
                  {eintrag.zeitIst ?? eintrag.zeitSoll}
                  {eintrag.zeitIst && <s className="tafel-alt"> {eintrag.zeitSoll}</s>}
                </span>
                <span className="tafel-zug">
                  <strong>{eintrag.zug}</strong> {typ === 'arr' ? 'aus' : 'nach'} {eintrag.ziel}
                </span>
                <span className={`tafel-gleis${eintrag.gleisIst ? ' gleiswechsel' : ''}`}>
                  Gl. {eintrag.gleisIst ?? eintrag.gleisSoll}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
