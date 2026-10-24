import { LocalNotifications } from '@capacitor/local-notifications'
import type { Ampelfarbe, LiveEreignis } from '../api/typen'
import { meldungsText } from '../navigation/meldung'
import { istApp } from './istApp'

/**
 * Lokale Mitteilungen der App (Plan App Store, Paket 6) - der wichtigste
 * Mehrwert gegenüber der Website.
 *
 * Lokal, nicht vom Server: Sie entstehen aus den Live-Daten, die die App
 * ohnehin hat. Das trägt, solange die App offen oder kurz im Hintergrund
 * ist; danach hält iOS sie an, und nur die vorab geplante Erinnerung kommt
 * noch. Server-Mitteilungen wären ein eigenes, späteres Paket.
 *
 * Gefragt wird erst, wenn eine Reise läuft - nie beim Start. Ohne Erlaubnis
 * geht alles wie vorher (Richtlinie 4.5.4): Die Meldungen stehen in der App.
 */

/** Die eine geplante Erinnerung je Reise; Sofortmeldungen zählen ab 100. */
const ERINNERUNG_ID = 1
let naechsteId = 100

/** Vorlauf der Erinnerung vor der Ankunft. */
export const ERINNERUNG_VORLAUF_MS = 5 * 60_000

async function erlaubt(): Promise<boolean> {
  let { display } = await LocalNotifications.checkPermissions()
  if (display === 'prompt' || display === 'prompt-with-rationale') {
    ;({ display } = await LocalNotifications.requestPermissions())
  }
  return display === 'granted'
}

/**
 * Erst bei laufender Reise aufrufen: Fragt einmal nach der Erlaubnis. Wer
 * schon geantwortet hat, sieht nichts.
 */
export function bereiteMitteilungenVor(): void {
  if (!istApp()) return
  erlaubt().catch(() => undefined)
}

/**
 * Sofort, aber nur, wenn die App nicht zu sehen ist - im Vordergrund steht
 * dieselbe Nachricht schon als Störmeldung in der App, und ein Banner
 * darüber wäre doppelt.
 */
function teileMit(titel: string, text: string): void {
  if (!istApp() || document.visibilityState === 'visible') return
  erlaubt()
    .then((ja) => {
      if (!ja) return
      return LocalNotifications.schedule({ notifications: [{ id: naechsteId++, title: titel, body: text }] })
    })
    .catch(() => undefined)
}

/** Was vom Live-Strom eine Mitteilung wert ist: der ANSCHLUSS bekommt ein neues Gleis oder fällt aus. */
export function istMitteilenswert(ereignis: LiveEreignis): boolean {
  return ereignis.seite === 'ab' && (ereignis.typ === 'gleiswechsel' || ereignis.typ === 'ausfall')
}

export function teileEreignisMit(ereignis: LiveEreignis): void {
  if (!istMitteilenswert(ereignis)) return
  const { titel, text } = meldungsText(ereignis)
  teileMit(titel, text)
}

/** Die Ampel springt auf Rot - nicht, wenn sie schon rot war oder gerade erst steht. */
export function wirdRot(vorher: Ampelfarbe | null, jetzt: Ampelfarbe | null): boolean {
  return jetzt === 'rot' && (vorher === 'gruen' || vorher === 'gelb')
}

export function teileGefaehrdungMit(gleisAb: string): void {
  teileMit(
    'Anschluss gefährdet',
    `Bis zur Abfahrt bleibt weniger Zeit, als dein Weg zu Gleis ${gleisAb} dauert.`,
  )
}

export interface Erinnerung {
  ankunft: Date
  bahnhofName: string
  gleisAb: string
  zugAbName?: string
}

export function erinnerungsText({ bahnhofName, gleisAb, zugAbName }: Erinnerung): string {
  const anschluss = zugAbName ? `${zugAbName} fährt` : 'dein Anschluss fährt'
  return `In 5 Minuten kommst du in ${bahnhofName} an – ${anschluss} von Gleis ${gleisAb}.`
}

/** Wann erinnert wird - `null`, wenn der Zeitpunkt schon vorbei ist. */
export function erinnerungAm(ankunft: Date, jetzt: number = Date.now()): Date | null {
  const am = ankunft.getTime() - ERINNERUNG_VORLAUF_MS
  return am > jetzt + 30_000 ? new Date(am) : null
}

/**
 * Plant die Erinnerung vor der Ankunft neu - sie kommt auch, wenn iOS die
 * App längst angehalten hat. Eine ältere fällt dabei weg.
 */
export function planeErinnerung(erinnerung: Erinnerung): void {
  if (!istApp()) return
  const am = erinnerungAm(erinnerung.ankunft)
  LocalNotifications.cancel({ notifications: [{ id: ERINNERUNG_ID }] })
    .then(async () => {
      if (!am || !(await erlaubt())) return
      await LocalNotifications.schedule({
        notifications: [
          { id: ERINNERUNG_ID, title: 'Gleich umsteigen', body: erinnerungsText(erinnerung), schedule: { at: am } },
        ],
      })
    })
    .catch(() => undefined)
}

export function vergissErinnerung(): void {
  if (!istApp()) return
  LocalNotifications.cancel({ notifications: [{ id: ERINNERUNG_ID }] }).catch(() => undefined)
}
