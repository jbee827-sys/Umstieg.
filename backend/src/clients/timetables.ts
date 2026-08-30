import { XMLParser } from 'fast-xml-parser';
import { epTafelAenderungen, epTafelPlan } from './db-endpunkte.js';
import { dbAuthHeader } from './stations.js';
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

export async function holeTafel(
  eva: string,
  typ: 'arr' | 'dep',
  fetchFn: typeof fetch = fetch,
): Promise<TafelEintrag[]> {
  // ZWEI Stunden holen. IRIS liefert je Aufruf genau eine, und um 17:55
  // nuetzen Zuege bis 17:59 niemandem - gebraucht wird der 18:05. Der Preis
  // ist ein zusaetzlicher Aufruf je Poll; die Buendelung pro EVA
  // (Konzeptkorrektur 1) bleibt davon unberuehrt.
  const jetzt = new Date();
  const naechsteStunde = new Date(jetzt.getTime() + 60 * 60 * 1000);
  const [planJetzt, planSpaeter, aenderungenXml] = await Promise.all([
    holeXml(epTafelPlan(eva, jetzt), fetchFn),
    holeXml(epTafelPlan(eva, naechsteStunde), fetchFn),
    holeXml(epTafelAenderungen(eva), fetchFn),
  ]);

  const aenderungen = new Map<string, IrisHalt>();
  for (const halt of parseHalte(aenderungenXml)) {
    if (halt.id) aenderungen.set(halt.id, halt);
  }

  // Beide Stunden zusammenfuehren; ein Halt kann in beiden Antworten stehen,
  // deshalb nach halt.id entdoppeln.
  const halte = new Map<string, IrisHalt>();
  for (const halt of [...parseHalte(planJetzt), ...parseHalte(planSpaeter)]) {
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
