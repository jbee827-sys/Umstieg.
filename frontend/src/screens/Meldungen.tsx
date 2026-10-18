import type { EingabeWerte } from '../components/Eingabe'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'
import type { Meldung } from '../meldungen/modell'
import { meldungsText, uhrzeit } from '../navigation/meldung'

interface MeldungenProps {
  /** Neueste zuerst. */
  meldungen: Meldung[]
  alteRoute: RouteErgebnis
  alteWerte: EingabeWerte
  /** Zeitstempel des letzten Live-Kontakts; null, solange keiner bestand. */
  stand: string | null
  /** Sekunden bis zur NEUEN Abfahrt; undefiniert, wenn keine Zeit bekannt ist. */
  restSek?: number
  onUebernehmen: (meldung: Meldung) => void
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

/** Der geänderte Wert selbst – beim Gleiswechsel das Gleis, sonst die Uhrzeit. */
function wert(ereignis: LiveEreignis, welcher: 'alt' | 'neu'): string {
  const roh = ereignis[welcher] ?? '–'
  if (ereignis.typ !== 'gleiswechsel') return roh
  // An Haltestellen heisst der Halt eines Busses Steig, der einer Bahn Gleis.
  return ereignis.haltWort === 'Steig' ? `Steig ${roh}` : `Gl. ${roh}`
}

// Nachfolger von Screen 4 des Entwurfs. Screen 4 war eine Entscheidungsseite
// fuer EIN Ereignis - jedes neue ueberschrieb das vorige, und danach war
// nicht mehr feststellbar, dass es das vorige gegeben hatte. Diese Seite
// haelt den Verlauf.
//
// Die entscheidende Festlegung von damals gilt weiter: Ein Gleiswechsel wird
// NICHT still uebernommen. Der Knopf „Alte Route behalten" ist entfallen,
// die Entscheidung nicht - wer nicht uebernehmen will, verlaesst die Seite.
export function Meldungen({
  meldungen,
  alteRoute,
  alteWerte,
  stand,
  restSek,
  onUebernehmen,
}: MeldungenProps) {
  const neueste = meldungen[0]
  const verlauf = meldungen.slice(1)

  if (!neueste) {
    return (
      <section className="meldungen">
        <div className="kicker">Deine Fahrt</div>
        <h2 className="stoerung-titel">Meldungen</h2>
        <p className="stoerung-satz">Aktuell keine Meldungen.</p>
        {/* Der Zeitstempel belegt, dass noch hingehoert wird. Ohne ihn waere
            „keine Meldungen" von „wir bekommen nichts mehr mit" nicht zu
            unterscheiden - genau die Gleichsetzung, gegen die Grundprinzip 3
            steht. */}
        {stand ? (
          <p className="live-stand">Live-Daten · Stand: {uhrzeit(stand)} Uhr</p>
        ) : (
          <p className="live-stand">Die Live-Verbindung steht noch nicht.</p>
        )}
      </section>
    )
  }

  const { titel, text } = meldungsText(neueste.ereignis)
  // Ein Ausfall hat kein „neu“ und keine neue Route - es gibt nichts
  // gegenueberzustellen und nichts nachzurechnen.
  const ausfall = neueste.ereignis.typ === 'ausfall'
  const vorschlag = neueste.vorschlag
  // Eine verspaetete ANKUNFT verschiebt die Ankunft; die Abfahrt bleibt.
  const ankunftVerschoben = neueste.ereignis.typ === 'verspaetung' && neueste.ereignis.seite === 'an'
  const zeitversatz = vorschlag
    ? ankunftVerschoben
      ? verschiebung(alteWerte.ankunftZeit, vorschlag.werte.ankunftZeit)
      : verschiebung(alteWerte.abfahrtZeit, vorschlag.werte.abfahrtZeit)
    : null

  return (
    <section className="meldungen">
      <div className="kicker">Änderung auf deiner Fahrt</div>
      <h2 className="stoerung-titel">{titel}</h2>
      <p className="stoerung-satz">
        {text}
        {vorschlag ? ' Die neue Route ist berechnet – übernehmen musst du sie selbst.' : ''}
      </p>

      {!ausfall && (
        <div className="stoerung-gegenueber">
          <div className="stoerung-seite">
            <div className="kicker">Alt</div>
            <div className="stoerung-gleis">
              <s className="tafel-alt">{wert(neueste.ereignis, 'alt')}</s>
            </div>
            <div className="stoerung-detail">{minutenText(alteRoute.gehzeitSek)} Gehzeit</div>
          </div>
          <div className="stoerung-pfeil" aria-hidden="true">
            →
          </div>
          <div className="stoerung-seite stoerung-neu">
            <div className="kicker">Neu</div>
            <div className="stoerung-gleis meldung-neu">{wert(neueste.ereignis, 'neu')}</div>
            <div className="stoerung-detail">
              {vorschlag ? `${minutenText(vorschlag.route.gehzeitSek)} Gehzeit` : 'Gehzeit offen'}
            </div>
          </div>
        </div>
      )}

      {vorschlag && (
        <>
          <dl className="stoerung-werte">
            {ankunftVerschoben && vorschlag.werte.ankunftZeit && (
              <>
                <dt>Ankunft</dt>
                <dd>
                  {vorschlag.werte.ankunftZeit}
                  {zeitversatz ? ` · ${zeitversatz}` : ''}
                </dd>
              </>
            )}
            {vorschlag.werte.abfahrtZeit && (
              <>
                <dt>Abfahrt</dt>
                <dd>
                  {vorschlag.werte.abfahrtZeit}
                  {!ankunftVerschoben && zeitversatz ? ` · ${zeitversatz}` : ''}
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

          {neueste.uebernommen ? (
            <p className="meldung-uebernommen">Diese Route ist übernommen.</p>
          ) : (
            <button type="button" className="knopf-primaer" onClick={() => onUebernehmen(neueste)}>
              <span>Route übernehmen</span>
            </button>
          )}
        </>
      )}
      {/* Ohne nachgerechnete Route bleibt die Meldung eine Meldung. Die
          Ampelaussage entfaellt mit: Sie haengt an der neuen Gehzeit, und die
          alte an ihre Stelle zu setzen hiesse, eine Vermutung als Tatsache
          auszugeben. */}
      {!vorschlag && !ausfall && (
        <p className="meldung-ohne-route">
          Die neue Route lässt sich gerade nicht berechnen – die Änderung gilt trotzdem. Versuch
          es gleich noch einmal.
        </p>
      )}

      {verlauf.length > 0 && (
        <>
          <h3 className="meldungen-verlauf-titel">Früher auf dieser Fahrt</h3>
          <ul className="meldungen-verlauf">
            {verlauf.map((m) => (
              <li key={m.nr}>
                <span className="meldungen-zeit">{uhrzeit(m.ereignis.zeitstempel)}</span>
                <span className="meldungen-zug">{m.ereignis.anzeige ?? m.ereignis.zug ?? 'Dein Zug'}</span>
                <span className="meldungen-wechsel">
                  {m.ereignis.typ === 'ausfall' ? (
                    'fällt aus'
                  ) : (
                    <>
                      <s className="tafel-alt">{m.ereignis.alt}</s> → {m.ereignis.neu}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
