import { useEffect, useState, type ReactNode } from 'react'
import { sucheOrte } from '../api/orte'
import { uhrzeit } from '../api/zeit'
import type {
  Bahnsteigabschnitt,
  Gehprofil,
  HaltestellenTafelEintrag,
  Ort,
  RoutenVariante,
  TafelEintrag,
} from '../api/typen'
import { frischeOrtAuf, ortSchluessel, pfadFuer } from '../ort/ortmodell'
import { steigText } from '../ort/steig'
import { VerkehrsmittelSymbole } from '../ort/verkehrsmittel'
import { Ortsuche, type OrtsucheStand } from './Ortsuche'
import { STANDORT_VOREINSTELLUNG } from '../api/standorte'
import { Zugauswahl } from './Zugauswahl'
import { Fahrtauswahl } from './Fahrtauswahl'
import { ReiseImport } from './ReiseImport'
import type { Umstieg } from '../reise/reisetext'
import type { EingabeEntwurf } from '../sitzung/eingabespeicher'
import { ladeDarstellung, waehleDarstellung, type Darstellung } from '../einstellungen/darstellung'
import { useBreitesLayout } from '../aufbau/breite'

/** Haltestellenpfad (Umstieg 2.0): beide Orte mit der gewählten Fahrt. */
export interface HaltestellenWahl {
  ankunft: { ort: Ort; fahrt: HaltestellenTafelEintrag }
  anschluss: { ort: Ort; fahrt: HaltestellenTafelEintrag }
}

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
  /**
   * Gesetzt = Haltestellenpfad (Umstieg 2.0). Fehlt = Bahnhofspfad wie bisher;
   * dann gelten `eva`, `gleisAn`, `gleisAb` wie immer. Im Haltestellenpfad sind
   * `gleisAn`/`gleisAb` die ANZEIGE des Steigs („A“, „Pos. 12“) und `eva` leer.
   */
  haltestellen?: HaltestellenWahl
}

/** Was die Bahnhofstafeln brauchen: Name fuer die Ueberschrift, EVA fuer den Abruf. */
interface TafelBahnhof {
  name: string
  eva: string
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
  /** Per Standort erkannte Bahnhoefe und Haltestellen; leer, solange nichts erkannt wurde. */
  erkannt?: Ort[]
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
  const [gewaehlt, setGewaehlt] = useState<Ort | null>(entwurf?.gewaehlt ?? null)
  // Zweites Ortsfeld (E3): leer heisst „derselbe Ort wie die Ankunft“.
  const [anschlussText, setAnschlussText] = useState(entwurf?.anschlussText ?? '')
  const [anschlussOrt, setAnschlussOrt] = useState<Ort | null>(entwurf?.anschlussOrt ?? null)
  const [dbFehlt, setDbFehlt] = useState(false)
  const [netzFehlt, setNetzFehlt] = useState(false)
  const [haltestellenAusfall, setHaltestellenAusfall] = useState(false)
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
  // Haltestellenpfad: die Fahrten aus den Haltestellentafeln.
  const [fahrtAnkunft, setFahrtAnkunft] = useState<HaltestellenTafelEintrag | null>(entwurf?.fahrtAnkunft ?? null)
  const [fahrtAbfahrt, setFahrtAbfahrt] = useState<HaltestellenTafelEintrag | null>(entwurf?.fahrtAbfahrt ?? null)
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
    // Ein geteilter Reisetext beschreibt einen Umstieg im Bahnhof.
    setAnschlussText('')
    setAnschlussOrt(null)
    setFahrtAnkunft(null)
    setFahrtAbfahrt(null)
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
  const [zuletztErkannt, setZuletztErkannt] = useState<Ort[] | undefined | null>(null)
  if (erkannt !== zuletztErkannt) {
    setZuletztErkannt(erkannt)
    if (!erkennungVerworfen && !gewaehlt && suchtext === '' && erkannt?.length === 1) {
      setGewaehlt(erkannt[0])
      setSuchtext(erkannt[0].name)
    }
  }

  /*
   * Weiche (Spec 4): Ohne Anschlussort oder im selben DB-Bahnhof laeuft der
   * Bahnhofsablauf wie bisher. Sonst ist es ein Umstieg zwischen
   * Haltestellen - dann gibt es keine Bahnhofstafeln und keine EVA.
   */
  const pfad = pfadFuer(gewaehlt, anschlussOrt)
  const haltestellenPfad = pfad === 'haltestelle'

  /*
   * Ein Bahnhof ohne Haltestellen-ID - die Suche kannte gerade keine - wird
   * im Haltestellenpfad nachgeschlagen (`frischeOrtAuf`, gleiche EVA). Je Ort
   * gemerkt: `null` heisst gesucht und nichts gefunden.
   */
  const [nachgeschlagen, setNachgeschlagen] = useState<Record<string, Ort | null>>({})
  useEffect(() => {
    if (!haltestellenPfad) return
    let gueltig = true
    for (const ort of [gewaehlt, anschlussOrt]) {
      if (!ort || ort.haltestelleId) continue
      void frischeOrtAuf(ort, sucheOrte).then((neu) => {
        if (gueltig) setNachgeschlagen((alt) => ({ ...alt, [ortSchluessel(ort)]: neu.haltestelleId ? neu : null }))
      })
    }
    return () => {
      gueltig = false
    }
  }, [haltestellenPfad, gewaehlt, anschlussOrt])
  const mitId = (o: Ort | null): Ort | null =>
    !o ? null : o.haltestelleId ? o : (nachgeschlagen[ortSchluessel(o)] ?? null)
  const ankunftHalt = mitId(gewaehlt)
  const abfahrtHalt = mitId(anschlussOrt ?? gewaehlt)
  const haltFehlt =
    haltestellenPfad &&
    [gewaehlt, anschlussOrt].some((o) => o && !o.haltestelleId && nachgeschlagen[ortSchluessel(o)] === null)
  const bahnhof: TafelBahnhof | null =
    pfad !== 'haltestelle' && gewaehlt?.eva ? { name: gewaehlt.name, eva: gewaehlt.eva } : null

  /*
   * Die Tafeln zeigen den zuletzt gewaehlten Bahnhof - auch noch, waehrend
   * sie zuklappen. Sonst verschwaende ihr Inhalt, bevor die Bewegung ihn
   * zeigen kann. Angepasst beim Rendern, wie die Erkennung oben.
   */
  const [tafelBahnhof, setTafelBahnhof] = useState<TafelBahnhof | null>(bahnhof)
  if (bahnhof && bahnhof.eva !== tafelBahnhof?.eva) setTafelBahnhof(bahnhof)
  const tafelnOffen = bahnhof !== null

  /**
   * Was die letzte Suche ueber ihre Quellen sagte - aus beiden Feldern.
   * `zugang-fehlt` oeffnet die EVA-Ersatzeingabe; ein Ausfall nur der
   * Haltestellendaten bekommt einen Hinweis, Bahnhoefe gehen weiter (K5).
   * Keine der beiden Quellen erreichbar (`nicht-verfuegbar`): wie bisher
   * ohne DB-Zugang die EVA-Ersatzeingabe.
   */
  function merkeQuellen(q: OrtsucheStand) {
    if (q === 'netz') {
      setNetzFehlt(true)
      return
    }
    setNetzFehlt(false)
    if (q === 'nicht-verfuegbar') {
      setDbFehlt(true)
      setHaltestellenAusfall(true)
      return
    }
    setDbFehlt(q.bahnhoefe === 'zugang-fehlt')
    setHaltestellenAusfall(q.haltestellen === 'ausfall')
  }

  const eva = pfad === 'haltestelle' ? '' : (gewaehlt?.eva ?? (dbFehlt ? evaManuell.trim() : ''))
  // Im Haltestellenpfad: beide Fahrten gewaehlt, keine faellt aus.
  const bereit = haltestellenPfad
    ? Boolean(
        ankunftHalt &&
          abfahrtHalt &&
          fahrtAnkunft &&
          fahrtAbfahrt &&
          !fahrtAnkunft.ausfall &&
          !fahrtAbfahrt.ausfall,
      ) && !laden
    : eva !== '' && gleisAn.trim() !== '' && gleisAb.trim() !== '' && !laden

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
      anschlussText,
      anschlussOrt,
      evaManuell,
      gleisAn,
      gleisAb,
      wagenAn,
      wagenAb,
      profil,
      zugAnkunft,
      zugAbfahrt,
      fahrtAnkunft,
      fahrtAbfahrt,
    }
    if (haltestellenPfad) {
      if (!gewaehlt || !ankunftHalt || !abfahrtHalt || !fahrtAnkunft || !fahrtAbfahrt) return
      const andererOrt = anschlussOrt && ortSchluessel(anschlussOrt) !== ortSchluessel(gewaehlt)
      onBerechnen(
        {
          eva: '',
          bahnhofName: andererOrt ? `${gewaehlt.name} → ${anschlussOrt.name}` : gewaehlt.name,
          // Im Haltestellenpfad nur zur Anzeige: der Steig, wie er auf der Tafel steht.
          gleisAn: fahrtAnkunft.steigIst ?? fahrtAnkunft.steigSoll ?? '',
          gleisAb: fahrtAbfahrt.steigIst ?? fahrtAbfahrt.steigSoll ?? '',
          wagenAn: '',
          wagenAb: '',
          profil,
          variante: 'schnellste',
          abschnitt: STANDORT_VOREINSTELLUNG,
          zugAnName: fahrtAnkunft.linie,
          zugAbName: fahrtAbfahrt.linie,
          ankunftZeit: uhrzeit(fahrtAnkunft.zeitIst ?? fahrtAnkunft.zeitSoll),
          abfahrtZeit: uhrzeit(fahrtAbfahrt.zeitIst ?? fahrtAbfahrt.zeitSoll),
          haltestellen: {
            ankunft: { ort: ankunftHalt, fahrt: fahrtAnkunft },
            anschluss: { ort: abfahrtHalt, fahrt: fahrtAbfahrt },
          },
        },
        abbild,
      )
      return
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

  // Haltestellenpfad (Umstieg 2.0): eine Tafelspalte je Ort, die Abfahrt am
  // Anschlussort. Gleiche Gestalt wie `tafelSpalte`.
  function haltestellenSpalte(
    art: 'ankunft' | 'abfahrt',
    titel: string,
    typ: 'arr' | 'dep',
    ort: Ort | null,
    auswahl: HaltestellenTafelEintrag | null,
    onAuswahl: (e: HaltestellenTafelEintrag | null) => void,
  ) {
    return (
      <section className={`tafel-spalte ${art}`} aria-label={titel} data-offen={ort ? 'ja' : 'nein'}>
        <div className="tafel-platzhalter" aria-hidden={ort ? true : undefined}>
          <h3 className="tafel-spalte-titel">{titel}</h3>
          <p>{haltFehlt ? 'Für diesen Bahnhof fehlen gerade Haltestellendaten.' : platzhaltertext}</p>
        </div>
        {ort && (
          <div className="tafel-spalte-inhalt">
            <Fahrtauswahl
              ort={ort}
              typ={typ}
              label={`${titel} · ${ort.name}`}
              auswahl={auswahl}
              onAuswahl={onAuswahl}
              immerOffen
            />
          </div>
        )}
      </section>
    )
  }

  // Statt der Gleisfelder: die gewaehlte Fahrt mit Steig. Wagen gibt es an
  // Haltestellen nicht.
  const steigZeile = (f: HaltestellenTafelEintrag | null) =>
    f && (
      <p className="steig-zeile">
        {steigText(f)} · {f.linie}
      </p>
    )
  const haltestellenTeil = (
    <>
      {haltFehlt && <div className="hinweis-box">Für diesen Bahnhof fehlen gerade Haltestellendaten.</div>}
      {breit ? (
        <div className="gleiskacheln">
          <div className="gleiskachel">
            <div className="kicker">Du kommst an</div>
            {steigZeile(fahrtAnkunft) ?? <p className="gleiskachel-zug">Fahrt in der Tafel wählen</p>}
          </div>
          <div className="gleiskachel ziel">
            <div className="kicker">Dein Anschluss</div>
            {steigZeile(fahrtAbfahrt) ?? <p className="gleiskachel-zug">Fahrt in der Tafel wählen</p>}
          </div>
        </div>
      ) : (
        <>
          <fieldset className="reiseblock">
            <legend>Ankunft</legend>
            {ankunftHalt && (
              <Fahrtauswahl
                ort={ankunftHalt}
                typ="arr"
                label="Ankunft wählen"
                auswahl={fahrtAnkunft}
                onAuswahl={setFahrtAnkunft}
              />
            )}
            {steigZeile(fahrtAnkunft)}
          </fieldset>
          <fieldset className="reiseblock">
            <legend>Abfahrt</legend>
            {abfahrtHalt && (
              <Fahrtauswahl
                ort={abfahrtHalt}
                typ="dep"
                label="Anschluss wählen"
                auswahl={fahrtAbfahrt}
                onAuswahl={setFahrtAbfahrt}
              />
            )}
            {steigZeile(fahrtAbfahrt)}
          </fieldset>
        </>
      )}
    </>
  )

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
        <div className="ortsfeld">
          <div className="kicker" aria-hidden="true">Du kommst an</div>
          <Ortsuche
            id="bahnhof"
            label={
              <>
                <span className="nur-vorlesen">Ankunft: </span>Bahnhof oder Haltestelle
              </>
            }
            platzhalter="z. B. Berlin Hbf oder Kassel Rathaus"
            text={suchtext}
            gewaehlt={gewaehlt}
            onText={(t) => {
              setSuchtext(t)
              setGewaehlt(null)
              // Eine Fahrt gehoert zu ihrem Ort; die Abfahrt haengt am
              // Ankunftsort, solange kein eigener Anschlussort gewaehlt ist.
              setFahrtAnkunft(null)
              if (!anschlussOrt) setFahrtAbfahrt(null)
              setErkennungVerworfen(true)
              setBewegung(true)
            }}
            onWahl={(o) => {
              setBewegung(true)
              setGewaehlt(o)
              setFahrtAnkunft(null)
              if (!anschlussOrt) setFahrtAbfahrt(null)
              if (o) setSuchtext(o.name)
            }}
            onQuellen={merkeQuellen}
            wahlHinweis={
              gewaehlt && erkannt?.some((t) => ortSchluessel(t) === ortSchluessel(gewaehlt))
                ? ' · automatisch erkannt'
                : undefined
            }
            zusatz={
              <>
                {!gewaehlt && !erkennungVerworfen && erkannt && erkannt.length > 1 && (
                  <div style={{ marginTop: 8 }}>
                    <div className="hinweis-box">Bahnhöfe und Haltestellen in deiner Nähe:</div>
                    <ul className="vorschlaege">
                      {erkannt.map((ort) => (
                        <li key={ortSchluessel(ort)}>
                          <button
                            type="button"
                            className="ort-vorschlag"
                            onClick={() => {
                              setBewegung(true)
                              setGewaehlt(ort)
                              setSuchtext(ort.name)
                            }}
                          >
                            <span className="ort-name">{ort.name}</span>
                            <VerkehrsmittelSymbole liste={ort.verkehrsmittel} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {netzFehlt && !dbFehlt && (
                  <div className="hinweis-box" style={{ marginTop: 8 }}>
                    Die Suche erreicht den Server nicht. Prüfe deine Verbindung. Läuft die App
                    unter einer Vorschau-Adresse, weist der Server die Anfrage ab – dann bitte die
                    reguläre Adresse verwenden.
                  </div>
                )}
                {haltestellenAusfall && !netzFehlt && (
                  <div className="hinweis-box" style={{ marginTop: 8 }}>
                    Haltestellendaten gerade nicht verfügbar – Bahnhöfe gehen weiter.
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
              </>
            }
          />
        </div>

        <div className="ortsfeld">
          <div className="kicker" aria-hidden="true">Dein Anschluss</div>
          <Ortsuche
            id="anschlussort"
            label={
              <>
                <span className="nur-vorlesen">Anschluss: </span>Bahnhof oder Haltestelle
              </>
            }
            platzhalter="Leer = gleicher Ort wie die Ankunft"
            text={anschlussText}
            gewaehlt={anschlussOrt}
            onText={(t) => {
              setAnschlussText(t)
              setAnschlussOrt(null)
              setFahrtAbfahrt(null)
              setBewegung(true)
            }}
            onWahl={(o) => {
              setBewegung(true)
              setAnschlussOrt(o)
              setFahrtAbfahrt(null)
              if (o) setAnschlussText(o.name)
            }}
            onQuellen={merkeQuellen}
          />
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
        {haltestellenPfad ? (
          haltestellenTeil
        ) : breit ? (
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
          {haltestellenPfad ? (
            <>
              {haltestellenSpalte('ankunft', 'Ankunft', 'arr', ankunftHalt, fahrtAnkunft, setFahrtAnkunft)}
              {haltestellenSpalte('abfahrt', 'Abfahrt', 'dep', abfahrtHalt, fahrtAbfahrt, setFahrtAbfahrt)}
            </>
          ) : (
            <>
              {tafelSpalte('ankunft', 'Ankunft', 'arr', zugAnkunft, waehleAnkunft)}
              {tafelSpalte('abfahrt', 'Abfahrt', 'dep', zugAbfahrt, waehleAbfahrt)}
            </>
          )}
        </>
      )}

      {/* Ausserhalb des Rollbereichs; auf dem Handy schwebt nur er ueber dem
          Inhalt (App.css). Ohne Pfeil: DESIGN.md 4, „Kein Pfeil hinter dem
          Text". „Wird berechnet", nicht „Route wird berechnet": Das brach
          auf 360 px in zwei Zeilen. */}
      <button className="knopf-primaer knopf-schwebend" type="submit" disabled={!bereit}>
        <span>{laden ? 'Wird berechnet …' : 'Umstieg starten'}</span>
        {laden && <span className="lade-kreisel" aria-hidden="true" />}
      </button>
    </form>
  )
}
