// Zentrale DB-API-Marketplace-Endpunkte.
//
// TODO (Pflicht vor Live-Betrieb): Pfade und Antwortschemata gegen die aktuelle
// Marketplace-Doku verifizieren – die Schemata der Fixtures sind handgebaut.
// Quelle (geprüft 25.08.2026): developers.deutschebahn.com, Produktseite
// RIS::Stations (Endpunktliste) + developer-docs (Basis-URL, Auth-Header).
export const RIS_STATIONS_BASIS =
  'https://apis.deutschebahn.com/db-api-marketplace/apis/ris-stations/v1';

export const epStopPlacesByName = (query: string): string =>
  `${RIS_STATIONS_BASIS}/stop-places/by-name/${encodeURIComponent(query)}`;

// Umkreissuche (Standorterkennung). Wie alle Pfade hier vor Live-Betrieb
// gegen die Marketplace-Doku verifizieren – siehe TODO im Dateikopf.
export const epStopPlacesByPosition = (lat: number, lon: number, radiusM: number): string =>
  `${RIS_STATIONS_BASIS}/stop-places/by-position?latitude=${lat}&longitude=${lon}&radius=${radiusM}`;

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

// FaSta (Aufzüge/Rolltreppen mit Betriebsstatus).
// TODO vor Live-Betrieb: FaSta adressiert Bahnhofsnummern (StaDa), nicht
// EVA-Nummern – Zuordnung klären; bis dahin wird die EVA durchgereicht.
export const FASTA_BASIS = 'https://apis.deutschebahn.com/db-api-marketplace/apis/fasta/v2';

export const epFastaFacilities = (stationsnummer: string): string =>
  `${FASTA_BASIS}/facilities?stationnumber=${encodeURIComponent(stationsnummer)}`;

// Wagenreihung: öffentlicher Ist-Wagenreihungs-Dienst (JSON, ohne Schlüssel).
// Datum als JJJJMMTT.
export const WAGENREIHUNG_BASIS = 'https://ist-wr.noncd.db.de/wagenreihung/1.0';

export const epWagenreihung = (zugnummer: string, datum: string): string =>
  `${WAGENREIHUNG_BASIS}/${encodeURIComponent(zugnummer)}/${encodeURIComponent(datum)}`;
