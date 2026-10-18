import { lazy, Suspense, type ReactNode } from 'react'
import { Ebenenschema } from '../components/Ebenenschema'
import { Schrittsheet } from '../components/Schrittsheet'
import { leiteSchemaAb } from '../schema/ableitung'
import { baueBandmodell, bildVorbehalte } from '../schema/bandmodell'
import type { RouteErgebnis } from '../api/typen'
import type { Standort } from '../standort/typen'

// MapLibre ist gross und die Karte standardmaessig zugeklappt → erst bei Bedarf.
const Karte = lazy(() => import('../components/Karte').then((m) => ({ default: m.Karte })))

interface NavigationProps {
  route: RouteErgebnis
  gleisAn: string
  gleisAb: string
  bahnhofName: string
  position: number
  standort: Standort | null
  onZurueck: () => void
  onWeiter: () => void
  onAngekommen: () => void
  /** Weiteres für den Aufklapper der Schritt-Box, z. B. die Streckenhinweise. */
  zusatz?: ReactNode
  /**
   * Haltestellenpfad (Umstieg 2.0): kein Ebenenschema (Spec 6) - das Bild
   * stuende aus Schritttexten geraten da und hiesse „Gleis A und B“. An
   * seiner Stelle steht die Karte, denn der Weg fuehrt meist draussen.
   */
  pfad?: 'bahnhof' | 'haltestelle'
}

// Screen 3 des Entwurfs: oben das Ebenenschema, unten EIN Schritt.
//
// Der Bildschirm rollt nicht. Das Schema steht in einem festen Bereich, die
// Schritt-Box klebt unten am Rand - bis zum 19.09.2026 musste man zum
// „Weiter" nach unten rollen, und dabei rollte das Bild oben weg.
//
// Die echte Karte bleibt erreichbar, ist aber nicht mehr die Regelanzeige -
// eine Strassenkarte hilft in einer geschlossenen Halle nicht. Sie steht
// deshalb im Aufklapper der Schritt-Box, nicht im festen Bildbereich.
export function Navigation({
  route,
  gleisAn,
  gleisAb,
  bahnhofName,
  position,
  standort,
  onZurueck,
  onWeiter,
  onAngekommen,
  zusatz,
  pfad = 'bahnhof',
}: NavigationProps) {
  // Die echte Geometrie, wenn die Antwort sie traegt - sonst das grobe Bild
  // aus den Schritttexten. Beides wird gebaut: `leiteSchemaAb` ist billig,
  // und der Rueckfall muss dastehen, bevor er gebraucht wird.
  //
  // Das Standardmodell (Stufe 3) traegt seit dem 13.09.2026 ebenfalls ein
  // Schema, aber ohne eine einzige Bahnsteigachse. Als Grundriss gezeichnet
  // behauptet es Lage und Reihenfolge, die niemand gemessen hat - dort gilt
  // das grobe Bild.
  const bandmodell = route.stufe === 3 ? null : baueBandmodell(route.schema, route.schritte, position)
  const grob = leiteSchemaAb(route.schritte, position, gleisAn, gleisAb)
  const halt = pfad === 'haltestelle'
  // Stufe 3 ist hier die Luftlinie - eine Karte darueber zeigte eine
  // gerade Linie quer durch Haeuser.
  const mitKarte = route.stufe !== 3 && Boolean(route.karte)
  const karte = (anfangsOffen: boolean) => (
    <Suspense fallback={<div className="lade-hinweis">Karte wird geladen …</div>}>
      <Karte
        karte={route.karte!}
        standort={standort}
        aktiverSchritt={route.schritte[position] ?? null}
        anfangsOffen={anfangsOffen}
      />
    </Suspense>
  )
  return (
    <>
      {halt ? (
        <section className="schema-bereich haltestellen-bild">
          {mitKarte ? (
            karte(true)
          ) : (
            <p className="hinweis-box">
              Für diesen Weg gibt es keine Karte – er ist nur ungefähr bekannt. Folge den Schritten.
            </p>
          )}
        </section>
      ) : (
        <Ebenenschema modell={bandmodell} ersatz={grob} bahnhofName={bahnhofName} />
      )}

      <Schrittsheet
        schritte={route.schritte}
        position={position}
        onZurueck={onZurueck}
        onWeiter={onWeiter}
        onAngekommen={onAngekommen}
        zusatz={
          <>
            {!halt && mitKarte && (
              <details className="karte-aufklappbar">
                <summary>Echte Karte anzeigen</summary>
                {karte(false)}
              </details>
            )}
            {zusatz}
            {/* ToDo 38: Was das Bild nicht belegt. Zuletzt, weil es sich auf
                der ganzen Route nicht aendert - aber nicht nirgends. */}
            {!halt && (
              <ul className="schema-vorbehalte" aria-label="Zum Bild">
                {bildVorbehalte(bandmodell).map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
          </>
        }
      />
    </>
  )
}
