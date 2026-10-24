import { XMLParser } from 'fast-xml-parser';
import { LRUCache } from 'lru-cache';
import { TAFEL_TTL_MS } from '../cache/clients.js';
import { epTafelAenderungen, epTafelPlan } from './db-endpunkte.js';
import { dbAuthHeader } from './stations.js';
import {
  erzeugeTimetablesBudget,
  TimetablesAusgelastetError,
  type TimetablesBudget,
  type TimetablesZweck,
} from './timetables-budget.js';
import type { Protokoll } from '../core/ueberwachung.js';
import type { TafelEintrag } from '../core/typen.js';

// Timetables liefert IRIS-XML: /plan = Soll der aktuellen Stunde, /fchg = alle
// bekannten Änderungen. Beide werden über die s-id zusammengeführt.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

interface IrisEreignis {
  pt?: string; // Sollzeit YYMMDDHHmm
  pp?: string; // Sollgleis
  ppth?: string; // Laufweg, '|'-getrennt
  ct?: string; // geänderte Zeit
  cp?: string; // geändertes Gleis
}

interface IrisHalt {
  id?: string;
  tl?: { c?: string; n?: string };
  ar?: IrisEreignis;
  dp?: IrisEreignis;
}

function alsListe<T>(wert: T | T[] | undefined): T[] {
  if (wert === undefined) return [];
  return Array.isArray(wert) ? wert : [wert];
}

/** 'YYMMDDHHmm' → 'HH:MM' */
function zeitText(iris: string | undefined): string | undefined {
  if (!iris || iris.length < 10) return undefined;
  return `${iris.slice(6, 8)}:${iris.slice(8, 10)}`;
}

function parseHalte(xml: string): IrisHalt[] {
  const dokument = parser.parse(xml) as { timetable?: { s?: IrisHalt | IrisHalt[] } };
  return alsListe(dokument.timetable?.s);
}

async function holeXml(url: string, fetchFn: typeof fetch): Promise<string> {
  const antwort = await fetchFn(url, {
    headers: { ...dbAuthHeader(), Accept: 'application/xml' },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) throw new Error(`Timetables ${url}: HTTP ${antwort.status}`);
  return antwort.text();
}

/** Aus den Plaenen beider Stunden und den Aenderungen die Tafel einer Richtung. */
function baueTafel(planXmls: string[], aenderungenXml: string, typ: 'arr' | 'dep'): TafelEintrag[] {
  const aenderungen = new Map<string, IrisHalt>();
  for (const halt of parseHalte(aenderungenXml)) {
    if (halt.id) aenderungen.set(halt.id, halt);
  }

  // Beide Stunden zusammenfuehren; ein Halt kann in beiden Antworten stehen,
  // deshalb nach halt.id entdoppeln.
  const halte = new Map<string, IrisHalt>();
  for (const halt of planXmls.flatMap(parseHalte)) {
    halte.set(halt.id ?? `${halt.tl?.c}${halt.tl?.n}${halt.ar?.pt}${halt.dp?.pt}`, halt);
  }

  const eintraege: TafelEintrag[] = [];
  for (const halt of halte.values()) {
    const ereignis = typ === 'arr' ? halt.ar : halt.dp;
    if (!ereignis) continue;

    const aenderung = halt.id ? aenderungen.get(halt.id) : undefined;
    const geaendert = typ === 'arr' ? aenderung?.ar : aenderung?.dp;

    const laufweg = (ereignis.ppth ?? '').split('|').filter(Boolean);
    const zeitSoll = zeitText(ereignis.pt) ?? '';
    const zeitIst = zeitText(geaendert?.ct);
    const gleisSoll = ereignis.pp ?? '';
    const gleisIst = geaendert?.cp;

    eintraege.push({
      zug: `${halt.tl?.c ?? ''} ${halt.tl?.n ?? ''}`.trim(),
      zeitSoll,
      ...(zeitIst && zeitIst !== zeitSoll ? { zeitIst } : {}),
      gleisSoll,
      ...(gleisIst && gleisIst !== gleisSoll ? { gleisIst } : {}),
      // Abfahrt: Endbahnhof; Ankunft: Startbahnhof des Laufwegs
      ziel: (typ === 'dep' ? laufweg[laufweg.length - 1] : laufweg[0]) ?? '',
    });
  }
  // Chronologisch - die Tafel soll lesen wie eine Anzeigetafel.
  return eintraege.sort((a, b) => a.zeitSoll.localeCompare(b.zeitSoll));
}

/** Die drei Adressen einer Tafel: Plan dieser und der naechsten Stunde, Aenderungen. */
function tafelAdressen(eva: string, zeitpunkt: Date) {
  // ZWEI Stunden holen. IRIS liefert je Aufruf genau eine, und um 17:55
  // nuetzen Zuege bis 17:59 niemandem - gebraucht wird der 18:05.
  const naechsteStunde = new Date(zeitpunkt.getTime() + 60 * 60 * 1000);
  return {
    plaene: [epTafelPlan(eva, zeitpunkt), epTafelPlan(eva, naechsteStunde)],
    aenderungen: epTafelAenderungen(eva),
  };
}

/**
 * Eine Tafel ohne Zwischenspeicher und ohne Budget - fuer die Spike-Skripte.
 * Der Server nimmt `erzeugeTimetablesQuelle`.
 */
export async function holeTafel(
  eva: string,
  typ: 'arr' | 'dep',
  fetchFn: typeof fetch = fetch,
): Promise<TafelEintrag[]> {
  const adressen = tafelAdressen(eva, new Date());
  const [planJetzt, planSpaeter, aenderungenXml] = await Promise.all([
    ...adressen.plaene.map((url) => holeXml(url, fetchFn)),
    holeXml(adressen.aenderungen, fetchFn),
  ]);
  return baueTafel([planJetzt, planSpaeter], aenderungenXml, typ);
}

/**
 * Wie lange der Sollplan einer Stunde liegen bleibt.
 *
 * Der Plan einer Stunde ist das Soll; was sich daran aendert, kommt ueber
 * /fchg. Zwei Stunden, weil dieselbe Adresse erst als „naechste“, dann als
 * „aktuelle“ Stunde gebraucht wird. Danach ist sie Vergangenheit.
 */
export const PLAN_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Wie alt ein Stand hoechstens sein darf, den die Tafel bei erschoepftem
 * Budget noch ausliefert. Fuer die Zugauswahl ist eine Minute alte Tafel
 * besser als keine; nach fuenf Minuten koennen Gleiswechsel fehlen, auf die
 * sich jemand verlaesst.
 */
export const ALT_HOECHSTENS_MS = 5 * 60 * 1000;

export interface TimetablesQuelle {
  /** Fuer die HTTP-Route: aus dem Speicher, solange er frisch genug ist. */
  tafel(eva: string, typ: 'arr' | 'dep'): Promise<TafelEintrag[]>;
  /** Fuer den Live-Poller: Ankunft und Abfahrt, Aenderungen immer frisch. */
  live(eva: string): Promise<TafelEintrag[]>;
}

/**
 * Timetables mit Zwischenspeicher je ADRESSE und gemeinsamem Budget.
 *
 * Geschluesselt wird nach der URL, nicht nach EVA und Richtung: Ankunfts- und
 * Abfahrtstafel stehen in denselben drei Dokumenten. Je Richtung gespeichert
 * kostete eine Umstiegseingabe sechs Aufrufe statt drei, der Poller sogar
 * sechs je Durchlauf.
 *
 * Der Live-Poller umgeht den Speicher beim LESEN der Aenderungen - er IST die
 * Frischequelle, ein Treffer verschluckte genau die Aenderung, wegen der es
 * den Strom gibt. Er SCHREIBT aber hinein: Die Tafel eines beobachteten
 * Bahnhofs kostet dann nichts mehr.
 */
export function erzeugeTimetablesQuelle(
  o: {
    fetchFn?: typeof fetch;
    budget?: TimetablesBudget;
    jetzt?: () => Date;
    log?: Protokoll;
  } = {},
): TimetablesQuelle {
  const fetchFn = o.fetchFn ?? fetch;
  const budget = o.budget ?? erzeugeTimetablesBudget({ jetzt: o.jetzt });
  const jetzt = o.jetzt ?? (() => new Date());
  // Eingepackt, weil `lru-cache` nur Objekte nimmt. Ohne eigene Frist: Alter
  // wird beim Lesen geprueft, damit ein abgelaufener Eintrag als Rueckfall
  // erhalten bleibt.
  const speicher = new LRUCache<string, { xml: string; zeit: number }>({ max: 600 });
  const laufend = new Map<string, Promise<string>>();

  async function hole(
    url: string,
    zweck: TimetablesZweck,
    ttlMs: number,
    frisch = false,
  ): Promise<string> {
    const vorhanden = speicher.get(url);
    const alter = vorhanden ? jetzt().getTime() - vorhanden.zeit : Infinity;
    if (!frisch && alter < ttlMs) return vorhanden!.xml;

    /** Nur die Tafel bekommt Altes - der Poller soll scheitern, damit `quelle-weg` ankommt. */
    const rueckfall = (): string => {
      if (!frisch && vorhanden && alter < ALT_HOECHSTENS_MS) {
        o.log?.warn(
          { degradation: 'timetables-ausgelastet', alterS: Math.round(alter / 1000) },
          'Timetables-Budget erschoepft - Tafel aus aelterem Stand',
        );
        return vorhanden.xml;
      }
      throw new TimetablesAusgelastetError();
    };

    // Wer schon unterwegs ist, holt gerade jetzt - frisch genug fuer jeden.
    let versprechen = laufend.get(url);
    if (!versprechen) {
      // Vor dem Budget: Ohne Schluessel geht nichts hinaus, also wird auch
      // nichts gebucht.
      const kopf = dbAuthHeader();
      if (!budget.nimm(zweck)) return rueckfall();

      versprechen = (async () => {
        const antwort = await fetchFn(url, {
          headers: { ...kopf, Accept: 'application/xml' },
          signal: AbortSignal.timeout(15000),
        });
        if (antwort.status === 429) {
          budget.merke429(antwort.headers.get('retry-after'));
          throw new TimetablesAusgelastetError();
        }
        if (!antwort.ok) throw new Error(`Timetables ${url}: HTTP ${antwort.status}`);
        const xml = await antwort.text();
        speicher.set(url, { xml, zeit: jetzt().getTime() });
        return xml;
      })().finally(() => {
        // In JEDEM Fall freigeben, sonst haengt sich jeder spaetere Aufruf an
        // ein Versprechen, das nie wieder erfuellt wird.
        laufend.delete(url);
      });
      laufend.set(url, versprechen);
    }

    try {
      return await versprechen;
    } catch (e) {
      if (e instanceof TimetablesAusgelastetError) return rueckfall();
      throw e;
    }
  }

  async function dokumente(eva: string, zweck: TimetablesZweck) {
    const adressen = tafelAdressen(eva, jetzt());
    const [planJetzt, planSpaeter, aenderungen] = await Promise.all([
      ...adressen.plaene.map((url) => hole(url, zweck, PLAN_TTL_MS)),
      hole(adressen.aenderungen, zweck, TAFEL_TTL_MS, zweck === 'live'),
    ]);
    return { plaene: [planJetzt, planSpaeter], aenderungen };
  }

  return {
    async tafel(eva, typ) {
      const d = await dokumente(eva, 'tafel');
      return baueTafel(d.plaene, d.aenderungen, typ);
    },
    async live(eva) {
      const d = await dokumente(eva, 'live');
      return [...baueTafel(d.plaene, d.aenderungen, 'arr'), ...baueTafel(d.plaene, d.aenderungen, 'dep')];
    },
  };
}
