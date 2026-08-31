import type { LiveEreignis } from '../api/typen'
import { meldungsText } from '../navigation/meldung'

interface StoermeldungProps {
  ereignis: LiveEreignis
  onAnsehen: () => void
  onSchliessen: () => void
}

/** "2026-08-27T14:32:10.000Z" → "14:32" in Ortszeit. */
function uhrzeit(iso: string): string {
  const zeitpunkt = new Date(iso)
  if (Number.isNaN(zeitpunkt.getTime())) return '–'
  return zeitpunkt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// Globale Stoermeldung: faehrt von oben ein und bedeckt etwa ein Drittel des
// Bildschirms - unabhaengig davon, auf welcher Seite der Nutzer gerade ist.
// Eine Aenderung an Gleis oder Abfahrtszeit ist zu wichtig, um sie erst beim
// naechsten Seitenwechsel zu zeigen.
export function Stoermeldung({ ereignis, onAnsehen, onSchliessen }: StoermeldungProps) {
  const { titel, text } = meldungsText(ereignis)
  return (
    <div className="stoermeldung" role="alert">
      <div className="stoermeldung-inhalt">
        <div className="kicker-hell">Änderung auf deiner Fahrt</div>
        <h2>{titel}</h2>
        <p>{text}</p>
        <p className="stoermeldung-stand">Stand: {uhrzeit(ereignis.zeitstempel)} Uhr</p>
        <div className="stoermeldung-knoepfe">
          <button type="button" className="knopf-hell" onClick={onAnsehen}>
            Was heißt das?
          </button>
          <button type="button" className="knopf-durchsichtig" onClick={onSchliessen}>
            Später
          </button>
        </div>
      </div>
    </div>
  )
}
