import { track, type BeforeSendEvent } from '@vercel/analytics'
import { vorfuehrungLaeuft } from '../einfuehrung/zustand'

/**
 * Die vier Messpunkte aus BRIEF.md 3 (Konzept Nutzergewinnung AP 4).
 *
 * Drei davon sieht die Messung schon als Seitenaufruf (/uebersicht, /weg,
 * /angekommen). Als Ereignis kommen sie zusaetzlich, damit auch Schritt 1
 * zaehlbar ist - abrufbar sind eigene Ereignisse erst im Pro-Tarif von
 * Vercel; gesendet werden sie trotzdem, damit die Zahlen bei einem
 * Tarifwechsel sofort da sind (Konzept Abschnitt 7).
 */
export type Messpunkt = 'eingabe-fertig' | 'navigation-start' | 'schritt-1' | 'ziel'

/**
 * Sendet NUR den Namen des Ereignisses. Keine Eigenschaften: kein Bahnhof,
 * kein Gleis, keine Uhrzeit, kein Standort - so sagt es die
 * Datenschutzerklaerung, und analytik/messpunkte.test.ts haelt es fest.
 */
export function melde(name: Messpunkt): void {
  // Die Einführungstour fährt eine Beispielreise durch - sie ist keine Reise
  // und gehört nicht in die Zahlen.
  if (vorfuehrungLaeuft()) return
  try {
    track(name)
  } catch {
    // Die Messung darf die App nie stoeren.
  }
}

/**
 * Was die Reichweitenmessung sehen darf.
 *
 * Vercel Web Analytics sendet je Seitenaufruf die aufgerufene Adresse. Heute
 * trägt keine Adresse dieser App eine Abfragezeichenkette – die gerundete
 * Koordinate der Bahnhofssuche geht an die API, nicht in die URL des
 * Frontends. Diese Funktion sorgt dafür, dass das auch dann noch gilt, wenn
 * jemand später einen Parameter einbaut, ohne an die Messung zu denken.
 *
 * Genau dieser Fall ist im Backend schon einmal eingetreten: Fastifys
 * Anfrageprotokoll trug `url`, und die URL der Bahnhofssuche IST die
 * Koordinate (siehe `backend/src/app.ts`). Dort wurde daraufhin das
 * Routen*muster* protokolliert statt der Adresse. Hier ist die Entsprechung,
 * dass die Abfragezeichenkette gar nicht erst mitgeht.
 *
 * Der Hash bleibt; er trägt keine Angaben. (Bis zum 21.10.2026 unterschied
 * er die Rechtsseiten - seitdem haben sie eigene Pfade, `/impressum` und
 * `/datenschutz`, siehe navigation/rechtsseiten.ts.)
 *
 * `null` bedeutet „nicht senden". Eine unlesbare Adresse ist kein Grund,
 * etwas Ungeprüftes zu senden – und eine Einführungstour ist kein Besuch.
 */
export function ohneAbfrage(ereignis: BeforeSendEvent): BeforeSendEvent | null {
  // Während der Einführungstour wechselt die App auf /uebersicht und /weg,
  // ohne dass jemand reist - diese Seitenaufrufe gehen nicht hinaus.
  if (vorfuehrungLaeuft()) return null
  try {
    const adresse = new URL(ereignis.url)
    adresse.search = ''
    return { ...ereignis, url: adresse.toString() }
  } catch {
    return null
  }
}
