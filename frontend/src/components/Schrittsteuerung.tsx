interface SchrittsteuerungProps {
  position: number
  anzahl: number
  onZurueck: () => void
  onWeiter: () => void
}

// Grosse Flaechen statt Wischgesten: Wer mit Koffer in der einen und Handy in
// der anderen Hand laeuft, kann nicht wischen (Konzept Abschnitt 9).
export function Schrittsteuerung({ position, anzahl, onZurueck, onWeiter }: SchrittsteuerungProps) {
  return (
    <div className="schrittsteuerung">
      <button
        type="button"
        className="knopf-sekundaer"
        onClick={onZurueck}
        disabled={position <= 0}
      >
        Zurück
      </button>
      <span className="schritt-zaehler" role="status">
        Schritt {position + 1} von {anzahl}
      </span>
      <button
        type="button"
        className="knopf-sekundaer"
        onClick={onWeiter}
        disabled={position >= anzahl - 1}
      >
        Weiter
      </button>
    </div>
  )
}
