import type { BeforeSendEvent } from '@vercel/analytics'

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
 * etwas Ungeprüftes zu senden.
 */
export function ohneAbfrage(ereignis: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const adresse = new URL(ereignis.url)
    adresse.search = ''
    return { ...ereignis, url: adresse.toString() }
  } catch {
    return null
  }
}
