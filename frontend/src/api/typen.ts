// Aus dem Backend gespiegelte Typen (backend/src/core/typen.ts) –
// bei Änderungen dort hier nachziehen.

export type KantenTyp = 'eben' | 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';
export type Gehprofil = 'zuegig' | 'normal' | 'langsam';
export type RoutenVariante = 'schnellste' | 'einfachste' | 'barrierefrei' | 'mit-stopp';
/**
 * Wo am Ankunftsgleis jemand steht.
 *
 * Solange die Wagenreihung tot ist (siehe README, 04.09.2026), ist das die
 * EINZIGE Eingabe, die den Weg kennt: An einem Kopfbahnhof entscheidet sie,
 * ob die U-Form ueber den Bahnhofskopf oder die Unterfuehrung am anderen
 * Ende der kuerzere Weg ist.
 */
export type Bahnsteigabschnitt = 'anfang' | 'mitte' | 'ende';
export type Stufe = 1 | 2 | 3;
export type Ampelfarbe = 'gruen' | 'gelb' | 'rot';

export interface Schritt {
  text: string;
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number;
  /** Gehzeit dieses Schritts. Summe aller Schritte = gehzeitSek. */
  sekunden?: number;
  /** Ebene, auf der der Schritt endet. */
  level?: number;
  /** Indexbereich im Routenpfad. */
  knotenVon?: number;
  knotenBis?: number;
}

// Schematisches Bahnhofsbild aus /api/route – Spiegel von
// backend/src/core/typen.ts. Die Begründungen zu den einzelnen Feldern stehen
// dort; hier nur, was der Zeichner wissen muss.

/** Meter. Ursprung = Startpunkt der Route, x-Achse = Gleisrichtung der Ankunftsebene. */
export interface SchemaPunkt {
  x: number;
  y: number;
}

/** Alle Anlagen, die an derselben Stelle den Bahnsteig verlassen. */
export interface SchemaZugang {
  /** Meter entlang des Bahnsteigs, 0 = Bahnsteiganfang. */
  beiM: number;
  pos: SchemaPunkt;
  aufzug: number;
  rolltreppe: number;
  treppe: number;
  aufRoute: boolean;
}

/** Vergleichend: „N" = das nördlichere der beiden Enden. Spiegel von backend/src/core/typen.ts. */
export type Himmelsrichtung = 'N' | 'O' | 'S' | 'W';

export interface SchemaBahnsteig {
  bahnsteigId: string;
  gleise: string[];
  /** Fehlt, wenn keine Bahnsteigachse bekannt ist – dann NICHT maßstäblich zeichnen. */
  laengeM?: number;
  /** Lage quer zur Gleisrichtung, kleinster Wert der Ebene = 0. Seite willkürlich. */
  querM?: number;
  rolle?: 'start' | 'ziel';
  anlagen?: { aufzug: number; rolltreppe: number; treppe: number };
  /** Wohin die Enden zeigen: `von` ist der Anfang. Nur bei gemessener Achse. */
  himmelsrichtung?: { von: Himmelsrichtung; bis: Himmelsrichtung };
  von?: SchemaPunkt;
  bis?: SchemaPunkt;
  /** Nur am Ankunfts- und Abfahrtsbahnsteig. */
  zugaenge?: SchemaZugang[];
}

export interface SchemaAnlage {
  typ: KantenTyp;
  vonLevel: number;
  nachLevel: number;
  beiGleisen?: string[];
  pos?: SchemaPunkt;
  beiM?: number;
}

export interface SchemaPoi {
  art: 'wc' | 'kiosk';
  level: number;
  beiGleisen?: string[];
}

/** Ein Stück begehbarer Weg auf einer Ebene – der Grundriss, nicht die Route. */
export interface SchemaWegstueck {
  punkte: SchemaPunkt[];
}

/**
 * Ein Ebenenwechsel, wie er auf DIESER Ebene im Grundriss liegt.
 *
 * Form aus dem Typ: Rolltreppe durchgezogen, Treppe gestrichelt, Aufzug als
 * Kasten – eine Treppe läuft waagerecht mit und ist eine Strecke, ein Aufzug
 * steht still und ist ein Punkt.
 */
export interface SchemaElement {
  typ: KantenTyp;
  /** Zwei Punkte bei Treppe/Rolltreppe/Rampe, EINER beim Aufzug. */
  punkte: SchemaPunkt[];
  aufRoute: boolean;
  /** Meter entlang des Bahnsteigs, wenn die Anlage an einem liegt. */
  beiM?: number;
}

/**
 * EIN BESUCH einer Ebene, nicht die Ebene selbst.
 *
 * Die Liste folgt dem WEG, nicht der Höhe: Wer hinunter in die Unterführung
 * geht und wieder herauf, hat drei Einträge – Ebene 1, Ebene 0, Ebene 1.
 * Derselbe `level` kann also mehrfach vorkommen, und wer die Liste mit
 * `find` durchsucht, findet den falschen Besuch.
 */
export interface SchemaEbene {
  level: number;
  /** Erster Besuch = `start`, letzter = `ziel`, dazwischen nichts. */
  rolle?: 'start' | 'ziel';
  art: 'gleise' | 'verbindung';
  richtungGrad?: number;
  /** Lage IM Bezugsrahmen; 0 = waagerecht wie die Ankunftsebene. */
  richtungLokalGrad?: number;
  bahnsteige: SchemaBahnsteig[];
  /**
   * Der Weg auf DIESEM Besuch, als Linienzug im Bezugsrahmen.
   *
   * Ein einzelner Linienzug, weil die Trennung nach Besuchen schon in der
   * Liste steckt. Bei einem Besuch, der nur senkrecht durchquert wird
   * (hinunter und sofort weiter hinunter), steht hier EIN Punkt.
   */
  weg?: SchemaPunkt[];
  /** Begehbares Netz in Routennähe – nur bei `art: 'verbindung'`. */
  netz?: SchemaWegstueck[];
  /** Ebenenwechsel als sichtbare Bezugspunkte. */
  elemente?: SchemaElement[];
}

export interface SchemaWechsel {
  vonLevel: number;
  nachLevel: number;
  typ: KantenTyp;
}

export interface BahnhofSchema {
  /** Von oben nach unten. */
  ebenen: SchemaEbene[];
  /** Nur die Anlagen der Route – je eine je Ebenenwechsel. */
  anlagen: SchemaAnlage[];
  pois: SchemaPoi[];
  wechsel: SchemaWechsel[];
  kreuzungswinkelGrad?: number;
  /** Gehört sichtbar an die Darstellung. */
  vorbehalte: string[];
}

export interface RouteErgebnis {
  stufe: Stufe;
  schritte: Schritt[];
  gehzeitSek: number;
  karte?: Record<string, unknown>;
  schema?: BahnhofSchema;
  hinweise: string[];
}

export interface BahnhofTreffer {
  name: string;
  eva: string;
  lat: number;
  lon: number;
}

export interface TafelEintrag {
  zug: string;
  zeitSoll: string;
  zeitIst?: string;
  gleisSoll: string;
  gleisIst?: string;
  ziel: string;
}

/** Spiegel von backend/src/core/ueberwachung.ts – SSE-Ereignisse. */
export interface LiveEreignis {
  /** `ausfall` nur im Haltestellenpfad: Die Fahrt fällt aus. */
  typ: 'gleiswechsel' | 'verspaetung' | 'heartbeat' | 'quelle-weg' | 'quelle-da' | 'ausfall';
  /** Im Haltestellenpfad die Fahrt-ID, nicht zum Anzeigen. */
  zug?: string;
  /** Linie zum Anzeigen (Haltestellenpfad). */
  anzeige?: string;
  /** Nur im Frontend gesetzt (App.tsx): welche der beiden Fahrten gemeint ist. */
  seite?: 'an' | 'ab';
  /** Nur im Frontend gesetzt (App.tsx, Haltestellenpfad): wie der Halt dieser Fahrt heisst. */
  haltWort?: 'Gleis' | 'Steig';
  alt?: string;
  neu?: string;
  zeitstempel: string;
}

export interface RouteParameter {
  eva: string;
  gleisAn: string;
  gleisAb: string;
  zugAn?: string;
  wagen?: string;
  abschnitt?: Bahnsteigabschnitt;
  profil: Gehprofil;
  variante: RoutenVariante;
}

// --- Haltestellenpfad (Umstieg 2.0) – Spiegel von backend/src/core/typen.ts ---

export type Verkehrsmittel = 'bus' | 'tram' | 'ubahn' | 'sbahn' | 'bahn' | 'faehre' | 'sonstiges';

/**
 * Ein Ort, an dem man umsteigen kann: ein DB-Bahnhof, eine Haltestelle oder
 * beides zugleich. Mindestens eine der beiden Kennungen ist gesetzt.
 */
export interface Ort {
  name: string;
  lat: number;
  lon: number;
  verkehrsmittel: Verkehrsmittel[];
  /** Gesetzt, wenn der Ort ein DB-Bahnhof ist – dann gibt es den Bahnhofspfad. */
  eva?: string;
  /**
   * MOTIS-Haltestellen-ID. Nicht blind wiederverwenden: Sie ändert sich mit
   * den Datenwechseln (A5) – gespeicherte Orte werden neu aufgelöst.
   */
  haltestelleId?: string;
}

export interface HaltestellenTafelEintrag {
  fahrtId: string;
  /** Anzeigename der Linie: „ICE 1206“, „S5“, „245“. */
  linie: string;
  verkehrsmittel: Verkehrsmittel;
  /** Abfahrt: Fahrtziel. Ankunft: Herkunft der Fahrt. */
  ziel: string;
  /** ISO-Zeitstempel, Soll. */
  zeitSoll: string;
  /** ISO-Zeitstempel, nur bei Echtzeit. */
  zeitIst?: string;
  steigSoll?: string;
  /** Nur gesetzt, wenn er vom Soll abweicht. */
  steigIst?: string;
  steigLat: number;
  steigLon: number;
  steigLevel?: number;
  /** false: Die Koordinate ist die der Haltestelle, nicht die des Steigs. */
  steigGenau: boolean;
  /** F5: Ohne Echtzeit zeigt die Oberfläche „laut Fahrplan“. */
  echtzeit: boolean;
  ausfall: boolean;
}

export interface Steigpunkt {
  lat: number;
  lon: number;
  level?: number;
}

/** Fußweg des Haltestellenpfads – dieselbe Form wie `/api/route`, plus Herkunft. */
export interface Weg extends RouteErgebnis {
  distanzM: number;
  /** `fussweg`: aus dem Kartenmaterial geroutet. `luftlinie`: Schätzung. */
  herkunft: 'fussweg' | 'luftlinie';
}

/** Wie es einer Quelle bei der Ortssuche ging (Spiegel von routes/haltestellen.ts). */
export type QuellenStand = 'ok' | 'zugang-fehlt' | 'ausfall' | 'nicht-eingerichtet';

export interface OrteAntwort {
  orte: Ort[];
  quellen: { bahnhoefe: QuellenStand; haltestellen: QuellenStand };
}
