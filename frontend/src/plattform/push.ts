import { FirebaseMessaging } from './firebase'
import { meldeReiseAb, meldeReiseAn, schickeTestmitteilung, type ReiseAnmeldung } from '../api/mitteilungen'
import type { LiveEreignis } from '../api/typen'
import { vorfuehrungLaeuft } from '../einfuehrung/zustand'
import { istApp } from './istApp'
import { vergissErinnerung } from './mitteilungen'

/**
 * Server-Mitteilungen ueber Firebase (Konzept Mitteilungen 6.2): meldet die
 * laufende Reise beim Server an, der sie dann auch bei gesperrtem Handy
 * ueberwacht.
 *
 * Solange die Anmeldung steht (`pushAktiv()`), schweigen die lokalen
 * Mitteilungen (`mitteilungen.ts`) - sonst kaeme alles doppelt. Scheitert sie
 * (keine Erlaubnis, kein Netz, 429/503), bleibt alles wie vorher: Die lokalen
 * Mitteilungen sind der Rueckfall.
 *
 * Der Server haelt die Wachen nur im Arbeitsspeicher; ein Deploy loescht sie.
 * Deshalb meldet die App die Reise bei jedem Zurueckkommen in den Vordergrund
 * erneut an - das ist idempotent.
 */

/** Hoechstens eine Anmeldung je 10 s - Reiterwechsel sollen nichts ausloesen. */
const DROSSEL_MS = 10_000

let token: string | null = null
let aktiv = false
/** Die Reise, die gerade gilt (auch wenn sie noch nicht angemeldet ist). */
let reise: ReiseAnmeldung | null = null
/** Die zuletzt angemeldete Reise als JSON - gleiche Reise = kein Aufruf. */
let angemeldet: string | null = null
let letzterAufruf = Number.NEGATIVE_INFINITY
let wartet: ReturnType<typeof setTimeout> | null = null
let horcht = false
const zuhoerer = new Set<() => void>()

/** `true`, solange der Server die Reise ueberwacht. */
export function pushAktiv(): boolean {
  return aktiv
}

/**
 * Ob die Erinnerung vor der Ankunft vom Server kommt. Ohne Ankunftszug in
 * der Anmeldung (Zug noch aus dem Reisetext) kennt die Wache keine Ankunft -
 * dann bleibt die lokale Erinnerung.
 */
export function erinnerungVomServer(): boolean {
  return aktiv && !!reise?.an
}

/** Meldet jede Aenderung von `pushAktiv`/`erinnerungVomServer` - die App plant die lokale Erinnerung dann neu. */
export function hoereAufPushStand(f: () => void): () => void {
  zuhoerer.add(f)
  return () => zuhoerer.delete(f)
}

function setzeAktiv(neu: boolean): void {
  const vorher = erinnerungVomServer()
  const warAktiv = aktiv
  aktiv = neu
  if (erinnerungVomServer() && !vorher) vergissErinnerung()
  if (warAktiv !== aktiv || vorher !== erinnerungVomServer()) for (const f of zuhoerer) f()
}

function zustaendig(): boolean {
  return istApp() && !vorfuehrungLaeuft()
}

/** Erlaubnis (fragt einmal, solange noch nicht geantwortet) und Token - `null` ohne. */
async function holeToken(): Promise<string | null> {
  let { receive } = await FirebaseMessaging.checkPermissions()
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ;({ receive } = await FirebaseMessaging.requestPermissions())
  }
  if (receive !== 'granted') return null
  if (!token) token = (await FirebaseMessaging.getToken()).token
  return token
}

function horcheEinmal(): void {
  if (horcht) return
  horcht = true
  // Ein neues Token (iOS vergibt es z. B. nach einer Neuinstallation neu)
  // kennt der Server noch nicht.
  FirebaseMessaging.addListener('tokenReceived', ({ token: neu }) => {
    token = neu
    if (reise) void melde(true)
  }).catch(() => undefined)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && reise) void melde(true)
  })
}

/** `immer`: auch dieselbe Reise und ohne Drossel (Vordergrund, neues Token). */
async function melde(immer: boolean): Promise<void> {
  const jetzt = reise
  if (!jetzt) return
  const json = JSON.stringify(jetzt)
  if (!immer && json === angemeldet) return
  letzterAufruf = Date.now()
  angemeldet = json
  try {
    const t = await holeToken()
    if (!t) {
      angemeldet = null
      return setzeAktiv(false)
    }
    const ergebnis = await meldeReiseAn(t, 'ios', jetzt)
    // Waehrend der Anfrage beendet oder ersetzt: Das Ergebnis gilt nicht mehr.
    if (reise !== jetzt) return
    if (ergebnis !== 'ok') angemeldet = null
    setzeAktiv(ergebnis === 'ok')
  } catch {
    angemeldet = null
    setzeAktiv(false)
  }
}

/**
 * Bei jeder Aenderung der Reise aufrufen. Gedrosselt: Liegt die letzte
 * Anmeldung keine 10 s zurueck, wartet die neue bis dahin. `null` = die
 * Reise laesst sich (nicht mehr) anmelden; eine bestehende Wache endet.
 */
export function meldeAnWennNoetig(neu: ReiseAnmeldung | null): void {
  if (!zustaendig()) return
  if (!neu) {
    if (reise || aktiv) void meldeAbUndVergiss()
    return
  }
  horcheEinmal()
  reise = neu
  if (JSON.stringify(neu) === angemeldet) return
  if (wartet) clearTimeout(wartet)
  const rest = letzterAufruf + DROSSEL_MS - Date.now()
  if (rest <= 0) {
    wartet = null
    void melde(false)
    return
  }
  wartet = setTimeout(() => {
    wartet = null
    void melde(false)
  }, rest)
}

/** Reiseende: Wache beim Server beenden, lokal alles vergessen. */
export async function meldeAbUndVergiss(): Promise<void> {
  if (wartet) clearTimeout(wartet)
  wartet = null
  const warAngemeldet = angemeldet !== null || aktiv
  reise = null
  angemeldet = null
  setzeAktiv(false)
  if (token && warAngemeldet) await meldeReiseAb(token)
}

/** VORUEBERGEHEND fuer TestFlight (Knopf in den Einstellungen) - vor der Einreichung entfernen. */
export async function testmitteilung(): Promise<boolean> {
  if (!istApp()) return false
  try {
    const t = await holeToken()
    return t ? await schickeTestmitteilung(t) : false
  } catch {
    return false
  }
}

// --- Nachtragen und Antippen (Konzept Mitteilungen 6.2, Entscheidung A) ---

/** Eine Server-Mitteilung, angetippt oder noch im Mitteilungszentrum. */
export interface ZugestellteMeldung {
  /** Das Ereignis fuer die Meldungsliste - `null` bei Rot und Erinnerung (die stehen schon auf der Uebersicht). */
  ereignis: LiveEreignis | null
  /** `art` aus den Daten (`gleis-ab`, `rot`, ...). */
  art: string
  /** Angetippte Aktion; fehlt beim Antippen der Mitteilung selbst. */
  aktion?: 'weg' | 'oeffnen'
  /** Der Anschluss faellt aus: Die Aktion heisst dann „Andere Verbindung waehlen“. */
  verbindung: boolean
}

const TYP_ZU_ART: Record<string, LiveEreignis['typ']> = { zeit: 'verspaetung', gleis: 'gleiswechsel', ausfall: 'ausfall' }

const text = (x: unknown): string | undefined => (typeof x === 'string' && x !== '' ? x : undefined)

/**
 * Macht aus den `data` einer Mitteilung (`mitteilungsDaten` im Backend) ein
 * `LiveEreignis` - so, als waere es ueber den Live-Strom gekommen.
 */
export function ereignisAusDaten(daten: Record<string, unknown>): LiveEreignis | null {
  const art = text(daten.art)
  const zug = text(daten.zug)
  const treffer = art && /^(zeit|gleis|ausfall)-(an|ab)$/.exec(art)
  if (!treffer || !zug) return null
  const alt = text(daten.alt)
  const neu = text(daten.neu)
  return {
    typ: TYP_ZU_ART[treffer[1]],
    zug,
    seite: treffer[2] as 'an' | 'ab',
    ...(alt ? { alt } : {}),
    ...(neu ? { neu } : {}),
    zeitstempel: new Date().toISOString(),
  }
}

function alsMeldung(daten: unknown, aktion?: 'weg' | 'oeffnen'): ZugestellteMeldung | null {
  if (typeof daten !== 'object' || daten === null) return null
  const d = daten as Record<string, unknown>
  const art = text(d.art)
  // Nur unsere: Die Testmitteilung und Fremdes tragen kein Reiseereignis.
  if (!art || !/^(rot|erinnerung|(zeit|gleis|ausfall)-(an|ab))$/.test(art)) return null
  return { ereignis: ereignisAusDaten(d), art, ...(aktion ? { aktion } : {}), verbindung: d.aktion === 'verbindung' }
}

/** Antippen einer Mitteilung oder einer ihrer Aktionen. Wegwischen zaehlt nicht. */
export function hoereAufAntippen(f: (m: ZugestellteMeldung) => void): () => void {
  if (!istApp()) return () => undefined
  let weg: (() => void) | null = null
  let beendet = false
  FirebaseMessaging.addListener('notificationActionPerformed', ({ actionId, notification }) => {
    if (actionId === 'dismiss') return
    const aktion = actionId === 'weg' || actionId === 'oeffnen' ? actionId : undefined
    const m = alsMeldung(notification.data, aktion)
    if (m) f(m)
  })
    .then((h) => {
      weg = () => void h.remove()
      if (beendet) weg()
    })
    .catch(() => undefined)
  return () => {
    beendet = true
    weg?.()
  }
}

/**
 * Was noch im Mitteilungszentrum liegt - beim Oeffnen ohne Antippen. Raeumt
 * es danach: Was in der App steht, braucht dort niemand mehr.
 */
export async function holeZugestellte(): Promise<ZugestellteMeldung[]> {
  if (!istApp()) return []
  try {
    const { notifications } = await FirebaseMessaging.getDeliveredNotifications()
    const liste = notifications.map((n) => alsMeldung(n.data)).filter((m): m is ZugestellteMeldung => m !== null)
    if (liste.length > 0) await FirebaseMessaging.removeAllDeliveredNotifications()
    return liste
  } catch {
    return []
  }
}
