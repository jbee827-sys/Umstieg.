import { leisteneintraege, type Bildschirm } from '../navigation/bildschirme'

/**
 * Die Zwei-Gleise-Marke der App: zwei Schienen und der Weg, der von der einen
 * zur anderen wechselt - das Bild, das den Produktnamen traegt.
 *
 * Inline-SVG statt `<img src="/umstieg-logo.svg">`, weil die Marke hier auf
 * roter Flaeche in Weiss stehen muss. Ueber `currentColor` erbt sie die
 * Schriftfarbe des Knopfs und funktioniert damit auch im Dunkelmodus, ohne
 * dass eine zweite Bilddatei noetig waere.
 */
function MarkeZweiGleise() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true" focusable="false">
      <rect x="4" y="14" width="56" height="8" rx="4" fill="currentColor" fillOpacity="0.45" />
      <rect x="4" y="42" width="56" height="8" rx="4" fill="currentColor" fillOpacity="0.45" />
      <path
        d="M18 18v10a8 8 0 0 0 8 8h12a8 8 0 0 1 8 8v2"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

interface NavileisteProps {
  aktuell: Bildschirm
  hatRoute: boolean
  /** Ungelesene Meldungen → Abzeichen mit Anzahl am Eintrag „Meldungen". */
  ungelesen: number
  /** Es gab Meldungen auf dieser Reise – gilt bis „Angekommen". */
  hervorgehoben: boolean
  onWechsel: (ziel: Bildschirm) => void
}

// Untere Leiste. Gesperrte Eintraege bleiben sichtbar, damit der Aufbau der
// App erkennbar ist - sie sind nur nicht antippbar. aria-disabled statt
// disabled, weil ein disabled-Knopf fuer Screenreader ganz verschwindet.
//
// Das Kennzeichen sass bis zum 03.09.2026 am Dashboard, weil die Stoerung
// keinen eigenen Eintrag hatte. Jetzt sitzt es dort, wohin es fuehrt.
export function Navileiste({ aktuell, hatRoute, ungelesen, hervorgehoben, onWechsel }: NavileisteProps) {
  return (
    <nav className="navileiste" aria-label="Bereiche">
      {leisteneintraege(hatRoute).map((e) => {
        const kennzeichnen = e.id === 'meldungen'
        // Die Uebersicht ist der Nordstern: Dort stehen Ampel, beide Gleise
        // und die Routenwahl, von dort geht jede Reise weiter, und dorthin
        // kehrt man zurueck. Deshalb traegt dieser eine Eintrag die Marke und
        // sitzt als Scheibe ueber der Leiste statt neben den anderen.
        const nordstern = e.id === 'dashboard'
        return (
          <button
            key={e.id}
            type="button"
            className={`navileiste-knopf${aktuell === e.id ? ' aktuell' : ''}${
              kennzeichnen && hervorgehoben ? ' hervorgehoben' : ''
            }${nordstern ? ' nordstern' : ''}`}
            aria-disabled={!e.aktiv}
            aria-current={aktuell === e.id ? 'page' : undefined}
            onClick={() => e.aktiv && onWechsel(e.id)}
          >
            {/* Nur Bild, kein Name: Den liefert die Beschriftung darunter,
                die fuer Screenreader unveraendert stehen bleibt. */}
            {nordstern && (
              <span className="navileiste-scheibe" aria-hidden="true">
                <MarkeZweiGleise />
              </span>
            )}
            {e.label}
            {kennzeichnen && ungelesen > 0 && (
              <span
                className="navileiste-abzeichen"
                aria-label={`${ungelesen} ungelesene ${ungelesen === 1 ? 'Meldung' : 'Meldungen'}`}
              >
                {ungelesen}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
