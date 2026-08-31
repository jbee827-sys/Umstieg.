import type { EingabeWerte } from '../components/Eingabe'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'

export interface Vorschlag {
  route: RouteErgebnis
  werte: EingabeWerte
  anlass: LiveEreignis
}

interface StoerungProps {
  vorschlag: Vorschlag
  alteRoute: RouteErgebnis
  alteWerte: EingabeWerte
  /** Sekunden bis zur NEUEN Abfahrt; undefiniert, wenn keine Zeit bekannt ist. */
  restSek?: number
  onUebernehmen: () => void
  onBehalten: () => void
}

function minutenText(sek: number): string {
  const min = Math.ceil(sek / 60)
  return min <= 1 ? '1 Minute' : `${min} Minuten`
}

/** "14:36" → Minuten seit Mitternacht; null bei unbrauchbarer Eingabe. */
function minutenAmTag(hhmm?: string): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

function verschiebung(alt?: string, neu?: string): string | null {
  const a = minutenAmTag(alt)
  const n = minutenAmTag(neu)
  if (a === null || n === null || a === n) return null
  const delta = n - a
  return delta < 0 ? `${Math.abs(delta)} min früher` : `${delta} min später`
}

/** Dieselbe Formel wie überall: relativ zur Gehzeit, nicht absolut. */
function ampelAussage(restSek: number | undefined, gehzeitSek: number): string {
  if (restSek === undefined) {
    return 'Ohne Abfahrtszeit trifft die Ampel keine Aussage – wähle deinen Anschlusszug.'
  }
  if (restSek < gehzeitSek) {
    return 'Die Ampel springt auf Rot: Du hast nach dem Wechsel weniger Puffer als Gehzeit. Geh direkt los.'
  }
  if (restSek < 2 * gehzeitSek) {
    return 'Die Ampel steht auf Gelb: Es reicht, aber ohne Umwege.'
  }
  return 'Die Ampel bleibt Grün: Der Wechsel kostet dich keinen Puffer.'
}

// Screen 4 des Entwurfs. Die entscheidende Aenderung gegenueber vorher: Ein
// Gleiswechsel wird NICHT mehr still uebernommen. Bisher rechnete die App neu
// und der Nutzer erfuhr es hinterher aus einem Banner. Jetzt sieht er alt
// gegen neu und entscheidet selbst.
export function Stoerung({
  vorschlag,
  alteRoute,
  alteWerte,
  restSek,
  onUebernehmen,
  onBehalten,
}: StoerungProps) {
  const zeitversatz = verschiebung(alteWerte.abfahrtZeit, vorschlag.werte.abfahrtZeit)
  return (
    <section className="stoerung">
      <div className="kicker">Änderung auf deiner Fahrt</div>
      <h2 className="stoerung-titel">Gleiswechsel</h2>
      <p className="stoerung-satz">
        {vorschlag.anlass.zug ? `${vorschlag.anlass.zug} fährt` : 'Dein Zug fährt'} heute von einem
        anderen Gleis. Die neue Route ist berechnet – übernehmen musst du sie selbst.
      </p>

      <div className="stoerung-gegenueber">
        <div className="stoerung-seite">
          <div className="kicker">Alt</div>
          <div className="stoerung-gleis">Gl. {alteWerte.gleisAb}</div>
          <div className="stoerung-detail">{minutenText(alteRoute.gehzeitSek)} Gehzeit</div>
        </div>
        <div className="stoerung-pfeil" aria-hidden="true">
          →
        </div>
        <div className="stoerung-seite stoerung-neu">
          <div className="kicker">Neu</div>
          <div className="stoerung-gleis">Gl. {vorschlag.werte.gleisAb}</div>
          <div className="stoerung-detail">{minutenText(vorschlag.route.gehzeitSek)} Gehzeit</div>
        </div>
      </div>

      <dl className="stoerung-werte">
        {vorschlag.werte.abfahrtZeit && (
          <>
            <dt>Abfahrt</dt>
            <dd>
              {vorschlag.werte.abfahrtZeit}
              {zeitversatz ? ` · ${zeitversatz}` : ''}
            </dd>
          </>
        )}
        {restSek !== undefined && (
          <>
            <dt>Restzeit danach</dt>
            <dd>{minutenText(Math.max(0, restSek))}</dd>
          </>
        )}
      </dl>

      <p className="stoerung-ampel">{ampelAussage(restSek, vorschlag.route.gehzeitSek)}</p>

      <button type="button" className="knopf-primaer" onClick={onUebernehmen}>
        <span>Route übernehmen</span>
      </button>
      <button type="button" className="knopf-sekundaer" onClick={onBehalten}>
        Alte Route behalten
      </button>
    </section>
  )
}
