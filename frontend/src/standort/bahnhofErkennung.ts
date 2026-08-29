import { sucheStationenNahebei, type SuchErgebnis } from '../api/client';
import { KOORD_RUNDUNG } from './schwellen';
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

export async function erkenneBahnhof(
  standort: Standort,
  sucheFn: (lat: number, lon: number) => Promise<SuchErgebnis> = sucheStationenNahebei,
): Promise<SuchErgebnis> {
  return sucheFn(rundeKoordinate(standort.lat), rundeKoordinate(standort.lon));
}
