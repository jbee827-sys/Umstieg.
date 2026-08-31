interface AngekommenProps {
  gleis: string
  /** Gleisabschnitt aus der Wagenreihung, falls bekannt. */
  abschnitt?: string
  abfahrt?: string
  wagen?: string
  onNeu: () => void
}

interface Kachel {
  label: string
  wert: string
}

// Screen 6 des Entwurfs: gross, gruen, ohne Zweifel. Fehlende Werte werden
// WEGGELASSEN, nicht mit den Beispieldaten des Prototyps gefuellt - eine
// erfundene Wagennummer waere schlimmer als keine.
export function Angekommen({ gleis, abschnitt, abfahrt, wagen, onNeu }: AngekommenProps) {
  const kacheln: Kachel[] = [
    ...(abfahrt ? [{ label: 'Abfahrt', wert: abfahrt }] : []),
    ...(wagen ? [{ label: 'Wagen', wert: wagen }] : []),
    ...(abschnitt ? [{ label: 'Abschnitt', wert: abschnitt }] : []),
  ]
  return (
    <div className="angekommen-gruen">
      <div className="kicker-hell">Umstieg.</div>
      <h1>Du bist da.</h1>
      <p className="angekommen-satz">
        Gleis {gleis}
        {abschnitt ? `, Abschnitt ${abschnitt}` : ''} – gute Weiterfahrt.
      </p>
      {kacheln.length > 0 && (
        <div className="angekommen-kacheln">
          {kacheln.map((k) => (
            <div className="angekommen-kachel" key={k.label}>
              <div className="angekommen-kachel-label">{k.label}</div>
              <div className="angekommen-kachel-wert">{k.wert}</div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="knopf-hell" onClick={onNeu}>
        Neue Reise
      </button>
    </div>
  )
}
