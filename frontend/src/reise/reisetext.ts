/**
 * Liest geteilte Reiseverbindungen aus Fahrplan-Apps.
 *
 * Warum Text und nicht die Fahrkarte: Der Export enthält genau das, was diese
 * App braucht – Zug, Zeit, Bahnhof und **Gleis** je Abschnitt – und fast
 * nichts, was sie nichts angeht. Kein Name, keine Anschrift, keine
 * Auftragsnummer. Die Rechnung als PDF ist das Gegenbeispiel: Sie trägt Name,
 * Wohnanschrift und Zahlungsmittel und von den gebrauchten Feldern kein
 * einziges. PDFs gar nicht erst anzunehmen ist deshalb Datenminimierung
 * (Art. 5 Abs. 1 lit. c DSGVO), keine Einschränkung.
 *
 * Ausgewertet wird ausschließlich im Browser. Der Text verlässt das Gerät
 * nicht, es gibt keinen Upload-Endpunkt und nichts wird gespeichert.
 *
 * ## Warum kein Erkenner je App
 *
 * Die erste Fassung kannte genau ein Format (DB Navigator) und scheiterte am
 * ersten fremden Text. Die zweite bekam einen zweiten Erkenner daneben – und
 * hätte für jede weitere App einen dritten, vierten, fünften gebraucht. Das
 * skaliert nicht: Es gibt Dutzende Verbund-Apps, und keine davon ist
 * dokumentiert.
 *
 * Diese Fassung erkennt deshalb **keine Formate, sondern Felder**. Jede Zeile
 * wird auf die Tatsachen abgeklopft, die eine Fahrt ausmachen:
 *
 *   ZEIT      – eine Uhrzeit                      (Pflicht)
 *   ROLLE     – Abfahrt oder Ankunft              (Pflicht)
 *   ORT       – was nach Abzug des Übrigen bleibt (Pflicht)
 *   GLEIS     – hinter „Gleis", „Bstg.", „Steig"  (optional)
 *   ZUG       – „ICE 1134", „RE3", „Bus 731"      (optional)
 *   RICHTUNG  – hinter „nach" oder „Richtung"     (optional)
 *
 * Wo diese Angaben in der Zeile stehen, ist gleichgültig. Der DB Navigator
 * schreibt „Ab 22:53 Eberswalde, Gleis 4", die VBB-App „22:53 - Abfahrt
 * Eberswalde, Gleis 4" – dieselben Felder, andere Reihenfolge. Auch ob die
 * Zugbezeichnung über der Abfahrt steht (DB) oder darunter (VBB, „mit RE3
 * Richtung …"), spielt keine Rolle: Gesucht wird im Umfeld des Halts.
 *
 * Ein neues Format wird damit nicht durch einen neuen Erkenner unterstützt,
 * sondern durch ein Wort mehr im Vokabular unten. Das ist der
 * Erweiterungspunkt.
 *
 * Geraten wird trotzdem nicht: Ohne Zeit, Rolle und Ort entsteht kein
 * Abschnitt, und ohne einen einzigen Abschnitt kommt `null` zurück. Ein
 * falsch erkanntes Gleis ist schlimmer als ein nicht erkanntes – der Nutzer
 * läuft sonst zum falschen Bahnsteig.
 */

export interface Abschnitt {
  zug: string
  nach: string
  abZeit: string
  abBahnhof: string
  abGleis?: string
  anZeit: string
  anBahnhof: string
  anGleis?: string
}

export interface Umstieg {
  bahnhof: string
  anZug: string
  anZeit: string
  anGleis?: string
  /** Endziel des ankommenden Zuges, falls genannt. */
  anZiel: string
  abZug: string
  abZeit: string
  abGleis?: string
  /** Endziel des Anschlusszuges. */
  abZiel: string
  /** Umsteigezeit in Minuten. */
  minuten: number
  /** Beide Gleise bekannt? Bushaltestellen und Verbund-Apps führen oft keines. */
  vollstaendig: boolean
}

/** Was der Text hergegeben hat – damit die Oberfläche es benennen kann. */
export interface Erkanntes {
  abschnitte: number
  /** Bei allen Umstiegen beide Gleise bekannt? */
  gleiseVollstaendig: boolean
  /** Wie viele Abschnitte eine Zugbezeichnung tragen. */
  zuege: number
}

export interface Reise {
  von: string
  nach: string
  /** Wie im Text, z. B. „15.08.2026". Leer, wenn keines dastand. */
  datum: string
  erkannt: Erkanntes
  abschnitte: Abschnitt[]
  umstiege: Umstieg[]
}

/* ------------------------------------------------------------------ */
/* Vokabular – der Erweiterungspunkt für neue Apps                     */
/* ------------------------------------------------------------------ */

/**
 * Wörter, die eine Zeile zur Abfahrt bzw. Ankunft machen.
 *
 * Reihenfolge lang vor kurz: Sonst fängt „An" das „An" von „Ankunft" ab.
 */
export const ROLLENWORTE = {
  ab: ['Abfahrt', 'Abf', 'Start', 'Ab'],
  an: ['Ankunft', 'Ank', 'Ziel', 'An'],
}

/** Wörter, hinter denen ein Gleis steht. */
export const GLEISWORTE = ['Gleis', 'Gl.', 'Bahnsteig', 'Bstg.', 'Steig', 'Platform']

/** Wörter, hinter denen das Fahrtziel steht. */
export const RICHTUNGSWORTE = ['Richtung', 'Ri.', 'nach']

/**
 * Vorsilben/Nachsilben von Haltestellennamen ("S+U Berlin Hauptbahnhof",
 * "Hockenheim, Bahnhof") werden hier bewusst NICHT mehr abgeschnitten.
 *
 * Bis zum 03.09.2026 führte dieser Parser dieselbe Vokabelliste wie
 * `backend/src/core/bahnhofsname.ts` – zwei Stellen für denselben Zweck, die
 * auseinanderlaufen konnten. Der Bahnhof geht seither unverändert als
 * SUCHTEXT ins Formular; die Bahnhofssuche im Backend probiert die
 * Schreibvarianten selbst durch (siehe dort, `namensvarianten()`). Dieser
 * Parser klopft nur noch auf FELDER ab (Zeit, Rolle, Ort, Gleis, Zug,
 * Richtung), nicht mehr auf das Vokabular einer bestimmten Suche.
 */

/**
 * Gattungskürzel, an denen eine Zugbezeichnung erkennbar ist.
 *
 * Bewusst eine Liste und nicht „Wort mit Ziffer": Sonst würde jede Hausnummer
 * in einem Haltestellennamen zur Linie.
 */
export const ZUGGATTUNGEN = [
  'ICE',
  'ICN',
  'IC',
  'ECE',
  'EC',
  'RJX',
  'RJ',
  'NJ',
  'EN',
  'TGV',
  'THA',
  'FLX',
  'IRE',
  'MEX',
  'RE',
  'RB',
  'STR',
  'TRAM',
  'Bus',
  'S',
  'U',
  'M',
  'X',
]

/* ------------------------------------------------------------------ */

const DATUM = /^\d{1,2}\.\d{1,2}\.\d{4}$/
const PFEIL = /\s(?:→|->|–>|—>|>>)\s/
const ZEIT = /\b(\d{1,2}:\d{2})\b/

/**
 * Baut eine Alternative aus dem Vokabular – mit vollständiger Maskierung.
 *
 * Nur den Punkt zu maskieren reichte nicht: „S+U" wurde damit zum Ausdruck
 * „ein oder mehr S, gefolgt von U" und traf den Namen „S+U Berlin
 * Hauptbahnhof" nie. Vokabeln sind Zeichenfolgen, keine Ausdrücke – also
 * werden alle Sonderzeichen maskiert.
 */
function ausWorten(worte: string[]): string {
  return worte.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
}

const ROLLE_AB = new RegExp(`(?:^|[^\\p{L}])(?:${ausWorten(ROLLENWORTE.ab)})(?![\\p{L}])`, 'iu')
const ROLLE_AN = new RegExp(`(?:^|[^\\p{L}])(?:${ausWorten(ROLLENWORTE.an)})(?![\\p{L}])`, 'iu')
const GLEIS = new RegExp(`(?:${ausWorten(GLEISWORTE)})\\s*([\\p{L}\\d/-]+)`, 'iu')
const RICHTUNG = new RegExp(`(?:^|[^\\p{L}])(?:${ausWorten(RICHTUNGSWORTE)})\\s+(.+)$`, 'iu')
const ZUGBEZEICHNUNG = new RegExp(`^(?:${ausWorten(ZUGGATTUNGEN)})[\\s-]?\\d`, 'iu')

/** Zeilen, die zum Rahmen gehören und nie ein Halt sind. */
function istRahmen(zeile: string): boolean {
  return (
    /^[-–—_=]{2,}$/.test(zeile) ||
    /^https?:\/\//i.test(zeile) ||
    /Gesamtdauer/i.test(zeile) ||
    /\bDauer\b[^.]*\bMin/i.test(zeile) ||
    /^Verbindung\s/i.test(zeile) ||
    DATUM.test(zeile) ||
    PFEIL.test(zeile)
  )
}

interface Fakten {
  roh: string
  zeit?: string
  rolle?: 'ab' | 'an'
  ort: string
  gleis?: string
  zug?: string
  richtung?: string
  /** Zeit, Rolle und Ort beisammen – nur dann ist es ein Halt. */
  istHalt: boolean
}

/**
 * Klopft eine Zeile auf die Felder ab, unabhängig von ihrer Reihenfolge.
 *
 * Der Ort entsteht durch ABZUG: Erst werden Klammerzusatz, Zeit, Rollenwort
 * und Gleisangabe entfernt – was übrig bleibt, ist der Ort. Das ist der Kern
 * der strukturellen Lösung: Es muss nicht bekannt sein, WO der Ort steht, nur
 * was er NICHT ist.
 */
function analysiere(zeile: string): Fakten {
  const rahmen = istRahmen(zeile)

  /*
   * Eckige Klammern zuerst weg. Der VBB hängt an Bahnhofsnamen einen Zusatz:
   * „S+U Berlin Hauptbahnhof [Gleis 1-8]". Das ist kein Gleis, sondern
   * Namensbestandteil – das echte Gleis steht dahinter. Ohne diesen Schritt
   * läse die Gleiserkennung „1-8" statt „4".
   * Runde Klammern bleiben stehen: „Frankfurt(Main)Hbf" heißt so.
   */
  let rest = zeile.replace(/\s*\[[^\]]*\]/g, ' ')

  const zeit = ZEIT.exec(rest)?.[1]
  if (zeit) rest = rest.replace(zeit, ' ')

  const abTreffer = ROLLE_AB.exec(rest)
  const anTreffer = ROLLE_AN.exec(rest)
  let rolle: 'ab' | 'an' | undefined
  let rollenTreffer: RegExpExecArray | null = null
  if (abTreffer && (!anTreffer || abTreffer.index <= anTreffer.index)) {
    rolle = 'ab'
    rollenTreffer = abTreffer
  } else if (anTreffer) {
    rolle = 'an'
    rollenTreffer = anTreffer
  }
  if (rollenTreffer) rest = rest.replace(rollenTreffer[0], ' ')

  const gleisTreffer = GLEIS.exec(rest)
  const gleis = gleisTreffer?.[1]
  if (gleisTreffer) rest = rest.replace(gleisTreffer[0], ' ')

  const ort = rest
    .replace(/\bUhr\b/gi, ' ')
    // Nach dem Herausnehmen von „(Gleis 12)" bleibt ein leeres Klammerpaar
    // stehen. Ohne diesen Schritt hiesse der Bahnhof „Berlin Hbf ( )".
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    // Runde Klammern gehoeren NICHT in die Schlussbereinigung: Die VBB haengt
    // die Stadt als „… (Berlin)" an und laesst das Gleis folgen. Nach dem
    // Herausnehmen der Gleisangabe endet die Zeile auf „…(Berlin),", und eine
    // Klasse mit „)" darin schnitt „)," als Ganzes ab - der Name kam
    // unbalanciert heraus und die Bahnhofssuche fand nichts mehr. Das leere
    // Klammerpaar aus „(Gleis 12)" ist eine Zeile darueber schon weg.
    .replace(/^[\s,;:.\-–—]+/, '')
    .replace(/[\s,;:.\-–—]+$/, '')
    .trim()

  const { zug, richtung } = zugInfo(zeile)

  return {
    roh: zeile,
    zeit,
    rolle,
    ort,
    gleis,
    zug,
    richtung,
    istHalt: Boolean(!rahmen && zeit && rolle && ort),
  }
}

/**
 * Zugbezeichnung und Richtung aus einer Zeile.
 *
 * Zwei Schreibweisen, dieselbe Sache: Der DB Navigator setzt die Bezeichnung
 * allein auf eine Zeile („ICE 1134") und das Ziel auf die nächste („Nach
 * Berlin Hbf"); die VBB-App schreibt beides zusammen („mit RE3 Richtung
 * Jüterbog, Bahnhof"). Beides fällt hier heraus.
 */
function zugInfo(zeile: string): { zug?: string; richtung?: string } {
  let rest = zeile.trim()
  let richtung: string | undefined

  const r = RICHTUNG.exec(rest)
  if (r) {
    richtung = r[1].trim()
    rest = rest.slice(0, r.index).trim()
  }

  rest = rest.replace(/^(?:mit|Linie)\s+/i, '').trim()
  if (!rest || !ZUGBEZEICHNUNG.test(rest)) return { richtung }
  return { zug: rest, richtung }
}

/** „16:23" → 983. Für die Umsteigezeit. */
function minutenAmTag(zeit: string): number {
  const [s, m] = zeit.split(':')
  return Number(s) * 60 + Number(m)
}

/**
 * Sucht Zug und Richtung im Umfeld eines Halts.
 *
 * Erst ZWISCHEN Abfahrt und Ankunft (dort steht sie bei der VBB-App), dann
 * darüber (dort steht sie beim DB Navigator). Beim Blick nach oben wird an
 * einem anderen Halt abgebrochen – was davor liegt, gehört zum vorigen
 * Abschnitt.
 */
function zugImUmfeld(fakten: Fakten[], ab: number, an: number): { zug: string; nach: string } {
  let zug = ''
  let nach = ''

  const nimm = (f: Fakten) => {
    if (!zug && f.zug) zug = f.zug
    if (!nach && f.richtung) nach = f.richtung
  }

  for (let k = ab + 1; k < an; k++) if (!fakten[k].istHalt) nimm(fakten[k])
  for (let k = ab - 1; k >= 0 && k >= ab - 3; k--) {
    if (fakten[k].istHalt) break
    nimm(fakten[k])
  }
  return { zug, nach }
}

function baueAbschnitte(fakten: Fakten[]): Abschnitt[] {
  const abschnitte: Abschnitt[] = []

  for (let i = 0; i < fakten.length; i++) {
    if (!fakten[i].istHalt || fakten[i].rolle !== 'ab') continue

    // Die naechste Ankunft suchen. Kommt vorher eine weitere Abfahrt, fehlt
    // zu dieser die Ankunft - dann wird sie verworfen statt geraten.
    let j = -1
    for (let k = i + 1; k < fakten.length; k++) {
      if (!fakten[k].istHalt) continue
      if (fakten[k].rolle === 'an') j = k
      break
    }
    if (j === -1) continue

    const ab = fakten[i]
    const an = fakten[j]
    const { zug, nach } = zugImUmfeld(fakten, i, j)

    abschnitte.push({
      zug,
      nach,
      abZeit: ab.zeit!,
      abBahnhof: ab.ort,
      abGleis: ab.gleis,
      anZeit: an.zeit!,
      anBahnhof: an.ort,
      anGleis: an.gleis,
    })
    i = j
  }
  return abschnitte
}

function umstiegeAus(abschnitte: Abschnitt[]): Umstieg[] {
  const umstiege: Umstieg[] = []
  for (let k = 0; k + 1 < abschnitte.length; k++) {
    const ankunft = abschnitte[k]
    const abfahrt = abschnitte[k + 1]
    let minuten = minutenAmTag(abfahrt.abZeit) - minutenAmTag(ankunft.anZeit)
    if (minuten < 0) minuten += 24 * 60 // über Mitternacht

    umstiege.push({
      // Der Name des ABFAHRT-Abschnitts: Er ist der, den die Bahnhofssuche
      // findet. Die Ankunftsseite schreibt bei Haltestellen oft anders
      // („Bahnhof, Hockenheim" gegenüber „Hockenheim").
      bahnhof: abfahrt.abBahnhof,
      anZug: ankunft.zug,
      anZeit: ankunft.anZeit,
      anGleis: ankunft.anGleis,
      anZiel: ankunft.nach,
      abZug: abfahrt.zug,
      abZeit: abfahrt.abZeit,
      abGleis: abfahrt.abGleis,
      abZiel: abfahrt.nach,
      minuten,
      vollstaendig: Boolean(ankunft.anGleis && abfahrt.abGleis),
    })
  }
  return umstiege
}

export function parseReise(text: string): Reise | null {
  const zeilen = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)

  if (zeilen.length === 0) return null

  // Kopfzeile „A → B" und Datum sind BEIDE optional - die VBB-App schickt
  // keines von beiden.
  let von = ''
  let nach = ''
  let datum = ''
  if (PFEIL.test(zeilen[0])) {
    const teile = zeilen[0].split(PFEIL)
    von = teile[0].trim()
    nach = teile.slice(1).join(' ').trim()
  }
  for (const zeile of zeilen) {
    if (DATUM.test(zeile)) {
      datum = zeile
      break
    }
  }

  const abschnitte = baueAbschnitte(zeilen.map(analysiere))
  if (abschnitte.length === 0) return null

  // Ohne Kopfzeile ergeben sich Start und Ziel aus den Abschnitten selbst.
  if (!von) von = abschnitte[0].abBahnhof
  if (!nach) nach = abschnitte[abschnitte.length - 1].anBahnhof

  const umstiege = umstiegeAus(abschnitte)

  // Ein Link am Ende (etwa die `vbid` der Bahn) wird nicht uebernommen: Er
  // identifiziert die Buchung beim Anbieter und wird fuer nichts gebraucht.
  return {
    von,
    nach,
    datum,
    erkannt: {
      abschnitte: abschnitte.length,
      gleiseVollstaendig: umstiege.every((u) => u.vollstaendig),
      zuege: abschnitte.filter((a) => a.zug).length,
    },
    abschnitte,
    umstiege,
  }
}

/**
 * Findet die Reise heute statt - und ist sie damit ueberhaupt live verfolgbar?
 *
 * Gemessen am 03.09.2026 gegen die echte Timetables-API: `/plan` kennt nur ein
 * rollierendes Fenster von unter 24 Stunden. 15 Stunden voraus lieferte HTTP
 * 200 mit 57 Halten, 23 Stunden voraus HTTP 404 - kein leeres Ergebnis,
 * sondern gar keine Daten. Eine Reise in drei Wochen laesst sich also
 * eintragen, aber nicht verfolgen.
 *
 * Die Grenze wird bewusst streng auf "heute" gezogen. Morgen frueh WAERE oft
 * noch abfragbar, morgen abend nicht mehr - und eine Zusage, die je nach
 * Uhrzeit stimmt, ist keine. Lieber einmal zu viel darauf hinweisen, dass die
 * Live-Daten erst am Reisetag kommen, als einen leeren Strom zu zeigen.
 */
export function istReisetag(datum: string, jetzt: Date): boolean {
  const teile = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(datum)
  if (!teile) return true // Ohne Datum keine Behauptung.
  const [, tag, monat, jahr] = teile
  return (
    Number(jahr) === jetzt.getFullYear() &&
    Number(monat) === jetzt.getMonth() + 1 &&
    Number(tag) === jetzt.getDate()
  )
}
