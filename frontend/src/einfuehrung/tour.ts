import { driver, type Config, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import './einfuehrung.css'
import { PFAD } from '../navigation/adressen'
import { ruhigGewuenscht } from '../navigation/uebergang'
import { leereReise } from '../sitzung/reisespeicher'
import daten from './daten/berlin-hbf-14-6.json'
import { schreibeBeispielEntwurf } from './beispielreise'
import { formularStand, setzeFormularVorgabe } from './formularstand'
import { baueAppNeu } from './neuaufbau'
import { SCHRITTE } from './schritte'
import { sichere, stelleWiederHer } from './sitzungssicherung'
import { aktiviereVorfuehrquelle, deaktiviereVorfuehrquelle, type Vorfuehrdaten } from './vorfuehrquelle'
import { setzeVorfuehrung } from './zustand'

/**
 * Die Einführungstour (Plan Einführungstour, Paket 5).
 *
 * Wird erst beim Tipp auf das „i“ nachgeladen - mit driver.js und den
 * aufgezeichneten Daten. Sie führt die ECHTE App vor: Sie ersetzt nur die
 * Datenquelle, schreibt die Beispielreise als Entwurf und baut die App neu
 * auf. Danach ist alles wie vorher - Entwurf, laufende Reise, Adresse.
 */

const DATEN = daten as unknown as Vorfuehrdaten

/** Begrüßung und Abschluss zählen nicht mit: „n von 12“. */
const GEZAEHLT = SCHRITTE.length - 2

/** Wie in der Vorschau, abgestimmt mit Julian. */
const EINSTELLUNGEN: Config = {
  animate: true,
  allowClose: true,
  overlayOpacity: 0.62,
  stagePadding: 6,
  stageRadius: 18,
  smoothScroll: true,
  // Die Tour zeigt; bedient wird erst danach. Ein Tipp auf das hervorgehobene
  // Element liefe sonst an der Tour vorbei.
  disableActiveInteraction: true,
  popoverClass: 'umstieg-tour',
}

export interface TourOptionen {
  /** Für die Tests: driver.js gestellt. */
  erzeugeDriver?: (config: Config) => Driver
  /** Wie lange auf ein Ziel bzw. den nächsten Bildschirm gewartet wird. */
  wartezeitMs?: number
}

function ziel(wert: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${wert}"]`)
}

/**
 * Wartet, bis `finde` etwas liefert - und bis ein Seitenübergang fertig ist
 * (navigation/uebergang.ts setzt `data-uebergang`, solange er läuft). Erst
 * dann stimmt die Lage, an der driver.js die Blase ausrichtet.
 */
function warte<T>(finde: () => T | null | undefined | false, ms: number): Promise<T> {
  const bis = Date.now() + ms
  return new Promise((fertig, fehler) => {
    const pruefe = () => {
      const gefunden = finde()
      if (gefunden && !document.documentElement.dataset.uebergang) return fertig(gefunden)
      if (Date.now() > bis) return fehler(new Error('Einführung: Ziel nicht erschienen'))
      setTimeout(pruefe, 50)
    }
    pruefe()
  })
}

let laeuft = false

export async function starteTour(optionen: TourOptionen = {}): Promise<void> {
  if (laeuft) return
  laeuft = true
  const erzeuge = optionen.erzeugeDriver ?? driver
  const wartezeit = optionen.wartezeitMs ?? 6000

  // Erst sichern, dann umstellen: Die Messung schweigt, bevor die App auf
  // der Beispielreise zum ersten Mal einen Bildschirm wechselt.
  const sicherung = sichere()
  // Was halb eingetippt und nie abgeschickt dasteht, liegt nicht im Speicher.
  const formular = formularStand()
  setzeVorfuehrung(true)
  aktiviereVorfuehrquelle(DATEN)
  // Ohne die laufende Reise des Nutzers: Sonst starteten Leiste und
  // Meldungszähler mit ihr.
  leereReise()
  schreibeBeispielEntwurf(new Date())
  window.history.replaceState(null, '', PFAD.eingabe)
  baueAppNeu()

  let beendet = false
  let index = 0
  let beschaeftigt = false

  const beende = (): void => {
    if (beendet) return
    beendet = true
    drv.destroy()
    deaktiviereVorfuehrquelle()
    stelleWiederHer(sicherung)
    setzeFormularVorgabe(formular)
    window.history.replaceState(null, '', PFAD.eingabe)
    baueAppNeu()
    // Der Merker fällt erst, wenn die neu aufgebaute App steht: Bis dahin
    // könnte ein Adresswechsel noch als Seitenaufruf durchgehen.
    void warte(() => document.querySelector<HTMLElement>('.tour-knopf') ?? true, 1000)
      .then((knopf) => {
        if (knopf instanceof HTMLElement) knopf.focus()
      })
      .catch(() => undefined)
      .finally(() => {
        setzeVorfuehrung(false)
        laeuft = false
      })
  }

  // Wer reduzierte Bewegung eingestellt hat, bekommt keine gleitende
  // Hervorhebung und kein sanftes Rollen - wie bei den Seitenwechseln.
  const ruhig = ruhigGewuenscht()
  const drv = erzeuge({
    ...EINSTELLUNGEN,
    animate: !ruhig,
    smoothScroll: !ruhig,
    // Esc, × und der Klick auf die abgedunkelte Fläche landen hier.
    onDestroyStarted: () => beende(),
  })

  const zeige = async (nr: number): Promise<void> => {
    const schritt = SCHRITTE[nr]
    const element = schritt.ziel ? await warte(() => ziel(schritt.ziel!), wartezeit) : undefined
    if (beendet) return
    index = nr
    const letzter = nr === SCHRITTE.length - 1
    const gezaehlt = nr > 0 && !letzter
    // Zurück nur innerhalb eines Bildschirms: Der Weg zurück auf die Eingabe
    // hieße, die Beispielreise neu aufzubauen.
    const zurueck = nr > 0 && SCHRITTE[nr - 1].bildschirm === schritt.bildschirm
    const hervorheben: DriveStep = {
      element,
      popover: {
        title: schritt.titel,
        description: schritt.text,
        showButtons: zurueck ? ['previous', 'next', 'close'] : ['next', 'close'],
        nextBtnText: schritt.weiterText ?? 'Weiter',
        prevBtnText: 'Zurück',
        showProgress: gezaehlt,
        progressText: gezaehlt ? `${nr} von ${GEZAEHLT}` : '',
        // Die Schritt-Box klebt unten am Rand - die Blase gehört darüber.
        ...(schritt.ziel === 'schritt' ? { side: 'top' as const } : {}),
        onNextClick: () => void weiter(),
        onPrevClick: () => void geheZu(nr - 1),
        onCloseClick: () => beende(),
      },
    }
    drv.highlight(hervorheben)
  }

  const geheZu = async (nr: number): Promise<void> => {
    if (beschaeftigt || beendet) return
    beschaeftigt = true
    try {
      await zeige(nr)
    } catch {
      beende()
    } finally {
      beschaeftigt = false
    }
  }

  const weiter = async (): Promise<void> => {
    if (beschaeftigt || beendet) return
    if (index === SCHRITTE.length - 1) {
      beende()
      return
    }
    const aktion = SCHRITTE[index].aktion
    // Der echte Knopf, nicht ein Umweg an ihm vorbei: Was danach kommt, ist
    // genau das, was ein Tipp des Nutzers auslöst.
    if (aktion) ziel(aktion)?.click()
    await geheZu(index + 1)
  }

  try {
    // Die neu aufgebaute Eingabe hat den Entwurf gelesen, wenn ihr Knopf
    // bereit ist.
    await warte(() => {
      const knopf = ziel('starten') as HTMLButtonElement | null
      return knopf && !knopf.disabled
    }, wartezeit)
    await geheZu(0)
  } catch {
    beende()
  }
}
