import { renderToStaticMarkup } from 'react-dom/server'
import { Datenschutz } from '../components/Datenschutz'
import { Impressum } from '../components/Impressum'
import { RECHTSPFAD, type Rechtsseite } from '../navigation/rechtsseiten'
import { setzeKopf, setzeWurzel } from './kopf'

const TITEL: Record<Rechtsseite, string> = {
  impressum: 'Impressum | Umstieg.',
  datenschutz: 'Datenschutz | Umstieg.',
}

/**
 * Impressum oder Datenschutz als fertige Seite (Konzept Nutzergewinnung,
 * AP 3.4) - auf Grundlage der GEBAUTEN index.html, also mit Stil und Skript
 * der App: Ohne JavaScript ist der Text lesbar, mit JavaScript startet die
 * App auf derselben Adresse und zeigt dieselbe Seite.
 *
 * Ohne `onZurueck` setzen die Komponenten einen Link statt des Knopfs - ein
 * Knopf taete ohne JavaScript nichts.
 */
export function rechtsseiteHtml(vorlage: string, seite: Rechtsseite): string {
  const inhalt = renderToStaticMarkup(seite === 'impressum' ? <Impressum /> : <Datenschutz />)
  return setzeWurzel(setzeKopf(vorlage, { titel: TITEL[seite], pfad: RECHTSPFAD[seite] }), inhalt)
}
