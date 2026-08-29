import type { RouteErgebnis } from '../api/typen';
import { haversineM } from './distanz';
import { ANKUNFT_RADIUS_M, ANKUNFT_VERWEIL_MS, GENAUIGKEIT_MAX_M } from './schwellen';
import type { AnkunftZustand, Standort } from './typen';

export const ANKUNFT_START: AnkunftZustand = { seit: null, bestaetigt: false };

/**
 * Reine Zustandsmaschine: Die Zeit kommt als Parameter herein, damit die
 * Verweildauer ohne Fake-Timer pruefbar ist.
 *
 * Die Pruefung vergleicht HORIZONTALE Distanz. Wer in der Unterfuehrung unter
 * dem Zielbahnsteig hindurchgeht, ist horizontal nah und eine Etage zu tief –
 * deshalb die Verweildauer und die Bestaetigung durch den Nutzer.
 */
export function pruefeAnkunft(
  zustand: AnkunftZustand,
  standort: Standort,
  ziel: { lat: number; lon: number },
  jetztMs: number,
): { zustand: AnkunftZustand; vorschlagen: boolean } {
  if (zustand.bestaetigt) return { zustand, vorschlagen: false };

  // Unbrauchbarer Fix darf den Zaehler weder starten noch zuruecksetzen.
  if (standort.genauigkeitM > GENAUIGKEIT_MAX_M) return { zustand, vorschlagen: false };

  const entfernungM = haversineM(standort.lat, standort.lon, ziel.lat, ziel.lon);
  if (entfernungM > ANKUNFT_RADIUS_M) {
    return { zustand: { ...zustand, seit: null }, vorschlagen: false };
  }

  const seit = zustand.seit ?? jetztMs;
  return {
    zustand: { ...zustand, seit },
    vorschlagen: jetztMs - seit >= ANKUNFT_VERWEIL_MS,
  };
}

interface GeoPunkt {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: { rolle?: string };
}

/**
 * Zielmarker aus dem Routen-GeoJSON. Stufe 3 liefert null: Die Koordinaten des
 * Synthesemodells sind konstruiert (backend/src/core/synthmodell.ts), eine
 * Distanzpruefung dagegen waere sinnlos.
 */
export function zielKoordinate(route: RouteErgebnis): { lat: number; lon: number } | null {
  if (route.stufe === 3 || !route.karte) return null;
  for (const sammlung of Object.values(route.karte)) {
    const features = (sammlung as { features?: GeoPunkt[] })?.features ?? [];
    for (const feature of features) {
      if (feature.properties?.rolle !== 'ziel') continue;
      if (feature.geometry?.type !== 'Point') continue;
      const koord = feature.geometry.coordinates;
      if (!Array.isArray(koord) || koord.length < 2) continue;
      const [lon, lat] = koord as number[];
      if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon };
    }
  }
  return null;
}
