import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { holeRoute, RouteFehler } from './api/client'
import { ersteVariante, ladeVarianten, ladeWeitereVarianten } from './api/varianten'
import { gehzeitSchluessel, ladeStandorte, STANDORT_VOREINSTELLUNG } from './api/standorte'
import { verbindeLive } from './api/sse'
import type {
  Bahnsteigabschnitt,
  LiveEreignis,
  Ort,
  RouteErgebnis,
  RoutenVariante,
} from './api/typen'
import { Datenschutz } from './components/Datenschutz'
import { Fusszeile } from './components/Fusszeile'
import { Impressum } from './components/Impressum'
import { Angekommen } from './screens/Angekommen'
import { Navileiste } from './components/Navileiste'
import { Dashboard, type StandortStand, type VariantenStand } from './screens/Dashboard'
import { Navigation } from './screens/Navigation'
import { Meldungen } from './screens/Meldungen'
import { Eingabe, type EingabeWerte } from './components/Eingabe'
import { Stoermeldung } from './components/Stoermeldung'
import { StandortStreifen } from './components/StandortStreifen'
import { QuelleWeg } from './components/QuelleWeg'
import { ANKUNFT_START, pruefeAnkunft, zielKoordinate } from './standort/ankunft'
import { ABGEFAHREN_KULANZ_MS } from './standort/schwellen'
import { schrittPosition } from './navigation/fortschritt'
import {
  alleGelesen,
  ergaenze,
  hervorgehoben,
  markiereUebernommen,
  setzeVorschlag,
  ungelesen,
  type Meldung,
} from './meldungen/modell'
import { leere as leereEntwurf, lies as liesEntwurf, schreibe as schreibeEntwurf } from './sitzung/eingabespeicher'
import type { Bildschirm } from './navigation/bildschirme'
import { PFAD, bildschirmAusPfad, brauchtReise, startBildschirm } from './navigation/adressen'
import { leereReise, liesReise, schreibeReise } from './sitzung/reisespeicher'
import { mitUebergang, uebergangsart, type Ausloeser } from './navigation/uebergang'
import { erkenneBahnhof } from './standort/bahnhofErkennung'
import { useStandort } from './standort/useStandort'


const FEHLER_TEXTE: Record<string, string> = {
  'db-zugang-fehlt':
    'Der Server hat keinen DB-Datenzugang. Bitte später erneut versuchen oder EVA-Nummer prüfen.',
  'gleis-unbekannt': 'Eines der Gleise wurde an diesem Bahnhof nicht gefunden.',
  // Der Unterschied zur Zeile darueber ist der ganze Punkt: Dort wissen wir,
  // dass es das Gleis nicht gibt. Hier wissen wir nur, dass wir nicht fragen
  // konnten. „Nicht gefunden" laesst den Nutzer den Fehler bei sich suchen und
  // seine Eingabe korrigieren – bei einem Teilausfall von RIS::Stations waere
  // das der falsche Rat. Richtig ist: gleich noch einmal versuchen.
  'gleisliste-unvollstaendig':
    'Die Gleisliste dieses Bahnhofs ist gerade unvollständig – das Gleis lässt sich nicht prüfen. Bitte in einem Moment erneut versuchen.',
  'keine-route': 'Keine passende Route gefunden.',
  netz: 'Keine Verbindung zum Server.',
}

const STUFEN_TEXT: Record<number, string> = {
  1: 'Präzise Karte',
  2: 'Teildaten',
  3: 'Standardmodell (ca.-Angaben)',
}

/**
 * Die Bildschirme, auf denen eine Reise laeuft: Hier tickt die Uhr und hier
 * haengt der Live-Strom. `meldungen` gehoert dazu, seit es ein Dauereintrag
 * ist - eine Seite, die Live-Aenderungen zeigt, muss angeschlossen sein,
 * solange sie offen ist.
 */
const AUF_REISE: Bildschirm[] = ['dashboard', 'navigation', 'meldungen']

/** 'HH:MM' → heutiger Zeitpunkt; kurz nach Mitternacht zählt eine frühe Abfahrt als morgen. */
function heuteUm(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const zeitpunkt = new Date()
  zeitpunkt.setHours(h, m, 0, 0)
  if (zeitpunkt.getTime() < Date.now() - 6 * 3600 * 1000) {
    zeitpunkt.setDate(zeitpunkt.getDate() + 1)
  }
  return zeitpunkt
}

function App() {
  // Startzustand EINMAL aus Adresse und gesicherter Reise (Spec 2026-10-11
  // Seitenuebergaenge, §3/§4): Ein Neuladen auf /weg zeigt wieder den Weg -
  // auch im Bahnhof ohne Netz, wo neu rechnen nicht ginge.
  const [start] = useState(() => {
    const reise = liesReise()
    return { reise, bildschirm: startBildschirm(window.location.pathname, reise !== null) }
  })
  const [bildschirm, setzeBildschirmRoh] = useState<Bildschirm>(start.bildschirm)
  // EIN Zeitpunkt fuer alle Zweige - Ampel-Countdown und Schrittanzeige lesen
  // dieselbe Zahl. Gehalten wird er als Zustand, nicht waehrend des Renderns
  // von der Uhr gelesen: `Date.now()` im Render liefert bei jedem Durchlauf
  // etwas anderes, auch bei Durchlaeufen, die React verwirft.
  const [jetzt, setJetzt] = useState(() => Date.now())
  // Beim Seitenwechsel frisch stellen. Ohne das ginge die Ampel mit einer bis
  // zu zehn Sekunden alten Zahl auf - beim Countdown auf einen Anschluss die
  // eine Stelle, an der das auffiele.
  // Alle Aenderungen dieser Reise, neueste zuerst. Bis zum 03.09.2026 stand
  // hier EIN Vorschlag - jedes neue Ereignis ueberschrieb das vorige, und
  // danach war nicht mehr feststellbar, dass es das vorige gegeben hatte.
  // Deshalb gab es auch nichts zu zaehlen.
  const [meldungen, setMeldungen] = useState<Meldung[]>(start.reise?.meldungen ?? [])
  // Der Bildschirm, von dem aus gewechselt wird - fuer die Richtung des
  // Uebergangs. Als Ref, damit `setBildschirm` stabil bleibt: Viele Rueckrufe
  // haengen an ihm.
  const bildschirmRef = useRef<Bildschirm>(start.bildschirm)
  const setBildschirm = useCallback(
    (naechster: Bildschirm, ausloeser: Ausloeser = 'ablauf', browserAnimiert = false) => {
      const von = bildschirmRef.current
      bildschirmRef.current = naechster
      const wechsle = () => {
        setJetzt(Date.now())
        // Das Lesen ist ein Ereignis, kein Zustandsabgleich: Wer die Seite
        // oeffnet, hat gelesen. Ein Punkt, der dauerhaft steht, verliert seine
        // Warnwirkung - nach der zweiten Meldung schaut niemand mehr hin. Dass
        // es Meldungen GAB, bleibt an der Hervorhebung sichtbar.
        if (naechster === 'meldungen') setMeldungen(alleGelesen)
        setzeBildschirmRoh(naechster)
      }
      if (von === naechster) {
        wechsle()
        return
      }
      // Vorwaerts im Ablauf von rechts, rueckwaerts gespiegelt, ueber die
      // Leiste quer (Spec 2026-10-11 Seitenuebergaenge, §5).
      mitUebergang(uebergangsart(von, naechster, ausloeser), wechsle, { browserAnimiert })
    },
    [],
  )

  // Die Adresse folgt dem Bildschirm: beim ersten Mal ersetzt (aus / wird
  // /eingabe, aus /weg ohne Reise auch), danach ein neuer Eintrag je Wechsel.
  // Kam der Wechsel von der Zurueck-Taste, stimmt die Adresse schon - dann
  // geschieht nichts.
  const ersteAdresse = useRef(true)
  useEffect(() => {
    const soll = PFAD[bildschirm]
    if (window.location.pathname !== soll) {
      if (ersteAdresse.current) {
        window.history.replaceState({ bildschirm }, '', soll + window.location.hash)
      } else {
        window.history.pushState({ bildschirm }, '', soll)
      }
    }
    ersteAdresse.current = false
  }, [bildschirm])
  // Route bleibt nach Berechnung vollständig im Speicher – die Anzeige
  // funktioniert auch, wenn die Verbindung im Bahnhof abreißt (Konzept).
  const [route, setRoute] = useState<RouteErgebnis | null>(start.reise?.route ?? null)
  /**
   * Gehzeiten in Sekunden, geschluesselt nach Variante UND Standort.
   *
   * EIN Speicher fuer beide Knopfreihen, weil beide Achsen zusammen den Weg
   * bestimmen: Am Kopfbahnhof aendert der Standort die Gehzeit ALLER
   * Varianten. Zwei getrennte Listen haetten nach jedem Wechsel die jeweils
   * andere Reihe stillschweigend veralten lassen - Minuten vom alten Standort
   * an den neuen Knoepfen. Hier kann das nicht passieren: Ein Eintrag gilt
   * fuer genau ein Paar, und was einmal geholt ist, bleibt richtig.
   */
  const [gehzeiten, setGehzeiten] = useState<Record<string, number>>(
    start.reise?.gehzeiten ?? {},
  )
  // Spiegelt `gehzeiten` fuer die Nachladeschleifen: Sie laufen NACH dem
  // Zustandswechsel und saehen im Abschluss sonst den Stand von vorher.
  const gehzeitenRef = useRef<Record<string, number>>(start.reise?.gehzeiten ?? {})
  const merkeGehzeit = useCallback(
    (v: RoutenVariante, a: Bahnsteigabschnitt, sek: number) =>
      setGehzeiten((alt) => {
        const neu = { ...alt, [gehzeitSchluessel(v, a)]: sek }
        gehzeitenRef.current = neu
        return neu
      }),
    [],
  )
  const [gewaehlteVariante, setGewaehlteVariante] = useState<RoutenVariante>(
    start.reise?.variante ?? 'schnellste',
  )
  const [gewaehlterStandort, setGewaehlterStandort] = useState<Bahnsteigabschnitt>(
    start.reise?.standort ?? STANDORT_VOREINSTELLUNG,
  )
  const varianten: VariantenStand = useMemo(
    () => ({
      gewaehlt: gewaehlteVariante,
      schnellste: gehzeiten[gehzeitSchluessel('schnellste', gewaehlterStandort)],
      barrierefrei: gehzeiten[gehzeitSchluessel('barrierefrei', gewaehlterStandort)],
      'mit-stopp': gehzeiten[gehzeitSchluessel('mit-stopp', gewaehlterStandort)],
    }),
    [gehzeiten, gewaehlteVariante, gewaehlterStandort],
  )
  const standorte: StandortStand = useMemo(
    () => ({
      gewaehlt: gewaehlterStandort,
      anfang: gehzeiten[gehzeitSchluessel(gewaehlteVariante, 'anfang')],
      mitte: gehzeiten[gehzeitSchluessel(gewaehlteVariante, 'mitte')],
      ende: gehzeiten[gehzeitSchluessel(gewaehlteVariante, 'ende')],
    }),
    [gehzeiten, gewaehlteVariante, gewaehlterStandort],
  )
  // Die aktuelle Route fuer den SSE-Behandler, ohne ihn bei jeder Aenderung
  // neu zu abonnieren.
  const routeRef = useRef<RouteErgebnis | null>(start.reise?.route ?? null)
  useEffect(() => {
    routeRef.current = route
  }, [route])

  // Zurueck/Vor: Der Bildschirm kommt aus der Adresse. Ein reiner
  // Hash-Wechsel (Rechtsseiten) bringt denselben Bildschirm - dann aendert
  // sich nichts. Fehlt die Reise zu einer Adresse, wird der Eintrag ersetzt.
  useEffect(() => {
    const beiZurueck = (e: PopStateEvent) => {
      // Die Zurueck-Wischgeste auf dem iPhone zeigt ihre eigene Animation -
      // zwei uebereinander waeren schlimmer als keine.
      const browserAnimiert =
        (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true
      const ziel = bildschirmAusPfad(window.location.pathname) ?? 'eingabe'
      if (brauchtReise(ziel) && !routeRef.current) {
        window.history.replaceState(
          { bildschirm: 'eingabe' },
          '',
          PFAD.eingabe + window.location.hash,
        )
        setBildschirm('eingabe', 'verlauf', browserAnimiert)
        return
      }
      setBildschirm(ziel, 'verlauf', browserAnimiert)
    }
    window.addEventListener('popstate', beiZurueck)
    return () => window.removeEventListener('popstate', beiZurueck)
  }, [setBildschirm])
  const [werte, setWerte] = useState<EingabeWerte | null>(start.reise?.werte ?? null)
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  /** Variante, die gerade geholt wird - `undefined`, solange nichts laeuft. */
  const [variantenLaden, setVariantenLaden] = useState<RoutenVariante | undefined>(undefined)
  const [variantenFehler, setVariantenFehler] = useState<string | null>(null)
  /** Standort, der gerade geholt wird - `undefined`, solange nichts laeuft. */
  const [standortLaden, setStandortLaden] = useState<Bahnsteigabschnitt | undefined>(undefined)
  const [liveEreignis, setLiveEreignis] = useState<LiveEreignis | null>(null)
  /** Zeitstempel des Tafelausfalls, solange er anhaelt (null = Quelle antwortet). */
  const [quelleWegSeit, setQuelleWegSeit] = useState<string | null>(null)
  const [stand, setStand] = useState<string | null>(null)
  const { status: standortStatus, standort, starteVerfolgung, stoppeVerfolgung } = useStandort()
  const [erkannt, setErkannt] = useState<Ort[]>([])
  const [standortZuUngenau, setStandortZuUngenau] = useState(false)
  const erkennungLaeuft = useRef(false)
  const erkennungFertig = useRef(false)

  // Genau einmal je Sitzung erkennen – danach bestimmt der Nutzer.
  //
  // Ein zu grober Fix darf den einen Versuch NICHT verbrauchen: Auf dem Handy
  // kommt zuerst die Netzortung (oft ueber 1 km) und erst Sekunden spaeter der
  // GPS-Fix. Deshalb wird erkennungFertig nur gesetzt, wenn wirklich gesucht
  // wurde. Alle Zustandsaenderungen liegen im then(), damit kein synchrones
  // setState im Effect steht.
  useEffect(() => {
    if (!standort || erkennungFertig.current || erkennungLaeuft.current) return
    erkennungLaeuft.current = true
    void erkenneBahnhof(standort)
      .then((ergebnis) => {
        erkennungLaeuft.current = false
        if (ergebnis.ok) {
          erkennungFertig.current = true
          setStandortZuUngenau(false)
          setErkannt(ergebnis.treffer.slice(0, 6))
        } else if (ergebnis.fehler === 'zu-ungenau') {
          setStandortZuUngenau(true)
        } else {
          // Netz- oder DB-Fehler: nicht endlos wiederholen.
          erkennungFertig.current = true
        }
      })
      // Ohne diesen Zweig bliebe `erkennungLaeuft` bei einem Wurf dauerhaft
      // auf true, und die Bedingung oben laesst dann keinen zweiten Versuch
      // mehr zu: Die Erkennung waere fuer die ganze Sitzung tot, ohne dass
      // irgendetwas davon zu sehen waere. `erkenneBahnhof` wirft heute nicht -
      // aber das Flag darf nicht davon abhaengen, dass das so bleibt.
      .catch(() => {
        erkennungLaeuft.current = false
        erkennungFertig.current = true
      })
  }, [standort])

  // Alle 10 s die Uhr nachziehen - fuer den Countdown der Ampel und die
  // Restzeit auf der Angekommen-Seite. Die Schrittanzeige haengt seit dem
  // 02.09.2026 NICHT mehr daran: Weitergeschaltet wird per Knopf.
  useEffect(() => {
    if (!AUF_REISE.includes(bildschirm)) return
    const timer = window.setInterval(() => setJetzt(Date.now()), 10000)
    return () => window.clearInterval(timer)
  }, [bildschirm])

  // Verfolgung laeuft ausschliesslich in der Routenansicht.
  useEffect(() => {
    if (bildschirm !== 'dashboard' && bildschirm !== 'navigation') return
    starteVerfolgung()
    return stoppeVerfolgung
  }, [bildschirm, starteVerfolgung, stoppeVerfolgung])

  // Wie weit der Nutzer sich durchgetippt hat. Summe der Weiter- und
  // Zurueck-Tipps; die Uhr redet hier nicht mehr mit (siehe fortschritt.ts).
  const [versatz, setVersatz] = useState(start.reise?.versatz ?? 0)

  // Gesichert wird nur auf den Reise-Bildschirmen - nach „Angekommen"
  // schriebe sonst schon das Leeren der Meldungen die eben geloeschte Reise
  // zurueck. Wer danach ueber die Leiste zur Uebersicht geht, setzt die Reise
  // fort; dann wird wieder gesichert.
  useEffect(() => {
    if (!AUF_REISE.includes(bildschirm) || !route || !werte) return
    schreibeReise({
      werte,
      route,
      variante: gewaehlteVariante,
      standort: gewaehlterStandort,
      gehzeiten,
      meldungen,
      versatz,
    })
  }, [bildschirm, route, werte, gewaehlteVariante, gewaehlterStandort, gehzeiten, meldungen, versatz])

  const ankunft = useRef(ANKUNFT_START)
  const [ankunftVorschlag, setAnkunftVorschlag] = useState(false)

  useEffect(() => {
    if (bildschirm !== 'dashboard' && bildschirm !== 'navigation' || !standort || !route) return
    const ziel = zielKoordinate(route)
    // Stufe 3 und fehlender Zielmarker liefern null – dann bleibt nur der
    // manuelle Knopf, eine Pruefung gegen konstruierte Koordinaten waere sinnlos.
    if (!ziel) return
    const ergebnis = pruefeAnkunft(ankunft.current, standort, ziel, Date.now())
    ankunft.current = ergebnis.zustand
    setAnkunftVorschlag(ergebnis.vorschlagen)
  }, [bildschirm, standort, route])

  // Rechtsseiten ueber den URL-Hash, damit sie eine stabile, verlinkbare
  // Adresse haben und der Zurueck-Knopf des Browsers funktioniert.
  const [rechtsseite, setRechtsseite] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const beiWechsel = () => setRechtsseite(window.location.hash.slice(1))
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  function schliesseRechtsseite() {
    window.history.replaceState('', '', window.location.pathname)
    setRechtsseite('')
  }

  const berechne = useCallback(async (eingabe: EingabeWerte) => {
    setLaden(true)
    setFehler(null)
    // Eine neue Rechnung raeumt den Variantenfehler mit weg - er gehoert zur
    // vorigen Reise und stuende sonst noch am neuen Dashboard.
    setVariantenFehler(null)
    // Eine neue Reise faengt mit einem leeren Gehzeit-Speicher an: Die alten
    // Minuten gehoeren zu einem anderen Bahnhof.
    setGehzeiten({})
    gehzeitenRef.current = {}
    const ohneStandort = {
      eva: eingabe.eva,
      gleisAn: eingabe.gleisAn,
      gleisAb: eingabe.gleisAb,
      profil: eingabe.profil,
      zugAn: eingabe.zugAn,
      wagen: eingabe.wagenAn || undefined,
    }
    // NICHT `standort` - so heisst in dieser Datei die GPS-Position.
    const standortAmGleis = eingabe.abschnitt
    const basis = { ...ohneStandort, abschnitt: standortAmGleis }
    const gewaehlt = ersteVariante(eingabe.variante)
    try {
      await ladeVarianten(
        basis,
        gewaehlt,
        holeRoute,
        (haupt) => {
          setLaden(false)
          setWerte(eingabe)
          setRoute(haupt)
          setGewaehlteVariante(gewaehlt)
          setGewaehlterStandort(standortAmGleis)
          merkeGehzeit(gewaehlt, standortAmGleis, haupt.gehzeitSek)
          setVersatz(0)
          setBildschirm('dashboard')
        },
        (variante, sek) => merkeGehzeit(variante, standortAmGleis, sek),
      )
      // Erst die Varianten, dann die beiden anderen Standorte - in dieser
      // Reihenfolge, weil die Variantenknoepfe direkt unter der Ampel stehen
      // und zuerst gelesen werden.
      await ladeStandorte(ohneStandort, gewaehlt, standortAmGleis, holeRoute, (a, sek) =>
        merkeGehzeit(gewaehlt, a, sek),
      )
    } catch (e) {
      setLaden(false)
      const code = e instanceof RouteFehler ? e.code : 'netz'
      const detail = e instanceof RouteFehler ? e.message : undefined
      setFehler(FEHLER_TEXTE[code] ?? detail ?? 'Unbekannter Fehler.')
    }
    // `setBildschirm` ist selbst ein useCallback ohne Abhaengigkeiten und
    // damit stabil - anders als der nackte Setter davor kann der Linter das
    // nicht sehen und will ihn genannt haben.
  }, [setBildschirm, merkeGehzeit])

  /**
   * Variante wechseln.
   *
   * Bis zum 07.09.2026 lief das ueber `berechne` - und damit ueber
   * `ladeVarianten`, das ALLE drei Varianten holt. Ein Tipp kostete drei
   * Anfragen statt einer, und `setVarianten` ersetzte dabei den ganzen Stand:
   * Die Minuten der uebrigen Knoepfe verschwanden und trudelten einzeln
   * wieder ein.
   *
   * Schwerer wog, was dabei unsichtbar blieb. `berechne` meldet Fortschritt
   * ueber `laden` und `fehler` - beide werden ausschliesslich an `Eingabe`
   * gezeichnet. Auf dem Dashboard passierte nach dem Tippen also nichts:
   * kein Ladehinweis waehrend der Anfrage, keine Meldung, wenn sie mit 404
   * zurueckkam ("Keine barrierefreie Route gefunden", "Kein WC und kein
   * Kiosk auf dem Weg gefunden"). In der Mobilabnahme fuehlte sich die Zeile
   * deshalb tot an.
   *
   * Jetzt holt der Wechsel genau die eine Variante und fuehrt seinen
   * Fortschritt selbst - sichtbar am Knopf, der getippt wurde.
   */
  const waehleVariante = useCallback(
    (v: RoutenVariante) => {
      if (!werte || v === gewaehlteVariante || variantenLaden !== undefined) return
      const standortAmGleis = werte.abschnitt
      setVariantenLaden(v)
      setVariantenFehler(null)
      void holeRoute({
        eva: werte.eva,
        gleisAn: werte.gleisAn,
        gleisAb: werte.gleisAb,
        profil: werte.profil,
        zugAn: werte.zugAn,
        wagen: werte.wagenAn || undefined,
        abschnitt: standortAmGleis,
        variante: v,
      })
        .then(async (neu) => {
          setRoute(neu)
          setWerte({ ...werte, variante: v })
          setGewaehlteVariante(v)
          merkeGehzeit(v, standortAmGleis, neu.gehzeitSek)
          setVersatz(0)
          // Die Standortknoepfe zeigen Minuten der NEUEN Variante - die
          // fehlenden nachholen. Was schon im Speicher liegt, wird nicht
          // zweimal geholt.
          await ladeStandorte(
            {
              eva: werte.eva,
              gleisAn: werte.gleisAn,
              gleisAb: werte.gleisAb,
              profil: werte.profil,
              zugAn: werte.zugAn,
              wagen: werte.wagenAn || undefined,
            },
            v,
            standortAmGleis,
            holeRoute,
            (a, sek) => merkeGehzeit(v, a, sek),
            (a) => gehzeitenRef.current[gehzeitSchluessel(v, a)] !== undefined,
          )
        })
        .catch((e: unknown) => {
          // Der Fehlertext des Backends ist hier der bessere: Er nennt den
          // Grund ("kein nutzbarer Aufzug", "kein WC und kein Kiosk"),
          // waehrend FEHLER_TEXTE nur die Gattung kennt.
          const detail = e instanceof RouteFehler ? e.message : undefined
          const code = e instanceof RouteFehler ? e.code : 'netz'
          setVariantenFehler(detail || FEHLER_TEXTE[code] || 'Diese Route liess sich nicht berechnen.')
        })
        .finally(() => setVariantenLaden(undefined))
    },
    [werte, gewaehlteVariante, variantenLaden, merkeGehzeit],
  )

  /**
   * Standort am Ankunftsgleis wechseln.
   *
   * Der Zwilling von `waehleVariante`, und aus demselben Grund eigenstaendig:
   * Ein Wechsel holt GENAU EINE Route und fuehrt seinen Fortschritt am
   * getippten Knopf. Nur der Weg selbst ist hier ein anderer - er kann sich
   * vollstaendig aendern, nicht nur in der Laenge. An Leipzig Hbf, Gleis 6
   * nach 16, fuehrt „Anfang" durch die Unterfuehrung und „Ende" ueber den
   * Bahnhofskopf: andere Ebenen, andere Treppen, andere Schritte.
   */
  const waehleStandort = useCallback(
    (a: Bahnsteigabschnitt) => {
      if (!werte || a === gewaehlterStandort || standortLaden !== undefined) return
      const variante = gewaehlteVariante
      const ohneStandort = {
        eva: werte.eva,
        gleisAn: werte.gleisAn,
        gleisAb: werte.gleisAb,
        profil: werte.profil,
        zugAn: werte.zugAn,
        wagen: werte.wagenAn || undefined,
      }
      setStandortLaden(a)
      setVariantenFehler(null)
      void holeRoute({ ...ohneStandort, abschnitt: a, variante })
        .then(async (neu) => {
          setRoute(neu)
          setWerte({ ...werte, abschnitt: a })
          setGewaehlterStandort(a)
          merkeGehzeit(variante, a, neu.gehzeitSek)
          // Der Fortschritt in der Schrittliste gehoert zum alten Weg.
          setVersatz(0)
          // Die Variantenknoepfe zeigen jetzt Minuten fuer den NEUEN Standort.
          await ladeWeitereVarianten(
            { ...ohneStandort, abschnitt: a },
            variante,
            holeRoute,
            (v, sek) => merkeGehzeit(v, a, sek),
            (v) => gehzeitenRef.current[gehzeitSchluessel(v, a)] !== undefined,
          )
        })
        .catch((e: unknown) => {
          const detail = e instanceof RouteFehler ? e.message : undefined
          const code = e instanceof RouteFehler ? e.code : 'netz'
          setVariantenFehler(detail || FEHLER_TEXTE[code] || 'Diese Route liess sich nicht berechnen.')
        })
        .finally(() => setStandortLaden(undefined))
    },
    [werte, gewaehlterStandort, gewaehlteVariante, standortLaden, merkeGehzeit],
  )

  // Live-Überwachung, solange eine Route offen ist.
  //
  // Ein Gleiswechsel wird NICHT mehr still übernommen. Bisher rechnete die App
  // neu und schrieb das neue Gleis in die Eingabewerte – der Nutzer erfuhr es
  // hinterher aus einem Banner. Jetzt entsteht ein Vorschlag, den er auf dem
  // Störungsbildschirm annimmt oder verwirft.
  useEffect(() => {
    // Auch auf der Meldungsseite - ihr leerer Zustand sagt zu, dass noch
    // hingehoert wird, und der Zeitstempel daneben belegt es. Waere der Strom
    // dort geschlossen, waere beides unwahr, sobald jemand die Seite offen
    // laesst.
    if (!AUF_REISE.includes(bildschirm) || !werte?.eva) return
    return verbindeLive({
      eva: werte.eva,
      zugAn: werte.zugAnName,
      zugAb: werte.zugAbName,
      onWiederverbunden: () => void berechne(werte),
      onEreignis: (ereignis) => {
        if (ereignis.typ === 'heartbeat') {
          setStand(ereignis.zeitstempel)
          return
        }
        // Der Quellenausfall ist ein Zustand, keine Meldung: kein Ruetteln,
        // kein Eintrag im Verlauf, keine Stoermeldung ueber der Seite. Er
        // steht, bis die Quelle wieder antwortet (Degradationstabelle Z. 2).
        if (ereignis.typ === 'quelle-weg') {
          setQuelleWegSeit(ereignis.zeitstempel)
          return
        }
        if (ereignis.typ === 'quelle-da') {
          setQuelleWegSeit(null)
          return
        }
        setLiveEreignis(ereignis)
        navigator.vibrate?.([200, 100, 200])

        // Eine neue Abfahrtszeit aendert die Restzeit, nicht den Weg - die
        // Route bleibt, nur die Zeit wird neu. Ein Gleiswechsel dagegen
        // braucht eine neue Berechnung.
        if (ereignis.typ === 'verspaetung' && ereignis.neu) {
          // Auf dem letzten Vorschlag aufsetzen, nicht daneben: Liegt ein
          // noch nicht uebernommener Gleiswechsel vor, traegt die neueste
          // Meldung beides - neues Gleis UND neue Zeit. Sonst waere nach
          // einer Verspaetung der Gleiswechsel nicht mehr uebernehmbar, denn
          // uebernehmen laesst sich nur die neueste.
          setMeldungen((liste) => {
            const basis = liste[0]?.vorschlag
            const ergaenzt = ergaenze(liste, ereignis, {
              route: basis?.route ?? routeRef.current!,
              werte: { ...(basis?.werte ?? werte), abfahrtZeit: ereignis.neu! },
              anlass: ereignis,
            })
            // Wer die Seite offen hat, liest mit.
            return bildschirm === 'meldungen' ? alleGelesen(ergaenzt) : ergaenzt
          })
          return
        }
        if (ereignis.typ !== 'gleiswechsel' || !ereignis.neu) return
        const betrifftAnkunft = ereignis.zug === werte.zugAnName
        const neueWerte: EingabeWerte = {
          ...werte,
          gleisAn: betrifftAnkunft ? ereignis.neu : werte.gleisAn,
          gleisAb: betrifftAnkunft ? werte.gleisAb : ereignis.neu,
        }
        // Die Meldung entsteht SOFORT, die Route wird nachgetragen. Entstuende
        // sie erst mit der Route, zaehlte ein fehlgeschlagener Abruf gar
        // nicht - und der Reisende erfuehre vom Wechsel allein aus dem
        // Banner, das er wegwischen kann.
        setMeldungen((liste) => {
          const ergaenzt = ergaenze(liste, ereignis)
          return bildschirm === 'meldungen' ? alleGelesen(ergaenzt) : ergaenzt
        })
        // Berechnen ja, anwenden nein. Schlägt es fehl, bleibt die Meldung
        // ohne Route stehen und sagt das auch.
        void holeRoute({
          eva: neueWerte.eva,
          gleisAn: neueWerte.gleisAn,
          gleisAb: neueWerte.gleisAb,
          profil: neueWerte.profil,
          variante: neueWerte.variante,
          // Der gewaehlte Standort gehoert mitgerechnet. Ohne ihn faellt der
          // Vorschlag still auf die Bahnsteigmitte zurueck - und zeigt, am
          // Kopfbahnhof, einen anderen Weg als den, der gerade auf dem Schirm
          // steht, ohne dass irgendetwas das sagt.
          abschnitt: neueWerte.abschnitt,
          zugAn: neueWerte.zugAn,
          wagen: neueWerte.wagenAn || undefined,
        })
          .then((neueRoute) =>
            setMeldungen((liste) =>
              // Die Meldung wird ueber ihr Ereignis wiedergefunden - in der
              // Zwischenzeit koennen weitere dazugekommen sein.
              setzeVorschlag(liste, liste.find((m) => m.ereignis === ereignis)?.nr ?? -1, {
                route: neueRoute,
                werte: neueWerte,
                anlass: ereignis,
              }),
            ),
          )
          .catch(() => undefined)
      },
    })
  }, [bildschirm, werte, berechne])

  if (rechtsseite === 'impressum') return <Impressum onZurueck={schliesseRechtsseite} />
  if (rechtsseite === 'datenschutz') return <Datenschutz onZurueck={schliesseRechtsseite} />

  // Eine Aenderung an Gleis oder Abfahrtszeit ist zu wichtig, um sie erst
  // beim naechsten Seitenwechsel zu zeigen - die Meldung liegt deshalb ueber
  // JEDER Seite.
  // Der Ausfall der Echtzeitquelle gehoert aus demselben Grund ueber jede
  // Seite (Degradationstabelle Zeile 2) - deshalb steht er hier neben der
  // Stoermeldung und nicht an den fuenf Einbaustellen einzeln.
  const meldung = (
    <>
      {quelleWegSeit ? <QuelleWeg seit={quelleWegSeit} /> : null}
      {liveEreignis && liveEreignis.typ !== 'heartbeat' ? (
        <Stoermeldung
          ereignis={liveEreignis}
          onAnsehen={() => {
            setLiveEreignis(null)
            setBildschirm('meldungen')
          }}
          onSchliessen={() => setLiveEreignis(null)}
        />
      ) : null}
    </>
  )

  function bestaetigeAnkunft() {
    // Angekommen heisst: Dieser Umstieg ist erledigt. Die Eingabe dafuer
    // weiter vorzuhalten hiesse, die naechste Reise mit der letzten zu
    // beginnen.
    leereEntwurf()
    // Dieselbe Zusage wie beim Entwurf (Datenschutzerklaerung): Mit
    // „Angekommen" ist auch die gesicherte Reise weg.
    leereReise()
    // Zaehler und Hervorhebung gehoerten zu diesem Umstieg. Sie in die
    // naechste Reise mitzunehmen hiesse, eine erledigte Aenderung als offen
    // auszugeben.
    setMeldungen([])
    ankunft.current = { ...ankunft.current, bestaetigt: true }
    setAnkunftVorschlag(false)
    stoppeVerfolgung()
    setBildschirm('angekommen')
  }

  if (bildschirm === 'angekommen' && werte) {
    return (
      <main className="app">
        {meldung}
        <Angekommen
          gleis={werte.gleisAb}
          abfahrt={werte.abfahrtZeit}
          // Der Wagenkasten gehoert zum ANSCHLUSSzug: Der Bildschirm sagt,
          // wo du einsteigst, nicht wo du ausgestiegen bist. Bis zum
          // 04.09.2026 stand hier der Ankunftswagen - `zeigtWagen` prueft
          // seit jeher `istFernverkehr(zugAbName)`, also den Abfahrtszug.
          wagen={werte.wagenAb || undefined}
          zugAbName={werte.zugAbName}
          restSek={
            werte.abfahrtZeit
              ? (heuteUm(werte.abfahrtZeit).getTime() - jetzt) / 1000
              : undefined
          }
          onNeu={() => {
            ankunft.current = ANKUNFT_START
            setBildschirm('eingabe')
          }}
        />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={(b) => setBildschirm(b, 'leiste')}
        />
      </main>
    )
  }

  if (bildschirm === 'meldungen' && route && werte) {
    // Die Restzeit bezieht sich auf die NEUE Abfahrt - die ist der Grund,
    // warum die Ampel nach dem Wechsel anders stehen kann.
    const neueZeit = meldungen[0]?.vorschlag?.werte.abfahrtZeit
    const restSek = neueZeit ? (heuteUm(neueZeit).getTime() - jetzt) / 1000 : undefined
    return (
      <main className="app">
        {meldung}
        <Meldungen
          meldungen={meldungen}
          alteRoute={route}
          alteWerte={werte}
          stand={stand}
          restSek={restSek}
          onUebernehmen={(angenommen) => {
            if (!angenommen.vorschlag) return
            const uebernommen = angenommen.vorschlag
            setWerte(uebernommen.werte)
            setRoute(uebernommen.route)
            // Der Gehzeit-Speicher gehoerte zum ALTEN Gleis. Ihn stehen zu
            // lassen hiesse, an Standort- und Variantenknoepfen Minuten zu
            // zeigen, die fuer eine Route gerechnet wurden, die es nicht mehr
            // gibt. Neu anfangen, mit der einen Zahl, die belegt ist.
            gehzeitenRef.current = {}
            setGehzeiten({})
            merkeGehzeit(
              uebernommen.werte.variante,
              uebernommen.werte.abschnitt,
              uebernommen.route.gehzeitSek,
            )
            setGewaehlteVariante(uebernommen.werte.variante)
            setGewaehlterStandort(uebernommen.werte.abschnitt)
            setVersatz(0)
            setMeldungen((liste) => markiereUebernommen(liste, angenommen.nr))
            setBildschirm('dashboard')
          }}
        />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={(b) => setBildschirm(b, 'leiste')}
        />
      </main>
    )
  }

  if (bildschirm === 'dashboard' && route && werte) {
    const restSek = werte.abfahrtZeit
      ? (heuteUm(werte.abfahrtZeit).getTime() - jetzt) / 1000
      : undefined
    const abgefahren = restSek !== undefined && restSek * 1000 < -ABGEFAHREN_KULANZ_MS
    return (
      <main className="app app-dashboard">
        {meldung}
        <Dashboard
          werte={werte}
          route={route}
          restSek={restSek}
          abgefahren={abgefahren}
          varianten={varianten}
          standorte={standorte}
          standortLaedt={standortLaden}
          onStandort={waehleStandort}
          hinweis={ungelesen(meldungen) > 0}
          laedt={variantenLaden}
          variantenFehler={variantenFehler}
          onVariante={waehleVariante}
          onNavigation={() => setBildschirm('navigation')}
          onMeldungen={() => setBildschirm('meldungen')}
        />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={(b) => setBildschirm(b, 'leiste')}
        />
      </main>
    )
  }

  if (bildschirm === 'navigation' && route && werte) {
    const position = schrittPosition(versatz, route.schritte.length)
    return (
      // `app-navigation`: Diese Seite rollt nicht. Kopf oben, Bild im festen
      // Bereich, Schritt-Box und Leiste unten am Rand - siehe App.css.
      <main className="app app-navigation">
        {meldung}
        {/* Das Stufen-Abzeichen steht in der Zeile des Bahnhofsnamens, nicht
            neben dem Titel: Dort bricht „Gleis 12 → Gleis 104" auf 360 px
            sonst in zwei Zeilen um, und die nimmt das feste Bild. */}
        <div className="routen-kopf">
          <div>
            <div className="routen-kopf-zeile">
              <div className="kicker">{werte.bahnhofName || 'Umstieg'}</div>
              <span className="stufen-tag">{STUFEN_TEXT[route.stufe]}</span>
            </div>
            <h2>
              Gleis {werte.gleisAn} → Gleis {werte.gleisAb}
            </h2>
          </div>
        </div>
        {stand && (
          <p className="live-stand">
            Live-Daten · Stand:{' '}
            {new Date(stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </p>
        )}
        <Navigation
          route={route}
          gleisAn={werte.gleisAn}
          gleisAb={werte.gleisAb}
          bahnhofName={werte.bahnhofName || 'Umstieg'}
          position={position}
          standort={standort}
          onZurueck={() => setVersatz((v) => v - 1)}
          onWeiter={() => setVersatz((v) => v + 1)}
          onAngekommen={bestaetigeAnkunft}
          // Die Streckenhinweise standen bis zum 19.09.2026 lose unter der
          // Schritt-Box. Im festen Bildschirm ist dort kein Platz mehr; sie
          // bleiben im Aufklapper erreichbar, statt zu verschwinden.
          {...(route.hinweise.length > 0
            ? {
                zusatz: (
                  <ul className="hinweisliste">
                    {route.hinweise.map((hinweis) => (
                      <li key={hinweis}>{hinweis}</li>
                    ))}
                  </ul>
                ),
              }
            : {})}
        />
        {ankunftVorschlag && (
          <StandortStreifen gleis={werte.gleisAb} onBestaetigen={bestaetigeAnkunft} />
        )}
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={(b) => setBildschirm(b, 'leiste')}
        />
      </main>
    )
  }

  // Die Eingabe baut ihren Aufbau selbst (Rollbereich, fester Knopf, im
  // breiten Layout die Tafeln). Kopf und Fusszeile stehen IN ihrem
  // Rollbereich, kommen aber von hier - nur App kennt den Standort.
  return (
    <main className="app app-eingabe">
      {meldung}
      <Eingabe
        laden={laden}
        fehler={fehler}
        erkannt={erkannt}
        entwurf={liesEntwurf()}
        kopf={
          <>
            <header className="kopf">
              {/* Das Lockup traegt die Wortmarke selbst, darum steht hier kein
                  Text mehr. Die h1 bleibt als Huelle: Ohne sie haette die Seite
                  keine Ueberschrift mehr - alt geht an Screenreader, width/height
                  halten den Platz frei, bevor das Bild geladen ist. */}
              <h1 className="lockup">
                <img src="/lockup-zwei-gleise.png" alt="Umstieg." width={1003} height={181} />
              </h1>
              <p>Vom Ankunftsgleis zum Anschlusszug – Schritt für Schritt.</p>
            </header>
            {standortStatus === 'verweigert' && (
              <div className="hinweis-box">
                Ohne Standortfreigabe suchst du den Bahnhof von Hand. Du kannst sie in den
                Browsereinstellungen für diese Seite wieder erlauben.
              </div>
            )}
            {standortStatus === 'nicht-verfuegbar' && (
              <div className="hinweis-box">
                Die Standortbestimmung braucht eine sichere Verbindung (HTTPS).
              </div>
            )}
            {standortZuUngenau && standort && (
              <div className="hinweis-box">
                Dein Standort ist nur auf ± {Math.round(standort.genauigkeitM)} m genau – zu grob, um
                daraus einen Bahnhof zu bestimmen. Ohne GPS, etwa an einem Rechner, ist das normal.
                Such den Bahnhof bitte von Hand.
              </div>
            )}
            <hr className="trennlinie" />
          </>
        }
        fuss={<Fusszeile />}
        onBerechnen={(neueWerte, entwurf) => {
          // Erst sichern, dann rechnen: Scheitert der Abruf, steht die
          // Eingabe trotzdem noch da. Sie ist die Arbeit des Nutzers, nicht
          // das Ergebnis der Rechnung.
          schreibeEntwurf(entwurf)
          void berechne(neueWerte)
        }}
      />
      <Navileiste
        aktuell={bildschirm}
        hatRoute={route !== null}
        ungelesen={ungelesen(meldungen)}
        hervorgehoben={hervorgehoben(meldungen)}
        onWechsel={(b) => setBildschirm(b, 'leiste')}
      />
    </main>
  )
}

export default App
