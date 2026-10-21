// Impressum und Datenschutz muessen von jeder Seite aus mit einem Schritt
// erreichbar sein ("unmittelbar erreichbar", § 5 DDG) – deshalb steht die
// Fusszeile in beiden Ansichten, nicht nur auf dem Eingabeschirm.
//
// Quellcode (§ 13 AGPL), Bahnhofsliste, Transitous und die uebrigen Quellen
// stehen seit dem 21.10.2026 zusammen unter „Daten“ (Julian) - von jeder
// Seite mit einem Schritt erreichbar.
//
// Seit dem 21.10.2026 haben Impressum und Datenschutz eigene Adressen
// (Konzept Nutzergewinnung AP 3). Ein Klick bleibt in der App (pushState);
// ohne JavaScript - etwa auf den vorgerenderten Seiten - ist es ein
// gewoehnlicher Link.
import type { MouseEvent } from 'react'
import { RECHTSPFAD, oeffneRechtsseite, type Rechtsseite } from '../navigation/rechtsseiten'

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
      <a href={RECHTSPFAD.daten} onClick={inDerApp('daten')}>
        Daten
      </a>
    </footer>
  )
}
