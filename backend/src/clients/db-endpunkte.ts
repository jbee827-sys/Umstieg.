// Zentrale DB-API-Marketplace-Endpunkte.
//
// TODO (Pflicht vor Live-Betrieb): Pfade und Antwortschemata gegen die aktuelle
// Marketplace-Doku verifizieren – die Schemata der Fixtures sind handgebaut.
// Quelle (geprüft 25.08.2026): developers.deutschebahn.com, Produktseite
// RIS::Stations (Endpunktliste) + developer-docs (Basis-URL, Auth-Header).
export const RIS_STATIONS_BASIS = 'https://apis.deutschebahn.com/db/apis/ris-stations/v1';

export const epStopPlacesByName = (query: string): string =>
  `${RIS_STATIONS_BASIS}/stop-places/by-name/${encodeURIComponent(query)}`;

export const epStopPlace = (eva: string): string =>
  `${RIS_STATIONS_BASIS}/stop-places/${encodeURIComponent(eva)}`;

export const epPlatforms = (eva: string): string =>
  `${RIS_STATIONS_BASIS}/platforms/${encodeURIComponent(eva)}`;
