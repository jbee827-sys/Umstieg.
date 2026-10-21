// Impressum und Datenschutz muessen von jeder Seite aus mit einem Schritt
// erreichbar sein ("unmittelbar erreichbar", § 5 DDG) – deshalb steht die
// Fusszeile in beiden Ansichten, nicht nur auf dem Eingabeschirm.
//
// Der Link zum Quellcode erfuellt § 13 AGPL: Wer die App ueber das Netz
// nutzt, muss den Quellcode der laufenden Fassung erreichen koennen.
//
// Seit dem 21.10.2026 haben Impressum und Datenschutz eigene Adressen
// (Konzept Nutzergewinnung AP 3). Ein Klick bleibt in der App (pushState);
// ohne JavaScript - etwa auf den vorgerenderten Seiten - ist es ein
// gewoehnlicher Link.
import type { MouseEvent } from 'react'
import { RECHTSPFAD, oeffneRechtsseite, type Rechtsseite } from '../navigation/rechtsseiten'

export const QUELLCODE_URL = 'https://github.com/jbee827-sys/Umstieg.'

function inDerApp(seite: Rechtsseite) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    // Strg-, Cmd-, Umschalt- und Mittelklick oeffnen wie ueberall einen
    // neuen Tab oder ein neues Fenster - das bleibt dem Browser.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    oeffneRechtsseite(seite)
  }
}

export function Fusszeile() {
  return (
    <footer className="fusszeile">
      <a href={RECHTSPFAD.impressum} onClick={inDerApp('impressum')}>
        Impressum
      </a>
      <span aria-hidden="true">·</span>
      <a href={RECHTSPFAD.datenschutz} onClick={inDerApp('datenschutz')}>
        Datenschutz
      </a>
      <span aria-hidden="true">·</span>
      {/* Die vorgerenderte Uebersicht - ein gewoehnlicher Seitenwechsel aus
          der App heraus (Konzept Nutzergewinnung 5c.3). */}
      <a href="/bahnhoefe">Bahnhöfe</a>
      <span aria-hidden="true">·</span>
      <a href={QUELLCODE_URL} target="_blank" rel="noopener noreferrer">
        Quellcode
      </a>
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
