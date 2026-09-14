import type { KantenTyp } from '../api/typen'
import type { SchemaModell } from '../schema/ableitung'
import type { Band, Bandmodell } from '../schema/bandmodell'
import {
  massgeblicherBahnsteig,
  wechselAnweisung,
  wechselName,
  wegLaengeM,
} from '../schema/bandmodell'
import { zeichneBand } from '../schema/bandbild'
import type {
  Bildbalken,
  Bildkasten,
  Bildpunkt,
  Bildstrich,
  Gleisbild,
  Uebergangsbild,
  Wechselmarke,
} from '../schema/bandbild'
import { RUHIG_H, WECHSEL_H, aktivHoehe, bildflaeche } from '../schema/masse'

interface EbenenschemaProps {
  /** Aus der echten Geometrie. Fehlt sie, greift `ersatz`. */
  modell: Bandmodell | null
  /** Die alte Ableitung aus den Schritttexten — Standardmodell und Altbestand. */
  ersatz: SchemaModell
  bahnhofName: string
}

/** Rolltreppe durchgezogen, Treppe gestrichelt — die Form kommt aus der Sache. */
function strichmuster(typ: KantenTyp): string | undefined {
  return typ === 'treppe' ? '3 3' : undefined
}

const pfad = (punkte: Bildpunkt[]): string => `M ${punkte.map((p) => `${p.x} ${p.y}`).join(' L ')}`

function Balken({ balken, breite }: { balken: Bildbalken[]; breite: number }) {
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
              strokeWidth={wichtig ? 13 : 3}
            />
            {/* Die Anlagen sitzen AM Gleis, also liegen ihre Marken IM Balken —
                hell ausgespart, damit sie auf dem dunklen Bahnsteig tragen. */}
            {b.marken.map((m, i) =>
              m.typ === 'aufzug' ? (
                <rect
                  key={i}
                  className="schema-marke-aufzug"
                  x={m.x - 3.5}
                  y={b.y - 3.5}
                  width={7}
                  height={7}
                  rx={1.5}
                />
              ) : (
                <line
                  key={i}
                  className="schema-marke"
                  x1={m.x}
                  y1={b.y - 6}
                  x2={m.x}
                  y2={b.y + 6}
                  strokeWidth={m.aufRoute ? 3.4 : 2}
                  strokeDasharray={m.typ === 'treppe' ? '2.2 2' : undefined}
                />
              ),
            )}
            {b.zugang && (
              <text
                className="schema-notiz"
                x={Math.min(breite - 4, Math.max(b.lx + 12, b.zugang.x))}
                y={b.y - 12}
                textAnchor={b.zugang.x > breite - 46 ? 'end' : 'middle'}
              >
                {b.zugang.beiM} m
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

function Anlagen({ striche, kaesten }: { striche: Bildstrich[]; kaesten: Bildkasten[] }) {
  return (
    <>
      {striche.map((s, i) => (
        <line
          key={`s${i}`}
          className={`schema-anlage${s.aufRoute ? ' auf-route' : ''}`}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          strokeWidth={s.aufRoute ? 3 : 1.8}
          strokeDasharray={strichmuster(s.typ)}
        />
      ))}
      {kaesten.map((k, i) => (
        <rect
          key={`k${i}`}
          className={`schema-aufzug${k.aufRoute ? ' auf-route' : ''}`}
          x={k.x - k.seite / 2}
          y={k.y - k.seite / 2}
          width={k.seite}
          height={k.seite}
          rx={1.5}
          strokeWidth={k.aufRoute ? 2.4 : 1.6}
        />
      ))}
    </>
  )
}

/**
 * Wo der Weg die Ebene wechselt — an beiden Enden, auf beiden Ebenen.
 *
 * Wo er sie VERLÄSST, steht die Anweisung („Treppe ↓"): Das ist die Stelle,
 * die der Reisende finden muss. Wo er ANKOMMT, genügt ein Ring — dort steht
 * er schon.
 */
function Wechselmarken({ marken, breite }: { marken: Wechselmarke[]; breite: number }) {
  return (
    <>
      {marken.map((m, i) => {
        if (m.art === 'ankommen') {
          return <circle key={i} className="schema-ankunftsring" cx={m.x} cy={m.y} r={6} />
        }
        const pfeil = m.richtung === 'hinunter' ? 'M0 -4 V4 M-3.5 0.5 L0 4 L3.5 0.5' : 'M0 4 V-4 M-3.5 -0.5 L0 -4 L3.5 -0.5'
        const rechtsbuendig = m.x > breite - 86
        return (
          <g key={i}>
            <circle className="schema-wechselmarke" cx={m.x} cy={m.y} r={8.5} />
            <path className="schema-wechselmarke-pfeil" d={pfeil} transform={`translate(${m.x} ${m.y})`} />
            <text
              className="schema-wechseltext"
              x={rechtsbuendig ? m.x - 12 : m.x + 12}
              y={m.y - 9}
              textAnchor={rechtsbuendig ? 'end' : 'start'}
            >
              {`${wechselName(m.typ)} ${m.richtung === 'hinunter' ? '↓' : '↑'}`}
            </text>
          </g>
        )
      })}
    </>
  )
}

/** Weg, Start und Ziel — auf jeder Ebene gleich gezeichnet. */
function Weg({ bild }: { bild: Gleisbild | Uebergangsbild }) {
  return (
    <>
      {bild.weg.length > 1 && (
        <>
          {/* Heller Saum darunter: Der Weg muss auch über dem roten
              Abfahrtsbahnsteig lesbar bleiben. */}
          <path className="schema-weg-saum" d={pfad(bild.weg)} />
          <path className="schema-weg" d={pfad(bild.weg)} />
        </>
      )}
      <Anlagen striche={bild.anlagen} kaesten={bild.aufzuege} />
      {bild.ziel && <circle className="schema-ziel" cx={bild.ziel.x} cy={bild.ziel.y} r={5.5} />}
      {bild.start && (
        <g>
          <circle className="schema-start" cx={bild.start.x} cy={bild.start.y} r={7} />
          <circle className="schema-start-kern" cx={bild.start.x} cy={bild.start.y} r={2.8} />
        </g>
      )}
    </>
  )
}

function Gleisband({ bild, breite }: { bild: Gleisbild; breite: number }) {
  return (
    <>
      <Balken balken={bild.balken} breite={breite} />
      <Weg bild={bild} />
      <Wechselmarken marken={bild.wechsel} breite={breite} />
      {bild.standorte?.marken.map((m) => (
        <text
          key={m.name}
          className={`schema-standort${m.hier ? ' hier' : ''}`}
          x={m.x}
          y={bild.standorte!.y + 4}
          textAnchor={m.name === 'Anfang' ? 'start' : m.name === 'Ende' ? 'end' : 'middle'}
        >
          {m.hier ? `▲ ${m.name}` : m.name}
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
      <Anlagen striche={bild.striche} kaesten={bild.kaesten} />
      <Weg bild={bild} />
      <Wechselmarken marken={bild.wechsel} breite={breite} />
    </>
  )
}

function mehrzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`
}

/** Die Fußzeile eines aktiven Bandes — die Auskunft, die dort zählt. */
export function fusstext(band: Band): string | null {
  const meter = wegLaengeM(band.ebene.weg)
  if (band.art === 'verbindung') {
    const teile = [
      meter > 0 ? `${meter} m` : 'nur durchqueren',
      band.wechselNachher ? `dann ${wechselAnweisung(band.wechselNachher)}` : null,
    ]
    return teile.filter(Boolean).join(' · ')
  }

  const bahnsteig = massgeblicherBahnsteig(band.ebene, band.erster, band.letzter)
  const genutzt = (bahnsteig?.zugaenge ?? []).find((z) => z.aufRoute)
  if (band.wechselNachher) {
    if (!genutzt) return `${wechselAnweisung(band.wechselNachher)} nach ${meter} m`
    const anlagen = [
      genutzt.rolltreppe > 0 ? mehrzahl(genutzt.rolltreppe, 'Rolltreppe', 'Rolltreppen') : null,
      genutzt.treppe > 0 ? mehrzahl(genutzt.treppe, 'Treppe', 'Treppen') : null,
      genutzt.aufzug > 0 ? mehrzahl(genutzt.aufzug, 'Aufzug', 'Aufzüge') : null,
    ]
      .filter(Boolean)
      .join(', ')
    return `${wechselAnweisung(band.wechselNachher)} bei ${genutzt.beiM} m${anlagen ? ` · ${anlagen}` : ''}`
  }
  if (band.wechselVorher) {
    return genutzt
      ? `Oben bei ${genutzt.beiM} m · dann ${meter} m zum Zug`
      : `${meter} m zum Zug`
  }
  return `Ohne Ebenenwechsel · ${meter} m`
}

/** Was das Bild dieses Bandes NICHT belegt. */
function vorbehaltFuer(band: Band): string {
  return band.art === 'gleise'
    ? 'Bahnsteige maßstäblich in der Länge; quer stimmt die Reihenfolge, nicht der Maßstab.'
    : 'Grundriss aus dem Kartenmaterial — Gänge, Anlagen und Weg sind gemessen.'
}

function bandTitel(band: Band): string {
  const rolle = band.rolle === 'start' ? ' · Ankunft' : band.rolle === 'ziel' ? ' · Abfahrt' : ''
  const art = band.art === 'verbindung' ? ' · Übergang' : ''
  return `${band.label}${art}${rolle}`
}

/** Der ganze Weg in einem Satz — für Screenreader, und als Probe für Tests. */
export function wegBeschreibung(modell: Bandmodell, bahnhofName: string): string {
  const teile: string[] = []
  for (const band of modell.baender) {
    teile.push(`${bandTitel(band)}${band.aktiv ? ' (hier)' : ''}`)
    if (band.wechselNachher) teile.push(wechselAnweisung(band.wechselNachher))
  }
  return `Weg durch ${bahnhofName}: ${teile.join(', ')}`
}

/**
 * Das Bahnhofsschema: ein Band je EBENENBESUCH, mit echter Geometrie.
 *
 * Bewusst keine Landkarte. Der Weg führt durch eine geschlossene Halle über
 * bis zu fünf Stockwerke; eine Straßenkarte zeigt dort ein Dach. Gebraucht
 * wird nicht „wo auf der Erde", sondern „wie liegt es zueinander".
 *
 * Bis zum 13.09.2026 leitete dieses Bild sich aus den SCHRITTTEXTEN ab und
 * kannte weder Bahnsteige noch Zugänge noch Netz. Es sortierte die Ebenen
 * nach Höhe — und verschwieg damit genau das, was einen Umstieg entscheidet:
 * dass man in Leipzig vom Bahnsteiganfang hinunter in die Unterführung geht
 * und wieder herauf. Jetzt kommt jede Linie aus `/api/route`.
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
              {band.wechselNachher && i < anzahl - 1 && (
                <div className="schema-wechsel" style={{ height: WECHSEL_H }}>
                  <span aria-hidden="true">
                    {band.wechselNachher.nachLevel < band.wechselNachher.vonLevel ? '↓' : '↑'}
                  </span>
                  <span>{wechselAnweisung(band.wechselNachher)}</span>
                </div>
              )}
              {!band.wechselNachher && i < anzahl - 1 && (
                <div className="schema-wechsel" style={{ height: WECHSEL_H }}>
                  <span>Ebenenwechsel</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="schema-legende" aria-hidden="true">
        <span className="schema-legende-eintrag">
          <svg width="14" height="6" viewBox="0 0 14 6">
            <line x1="0" y1="3" x2="14" y2="3" className="schema-legende-strich" />
          </svg>
          Rolltreppe
        </span>
        <span className="schema-legende-eintrag">
          <svg width="14" height="6" viewBox="0 0 14 6">
            <line x1="0" y1="3" x2="14" y2="3" className="schema-legende-strich" strokeDasharray="3 2" />
          </svg>
          Treppe
        </span>
        <span className="schema-legende-eintrag">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <rect x="1" y="1" width="6" height="6" rx="1.2" className="schema-legende-kasten" />
          </svg>
          Aufzug
        </span>
      </p>
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
