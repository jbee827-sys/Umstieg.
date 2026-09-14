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

export interface SchemaBahnsteig {
  bahnsteigId: string;
  gleise: string[];
  /** Fehlt, wenn keine Bahnsteigachse bekannt ist – dann NICHT maßstäblich zeichnen. */
  laengeM?: number;
  /** Lage quer zur Gleisrichtung, kleinster Wert der Ebene = 0. Seite willkürlich. */
  querM?: number;
  rolle?: 'start' | 'ziel';
  anlagen?: { aufzug: number; rolltreppe: number; treppe: number };
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
  typ: 'gleiswechsel' | 'verspaetung' | 'heartbeat' | 'quelle-weg' | 'quelle-da';
  zug?: string;
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
