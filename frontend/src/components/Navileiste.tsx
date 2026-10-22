import { leisteneintraege, type Bildschirm } from '../navigation/bildschirme'

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
//
// Alle vier Eintraege sind gleichrangig. Vom 21.09. bis 05.10.2026 trug
// „Uebersicht" die Zwei-Gleise-Marke auf einer roten Scheibe ueber der Leiste
// (der „Nordstern") - auf Wunsch entfernt.
export function Navileiste({ aktuell, hatRoute, ungelesen, hervorgehoben, onWechsel }: NavileisteProps) {
  return (
    <nav className="navileiste" aria-label="Bereiche" data-tour="leiste">
      {leisteneintraege(hatRoute).map((e) => {
        const kennzeichnen = e.id === 'meldungen'
        return (
          <button
            key={e.id}
            type="button"
            className={`navileiste-knopf${aktuell === e.id ? ' aktuell' : ''}${
              kennzeichnen && hervorgehoben ? ' hervorgehoben' : ''
            }`}
            aria-disabled={!e.aktiv}
            aria-current={aktuell === e.id ? 'page' : undefined}
            onClick={() => e.aktiv && onWechsel(e.id)}
          >
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
