import { Ampel } from '../components/Ampel'
import type { EingabeWerte } from '../components/Eingabe'
import type { Ampelfarbe, Bahnsteigabschnitt, RouteErgebnis, RoutenVariante } from '../api/typen'
import { ampelFarbe } from '../navigation/ampel'
import { ABSCHNITTE, ankunftsRichtung, standortNamen } from '../api/standorte'
import { ebenenZahl, gleisEbenen } from '../schema/bandmodell'

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

/**
 * Gehzeit je Standort am Ankunftsgleis, in Sekunden - dieselbe Regel wie bei
 * `VariantenStand`: `undefined` heisst „nicht gerechnet", nicht „null".
 */
export interface StandortStand {
  anfang?: number
  mitte?: number
  ende?: number
  gewaehlt: Bahnsteigabschnitt
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
  /**
   * Variante, die gerade geholt wird - `undefined`, solange nichts laeuft.
   *
   * Ohne diese Angabe war der Wechsel auf dem Dashboard unsichtbar: `laden`
   * liegt in `App.tsx` und wird nur an `Eingabe` gereicht. Auf dem Handy
   * hiess das, dass ein Tipp sekundenlang folgenlos aussah.
   */
  laedt?: RoutenVariante
  /** Warum die zuletzt getippte Variante nicht kam. `null` = alles gut. */
  variantenFehler?: string | null
  /** Standort am Ankunftsgleis, mit den Gehzeiten der drei Stellen. */
  standorte: StandortStand
  /** Standort, der gerade geholt wird - `undefined`, solange nichts laeuft. */
  standortLaedt?: Bahnsteigabschnitt
  onVariante: (v: RoutenVariante) => void
  onStandort: (a: Bahnsteigabschnitt) => void
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
//
// Seit dem 07.10.2026 rollt nur der Inhalt (`dashboard-rollbereich`);
// „Navigation starten" steht fest darunter, ueber der Leiste. Vorher lag der
// Hauptknopf hinter Kopf, Ampel, Karten, Standort- und Routenwahl unter dem
// Falz (`BRIEF.md`, Dashboard c). Die Spalte dazu ist `.app-dashboard`.
export function Dashboard({
  werte,
  route,
  restSek,
  startPufferSek,
  abgefahren,
  varianten,
  hinweis,
  laedt,
  variantenFehler,
  standorte,
  standortLaedt,
  onVariante,
  onStandort,
  onNavigation,
  onMeldungen,
}: DashboardProps) {
  const farbe = farbeVon(restSek, route.gehzeitSek, abgefahren)
  // „Nordende · Mitte · Südende" - oder, ohne gemessene Achse, Anfang und Ende.
  const standortNamenJetzt = standortNamen(ankunftsRichtung(route.schema))
  // Im Standardmodell `undefined` - dort waeren die Ebenen geraten.
  const ebenen = gleisEbenen(route)
  return (
    <div className="dashboard-flaeche">
      <div className="dashboard-rollbereich">
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
            {ebenen && <div className="dashboard-ebene">{`Ebene ${ebenenZahl(ebenen.an)}`}</div>}
            {werte.ankunftZeit && <div className="dashboard-zeit">an {werte.ankunftZeit}</div>}
          </section>
          {/*
            * `ziel` faerbt die Karte rot. Das ist seit dem 20.09.2026 erlaubt:
            * Rot ist Sekundaerfarbe der App, nicht mehr allein die Alarmfarbe.
            * Unterscheidbar bleibt der Alarm ueber den gelb-roten Saum an der
            * Ampel, nicht ueber die Farbe allein.
            */}
          <section className="dashboard-block ziel">
            <div className="kicker">Dein Anschluss</div>
            {werte.zugAbName && <div className="dashboard-zug">{werte.zugAbName}</div>}
            <div className="dashboard-gleis">Gl. {werte.gleisAb}</div>
            {ebenen && <div className="dashboard-ebene">{`Ebene ${ebenenZahl(ebenen.ab)}`}</div>}
            {werte.abfahrtZeit && <div className="dashboard-zeit">ab {werte.abfahrtZeit}</div>}
          </section>
        </div>

        {/*
          * Die Standortwahl steht UEBER der Routenwahl, weil sie die Voraussetzung
          * ist: Sie aendert die Gehzeit ALLER drei Varianten. Umgekehrt gilt das
          * auch, deshalb liegen beide Minutenreihen in `App.tsx` in EINEM Speicher,
          * der nach Variante UND Standort schluesselt.
          *
          * Seit dem 07.10.2026 ein Bahnsteigstreifen statt drei Knoepfen
          * (`BRIEF.md`, Dashboard a): Vorher sahen Standort- und Routenwahl
          * gleich aus - drei Knoepfe, Minuten rechts, die Wahl schwarz gefuellt -
          * und meinten doch Verschiedenes. Jetzt ist die Flaeche der Bahnsteig,
          * und die Wahl zeigt EIN Standortpunkt, derselbe wie im Ebenenschema.
          * Fuer Screenreader bleiben es drei Knoepfe mit `aria-pressed`; der
          * Streifen und der Punkt sind nur Bild.
          */}
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="feld">
          <label id="standortwahl-label">Wo stehst du auf Gleis {werte.gleisAn}?</label>
          <div
            className="standortwahl bahnsteigstreifen"
            role="group"
            aria-labelledby="standortwahl-label"
          >
            {ABSCHNITTE.map((a) => {
              const gewaehlt = standorte.gewaehlt === a
              const laedtDieser = standortLaedt === a
              return (
                <button
                  key={a}
                  type="button"
                  className={`standortwahl-knopf${gewaehlt ? ' gewaehlt' : ''}${
                    laedtDieser ? ' laedt' : ''
                  }`}
                  aria-pressed={gewaehlt}
                  aria-busy={laedtDieser || undefined}
                  // Wie bei der Routenwahl: waehrend ein Wechsel laeuft, nimmt
                  // kein Knopf einen zweiten entgegen.
                  disabled={standortLaedt !== undefined || laedt !== undefined}
                  onClick={() => onStandort(a)}
                >
                  {/* Das Stueck Bahnsteig unter dieser Stelle, mit ihrem Ring. */}
                  <span className="bahnsteigstreifen-stueck" aria-hidden="true">
                    <span className="bahnsteigstreifen-ring" />
                  </span>
                  <span className="standortwahl-name">{standortNamenJetzt[a]}</span>
                  <span className="standortwahl-min">
                    {laedtDieser ? 'lädt …' : minuten(standorte[a])}
                  </span>
                </button>
              )
            })}
            {/*
              * EIN Punkt fuer alle drei Stellen, nicht einer je Knopf: So wandert
              * er beim Wechsel an die neue Stelle, statt an der alten zu
              * verschwinden und an der neuen aufzutauchen (DESIGN.md 6,
              * „Auswahl").
              */}
            <span className="standortpunkt" data-stelle={standorte.gewaehlt} aria-hidden="true" />
          </div>
          <p className="standortwahl-hinweis">
            Der Punkt am Bahnsteig entscheidet den Weg – ohne Wagenreihung weiß die App
            sonst nicht, wo du aussteigst.
          </p>
        </fieldset>

        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="feld">
          <label>Route</label>
          <div className="routenwahl" role="group" aria-label="Routenvariante">
            {KNOEPFE.map((k) => {
              const gewaehlt = varianten.gewaehlt === k.wert
              const laedtDiese = laedt === k.wert
              return (
                <button
                  key={k.wert}
                  type="button"
                  className={`routenwahl-zeile${gewaehlt ? ' gewaehlt' : ''}${
                    laedtDiese ? ' laedt' : ''
                  }`}
                  aria-pressed={gewaehlt}
                  aria-busy={laedtDiese || undefined}
                  // Waehrend ein Wechsel laeuft, nimmt keine Zeile einen
                  // zweiten entgegen. Sonst stapeln sich auf dem Handy drei
                  // Anfragen, von denen die zuletzt beantwortete gewinnt - und
                  // das muss nicht die zuletzt getippte sein. Ein laufender
                  // STANDORTwechsel sperrt genauso: Er holt dieselbe Route.
                  disabled={laedt !== undefined || standortLaedt !== undefined}
                  onClick={() => onVariante(k.wert)}
                >
                  <span className="routenwahl-punkt" aria-hidden="true">
                    <span className={gewaehlt ? 'gefuellt' : ''} />
                  </span>
                  <span className="routenwahl-label">{k.label}</span>
                  <span className="routenwahl-min">
                    {laedtDiese ? 'lädt …' : minuten(varianten[k.feld] as number | undefined)}
                  </span>
                </button>
              )
            })}
          </div>
          {variantenFehler && (
            <p className="routenwahl-fehler" role="alert">
              {variantenFehler}
            </p>
          )}
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
      </div>

      {/* Schwebt ueber dem Rollbereich, der Inhalt rollt darunter durch -
          angeheftet ist nur der Knopf (12.10.2026). */}
      <button type="button" className="knopf-primaer knopf-schwebend" onClick={onNavigation}>
        <span>Navigation starten</span>
      </button>
    </div>
  )
}
