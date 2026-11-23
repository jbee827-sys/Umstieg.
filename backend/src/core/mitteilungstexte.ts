// Texte der Reisewache-Mitteilungen nach Konzept 4a. Regeln: kein Satzpunkt am
// Ende, kein "Noch", kein "Bitte" - der Text soll auf dem Sperrbildschirm in
// einer Zeile gelesen werden. `anzeige` loest der Aufrufer auf (Linie wie
// "RE 3", sonst Zugname wie "ICE 1134").

export type MitteilungsArt =
  | 'rot' | 'erinnerung' | 'zeit-an' | 'zeit-ab' | 'gleis-an' | 'gleis-ab' | 'ausfall-an' | 'ausfall-ab';
export type Status = 'erreichbar' | 'knapp' | 'faellt-aus';

export interface Mitteilung {
  art: MitteilungsArt;
  titel: string;
  text: string;
  /** Buendel fuer apns-collapse-id / android collapse_key: `${art}|${zug}` */
  buendel: string;
  /** FCM `data`, nur Strings - Schluessel siehe `mitteilungsDaten` */
  daten: Record<string, string>;
}

export interface TextZug {
  anzeige: string;
  uhr: string;
  gleis: string;
  richtung: string;
}

type Text = { titel: string; text: string };

// `haltWort` zuletzt und mit Vorgabe 'Gleis': An einer Bushaltestelle hiesse
// es sonst "ab Gleis A" fuer einen Bussteig.
export function textRot(ab: TextZug, minuten: number, haltWort: 'Gleis' | 'Steig' = 'Gleis'): Text {
  return { titel: 'Anschluss knapp', text: `${ab.anzeige} in ${minuten} Min. ab ${haltWort} ${ab.gleis}` };
}

export function textErinnerung(bahnhofName: string, ab: TextZug, haltWort: 'Gleis' | 'Steig' = 'Gleis'): Text {
  return { titel: `Gleich in ${bahnhofName}`, text: `${ab.anzeige}: ${ab.uhr} ab ${haltWort} ${ab.gleis}` };
}

export function textZeitAn(an: TextZug, alt: string, neu: string, umstiegMin: number): Text {
  return { titel: `${an.anzeige}: ${neu} statt ${alt}`, text: `${umstiegMin} Min. zum Umsteigen` };
}

// `knapp`: Die Ampel steht schon auf Rot und bleibt es - dann ging keine
// eigene Rot-Mitteilung hinaus, und "erreichbar" waere schlicht falsch.
export function textZeitAb(ab: TextZug, alt: string, neu: string, knapp = false): Text {
  return { titel: `${ab.anzeige}: ${neu} statt ${alt}`, text: knapp ? 'Anschluss knapp' : 'Anschluss erreichbar' };
}

export function textGleis(
  zug: TextZug,
  seite: 'an' | 'ab',
  haltWort: 'Gleis' | 'Steig',
  alt: string,
  neu: string,
): Text {
  const titel = `${haltWort} ${neu} statt ${alt}`;
  return seite === 'ab'
    ? { titel, text: `${zug.anzeige} nach ${zug.richtung}, ab ${zug.uhr}` }
    : { titel, text: `${zug.anzeige} aus ${zug.richtung}, an ${zug.uhr}` };
}

export function textAusfall(zug: TextZug): Text {
  return { titel: `${zug.anzeige} fällt aus`, text: 'Andere Verbindung wählen' };
}

/** FCM erlaubt in `data` nur Strings; Zahlen als Dezimalstring, fehlende Felder entfallen. */
export function mitteilungsDaten(d: {
  art: MitteilungsArt;
  zug: string;
  anzeige: string;
  seite: 'an' | 'ab';
  alt?: string;
  neu?: string;
  restMin: number;
  gehMin: number;
  status: Status;
  stand: string;
  gleisAlt?: string;
  gleisNeu?: string;
  aktion: 'weg' | 'verbindung';
  aktionGleis?: string;
}): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const [schluessel, wert] of Object.entries(d)) {
    if (wert === undefined) continue;
    aus[schluessel] = typeof wert === 'number' ? String(wert) : wert;
  }
  return aus;
}
