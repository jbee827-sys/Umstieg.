// Zentrale Typdefinitionen – alle Module verwenden exakt diese Namen
// (Referenz: Implementierungsplan, Abschnitt „Geteilte Typen").

export type KantenTyp = 'eben' | 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';
export type Gehprofil = 'zuegig' | 'normal' | 'langsam';
export type RoutenVariante = 'schnellste' | 'einfachste' | 'barrierefrei' | 'mit-stopp';
export type Stufe = 1 | 2 | 3;

// --- OSM / Overpass ---

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number; // nur node
  lon?: number; // nur node
  nodes?: number[]; // nur way
  members?: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[]; // nur relation
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
  bahnsteigId?: string; // gleicher Wert = gleicher physischer Bahnsteig
  /** Zwischenziel der Variante `mit-stopp` (Konzept: WC & Kiosk). */
  poi?: 'wc' | 'kiosk';
}

export interface GraphKante {
  von: string;
  nach: string;
  laengeM: number;
  deltaLevel: number; // level(nach) - level(von)
  typ: KantenTyp;
  barrierefrei: boolean;
  status?: 'ACTIVE' | 'INACTIVE'; // FaSta, nur aufzug/rolltreppe
  /**
   * Welche FaSta-Anlage diese Kante erzeugt hat (Synthesemodell).
   *
   * STABIL, darf deshalb in den Graphcache - anders als `status`. Damit
   * findet der Live-Status seine Kante ueber die Identitaet statt ueber die
   * Entfernung, die im verankerten Modell nicht mehr traegt.
   */
  anlageId?: string;
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
  /** Gehzeit dieses Schritts. Summe aller Schritte = gehzeitSek (Invariante). */
  sekunden?: number;
  /** Ebene, auf der der Schritt ENDET - bei einem Wechsel die Zielebene. */
  level?: number;
  /** Indexbereich im Routenpfad - daraus zeichnet die Karte das Teilstueck. */
  knotenVon?: number;
  knotenBis?: number;
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
  lat?: number; // Stationsposition (für den Overpass-Abruf)
  lon?: number;
  /**
   * Alle Verkehrsstellen dieses Bahnhofs (RIS::Stations `groupMembers`),
   * einschliesslich `eva`. Grosse Bahnhöfe sind mehrere: Berlin Hbf ist
   * 8011160 (Halle), 8098160 (tief) und 8089021 (S-Bahn) – kein einzelnes
   * EVA kennt Gleis 6 und 14 zugleich. `gleise` ist die Vereinigung über
   * alle Mitglieder.
   */
  evas: string[];
  /** StaDa-Bahnhofsnummer – die Adressierung, die FaSta erwartet. */
  stationID?: string;
  /**
   * Wie viele Verkehrsstellen ihre Gleisliste schuldig blieben.
   *
   * Ohne diese Zahl war eine unvollständige Liste von einer vollständigen
   * nicht zu unterscheiden. Wer dann nach einem fehlenden Gleis fragte, bekam
   * „gleis-unbekannt“ – die falsche Auskunft: Nicht das Gleis ist unbekannt,
   * wir konnten nur nicht fragen.
   *
   * Fehlt das Feld, ist nichts ausgefallen. Optional, weil es genau EINEN
   * echten Erzeuger gibt (`holeStationsInfo`); alles andere sind Fixtures,
   * die sich damit nicht befassen sollen.
   */
  gleisteileOhneAntwort?: number;
  /**
   * Ob die Verkehrsstellengruppe gar nicht erst aufgelöst werden konnte.
   *
   * Der Unterschied zu `gleisteileOhneAntwort` ist wichtig genug für ein
   * eigenes Feld: Dort haben wir gefragt und keine Antwort bekommen, hier
   * haben wir nie gefragt. Scheitert die Namenssuche, bleibt es bei der einen
   * Verkehrsstelle – deren Gleisliste kann tadellos ankommen, und der Zähler
   * steht trotzdem auf 0. Die Liste ist deshalb nicht weniger unvollständig:
   * Berlin Hbf führt Gleis 6 unter 8098160, das dann nie abgefragt wurde.
   *
   * Fehlt das Feld, war die Gruppe vollständig (oder es gibt keine).
   */
  gruppeUnvollstaendig?: boolean;
  /**
   * Die Gleise aller Verkehrsstellen, nach Namen vereinigt.
   *
   * `evas` nennt, welche Mitglieder das Gleis fuehren – der Trenner fuer
   * Konzeptluecke §4.3. Zwei Gleise mit disjunkten `evas` koennen nie
   * derselbe physische Bahnsteig sein, was OSM auch behauptet. Mehrere
   * Eintraege sind ein echtes „beides“ und kein Grund zu trennen: Muenchen
   * fuehrt Gleis 13 unter drei Mitgliedern, betrieblich unterteilt statt
   * physisch getrennt.
   *
   * `evas` ist optional aus demselben Grund wie `gleisteileOhneAntwort`: Es
   * gibt genau EINEN echten Erzeuger (`holeStationsInfo`), alles andere sind
   * Fixtures. Fehlt es, ist die Herkunft unbekannt – und dann entscheidet
   * OSM, wie vor dem 04.09.2026. Das ist der sichere Rueckfall, nicht der
   * Ausnahmefall.
   */
  gleise: { gleis: string; evas?: string[]; lat?: number; lon?: number }[];
}

export interface FastaAnlage {
  /**
   * Stabile Identitaet der Anlage (FaSta `equipmentnumber`).
   *
   * Wird gebraucht, um den LIVE-Status einer Kante zuzuordnen, die im
   * GECACHTEN Graphen steht. Ueber die Entfernung ginge das nicht: Im
   * verankerten Synthesemodell sitzt der Kantenknoten auf dem
   * Bahnsteigschwerpunkt, die Anlage an ihrem echten Ort - an Berlins 280 m
   * langen Bahnsteigen bis zu ~140 m auseinander.
   */
  id: string;
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
