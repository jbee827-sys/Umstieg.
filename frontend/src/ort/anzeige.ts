import type { EingabeWerte, HaltestellenWahl } from '../components/Eingabe'
import type { HaltestellenTafelEintrag } from '../api/typen'
import { VERKEHRSMITTEL_NAME } from './verkehrsmittelNamen'

/**
 * Wo der Umstieg beginnt (`an`) oder endet (`ab`), als Wort für Kopf,
 * Kacheln und Zielsatz. Im Bahnhofspfad das Gleis; an Haltestellen heisst
 * ein Bahnsteig der Bahn weiter Gleis, alles andere Steig. Ohne
 * Steigangabe bleibt nur die Haltestelle.
 */
export function ortsangabe(werte: EingabeWerte, seite: 'an' | 'ab'): string {
  const wahl = werte.haltestellen
  if (!wahl) return `Gleis ${seite === 'an' ? werte.gleisAn : werte.gleisAb}`
  const fahrt = seite === 'an' ? wahl.ankunft.fahrt : wahl.anschluss.fahrt
  const steig = fahrt.steigIst ?? fahrt.steigSoll
  if (!steig) return 'Haltestelle'
  return fahrt.verkehrsmittel === 'bahn' || fahrt.verkehrsmittel === 'sbahn' ? `Gleis ${steig}` : `Steig ${steig}`
}

/**
 * Die Linie zum Lesen. MOTIS nennt Busse und Trams oft nur mit der Nummer
 * („245“) – in einer Meldung sagt das allein zu wenig. Was sich selbst
 * benennt („ICE 1206“, „S5“, „M10“), bleibt.
 */
export function linienName(fahrt: HaltestellenTafelEintrag): string {
  return /^\d/.test(fahrt.linie) ? `${VERKEHRSMITTEL_NAME[fahrt.verkehrsmittel]} ${fahrt.linie}` : fahrt.linie
}

/** Was am Weg im Haltestellenpfad gesagt werden muss, bevor er beginnt. */
export function haltestellenHinweise(wahl: HaltestellenWahl): string[] {
  const hinweise: string[] = []
  // Spec 5.6: Die Koordinate ist dann die der Haltestelle, nicht des Steigs.
  if (!wahl.ankunft.fahrt.steigGenau || !wahl.anschluss.fahrt.steigGenau) {
    hinweise.push('Steig unbekannt – der Weg führt zur Haltestelle.')
  }
  // F5: Die Ampel rechnet dann mit der Sollzeit.
  if (!wahl.anschluss.fahrt.echtzeit) hinweise.push('Anschluss laut Fahrplan – keine Echtzeitdaten.')
  return hinweise
}
