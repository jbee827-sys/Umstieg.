// SIMULATION: Traegt das Bahnhofsschema ueber die Breite?
//
// Der Entwurf ist an Berlin Hbf entstanden - einem Sonderfall mit fuenf
// Ebenen, 430-m-Bahnsteigen und einer Kreuzung. Diese Simulation faehrt
// dieselbe Kette (Overpass -> Graph -> Route -> Schema) gegen ueber 50
// Bahnhoefe aller Groessen und prueft, was dabei herauskommt:
//
//   - Bleibt die Antwort klein genug fuer ein Telefon?
//   - Ist die Querreihenfolge der Bahnsteige immer monoton?
//   - Sind die Bahnsteiglaengen plausibel (kein 3-m- und kein 900-m-Bahnsteig)?
//   - Haelt die Invariante "Summe der Ebenenwege = Weg minus Ebenenwechsel"?
//   - Wie oft gibt es ueberhaupt Zugaenge, ein Netz, eine Kreuzung?
//
// Fairness gegenueber Overpass: jede Antwort wird im Scratchpad abgelegt und
// bei Wiederholung von dort gelesen; zwischen zwei echten Abrufen liegt eine
// Pause. Ein Lauf ohne Cache dauert entsprechend lange.
//
// Aufruf: npx tsx scripts/simulation-schema.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { overpassQuery } from '../src/clients/overpass.js';
import { sucheBahnhoefe } from '../src/clients/stations.js';
import { baueGraph } from '../src/core/graph.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import type { BahnhofSchema, OverpassAntwort } from '../src/core/typen.js';

function ladeSecrets(): void {
  const pfad = join(homedir(), '.secrets', 'umstieg.env');
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    const sauber = zeile.replace(/\r$/, '').trim();
    if (!sauber || sauber.startsWith('#')) continue;
    const trenner = sauber.indexOf('=');
    if (trenner < 0) continue;
    process.env[sauber.slice(0, trenner).trim()] = sauber.slice(trenner + 1).trim();
  }
}

const CACHE = join(
  homedir(), 'AppData', 'Local', 'Temp', 'claude', 'D--Claude-code',
  '6db04a47-3c2c-491e-84a8-985fc6d8dc06', 'scratchpad', 'osm-cache',
);

/**
 * Zweiter Durchgang (13.09.2026): die drei Metropolknoten als Pflicht, sonst
 * bewusst ANDERE Bahnhoefe als im ersten Lauf - ein zweites Mal dieselben zu
 * fahren prueft nichts Neues.
 */
const BAHNHOEFE = [
  // Metropolen (Pflicht)
  'Berlin Hbf', 'Frankfurt(Main)Hbf', 'München Hbf',
  // weitere Grossknoten, im ersten Lauf nicht dabei
  'Berlin Ostbahnhof', 'Berlin Gesundbrunnen', 'Berlin Südkreuz', 'Hamburg-Altona',
  'Hamburg Dammtor', 'Frankfurt(M) Flughafen Fernbf', 'München-Pasing', 'Köln Messe/Deutz',
  'Düsseldorf Flughafen', 'Essen-Steele', 'Oberhausen Hbf', 'Krefeld Hbf',
  'Mönchengladbach Hbf', 'Siegen Hbf', 'Trier Hbf', 'Kaiserslautern Hbf', 'Ludwigshafen(Rh)Hbf',
  'Offenburg', 'Basel Bad Bf', 'Singen(Hohentwiel)', 'Friedrichshafen Stadt', 'Kempten(Allgäu)Hbf',
  'Ingolstadt Hbf', 'Passau Hbf', 'Hof Hbf', 'Plauen(Vogtl)ob Bf', 'Zwickau(Sachs)Hbf',
  'Chemnitz Hbf', 'Halle(Saale)Hbf', 'Dessau Hbf', 'Stendal', 'Wittenberge',
  'Neubrandenburg', 'Stralsund Hbf', 'Greifswald', 'Flensburg', 'Husum',
  'Oldenburg(Oldb)Hbf', 'Emden Hbf', 'Wilhelmshaven Hbf', 'Minden(Westf)', 'Paderborn Hbf',
  'Lippstadt', 'Soest', 'Iserlohn', 'Solingen Hbf', 'Remscheid Hbf',
  'Limburg Süd', 'Montabaur', 'Wetzlar', 'Bad Hersfeld', 'Eisenach',
  'Gotha', 'Jena Paradies', 'Gera Hbf', 'Naumburg(Saale)Hbf', 'Weimar',
];


interface Befund {
  name: string;
  stufe: number | string;
  gleise: number;
  ebenen: number;
  gleisebenen: number;
  mitAchse: number;
  ohneAchse: number;
  zugaenge: number;
  netzStuecke: number;
  elemente: number;
  kreuzung: number | null;
  kb: number;
  msGraph: number;
  msSchema: number;
  fehler: string[];
}

/** Alles, was das Schema behauptet, gegen das pruefen, was es behaupten darf. */
function pruefe(schema: BahnhofSchema, pfadLaenge: number, aufWechseln: number): string[] {
  const fehler: string[] = [];

  for (const ebene of schema.ebenen) {
    const quer = ebene.bahnsteige.map((b) => b.querM).filter((q): q is number => q !== undefined);
    for (let i = 1; i < quer.length; i++) {
      if (quer[i] < quer[i - 1]) fehler.push(`Querlage auf Ebene ${ebene.level} nicht monoton`);
    }
    if (quer.length > 0 && quer[0] !== 0) fehler.push(`Querlage auf Ebene ${ebene.level} beginnt nicht bei 0`);

    for (const b of ebene.bahnsteige) {
      if (b.laengeM === undefined) continue;
      if (b.laengeM < 10 || b.laengeM > 900) fehler.push(`Bahnsteig ${b.gleise.join('/')}: ${b.laengeM} m unplausibel`);
      for (const z of b.zugaenge ?? []) {
        if (z.beiM < -10 || z.beiM > b.laengeM + 10) fehler.push(`Zugang bei ${z.beiM} m liegt neben dem ${b.laengeM}-m-Bahnsteig`);
        if (z.aufzug + z.rolltreppe + z.treppe === 0) fehler.push('Zugang ohne eine einzige Anlage');
      }
    }
    for (const e of ebene.elemente ?? []) {
      if (e.punkte.length < 1 || e.punkte.length > 2) fehler.push('Anlage mit ungueltiger Punktzahl');
      if (e.typ === 'aufzug' && e.punkte.length !== 1) fehler.push('Aufzug ist kein Punkt');
    }
    if (ebene.art === 'gleise' && ebene.netz) fehler.push(`Gleisebene ${ebene.level} traegt ein Netz`);
    for (const n of ebene.netz ?? []) {
      if (n.punkte.length < 2) fehler.push('Wegstueck mit weniger als zwei Punkten');
    }
    for (const p of [...(ebene.weg ?? []), ...(ebene.netz ?? []).flatMap((n) => n.punkte)]) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fehler.push('Punkt ohne endliche Koordinate');
    }
  }

  // Der zerlegte Weg muss den ganzen Weg ergeben.
  let summe = 0;
  for (const ebene of schema.ebenen) {
    for (let i = 1; i < (ebene.weg?.length ?? 0); i++) {
      summe += Math.hypot(
        ebene.weg![i].x - ebene.weg![i - 1].x,
        ebene.weg![i].y - ebene.weg![i - 1].y,
      );
    }
  }
  const erwartet = pfadLaenge - aufWechseln;
  // Toleranz: die Glaettung darf Ecken abschneiden, aber nicht die Form.
  if (erwartet > 20 && summe > erwartet + 5) {
    fehler.push(`Wegzerlegung zu lang: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  // Nach unten darf die Glaettung abschneiden, aber nicht die Form verlieren.
  if (erwartet > 20 && summe < erwartet * 0.85) {
    fehler.push(`Wegzerlegung zu kurz: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  return fehler;
}

async function holeOsm(eva: string, lat: number, lon: number): Promise<OverpassAntwort> {
  mkdirSync(CACHE, { recursive: true });
  const pfad = join(CACHE, `${eva}.json`);
  if (existsSync(pfad)) return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
  const antwort = await overpassQuery(lat, lon, 400);
  writeFileSync(pfad, JSON.stringify(antwort), 'utf8');
  await new Promise((r) => setTimeout(r, 3000)); // Fairness
  return antwort;
}

async function main(): Promise<void> {
  ladeSecrets();
  const befunde: Befund[] = [];
  const uebersprungen: string[] = [];

  for (const [i, name] of BAHNHOEFE.entries()) {
    process.stdout.write(`[${i + 1}/${BAHNHOEFE.length}] ${name} … `);
    try {
      const treffer = await sucheBahnhoefe(name);
      if (treffer.length === 0) {
        console.log('nicht gefunden');
        uebersprungen.push(`${name}: nicht gefunden`);
        continue;
      }
      const { eva, lat, lon } = treffer[0];
      const osm = await holeOsm(eva, lat, lon);

      const t0 = Date.now();
      const graph = baueGraph(osm);
      graph.stufe = klassifiziere(graph);
      const msGraph = Date.now() - t0;

      if (graph.gleise.length < 2) {
        console.log(`Stufe ${graph.stufe}, nur ${graph.gleise.length} Gleis(e) - keine Route`);
        uebersprungen.push(`${name}: ${graph.gleise.length} Gleise im OSM-Graphen`);
        continue;
      }

      // Bewusst die beiden aeussersten Gleise: der laengste Weg im Haus.
      const an = graph.gleise[0];
      const ab = graph.gleise[graph.gleise.length - 1];
      const pfad = berechneRoute(graph, `gleis${an}:mitte`, `gleis${ab}:mitte`, 'schnellste', 'normal');
      if (!pfad) {
        console.log(`Stufe ${graph.stufe}, keine Route ${an} → ${ab}`);
        uebersprungen.push(`${name}: keine Route ${an} → ${ab}`);
        continue;
      }

      const t1 = Date.now();
      const schema = baueBahnhofSchema(graph, pfad);
      const msSchema = Date.now() - t1;

      const aufWechseln = pfad.kanten.filter((k) => k.deltaLevel !== 0).reduce((s, k) => s + k.laengeM, 0);
      const fehler = pruefe(schema, pfad.laengeM, aufWechseln);

      const alleBahnsteige = schema.ebenen.flatMap((e) => e.bahnsteige);
      const befund: Befund = {
        name,
        stufe: graph.stufe,
        gleise: graph.gleise.length,
        ebenen: schema.ebenen.length,
        gleisebenen: schema.ebenen.filter((e) => e.art === 'gleise').length,
        mitAchse: alleBahnsteige.filter((b) => b.laengeM !== undefined).length,
        ohneAchse: alleBahnsteige.filter((b) => b.laengeM === undefined).length,
        zugaenge: alleBahnsteige.reduce((s, b) => s + (b.zugaenge?.length ?? 0), 0),
        netzStuecke: schema.ebenen.reduce((s, e) => s + (e.netz?.length ?? 0), 0),
        elemente: schema.ebenen.reduce((s, e) => s + (e.elemente?.length ?? 0), 0),
        kreuzung: schema.kreuzungswinkelGrad ?? null,
        kb: Math.round((JSON.stringify(schema).length / 1024) * 10) / 10,
        msGraph,
        msSchema,
        fehler,
      };
      befunde.push(befund);
      console.log(
        `Stufe ${befund.stufe} · ${befund.ebenen} Ebenen · ${befund.zugaenge} Zugänge · ` +
          `${befund.kb} kB · ${befund.msSchema} ms${fehler.length ? ` · ${fehler.length} BEFUND` : ''}`,
      );
    } catch (e) {
      console.log('FEHLER:', String(e).slice(0, 80));
      uebersprungen.push(`${name}: ${String(e).slice(0, 80)}`);
    }
  }

  // --- Auswertung ---
  const trenner = '='.repeat(78);
  console.log(`\n${trenner}\nAUSWERTUNG über ${befunde.length} Bahnhöfe (${uebersprungen.length} übersprungen)\n${trenner}`);

  const nachStufe = new Map<number | string, number>();
  for (const b of befunde) nachStufe.set(b.stufe, (nachStufe.get(b.stufe) ?? 0) + 1);
  console.log('Stufen:', [...nachStufe.entries()].map(([s, n]) => `${s}: ${n}`).join(' · '));

  const zahl = (f: (b: Befund) => number): string => {
    const w = befunde.map(f).sort((x, y) => x - y);
    if (w.length === 0) return '–';
    const med = w[Math.floor(w.length / 2)];
    return `min ${w[0]} · median ${med} · max ${w[w.length - 1]}`;
  };
  console.log('Ebenen je Bahnhof:   ', zahl((b) => b.ebenen));
  console.log('Antwortgröße (kB):   ', zahl((b) => b.kb));
  console.log('Zugänge:             ', zahl((b) => b.zugaenge));
  console.log('Netzstücke:          ', zahl((b) => b.netzStuecke));
  console.log('Anlagen:             ', zahl((b) => b.elemente));
  console.log('Graphbau (ms):       ', zahl((b) => b.msGraph));
  console.log('Schemabau (ms):      ', zahl((b) => b.msSchema));

  const ohneAchse = befunde.filter((b) => b.ohneAchse > 0);
  console.log(`\nBahnsteige ohne Achse: ${befunde.reduce((s, b) => s + b.ohneAchse, 0)} Stück an ${ohneAchse.length} Bahnhöfen`);
  const mitKreuzung = befunde.filter((b) => b.kreuzung !== null && b.kreuzung > 20);
  console.log(`Kreuzende Ebenen (>20°): ${mitKreuzung.length} – ${mitKreuzung.map((b) => `${b.name} ${b.kreuzung}°`).join(', ') || 'keine'}`);
  const ohneZugang = befunde.filter((b) => b.zugaenge === 0);
  console.log(`Ohne einen einzigen Zugang: ${ohneZugang.length} – ${ohneZugang.map((b) => b.name).join(', ') || 'keiner'}`);

  const mitFehler = befunde.filter((b) => b.fehler.length > 0);
  console.log(`\n${trenner}\nBEFUNDE: ${mitFehler.length} von ${befunde.length} Bahnhöfen\n${trenner}`);
  const nachArt = new Map<string, number>();
  for (const b of mitFehler) {
    console.log(`  ${b.name}:`);
    for (const f of [...new Set(b.fehler)]) {
      console.log(`     ${f}`);
      const art = f.replace(/\d+([.,]\d+)?/g, 'N').replace(/Gleis(e)? [^:]+/g, 'Gleis X');
      nachArt.set(art, (nachArt.get(art) ?? 0) + 1);
    }
  }
  if (nachArt.size > 0) {
    console.log('\nNach Art:');
    for (const [art, n] of [...nachArt.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(n).padStart(3)}× ${art}`);
    }
  }

  if (uebersprungen.length > 0) {
    console.log(`\n${trenner}\nÜBERSPRUNGEN\n${trenner}`);
    for (const u of uebersprungen) console.log('  ' + u);
  }

  console.log('\nGrößte Antworten:');
  for (const b of [...befunde].sort((x, y) => y.kb - x.kb).slice(0, 6)) {
    console.log(`  ${b.name.padEnd(24)} ${String(b.kb).padStart(6)} kB · ${b.ebenen} Ebenen · ${b.netzStuecke} Netzstücke · ${b.elemente} Anlagen`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
