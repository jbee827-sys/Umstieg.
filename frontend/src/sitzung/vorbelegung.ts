import { ortAusBahnhof } from '../ort/ortmodell'
import { lies as liesEntwurf, schreibe as schreibeEntwurf, type EingabeEntwurf } from './eingabespeicher'

/**
 * Von einer Bahnhofsseite in die App (Konzept Nutzergewinnung 5c.1).
 *
 * Der Knopf „Weg für meinen Umstieg anzeigen" fuehrt auf
 * /eingabe?bahnhof=<eva>&name=…&lat=…&lon=… (bahnhofsseiten/seiten.tsx).
 * Vor dem ersten Zeichnen (main.tsx) wird daraus ein Entwurf - die Eingabe
 * liest ihn wie nach einem Neuladen, App und Eingabe bleiben unberuehrt.
 * Name und Lage reisen mit, damit der Ort ohne Nachschlagen steht.
 *
 * Danach verschwindet die Abfrage aus der Adresse (replaceState): Sie soll
 * weder im Verlauf noch in einem geteilten Link stehen bleiben. Die
 * Messung sieht sie ohnehin nicht (analytik/ereignis.ts, ohneAbfrage).
 */
const EVA = /^\d{6,9}$/
const MAX_NAME = 120

export function uebernimmBahnhofAusAdresse(): void {
  if (window.location.pathname !== '/eingabe') return
  const abfrage = new URLSearchParams(window.location.search)
  if (!abfrage.has('bahnhof')) return
  window.history.replaceState(window.history.state, '', '/eingabe')

  // Was in der Adresse steht, hat jeder in der Hand - nur Stimmiges zaehlt.
  const eva = abfrage.get('bahnhof') ?? ''
  const name = (abfrage.get('name') ?? '').trim()
  const lat = Number(abfrage.get('lat'))
  const lon = Number(abfrage.get('lon'))
  if (!EVA.test(eva) || name === '' || name.length > MAX_NAME) return
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return
  if (abfrage.get('lat') === null || abfrage.get('lon') === null) return

  // Ein neuer Bahnhof heisst neue Gleise und Zuege; nur das Gehtempo ist
  // eine Vorliebe des Menschen, nicht der Reise.
  const vorher = liesEntwurf()
  const entwurf: EingabeEntwurf = {
    suchtext: name,
    gewaehlt: ortAusBahnhof({ name, eva, lat, lon }),
    anschlussText: '',
    anschlussOrt: null,
    evaManuell: '',
    gleisAn: '',
    gleisAb: '',
    wagenAn: '',
    wagenAb: '',
    profil: vorher?.profil ?? 'normal',
    zugAnkunft: null,
    zugAbfahrt: null,
    fahrtAnkunft: null,
    fahrtAbfahrt: null,
  }
  schreibeEntwurf(entwurf)
}
