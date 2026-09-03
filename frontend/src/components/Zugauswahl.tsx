import { useState } from 'react'
import { holeTafel } from '../api/client'
import { FENSTER_NACH_MIN, gruppiereTafel } from '../api/tafelauswahl'
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
  /**
   * Der Zeitpunkt, auf den sich das Fenster bezieht - festgehalten beim
   * Abruf, nicht bei jedem Rendern neu von der Uhr gelesen. Sonst schoebe
   * sich das Fenster bei jedem Tastendruck im Formular weiter, und Zuege
   * verschwaenden aus einer offenen Liste, waehrend man sie ansieht.
   */
  const [geholtUm, setGeholtUm] = useState<Date | null>(null)

  // Geladen wird aus dem Ereignis, das es ausloest, nicht aus einem Effekt:
  // Ein Effekt haette den Abruf erst nach einem zusaetzlichen Rendergang
  // angestossen, und `setLaden(true)` darin einen weiteren erzwungen.
  function klappeUm() {
    const gehtAuf = !offen
    setOffen(gehtAuf)
    if (!gehtAuf || eintraege !== null || laden) return
    setLaden(true)
    setGeholtUm(new Date())
    holeTafel(eva, typ)
      .then((ergebnis) => {
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
      // `holeTafel` fängt heute selbst ab und antwortet mit `{ ok: false }`.
      // Das ist eine Zusicherung des Aufgerufenen, und darauf darf sich der
      // Ladezustand nicht verlassen: Bricht sie, bliebe `setLaden(false)`
      // ungelaufen, und „Tafel wird geladen …" stünde bis zum Neuladen der
      // Seite. Ein hängender Spinner ist die unehrlichste aller Anzeigen –
      // er verspricht, dass gleich etwas kommt.
      .catch(() => {
        setLaden(false)
        setFehler('Live-Tafel derzeit nicht erreichbar.')
      })
  }

  // Abgeleitet, nicht gespeichert: Die Bloecke haengen an nichts als den
  // Eintraegen und dem Abrufzeitpunkt.
  const bloecke = eintraege && geholtUm ? gruppiereTafel(eintraege, geholtUm) : []

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
        onClick={klappeUm}
      >
        {label}
      </button>
      {offen && laden && <div className="lade-hinweis">Tafel wird geladen …</div>}
      {offen && fehler && <div className="hinweis-box">{fehler}</div>}
      {offen && eintraege && bloecke.length === 0 && (
        <div className="hinweis-box">
          Keine Züge in den nächsten {FENSTER_NACH_MIN} Minuten.
        </div>
      )}
      {offen && bloecke.length > 0 && (
        <div className="tafel-bloecke">
          {bloecke.map((block) => (
            <section
              key={block.kategorie}
              className="tafel-block"
              role="group"
              aria-label={block.titel}
            >
              <h3 className="tafel-block-titel">{block.titel}</h3>
              {/* Jede Kategorie rollt fuer sich: Sonst schoebe der
                  Regionalverkehr die S-Bahn aus dem Bild, und man muesste an
                  einer Kategorie vorbeiscrollen, die einen nicht angeht. */}
              <ul className="tafel">
                {block.eintraege.map((eintrag, i) => (
                  <li key={`${eintrag.zug}-${eintrag.zeitSoll}-${i}`}>
                    <button type="button" onClick={() => onAuswahl(eintrag)}>
                      <span className="tafel-zeit">
                        {eintrag.zeitIst ?? eintrag.zeitSoll}
                        {eintrag.zeitIst && <s className="tafel-alt"> {eintrag.zeitSoll}</s>}
                      </span>
                      <span className="tafel-zug">
                        <strong>{eintrag.zug}</strong> {typ === 'arr' ? 'aus' : 'nach'}{' '}
                        {eintrag.ziel}
                      </span>
                      <span className={`tafel-gleis${eintrag.gleisIst ? ' gleiswechsel' : ''}`}>
                        Gl. {eintrag.gleisIst ?? eintrag.gleisSoll}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
