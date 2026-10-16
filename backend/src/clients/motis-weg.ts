import type { GraphKante, GraphKnoten, KantenTyp, RoutenPfad } from '../core/typen.js';
import { abstandM } from './motis-abbildung.js';
import type { MotisPlanAntwort, MotisSchritt } from './motis-typen.js';

/**
 * Google-Polylinie mit wählbarer Genauigkeit (MOTIS v6: 6 Stellen).
 *
 * Eine abgeschnittene Zeichenkette endet mit dem letzten vollständigen Punkt:
 * `charCodeAt` hinter dem Ende liefert `NaN`, und die Schleife bricht ab.
 */
export function dekodierePolylinie(punkte: string, genauigkeit: number): { lat: number; lon: number }[] {
  const faktor = 10 ** genauigkeit;
  const ergebnis: { lat: number; lon: number }[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const naechste = (): number | null => {
    let wert = 0;
    let schiebe = 0;
    let byte: number;
    do {
      if (i >= punkte.length) return null;
      byte = punkte.charCodeAt(i++) - 63;
      wert |= (byte & 0x1f) << schiebe;
      schiebe += 5;
    } while (byte >= 0x20);
    return wert & 1 ? ~(wert >> 1) : wert >> 1;
  };
  while (i < punkte.length) {
    const dLat = naechste();
    const dLon = naechste();
    if (dLat === null || dLon === null) break;
    lat += dLat;
    lon += dLon;
    // Auf sechs Stellen (rund 0,1 m): Mehr Genauigkeit hat der Weg nicht,
    // und Gleitkommareste wie 38.50000000001 stören jeden Vergleich.
    ergebnis.push({ lat: Math.round((lat / faktor) * 1e6) / 1e6, lon: Math.round((lon / faktor) * 1e6) / 1e6 });
  }
  return ergebnis;
}

const IST_WECHSEL = new Set(['STAIRS', 'ELEVATOR']);

/** Unter dieser Entfernung ist ein Punkt derselbe wie der vorige. */
const GLEICHER_PUNKT_M = 0.5;

/**
 * Ebene, auf der der Weg nach dem Wechsel `schritte[i]` weitergeht.
 *
 * Nicht `toLevel` des Wechsels: Bei Treppen steht es in der Erkundung vom
 * 16.10.2026 teils gegen die Gehrichtung (Berlin Hbf: Schritt davor −2,
 * Treppe „−1 → −2“, Schritt danach −1). Maßgeblich ist der nächste ebene
 * Schritt. Folgt ein weiterer Wechsel, gilt der Wert des eigenen Schritts, der
 * nicht der Ausgangswert ist.
 */
function ebeneDanach(schritte: MotisSchritt[], i: number, vorher: number): number {
  const naechster = schritte[i + 1];
  if (naechster && !IST_WECHSEL.has(naechster.relativeDirection)) return naechster.fromLevel ?? vorher;
  const s = schritte[i];
  if (s.toLevel !== undefined && s.toLevel !== vorher) return s.toLevel;
  return s.fromLevel ?? vorher;
}

/**
 * Fußweg aus `/plan` → derselbe `RoutenPfad`, den der Bahnhofspfad aus seinem
 * Graphen baut. Damit rechnen Gehzeit (`core/gehzeit.ts`) und Schrittsätze
 * (`core/textgen.ts`) auf beiden Pfaden gleich (Spec 5.5).
 *
 * Drei Fallen aus der Erkundung (16.10.2026):
 *
 * 1. MOTIS liefert keine Abbiegerichtung (nur `CONTINUE`) – die rechnet
 *    textgen aus der Geometrie, deshalb wird jeder Polylinienpunkt ein Knoten.
 * 2. Treppenebenen stehen teils gegen die Gehrichtung – siehe `ebeneDanach`.
 * 3. Die Ebene springt auch OHNE Treppenschritt (Berlin Hbf, −1 → 0 am
 *    Washingtonplatz): ein Weg, den OSM nicht als Treppe kennt. Was es ist,
 *    weiß niemand; „Treppe“ wäre eine Behauptung, die einen Rollstuhl
 *    umsonst abschreckte. Er wird deshalb Rampe – ein Weg hinauf.
 */
export function pfadAusPlan(antwort: MotisPlanAntwort): RoutenPfad | null {
  const leg = antwort?.direct?.[0]?.legs?.find((l) => l.mode === 'WALK');
  const schritte = Array.isArray(leg?.steps) ? leg.steps : [];
  if (!leg || schritte.length === 0) return null;

  const knoten: GraphKnoten[] = [];
  const kanten: GraphKante[] = [];

  const haenge = (lat: number, lon: number, level: number, typ: KantenTyp, laengeM: number): void => {
    const von = knoten[knoten.length - 1];
    const neu: GraphKnoten = { id: `w${knoten.length}`, lat, lon, level };
    knoten.push(neu);
    kanten.push({
      von: von.id,
      nach: neu.id,
      laengeM,
      deltaLevel: level - von.level,
      typ,
      barrierefrei: typ !== 'treppe',
    });
  };

  const ersteEbene = schritte.find((s) => !IST_WECHSEL.has(s.relativeDirection))?.fromLevel;
  knoten.push({ id: 'w0', lat: leg.from.lat, lon: leg.from.lon, level: leg.from.level ?? ersteEbene ?? 0 });

  schritte.forEach((s, i) => {
    const letzter = knoten[knoten.length - 1];
    const punkte = dekodierePolylinie(s.polyline?.points ?? '', s.polyline?.precision ?? 6);

    if (IST_WECHSEL.has(s.relativeDirection)) {
      const nachher = ebeneDanach(schritte, i, letzter.level);
      const ende = punkte.at(-1) ?? letzter;
      const strecke = abstandM(letzter, ende);
      if (nachher === letzter.level) {
        // „Treppe“ ohne Ebenenwechsel: eine Stufe im Weg, kein Wechsel.
        if (strecke >= GLEICHER_PUNKT_M) haenge(ende.lat, ende.lon, letzter.level, 'eben', strecke);
        return;
      }
      const typ: KantenTyp = s.relativeDirection === 'ELEVATOR' ? 'aufzug' : 'treppe';
      haenge(ende.lat, ende.lon, nachher, typ, typ === 'aufzug' ? 0 : Math.max(s.distance ?? 0, strecke));
      return;
    }

    const von = s.fromLevel ?? letzter.level;
    const bis = s.toLevel ?? von;
    punkte.forEach((p, j) => {
      const vorher = knoten[knoten.length - 1];
      // Ein Schritt, der selbst die Ebene wechselt, kommt mit seinem letzten
      // Punkt auf der Zielebene an.
      const level = j === punkte.length - 1 ? bis : von;
      const strecke = abstandM(vorher, p);
      if (strecke < GLEICHER_PUNKT_M && vorher.level === level) return;
      haenge(p.lat, p.lon, level, vorher.level === level ? 'eben' : 'rampe', strecke);
    });
  });

  if (kanten.length === 0) return null;
  return { knoten, kanten, laengeM: kanten.reduce((summe, k) => summe + k.laengeM, 0) };
}
