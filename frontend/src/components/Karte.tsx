import { useEffect, useMemo, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
// MapLibre 6 setzt die Worker-Adresse zur Laufzeit aus `import.meta.url` und
// einem variablen Dateinamen zusammen. Das erkennt kein Bundler: Die Datei
// wurde nie ausgeliefert, der Browser bekam fuer
// `/assets/maplibre-gl-worker.mjs` die index.html (SPA-Rueckfall), der Worker
// starb lautlos - und KEINE GeoJSON-Quelle lud: keine Weglinie, kein Start,
// kein Ziel, kein Standort, seit dem 25.08.2026 (Browserpruefung 18.10.2026).
// `?worker&url` laesst Vite den Worker samt Abhaengigkeiten buendeln.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Schritt } from '../api/typen'
import { genauigkeitsPolygon } from '../standort/distanz'
import { GENAUIGKEIT_MAX_M } from '../standort/schwellen'
import type { Standort } from '../standort/typen'

interface GeoFeature {
  type: 'Feature'
  geometry: { type: 'LineString' | 'Point'; coordinates: number[] | number[][] }
  properties: Record<string, unknown>
}

interface FeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

interface KarteProps {
  /** GeoJSON-FeatureCollections je Ebene (Schlüssel = level), aus /api/route */
  karte: Record<string, unknown>
  /** Aktueller Geraetestandort; null = keiner verfuegbar. */
  standort?: Standort | null
  /** Aktiver Schritt – bestimmt Ebene und Ausschnitt. */
  aktiverSchritt?: Schritt | null
  /** Offen beginnen - im Haltestellenpfad ist die Karte das Hauptbild. */
  anfangsOffen?: boolean
}

const LEER: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Naeher geht die Karte nicht heran - Begruendung beim Erzeugen der Karte. */
const MAX_ZOOM = 18

function ebenenLabel(ebene: string): string {
  const n = Number(ebene)
  if (n === -1) return 'Unterführung (−1)'
  if (n === 0) return 'Ebene 0'
  return n > 0 ? `Ebene +${n}` : `Ebene ${n}`
}

/** Alle [lon, lat]-Koordinaten einer FeatureCollection. */
function alleKoordinaten(sammlung: FeatureCollection): [number, number][] {
  const punkte: [number, number][] = []
  for (const feature of sammlung.features) {
    if (feature.geometry.type === 'Point') {
      punkte.push(feature.geometry.coordinates as [number, number])
    } else {
      for (const koord of feature.geometry.coordinates as number[][]) {
        punkte.push(koord as [number, number])
      }
    }
  }
  return punkte
}

// Einklappbare Karte (Text vor Karte, Konzept): MapLibre über OSM-Rasterkacheln
// mit ODbL-Attribution, Routenlinie + Start-/Zielmarker je Ebene, Umschalter.
export function Karte({ karte, standort, aktiverSchritt, anfangsOffen = false }: KarteProps) {
  const [offen, setOffen] = useState(anfangsOffen)
  const ebenen = useMemo(
    () => Object.keys(karte).sort((a, b) => Number(a) - Number(b)),
    [karte],
  )
  const [ebene, setEbene] = useState(() => (ebenen.includes('0') ? '0' : (ebenen[0] ?? '0')))
  const behaelter = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  // Die Ebene zum Zeitpunkt des Ladens, nicht die beim Aufbau: Offen
  // gestartet (Haltestellenpfad) wechselt die Ebene auf die des aktiven
  // Schritts, BEVOR die Karte geladen ist - und `load` las bis zum 18.10.2026
  // die alte, waehrend der Knopf schon die neue zeigte.
  const ebeneRef = useRef(ebene)
  useEffect(() => {
    ebeneRef.current = ebene
  }, [ebene])

  const daten = (e: string): FeatureCollection => (karte[e] as FeatureCollection) ?? LEER

  // GPS kennt kein Stockwerk – der Punkt wird deshalb KEINER Ebene zugeordnet
  // und ist auf allen Ebenen sichtbar. Zu ungenaue Fixes werden verworfen:
  // ein Punkt 200 m daneben ist in einem 400-m-Bahnhof aktiv schaedlich.
  const brauchbar = standort != null && standort.genauigkeitM <= GENAUIGKEIT_MAX_M
  const positionsDaten = (): FeatureCollection =>
    brauchbar && standort
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [genauigkeitsPolygon(standort.lat, standort.lon, standort.genauigkeitM)],
              },
              properties: {},
            } as unknown as GeoFeature,
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [standort.lon, standort.lat] },
              properties: { rolle: 'standort' },
            },
          ],
        }
      : LEER

  // Erst nach `load` passt ein Schritt den Ausschnitt an - davor steht der der ganzen Route.
  const geladen = useRef(false)

  useEffect(() => {
    if (!offen || !behaelter.current) return
    // Gleich beim Erzeugen auf die ganze Route (alle Ebenen, damit der Kontext
    // stimmt). Bis zum 21.10.2026 begann die Karte bei Zoom 0 und flog erst
    // nach dem Laden animiert heran - in einem gedrosselten Tab stand sie
    // Sekunden lang ueber halb Brandenburg (Browserpruefung Eberswalde).
    const punkte = ebenen.flatMap((e) => alleKoordinaten(daten(e)))
    const routengrenzen =
      punkte.length > 0
        ? punkte.reduce((b, p) => b.extend(p), new LngLatBounds(punkte[0], punkte[0]))
        : undefined
    geladen.current = false
    const map = new MapLibreMap({
      container: behaelter.current,
      ...(routengrenzen ? { bounds: routengrenzen, fitBoundsOptions: { padding: 48, maxZoom: 17.5 } } : {}),
      // MapLibre holt 256er-Kacheln eine Stufe tiefer als der Kartenzoom. Bei
      // 19 waren das Kacheln der Stufe 20 - die liefert tile.openstreetmap.org
      // nicht, jeder Schritt endete mit fehlgeschlagenen Abrufen
      // (Browserpruefung 19.10.2026). Bei 18 sind es hoechstens Stufe 19.
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: false },
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende (ODbL)',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    })

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: daten(ebeneRef.current) })
      map.addLayer({
        id: 'route-linie',
        type: 'line',
        source: 'route',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ec3013', 'line-width': 6, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'route-punkte',
        type: 'circle',
        source: 'route',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 9,
          'circle-color': [
            'match',
            ['get', 'rolle'],
            'start',
            '#201e1d',
            'ziel',
            '#ec3013',
            '#9b9797',
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#f8f4f4',
        },
      })

      map.addSource('position', { type: 'geojson', data: positionsDaten() })
      map.addLayer({
        id: 'position-kreis',
        type: 'fill',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2f6fd0', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'position-punkt',
        type: 'circle',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#2f6fd0',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#f8f4f4',
        },
      })

      geladen.current = true
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Karte nur bei offen (neu) aufbauen
  }, [offen])

  useEffect(() => {
    const quelle = mapRef.current?.getSource('route') as GeoJSONSource | undefined
    quelle?.setData(daten(ebene))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf Ebenenwechsel reagieren
  }, [ebene])

  useEffect(() => {
    const quelle = mapRef.current?.getSource('position') as GeoJSONSource | undefined
    quelle?.setData(positionsDaten())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf Standortwechsel reagieren
  }, [standort])

  // Die Ebene des aktiven Schritts uebernehmen – aber nur, solange der Nutzer
  // nicht selbst umgeschaltet hat. Sonst waere die Handbedienung wirkungslos,
  // und die Karte spraenge dem Nutzer unter den Fingern weg.
  const manuellGewaehlt = useRef(false)
  useEffect(() => {
    if (manuellGewaehlt.current) return
    const level = aktiverSchritt?.level
    if (level === undefined) return
    const schluessel = String(level)
    if (ebenen.includes(schluessel)) setEbene(schluessel)
  }, [aktiverSchritt, ebenen])

  // Ausschnitt auf das Teilstueck des aktiven Schritts. Auf 390 px ist das der
  // Unterschied zwischen lesbar und nicht: Eine 400-m-Route als Ganzes zu
  // zeigen heisst, nichts davon zu zeigen.
  useEffect(() => {
    const map = mapRef.current
    const von = aktiverSchritt?.knotenVon
    const bis = aktiverSchritt?.knotenBis
    if (!map || !geladen.current || von === undefined || bis === undefined) return
    const linie = alleKoordinaten(daten(ebene))
    const stueck = linie.slice(von, bis + 1)
    if (stueck.length === 0) return
    const grenzen = stueck.reduce((b, p) => b.extend(p), new LngLatBounds(stueck[0], stueck[0]))
    map.fitBounds(grenzen, { padding: 64, maxZoom: MAX_ZOOM })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf Schrittwechsel reagieren
  }, [aktiverSchritt, ebene])

  if (ebenen.length === 0) return null

  return (
    <section className="karte-bereich">
      <button
        type="button"
        className="knopf-sekundaer"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        {offen ? 'Karte ausblenden' : 'Karte anzeigen'}
      </button>
      {offen && (
        <div className="karte-rahmen">
          {standort && !brauchbar && (
            <div className="hinweis-box">
              Standort zu ungenau (± {Math.round(standort.genauigkeitM)} m) – Punkt ausgeblendet.
            </div>
          )}
          {brauchbar && (
            <div className="hinweis-box">Blauer Punkt: dein Standort · Ebene unbekannt</div>
          )}
          <div className="karte-ebenen" role="group" aria-label="Ebene wählen">
            {ebenen.map((e) => (
              <button
                key={e}
                type="button"
                className="karte-ebene-knopf"
                aria-pressed={ebene === e}
                onClick={() => {
                  manuellGewaehlt.current = true
                  setEbene(e)
                }}
              >
                {ebenenLabel(e)}
              </button>
            ))}
          </div>
          <div ref={behaelter} className="karte-flaeche" aria-label="Karte des Umstiegswegs" />
        </div>
      )}
    </section>
  )
}
