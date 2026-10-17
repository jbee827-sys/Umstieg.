import { orteNahebei, type OrteErgebnis } from '../api/orte';
import type { Ort } from '../api/typen';
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

/**
 * Bahnhoefe und Haltestellen in der Naehe (Umstieg 2.0), plus der Fall „Fix
 * zu grob, gar nicht erst gefragt“.
 */
export type ErkennungErgebnis =
  | { ok: true; treffer: Ort[] }
  | { ok: false; fehler: 'nicht-verfuegbar' | 'netz' | 'zu-ungenau' };

export async function erkenneBahnhof(
  standort: Standort,
  sucheFn: (lat: number, lon: number) => Promise<OrteErgebnis> = orteNahebei,
): Promise<ErkennungErgebnis> {
  // Ohne diese Pruefung wuerde bei einem 2000-m-Fix ein 1000-m-Umkreis
  // abgefragt - die Antwort waere geraten. Auf Rechnern ohne GPS ist genau
  // das der Normalfall (IP-/WLAN-Ortung).
  if (standort.genauigkeitM > ERKENNUNG_MAX_M) return { ok: false, fehler: 'zu-ungenau' };
  const ergebnis = await sucheFn(rundeKoordinate(standort.lat), rundeKoordinate(standort.lon));
  return ergebnis.ok ? { ok: true, treffer: ergebnis.antwort.orte } : ergebnis;
}
