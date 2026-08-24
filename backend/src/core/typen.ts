// Zentrale Typdefinitionen – alle Module verwenden exakt diese Namen
// (Referenz: Implementierungsplan, Abschnitt „Geteilte Typen").

export type KantenTyp = 'eben' | 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';
export type Gehprofil = 'zuegig' | 'normal' | 'langsam';
export type RoutenVariante = 'schnellste' | 'einfachste' | 'barrierefrei';
export type Stufe = 1 | 2 | 3;

// --- OSM / Overpass ---

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number; // nur node
  lon?: number; // nur node
  nodes?: number[]; // nur way
  tags?: Record<string, string>;
}

export interface OverpassAntwort {
  elements: OsmElement[];
}

// --- Routing-Graph ---

export interface GraphKnoten {
  id: string; // OSM: "n<id>"; synthetisch: "gleis7:mitte"
  lat: number;
  lon: number;
  level: number; // OSM level-Tag; 0 wenn unbekannt
  gleis?: string; // an Bahnsteigpunkten: "7", "7a"
  abschnitt?: string; // "A".."F" | "anfang" | "mitte" | "ende"
}

export interface GraphKante {
  von: string;
  nach: string;
  laengeM: number;
  deltaLevel: number; // level(nach) - level(von)
  typ: KantenTyp;
  barrierefrei: boolean;
  status?: 'ACTIVE' | 'INACTIVE'; // FaSta, nur aufzug/rolltreppe
}

export interface StationGraph {
  knoten: Map<string, GraphKnoten>;
  adjazenz: Map<string, GraphKante[]>; // ungerichtet: Kante in beiden Listen
  stufe: Stufe;
  gleise: string[]; // sortierte, eindeutige Gleisbezeichner
}

// --- Route und Ausgabe ---

export interface RoutenPfad {
  knoten: GraphKnoten[];
  kanten: GraphKante[]; // kanten[i] verbindet knoten[i] und knoten[i+1]
  laengeM: number;
}

export interface Schritt {
  text: string; // fertiger deutscher Anweisungssatz
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number; // auf 10 m gerundet, nur bei eben/rampe
}

export interface RouteErgebnis {
  stufe: Stufe;
  schritte: Schritt[];
  gehzeitSek: number;
  karte?: Record<string, unknown>; // GeoJSON FeatureCollection je Ebene
  hinweise: string[]; // transparente Degradations-/Fallback-Hinweise
}

// --- DB-Datenquellen ---

export interface BahnhofTreffer {
  name: string;
  eva: string;
  lat: number;
  lon: number;
}

export interface StationsInfo {
  eva: string;
  name: string;
  gleise: { gleis: string; lat?: number; lon?: number }[];
}

export interface FastaAnlage {
  typ: 'AUFZUG' | 'ROLLTREPPE';
  lat: number;
  lon: number;
  status: 'ACTIVE' | 'INACTIVE';
  beschreibung?: string;
}

export interface TafelEintrag {
  zug: string;
  zeitSoll: string;
  zeitIst?: string;
  gleisSoll: string;
  gleisIst?: string;
  ziel: string;
}
