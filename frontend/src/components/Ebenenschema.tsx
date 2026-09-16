import type { SchemaModell } from '../schema/ableitung'
import type { Band, Bandmodell } from '../schema/bandmodell'
import { wechselAnweisung, wechselName } from '../schema/bandmodell'
import { bandTitel, fusstext, wegBeschreibung } from '../schema/bandtext'
import { zeichneBand } from '../schema/bandbild'
import type {
  Bildbalken,
  Bildpunkt,
  Gleisbild,
  Uebergangsbild,
  Uebergangsort,
  Wechselmarke,
  Zielpunkt,
} from '../schema/bandbild'
import { RUHIG_H, WECHSEL_H, aktivHoehe, bildflaeche } from '../schema/masse'
import { istSymboltyp, SYMBOL_PX } from '../schema/symbole'
import { AnlagenSymbol, Glyphe } from './AnlagenSymbol'

interface EbenenschemaProps {
  /** Aus der echten Geometrie. Fehlt sie, greift `ersatz`. */
  modell: Bandmodell | null
  /** Die alte Ableitung aus den Schritttexten — Standardmodell und Altbestand. */
  ersatz: SchemaModell
  bahnhofName: string
}

const pfad = (punkte: Bildpunkt[]): string => `M ${punkte.map((p) => `${p.x} ${p.y}`).join(' L ')}`
const PFEIL = { hinunter: '↓', hinauf: '↑' } as const

/**
 * Eine Anweisung im Bild.
 *
 * Auf dem Balken steht sie mittig ÜBER der Stelle – und darunter, wenn der
 * Balken ganz oben liegt, sonst liefe sie aus dem Bild. Abseits steht sie
 * neben der Scheibe.
 */
function Beschriftung({
  x,
  y,
  text,
  breite,
  aufBalken,
}: {
  x: number
  y: number
  text: string
  breite: number
  aufBalken: boolean
}) {
  if (aufBalken) {
    const anker = x < 44 ? 'start' : x > breite - 44 ? 'end' : 'middle'
    const tx = anker === 'start' ? x - 8 : anker === 'end' ? x + 8 : x
    const ty = y - 13 < 10 ? y + 21 : y - 13
    return (
      <text className="schema-wechseltext" x={tx} y={ty} textAnchor={anker}>
        {text}
      </text>
    )
  }
  const rechtsbuendig = x > breite - 86
  return (
    <text
      className="schema-wechseltext"
      x={rechtsbuendig ? x - 12 : x + 12}
      y={y - 9}
      textAnchor={rechtsbuendig ? 'end' : 'start'}
    >
      {text}
    </text>
  )
}

/** Die Scheibe eines Ebenenwechsels: voll, wo es weitergeht, als Ring, wo man ankommt. */
function Scheibe({ x, y, typ, ring }: { x: number; y: number; typ: string; ring: boolean }) {
  const pfeil = 'M0 -4 V4 M-3.5 0.5 L0 4 L3.5 0.5'
  return (
    <g className={`schema-scheibe${ring ? ' ankunft' : ''}`}>
      <circle className={ring ? 'schema-ankunftsring' : 'schema-wechselmarke'} cx={x} cy={y} r={9} />
      {istSymboltyp(typ) ? (
        <Glyphe typ={typ} x={x} y={y} groesse={SYMBOL_PX} />
      ) : (
        <path className="schema-wechselmarke-pfeil" d={pfeil} transform={`translate(${x} ${y})`} />
      )}
    </g>
  )
}

function Wechselmarken({ marken, breite }: { marken: Wechselmarke[]; breite: number }) {
  return (
    <>
      {marken
        .filter((m) => !m.alsZiel)
        .map((m, i) => (
          <g key={i}>
            <Scheibe x={m.x} y={m.y} typ={m.typ} ring={m.art === 'ankommen'} />
            {m.art === 'verlassen' && (
              <Beschriftung
                x={m.x}
                y={m.y}
                breite={breite}
                aufBalken={m.aufBalken}
                text={`${wechselName(m.typ)} ${PFEIL[m.richtung]}${m.beiM !== undefined ? ` · ${m.beiM} m` : ''}`}
              />
            )}
          </g>
        ))}
    </>
  )
}

function Balken({ balken }: { balken: Bildbalken[] }) {
  return (
    <>
      {balken.map((b) => {
        const wichtig = b.rolle !== undefined
        return (
          <g key={b.gleise.join('/') + b.y}>
            <text
              className={`schema-gleisname${wichtig ? ' wichtig' : ''}`}
              x={b.lx}
              y={b.ly}
              textAnchor="end"
            >
              {b.gleise.join('/')}
            </text>
            <line
              className={`schema-bahnsteig${b.rolle ? ` ${b.rolle}` : ''}${
                b.massstaeblich ? '' : ' ungemessen'
              }`}
              x1={b.x1}
              y1={b.y}
              x2={b.x2}
              y2={b.y}
              strokeWidth={wichtig ? 15 : 3}
            />
            {/* Die Anlagen sitzen AM Gleis, also stehen ihre Symbole IM Balken –
                hell, damit sie auf dem dunklen Bahnsteig tragen. */}
            {b.symbole.map((s, i) => (
              <Glyphe key={i} className="schema-symbol" typ={s.typ} x={s.x} y={b.y} groesse={SYMBOL_PX} />
            ))}
          </g>
        )
      })}
    </>
  )
}

/** Anlagen im Grundriss, die der Weg nicht nimmt: grau, auf hellem Schild. */
function Orte({ orte }: { orte: Uebergangsort[] }) {
  const schritt = SYMBOL_PX + 2
  return (
    <>
      {orte.map((o, i) => {
        const w = o.symbole.length * schritt
        return (
          <g key={i} className="schema-ort">
            <rect className="schema-ort-schild" x={o.x - w / 2 - 1} y={o.y - 7.5} width={w + 2} height={15} rx={3} />
            {o.symbole.map((typ, k) => (
              <Glyphe key={typ} typ={typ} x={o.x - w / 2 + schritt / 2 + k * schritt} y={o.y} groesse={SYMBOL_PX - 1} strich={1.4} />
            ))}
          </g>
        )
      })}
    </>
  )
}

function Ziel({ ziel, breite, beschriften }: { ziel: Zielpunkt; breite: number; beschriften: boolean }) {
  const text = `Ziel${ziel.beiM !== undefined ? ` · ${ziel.beiM} m` : ''}`
  return (
    <g>
      {ziel.typ && istSymboltyp(ziel.typ) ? (
        <g className="schema-scheibe">
          <circle className="schema-ziel" cx={ziel.x} cy={ziel.y} r={9} />
          <Glyphe typ={ziel.typ} x={ziel.x} y={ziel.y} groesse={SYMBOL_PX} />
        </g>
      ) : (
        <circle className="schema-ziel" cx={ziel.x} cy={ziel.y} r={6.5} />
      )}
      {beschriften && <Beschriftung x={ziel.x} y={ziel.y} text={text} breite={breite} aufBalken />}
    </g>
  )
}

/** Weg, Start und Ziel — der Weg nur, wo das Band ihn zeigt. */
function Weg({ bild, breite }: { bild: Gleisbild | Uebergangsbild; breite: number }) {
  return (
    <>
      {bild.zeigeWeg && bild.weg.length > 1 && (
        <>
          {/* Heller Saum darunter: Der Weg muss auch über dem Netz lesbar bleiben. */}
          <path className="schema-weg-saum" d={pfad(bild.weg)} />
          <path className="schema-weg" d={pfad(bild.weg)} />
        </>
      )}
      <Wechselmarken marken={bild.wechsel} breite={breite} />
      {bild.ziel && <Ziel ziel={bild.ziel} breite={breite} beschriften={!bild.zeigeWeg} />}
      {bild.start && (
        <g>
          <circle className="schema-start" cx={bild.start.x} cy={bild.start.y} r={6.5} />
          <circle className="schema-start-kern" cx={bild.start.x} cy={bild.start.y} r={2.4} />
        </g>
      )}
    </>
  )
}

function Gleisband({ bild, breite }: { bild: Gleisbild; breite: number }) {
  return (
    <>
      <Balken balken={bild.balken} />
      <Weg bild={bild} breite={breite} />
      {bild.standorte?.marken.map((m) => (
        <text
          key={m.name}
          className={`schema-standort${m.hier ? ' hier' : ''}`}
          x={m.x}
          y={bild.standorte!.y + 4}
          textAnchor={m.name === 'Anfang' ? 'start' : m.name === 'Ende' ? 'end' : 'middle'}
        >
          {m.hier ? `▲ ${m.text}` : m.text}
        </text>
      ))}
    </>
  )
}

function Uebergangsband({ bild, breite }: { bild: Uebergangsbild; breite: number }) {
  return (
    <>
      {bild.netz.map((stueck, i) => (
        <path key={`n${i}`} className="schema-netz" d={pfad(stueck)} />
      ))}
      <Orte orte={bild.orte} />
      <Weg bild={bild} breite={breite} />
    </>
  )
}

/** Was das Bild dieses Bandes NICHT belegt. */
function vorbehaltFuer(band: Band): string {
  if (band.art !== 'gleise') return 'Grundriss aus dem Kartenmaterial — Gänge, Anlagen und Weg sind gemessen.'
  return band.erster || band.letzter
    ? 'Bahnsteige maßstäblich in der Länge; den Weg dazwischen nennen die Schritte.'
    : 'Bahnsteige maßstäblich in der Länge; quer stimmt die Reihenfolge, nicht der Maßstab.'
}

function Legende() {
  return (
    <p className="schema-legende" aria-hidden="true">
      <span className="schema-legende-eintrag">
        <AnlagenSymbol typ="rolltreppe" groesse={14} />
        Rolltreppe
      </span>
      <span className="schema-legende-eintrag">
        <AnlagenSymbol typ="treppe" groesse={14} />
        Treppe
      </span>
      <span className="schema-legende-eintrag">
        <AnlagenSymbol typ="aufzug" groesse={14} />
        Aufzug
      </span>
      <span className="schema-legende-eintrag">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.2" className="schema-start" strokeWidth={2} />
          <circle cx="7" cy="7" r="2" className="schema-start-kern" />
        </svg>
        Standort
      </span>
      <span className="schema-legende-eintrag">
        <svg width="16" height="16" viewBox="0 0 16 16" className="schema-scheibe">
          <circle cx="8" cy="8" r="7.3" className="schema-wechselmarke" />
          <Glyphe typ="rolltreppe" x={8} y={8} groesse={10} strich={1.4} />
        </svg>
        Ebenenwechsel
      </span>
    </p>
  )
}

/**
 * Das Bahnhofsschema: ein Band je EBENENBESUCH, mit echter Geometrie.
 *
 * Bewusst keine Landkarte. Der Weg führt durch eine geschlossene Halle über
 * bis zu fünf Stockwerke; eine Straßenkarte zeigt dort ein Dach. Gebraucht
 * wird nicht „wo auf der Erde", sondern „wie liegt es zueinander".
 *
 * Bis zum 13.09.2026 leitete dieses Bild sich aus den SCHRITTTEXTEN ab und
 * kannte weder Bahnsteige noch Zugänge noch Netz. Jetzt kommt jede Linie aus
 * `/api/route`. Seit dem 14.09.2026 stehen die Anlagen als Symbole, und das
 * Band mit dem Ankunfts- oder Abfahrtsgleis zeigt nur noch Punkte.
 *
 * Die alte Ableitung bleibt als Rückfall: Das Standardmodell (Stufe 3)
 * liefert kein `schema`, und ein grobes Bild ist dort besser als keins.
 */
export function Ebenenschema({ modell, ersatz, bahnhofName }: EbenenschemaProps) {
  if (!modell) return <ErsatzSchema modell={ersatz} bahnhofName={bahnhofName} />

  const anzahl = modell.baender.length
  const aktivH = aktivHoehe(anzahl)
  const flaeche = bildflaeche(anzahl)
  const aktivesBand = modell.baender.find((b) => b.aktiv)

  return (
    <section className="schema-bereich">
      <div className="schema-stapel" role="img" aria-label={wegBeschreibung(modell, bahnhofName)}>
        {modell.baender.map((band, i) => {
          const bild = band.aktiv
            ? zeichneBand(band.ebene, flaeche.breite, flaeche.hoehe, {
                lage: modell.lage,
                erster: band.erster,
                letzter: band.letzter,
                ...(band.wechselVorher ? { wechselVorher: band.wechselVorher } : {}),
                ...(band.wechselNachher ? { wechselNachher: band.wechselNachher } : {}),
              })
            : null
          const fuss = band.aktiv ? fusstext(band) : null
          const w = band.wechselNachher
          return (
            <div key={band.nr}>
              <div
                className={`schema-band${band.aktiv ? ' aktiv' : ''}${band.besucht ? ' besucht' : ''}`}
                style={{ height: band.aktiv ? aktivH : RUHIG_H }}
              >
                <div className="schema-bandkopf">
                  <span className="schema-bandname">{bandTitel(band)}</span>
                  <span className="schema-bandrechts">{band.rechts}</span>
                </div>
                {bild && (
                  <svg
                    className="schema-bild"
                    viewBox={`0 0 ${flaeche.breite} ${flaeche.hoehe}`}
                    aria-hidden="true"
                  >
                    {bild.art === 'gleise' ? (
                      <Gleisband bild={bild} breite={flaeche.breite} />
                    ) : (
                      <Uebergangsband bild={bild} breite={flaeche.breite} />
                    )}
                  </svg>
                )}
                {fuss && <p className="schema-bandfuss">{fuss}</p>}
              </div>
              {w && i < anzahl - 1 && (
                <div className="schema-wechsel" style={{ height: WECHSEL_H }}>
                  <span aria-hidden="true">{w.nachLevel < w.vonLevel ? '↓' : '↑'}</span>
                  {istSymboltyp(w.typ) && <AnlagenSymbol typ={w.typ} groesse={12} strich={1.5} />}
                  <span>{wechselAnweisung(w)}</span>
                </div>
              )}
              {!w && i < anzahl - 1 && (
                <div className="schema-wechsel" style={{ height: WECHSEL_H }}>
                  <span>Ebenenwechsel</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Legende />
      <p className="schema-hinweis">
        {bahnhofName}
        {aktivesBand ? ` · ${vorbehaltFuer(aktivesBand)}` : ''}
      </p>
      {modell.kreuzungswinkelGrad !== undefined && (
        <p className="schema-hinweis">
          Die Ebenen kreuzen sich um {modell.kreuzungswinkelGrad}° – im Bild liegen sie parallel.
        </p>
      )}
      {modell.vorbehalte.map((v) => (
        <p className="schema-hinweis" key={v}>
          {v}
        </p>
      ))}
    </section>
  )
}

/**
 * Das alte Bild, aus den Schritttexten abgeleitet.
 *
 * Bleibt für das Standardmodell und für Antworten ohne `schema`. Es sagt
 * weniger, aber es sagt nichts Falsches: Ebenen, Gleise, Ebenenwechsel.
 */
function ErsatzSchema({ modell, bahnhofName }: { modell: SchemaModell; bahnhofName: string }) {
  return (
    <section className="schema-bereich">
      <div
        className="schema-stapel"
        role="img"
        aria-label={`Ebenenschema von ${bahnhofName}: ${modell.baender
          .map((b) => `${b.label}${b.gleise.length ? `, Gleis ${b.gleise.join(' und ')}` : ''}`)
          .join('; ')}`}
      >
        {modell.baender.map((band, i) => {
          const wechsel = modell.wechsel.find(
            (w) =>
              (w.vonLevel === band.level && w.nachLevel === modell.baender[i + 1]?.level) ||
              (w.nachLevel === band.level && w.vonLevel === modell.baender[i + 1]?.level),
          )
          return (
            <div key={band.level}>
              <div
                className={`schema-band schema-band-grob${band.aktiv ? ' aktiv' : ''}`}
                style={{ height: 62 }}
              >
                <div className="schema-bandkopf">
                  <span className="schema-bandname">{band.label}</span>
                </div>
                <div className="schema-grobgleise">
                  {band.gleise.map((gleis) => (
                    <span className="schema-grobgleis" key={gleis}>
                      {gleis}
                    </span>
                  ))}
                </div>
              </div>
              {i < modell.baender.length - 1 && (
                <div className="schema-wechsel" style={{ height: WECHSEL_H }}>
                  <span>{wechsel ? wechselName(wechsel.typ) : 'Ebenenwechsel'}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="schema-hinweis">
        {bahnhofName} · Schema, keine Karte – die Abstände sind nicht maßstäblich.
      </p>
    </section>
  )
}
