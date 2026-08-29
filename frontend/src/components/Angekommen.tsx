interface AngekommenProps {
  gleis: string
  onNeu: () => void
}

export function Angekommen({ gleis, onNeu }: AngekommenProps) {
  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Angekommen</h1>
        <p>Du bist an Gleis {gleis}. Gute Weiterfahrt.</p>
      </header>
      <hr className="trennlinie" />
      <button type="button" className="knopf-primaer" onClick={onNeu}>
        <span>Neue Eingabe</span>
      </button>
    </main>
  )
}
