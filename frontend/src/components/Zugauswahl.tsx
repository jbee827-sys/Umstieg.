import { useEffect, useState } from 'react'
import { holeTafel } from '../api/client'
import {
  FENSTER_NACH_MIN,
  endeNaechsteStunde,
  gruppiereTafel,
  type Kategorieblock,
} from '../api/tafelauswahl'
import type { TafelEintrag } from '../api/typen'

interface ZugauswahlProps {
  eva: string
  typ: 'arr' | 'dep'
  /** Knopftext - im offenen Modus der Titel der Spalte („Ankunft · Berlin Hbf"). */
  label: string
  auswahl: TafelEintrag | null
  onAuswahl: (eintrag: TafelEintrag | null) => void
  /**
   * Breites Layout (Spec 2026-10-11): kein Knopf, die Tafel laedt sofort,
   * reicht bis zum Ende der naechsten Stunde und bleibt nach der Wahl stehen -
   * die gewaehlte Zeile ist markiert, ein zweiter Tipp hebt die Wahl auf.
   */
  immerOffen?: boolean
}

function fehlertext(fehler: string): string {
  return fehler === 'db-zugang-fehlt'
    ? 'Live-Tafel nicht verfügbar (kein DB-Zugang) – Gleis bitte manuell eingeben.'
    : 'Live-Tafel derzeit nicht erreichbar.'
}

/** "14:05" aus einem Zeitpunkt. */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Dieselbe Fahrt: Zugname und Sollzeit - so findet auch ein importierter Zug seine Zeile. */
function istAuswahl(eintrag: TafelEintrag, auswahl: TafelEintrag | null): boolean {
  return auswahl !== null && auswahl.zug === eintrag.zug && auswahl.zeitSoll === eintrag.zeitSoll
}

/** Stand der offenen Tafel - immer an die EVA gebunden, fuer die er geholt wurde. */
interface OffenerStand {
  eva: string
  geholtUm: Date
  eintraege: TafelEintrag[] | null
  fehler: string | null
}

interface TafelBloeckeProps {
  bloecke: Kategorieblock[]
  typ: 'arr' | 'dep'
  auswahl: TafelEintrag | null
  /** Gewaehlte Zeile mit `aria-pressed` kennzeichnen (nur im offenen Modus). */
  markiere: boolean
  onTipp: (eintrag: TafelEintrag) => void
}

function TafelBloecke({ bloecke, typ, auswahl, markiere, onTipp }: TafelBloeckeProps) {
  return (
    <div className="tafel-bloecke">
      {bloecke.map((block) => (
        <section
          key={block.kategorie}
          className="tafel-block"
          role="group"
          aria-label={block.titel}
        >
          <h3 className="tafel-block-titel">{block.titel}</h3>
          {/* Jede Kategorie rollt fuer sich: Sonst schoebe der
              Regionalverkehr die S-Bahn aus dem Bild, und man muesste an
              einer Kategorie vorbeiscrollen, die einen nicht angeht. */}
          <ul className="tafel">
            {block.eintraege.map((eintrag, i) => (
              <li key={`${eintrag.zug}-${eintrag.zeitSoll}-${i}`}>
                <button
                  type="button"
                  aria-pressed={markiere ? istAuswahl(eintrag, auswahl) : undefined}
                  onClick={() => onTipp(eintrag)}
                >
                  <span className="tafel-zeit">
                    {eintrag.zeitIst ?? eintrag.zeitSoll}
                    {eintrag.zeitIst && <s className="tafel-alt"> {eintrag.zeitSoll}</s>}
                  </span>
                  <span className="tafel-zug">
                    <strong>{eintrag.zug}</strong> {typ === 'arr' ? 'aus' : 'nach'}{' '}
                    {eintrag.ziel}
                  </span>
                  <span className={`tafel-gleis${eintrag.gleisIst ? ' gleiswechsel' : ''}`}>
                    Gl. {eintrag.gleisIst ?? eintrag.gleisSoll}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Live-Tafel zum Antippen: übernimmt Zug, Gleis und Zeit inklusive bekannter
// Änderungen (Gleiswechsel rot markiert). Optional – reine Gleiseingabe bleibt möglich.
export function Zugauswahl({ eva, typ, label, auswahl, onAuswahl, immerOffen }: ZugauswahlProps) {
  const [offen, setOffen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [eintraege, setEintraege] = useState<TafelEintrag[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  /**
   * Der Zeitpunkt, auf den sich das Fenster bezieht - festgehalten beim
   * Abruf, nicht bei jedem Rendern neu von der Uhr gelesen. Sonst schoebe
   * sich das Fenster bei jedem Tastendruck im Formular weiter, und Zuege
   * verschwaenden aus einer offenen Liste, waehrend man sie ansieht.
   */
  const [geholtUm, setGeholtUm] = useState<Date | null>(null)

  // Geladen wird aus dem Ereignis, das es ausloest, nicht aus einem Effekt:
  // Ein Effekt haette den Abruf erst nach einem zusaetzlichen Rendergang
  // angestossen, und `setLaden(true)` darin einen weiteren erzwungen.
  function klappeUm() {
    const gehtAuf = !offen
    setOffen(gehtAuf)
    if (!gehtAuf || eintraege !== null || laden) return
    setLaden(true)
    setGeholtUm(new Date())
    holeTafel(eva, typ)
      .then((ergebnis) => {
        setLaden(false)
        if (ergebnis.ok) {
          setEintraege(ergebnis.eintraege)
          setFehler(null)
        } else {
          setFehler(fehlertext(ergebnis.fehler))
        }
      })
      // `holeTafel` fängt heute selbst ab und antwortet mit `{ ok: false }`.
      // Das ist eine Zusicherung des Aufgerufenen, und darauf darf sich der
      // Ladezustand nicht verlassen: Bricht sie, bliebe `setLaden(false)`
      // ungelaufen, und „Tafel wird geladen …" stünde bis zum Neuladen der
      // Seite. Ein hängender Spinner ist die unehrlichste aller Anzeigen –
      // er verspricht, dass gleich etwas kommt.
      .catch(() => {
        setLaden(false)
        setFehler('Live-Tafel derzeit nicht erreichbar.')
      })
  }

  // Abgeleitet, nicht gespeichert: Die Bloecke haengen an nichts als den
  // Eintraegen und dem Abrufzeitpunkt.
  const bloecke = eintraege && geholtUm ? gruppiereTafel(eintraege, geholtUm) : []

  // Offener Modus: Es gibt kein Ereignis, das den Abruf ausloest - er haengt
  // an der EVA. Zustand wird nur im Rueckruf gesetzt, nie synchron im Effekt.
  const [stand, setStand] = useState<OffenerStand | null>(null)
  useEffect(() => {
    if (!immerOffen) return
    // Eine spaete Antwort fuer einen inzwischen verlassenen Bahnhof wird
    // verworfen - sonst stuenden fremde Zuege unter dem neuen Titel.
    let gueltig = true
    const abruf = new Date()
    holeTafel(eva, typ)
      .then((ergebnis) => {
        if (!gueltig) return
        setStand(
          ergebnis.ok
            ? { eva, geholtUm: abruf, eintraege: ergebnis.eintraege, fehler: null }
            : { eva, geholtUm: abruf, eintraege: null, fehler: fehlertext(ergebnis.fehler) },
        )
      })
      .catch(() => {
        if (gueltig) setStand({ eva, geholtUm: abruf, eintraege: null, fehler: fehlertext('') })
      })
    return () => {
      gueltig = false
    }
  }, [immerOffen, eva, typ])

  if (immerOffen) {
    // Abgeleitet: Ein Stand fuer eine andere EVA ist keiner - dann laedt es.
    const aktuell = stand?.eva === eva ? stand : null
    const bis = aktuell ? endeNaechsteStunde(aktuell.geholtUm) : null
    const offeneBloecke =
      aktuell?.eintraege && bis ? gruppiereTafel(aktuell.eintraege, aktuell.geholtUm, bis) : []
    return (
      <div className="zugauswahl offen">
        <div className="tafel-spalte-kopf">
          <h3 className="tafel-spalte-titel">{label}</h3>
          {aktuell && <span className="tafel-stand">Stand {hhmm(aktuell.geholtUm)}</span>}
        </div>
        {!aktuell && (
          // Skelett statt Satz (DESIGN.md 4) - ohne Bewegung (DESIGN.md 6).
          <div className="tafel-skelett" role="status" aria-label="Tafel wird geladen">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {aktuell?.fehler && <div className="hinweis-box">{aktuell.fehler}</div>}
        {aktuell?.eintraege && bis && offeneBloecke.length === 0 && (
          <div className="hinweis-box">Keine Züge bis {hhmm(bis)}.</div>
        )}
        {offeneBloecke.length > 0 && (
          <TafelBloecke
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
          <strong>{auswahl.zug}</strong>
          <span>
            {typ === 'arr' ? 'aus' : 'nach'} {auswahl.ziel} ·{' '}
            {auswahl.zeitIst ?? auswahl.zeitSoll}
            {auswahl.gleisIst ? (
              <strong className="gleiswechsel"> · Gleis {auswahl.gleisIst} (geändert!)</strong>
            ) : (
              <> · Gleis {auswahl.gleisSoll}</>
            )}
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
      <button
        type="button"
        className="knopf-sekundaer"
        aria-expanded={offen}
        onClick={klappeUm}
      >
        {label}
      </button>
      {offen && laden && <div className="lade-hinweis">Tafel wird geladen …</div>}
      {offen && fehler && <div className="hinweis-box">{fehler}</div>}
      {offen && eintraege && bloecke.length === 0 && (
        <div className="hinweis-box">
          Keine Züge in den nächsten {FENSTER_NACH_MIN} Minuten.
        </div>
      )}
      {offen && bloecke.length > 0 && (
        <TafelBloecke
          bloecke={bloecke}
          typ={typ}
          auswahl={auswahl}
          markiere={false}
          onTipp={onAuswahl}
        />
      )}
    </div>
  )
}
