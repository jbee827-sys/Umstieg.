import { GESCHWINDIGKEIT, gehzeitSekunden } from './gehzeit.js';
import { haversineM, pfadZuGeoJSON } from './graph.js';
import { generiereSchritte } from './textgen.js';
import type { Gehprofil, RoutenPfad, Steigpunkt, Weg } from './typen.js';

/**
 * Fußweg des Haltestellenpfads (Umstieg 2.0, Spec 5.5/5.6) in derselben Form
 * wie `/api/route`, damit Schrittliste, Karte und Ampel auf beiden Pfaden
 * gleich rechnen.
 */

/** Gegenstück zur Stufe 3 im Bahnhofspfad (Spec 5.6, V: 1,3). */
export const UMWEGFAKTOR = 1.3;

export function wegAusPfad(pfad: RoutenPfad, profil: Gehprofil, zielZusatz?: string): Weg {
  return {
    stufe: 1,
    schritte: generiereSchritte(pfad, { profil, ...(zielZusatz ? { zielZusatz } : {}) }),
    gehzeitSek: gehzeitSekunden(pfad, profil),
    karte: pfadZuGeoJSON(pfad),
    hinweise: [],
    distanzM: Math.round(pfad.laengeM),
    herkunft: 'fussweg',
  };
}

export function wegAusLuftlinie(von: Steigpunkt, nach: Steigpunkt, profil: Gehprofil): Weg {
  const distanzM = Math.round(haversineM(von.lat, von.lon, nach.lat, nach.lon) * UMWEGFAKTOR);
  const gehzeitSek = Math.round(distanzM / GESCHWINDIGKEIT[profil]);
  const rund = Math.max(10, Math.round(distanzM / 10) * 10);
  const level = von.level ?? 0;
  return {
    stufe: 3,
    schritte: [{ text: `ca. ${rund} m zum Anschluss – ungefährer Weg`, typ: 'eben', distanzM: rund, sekunden: gehzeitSek }],
    gehzeitSek,
    karte: {
      [String(level)]: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[von.lon, von.lat], [nach.lon, nach.lat]] },
            properties: { route: true, level },
          },
        ],
      },
    },
    hinweise: ['Kein Fußweg im Kartenmaterial gefunden – ungefährer Weg aus der Luftlinie mit Umwegzuschlag.'],
    distanzM,
    herkunft: 'luftlinie',
  };
}
