import type { Bahnsteigabschnitt, SchemaBahnsteig } from '../api/typen'
import { ABSCHNITTE } from '../api/standorte'
import './Zugbild.css'

interface ZugbildProps {
  /** Die Stelle, die in der Standortwahl darunter gewaehlt ist. */
  gewaehlt: Bahnsteigabschnitt
  /** An welchem Bahnsteigende die Zugspitze steht - fehlt, wenn es nicht sicher ist. */
  zugspitze?: SchemaBahnsteig['zugspitze']
}

/** Was ein Endwagen ist: vorn mit Spitzenlicht, hinten mit Schlusslicht. */
type Endrolle = 'spitze' | 'schluss'

/**
 * Halbmesser der Zuglichter in Einheiten des Wagenbilds (120 breit). 8, damit
 * der Viertelkreis so weit reicht wie die runde Lampe (Durchmesser 8) davor.
 */
const LICHT_R = 8

/**
 * Ein dreiteiliger Triebzug in Seitenansicht ueber der Standortwahl
 * (Entwurf vom 25.10.2026, Artboard „Neu – Position im Zug").
 *
 * Der Zug ist NUR Bild, kein Knopf: Gewaehlt wird weiter am Bahnsteigstreifen
 * darunter. Der Zug antwortet darauf - der Zugteil ueber der gewaehlten Stelle
 * bleibt voll sichtbar, die beiden anderen werden blasser. Alle drei bleiben
 * auf einer Hoehe und in ihrer Farbe; nur die Deckkraft wechselt, in 200 ms
 * (DESIGN.md 6, „Auswahlwechsel").
 *
 * Reihenfolge wie `ABSCHNITTE` und damit wie die Knoepfe darunter: links der
 * Bahnsteiganfang, der hintere Endwagen gespiegelt. Kennt die App die
 * Fahrtrichtung (`zugspitze`), traegt der vordere Endwagen das weisse
 * Spitzenlicht (Zg 1) und der hintere das rote Schlusslicht (Zg 2) - wie am
 * echten Zug als Viertelkreis in der Ecke, gross genug, dass Spitze und Ende
 * auf einen Blick zu unterscheiden sind.
 * Die Lichter liegen ausserhalb des Wagenkoerpers und werden mit ihm nicht
 * blass. Ohne Fahrtrichtung bleiben beide Enden bei der kleinen weissen
 * Lampe des Entwurfs: Ein Zug ohne Richtung behauptet keine.
 */
export function Zugbild({ gewaehlt, zugspitze }: ZugbildProps) {
  const rolleVon = (a: Bahnsteigabschnitt): Endrolle | undefined => {
    if (!zugspitze || a === 'mitte') return undefined
    return a === zugspitze ? 'spitze' : 'schluss'
  }
  return (
    <div className="zugbild" aria-hidden="true">
      {ABSCHNITTE.map((a, i) => {
        const rolle = rolleVon(a)
        return (
          <div
            key={a}
            className={`zugbild-wagen${gewaehlt === a ? ' gewaehlt' : ''}`}
            data-stelle={a}
            data-rolle={rolle}
          >
            {a === 'mitte' ? (
              <Mittelwagen />
            ) : (
              <Endwagen gespiegelt={i === ABSCHNITTE.length - 1} rolle={rolle} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Halbkreis-Rad unter dem Wagenkasten, Mittelpunkt auf dessen Unterkante. */
function Rad({ x }: { x: number }) {
  return <path className="zugbild-rad" d={`M${x - 4.5} 44.75 A4.5 4.5 0 0 0 ${x + 4.5} 44.75 Z`} />
}

function Tuer({ x }: { x: number }) {
  return (
    <>
      <rect className="zugbild-tuer" x={x} y="15" width="11" height="28.25" rx="2" />
      <rect className="zugbild-fenster" x={x + 2} y="18" width="7" height="9" rx="1.5" />
    </>
  )
}

/** Endwagen mit Fuehrerstand links; gespiegelt fuer das hintere Zugende. */
function Endwagen({ gespiegelt, rolle }: { gespiegelt: boolean; rolle?: Endrolle }) {
  return (
    <svg viewBox="0 6 120 44" className={gespiegelt ? 'gespiegelt' : undefined} focusable="false">
      <g className="zugbild-koerper">
        <rect className="zugbild-dach" x="34" y="8" width="70" height="5" rx="2.5" />
        <path className="zugbild-kasten" d="M2 44 L2 34 C2 23 10 13 30 12 L118 12 L118 44 Z" />
        <path className="zugbild-scheibe" d="M5 29 C7 21 14 16 26 15.5 L31 15.5 L31 29 Z" />
        <rect className="zugbild-fenster" x="36" y="17" width="80" height="10" rx="3" />
        <rect className="zugbild-rot" x="30" y="35" width="87.25" height="6" />
        <path className="zugbild-rot" d="M2.75 43.25 L2.75 34 C2.75 31.5 3.3 30 4.2 29 L31 29 L31 43.25 Z" />
        {!rolle && <circle className="zugbild-licht" cx="8" cy="37" r="1.8" />}
        <Tuer x={44} />
        <Tuer x={94} />
        <rect className="zugbild-uebergang" x="118" y="17" width="2" height="24" rx="1" />
        <Rad x={22} />
        <Rad x={34} />
        <Rad x={88} />
        <Rad x={100} />
      </g>
      {/*
        * Zg 1 / Zg 2 wie an modernen Triebzuegen: ein Viertelkreis in der
        * unteren Ecke des Fuehrerstands, buendig mit Front und Unterkante
        * des Wagenkastens.
        */}
      {rolle && (
        <path
          className={rolle === 'spitze' ? 'zugbild-spitzenlicht' : 'zugbild-schlusslicht'}
          d={`M2 44 L2 ${44 - LICHT_R} A${LICHT_R} ${LICHT_R} 0 0 1 ${2 + LICHT_R} 44 Z`}
        />
      )}
    </svg>
  )
}

/** Mittelwagen mit Stromabnehmer, Uebergaenge an beiden Seiten. */
function Mittelwagen() {
  return (
    <svg viewBox="0 6 120 44" focusable="false">
      <g className="zugbild-koerper">
        <path className="zugbild-buegel" d="M46 12 L56 6.5 L66 12 M50 6.5 L62 6.5" />
        <rect className="zugbild-dach" x="72" y="8" width="34" height="5" rx="2.5" />
        <rect className="zugbild-kasten" x="2" y="12" width="116" height="32" rx="4" />
        <rect className="zugbild-fenster" x="8" y="17" width="104" height="10" rx="3" />
        <rect className="zugbild-rot" x="2.75" y="35" width="114.5" height="6" />
        <Tuer x={24} />
        <Tuer x={85} />
        <rect className="zugbild-uebergang" x="0" y="17" width="2" height="24" rx="1" />
        <rect className="zugbild-uebergang" x="118" y="17" width="2" height="24" rx="1" />
        <Rad x={18} />
        <Rad x={30} />
        <Rad x={90} />
        <Rad x={102} />
      </g>
    </svg>
  )
}
