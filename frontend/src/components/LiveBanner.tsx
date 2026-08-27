import type { LiveEreignis } from '../api/typen'

interface LiveBannerProps {
  ereignis: LiveEreignis
  onSchliessen: () => void
}

/** "2026-08-27T14:32:10.000Z" → "14:32" in Ortszeit. */
function uhrzeit(iso: string): string {
  const zeitpunkt = new Date(iso)
  if (Number.isNaN(zeitpunkt.getTime())) return '–'
  return zeitpunkt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// Auffälliger Warnbanner für Gleiswechsel und Verspätungen (Konzept 7).
// Jede Live-Anzeige trägt ihren Zeitstempel – keine vorgetäuschte Aktualität.
export function LiveBanner({ ereignis, onSchliessen }: LiveBannerProps) {
  const gleiswechsel = ereignis.typ === 'gleiswechsel'
  return (
    <div className={gleiswechsel ? 'live-banner live-banner-warnung' : 'live-banner'} role="alert">
      <div className="live-banner-text">
        <strong>
          {gleiswechsel ? 'Gleiswechsel' : 'Neue Zeit'}
          {ereignis.zug ? ` · ${ereignis.zug}` : ''}
        </strong>
        <span>
          {ereignis.alt} → {ereignis.neu}
        </span>
        <span className="live-banner-stand">Stand: {uhrzeit(ereignis.zeitstempel)} Uhr</span>
      </div>
      <button type="button" className="knopf-sekundaer" onClick={onSchliessen}>
        Verstanden
      </button>
    </div>
  )
}
