import type { HaltestellenTafelEintrag, Ort, TafelEintrag, Verkehrsmittel } from '../api/typen'
import { uhrzeit } from '../api/zeit'

/*
 * Bus, Tram und U-Bahn am Bahnhof (Spec 2026-10-21-bus-am-bahnhof).
 *
 * Die DB-Tafel kennt nur Zuege. Was sonst am Bahnhof faehrt, kommt aus der
 * Haltestellentafel des Bahnhofs (250 m Umkreis) - auch von Halten mit
 * eigenem Namen wie „Goettingen Bahnhof/ZOB“. Waehlt man so eine Fahrt, wird
 * der Umstieg im Haltestellenpfad gerechnet; der DB-Zug der anderen Seite
 * braucht dafuer sein Gegenstueck aus Transitous.
 */

/** Was die DB-Tafel nicht fuehrt. Bahn und S-Bahn stehen dort schon. */
const NAHVERKEHR: ReadonlySet<Verkehrsmittel> = new Set(['ubahn', 'tram', 'bus', 'faehre'])

/**
 * Die Fahrten, die unter der DB-Tafel stehen. Die U-Bahn nur, wenn die
 * DB-Tafel selbst keine fuehrt - sonst stuende dieselbe Fahrt zweimal da.
 */
export function nahverkehrAmBahnhof(
  eintraege: HaltestellenTafelEintrag[],
  dbHatUbahn: boolean,
): HaltestellenTafelEintrag[] {
  return eintraege.filter((e) => NAHVERKEHR.has(e.verkehrsmittel) && !(dbHatUbahn && e.verkehrsmittel === 'ubahn'))
}

const SCHIENE: ReadonlySet<Verkehrsmittel> = new Set(['bahn', 'sbahn', 'ubahn'])
const kompakt = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/**
 * Der DB-Zug als Fahrt aus Transitous: gleiche Sollminute und gleiches Gleis,
 * sonst gleiche Linie, sonst der einzige Zug dieser Minute. Mehrdeutig heisst
 * kein Treffer - ein falscher Zug gaebe einen falschen Steig UND eine
 * Live-Ueberwachung, die eine fremde Fahrt verfolgt.
 */
export function ordneZugZu(zug: TafelEintrag, kandidaten: HaltestellenTafelEintrag[]): HaltestellenTafelEintrag | null {
  const minute = kandidaten.filter((k) => SCHIENE.has(k.verkehrsmittel) && uhrzeit(k.zeitSoll) === zug.zeitSoll)
  const gleis = minute.filter((k) => k.steigSoll !== undefined && k.steigSoll === zug.gleisSoll)
  const linie = minute.filter((k) => kompakt(k.linie) === kompakt(zug.zug))
  const beides = gleis.filter((k) => linie.includes(k))
  for (const liste of [beides, gleis, linie, minute]) {
    if (liste.length === 1) return liste[0]
    if (liste.length > 1) return null
  }
  return null
}

/** „14:32“ als heutiger Zeitpunkt; kurz nach Mitternacht zaehlt eine fruehe Zeit als morgen (wie `heuteUm` in App). */
function heuteUm(hhmm: string, jetzt: Date): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const zeitpunkt = new Date(jetzt)
  zeitpunkt.setHours(h, m, 0, 0)
  if (zeitpunkt.getTime() < jetzt.getTime() - 6 * 3600 * 1000) zeitpunkt.setDate(zeitpunkt.getDate() + 1)
  return zeitpunkt
}

/**
 * Kennt Transitous den Zug nicht, beginnt der Weg am Bahnhof selbst.
 * `steigGenau: false` bringt den Hinweis „Steig unbekannt …“; `echtzeit:
 * false`, weil die Live-Ueberwachung des Haltestellenpfads diese Fahrt nicht
 * findet.
 */
export function ersatzFahrt(zug: TafelEintrag, bahnhof: Ort, jetzt: Date): HaltestellenTafelEintrag {
  return {
    fahrtId: `db|${zug.zug}|${zug.zeitSoll}`,
    linie: zug.zug,
    verkehrsmittel: 'bahn',
    ziel: zug.ziel,
    zeitSoll: heuteUm(zug.zeitSoll, jetzt).toISOString(),
    ...(zug.zeitIst ? { zeitIst: heuteUm(zug.zeitIst, jetzt).toISOString() } : {}),
    ...(zug.gleisSoll ? { steigSoll: zug.gleisSoll } : {}),
    ...(zug.gleisIst ? { steigIst: zug.gleisIst } : {}),
    steigLat: bahnhof.lat,
    steigLon: bahnhof.lon,
    steigGenau: false,
    echtzeit: false,
    ausfall: false,
  }
}

/**
 * Der Halt einer Fahrt aus dem Bahnhofsumkreis als Ort. Die Live-Ueberwachung
 * fragt mit 30 m Umkreis - am Bahnhof faende sie den Bus am ZOB nicht, an
 * seinem eigenen Halt schon.
 */
export function ortAusHalt(e: HaltestellenTafelEintrag, bahnhof: Ort): Ort {
  if (!e.haltId) return bahnhof
  return {
    name: e.haltName ?? bahnhof.name,
    lat: e.steigLat,
    lon: e.steigLon,
    verkehrsmittel: [e.verkehrsmittel],
    haltestelleId: e.haltId,
  }
}

/** Der Name des Halts, wenn er nicht der des Bahnhofs ist - dann steht er in der Tafel. */
export function anderHalt(e: HaltestellenTafelEintrag, bahnhofName: string): string | undefined {
  if (!e.haltName) return undefined
  return kompakt(e.haltName) === kompakt(bahnhofName) ? undefined : e.haltName
}
