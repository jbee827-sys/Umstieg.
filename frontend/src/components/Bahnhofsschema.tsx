import type { Schritt } from '../api/typen'

interface BahnhofsschemaProps {
  schritte: Schritt[]
  aktiv: number
  bahnhofName: string
}

const ZEILE_H = 44
const RAND = 16

// Prinzipskizze fuer Stufe 3. Bewusst KEINE Landkarte: Die Geometrie im
// Bahnhof ist dort geschaetzt, und echte Kacheln darunter wuerden eine
// Vermessung behaupten, die nicht stattgefunden hat. Ein Schema behauptet sie
// nicht – und MapLibre (940 kB) wird gar nicht erst geladen.
export function Bahnhofsschema({ schritte, aktiv, bahnhofName }: BahnhofsschemaProps) {
  const hoehe = RAND * 2 + Math.max(schritte.length, 1) * ZEILE_H
  return (
    <section className="schema-bereich">
      <div className="hinweis-box">
        {bahnhofName} · Schema, keine Karte – die Abstände sind geschätzt.
      </div>
      <svg
        className="schema-flaeche"
        viewBox={`0 0 320 ${hoehe}`}
        role="img"
        aria-label={`Schematische Darstellung des Wegs in ${bahnhofName}`}
      >
        {schritte.map((schritt, i) => {
          const y = RAND + i * ZEILE_H + ZEILE_H / 2
          const istAktiv = i === aktiv
          return (
            <g key={`${i}-${schritt.text}`} opacity={i < aktiv ? 0.4 : 1}>
              <line
                x1={40}
                y1={y}
                x2={280}
                y2={y}
                stroke={istAktiv ? 'var(--color-accent)' : 'var(--color-neutral-500)'}
                strokeWidth={istAktiv ? 6 : 3}
                strokeLinecap="round"
              />
              {i < schritte.length - 1 && (
                <line
                  x1={160}
                  y1={y}
                  x2={160}
                  y2={y + ZEILE_H}
                  stroke="var(--color-neutral-500)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}
              <text x={8} y={y + 5} fontSize={13} fill="var(--color-text)">
                {i + 1}
              </text>
              {schritt.level !== undefined && (
                <text x={288} y={y + 5} fontSize={11} fill="var(--color-neutral-600)">
                  {schritt.level > 0 ? `+${schritt.level}` : schritt.level}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </section>
  )
}
