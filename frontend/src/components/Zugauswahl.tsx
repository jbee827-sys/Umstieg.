import { useEffect, useState } from 'react'
import { holeTafel } from '../api/client'
import { holeHaltestellenTafel } from '../api/haltestellen'
import {
  FENSTER_NACH_MIN,
  endeNaechsteStunde,
  gruppiereHaltestellenTafel,
  gruppiereTafel,
  type Kategorieblock,
} from '../api/tafelauswahl'
import type { HaltestellenTafelEintrag, Ort, TafelEintrag } from '../api/typen'
import { nahverkehrAmBahnhof } from '../ort/bahnhofsumfeld'
import { ortSchluessel } from '../ort/ortmodell'
import { FahrtBloecke, GewaehlteFahrt } from './Fahrtauswahl'
import { TafelListe, Tafelkategorie } from './Tafelkategorie'

/**
 * Bus, Tram, U-Bahn am Bahnhof (Spec 2026-10-21-bus-am-bahnhof): Die DB-Tafel
 * kennt nur Zuege. Was sonst faehrt, kommt aus der Haltestellentafel des
 * Bahnhofs und steht darunter. Fehlt sie, bleibt es still bei den Zuegen -
 * die Tafel ist dann so gut wie vor dem 21.10.2026, nicht kaputt.
 */
export interface Nahverkehr {
  /** Der Bahnhof als Haltestelle (mit `haltestelleId`). */
  ort: Ort
  auswahl: HaltestellenTafelEintrag | null
  onAuswahl: (e: HaltestellenTafelEintrag | null) => void
}

/** Die Fahrten aus Transitous - an den Ort gebunden, fuer den sie geholt wurden. */
interface NahStand {
  schluessel: string
  eintraege: HaltestellenTafelEintrag[]
}

function holeNahverkehr(ort: Ort, typ: 'arr' | 'dep'): Promise<NahStand | null> {
  return holeHaltestellenTafel(ort, typ)
    .then((e) => (e.ok ? { schluessel: `${ortSchluessel(ort)}|${typ}`, eintraege: e.eintraege } : null))
    .catch(() => null)
}

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
  nahverkehr?: Nahverkehr
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
  /** Die einzige Kategorie der ganzen Tafel - auch mit dem Bus darunter. Vorgabe: einziger Block hier. */
  einzige?: boolean
  /** Ohne eigene Liste - sie steht dann um Zuege und Bus zusammen (`TafelListe`). */
  huelle?: boolean
}

function TafelBloecke({ bloecke, typ, auswahl, markiere, onTipp, einzige, huelle }: TafelBloeckeProps) {
  return (
    <TafelListe huelle={huelle}>
      {bloecke.map((block) => (
        <Tafelkategorie
          key={block.kategorie}
          titel={block.titel}
          anzahl={block.eintraege.length}
          // Eine einzige Kategorie zuzuklappen hiesse nur einen Klick mehr;
          // die mit der gewaehlten Fahrt bleibt offen, sonst saehe man die
          // Markierung nicht.
          anfangsOffen={(einzige ?? bloecke.length === 1) || block.eintraege.some((e) => istAuswahl(e, auswahl))}
        >
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
        </Tafelkategorie>
      ))}
    </TafelListe>
  )
}

// Live-Tafel zum Antippen: übernimmt Zug, Gleis und Zeit inklusive bekannter
// Änderungen (Gleiswechsel rot markiert). Optional – reine Gleiseingabe bleibt möglich.
export function Zugauswahl({ eva, typ, label, auswahl, onAuswahl, immerOffen, nahverkehr }: ZugauswahlProps) {
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
    if (nahverkehr) void holeNahverkehr(nahverkehr.ort, typ).then(setNah)
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

  const [nah, setNah] = useState<NahStand | null>(null)
  const nahSchluessel = nahverkehr ? `${ortSchluessel(nahverkehr.ort)}|${typ}` : null
  // Offener Modus: geladen, sobald der Bahnhof als Haltestelle bekannt ist -
  // die Haltestellen-ID kann spaeter eintreffen als die EVA.
  useEffect(() => {
    if (!immerOffen || !nahverkehr) return
    let gueltig = true
    void holeNahverkehr(nahverkehr.ort, typ).then((n) => {
      if (gueltig) setNah(n)
    })
    return () => {
      gueltig = false
    }
    // `ort` steckt vollstaendig im Schluessel (wie in `Fahrtauswahl`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immerOffen, nahSchluessel])
  /** Bus, Tram ... zu diesen DB-Bloecken - ohne, was die DB-Tafel schon fuehrt. */
  function nahBloecke(db: Kategorieblock[], ab: Date, bis?: Date) {
    if (!nahverkehr || nah?.schluessel !== nahSchluessel) return []
    const dbHatUbahn = db.some((b) => b.kategorie === 'ubahn')
    return gruppiereHaltestellenTafel(nahverkehrAmBahnhof(nah.eintraege, dbHatUbahn), ab, bis)
  }
  const istNahAuswahl = (e: HaltestellenTafelEintrag) => nahverkehr?.auswahl?.fahrtId === e.fahrtId

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
    const offeneNah = aktuell && bis ? nahBloecke(offeneBloecke, aktuell.geholtUm, bis) : []
    const einzige = offeneBloecke.length + offeneNah.length === 1
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
        {aktuell?.eintraege && bis && offeneBloecke.length === 0 && offeneNah.length === 0 && (
          <div className="hinweis-box">Keine Züge bis {hhmm(bis)}.</div>
        )}
        {(offeneBloecke.length > 0 || offeneNah.length > 0) && (
          <TafelListe>
            <TafelBloecke
              bloecke={offeneBloecke}
              typ={typ}
              auswahl={auswahl}
              markiere
              onTipp={(e) => onAuswahl(istAuswahl(e, auswahl) ? null : e)}
              einzige={einzige}
              huelle={false}
            />
            {nahverkehr && (
              <FahrtBloecke
                bloecke={offeneNah}
                typ={typ}
                auswahl={nahverkehr.auswahl}
                markiere
                onTipp={(e) => nahverkehr.onAuswahl(istNahAuswahl(e) ? null : e)}
                bahnhofName={nahverkehr.ort.name}
                einzige={einzige}
                huelle={false}
              />
            )}
          </TafelListe>
        )}
      </div>
    )
  }

  if (nahverkehr?.auswahl) {
    return (
      <GewaehlteFahrt auswahl={nahverkehr.auswahl} typ={typ} onAendern={() => nahverkehr.onAuswahl(null)} />
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

  const aufgeklappteNah = offen && geholtUm ? nahBloecke(bloecke, geholtUm) : []
  const einzigeAufgeklappt = bloecke.length + aufgeklappteNah.length === 1
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
      {offen && eintraege && bloecke.length === 0 && aufgeklappteNah.length === 0 && (
        <div className="hinweis-box">
          Keine Züge in den nächsten {FENSTER_NACH_MIN} Minuten.
        </div>
      )}
      {offen && (bloecke.length > 0 || aufgeklappteNah.length > 0) && (
        <TafelListe>
          <TafelBloecke
            bloecke={bloecke}
            typ={typ}
            auswahl={auswahl}
            markiere={false}
            onTipp={onAuswahl}
            einzige={einzigeAufgeklappt}
            huelle={false}
          />
          {nahverkehr && (
            <FahrtBloecke
              bloecke={aufgeklappteNah}
              typ={typ}
              auswahl={null}
              markiere={false}
              onTipp={nahverkehr.onAuswahl}
              bahnhofName={nahverkehr.ort.name}
              einzige={einzigeAufgeklappt}
              huelle={false}
            />
          )}
        </TafelListe>
      )}
    </div>
  )
}
