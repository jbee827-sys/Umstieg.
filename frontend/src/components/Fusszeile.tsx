// Impressum und Datenschutz muessen von jeder Seite aus mit einem Schritt
// erreichbar sein ("unmittelbar erreichbar", § 5 DDG) – deshalb steht die
// Fusszeile in beiden Ansichten, nicht nur auf dem Eingabeschirm.
//
// Der Link zum Quellcode erfuellt § 13 AGPL: Wer die App ueber das Netz
// nutzt, muss den Quellcode der laufenden Fassung erreichen koennen.
export const QUELLCODE_URL = 'https://github.com/jbee827-sys/Umstieg.'

export function Fusszeile() {
  return (
    <footer className="fusszeile">
      <a href="#impressum">Impressum</a>
      <span aria-hidden="true">·</span>
      <a href="#datenschutz">Datenschutz</a>
      <span aria-hidden="true">·</span>
      <a href={QUELLCODE_URL} target="_blank" rel="noopener noreferrer">
        Quellcode
      </a>
    </footer>
  )
}
