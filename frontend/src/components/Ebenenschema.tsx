import type { SchemaModell } from '../schema/ableitung'

interface EbenenschemaProps {
  modell: SchemaModell
  bahnhofName: string
}

const BAND_H = 62
const ABSTAND = 16
const BREITE = 320
const RAND = 12

const WECHSEL_TEXT: Record<string, string> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  aufzug: 'Aufzug',
  rampe: 'Rampe',
}

// Ebenenschema nach Screen 3 des Entwurfs. Bewusst KEINE Landkarte: Der
// Entwurf kennt keine Kartenbibliothek, und eine Strassenkarte hilft in einer
// geschlossenen Halle nicht. Massstabsfrei - die Baender sagen nichts ueber
// Entfernungen aus, nur ueber die Abfolge der Ebenen.
export function Ebenenschema({ modell, bahnhofName }: EbenenschemaProps) {
  const hoehe = RAND * 2 + modell.baender.length * (BAND_H + ABSTAND)
  return (
    <section className="schema-bereich">
      <svg
        className="schema-flaeche"
        viewBox={`0 0 ${BREITE} ${hoehe}`}
        role="img"
        aria-label={`Ebenenschema von ${bahnhofName}: ${modell.baender
          .map((b) => `${b.label}${b.gleise.length ? `, Gleis ${b.gleise.join(' und ')}` : ''}`)
          .join('; ')}`}
      >
        {modell.baender.map((band, i) => {
          const y = RAND + i * (BAND_H + ABSTAND)
          return (
            <g key={band.level}>
              <rect
                x={RAND}
                y={y}
                width={BREITE - RAND * 2}
                height={BAND_H}
                rx={10}
                fill={band.aktiv ? 'var(--color-accent)' : 'var(--color-neutral-200, #e5e2e2)'}
                stroke="var(--color-text)"
                strokeWidth={band.aktiv ? 0 : 1}
              />
              <text
                x={RAND + 12}
                y={y + 22}
                fontSize={10}
                letterSpacing="1.4"
                fill={band.aktiv ? 'var(--color-bg)' : 'var(--color-neutral-600, #6b6767)'}
              >
                {band.label}
              </text>
              {band.gleise.map((gleis, k) => (
                <g key={gleis}>
                  <rect
                    x={RAND + 12 + k * 54}
                    y={y + 30}
                    width={46}
                    height={22}
                    rx={6}
                    fill={band.aktiv ? 'var(--color-bg)' : 'var(--color-text)'}
                  />
                  <text
                    x={RAND + 12 + k * 54 + 23}
                    y={y + 46}
                    fontSize={13}
                    fontWeight="700"
                    textAnchor="middle"
                    fill={band.aktiv ? 'var(--color-text)' : 'var(--color-bg)'}
                  >
                    {gleis}
                  </text>
                </g>
              ))}
            </g>
          )
        })}
        {modell.baender.slice(0, -1).map((band, i) => {
          const y = RAND + i * (BAND_H + ABSTAND) + BAND_H
          const wechsel = modell.wechsel.find(
            (w) =>
              (w.vonLevel === band.level && w.nachLevel === modell.baender[i + 1]?.level) ||
              (w.nachLevel === band.level && w.vonLevel === modell.baender[i + 1]?.level),
          )
          return (
            <g key={`w${band.level}`}>
              <line
                x1={BREITE / 2}
                y1={y}
                x2={BREITE / 2}
                y2={y + ABSTAND}
                stroke="var(--color-text)"
                strokeWidth={2}
                strokeDasharray={wechsel ? undefined : '3 3'}
              />
              {wechsel && (
                <text
                  x={BREITE / 2 + 8}
                  y={y + ABSTAND - 3}
                  fontSize={10}
                  fill="var(--color-neutral-600, #6b6767)"
                >
                  {WECHSEL_TEXT[wechsel.typ] ?? wechsel.typ}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="schema-hinweis">
        {bahnhofName} · Schema, keine Karte – die Abstände sind nicht maßstäblich.
      </p>
    </section>
  )
}
