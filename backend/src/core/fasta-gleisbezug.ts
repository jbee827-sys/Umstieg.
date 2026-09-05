/**
 * Gleisbezug aus dem FaSta-Feld `description`.
 *
 * Warum ueber den Text und nicht ueber die Geometrie: Eine Sondierung gegen
 * die echte API (05.09.2026, fuenf Bahnhoefe) hat gezeigt, dass rein
 * geometrisches Clustern der Anlagen falsch ist. Berlins Anlagenmenge streut
 * ueber 339 m, weil Parkhaeuser, Tram-Haltestellen und "Nicht
 * Reisendenrelevant" mit darin stehen; und die Clusterschwelle ist nicht
 * uebertragbar (30 m ergibt in Berlin 6 Cluster, in Hannover 2).
 *
 * `description` dagegen nennt fast immer ein GLEISPAAR - und ein Gleispaar
 * IST ein Bahnsteig. Das ist keine Vermutung, sondern die Auskunft selbst.
 */

/**
 * Vokabular und Zahlform, alle Bestandteile in den Rohantworten belegt:
 * "Gleis 15/16", "Gl 11/12", "Gl. 101/102", "Bstg Gl 3/4", "Bst 9/10".
 *
 * Zwei Feinheiten, die je einen Fehler verhindern:
 *
 * - `(\s*\/\s*|-)` laesst den Bindestrich NUR ohne Leerzeichen als Bereich
 *   gelten. "Gleis 22 - 1.UG" ist damit ein Gleis und kein Bereich 1..22.
 * - `(?!\.[a-z])` verwirft eine Zahl, der ein Punkt und ein Buchstabe folgt.
 *   Das ist eine Ebene ("1.UG", "1.OG"), kein Gleis.
 *
 * Die Alternativen stehen lang vor kurz, sonst schluckte `gl\.?` den Anfang
 * von "Gleis".
 */
const GLEIS_MUSTER =
  /\b(?:gleise|gleis|bstg\.?\s*gl\.?|bstg\.?|bst\.?|gl\.?)\s*(\d+[a-z]?)(?!\.[a-z])(?:(\s*\/\s*|-)(\d+[a-z]?)(?!\.[a-z]))?/gi;

/** Hoechstweite eines Bereichs - schuetzt vor einer Zahl, die keine Gleisnummer ist. */
const BEREICH_MAX = 20;

/** Die Gleise je Fundstelle. Zwei Fundstellen = die Anlage verbindet zwei Bahnsteige. */
function fundstellen(text: string): string[][] {
  const alle: string[][] = [];
  for (const treffer of text.matchAll(GLEIS_MUSTER)) {
    const [, erstes, trenner, zweites] = treffer;
    if (zweites === undefined) {
      alle.push([erstes]);
      continue;
    }
    // Bereich nur bei unmittelbarem Bindestrich und reinen Zahlen.
    const istBereich = trenner === '-' && /^\d+$/.test(erstes) && /^\d+$/.test(zweites);
    const von = Number(erstes);
    const bis = Number(zweites);
    if (istBereich && bis > von && bis - von <= BEREICH_MAX) {
      const gleise: string[] = [];
      for (let g = von; g <= bis; g++) gleise.push(String(g));
      alle.push(gleise);
    } else {
      alle.push([erstes, zweites]);
    }
  }
  return alle;
}

/**
 * Der Bahnsteig, den diese Anlage verankert - oder `null`.
 *
 * Verankert wird nur bei GENAU EINER Fundstelle mit einem oder zwei Gleisen.
 * Alles andere ist keine Bahnsteigzuordnung:
 *
 * - keine Fundstelle -> Parkhaus, Tram, DB Lounge. Gehoert nicht an einen Bahnsteig.
 * - zwei Fundstellen -> eine Verbindung ("Gleis 5/6 (C/D) - Gleis 11/12"). Sie
 *   waere wertvoll, traegt aber nur EINEN Punkt, und eine Verbindung braucht
 *   zwei. Sie hier zu verwerten hiesse raten.
 * - mehr als zwei Gleise -> ein Querbahnsteig ueber mehrere Bahnsteige.
 */
export function verankerterBahnsteig(text: string | undefined): string[] | null {
  if (!text) return null;
  const alle = fundstellen(text);
  if (alle.length !== 1) return null;
  const gleise = alle[0];
  return gleise.length === 1 || gleise.length === 2 ? gleise : null;
}

/** Bahnsteigschluessel: Gleise numerisch sortiert - "12/11" und "11/12" sind eins. */
export function bahnsteigSchluessel(gleise: string[]): string {
  return [...gleise].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).join('/');
}
