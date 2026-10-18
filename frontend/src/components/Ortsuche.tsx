import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sucheOrte } from '../api/orte'
import type { OrteAntwort, Ort } from '../api/typen'
import { ortSchluessel } from '../ort/ortmodell'
import { VerkehrsmittelSymbole } from '../ort/verkehrsmittel'

export type OrtsucheStand = OrteAntwort['quellen'] | 'netz' | 'nicht-verfuegbar'

interface OrtsucheProps {
  id: string
  label: ReactNode
  platzhalter: string
  text: string
  gewaehlt: Ort | null
  /** Der Nutzer tippt – die Wahl ist damit aufgehoben. */
  onText: (t: string) => void
  onWahl: (o: Ort | null) => void
  /** Ergebnis der letzten Suche – für EVA-Ersatzeingabe und Hinweise in der Eingabe. */
  onQuellen?: (q: OrtsucheStand) => void
  /** Steht hinter dem „✓ Name“ der Wahl, z. B. „ · automatisch erkannt“. */
  wahlHinweis?: string
  /** Unter dem Feld, z. B. die Orte in der Nähe oder ein Hinweis. */
  zusatz?: ReactNode
}

/**
 * Suchfeld für einen Ort – Bahnhof oder Haltestelle (Umstieg 2.0, E3).
 *
 * Entprellt (300 ms) und erst ab zwei Zeichen: sonst fragte jeder
 * Tastenanschlag das Backend und dahinter Transitous.
 */
export function Ortsuche({
  id,
  label,
  platzhalter,
  text,
  gewaehlt,
  onText,
  onWahl,
  onQuellen,
  wahlHinweis,
  zusatz,
}: OrtsucheProps) {
  const [vorschlaege, setVorschlaege] = useState<Ort[]>([])
  const suchTimer = useRef<number | undefined>(undefined)
  // Der Rückruf darf sich bei jedem Rendern ändern, ohne die Suche neu zu starten.
  const meldeQuellen = useRef(onQuellen)
  useEffect(() => {
    meldeQuellen.current = onQuellen
  })

  useEffect(() => {
    window.clearTimeout(suchTimer.current)
    if (gewaehlt || text.trim().length < 2) return
    // Eine spaete Antwort fuer einen alten Suchtext wird verworfen - sonst
    // ueberschriebe sie die Vorschlaege und den Quellenstand der neueren.
    let gueltig = true
    suchTimer.current = window.setTimeout(async () => {
      const ergebnis = await sucheOrte(text.trim())
      if (!gueltig) return
      if (ergebnis.ok) {
        setVorschlaege(ergebnis.antwort.orte.slice(0, 6))
        meldeQuellen.current?.(ergebnis.antwort.quellen)
      } else {
        // Frueher fiel ein Netzfehler durch: keine Vorschlaege, keine
        // Meldung - die App sah aus, als tue sie gar nichts.
        setVorschlaege([])
        meldeQuellen.current?.(ergebnis.fehler)
      }
    }, 300)
    return () => {
      gueltig = false
      window.clearTimeout(suchTimer.current)
    }
  }, [text, gewaehlt])

  // Abgeleitet statt gespeichert: Vorschlaege gehoeren zu einem Suchtext ab
  // zwei Zeichen ohne getroffene Wahl.
  const sichtbar = gewaehlt || text.trim().length < 2 ? [] : vorschlaege

  return (
    <div className="feld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="eingabefeld"
        type="text"
        autoComplete="off"
        placeholder={platzhalter}
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
      {sichtbar.length > 0 && (
        <ul className="vorschlaege">
          {sichtbar.map((ort) => (
            <li key={ortSchluessel(ort)}>
              <button
                type="button"
                className="ort-vorschlag"
                onClick={() => {
                  setVorschlaege([])
                  onWahl(ort)
                }}
              >
                <span className="ort-name">{ort.name}</span>
                <VerkehrsmittelSymbole liste={ort.verkehrsmittel} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {gewaehlt && (
        <span className="bahnhof-gewaehlt">
          ✓ {gewaehlt.name}
          {wahlHinweis}
        </span>
      )}
      {zusatz}
    </div>
  )
}
