import { lazy, Suspense, type ReactNode } from 'react'
import { Ebenenschema } from '../components/Ebenenschema'
import { Schrittsheet } from '../components/Schrittsheet'
import { leiteSchemaAb } from '../schema/ableitung'
import { baueBandmodell } from '../schema/bandmodell'
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
}: NavigationProps) {
  // Die echte Geometrie, wenn die Antwort sie traegt - sonst das grobe Bild
  // aus den Schritttexten. Beides wird gebaut: `leiteSchemaAb` ist billig,
  // und der Rueckfall muss dastehen, bevor er gebraucht wird.
  const bandmodell = baueBandmodell(route.schema, route.schritte, position)
  const grob = leiteSchemaAb(route.schritte, position, gleisAn, gleisAb)
  return (
    <>
      <Ebenenschema modell={bandmodell} ersatz={grob} bahnhofName={bahnhofName} />

      <Schrittsheet
        schritte={route.schritte}
        position={position}
        onZurueck={onZurueck}
        onWeiter={onWeiter}
        onAngekommen={onAngekommen}
        zusatz={
          <>
            {route.stufe !== 3 && route.karte && (
              <details className="karte-aufklappbar">
                <summary>Echte Karte anzeigen</summary>
                <Suspense fallback={<div className="lade-hinweis">Karte wird geladen …</div>}>
                  <Karte
                    karte={route.karte}
                    standort={standort}
                    aktiverSchritt={route.schritte[position] ?? null}
                  />
                </Suspense>
              </details>
            )}
            {zusatz}
          </>
        }
      />
    </>
  )
}
