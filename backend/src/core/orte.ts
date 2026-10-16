const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Vorsilben und Bahnhofswörter – dieselben Klassen wie in `bahnhofsname.ts`.
 * Dort werden sie abgeschält, um eine Suche zu treffen; hier, um zwei Namen
 * vergleichbar zu machen.
 */
const STOERWORTE = new Set(['s', 'u', 's+u', 'u+s', 's+bus', 'bus', 'tram', 'str', 'bahnhof', 'bhf', 'bf']);

/**
 * Vergleichbarer Name: klein, Umlaute ausgeschrieben, „Hauptbahnhof“ → „hbf“,
 * Klammerzusätze und Satzzeichen weg, Verkehrsmittel-Vorsilben („S+U“) weg.
 * „S+U Berlin Hauptbahnhof“ und „Berlin Hbf“ ergeben beide „berlin hbf“.
 *
 * Der Klammerzusatz fällt weg, obwohl er die Stadt nennt („(Berlin)“): Für
 * den Vergleich zweier Treffer am selben Ort sagt er nichts, und die Lage
 * prüft der Aufrufer ohnehin.
 */
export function namensSchluessel(name: string): string {
  const klein = name
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => UMLAUTE[z])
    .replace(/\([^)]*\)/g, ' ')
    .replace(/hauptbahnhof/g, 'hbf');
  return klein
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !STOERWORTE.has(w))
    .join(' ');
}
