import { accessSync, constants, mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { OverpassAntwort } from '../core/typen.js';
import { ABFRAGE_VERSION } from './version.js';

const entpacke = promisify(gunzip);
const packe = promisify(gzip);

/** Ab diesem Alter wird im Hintergrund erneuert – benutzt wird der Eintrag weiter. */
export const MAX_ALTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface BestandsEintrag {
  /** Kleinste EVA der Verkehrsstellengruppe – so erkennt der Graph-Cache den Bahnhof. */
  schluessel: string;
  name: string;
  lat: number;
  lon: number;
  geholtAm: string;
  abfrageVersion: string;
  /** Die Overpass-Antwort, unveraendert. */
  osm: OverpassAntwort;
}

export interface GefundenerEintrag extends BestandsEintrag {
  herkunft: 'volume' | 'start';
}

export interface Warner {
  warn(obj: object, msg: string): void;
}

export interface OsmBestand {
  readonly hatVolume: boolean;
  lies(schluessel: string): Promise<GefundenerEintrag | null>;
  /** Nur aufs Volume. `false`, wenn es keins gibt oder das Schreiben scheitert. */
  schreibe(eintrag: BestandsEintrag): Promise<boolean>;
}

export function schluesselVon(evas: string[]): string {
  return [...evas].sort()[0];
}

export function dateiname(schluessel: string): string {
  return `${schluessel}.json.gz`;
}

export function istVeraltet(
  e: { geholtAm: string; abfrageVersion: string },
  jetzt: Date,
  version: string = ABFRAGE_VERSION,
): boolean {
  if (e.abfrageVersion !== version) return true;
  const geholt = Date.parse(e.geholtAm);
  if (!Number.isFinite(geholt)) return true;
  return jetzt.getTime() - geholt > MAX_ALTER_MS;
}

export async function packeEintrag(e: BestandsEintrag): Promise<Buffer> {
  return packe(Buffer.from(JSON.stringify(e), 'utf8'));
}

export async function entpackeEintrag(roh: Buffer): Promise<BestandsEintrag> {
  const e = JSON.parse((await entpacke(roh)).toString('utf8')) as Partial<BestandsEintrag>;
  if (
    typeof e.schluessel !== 'string' ||
    typeof e.geholtAm !== 'string' ||
    typeof e.abfrageVersion !== 'string' ||
    !Array.isArray(e.osm?.elements)
  ) {
    throw new Error('Bestandsdatei unvollstaendig');
  }
  return e as BestandsEintrag;
}

const STILL: Warner = { warn: () => {} };

/**
 * Zwei Ablagen: der Startbestand im Image (nur lesen) und das Volume (lesen
 * und schreiben). Das Volume gewinnt – dort liegt, was das Backend selbst
 * geholt oder erneuert hat. Nichts hier darf eine Anfrage scheitern lassen:
 * Jeder Fehler wird zu „nicht vorhanden" oder „nicht geschrieben".
 */
export function erzeugeBestand(
  opt: { startPfad?: string; volumePfad?: string; log?: Warner } = {},
): OsmBestand {
  const log = opt.log ?? STILL;
  let volume = opt.volumePfad;
  if (volume) {
    try {
      mkdirSync(volume, { recursive: true });
      accessSync(volume, constants.W_OK);
    } catch (e) {
      log.warn(
        { degradation: 'osm-volume-fehlt', pfad: volume, grund: String(e) },
        'OSM-Volume nicht beschreibbar - ohne Volume weiter',
      );
      volume = undefined;
    }
  }

  async function lese(
    ordner: string,
    schluessel: string,
    herkunft: GefundenerEintrag['herkunft'],
  ): Promise<GefundenerEintrag | null> {
    let roh: Buffer;
    try {
      roh = await readFile(join(ordner, dateiname(schluessel)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn(
          { degradation: 'osm-bestand-kaputt', schluessel, herkunft, grund: String(e) },
          'OSM-Bestandsdatei nicht lesbar - wie fehlend behandelt',
        );
      }
      return null;
    }
    try {
      return { ...(await entpackeEintrag(roh)), herkunft };
    } catch (e) {
      log.warn(
        { degradation: 'osm-bestand-kaputt', schluessel, herkunft, grund: String(e) },
        'OSM-Bestandsdatei unlesbar - wie fehlend behandelt',
      );
      return null;
    }
  }

  return {
    hatVolume: volume !== undefined,

    async lies(schluessel) {
      if (volume) {
        const vomVolume = await lese(volume, schluessel, 'volume');
        if (vomVolume) return vomVolume;
      }
      return opt.startPfad ? lese(opt.startPfad, schluessel, 'start') : null;
    },

    async schreibe(eintrag) {
      if (!volume) return false;
      const ziel = join(volume, dateiname(eintrag.schluessel));
      // Erst daneben schreiben, dann umbenennen: Zwei gleichzeitige Schreiber
      // hinterlassen so eine ganze Datei, nie eine halbe.
      const zwischen = `${ziel}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await writeFile(zwischen, await packeEintrag(eintrag));
        await rename(zwischen, ziel);
        return true;
      } catch (e) {
        log.warn(
          { degradation: 'osm-volume-schreibfehler', schluessel: eintrag.schluessel, grund: String(e) },
          'OSM-Bestand nicht geschrieben',
        );
        await rm(zwischen, { force: true }).catch(() => {});
        return false;
      }
    },
  };
}
