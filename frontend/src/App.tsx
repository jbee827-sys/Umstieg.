import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { holeRoute, RouteFehler } from './api/client'
import { ladeVarianten } from './api/varianten'
import { verbindeLive } from './api/sse'
import type { BahnhofTreffer, LiveEreignis, RouteErgebnis, RoutenVariante } from './api/typen'
import { Datenschutz } from './components/Datenschutz'
import { Fusszeile } from './components/Fusszeile'
import { Impressum } from './components/Impressum'
import { Angekommen } from './screens/Angekommen'
import { Navileiste } from './components/Navileiste'
import { Dashboard, type VariantenStand } from './screens/Dashboard'
import { Navigation } from './screens/Navigation'
import { Meldungen } from './screens/Meldungen'
import { Eingabe, type EingabeWerte } from './components/Eingabe'
import { Stoermeldung } from './components/Stoermeldung'
import { StandortStreifen } from './components/StandortStreifen'
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
  // 'dashboard' und 'navigation' zeigen bis Task 3/5 denselben Inhalt.
  const [bildschirm, setzeBildschirmRoh] = useState<Bildschirm>('eingabe')
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
  const [meldungen, setMeldungen] = useState<Meldung[]>([])
  const setBildschirm = useCallback((naechster: Bildschirm) => {
    setJetzt(Date.now())
    // Das Lesen ist ein Ereignis, kein Zustandsabgleich: Wer die Seite
    // oeffnet, hat gelesen. Ein Punkt, der dauerhaft steht, verliert seine
    // Warnwirkung - nach der zweiten Meldung schaut niemand mehr hin. Dass
    // es Meldungen GAB, bleibt an der Hervorhebung sichtbar.
    if (naechster === 'meldungen') setMeldungen(alleGelesen)
    setzeBildschirmRoh(naechster)
  }, [])
  // Route bleibt nach Berechnung vollständig im Speicher – die Anzeige
  // funktioniert auch, wenn die Verbindung im Bahnhof abreißt (Konzept).
  const [route, setRoute] = useState<RouteErgebnis | null>(null)
  const [varianten, setVarianten] = useState<VariantenStand>({ gewaehlt: 'schnellste' })
  // Die aktuelle Route fuer den SSE-Behandler, ohne ihn bei jeder Aenderung
  // neu zu abonnieren.
  const routeRef = useRef<RouteErgebnis | null>(null)
  useEffect(() => {
    routeRef.current = route
  }, [route])
  const [werte, setWerte] = useState<EingabeWerte | null>(null)
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [liveEreignis, setLiveEreignis] = useState<LiveEreignis | null>(null)
  const [stand, setStand] = useState<string | null>(null)
  const { status: standortStatus, standort, starteVerfolgung, stoppeVerfolgung } = useStandort()
  const [erkannt, setErkannt] = useState<BahnhofTreffer[]>([])
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
  const [versatz, setVersatz] = useState(0)

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
    const basis = {
      eva: eingabe.eva,
      gleisAn: eingabe.gleisAn,
      gleisAb: eingabe.gleisAb,
      profil: eingabe.profil,
      zugAn: eingabe.zugAn,
      wagen: eingabe.wagen || undefined,
    }
    const gewaehlt: RoutenVariante =
      eingabe.variante === 'barrierefrei' ? 'barrierefrei' : 'schnellste'
    try {
      await ladeVarianten(
        basis,
        gewaehlt,
        holeRoute,
        (haupt) => {
          setLaden(false)
          setWerte(eingabe)
          setRoute(haupt)
          setVarianten({ gewaehlt, [gewaehlt]: haupt.gehzeitSek })
          setVersatz(0)
          setBildschirm('dashboard')
        },
        (variante, sek) => setVarianten((v) => ({ ...v, [variante]: sek })),
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
  }, [setBildschirm])

  /** Variante wechseln, ohne neu zu rechnen wenn moeglich. */
  const waehleVariante = useCallback(
    (v: RoutenVariante) => {
      if (!werte) return
      void berechne({ ...werte, variante: v })
    },
    [werte, berechne],
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
          zugAn: neueWerte.zugAn,
          wagen: neueWerte.wagen || undefined,
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
  const meldung =
    liveEreignis && liveEreignis.typ !== 'heartbeat' ? (
      <Stoermeldung
        ereignis={liveEreignis}
        onAnsehen={() => {
          setLiveEreignis(null)
          setBildschirm('meldungen')
        }}
        onSchliessen={() => setLiveEreignis(null)}
      />
    ) : null

  function bestaetigeAnkunft() {
    // Angekommen heisst: Dieser Umstieg ist erledigt. Die Eingabe dafuer
    // weiter vorzuhalten hiesse, die naechste Reise mit der letzten zu
    // beginnen.
    leereEntwurf()
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
          wagen={werte.wagen || undefined}
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
          onWechsel={setBildschirm}
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
            setWerte(angenommen.vorschlag.werte)
            setRoute(angenommen.vorschlag.route)
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
          onWechsel={setBildschirm}
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
      <main className="app">
        {meldung}
        <Dashboard
          werte={werte}
          route={route}
          restSek={restSek}
          abgefahren={abgefahren}
          varianten={varianten}
          hinweis={ungelesen(meldungen) > 0}
          onVariante={waehleVariante}
          onNavigation={() => setBildschirm('navigation')}
          onMeldungen={() => setBildschirm('meldungen')}
        />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={setBildschirm}
        />
      </main>
    )
  }

  if (bildschirm === 'navigation' && route && werte) {
    const position = schrittPosition(versatz, route.schritte.length)
    return (
      <main className="app">
        {meldung}
        <div className="routen-kopf">
          <div>
            <div className="kicker">{werte.bahnhofName || 'Umstieg'}</div>
            <h2>
              Gleis {werte.gleisAn} → Gleis {werte.gleisAb}
            </h2>
          </div>
          <span className="stufen-tag">{STUFEN_TEXT[route.stufe]}</span>
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
        />
        {ankunftVorschlag && (
          <StandortStreifen gleis={werte.gleisAb} onBestaetigen={bestaetigeAnkunft} />
        )}
        {route.hinweise.length > 0 && (
          <ul className="hinweisliste">
            {route.hinweise.map((hinweis) => (
              <li key={hinweis}>{hinweis}</li>
            ))}
          </ul>
        )}
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={setBildschirm}
        />
      </main>
    )
  }

  return (
    <main className="app">
      {meldung}
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Dein Umstieg</h1>
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
      <Eingabe
        laden={laden}
        fehler={fehler}
        erkannt={erkannt}
        entwurf={liesEntwurf()}
        onBerechnen={(neueWerte, entwurf) => {
          // Erst sichern, dann rechnen: Scheitert der Abruf, steht die
          // Eingabe trotzdem noch da. Sie ist die Arbeit des Nutzers, nicht
          // das Ergebnis der Rechnung.
          schreibeEntwurf(entwurf)
          void berechne(neueWerte)
        }}
      />
      <Fusszeile />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          ungelesen={ungelesen(meldungen)}
          hervorgehoben={hervorgehoben(meldungen)}
          onWechsel={setBildschirm}
        />
    </main>
  )
}

export default App
