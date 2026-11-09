/**
 * Bahnhoefe, an denen ein Bahnsteig nur noch `public_transport=platform`
 * traegt, ohne `railway=platform` (08.11.2026).
 *
 * Anlass: Frankfurt (Main) Hbf. Am 06.11.2026 entfernte eine OSM-Bearbeitung
 * an der Bahnsteigflaeche „Bstg. 1+1a“ (Relation 21494088, Version 3)
 * `railway=platform`, `level` und `train`. Die Abfrage fragt nach
 * `railway=platform` - die Flaeche und ihre zwei unbeschrifteten Randlinien
 * fehlten, Gleis 1a hing allein an seiner Kante und war unerreichbar.
 *
 * Nur diese Bahnhoefe fragen die Zusatzzeilen ab (`baueOverpassQL`,
 * `mitPtBahnsteigen`) und tragen dafuer eine eigene Abfrageversion
 * (`abfrageVersionFuer`). Fuer alle anderen bleibt die Abfrage gleich - sonst
 * galte der ganze Startbestand als veraltet. Gefunden mit
 * `osm-ablage/diagnose/pt-bahnsteige-suche.ts` (gitignored) an den
 * Bahnhoefen, an denen ein DB-Gleis isoliert ist oder ganz fehlt (36 Kandidaten,
 * 08.11.2026). Wer einen weiteren findet: Schluessel hier eintragen, dann
 * `npx tsx scripts/bestand-einzeln.ts <schluessel>` und `npm run bahnhofsseiten`.
 *
 * Schluessel wie im Bestand: die kleinste EVA der Gruppe (`schluesselVon`).
 */
export const PT_BAHNSTEIGE = new Set<string>([
  '8000105', // Frankfurt (Main) Hbf: Bstg. 1+1a (Relation 21494088)
  '8000332', // Frankenthal Hbf: Bahnsteig 2;3 (Way 166118826, train=yes)
]);

export function mitPtBahnsteigen(schluessel: string | undefined): boolean {
  return schluessel !== undefined && PT_BAHNSTEIGE.has(schluessel);
}
