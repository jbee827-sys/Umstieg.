import { sucheStationenNahebei, type SuchErgebnis } from '../api/client';
import { ERKENNUNG_MAX_M, KOORD_RUNDUNG } from './schwellen';
import type { Standort } from './typen';

/**
 * Rundet auf KOORD_RUNDUNG Nachkommastellen (~110 m). Das geschieht bewusst
 * HIER im Browser und nicht serverseitig: Rohkoordinaten sollen das Geraet
 * nie verlassen. Die Genauigkeit reicht zur Bahnhofszuordnung, taugt aber
 * nicht zum Bewegungsprofil.
 */
export function rundeKoordinate(wert: number): number {
  const faktor = 10 ** KOORD_RUNDUNG;
  return Math.round(wert * faktor) / faktor;
}

/** Wie SuchErgebnis, plus der Fall "Fix zu grob, gar nicht erst gefragt". */
export type ErkennungErgebnis = SuchErgebnis | { ok: false; fehler: 'zu-ungenau' };

export async function erkenneBahnhof(
  standort: Standort,
  sucheFn: (lat: number, lon: number) => Promise<SuchErgebnis> = sucheStationenNahebei,
): Promise<ErkennungErgebnis> {
  // Ohne diese Pruefung wuerde bei einem 2000-m-Fix ein 1000-m-Umkreis
  // abgefragt - die Antwort waere geraten. Auf Rechnern ohne GPS ist genau
  // das der Normalfall (IP-/WLAN-Ortung).
  if (standort.genauigkeitM > ERKENNUNG_MAX_M) return { ok: false, fehler: 'zu-ungenau' };
  return sucheFn(rundeKoordinate(standort.lat), rundeKoordinate(standort.lon));
}
