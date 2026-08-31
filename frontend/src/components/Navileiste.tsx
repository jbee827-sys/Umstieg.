import { leisteneintraege, type Bildschirm } from '../navigation/bildschirme'

interface NavileisteProps {
  aktuell: Bildschirm
  hatRoute: boolean
  /** Ein Gleiswechsel-Vorschlag liegt vor → Kennzeichen am Dashboard. */
  hinweis: boolean
  onWechsel: (ziel: Bildschirm) => void
}

// Untere Leiste. Gesperrte Eintraege bleiben sichtbar, damit der Aufbau der
// App erkennbar ist - sie sind nur nicht antippbar. aria-disabled statt
// disabled, weil ein disabled-Knopf fuer Screenreader ganz verschwindet.
export function Navileiste({ aktuell, hatRoute, hinweis, onWechsel }: NavileisteProps) {
  return (
    <nav className="navileiste" aria-label="Bereiche">
      {leisteneintraege(hatRoute).map((e) => (
        <button
          key={e.id}
          type="button"
          className={`navileiste-knopf${aktuell === e.id ? ' aktuell' : ''}`}
          aria-disabled={!e.aktiv}
          aria-current={aktuell === e.id ? 'page' : undefined}
          onClick={() => e.aktiv && onWechsel(e.id)}
        >
          {e.label}
          {e.id === 'dashboard' && hinweis && (
            <span className="navileiste-punkt" role="img" aria-label="Gleiswechsel liegt vor" />
          )}
        </button>
      ))}
    </nav>
  )
}
