import { useState, type ReactNode } from 'react'

interface TafelkategorieProps {
  titel: string
  /** Zahl der Zuege oder Fahrten darin - steht im Kopf, auch zugeklappt. */
  anzahl: number
  /** Nur der Anfangszustand; danach entscheidet der Nutzer. */
  anfangsOffen: boolean
  children: ReactNode
}

/**
 * Eine Kategorie der Tafel (Regionalverkehr, Bus ...) zum Aufklappen.
 *
 * Mit allen Kategorien offen war die Tafel zu unuebersichtlich (Julian,
 * 19.10.2026): Wer den Bus sucht, blaetterte an Regionalverkehr und S-Bahn
 * vorbei. Jetzt oeffnet man nur, was man braucht. Die Zeilen entstehen erst
 * beim Aufklappen - eine zugeklappte Kategorie mit vierzig Zuegen kostet
 * nichts.
 *
 * `<details>` statt eigener Knopf-Logik: Tastatur, Screenreader und
 * Zustand „offen/zu“ bringt das Element selbst mit.
 */
export function Tafelkategorie({ titel, anzahl, anfangsOffen, children }: TafelkategorieProps) {
  const [offen, setOffen] = useState(anfangsOffen)
  return (
    <details
      className="tafel-block"
      role="group"
      aria-label={titel}
      open={offen}
      onToggle={(e) => setOffen(e.currentTarget.open)}
    >
      <summary className="tafel-block-kopf">
        <h3 className="tafel-block-titel">{titel}</h3>
        <span className="tafel-block-anzahl">{anzahl}</span>
      </summary>
      {offen && children}
    </details>
  )
}
