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

// Timetables (IRIS-XML): /plan/{evaNo}/{YYMMDD}/{HH} + /fchg/{evaNo}
export const TIMETABLES_BASIS = 'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1';

export const epTafelPlan = (eva: string, zeitpunkt: Date): string => {
  const jj = String(zeitpunkt.getFullYear()).slice(2);
  const mm = String(zeitpunkt.getMonth() + 1).padStart(2, '0');
  const tt = String(zeitpunkt.getDate()).padStart(2, '0');
  const hh = String(zeitpunkt.getHours()).padStart(2, '0');
  return `${TIMETABLES_BASIS}/plan/${encodeURIComponent(eva)}/${jj}${mm}${tt}/${hh}`;
};

export const epTafelAenderungen = (eva: string): string =>
  `${TIMETABLES_BASIS}/fchg/${encodeURIComponent(eva)}`;

// Wagenreihung: öffentlicher Ist-Wagenreihungs-Dienst (JSON, ohne Schlüssel).
// Datum als JJJJMMTT.
export const WAGENREIHUNG_BASIS = 'https://ist-wr.noncd.db.de/wagenreihung/1.0';

export const epWagenreihung = (zugnummer: string, datum: string): string =>
  `${WAGENREIHUNG_BASIS}/${encodeURIComponent(zugnummer)}/${encodeURIComponent(datum)}`;
