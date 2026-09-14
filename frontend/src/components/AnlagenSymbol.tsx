import type { Symboltyp } from '../schema/symbole'

/**
 * Die drei Anlagensymbole – EINE Quelle für Schema, Legende und Schritte.
 *
 * Im 12er-Raster, als Linie und nicht als Fläche: So tragen sie hell im
 * dunklen Balken wie dunkel neben dem Schritttext. Die Farbe kommt aus
 * `currentColor`, also aus dem Stilblatt.
 *
 *   Rolltreppe  zwei Waagerechte, verbunden durch eine Diagonale unter 45°
 *   Treppe      drei Stufen, steigend nach rechts – gleich breit wie die Rolltreppe
 *   Aufzug      die Kabine, darin ▲ und ▼: Er fährt in beide Richtungen
 */
function Linien({ typ, strich }: { typ: Symboltyp; strich: number }) {
  const linie = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: strich,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (typ === 'rolltreppe') return <path d="M0.8 8.2H3.8L8.2 3.8H11.2" {...linie} />
  if (typ === 'treppe') return <path d="M1 10H3.5V7.5H6V5H8.5V2.5H11" {...linie} />
  return (
    <>
      <rect x={1.8} y={1.2} width={8.4} height={9.6} rx={1.4} {...linie} />
      <path d="M6 2.8L8.1 5.1H3.9Z M6 9.2L8.1 6.9H3.9Z" fill="currentColor" />
    </>
  )
}

interface SymbolProps {
  typ: Symboltyp
  /** Kantenlänge in Pixeln. */
  groesse: number
  /** Strichstärke in Pixeln – unabhängig von der Größe. */
  strich?: number
  className?: string
}

/** Ein Symbol als eigenes SVG, neben Text. */
export function AnlagenSymbol({ typ, groesse, strich = 1.7, className }: SymbolProps) {
  return (
    <svg
      className={`anlagensymbol${className ? ` ${className}` : ''}`}
      data-symbol={typ}
      width={groesse}
      height={groesse}
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <Linien typ={typ} strich={(strich * 12) / groesse} />
    </svg>
  )
}

/** Ein Symbol in einer Zeichnung, mittig auf (x, y). */
export function Glyphe({ typ, groesse, strich = 1.5, className, x, y }: SymbolProps & { x: number; y: number }) {
  const s = groesse / 12
  return (
    <g
      className={className}
      data-symbol={typ}
      transform={`translate(${x - groesse / 2} ${y - groesse / 2}) scale(${s})`}
    >
      <Linien typ={typ} strich={strich / s} />
    </g>
  )
}
