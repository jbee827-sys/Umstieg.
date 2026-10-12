import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sucheStationen } from '../api/client'
import type {
  BahnhofTreffer,
  Bahnsteigabschnitt,
  Gehprofil,
  RoutenVariante,
  TafelEintrag,
} from '../api/typen'
import { STANDORT_VOREINSTELLUNG } from '../api/standorte'
import { Zugauswahl } from './Zugauswahl'
import { ReiseImport } from './ReiseImport'
import type { Umstieg } from '../reise/reisetext'
import type { EingabeEntwurf } from '../sitzung/eingabespeicher'
import { ladeDarstellung, waehleDarstellung, type Darstellung } from '../einstellungen/darstellung'
import { useBreitesLayout } from '../aufbau/breite'

export interface EingabeWerte {
  eva: string
  bahnhofName: string
  gleisAn: string
  gleisAb: string
  /** Wagen im Ankunftszug - Startpunkt auf dem Bahnsteig. */
  wagenAn: string
  /** Wagen im Anschlusszug - fuer die Wagenreihung am Zielgleis. */
  wagenAb: string
  profil: Gehprofil
  variante: RoutenVariante
  /**
   * Wo am ANKUNFTSGLEIS jemand steht. Gewaehlt wird das auf dem Dashboard,
   * nicht hier: Erst dort ist sichtbar, was die Wahl am Weg aendert, und erst
   * dort steht der Reisende ueberhaupt am Gleis.
   */
  abschnitt: Bahnsteigabschnitt
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
  const letztes = zug.split(' ').pop() || undefined
  if (!letztes) return undefined
  // "RE3 (3352)" → "3352". Geteilte Reisetexte schreiben die Nummer in
  // Klammern hinter die Linie; die Wagenreihung braucht die blanke Zahl.
  const inKlammern = /^\((\d+)\)$/.exec(letztes)
  return inKlammern ? inKlammern[1] : letztes
}

interface EingabeProps {
  laden: boolean
  fehler: string | null
  /** Per Standort erkannte Bahnhoefe; leer, solange nichts erkannt wurde. */
  erkannt?: BahnhofTreffer[]
  /**
   * Die zuletzt abgesendete Eingabe dieser Sitzung, als Vorbelegung.
   *
   * Kommt als Prop herein und nicht aus dem Speicher: Die Maske soll nicht
   * wissen, WO das herkommt - so bleibt sie ohne sessionStorage pruefbar,
   * und der Speicher hat genau einen Aufrufer.
   */
  entwurf?: EingabeEntwurf | null
  /**
   * Beides auf einmal: was gerechnet werden soll, und wie das Formular dabei
   * aussah. Der Entwurf laesst sich aus `EingabeWerte` nicht zurueckgewinnen –
   * dort sind Bahnhof und Zugauswahl bereits eingedampft.
   */
  onBerechnen: (werte: EingabeWerte, entwurf: EingabeEntwurf) => void
  /**
   * Was ueber dem Formular im Rollbereich steht - Lockup und Standorthinweise.
   * Wie `zusatz` am `Schrittsheet`: Es gehoert in den Rollbereich, kommt aber
   * aus `App`, die den Standort kennt.
   */
  kopf?: ReactNode
  /** Was am Ende des Rollbereichs steht - die Fusszeile mit Impressum. */
  fuss?: ReactNode
}

/** „RE 3 · an 14:22" - bei einem Gleiswechsel mit Zusatz. */
function zugzeile(e: TafelEintrag, richtung: 'an' | 'ab'): ReactNode {
  return (
    <>
      {e.zug} · {richtung} {e.zeitIst ?? e.zeitSoll}
      {e.gleisIst && <strong className="gleiswechsel"> · Gleis {e.gleisIst} (geändert!)</strong>}
    </>
  )
}

const PROFILE: { wert: Gehprofil; label: string }[] = [
  { wert: 'zuegig', label: 'Zügig' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'langsam', label: 'Langsam / Gepäck' },
]

const DARSTELLUNGEN: { wert: Darstellung; label: string }[] = [
  { wert: 'system', label: 'System' },
  { wert: 'hell', label: 'Hell' },
  { wert: 'dunkel', label: 'Dunkel' },
]

// Breit (Spec 2026-10-11, BRIEF.md 4): Pflicht sind Bahnhof und die beiden
// Gleise - als Kacheln mit denselben Woertern wie die Karten der Uebersicht,
// die Zuege waehlt man in den Tafeln daneben, der Import ist eine Abkuerzung
// am Rand. Auf dem Handy seit dem 12.10.2026 wieder der Aufbau von davor: Die
// Zugauswahl war dort eingeklappt und beim Aufruf nicht zu sehen. Der Inhalt
// rollt, „Umstieg starten" schwebt darueber.
export function Eingabe({
  laden,
  fehler,
  erkannt,
  entwurf,
  onBerechnen,
  kopf,
  fuss,
}: EingabeProps) {
  // Anfangswerte aus dem Entwurf. Nur beim ERSTEN Rendern - danach gehoert
  // das Formular dem Nutzer. Ein spaeter eintreffender Entwurf duerfte eine
  // laufende Eingabe nicht ueberschreiben, und einen solchen gibt es nicht:
  // Geschrieben wird beim Absenden, und danach ist die Maske verlassen.
  const [suchtext, setSuchtext] = useState(entwurf?.suchtext ?? '')
  const [vorschlaege, setVorschlaege] = useState<BahnhofTreffer[]>([])
  const [gewaehlt, setGewaehlt] = useState<BahnhofTreffer | null>(entwurf?.gewaehlt ?? null)
  const [dbFehlt, setDbFehlt] = useState(false)
  const [netzFehlt, setNetzFehlt] = useState(false)
  const [evaManuell, setEvaManuell] = useState(entwurf?.evaManuell ?? '')
  const [gleisAn, setGleisAn] = useState(entwurf?.gleisAn ?? '')
  const [gleisAb, setGleisAb] = useState(entwurf?.gleisAb ?? '')
  const [wagenAn, setWagenAn] = useState(entwurf?.wagenAn ?? '')
  const [wagenAb, setWagenAb] = useState(entwurf?.wagenAb ?? '')
  const [profil, setProfil] = useState<Gehprofil>(entwurf?.profil ?? 'normal')
  // Keine Reiseangabe, sondern eine Geraeteeinstellung: Sie steht nicht im
  // Entwurf, sondern im eigenen Speicher (einstellungen/darstellung.ts).
  const [darstellung, setDarstellung] = useState<Darstellung>(ladeDarstellung)
  const [zugAnkunft, setZugAnkunft] = useState<TafelEintrag | null>(entwurf?.zugAnkunft ?? null)
  const [zugAbfahrt, setZugAbfahrt] = useState<TafelEintrag | null>(entwurf?.zugAbfahrt ?? null)
  const suchTimer = useRef<number | undefined>(undefined)
  const [erkennungVerworfen, setErkennungVerworfen] = useState(false)
  const [importOffen, setImportOffen] = useState(false)
  /*
   * Bewegung nur auf eine Handlung hin (DESIGN.md 6): eine Wahl oder ihr
   * Aufheben durch den Nutzer. Setzt die Standorterkennung oder der Entwurf
   * den Bahnhof, stehen die Tafeln ohne Uebergang da - die Erkennung trifft
   * verzoegert ein, eine Tafel, die dann aufklappt, bewegte sich von selbst.
   */
  const [bewegung, setBewegung] = useState(false)

  /**
   * Uebernimmt einen Umstieg aus dem DB-Navigator-Export.
   *
   * Der Bahnhof wird als SUCHTEXT gesetzt, nicht als Treffer: Die App braucht
   * die Verkehrsstelle, und ein Name reicht dafuer nicht. Berlin Hbf fuehrt
   * drei EVA-Nummern, und 8011160 hat ueberhaupt keinen Fahrplan - welche
   * gemeint ist, entscheidet die Bahnhofssuche, nicht der Text.
   *
   * Die Zugauswahl wird geleert: Ein zuvor angetippter Zug gehoert zu einer
   * anderen Reise und waere nach dem Import stillschweigend falsch.
   */
  function uebernimmUmstieg(u: Umstieg) {
    setBewegung(true)
    setGewaehlt(null)
    setSuchtext(u.bahnhof)
    setGleisAn(u.anGleis ?? '')
    setGleisAb(u.abGleis ?? '')

    /*
     * Wagennummern stehen in KEINEM geteilten Reisetext - weder der
     * DB-Export noch die Rechnung fuehren sie. Eine vorher getippte gehoert
     * damit zur ersetzten Reise. Bliebe sie stehen, haftete sie an einem
     * fremden Zug, und der Weg startete an einem Bahnsteigabschnitt, mit dem
     * dieser Zug nichts zu tun hat. Dieselbe Ueberlegung wie unten bei
     * `zeitIst`/`gleisIst`: lieber leer als falsch belegt.
     */
    setWagenAn('')
    setWagenAb('')

    /*
     * Die beiden Zuege werden mit uebernommen - wie bei der Auswahl aus der
     * Live-Tafel. Sie sind es, an denen die Live-Ueberwachung spaeter
     * filtert; ohne sie kaeme jede Meldung des ganzen Bahnhofs an.
     *
     * `zeitIst` und `gleisIst` bleiben BEWUSST leer. Sie bedeuten "laut
     * Live-Tafel geaendert", und aus einem geteilten Reisetext weiss
     * niemand etwas ueber Aenderungen. Ein gefuelltes `gleisIst` faerbte die
     * Anzeige rot und behauptete einen Gleiswechsel, den es nie gab.
     */
    setZugAnkunft(
      u.anZug
        ? { zug: u.anZug, zeitSoll: u.anZeit, gleisSoll: u.anGleis ?? '', ziel: u.anZiel }
        : null,
    )
    setZugAbfahrt(
      u.abZug
        ? { zug: u.abZug, zeitSoll: u.abZeit, gleisSoll: u.abGleis ?? '', ziel: u.abZiel }
        : null,
    )
  }

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

  /*
   * Die Tafeln zeigen den zuletzt gewaehlten Bahnhof - auch noch, waehrend
   * sie zuklappen. Sonst verschwaende ihr Inhalt, bevor die Bewegung ihn
   * zeigen kann. Angepasst beim Rendern, wie die Erkennung oben.
   */
  const [tafelBahnhof, setTafelBahnhof] = useState<BahnhofTreffer | null>(gewaehlt)
  if (gewaehlt && gewaehlt.eva !== tafelBahnhof?.eva) setTafelBahnhof(gewaehlt)
  const tafelnOffen = gewaehlt !== null

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

  // Ab 700 px (iPad, Desktop) stehen die Tafeln offen neben dem Formular.
  const breit = useBreitesLayout()

  // Eine Wahl aus der Tafel setzt auch das Gleis; das Aufheben laesst es stehen.
  const waehleAnkunft = (e: TafelEintrag | null) => {
    setZugAnkunft(e)
    if (e) setGleisAn(e.gleisIst ?? e.gleisSoll)
  }
  const waehleAbfahrt = (e: TafelEintrag | null) => {
    setZugAbfahrt(e)
    if (e) setGleisAb(e.gleisIst ?? e.gleisSoll)
  }

  function absenden() {
    if (!bereit) return
    // Der Entwurf ist das Formular selbst, ungetrimmt und ungedeutet - er
    // soll die Maske spaeter genau so wiederherstellen, wie sie eben stand.
    const abbild: EingabeEntwurf = {
      suchtext,
      gewaehlt,
      evaManuell,
      gleisAn,
      gleisAb,
      wagenAn,
      wagenAb,
      profil,
      zugAnkunft,
      zugAbfahrt,
    }
    onBerechnen(
      {
        eva,
        bahnhofName: gewaehlt?.name ?? suchtext.trim(),
        gleisAn: gleisAn.trim(),
        gleisAb: gleisAb.trim(),
        wagenAn: wagenAn.trim(),
        wagenAb: wagenAb.trim(),
        profil,
        variante: 'schnellste',
        abschnitt: STANDORT_VOREINSTELLUNG,
        zugAn: zugAnkunft ? zugnummer(zugAnkunft.zug) : undefined,
        zugAnName: zugAnkunft?.zug,
        zugAbName: zugAbfahrt?.zug,
        ankunftZeit: zugAnkunft ? (zugAnkunft.zeitIst ?? zugAnkunft.zeitSoll) : undefined,
        abfahrtZeit: zugAbfahrt ? (zugAbfahrt.zeitIst ?? zugAbfahrt.zeitSoll) : undefined,
      },
      abbild,
    )
  }

  // Leere Zustaende sagen, was fehlt und was zu tun ist (DESIGN.md 4). Ohne
  // DB-Zugang gibt es nur die EVA-Ersatzeingabe - und keine Tafel.
  const platzhaltertext = dbFehlt
    ? 'Ohne DB-Zugang keine Live-Tafel – Gleise bitte von Hand eingeben.'
    : 'Wähle einen Bahnhof – dann stehen hier die Züge bis zum Ende der nächsten Stunde.'

  // Eine Tafelspalte des breiten Layouts. Sie haengt am GEWAEHLTEN Bahnhof,
  // nicht an der EVA-Ersatzeingabe: Die gibt es nur ohne DB-Zugang, und dort
  // kann auch die Tafel nicht laden. Platzhalter und Tafel liegen
  // uebereinander; die Tafel klappt ueber dem Platzhalter nach rechts auf
  // (Spec 2026-10-11, Abschnitt 6 - die Bewegung selbst steht in App.css).
  function tafelSpalte(
    art: 'ankunft' | 'abfahrt',
    titel: string,
    typ: 'arr' | 'dep',
    auswahl: TafelEintrag | null,
    onAuswahl: (e: TafelEintrag | null) => void,
  ) {
    return (
      <section
        className={`tafel-spalte ${art}`}
        aria-label={titel}
        data-offen={tafelnOffen ? 'ja' : 'nein'}
      >
        <div className="tafel-platzhalter" aria-hidden={tafelnOffen || undefined}>
          <h3 className="tafel-spalte-titel">{titel}</h3>
          <p>{platzhaltertext}</p>
        </div>
        {tafelBahnhof && (
          // Zugeklappt nicht bedienbar und fuer Vorleser weg - verdeckt ist
          // sie sonst nur fuers Auge.
          <div className="tafel-spalte-inhalt" inert={!tafelnOffen}>
            <Zugauswahl
              eva={tafelBahnhof.eva}
              typ={typ}
              label={`${titel} · ${tafelBahnhof.name}`}
              auswahl={auswahl}
              onAuswahl={onAuswahl}
              immerOffen
            />
          </div>
        )}
      </section>
    )
  }

  const wagenAnFeld = (
    <div className="feld">
      <label htmlFor="wagenAn">Ankunft: Wagen (optional)</label>
      <input
        id="wagenAn"
        className="eingabefeld"
        type="text"
        inputMode="numeric"
        placeholder="z. B. 26 – genauer Startpunkt"
        value={wagenAn}
        onChange={(e) => setWagenAn(e.target.value)}
      />
    </div>
  )
  const wagenAbFeld = (
    <div className="feld">
      <label htmlFor="wagenAb">Anschluss: Wagen (optional)</label>
      <input
        id="wagenAb"
        className="eingabefeld"
        type="text"
        inputMode="numeric"
        placeholder="z. B. 7 – wo du einsteigst"
        value={wagenAb}
        onChange={(e) => setWagenAb(e.target.value)}
      />
    </div>
  )

  return (
    <form
      className={`eingabe-flaeche${bewegung ? ' mit-bewegung' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        absenden()
      }}
    >
      <div className="eingabe-rollbereich">
        {kopf}
        {breit && <h2 className="eingabe-titel">Wo steigst du um?</h2>}
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
              setBewegung(true)
            }}
          />
          {sichtbareVorschlaege.length > 0 && (
            <ul className="vorschlaege">
              {sichtbareVorschlaege.map((treffer) => (
                <li key={treffer.eva}>
                  <button
                    type="button"
                    onClick={() => {
                      setBewegung(true)
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
                        setBewegung(true)
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
            <span className="bahnhof-gewaehlt">
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
          {/* Abkuerzung am Rand (BRIEF.md 4), nicht der Einstieg: Statt Bahnhof
              und zwei Gleise zu tippen, den Text aus „Verbindung teilen"
              einfuegen. Auf dem Handy heisst sie wie vor dem 11.10.2026
              „Reise importieren" und steht als Knopf unter den Bloecken. */}
          {breit && (
            <div className="feld-rand">
              <button type="button" className="textknopf" onClick={() => setImportOffen(true)}>
                Verbindung einfügen
              </button>
            </div>
          )}
        </div>

        {/*
          Breit: die Pflichtangaben als Kacheln, mit den Woertern der
          Uebersicht - die Kachel WIRD dort zur Karte. Der zugaengliche Name
          bleibt „Ankunft: Gleis"; er enthaelt die sichtbare Beschriftung
          „Gleis" (WCAG 2.5.3). Die Zuege waehlt man rechts in den Tafeln.

          Handy: zwei Bloecke, gruppiert nach REISEABSCHNITT, nicht nach
          Feldart (Konzept §9): „mein ankommender Zug: Gleis 6, ICE 1006,
          Wagen 26" - nicht „alle Gleise, dann alle Zuege".
        */}
        {breit ? (
          <>
            <div className="gleiskacheln">
              <div className="gleiskachel">
                <div className="kicker">Du kommst an</div>
                <label htmlFor="gleisAn" className="gleiskachel-label">
                  <span className="nur-vorlesen">Ankunft: </span>Gleis
                </label>
                <input
                  id="gleisAn"
                  className="eingabefeld gleiskachel-feld"
                  type="text"
                  required
                  value={gleisAn}
                  onChange={(e) => setGleisAn(e.target.value)}
                />
                {zugAnkunft && <p className="gleiskachel-zug">{zugzeile(zugAnkunft, 'an')}</p>}
              </div>
              <div className="gleiskachel ziel">
                <div className="kicker">Dein Anschluss</div>
                <label htmlFor="gleisAb" className="gleiskachel-label">
                  <span className="nur-vorlesen">Anschluss: </span>Gleis
                </label>
                <input
                  id="gleisAb"
                  className="eingabefeld gleiskachel-feld"
                  type="text"
                  required
                  value={gleisAb}
                  onChange={(e) => setGleisAb(e.target.value)}
                />
                {zugAbfahrt && <p className="gleiskachel-zug">{zugzeile(zugAbfahrt, 'ab')}</p>}
              </div>
            </div>
            <div className="gleis-zeile">
              {wagenAnFeld}
              {wagenAbFeld}
            </div>
          </>
        ) : (
          <>
            <fieldset className="reiseblock">
              <legend>Ankunft</legend>
              {eva !== '' && (
                <Zugauswahl
                  eva={eva}
                  typ="arr"
                  label="Ankunftszug wählen"
                  auswahl={zugAnkunft}
                  onAuswahl={waehleAnkunft}
                />
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
                {wagenAnFeld}
              </div>
            </fieldset>

            <fieldset className="reiseblock">
              <legend>Abfahrt</legend>
              {eva !== '' && (
                <Zugauswahl
                  eva={eva}
                  typ="dep"
                  label="Anschlusszug wählen"
                  auswahl={zugAbfahrt}
                  onAuswahl={waehleAbfahrt}
                />
              )}
              <div className="gleis-zeile">
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
                {wagenAbFeld}
              </div>
            </fieldset>

            <div className="feld">
              <button
                type="button"
                className="knopf-sekundaer knopf-breit"
                onClick={() => setImportOffen(true)}
              >
                Reise importieren
              </button>
            </div>
          </>
        )}

        {importOffen && (
          <ReiseImport
            onSchliessen={() => setImportOffen(false)}
            onUebernehmen={uebernimmUmstieg}
          />
        )}

        <details className="einstellungen">
          <summary>Einstellungen</summary>
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
          <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="feld">
            <label>Darstellung</label>
            <div className="wahl-gruppe" role="group" aria-label="Darstellung">
              {DARSTELLUNGEN.map((d) => (
                <button
                  key={d.wert}
                  type="button"
                  className="wahl-knopf"
                  aria-pressed={darstellung === d.wert}
                  onClick={() => {
                    waehleDarstellung(d.wert)
                    setDarstellung(d.wert)
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </fieldset>
        </details>

        {fehler && <div className="fehler-box">{fehler}</div>}
        {fuss}
      </div>

      {breit && (
        <>
          {tafelSpalte('ankunft', 'Ankunft', 'arr', zugAnkunft, waehleAnkunft)}
          {tafelSpalte('abfahrt', 'Abfahrt', 'dep', zugAbfahrt, waehleAbfahrt)}
        </>
      )}

      {/* Ausserhalb des Rollbereichs; auf dem Handy schwebt nur er ueber dem
          Inhalt (App.css). Ohne Pfeil: DESIGN.md 4, „Kein Pfeil hinter dem
          Text". „Wird berechnet", nicht „Route wird berechnet": Das brach
          auf 360 px in zwei Zeilen. */}
      <button className="knopf-primaer" type="submit" disabled={!bereit}>
        <span>{laden ? 'Wird berechnet …' : 'Umstieg starten'}</span>
        {laden && <span className="lade-kreisel" aria-hidden="true" />}
      </button>
    </form>
  )
}
