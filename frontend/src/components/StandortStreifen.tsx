interface StandortStreifenProps {
  gleis: string
  onBestaetigen: () => void
}

// Die Ankunft wird VORGESCHLAGEN, nie erzwungen: Die Erkennung vergleicht
// horizontale Distanz und kann in der Unterfuehrung unter dem Zielbahnsteig
// anschlagen. Deshalb bleibt die Schrittliste stehen, bis der Nutzer tippt.
export function StandortStreifen({ gleis, onBestaetigen }: StandortStreifenProps) {
  return (
    <div className="hinweis-box" role="status">
      <p style={{ margin: '0 0 8px' }}>Bist du an Gleis {gleis} angekommen?</p>
      <button type="button" className="knopf-sekundaer" onClick={onBestaetigen}>
        Ja, ich bin da
      </button>
    </div>
  )
}
