import { OVERPASS_RADIUS_M } from '../clients/overpass.js';
import type { OverpassAntwort, StationsInfo } from '../core/typen.js';
import type { OverpassFn } from '../routes/api.js';
import { istVeraltet, schluesselVon, type OsmBestand } from './bestand.js';
import type { ErneuerungsAuftrag, OsmErneuerung } from './erneuerung.js';
import { ABFRAGE_VERSION } from './version.js';

export interface OsmQuelle {
  /** OSM-Daten des Bahnhofs – aus dem Bestand, sonst von Overpass. Wirft wie Overpass. */
  hole(info: StationsInfo): Promise<OverpassAntwort>;
  beiErneuert(fn: (auftrag: ErneuerungsAuftrag) => void): void;
}

/**
 * Bestand vor Overpass (Spec 2026-10-12, Abschnitt 4). Was aus dem Bestand
 * kommt, wird immer sofort benutzt – auch veraltet; die Erneuerung laeuft
 * dahinter. Was von Overpass kommt, wird gespeichert, damit es das letzte Mal
 * war.
 */
export function erzeugeOsmQuelle(o: {
  bestand: OsmBestand;
  erneuerung: OsmErneuerung | null;
  overpass: OverpassFn;
  jetzt?: () => Date;
}): OsmQuelle {
  const jetzt = o.jetzt ?? (() => new Date());
  return {
    async hole(info) {
      if (info.lat === undefined || info.lon === undefined) {
        throw new Error('keine Koordinaten zum Bahnhof');
      }
      const evas = info.evas.length > 0 ? info.evas : [info.eva];
      const auftrag: ErneuerungsAuftrag = {
        schluessel: schluesselVon(evas),
        name: info.name,
        lat: info.lat,
        lon: info.lon,
        evas,
      };
      const gefunden = await o.bestand.lies(auftrag.schluessel);
      if (gefunden) {
        if (istVeraltet(gefunden, jetzt())) o.erneuerung?.stosseAn(auftrag);
        return gefunden.osm;
      }
      let osm: OverpassAntwort;
      try {
        osm = await o.overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      } catch (e) {
        // Spec 2026-10-14, Abschnitt 5: Niemand muss erneut fragen – die
        // Erneuerung holt den Bahnhof in einer Stunde nach.
        o.erneuerung?.spaeter(auftrag);
        throw e;
      }
      // Der Bestand warnt selbst, wenn das Schreiben scheitert – die Antwort geht trotzdem raus.
      await o.bestand.schreibe({
        schluessel: auftrag.schluessel,
        name: auftrag.name,
        lat: auftrag.lat,
        lon: auftrag.lon,
        geholtAm: jetzt().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm,
      });
      return osm;
    },
    beiErneuert(fn) {
      o.erneuerung?.beiErneuert(fn);
    },
  };
}
