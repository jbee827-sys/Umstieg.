/**
 * Gleisnamen in Normalform.
 *
 * Dieselbe Bahnsteigkante heisst je nach Quelle anders: RIS::Stations schreibt
 * „7G-I", der Fahrplan „7 G-I", manche Quellen setzen statt des Bindestrichs
 * einen Gedankenstrich („7 G–I"). Verglichen wird deshalb nie der Rohtext,
 * sondern die Normalform: ohne Leerraum, Striche vereinheitlicht, klein.
 * Zurueckgegeben wird weiterhin die Schreibweise des Graphen.
 */
export function normGleis(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase();
}

/** Meinen zwei Schreibweisen dasselbe Gleis? */
export function gleichesGleis(a: string, b: string): boolean {
  return normGleis(a) === normGleis(b);
}
