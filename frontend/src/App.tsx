import { lazy, Suspense, useState } from 'react'
import './App.css'
import { holeRoute, RouteFehler } from './api/client'
import type { RouteErgebnis } from './api/typen'
import { Ampel } from './components/Ampel'
import { Eingabe, type EingabeWerte } from './components/Eingabe'
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

function App() {
  const [ansicht, setAnsicht] = useState<'eingabe' | 'route'>('eingabe')
  // Route bleibt nach Berechnung vollständig im Speicher – die Anzeige
  // funktioniert auch, wenn die Verbindung im Bahnhof abreißt (Konzept).
  const [route, setRoute] = useState<RouteErgebnis | null>(null)
  const [werte, setWerte] = useState<EingabeWerte | null>(null)
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function berechne(eingabe: EingabeWerte) {
    setLaden(true)
    setFehler(null)
    try {
      const ergebnis = await holeRoute({
        eva: eingabe.eva,
        gleisAn: eingabe.gleisAn,
        gleisAb: eingabe.gleisAb,
        profil: eingabe.profil,
        variante: eingabe.variante,
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
  }

  if (ansicht === 'route' && route && werte) {
    return (
      <main className="app">
        <Ampel farbe={null} gehzeitSek={route.gehzeitSek} />
        <div className="routen-kopf">
          <div>
            <div className="kicker">{werte.bahnhofName || 'Umstieg'}</div>
            <h2>
              Gleis {werte.gleisAn} → Gleis {werte.gleisAb}
            </h2>
          </div>
          <span className="stufen-tag">{STUFEN_TEXT[route.stufe]}</span>
        </div>
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
