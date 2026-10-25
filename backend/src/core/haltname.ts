/**
 * Namen von Halten aus dem IRIS-Laufweg (25.10.2026).
 *
 * Die Tafel nennt den vorherigen und naechsten Halt eines Zuges beim Namen;
 * die Lage dazu kommt aus RIS::Stations. Gezaehlt wird nur ein Treffer mit
 * GENAU diesem Namen - ein aehnlicher („Oststadt Süd" fuer „Oststadt") laege
 * womoeglich auf der anderen Seite des Bahnhofs, und die Zugspitze stuende am
 * falschen Ende.
 *
 * Bahnhofsteile traegt IRIS mit Zusatz: „München Hbf (tief)", „Hamburg Hbf
 * (S-Bahn)", „Berlin Ostkreuz (S)", „München Hbf Gl.27-36". RIS::Stations
 * kennt sie ohne. Der Zusatz benennt einen Teil DESSELBEN Bahnhofs - ihn
 * abzustreifen aendert die Lage um einige hundert Meter, nicht die Seite.
 */

const ZUSATZ = [/\s*\((?:tief|S-Bahn|S)\)\s*$/, /\s+Gl\.\s*\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?\s*$/];

/** Die Namen, unter denen ein Halt gesucht wird: wie er ist, dann ohne Zusatz. */
export function haltnamenZurSuche(name: string): string[] {
  const ohne = ZUSATZ.reduce((n, muster) => n.replace(muster, ''), name).trim();
  return ohne && ohne !== name ? [name, ohne] : [name];
}

/** Vergleich von Bahnhofsnamen ohne Gross/klein und doppelte Leerzeichen. */
export function gleicherHaltname(a: string, b: string): boolean {
  const norm = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}
