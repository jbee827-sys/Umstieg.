import { lazy, Suspense } from 'react'
import { Ebenenschema } from '../components/Ebenenschema'
import { Schrittsheet } from '../components/Schrittsheet'
import { leiteSchemaAb } from '../schema/ableitung'
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
}

// Screen 3 des Entwurfs: oben das Ebenenschema, unten EIN Schritt.
// Die echte Karte bleibt erreichbar, ist aber nicht mehr die Regelanzeige -
// eine Strassenkarte hilft in einer geschlossenen Halle nicht.
export function Navigation({
  route,
  gleisAn,
  gleisAb,
  bahnhofName,
  position,
  standort,
  onZurueck,
  onWeiter,
}: NavigationProps) {
  const modell = leiteSchemaAb(route.schritte, position, gleisAn, gleisAb)
  return (
    <>
      <Ebenenschema modell={modell} bahnhofName={bahnhofName} />

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

      <Schrittsheet
        schritte={route.schritte}
        position={position}
        onZurueck={onZurueck}
        onWeiter={onWeiter}
      />
    </>
  )
}
