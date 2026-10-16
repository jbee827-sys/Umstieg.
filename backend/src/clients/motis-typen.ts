/**
 * Antwortformen der MOTIS-API (OpenAPI, Branch master, 16.10.2026) – nur die
 * Felder, die Umstieg. liest. Ausserhalb von `clients/motis*.ts` und
 * `clients/haltestellen.ts` kommt keiner dieser Typen vor (Spec 5.1): Routen
 * und Kern arbeiten mit den eigenen Typen aus `core/typen.ts`.
 */
export interface MotisMatch {
  type: 'ADDRESS' | 'PLACE' | 'STOP';
  name: string;
  id: string;
  lat: number;
  lon: number;
  level?: number;
  country?: string;
  modes?: string[];
  score?: number;
}

export interface MotisPlace {
  name: string;
  stopId?: string;
  parentId?: string;
  lat: number;
  lon: number;
  level?: number;
  arrival?: string;
  departure?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  scheduledTrack?: string;
  track?: string;
  description?: string;
  cancelled?: boolean;
}

export interface MotisStopTime {
  place: MotisPlace;
  mode: string;
  realTime: boolean;
  headsign: string;
  tripFrom: MotisPlace;
  tripTo: MotisPlace;
  tripId: string;
  routeShortName: string;
  tripShortName: string;
  displayName?: string;
  /** `NOT_ALLOWED` trägt auch eine ausgefallene Fahrt – nicht blind filtern. */
  pickupDropoffType: string;
  cancelled: boolean;
  tripCancelled: boolean;
}

export interface MotisStoptimesAntwort {
  stopTimes: MotisStopTime[];
  place: MotisPlace;
}

export interface MotisPolylinie {
  points: string;
  precision: number;
  length: number;
}

export interface MotisSchritt {
  relativeDirection: string;
  distance: number;
  fromLevel: number;
  toLevel: number;
  polyline: MotisPolylinie;
  streetName: string;
}

export interface MotisLeg {
  mode: string;
  from: MotisPlace;
  to: MotisPlace;
  duration: number;
  distance?: number;
  realTime: boolean;
  headsign?: string;
  displayName?: string;
  routeShortName?: string;
  legGeometry: MotisPolylinie;
  steps?: MotisSchritt[];
  intermediateStops?: MotisPlace[];
}

export interface MotisItinerary {
  duration: number;
  legs: MotisLeg[];
}

export interface MotisPlanAntwort {
  direct: MotisItinerary[];
  itineraries: MotisItinerary[];
}
