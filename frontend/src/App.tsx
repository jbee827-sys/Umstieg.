import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import './App.css'
import { holeRoute, RouteFehler } from './api/client'
import { verbindeLive } from './api/sse'
import type { LiveEreignis, RouteErgebnis } from './api/typen'
import { Ampel } from './components/Ampel'
import { Eingabe, type EingabeWerte } from './components/Eingabe'
import { LiveBanner } from './components/LiveBanner'
import { Schrittliste } from './components/Schrittliste'

// MapLibre ist groß und die Karte standardmäßig eingeklappt → erst bei Bedarf laden.
const Karte = lazy(() => import('./components/Karte').then((m) => ({ default: m.Karte })))

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

/** Ampel relativ zur Gehzeit (identische Formel wie backend gehzeit.ts). */
function ampelFarbe(restSek: number, gehzeitSek: number): 'gruen' | 'gelb' | 'rot' {
  if (restSek < gehzeitSek || restSek < 0) return 'rot'
  if (restSek >= 2 * gehzeitSek) return 'gruen'
  return 'gelb'
}

function App() {
  const [ansicht, setAnsicht] = useState<'eingabe' | 'route'>('eingabe')
  // Route bleibt nach Berechnung vollständig im Speicher – die Anzeige
  // funktioniert auch, wenn die Verbindung im Bahnhof abreißt (Konzept).
  const [route, setRoute] = useState<RouteErgebnis | null>(null)
  const [werte, setWerte] = useState<EingabeWerte | null>(null)
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [liveEreignis, setLiveEreignis] = useState<LiveEreignis | null>(null)
  const [stand, setStand] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Live-Countdown: mit bekannter Abfahrtszeit alle 10 s neu rendern
  useEffect(() => {
    if (ansicht !== 'route' || !werte?.abfahrtZeit) return
    const timer = window.setInterval(() => setTick((t) => t + 1), 10000)
    return () => window.clearInterval(timer)
  }, [ansicht, werte?.abfahrtZeit])

  const berechne = useCallback(async (eingabe: EingabeWerte) => {
    setLaden(true)
    setFehler(null)
    try {
      const ergebnis = await holeRoute({
        eva: eingabe.eva,
        gleisAn: eingabe.gleisAn,
        gleisAb: eingabe.gleisAb,
        profil: eingabe.profil,
        variante: eingabe.variante,
        zugAn: eingabe.zugAn,
        wagen: eingabe.wagen || undefined,
      })
      setWerte(eingabe)
      setRoute(ergebnis)
      setAnsicht('route')
    } catch (e) {
      const code = e instanceof RouteFehler ? e.code : 'netz'
      const detail = e instanceof RouteFehler ? e.message : undefined
      setFehler(FEHLER_TEXTE[code] ?? detail ?? 'Unbekannter Fehler.')
    } finally {
      setLaden(false)
    }
  }, [])

  // Live-Überwachung nur in der Routenansicht. Ein Gleiswechsel ändert die
  // Eingabewerte und stößt die Neuberechnung an – die Route zeigt sofort den
  // neuen Weg, statt still falsch zu bleiben (Konzept 7).
  useEffect(() => {
    if (ansicht !== 'route' || !werte?.eva) return
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
        if (ereignis.typ !== 'gleiswechsel' || !ereignis.neu) return
        navigator.vibrate?.([200, 100, 200])
        const betrifftAnkunft = ereignis.zug === werte.zugAnName
        void berechne({
          ...werte,
          gleisAn: betrifftAnkunft ? ereignis.neu : werte.gleisAn,
          gleisAb: betrifftAnkunft ? werte.gleisAb : ereignis.neu,
        })
      },
    })
  }, [ansicht, werte, berechne])

  if (ansicht === 'route' && route && werte) {
    const restSek = werte.abfahrtZeit
      ? (heuteUm(werte.abfahrtZeit).getTime() - Date.now()) / 1000
      : undefined
    const farbe = restSek === undefined ? null : ampelFarbe(restSek, route.gehzeitSek)
    return (
      <main className="app">
        <Ampel farbe={farbe} gehzeitSek={route.gehzeitSek} restSek={restSek} />
        {liveEreignis && (
          <LiveBanner ereignis={liveEreignis} onSchliessen={() => setLiveEreignis(null)} />
        )}
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
        <hr className="trennlinie" />
        <Schrittliste schritte={route.schritte} />
        {route.karte && (
          <Suspense fallback={<div className="lade-hinweis">Karte wird geladen …</div>}>
            <Karte karte={route.karte} />
          </Suspense>
        )}
        {route.hinweise.length > 0 && (
          <ul className="hinweisliste">
            {route.hinweise.map((hinweis) => (
              <li key={hinweis}>{hinweis}</li>
            ))}
          </ul>
        )}
        <button
          className="knopf-sekundaer"
          type="button"
          onClick={() => {
            setAnsicht('eingabe')
            setFehler(null)
          }}
        >
          Neue Eingabe
        </button>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Dein Umstieg</h1>
        <p>Vom Ankunftsgleis zum Anschlusszug – Schritt für Schritt.</p>
      </header>
      <hr className="trennlinie" />
      <Eingabe laden={laden} fehler={fehler} onBerechnen={berechne} />
    </main>
  )
}

export default App
