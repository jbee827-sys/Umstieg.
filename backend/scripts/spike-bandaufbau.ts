// SONDIERUNG (wegwerfbar): Traegt die Geometrie ein Band mit RICHTIGER
// Gleisreihenfolge - oder nur eine Liste?
//
// Screen 3 zeichnet je Ebene ein Band, in dem Gleislinien nebeneinander
// liegen. Damit das kein Zufall ist, muss aus den Daten hervorgehen:
//   1. welche Ebenen ueberhaupt ein Band verdienen,
//   2. in welcher REIHENFOLGE die Bahnsteige quer zur Gleisrichtung liegen,
//   3. wie die Ebenen zueinander stehen (Berlin ist ein Kreuzungsbahnhof -
//      oben und unten laufen nicht parallel).
//
// Aufruf: npx tsx scripts/spike-bandaufbau.ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueGraph, haversineM } from '../src/core/graph.js';
import type { OsmElement, OverpassAntwort } from '../src/core/typen.js';

const HIER = dirname(fileURLToPath(import.meta.url));

interface Bahnsteig {
  schluessel: string;
  refs: string[];
  level: number | undefined;
  a: [number, number];
  b: [number, number];
  laengeM: number;
  peilung: number;
  mitte: [number, number];
}

function peilung(a: [number, number], b: [number, number]): number {
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((b[0] * Math.PI) / 180);
  const x =
    Math.cos((a[0] * Math.PI) / 180) * Math.sin((b[0] * Math.PI) / 180) -
    Math.sin((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bahnsteige(osm: OverpassAntwort): Bahnsteig[] {
  const nodes = new Map<number, OsmElement>();
  const ways = new Map<number, OsmElement>();
  const relationen: OsmElement[] = [];
  for (const el of osm.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else relationen.push(el);
  }

  const raus: Bahnsteig[] = [];
  const baue = (refs: string[], level: string | undefined, ids: number[]): void => {
    if (refs.length === 0) return;
    const p = ids
      .map((i) => nodes.get(i))
      .filter((n): n is OsmElement => n?.lat !== undefined && n.lon !== undefined)
      .map((n) => [n.lat!, n.lon!] as [number, number]);
    if (p.length < 2) return;
    let a = p[0];
    let b = p[1];
    let max = -1;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const d = haversineM(p[i][0], p[i][1], p[j][0], p[j][1]);
        if (d > max) {
          max = d;
          a = p[i];
          b = p[j];
        }
      }
    }
    raus.push({
      schluessel: refs.join('/'),
      refs,
      level: level === undefined ? undefined : Number(level),
      a,
      b,
      laengeM: max,
      peilung: peilung(a, b),
      mitte: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    });
  };

  const mitglieder = new Set<number>();
  for (const rel of relationen) {
    if (rel.tags?.railway !== 'platform') continue;
    const ids: number[] = [];
    for (const m of rel.members ?? []) {
      if (m.type !== 'way' || m.role === 'inner') continue;
      const w = ways.get(m.ref);
      if (w?.nodes) {
        ids.push(...w.nodes);
        mitglieder.add(m.ref);
      }
    }
    baue((rel.tags?.ref ?? '').split(/[;/]/).map((r) => r.trim()).filter(Boolean), rel.tags?.level, ids);
  }
  for (const [id, w] of ways) {
    if (w.tags?.railway !== 'platform' || mitglieder.has(id)) continue;
    baue((w.tags?.ref ?? '').split(/[;/]/).map((r) => r.trim()).filter(Boolean), w.tags?.level, w.nodes ?? []);
  }
  return raus;
}

function main(): void {
  const osm = JSON.parse(
    readFileSync(join(HIER, '..', 'test', 'fixtures', 'overpass', 'berlin-hbf.json'), 'utf8'),
  ) as OverpassAntwort;

  const alle = bahnsteige(osm);
  const proLevel = new Map<number, Bahnsteig[]>();
  for (const b of alle) {
    if (b.level === undefined) continue;
    if (!proLevel.has(b.level)) proLevel.set(b.level, []);
    proLevel.get(b.level)!.push(b);
  }

  console.log('=== 1) Ebenen mit Gleisen (Bandkandidaten) ===');
  for (const [level, liste] of [...proLevel.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(
      `  Ebene ${String(level).padStart(3)}: ${liste.length} Bahnsteige, Gleise ${liste.flatMap((b) => b.refs).join(',')}`,
    );
  }
  const ohneLevel = alle.filter((b) => b.level === undefined);
  console.log(`  ohne level-Tag: ${ohneLevel.length} (${ohneLevel.map((b) => b.schluessel).join(', ')})`);

  const graph = baueGraph(osm);
  const alleEbenen = [...new Set([...graph.knoten.values()].map((k) => k.level))].sort((a, b) => b - a);
  console.log(`\n  Ebenen im Graphen insgesamt: ${alleEbenen.join(', ')}`);
  console.log('  → nur 2 davon tragen Gleise; der Rest ist Halle, Zwischengeschoss oder Rolltreppenpodest.');

  console.log('\n=== 2) Reihenfolge quer zur Gleisrichtung ===');
  for (const [level, liste] of [...proLevel.entries()].sort((a, b) => b[0] - a[0])) {
    if (liste.length < 2) {
      console.log(`  Ebene ${level}: nur ein Bahnsteig – Reihenfolge trivial.`);
      continue;
    }
    // Gemeinsame Gleisrichtung: Mittel der Peilungen, auf 0..180 normiert
    // (ein Bahnsteig ist richtungslos - 254° und 74° sind dieselbe Achse).
    const achsen = liste.map((b) => b.peilung % 180);
    const mittel = achsen.reduce((s, w) => s + w, 0) / achsen.length;
    // Querachse = Gleisrichtung + 90°, Projektion der Mittelpunkte darauf.
    const quer = ((mittel + 90) * Math.PI) / 180;
    const bezug = liste[0].mitte;
    const mLat = 111_320;
    const mLon = 111_320 * Math.cos((bezug[0] * Math.PI) / 180);
    const mitLage = liste.map((b) => {
      const dx = (b.mitte[1] - bezug[1]) * mLon;
      const dy = (b.mitte[0] - bezug[0]) * mLat;
      // Einheitsvektor der Querachse (Peilung: 0°=Nord, im Uhrzeigersinn)
      const qx = Math.sin(quer);
      const qy = Math.cos(quer);
      return { b, lage: dx * qx + dy * qy };
    });
    mitLage.sort((x, y) => x.lage - y.lage);
    console.log(
      `  Ebene ${String(level).padStart(3)} (Gleisrichtung ${Math.round(mittel)}°): ` +
        mitLage.map((m) => `${m.b.schluessel} @${m.lage.toFixed(0)}m`).join('  |  '),
    );
    const abstaende = mitLage.slice(1).map((m, i) => m.lage - mitLage[i].lage);
    console.log(`           Abstaende zwischen den Bahnsteigen: ${abstaende.map((a) => `${a.toFixed(0)} m`).join(', ')}`);
  }

  console.log('\n=== 3) Wie stehen die Ebenen zueinander? ===');
  const richtungen = [...proLevel.entries()].map(([level, liste]) => ({
    level,
    richtung: liste.map((b) => b.peilung % 180).reduce((s, w) => s + w, 0) / liste.length,
  }));
  for (const r of richtungen) {
    console.log(`  Ebene ${String(r.level).padStart(3)}: Gleisrichtung ${Math.round(r.richtung)}°`);
  }
  if (richtungen.length === 2) {
    const diff = Math.abs(richtungen[0].richtung - richtungen[1].richtung);
    const winkel = Math.min(diff, 180 - diff);
    console.log(
      `  → Die beiden Gleisebenen kreuzen sich unter ${Math.round(winkel)}°. ` +
        (winkel > 60
          ? 'Ein Schema mit parallelen Baendern verschweigt das.'
          : 'Parallele Baender sind vertretbar.'),
    );
  }
}

main();
