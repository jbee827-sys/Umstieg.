import { uhrzeit } from '../navigation/meldung'

interface QuelleWegProps {
  /** Zeitstempel des Ausfalls (ISO). */
  seit: string
}

/**
 * Degradationstabelle Zeile 2: „Timetables faellt aus → Routing laeuft mit
 * manuellen Eingaben weiter; Banner ‚Echtzeitdaten derzeit nicht verfuegbar'."
 *
 * Bewusst kein `LiveBanner`: Der Ausfall ist ein **Zustand**, kein Ereignis.
 * Er traegt kein alt→neu, und er ist nicht wegklickbar - wegklicken hiesse,
 * eine Aussage zu verbergen, die noch gilt. Weg ist er erst, wenn die Quelle
 * wieder antwortet (`quelle-da`).
 */
export function QuelleWeg({ seit }: QuelleWegProps) {
  return (
    <div className="quelle-weg" role="status">
      <strong>Echtzeitdaten derzeit nicht verfügbar</strong>
      <span>
        Verspätungen und Gleiswechsel werden gerade nicht gemeldet. Der Weg wird weiter aus deinen
        Eingaben berechnet.
      </span>
      <span className="live-banner-stand">Seit {uhrzeit(seit)} Uhr</span>
    </div>
  )
}
