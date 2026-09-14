// DIAGNOSE: Findet das Routing wirklich den schnellsten Weg - oder nur den,
// den der Graph ihm leicht macht?
//
// Rechnet fuer jeden Ebenenwechsel im Haus die beste Route, die ihn ZWINGEND
// benutzt (Start -> Anlage -> Ziel), und stellt sie neben die Route, die der
// Router waehlt. Dijkstra ist auf dem Graphen exakt; ist eine erzwungene
// Alternative trotzdem schneller, stimmt etwas an den Kosten. Ist sie nur in
// der LUFTLINIE schneller, stimmt etwas an der Form des Graphen.
//
// Aufruf: npx tsx scripts/diagnose-alternativen.ts <EVA> <gleisAn> <gleisAb> [abschnitt]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baueGraph, haversineM } from '../src/core/graph.js';
import { gehzeitSekunden, kantenZeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import type { GraphKante, OverpassAntwort, StationGraph } from '../src/core/typen.js';
import { ABLAGE as CACHE } from './osm-ablage-fuellen.js';

const [eva, gleisAn, gleisAb, abschnitt = 'mitte'] = process.argv.slice(2);
const pfadOsm = join(CACHE, `${eva}.json`);
if (!eva || !gleisAn || !gleisAb || !existsSync(pfadOsm)) {
  console.error('Aufruf: npx tsx scripts/diagnose-alternativen.ts <EVA> <gleisAn> <gleisAb> [abschnitt]');
  process.exit(2);
}

const graph: StationGraph = baueGraph(JSON.parse(readFileSync(pfadOsm, 'utf8')) as OverpassAntwort);
graph.stufe = klassifiziere(graph);

/** Kuerzeste Zeiten von einem Knoten zu allen - dieselben Kosten wie der Router. */
function zeitenAb(startId: string): Map<string, number> {
  const dist = new Map<string, number>([[startId, 0]]);
  const offen = new Set<string>([startId]);
  while (offen.size > 0) {
    let bester = '';
    let besteZeit = Infinity;
    for (const id of offen) {
      const d = dist.get(id)!;
      if (d < besteZeit) {
        besteZeit = d;
        bester = id;
      }
    }
    offen.delete(bester);
    for (const k of graph.adjazenz.get(bester) ?? []) {
      const nach = k.von === bester ? k.nach : k.von;
      const neu = besteZeit + kantenZeitSekunden(k, 'normal');
      if (neu < (dist.get(nach) ?? Infinity)) {
        dist.set(nach, neu);
        offen.add(nach);
      }
    }
  }
  return dist;
}

const start = findeStartknoten(graph, gleisAn, abschnitt).knoten;
const ziel = findeStartknoten(graph, gleisAb).knoten;
const pfad = berechneRoute(graph, start.id, ziel.id, 'schnellste', 'normal');
if (!pfad) {
  console.log('keine Route');
  process.exit(1);
}
const gewaehlt = gehzeitSekunden(pfad, 'normal');
const genutzt = new Set(pfad.kanten);

const ab = zeitenAb(start.id);
const bis = zeitenAb(ziel.id);

const wechsel = new Set<GraphKante>();
for (const liste of graph.adjazenz.values()) for (const k of liste) if (k.deltaLevel !== 0) wechsel.add(k);

const alternativen = [...wechsel]
  .map((k) => {
    const c = kantenZeitSekunden(k, 'normal');
    const hin = (ab.get(k.von) ?? Infinity) + c + (bis.get(k.nach) ?? Infinity);
    const rueck = (ab.get(k.nach) ?? Infinity) + c + (bis.get(k.von) ?? Infinity);
    const oben = hin <= rueck ? k.von : k.nach;
    const kn = graph.knoten.get(oben)!;
    return {
      kante: k,
      zeit: Math.round(Math.min(hin, rueck)),
      zumEinstieg: Math.round(ab.get(oben) ?? Infinity),
      luftlinie: Math.round(haversineM(start.lat, start.lon, kn.lat, kn.lon)),
      genutzt: genutzt.has(k),
    };
  })
  .filter((a) => Number.isFinite(a.zeit))
  .sort((x, y) => x.zeit - y.zeit);

console.log(
  `${eva} ${gleisAn} → ${gleisAb} ab ${abschnitt} (${start.id}): gewaehlt ${gewaehlt} s, ` +
    `${Math.round(pfad.laengeM)} m, ${pfad.kanten.filter((k) => k.deltaLevel !== 0).length} Ebenenwechsel`,
);
console.log('Beste erzwungene Alternativen ueber einen Ebenenwechsel:');
for (const a of alternativen.slice(0, 12)) {
  const umweg = a.zumEinstieg - a.luftlinie;
  console.log(
    `  ${String(a.zeit).padStart(5)} s  ${a.kante.typ.padEnd(10)} ${a.kante.von} → ${a.kante.nach}` +
      `  | bis Einstieg ${a.zumEinstieg} s bei ${a.luftlinie} m Luftlinie` +
      (umweg > 30 ? `  ← ${umweg} s UMWEG` : '') +
      (a.genutzt ? '  [genutzt]' : ''),
  );
}
