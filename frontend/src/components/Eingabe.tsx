import { useEffect, useRef, useState } from 'react'
import { sucheStationen } from '../api/client'
import type { BahnhofTreffer, Gehprofil, RoutenVariante, TafelEintrag } from '../api/typen'
import { Zugauswahl } from './Zugauswahl'

export interface EingabeWerte {
  eva: string
  bahnhofName: string
  gleisAn: string
  gleisAb: string
  wagen: string
  profil: Gehprofil
  variante: RoutenVariante
  /** Zugnummer des Ankunftszugs (für die Wagenreihung), z. B. "3" aus "RE 3" */
  zugAn?: string
  /** Volle Bezeichnungen wie in der Tafel ("ICE 1006") – Filter für die Live-Überwachung. */
  zugAnName?: string
  zugAbName?: string
  ankunftZeit?: string
  abfahrtZeit?: string
}

/** "ICE 1006" → "1006" */
function zugnummer(zug: string): string | undefined {
  return zug.split(' ').pop() || undefined
}

interface EingabeProps {
  laden: boolean
  fehler: string | null
  /** Per Standort erkannte Bahnhoefe; leer, solange nichts erkannt wurde. */
  erkannt?: BahnhofTreffer[]
  onBerechnen: (werte: EingabeWerte) => void
}

const PROFILE: { wert: Gehprofil; label: string }[] = [
  { wert: 'zuegig', label: 'Zügig' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'langsam', label: 'Langsam / Gepäck' },
]

// Eingabemaske nach dem Onboarding-Screen des Designs: Bahnhofssuche mit
// Vervollständigung, Gleis an/ab (Pflicht), Wagennummer optional, große
// Auswahlflächen für Gehprofil und Routenvariante.
export function Eingabe({ laden, fehler, erkannt, onBerechnen }: EingabeProps) {
  const [suchtext, setSuchtext] = useState('')
  const [vorschlaege, setVorschlaege] = useState<BahnhofTreffer[]>([])
  const [gewaehlt, setGewaehlt] = useState<BahnhofTreffer | null>(null)
  const [dbFehlt, setDbFehlt] = useState(false)
  const [netzFehlt, setNetzFehlt] = useState(false)
  const [evaManuell, setEvaManuell] = useState('')
  const [gleisAn, setGleisAn] = useState('')
  const [gleisAb, setGleisAb] = useState('')
  const [wagen, setWagen] = useState('')
  const [profil, setProfil] = useState<Gehprofil>('normal')
  const [zugAnkunft, setZugAnkunft] = useState<TafelEintrag | null>(null)
  const [zugAbfahrt, setZugAbfahrt] = useState<TafelEintrag | null>(null)
  const suchTimer = useRef<number | undefined>(undefined)
  const [erkennungVerworfen, setErkennungVerworfen] = useState(false)

  // Vorbelegt wird NUR ein leeres Feld: Die Erkennung trifft verzoegert ein
  // und darf eine bereits getippte Eingabe nicht ueberschreiben.
  //
  // Angepasst wird beim Wechsel des Props, nicht in einem Effekt: Ein Effekt
  // haette den bereits gezeichneten leeren Bildschirm nachtraeglich
  // ueberschrieben - ein sichtbarer zweiter Rendergang fuer etwas, das schon
  // beim ersten feststeht.
  // `null` heisst „noch nie gesehen“ und ist als Prop unmoeglich (dort gibt es
  // nur eine Liste oder `undefined`). Mit `erkannt` als Anfangswert waere der
  // Vergleich beim ersten Rendern wahr - und ein bereits erkannter Bahnhof
  // haette es nie ins Feld geschafft.
  const [zuletztErkannt, setZuletztErkannt] = useState<BahnhofTreffer[] | undefined | null>(null)
  if (erkannt !== zuletztErkannt) {
    setZuletztErkannt(erkannt)
    if (!erkennungVerworfen && !gewaehlt && suchtext === '' && erkannt?.length === 1) {
      setGewaehlt(erkannt[0])
      setSuchtext(erkannt[0].name)
    }
  }

  // Bahnhofssuche mit Entprellung; 503 → Freitext-Fallback (EVA direkt eingeben)
  useEffect(() => {
    window.clearTimeout(suchTimer.current)
    // Nicht leeren, nur nicht suchen: Ob Vorschlaege sichtbar sind, steht
    // beim Rendern schon fest (siehe `sichtbareVorschlaege`). Das hier war
    // der einzige Grund, im Effekt Zustand zu setzen.
    if (gewaehlt || suchtext.trim().length < 2) return
    suchTimer.current = window.setTimeout(async () => {
      const ergebnis = await sucheStationen(suchtext.trim())
      if (ergebnis.ok) {
        setDbFehlt(false)
        setNetzFehlt(false)
        setVorschlaege(ergebnis.treffer.slice(0, 6))
      } else if (ergebnis.fehler === 'db-zugang-fehlt') {
        setDbFehlt(true)
        setNetzFehlt(false)
        setVorschlaege([])
      } else {
        // Frueher fiel dieser Fall durch beide Zweige: keine Vorschlaege, keine
        // Meldung, kein Hinweis - die App sah aus, als tue sie gar nichts.
        setNetzFehlt(true)
        setVorschlaege([])
      }
    }, 300)
    return () => window.clearTimeout(suchTimer.current)
  }, [suchtext, gewaehlt])

  // Abgeleitet statt gespeichert: Vorschlaege gehoeren zu einem Suchtext ab
  // zwei Zeichen ohne getroffene Wahl. Steht das nicht mehr, sind sie weg -
  // ohne dass jemand sie loeschen muss.
  const sichtbareVorschlaege =
    gewaehlt || suchtext.trim().length < 2 ? [] : vorschlaege

  const eva = gewaehlt?.eva ?? (dbFehlt ? evaManuell.trim() : '')
  const bereit = eva !== '' && gleisAn.trim() !== '' && gleisAb.trim() !== '' && !laden

  function absenden() {
    if (!bereit) return
    onBerechnen({
      eva,
      bahnhofName: gewaehlt?.name ?? suchtext.trim(),
      gleisAn: gleisAn.trim(),
      gleisAb: gleisAb.trim(),
      wagen: wagen.trim(),
      profil,
      variante: 'schnellste',
      zugAn: zugAnkunft ? zugnummer(zugAnkunft.zug) : undefined,
      zugAnName: zugAnkunft?.zug,
      zugAbName: zugAbfahrt?.zug,
      ankunftZeit: zugAnkunft ? (zugAnkunft.zeitIst ?? zugAnkunft.zeitSoll) : undefined,
      abfahrtZeit: zugAbfahrt ? (zugAbfahrt.zeitIst ?? zugAbfahrt.zeitSoll) : undefined,
    })
  }

  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      onSubmit={(e) => {
        e.preventDefault()
        absenden()
      }}
    >
      <div className="feld">
        <label htmlFor="bahnhof">Umstiegsbahnhof</label>
        <input
          id="bahnhof"
          className="eingabefeld"
          type="text"
          autoComplete="off"
          placeholder="z. B. Berlin Hbf"
          value={suchtext}
          onChange={(e) => {
            setSuchtext(e.target.value)
            setGewaehlt(null)
            setErkennungVerworfen(true)
          }}
        />
        {sichtbareVorschlaege.length > 0 && (
          <ul className="vorschlaege">
            {sichtbareVorschlaege.map((treffer) => (
              <li key={treffer.eva}>
                <button
                  type="button"
                  onClick={() => {
                    setGewaehlt(treffer)
                    setSuchtext(treffer.name)
                    setVorschlaege([])
                  }}
                >
                  {treffer.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!gewaehlt && !erkennungVerworfen && erkannt && erkannt.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div className="hinweis-box">Bahnhöfe in deiner Nähe:</div>
            <ul className="vorschlaege">
              {erkannt.map((treffer) => (
                <li key={treffer.eva}>
                  <button
                    type="button"
                    onClick={() => {
                      setGewaehlt(treffer)
                      setSuchtext(treffer.name)
                    }}
                  >
                    {treffer.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {gewaehlt && (
          <span className="gewaehlt">
            ✓ {gewaehlt.name}
            {erkannt?.some((t) => t.eva === gewaehlt.eva) && ' · automatisch erkannt'}
          </span>
        )}
        {netzFehlt && !dbFehlt && (
          <div className="hinweis-box" style={{ marginTop: 8 }}>
            Die Bahnhofssuche erreicht den Server nicht. Prüfe deine Verbindung. Läuft die App
            unter einer Vorschau-Adresse, weist der Server die Anfrage ab – dann bitte die
            reguläre Adresse verwenden.
          </div>
        )}
        {dbFehlt && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="hinweis-box">
              Bahnhofssuche derzeit nicht verfügbar (kein DB-Zugang). Gib die EVA-Nummer des
              Bahnhofs direkt ein – z. B. 8011160 für Berlin Hbf.
            </div>
            <input
              className="eingabefeld"
              type="text"
              inputMode="numeric"
              placeholder="EVA-Nummer"
              aria-label="EVA-Nummer"
              value={evaManuell}
              onChange={(e) => setEvaManuell(e.target.value)}
            />
          </div>
        )}
      </div>

      {eva !== '' && (
        <div className="feld">
          <label>Züge aus der Live-Tafel übernehmen (optional)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Zugauswahl
              eva={eva}
              typ="arr"
              label="Ankunftszug wählen"
              auswahl={zugAnkunft}
              onAuswahl={(eintrag) => {
                setZugAnkunft(eintrag)
                if (eintrag) setGleisAn(eintrag.gleisIst ?? eintrag.gleisSoll)
              }}
            />
            <Zugauswahl
              eva={eva}
              typ="dep"
              label="Anschlusszug wählen"
              auswahl={zugAbfahrt}
              onAuswahl={(eintrag) => {
                setZugAbfahrt(eintrag)
                if (eintrag) setGleisAb(eintrag.gleisIst ?? eintrag.gleisSoll)
              }}
            />
          </div>
        </div>
      )}

      <div className="gleis-zeile">
        <div className="feld">
          <label htmlFor="gleisAn">Ankunft: Gleis</label>
          <input
            id="gleisAn"
            className="eingabefeld"
            type="text"
            required
            placeholder="z. B. 6"
            value={gleisAn}
            onChange={(e) => setGleisAn(e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="gleisAb">Anschluss: Gleis</label>
          <input
            id="gleisAb"
            className="eingabefeld"
            type="text"
            required
            placeholder="z. B. 14"
            value={gleisAb}
            onChange={(e) => setGleisAb(e.target.value)}
          />
        </div>
      </div>

      <div className="feld">
        <label htmlFor="wagen">Wagennummer (optional)</label>
        <input
          id="wagen"
          className="eingabefeld"
          type="text"
          inputMode="numeric"
          placeholder="z. B. 26 – für den genauen Startpunkt"
          value={wagen}
          onChange={(e) => setWagen(e.target.value)}
        />
      </div>

      {/* Im Entwurf kommt das Gehtempo nicht vor. Ersatzlos streichen waere
          fuer langsame Gehende aber ein Rueckschritt - deshalb eingeklappt. */}
      <details className="mehr-einstellen">
        <summary>Mehr einstellen</summary>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="feld">
          <label>Gehtempo</label>
          <div className="wahl-gruppe" role="group" aria-label="Gehtempo">
            {PROFILE.map((p) => (
              <button
                key={p.wert}
                type="button"
                className="wahl-knopf"
                aria-pressed={profil === p.wert}
                onClick={() => setProfil(p.wert)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      </details>

      {fehler && <div className="fehler-box">{fehler}</div>}

      <button className="knopf-primaer" type="submit" disabled={!bereit}>
        <span>{laden ? 'Route wird berechnet …' : 'Umstieg starten'}</span>
        {laden ? (
          <span className="lade-kreisel" aria-hidden="true" />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </form>
  )
}
