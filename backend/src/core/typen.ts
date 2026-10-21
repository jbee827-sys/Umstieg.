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
  /** Overpass meldet Laufzeitfehler mit HTTP 200 und einem Hinweis hier. */
  remark?: string;
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
  /** Maßstabsfreies Bahnhofsbild für die schematische Navigation. */
  schema?: BahnhofSchema;
  hinweise: string[]; // transparente Degradations-/Fallback-Hinweise
}

// --- Schematisches Bahnhofsbild ---
//
// Getrennt von `karte` (GeoJSON) und nicht daraus ableitbar: Die Karte
// beantwortet „wo auf der Erde“, das Schema „wie liegt es zueinander“. Für
// eine geschlossene Halle ist die zweite Frage die nützliche, und sie lässt
// sich auch dann beantworten, wenn die erste keine brauchbare Antwort hat.

/**
 * Ein Punkt im Bahnhofs-Bezugsrahmen, in METERN.
 *
 * Ursprung ist der Startpunkt der Route, die x-Achse die Gleisrichtung der
 * Startebene. Damit liegt der Ankunftsbahnsteig waagerecht, alles andere in
 * seiner echten Lage dazu - auch eine Ebene, die quer dazu steht.
 */
export interface SchemaPunkt {
  x: number;
  y: number;
}

/**
 * Eine Zugangsstelle: alle Anlagen, die am selben Ort den Bahnsteig verlassen.
 *
 * Einzeln aufgefuehrt sind sie Rauschen - Berlins Bahnsteig 5/6 traegt 27
 * Anlagen auf 430 m. Gebuendelt sind sie die Auskunft, die der Reisende
 * braucht: "Zugang bei 127 m, vier Rolltreppen".
 */
export interface SchemaZugang {
  /** Lage entlang des Bahnsteigs in Metern, 0 = Bahnsteiganfang. */
  beiM: number;
  pos: SchemaPunkt;
  aufzug: number;
  rolltreppe: number;
  treppe: number;
  /** Nutzt die Route genau diesen Zugang? */
  aufRoute: boolean;
}

/**
 * Himmelsrichtung eines Bahnsteigendes – VERGLEICHEND: „N" heisst „das
 * nördlichere der beiden Enden", nicht „genau im Norden".
 */
export type Himmelsrichtung = 'N' | 'O' | 'S' | 'W';

export interface SchemaBahnsteig {
  bahnsteigId: string;
  /** Gleise an diesem Bahnsteig, aufsteigend – "5", "6". */
  gleise: string[];
  /**
   * Bahnsteiglänge in Metern, oder `undefined`.
   *
   * `undefined` heisst „nicht bekannt“ und ist ein echter Fall: Das
   * Standardmodell (Stufe 3) kennt nur einen Bahnsteigpunkt, keine Achse.
   * Eine erfundene Länge wäre schlimmer als keine – der Balken behauptete
   * sonst einen Maßstab, den niemand geprüft hat.
   */
  laengeM?: number;
  /**
   * Lage quer zur Gleisrichtung in Metern, kleinster Wert der Ebene = 0.
   *
   * Welche SEITE dabei die Null trägt, ist willkürlich – ein Schema hat
   * keinen Kompass. Die REIHENFOLGE und die ABSTÄNDE sind es nicht.
   */
  querM?: number;
  rolle?: 'start' | 'ziel';
  /**
   * Anlagen an diesem Bahnsteig, gezählt statt einzeln aufgeführt.
   *
   * Berlin hat rund 200 Ebenenwechsel; ein Schema hat Platz für eine
   * Handvoll. Eine Zahl („2 Aufzüge") ist das, was ein Bild davon zeigen
   * kann — die Liste wäre nur Gewicht in der Antwort.
   */
  anlagen?: { aufzug: number; rolltreppe: number; treppe: number };
  /**
   * Wohin die Enden zeigen: `von` ist der Bahnsteiganfang, `bis` das Ende.
   *
   * Nur bei gemessener Achse. Die Knöpfe „Nordende · Mitte · Südende" lesen
   * es von hier; im Standardmodell wäre die Richtung erfunden.
   */
  himmelsrichtung?: { von: Himmelsrichtung; bis: Himmelsrichtung };
  /** Bahnsteigenden im Bezugsrahmen - fehlen ohne Achse (Stufe 3). */
  von?: SchemaPunkt;
  bis?: SchemaPunkt;
  /**
   * Wo man diesen Bahnsteig verlassen kann, in Reihenfolge entlang der Achse.
   *
   * Nur am Ankunfts- und Abfahrtsbahnsteig: An den uebrigen interessiert die
   * Zahl, nicht die Stelle, und die Antwort bliebe sonst nicht klein.
   */
  zugaenge?: SchemaZugang[];
}

export interface SchemaAnlage {
  typ: KantenTyp;
  vonLevel: number;
  nachLevel: number;
  /** Bahnsteig, an dem die Anlage liegt – fehlt, wenn ihr keiner nahe genug ist. */
  beiGleisen?: string[];
  /** Lage im Bezugsrahmen – fehlt nur, wenn die Ebene keine Geometrie hat. */
  pos?: SchemaPunkt;
  /** Lage entlang des Bahnsteigs in Metern, wenn sie an einem liegt. */
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
 * Ein Reisender richtet sich nicht an Koordinaten aus, sondern an dem, was er
 * sieht: "an der zweiten Rolltreppe links". Deshalb tragen die Anlagen ihren
 * Grundriss, nicht nur ihre Zahl.
 */
export interface SchemaElement {
  typ: KantenTyp;
  /** Zwei Punkte bei Treppe/Rolltreppe/Rampe, EINER beim Aufzug. */
  punkte: SchemaPunkt[];
  /** Führt die Route über diese Anlage? */
  aufRoute: boolean;
  /** Meter entlang des Bahnsteigs, wenn die Anlage an einem liegt. */
  beiM?: number;
}

/**
 * EIN BESUCH einer Ebene, nicht die Ebene selbst.
 *
 * Die Liste folgt dem Weg, nicht der Hoehe: Wer hinunter in die
 * Unterfuehrung geht und wieder herauf, hat drei Eintraege - Ebene 0,
 * Ebene -1, Ebene 0. Eine nach Hoehe sortierte Liste verschwiege genau die
 * Reihenfolge, der jemand folgt, und musste den Weg in Stuecke zerlegen, die
 * dann niemand mehr zuordnen kann.
 */
export interface SchemaEbene {
  level: number;
  /** Erster Besuch = `start`, letzter = `ziel`, dazwischen nichts. */
  rolle?: 'start' | 'ziel';
  /** `gleise` = trägt Bahnsteige · `verbindung` = Halle, Unterführung, Steg. */
  art: 'gleise' | 'verbindung';
  /** Gleisrichtung in Grad (0–180), nur bei `art: 'gleise'`. */
  richtungGrad?: number;
  /**
   * Wie diese Ebene IM BEZUGSRAHMEN liegt, in Grad.
   *
   * 0 = waagerecht wie die Startebene. Berlins Tiefebene steht bei 81 - wer
   * die Baender waagerecht stapeln will, dreht sie um genau diesen Wert und
   * weiss dabei, was er wegdreht.
   */
  richtungLokalGrad?: number;
  bahnsteige: SchemaBahnsteig[];
  /** Der Weg auf DIESEM Besuch, als Linienzug im Bezugsrahmen. */
  weg?: SchemaPunkt[];
  /**
   * Das begehbare Netz dieser Ebene in Routennähe.
   *
   * Nur bei `art: 'verbindung'`. Ohne es zeigt eine Übergangsebene eine rote
   * Linie im Nichts – der Reisende sieht, DASS er abbiegt, aber nicht, WORAN.
   * Berlins Ebene 1 ist ein Ring; das zu sehen beantwortet die Frage von
   * selbst. Auf einer Gleisebene wäre dasselbe Netz nur Gewirr: dort tragen
   * die Bahnsteige die Orientierung.
   */
  netz?: SchemaWegstueck[];
  /** Ebenenwechsel auf dieser Ebene, als sichtbare Bezugspunkte. */
  elemente?: SchemaElement[];
}

export interface SchemaWechsel {
  vonLevel: number;
  nachLevel: number;
  typ: KantenTyp;
}

export interface BahnhofSchema {
  /** Von oben nach unten, absteigend nach `level`. */
  ebenen: SchemaEbene[];
  /** Nur die Anlagen, die die Route nutzt – je eine je Ebenenwechsel. */
  anlagen: SchemaAnlage[];
  pois: SchemaPoi[];
  /** Ebenenwechsel der Route, in der Reihenfolge des Wegs. */
  wechsel: SchemaWechsel[];
  /**
   * Winkel zwischen Ankunfts- und Abfahrtsebene in Grad (0–90).
   *
   * Berlin Hbf ist ein Kreuzungsbahnhof: 81°. Ein Bild mit parallelen
   * Bändern verschweigt das – es darf, aber es soll die Wahl treffen können.
   */
  kreuzungswinkelGrad?: number;
  /** Was dieses Bild NICHT belegt. Gehört sichtbar an die Darstellung. */
  vorbehalte: string[];
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
  gleise: { gleis: string; evas?: string[]; lat?: number; lon?: number; ris?: RisPlatform }[];
}

/**
 * Ein Eintrag aus RIS::Stations `GET /platforms/{eva}` – UNVERÄNDERT, so wie
 * er kommt. Schema verifiziert gegen echte Antworten vom 02.10.2026 (Hamburg
 * Hbf, Köln Hbf, siehe `test/fixtures/db/platforms-hamburg-8002549.json`).
 *
 * Bis dahin las der Client nur `name` und warf den Rest weg – darunter
 * `parentPlatform`. Genau das braucht die Route: Der Fahrplan nennt
 * Teilgleise („7A-D", „2 D-G"), OSM bildet nur die physische Bahnsteigkante
 * „7" ab. Ein Teilgleis ist ein betrieblicher Abschnitt desselben Gleises,
 * damit zwei Züge hintereinander dort halten können.
 */
export interface RisPlatform {
  name: string;
  /** Das physische Gleis, zu dem ein Teilgleis gehört. Fehlt bei Hauptgleisen. */
  parentPlatform?: string;
  /** Gleise und Teilgleise am selben Bahnsteig – auch die gegenüberliegende Kante. */
  linkedPlatforms?: string[];
  /** Bahnsteiglänge in Metern; 0 heißt: nicht erfasst. */
  length?: number;
  /** Lage entlang des Bahnsteigs in Metern; bei Teilgleisen bisher stets 0. */
  start?: number;
  end?: number;
  headPlatform?: boolean;
  heights?: { start?: number; end?: number; height?: number }[];
  sectors?: unknown[];
  ifopt?: string;
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
  /** Nur Haltestellenpfad (Umstieg 2.0): Fahrt fällt aus. Der Bahnhofspfad setzt es nie. */
  ausfall?: boolean;
  /** Nur Haltestellenpfad: Linie zum Anzeigen; `zug` ist dort die Fahrt-ID. */
  anzeige?: string;
}

// --- Haltestellenpfad (Umstieg 2.0, Spec 5.3) ---
//
// Diese Typen beschreiben Umstieg., nicht MOTIS. Was MOTIS liefert, steht in
// `clients/motis-typen.ts` und kommt über `clients/haltestellen.ts` nicht hinaus.

/** Eigene, kleine Aufzählung. Unbekannte MOTIS-Werte werden `sonstiges`. */
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
   * MOTIS-Haltestellen-ID, unverändert durchgereicht. Nicht dauerhaft
   * speichern: Die IDs tragen den Quellnamen samt Jahreszahl und ändern sich
   * mit den Datenwechseln (Erkundung 16.10.2026, A5).
   */
  haltestelleId?: string;
}

export interface HaltestellenTafelEintrag {
  fahrtId: string;
  /** Anzeigename der Linie, so wie MOTIS ihn nennt: „ICE 1206“, „S5“, „245“. */
  linie: string;
  verkehrsmittel: Verkehrsmittel;
  /** Abfahrt: Fahrtziel. Ankunft: Herkunft der Fahrt. */
  ziel: string;
  /** ISO-Zeitstempel, Soll. */
  zeitSoll: string;
  /** ISO-Zeitstempel, nur bei Echtzeit. */
  zeitIst?: string;
  /** Steig laut Fahrplan („7“, „Pos. 12“, „A“) – fehlt, wenn nicht bekannt. */
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
  /**
   * Der Halt dieser Fahrt. Im Bahnhofsumkreis steht der Bus oft an einem Halt
   * mit eigenem Namen („Göttingen Bahnhof/ZOB“) – die Oberfläche nennt ihn,
   * und die Live-Überwachung fragt genau ihn ab.
   */
  haltId?: string;
  haltName?: string;
}

/** Ein Punkt, zwischen dem und einem anderen ein Fußweg gesucht wird. */
export interface Steigpunkt {
  lat: number;
  lon: number;
  level?: number;
}

/** Fußweg des Haltestellenpfads – dieselbe Form wie `/api/route`, plus Herkunft. */
export interface Weg extends RouteErgebnis {
  distanzM: number;
  /** `fussweg`: aus dem Kartenmaterial geroutet. `luftlinie`: Schätzung (Spec 5.6). */
  herkunft: 'fussweg' | 'luftlinie';
}

export interface FahrtHalt {
  name: string;
  zeitSoll?: string;
  zeitIst?: string;
  steig?: string;
}

export interface Fahrtverlauf {
  linie: string;
  ziel: string;
  halte: FahrtHalt[];
}
