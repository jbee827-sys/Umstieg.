import { PFAD } from '../navigation/adressen'
import daten from './daten/berlin-hbf-14-6.json'
import { beispielEntwurf } from './beispielreise'
import { setzeFormularVorgabe } from './formularstand'
import { baueAppNeu } from './neuaufbau'
import { aktiviereVorfuehrquelle, type Vorfuehrdaten } from './vorfuehrquelle'
import type { VorfuehrZiel } from './vorfuehrstart'
import { warte, ziel } from './warte'
import { setzeVorfuehrung, sperreSitzungsspeicher } from './zustand'

const DATEN = daten as unknown as Vorfuehrdaten
const WARTEZEIT_MS = 10000

/**
 * Stellt die Beispielreise auf den gewünschten Bildschirm - wie die
 * Einführungstour (tour.ts), aber ohne Blasen und ohne Ende: Die Vorführung
 * läuft, bis die App neu startet. Messung und Sitzungsspeicher schweigen so
 * lange, die Daten kommen aus der Aufzeichnung, nicht aus dem Netz.
 *
 * Bedient wird mit den echten Knöpfen, wie bei der Tour: Was auf dem Foto
 * steht, ist genau das, was ein Tipp des Nutzers zeigt.
 */
export async function fuehreVor(bis: VorfuehrZiel): Promise<void> {
  // Erst wenn die App steht: Vorher gäbe es keinen Rahmen, der neu aufbaut.
  await warte(() => ziel('starten'), WARTEZEIT_MS)
  setzeVorfuehrung(true)
  sperreSitzungsspeicher(true)
  aktiviereVorfuehrquelle(DATEN)
  setzeFormularVorgabe(beispielEntwurf(new Date()))
  window.history.replaceState(null, '', PFAD.eingabe)
  baueAppNeu()

  const starten = await warte(() => {
    const knopf = ziel('starten') as HTMLButtonElement | null
    return knopf && !knopf.disabled && knopf
  }, WARTEZEIT_MS)
  if (bis === 'eingabe') return
  starten.click()

  const navigation = await warte(() => ziel('navigation-starten'), WARTEZEIT_MS)
  if (bis === 'uebersicht') return
  navigation.click()
  await warte(() => ziel('schema'), WARTEZEIT_MS)
}
