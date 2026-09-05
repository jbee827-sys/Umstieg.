import { Ampel } from '../components/Ampel'
import type { EingabeWerte } from '../components/Eingabe'
import type { Ampelfarbe, RouteErgebnis, RoutenVariante } from '../api/typen'
import { ampelFarbe } from '../navigation/ampel'

/**
 * Gehzeit je Variante in Sekunden. `undefined` heisst: konnte nicht berechnet
 * werden – dann steht am Knopf KEINE Minutenangabe statt einer geratenen.
 */
export interface VariantenStand {
  schnellste?: number
  barrierefrei?: number
  'mit-stopp'?: number
  gewaehlt: RoutenVariante
}

interface DashboardProps {
  werte: EingabeWerte
  route: RouteErgebnis
  /** Sekunden bis zur Abfahrt; undefiniert ohne Zugauswahl. */
  restSek?: number
  /** Puffer beim Öffnen – Bezugspunkt der Zeitleiste. */
  startPufferSek?: number
  abgefahren: boolean
  varianten: VariantenStand
  /** Ungelesene Meldungen liegen vor. */
  hinweis: boolean
  onVariante: (v: RoutenVariante) => void
  onNavigation: () => void
  onMeldungen: () => void
}

const KNOEPFE: { wert: RoutenVariante; label: string; feld: keyof VariantenStand }[] = [
  { wert: 'schnellste', label: 'Schnellste Route', feld: 'schnellste' },
  { wert: 'barrierefrei', label: 'Barrierefrei (Aufzug)', feld: 'barrierefrei' },
  // Der Entwurf nennt beide Ziele in EINEM Knopf - welches es wird,
  // entscheidet die kuerzere Gehzeit, nicht der Nutzer.
  { wert: 'mit-stopp', label: 'Mit Stopp: WC & Kiosk', feld: 'mit-stopp' },
]

function minuten(sek?: number): string {
  return sek === undefined ? '' : `${Math.ceil(sek / 60)} min`
}

function farbeVon(
  restSek: number | undefined,
  gehzeitSek: number,
  abgefahren: boolean,
): Ampelfarbe | null {
  if (restSek === undefined || abgefahren) return null
  return ampelFarbe(restSek, gehzeitSek)
}

// Dashboard nach Screen 2 des Entwurfs. Die Ampel steht hier ab der
// Gleiseingabe – ohne Abfahrtszeit grau, aber MIT Gehzeit und der Begruendung,
// warum sie schweigt. Genau das fehlte bisher.
export function Dashboard({
  werte,
  route,
  restSek,
  startPufferSek,
  abgefahren,
  varianten,
  hinweis,
  onVariante,
  onNavigation,
  onMeldungen,
}: DashboardProps) {
  const farbe = farbeVon(restSek, route.gehzeitSek, abgefahren)
  return (
    <>
      <div className="routen-kopf">
        <div>
          <div className="kicker">Umstieg in</div>
          <h2>{werte.bahnhofName || 'diesem Bahnhof'}</h2>
        </div>
      </div>

      <Ampel
        farbe={farbe}
        gehzeitSek={route.gehzeitSek}
        restSek={restSek}
        startPufferSek={startPufferSek}
        abgefahren={abgefahren}
      />

      <div className="dashboard-bloecke">
        <section className="dashboard-block">
          <div className="kicker">Du kommst an</div>
          {werte.zugAnName && <div className="dashboard-zug">{werte.zugAnName}</div>}
          <div className="dashboard-gleis">Gl. {werte.gleisAn}</div>
          {werte.ankunftZeit && <div className="dashboard-zeit">an {werte.ankunftZeit}</div>}
        </section>
        <section className="dashboard-block">
          <div className="kicker">Dein Anschluss</div>
          {werte.zugAbName && <div className="dashboard-zug">{werte.zugAbName}</div>}
          <div className="dashboard-gleis">Gl. {werte.gleisAb}</div>
          {werte.abfahrtZeit && <div className="dashboard-zeit">ab {werte.abfahrtZeit}</div>}
        </section>
      </div>

      <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="feld">
        <label>Route</label>
        <div className="routenwahl" role="group" aria-label="Routenvariante">
          {KNOEPFE.map((k) => {
            const gewaehlt = varianten.gewaehlt === k.wert
            return (
              <button
                key={k.wert}
                type="button"
                className={`routenwahl-zeile${gewaehlt ? ' gewaehlt' : ''}`}
                aria-pressed={gewaehlt}
                onClick={() => onVariante(k.wert)}
              >
                <span className="routenwahl-punkt" aria-hidden="true">
                  <span className={gewaehlt ? 'gefuellt' : ''} />
                </span>
                <span className="routenwahl-label">{k.label}</span>
                <span className="routenwahl-min">
                  {minuten(varianten[k.feld] as number | undefined)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {route.hinweise.length > 0 && (
        <ul className="hinweisliste">
          {route.hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {hinweis && (
        <button type="button" className="knopf-sekundaer" onClick={onMeldungen}>
          Meldung ansehen
        </button>
      )}

      <button type="button" className="knopf-primaer" onClick={onNavigation}>
        <span>Navigation starten</span>
      </button>
    </>
  )
}
