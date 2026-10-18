// Impressum und Datenschutz muessen von jeder Seite aus mit einem Schritt
// erreichbar sein ("unmittelbar erreichbar", § 5 DDG) – deshalb steht die
// Fusszeile in beiden Ansichten, nicht nur auf dem Eingabeschirm.
export function Fusszeile() {
  return (
    <footer className="fusszeile">
      <a href="#impressum">Impressum</a>
      <span aria-hidden="true">·</span>
      <a href="#datenschutz">Datenschutz</a>
      {/* F7: Transitous verlangt einen sichtbaren Link auf die Quellenliste -
          auf jeder Seite, nicht erst im Impressum. */}
      <p className="fusszeile-quellen">
        Haltestellendaten:{' '}
        <a href="https://transitous.org/sources" target="_blank" rel="noreferrer noopener">
          Transitous
        </a>{' '}
        · DELFI · © OpenStreetMap-Mitwirkende
      </p>
    </footer>
  )
}
