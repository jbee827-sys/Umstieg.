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
import { Stoerung, type Vorschlag } from './screens/Stoerung'
import { Eingabe, type EingabeWerte } from './components/Eingabe'
import { Stoermeldung } from './components/Stoermeldung'
import { StandortStreifen } from './components/StandortStreifen'
import { ANKUNFT_START, pruefeAnkunft, zielKoordinate } from './standort/ankunft'
import { ABGEFAHREN_KULANZ_MS } from './standort/schwellen'
import { aktiverSchritt } from './navigation/fortschritt'
import type { Bildschirm } from './navigation/bildschirme'
import { erkenneBahnhof } from './standort/bahnhofErkennung'
import { useStandort } from './standort/useStandort'


const FEHLER_TEXTE: Record<string, string> = {
  'db-zugang-fehlt':
    'Der Server hat keinen DB-Datenzugang. Bitte später erneut versuchen oder EVA-Nummer prüfen.',
  'gleis-unbekannt': 'Eines der Gleise wurde an diesem Bahnhof nicht gefunden.',
  'keine-route': 'Keine passende Route gefunden.',
  netz: 'Keine Verbindung zum Server.',
}

const STUFEN_TEXT: Record<number, string> = {
  1: 'Präzise Karte',
  2: 'Teildaten',
  3: 'Standardmodell (ca.-Angaben)',
}

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
  const [bildschirm, setBildschirm] = useState<Bildschirm>('eingabe')
  // Route bleibt nach Berechnung vollständig im Speicher – die Anzeige
  // funktioniert auch, wenn die Verbindung im Bahnhof abreißt (Konzept).
  const [route, setRoute] = useState<RouteErgebnis | null>(null)
  const [varianten, setVarianten] = useState<VariantenStand>({ gewaehlt: 'schnellste' })
  // Ein Gleiswechsel-Vorschlag. Liegt einer vor, traegt die Leiste ein
  // Kennzeichen; uebernommen wird er nur auf Knopfdruck.
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null)
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
  const [, setTick] = useState(0)
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
    void erkenneBahnhof(standort).then((ergebnis) => {
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
  }, [standort])

  // Live-Countdown: mit bekannter Abfahrtszeit alle 10 s neu rendern
  // Alle 10 s neu rendern. Treibt zwei Dinge: den Countdown der Ampel und das
  // Weiterruecken der Schrittanzeige - deshalb laeuft er auch ohne Zugauswahl.
  useEffect(() => {
    if (bildschirm !== 'dashboard' && bildschirm !== 'navigation') return
    const timer = window.setInterval(() => setTick((t) => t + 1), 10000)
    return () => window.clearInterval(timer)
  }, [bildschirm])

  // Verfolgung laeuft ausschliesslich in der Routenansicht.
  useEffect(() => {
    if (bildschirm !== 'dashboard' && bildschirm !== 'navigation') return
    starteVerfolgung()
    return stoppeVerfolgung
  }, [bildschirm, starteVerfolgung, stoppeVerfolgung])

  // Die Uhr laeuft ab dem Oeffnen der Routenansicht. Als State, nicht als Ref:
  // Der Wert wird waehrend des Renderns gelesen, und ein Ref darf das nicht -
  // er kann sich ohne Render aendern. Gesetzt wird er im Ereignisbehandler
  // (berechne), nicht in einem Effect.
  const [startZeit, setStartZeit] = useState(0)
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
          setStartZeit(Date.now())
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
  }, [])

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
    if ((bildschirm !== 'dashboard' && bildschirm !== 'navigation') || !werte?.eva) return
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
          setVorschlag((alt) => ({
            route: alt?.route ?? routeRef.current!,
            werte: { ...werte, abfahrtZeit: ereignis.neu },
            anlass: ereignis,
          }))
          return
        }
        if (ereignis.typ !== 'gleiswechsel' || !ereignis.neu) return
        const betrifftAnkunft = ereignis.zug === werte.zugAnName
        const neueWerte: EingabeWerte = {
          ...werte,
          gleisAn: betrifftAnkunft ? ereignis.neu : werte.gleisAn,
          gleisAb: betrifftAnkunft ? werte.gleisAb : ereignis.neu,
        }
        // Berechnen ja, anwenden nein. Schlägt es fehl, bleibt es beim Banner –
        // dann weiß der Nutzer wenigstens vom Wechsel.
        void holeRoute({
          eva: neueWerte.eva,
          gleisAn: neueWerte.gleisAn,
          gleisAb: neueWerte.gleisAb,
          profil: neueWerte.profil,
          variante: neueWerte.variante,
          zugAn: neueWerte.zugAn,
          wagen: neueWerte.wagen || undefined,
        })
          .then((neueRoute) => setVorschlag({ route: neueRoute, werte: neueWerte, anlass: ereignis }))
          .catch(() => setVorschlag(null))
      },
    })
  }, [bildschirm, werte, berechne])

  if (rechtsseite === 'impressum') return <Impressum onZurueck={schliesseRechtsseite} />
  if (rechtsseite === 'datenschutz') return <Datenschutz onZurueck={schliesseRechtsseite} />

  // EIN Zeitpunkt fuer alle Zweige. Der 10-Sekunden-Tick oben loest das
  // Neurendern aus; hier nur lesen - deshalb genau eine Stelle.
  const jetzt = Date.now()

  // Eine Aenderung an Gleis oder Abfahrtszeit ist zu wichtig, um sie erst
  // beim naechsten Seitenwechsel zu zeigen - die Meldung liegt deshalb ueber
  // JEDER Seite.
  const meldung =
    liveEreignis && liveEreignis.typ !== 'heartbeat' ? (
      <Stoermeldung
        ereignis={liveEreignis}
        onAnsehen={() => {
          setLiveEreignis(null)
          setBildschirm('stoerung')
        }}
        onSchliessen={() => setLiveEreignis(null)}
      />
    ) : null

  function bestaetigeAnkunft() {
    ankunft.current = { ...ankunft.current, bestaetigt: true }
    setAnkunftVorschlag(false)
    stoppeVerfolgung()
    setBildschirm('angekommen')
  }

  if (bildschirm === 'angekommen' && werte) {
    return (
      <main className="app">
      {meldung}
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
          hinweis={false}
          onWechsel={setBildschirm}
        />
      </main>
    )
  }

  if (bildschirm === 'stoerung' && vorschlag && route && werte) {
    const restSek = vorschlag.werte.abfahrtZeit
      ? (heuteUm(vorschlag.werte.abfahrtZeit).getTime() - jetzt) / 1000
      : undefined
    return (
      <main className="app">
      {meldung}
        {meldung}
        <Stoerung
          vorschlag={vorschlag}
          alteRoute={route}
          alteWerte={werte}
          restSek={restSek}
          onUebernehmen={() => {
            setWerte(vorschlag.werte)
            setRoute(vorschlag.route)
            setStartZeit(Date.now())
            setVersatz(0)
            setVorschlag(null)
            setBildschirm('dashboard')
          }}
          onBehalten={() => {
            setVorschlag(null)
            setBildschirm('dashboard')
          }}
        />
        <Navileiste
          aktuell="dashboard"
          hatRoute={route !== null}
          hinweis={false}
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
        {meldung}
        <Dashboard
          werte={werte}
          route={route}
          restSek={restSek}
          abgefahren={abgefahren}
          varianten={varianten}
          hinweis={vorschlag !== null}
          onVariante={waehleVariante}
          onNavigation={() => setBildschirm('navigation')}
          onStoerung={() => setBildschirm('stoerung')}
        />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          hinweis={vorschlag !== null}
          onWechsel={setBildschirm}
        />
      </main>
    )
  }

  if (bildschirm === 'navigation' && route && werte) {
    const position = aktiverSchritt(route.schritte, startZeit, jetzt, versatz)
    return (
      <main className="app">
      {meldung}
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
        {!zielKoordinate(route) && (
          <button type="button" className="knopf-sekundaer" onClick={bestaetigeAnkunft}>
            Ich bin da
          </button>
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
          hinweis={false}
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
      <Eingabe laden={laden} fehler={fehler} erkannt={erkannt} onBerechnen={berechne} />
      <Fusszeile />
        <Navileiste
          aktuell={bildschirm}
          hatRoute={route !== null}
          hinweis={false}
          onWechsel={setBildschirm}
        />
    </main>
  )
}

export default App
