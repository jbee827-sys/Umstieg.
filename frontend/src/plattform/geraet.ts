import { KeepAwake } from '@capacitor-community/keep-awake'
import { Browser } from '@capacitor/browser'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { TextZoom } from '@capacitor/text-zoom'
import { istApp } from './istApp'

/**
 * Was das Gerät kann, die Webseite aber nicht (Plan App Store, Paket 5).
 *
 * Jede Funktion tut im Browser das, was die Web-Fassung schon immer tat -
 * meist nichts. Die App bekommt das native Gegenstück. Fehler schluckt jede
 * Funktion: Ein Ruckeln, das ausbleibt, darf nie eine Reise stören.
 */
function still(versprechen: Promise<unknown>): void {
  versprechen.catch(() => undefined)
}

/** Gleiswechsel, Verspätung, Ausfall: kräftig, wie eine Warnung. */
export function meldeEreignisSpuerbar(): void {
  if (istApp()) still(Haptics.notification({ type: NotificationType.Warning }))
  else navigator.vibrate?.([200, 100, 200])
}

/** Ein Schritt weiter oder zurück: ein leichter Tipp. Im Browser nichts. */
export function tippeSchrittwechsel(): void {
  if (istApp()) still(Haptics.impact({ style: ImpactStyle.Light }))
}

/** Angekommen am Anschlussgleis. Im Browser nichts. */
export function meldeAnkunftSpuerbar(): void {
  if (istApp()) still(Haptics.notification({ type: NotificationType.Success }))
}

/**
 * Der Bildschirm bleibt an, solange der Weg zu sehen ist: Wer mit Koffer
 * durch den Bahnhof geht, entsperrt nicht bei jedem Blick das Telefon.
 */
export function halteBildschirmWach(an: boolean): void {
  if (!istApp()) return
  still(an ? KeepAwake.keepAwake() : KeepAwake.allowSleep())
}

/** Ob gerade die dunkle Palette gilt - eigene Wahl vor Systemeinstellung (darstellung.ts). */
function istDunkel(): boolean {
  const wahl = document.documentElement.dataset.darstellung
  if (wahl) return wahl === 'dunkel'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Uhrzeit und Akku in der Farbe, die auf dem Grund der App lesbar ist. */
export function passeStatusleisteAn(): void {
  if (!istApp()) return
  // Style.Dark heißt bei Capacitor „für dunklen Grund“, also helle Schrift.
  still(StatusBar.setStyle({ style: istDunkel() ? Style.Dark : Style.Light }))
}

/** Folgt der Statusleiste, wenn das System nachts umschaltet. */
export function folgeDarstellung(): void {
  if (!istApp()) return
  passeStatusleisteAn()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', passeStatusleisteAn)
}

/**
 * Die Textgröße aus den Einstellungen des Geräts (Anzeige & Helligkeit →
 * Textgröße, Bedienungshilfen). Die WebView einer App übernimmt sie nicht von
 * selbst - ohne dies bliebe die App bei 18 px, auch für jemanden, der am
 * Gerät große Schrift eingestellt hat. Die Staffel in index.css ist in rem
 * gesetzt und wächst mit. Beim Zurückkehren in die App neu, falls sie
 * inzwischen geändert wurde. (Im Browser regelt Safari das selbst.)
 */
export function folgeSchriftgroesse(): void {
  if (!istApp()) return
  const uebernimm = () =>
    still(TextZoom.getPreferred().then(({ value }) => TextZoom.set({ value })))
  uebernimm()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') uebernimm()
  })
}

/** Der Startbildschirm geht, sobald die App gezeichnet ist. */
export function blendeStartbildschirmAus(): void {
  if (istApp()) still(SplashScreen.hide({ fadeOutDuration: 150 }))
}

/** Ob ein Link die App verlässt - alles, was nicht auf der eigenen Herkunft liegt. */
export function istExtern(href: string, herkunft: string = window.location.origin): boolean {
  try {
    const ziel = new URL(href, herkunft)
    return (ziel.protocol === 'https:' || ziel.protocol === 'http:') && ziel.origin !== herkunft
  } catch {
    return false
  }
}

/**
 * Externe Links (GitHub, Transitous, OpenStreetMap, Quellen) öffnen in der
 * App in einer Safari-Ansicht über der App, nicht im App-Fenster - sonst
 * stünde die fremde Seite ohne Zurück in der WebView. Ein Hörer für alle
 * Links, auch die in der Karte und auf den Rechtsseiten.
 */
export function oeffneExterneLinksImBrowser(): void {
  if (!istApp()) return
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || !istExtern(link.href)) return
      e.preventDefault()
      still(Browser.open({ url: link.href }))
    },
    true,
  )
}
