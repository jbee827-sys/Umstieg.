import { LRUCache } from 'lru-cache';

/**
 * Legt einen Zwischenspeicher mit Buendelung um eine Client-Funktion.
 *
 * Jeder Aufruf an RIS::Stations, Timetables oder FaSta kostet Quote. Bisher
 * war allein der Overpass-Graph zwischengespeichert - Bahnhofssuche, Tafel,
 * Gruppe und Aufzugsstatus gingen bei jedem einzelnen Aufruf hinaus.
 *
 * Zwei Aufgaben, und die zweite ist die wichtigere:
 *
 * 1. WIEDERHOLUNGEN sparen. Der gewoehnliche Fall.
 * 2. GLEICHZEITIGE Aufrufe buendeln. Der Missbrauchsfall besteht nicht aus
 *    langsamen Wiederholungen, sondern aus einem Schwall auf einmal - und
 *    der laeuft an einem reinen Cache vorbei, weil beim Eintreffen der
 *    zweiten Anfrage die erste noch unterwegs ist und der Speicher deshalb
 *    noch leer. Ohne Buendelung waeren 100 gleichzeitige Anfragen 100
 *    Aufrufe.
 *
 * Fehler werden bewusst NICHT gespeichert. Sonst hielte ein einzelner
 * Ausfall der Quelle den Bahnhof fuer die volle Frist kaputt, lange nachdem
 * sich die Quelle erholt hat - dieselbe Falle, die bei der Graphfrist schon
 * einmal zugeschnappt ist (siehe `NOTBEHELF_TTL_MS` in `lru.ts`).
 */
export function mitCache<A extends unknown[], V>(
  quelle: (...argumente: A) => Promise<V>,
  schluessel: (...argumente: A) => string,
  ttlMs: number,
  max: number,
): (...argumente: A) => Promise<V> {
  // Der Wert liegt eingepackt im Speicher: `lru-cache` nimmt nur Objekte,
  // eine Trefferliste oder eine Zeichenkette waere sonst nicht ablegbar.
  const speicher = new LRUCache<string, { wert: V }>({ max, ttl: ttlMs });
  const laufend = new Map<string, Promise<V>>();

  return (...argumente: A): Promise<V> => {
    const k = schluessel(...argumente);

    const treffer = speicher.get(k);
    if (treffer) return Promise.resolve(treffer.wert);

    // Schon jemand unterwegs? Dann anhaengen statt ein zweites Mal fragen.
    const schonUnterwegs = laufend.get(k);
    if (schonUnterwegs) return schonUnterwegs;

    const versprechen = quelle(...argumente)
      .then((wert) => {
        speicher.set(k, { wert });
        return wert;
      })
      .finally(() => {
        // In JEDEM Fall freigeben, auch nach einem Fehler. Bliebe der
        // Eintrag stehen, haenge sich jeder spaetere Aufruf an ein
        // Versprechen, das nie wieder erfuellt wird.
        laufend.delete(k);
      });

    laufend.set(k, versprechen);
    return versprechen;
  };
}

/**
 * Fristen der einzelnen Quellen.
 *
 * Stammdaten aendern sich praktisch nie, die Tafel dauernd. Massgeblich ist
 * nicht, was sich "richtig anfuehlt", sondern was die Anzeige noch wahr sein
 * laesst.
 */

/** Bahnhofsname, Lage, Gleisliste, Verkehrsstellengruppe. */
export const STAMM_TTL_MS = 24 * 60 * 60 * 1000;

/** Bahnhofssuche. Die Trefferliste zu "Berlin" ist morgen dieselbe. */
export const SUCHE_TTL_MS = 10 * 60 * 1000;

/** Aufzugsstatus. Eine Stoerung soll ankommen, aber nicht sekundengenau. */
export const FASTA_TTL_MS = 5 * 60 * 1000;

/**
 * Timetables-Aenderungen (/fchg) - beim Lesen NUR fuer die HTTP-Route.
 *
 * Muss unter dem Poll-Intervall der Ueberwachung (30 s) bleiben, sonst
 * koennte eine Anzeige aelter sein als die Ereignisse, die der Live-Strom
 * daneben schon gemeldet hat. Der Poller liest diesen Speicher nicht: Er IST
 * die Frischequelle - ein Treffer in seinem Pfad verschluckte genau die
 * Aenderung, wegen der es den Strom gibt. Er schreibt aber hinein
 * (`erzeugeTimetablesQuelle` in `clients/timetables.ts`). Den Sollplan haelt
 * dieselbe Quelle laenger (`PLAN_TTL_MS`).
 */
export const TAFEL_TTL_MS = 20 * 1000;
