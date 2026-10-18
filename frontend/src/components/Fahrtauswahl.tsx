import { useEffect, useState } from 'react'
import { holeHaltestellenTafel, type HaltestellenFehler } from '../api/haltestellen'
import {
  FENSTER_NACH_MIN,
  endeNaechsteStunde,
  gruppiereHaltestellenTafel,
  type HaltestellenBlock,
} from '../api/tafelauswahl'
import type { HaltestellenTafelEintrag, Ort } from '../api/typen'
import { uhrzeit } from '../api/zeit'
import { ortSchluessel } from '../ort/ortmodell'
import { steigText } from '../ort/steig'
import { VerkehrsmittelSymbole } from '../ort/verkehrsmittel'

interface FahrtauswahlProps {
  ort: Ort
  typ: 'arr' | 'dep'
  /** Knopftext - im offenen Modus der Titel der Spalte („Abfahrt · Kassel Rathaus"). */
  label: string
  auswahl: HaltestellenTafelEintrag | null
  onAuswahl: (e: HaltestellenTafelEintrag | null) => void
  /** Breites Layout, wie `Zugauswahl`: kein Knopf, laedt sofort, bleibt stehen. */
  immerOffen?: boolean
}

const FEHLERTEXT: Record<HaltestellenFehler, string> = {
  'nicht-verfuegbar': 'Haltestellendaten gerade nicht verfügbar.',
  'nicht-eingerichtet': 'Haltestellen sind auf diesem Server nicht eingerichtet.',
  unbekannt: 'Diese Haltestelle ist gerade nicht bekannt.',
  netz: 'Keine Verbindung zum Server.',
}

/** Dieselbe Fahrt heisst: dieselbe Fahrt-ID - nicht Linie und Zeit (zwei Busse derselben Linie zur selben Minute gibt es). */
function istAuswahl(e: HaltestellenTafelEintrag, auswahl: HaltestellenTafelEintrag | null): boolean {
  return auswahl !== null && auswahl.fahrtId === e.fahrtId
}

/** Ist-Zeit, und die Soll-Zeit durchgestrichen daneben, wenn sie abweicht. */
function Zeit({ e }: { e: HaltestellenTafelEintrag }) {
  const soll = uhrzeit(e.zeitSoll)
  const ist = e.zeitIst ? uhrzeit(e.zeitIst) : soll
  return (
    <span className="tafel-zeit">
      {ist}
      {ist !== soll && <s className="tafel-alt"> {soll}</s>}
    </span>
  )
}

/**
 * F5/K3: Ohne Echtzeit steht es dran. Ein Ausfall sagt es selbst - und ist
 * nicht waehlbar: Einen Weg zu einer Fahrt, die nicht kommt, braucht niemand.
 */
function Kennzeichen({ e }: { e: HaltestellenTafelEintrag }) {
  if (e.ausfall) return <span className="kennzeichen-ausfall">fällt aus</span>
  if (!e.echtzeit) return <span className="kennzeichen-fahrplan">laut Fahrplan</span>
  return null
}

interface BloeckeProps {
  bloecke: HaltestellenBlock[]
  typ: 'arr' | 'dep'
  auswahl: HaltestellenTafelEintrag | null
  markiere: boolean
  onTipp: (e: HaltestellenTafelEintrag) => void
}

function FahrtBloecke({ bloecke, typ, auswahl, markiere, onTipp }: BloeckeProps) {
  return (
    <div className="tafel-bloecke">
      {bloecke.map((block) => (
        <section key={block.verkehrsmittel} className="tafel-block" role="group" aria-label={block.titel}>
          <h3 className="tafel-block-titel">{block.titel}</h3>
          <ul className="tafel">
            {block.eintraege.map((e) => (
              <li key={e.fahrtId}>
                <button
                  type="button"
                  className={e.ausfall ? 'faellt-aus' : undefined}
                  disabled={e.ausfall}
                  aria-pressed={markiere ? istAuswahl(e, auswahl) : undefined}
                  onClick={() => onTipp(e)}
                >
                  <Zeit e={e} />
                  <span className="tafel-zug">
                    <VerkehrsmittelSymbole liste={[e.verkehrsmittel]} /> <strong>{e.linie}</strong>{' '}
                    {typ === 'arr' ? 'aus' : 'nach'} {e.ziel}
                  </span>
                  {/* Neben, nicht in der Zeile: Die wird bei langem Ziel mit
                      „…“ gekuerzt - und „laut Fahrplan“ (F5) ging mit. */}
                  <Kennzeichen e={e} />
                  <span className={`tafel-gleis${e.steigIst ? ' gleiswechsel' : ''}`}>{steigText(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Stand der offenen Tafel - an den Ort gebunden, fuer den er geholt wurde. */
interface OffenerStand {
  schluessel: string
  geholtUm: Date
  stand: string | null
  eintraege: HaltestellenTafelEintrag[] | null
  fehler: string | null
}

/**
 * Tafel einer Haltestelle zum Antippen (Umstieg 2.0) - das Gegenstueck zu
 * `Zugauswahl` im Bahnhofspfad.
 */
export function Fahrtauswahl({ ort, typ, label, auswahl, onAuswahl, immerOffen }: FahrtauswahlProps) {
  const [offen, setOffen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [eintraege, setEintraege] = useState<HaltestellenTafelEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [geholtUm, setGeholtUm] = useState<Date | null>(null)

  // Aus dem Ereignis geladen, nicht aus einem Effekt - wie in `Zugauswahl`.
  function klappeUm() {
    const gehtAuf = !offen
    setOffen(gehtAuf)
    if (!gehtAuf || eintraege !== null || laden) return
    setLaden(true)
    setGeholtUm(new Date())
    holeHaltestellenTafel(ort, typ)
      .then((ergebnis) => {
        setLaden(false)
        if (ergebnis.ok) {
          setEintraege(ergebnis.eintraege)
          setFehler(null)
        } else {
          setFehler(FEHLERTEXT[ergebnis.fehler])
        }
      })
      // Ein haengender Ladehinweis verspraeche, dass gleich etwas kommt.
      .catch(() => {
        setLaden(false)
        setFehler(FEHLERTEXT.netz)
      })
  }

  const bloecke = eintraege && geholtUm ? gruppiereHaltestellenTafel(eintraege, geholtUm) : []

  const schluessel = `${ortSchluessel(ort)}|${typ}`
  const [offenerStand, setOffenerStand] = useState<OffenerStand | null>(null)
  useEffect(() => {
    if (!immerOffen) return
    // Eine spaete Antwort fuer einen verlassenen Ort wird verworfen.
    let gueltig = true
    const abruf = new Date()
    holeHaltestellenTafel(ort, typ)
      .then((ergebnis) => {
        if (!gueltig) return
        setOffenerStand(
          ergebnis.ok
            ? { schluessel, geholtUm: abruf, stand: ergebnis.stand, eintraege: ergebnis.eintraege, fehler: null }
            : { schluessel, geholtUm: abruf, stand: null, eintraege: null, fehler: FEHLERTEXT[ergebnis.fehler] },
        )
      })
      .catch(() => {
        if (gueltig) {
          setOffenerStand({ schluessel, geholtUm: abruf, stand: null, eintraege: null, fehler: FEHLERTEXT.netz })
        }
      })
    return () => {
      gueltig = false
    }
    // `ort` steckt vollstaendig im Schluessel; ein neues Objekt desselben Orts laedt nicht neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immerOffen, schluessel])

  if (immerOffen) {
    const aktuell = offenerStand?.schluessel === schluessel ? offenerStand : null
    const bis = aktuell ? endeNaechsteStunde(aktuell.geholtUm) : null
    const offeneBloecke =
      aktuell?.eintraege && bis ? gruppiereHaltestellenTafel(aktuell.eintraege, aktuell.geholtUm, bis) : []
    return (
      <div className="zugauswahl offen">
        <div className="tafel-spalte-kopf">
          <h3 className="tafel-spalte-titel">{label}</h3>
          {aktuell?.stand && <span className="tafel-stand">Stand {uhrzeit(aktuell.stand)}</span>}
        </div>
        {!aktuell && (
          <div className="tafel-skelett" role="status" aria-label="Tafel wird geladen">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {aktuell?.fehler && <div className="hinweis-box">{aktuell.fehler}</div>}
        {aktuell?.eintraege && bis && offeneBloecke.length === 0 && (
          <div className="hinweis-box">Keine Fahrten bis {uhrzeit(bis.toISOString())}.</div>
        )}
        {offeneBloecke.length > 0 && (
          <FahrtBloecke
            bloecke={offeneBloecke}
            typ={typ}
            auswahl={auswahl}
            markiere
            onTipp={(e) => onAuswahl(istAuswahl(e, auswahl) ? null : e)}
          />
        )}
      </div>
    )
  }

  if (auswahl) {
    return (
      <div className="zug-gewaehlt">
        <div className="zug-gewaehlt-text">
          <strong>
            <VerkehrsmittelSymbole liste={[auswahl.verkehrsmittel]} /> {auswahl.linie}
          </strong>
          <span>
            {typ === 'arr' ? 'aus' : 'nach'} {auswahl.ziel} · {uhrzeit(auswahl.zeitIst ?? auswahl.zeitSoll)} ·{' '}
            {steigText(auswahl)} <Kennzeichen e={auswahl} />
          </span>
        </div>
        <button type="button" className="knopf-sekundaer" onClick={() => onAuswahl(null)}>
          Ändern
        </button>
      </div>
    )
  }

  return (
    <div className="zugauswahl">
      <button type="button" className="knopf-sekundaer" aria-expanded={offen} onClick={klappeUm}>
        {label}
      </button>
      {offen && laden && <div className="lade-hinweis">Tafel wird geladen …</div>}
      {offen && fehler && <div className="hinweis-box">{fehler}</div>}
      {offen && eintraege && bloecke.length === 0 && (
        <div className="hinweis-box">Keine Fahrten in den nächsten {FENSTER_NACH_MIN} Minuten.</div>
      )}
      {offen && bloecke.length > 0 && (
        <FahrtBloecke bloecke={bloecke} typ={typ} auswahl={auswahl} markiere={false} onTipp={onAuswahl} />
      )}
    </div>
  )
}
