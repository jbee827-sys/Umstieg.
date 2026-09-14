// SIMULATION, dritter Durchgang (14.09.2026): Hält jede Alternative dem
// Ebenendesign stand?
//
// Die beiden Läufe vom 13.09. fuhren je Bahnhof EIN Gleispaar - das erste
// und das letzte Gleis - und prüften das Schema. Beide meldeten null Befunde,
// und beide übersahen den Fehler, der Leipzig ab der Bahnsteigmitte über den
// Kopf schickte: An jedem zweigleisigen Bahnsteig war nur eine der beiden
// Ketten verdichtet. Das Schema war dabei richtig - es zeichnete treu den Weg,
// den ein unvollständiger Graph lieferte.
//
// Dieser Lauf prüft deshalb nicht nur, was gezeichnet wird, sondern auch,
// was der Graph ANBIETET:
//
//   - bis zu vier Gleispaare je Bahnhof, jedes ab Anfang, Mitte und Ende,
//     schnellste und barrierefreie Route
//   - Schema und Markierung wie bisher
//   - Bahnsteigwege: Ist jeder Zugang am Ankunfts- und Abfahrtsbahnsteig ohne
//     Umweg erreichbar? (Der Fehler vom 14.09.)
//   - Alternativen: Ist keine erzwungene Route über irgendeinen Ebenenwechsel
//     schneller als die gewählte? (Die Zusicherung „alle Wege geprüft".)
//
// Jede Route geht als Zeile in eine JSONL-Datei. `frontend/scripts/
// simulation-bild.ts` zeichnet sie danach mit dem echten Bildcode - die
// Probe, ob das Ebenendesign trägt. Getrennt, weil das Backend den
// Frontend-Code nicht importieren kann, ohne seine Typprüfung zu brechen.
//
// Ohne Netz: Namen und OSM kommen aus der Ablage (`osm-ablage-fuellen.ts`).
//
// Aufruf: npx tsx scripts/simulation-lauf3.ts <ausgabe.jsonl>
//   LISTE=ablage          alle abgelegten Bahnhöfe statt der Liste LAUF_3
//   VARIANTEN=schnellste  nur die schnellste Route
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { baueGraph } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten, istGleicherBahnsteig } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { generiereSchritte } from '../src/core/textgen.js';
import type { OverpassAntwort, RoutenVariante, StationGraph } from '../src/core/typen.js';
import { ABLAGE, LAUF_3, NACHLAUF, ladeNamen } from './osm-ablage-fuellen.js';
import {
  ebenenfolge,
  pruefeAlternativen,
  pruefeBahnsteigwege,
  pruefeMarkierung,
  pruefeSchema,
  pruefeSchritte,
} from './pruefungen.js';

const ABSCHNITTE = ['anfang', 'mitte', 'ende'] as const;
type Abschnitt = (typeof ABSCHNITTE)[number];
const VARIANTEN: RoutenVariante[] =
  process.env.VARIANTEN === 'schnellste' ? ['schnellste'] : ['schnellste', 'barrierefrei'];

/** Die drei Metropolknoten - auch dann, wenn die Namenssuche an der DB-API scheiterte. */
const BEKANNT: Record<string, string> = {
  'Berlin Hbf': '8011160',
  'Frankfurt(Main)Hbf': '8000105',
  'München Hbf': '8000261',
};
const METROPOLEN = new Set(Object.keys(BEKANNT));

interface Lauf {
  bahnhof: string;
  eva: string;
  stufe: number;
  /** Gleise im Graphen – die Größenklasse des Bahnhofs. */
  gleise: number;
  /** Schritte der Route, und wie viele davon „wenige Meter" sagen. */
  schritte: number;
  kleinstschritte: number;
  gleisAn: string;
  gleisAb: string;
  abschnitt: Abschnitt;
  variante: RoutenVariante;
  /** Fiel der Startknoten auf die Mitte zurück? Dann ist der Lauf kein eigener. */
  echt: boolean;
  gehzeitSek: number;
  laengeM: number;
  ebenenfolge: string;
  wechsel: string[];
  /**
   * Treppen, Rolltreppen, Aufzüge, die der Weg nimmt, OHNE dass der Graph
   * einen Ebenenwechsel kennt - etwa eine Unterführung, die in OSM kein
   * `level` trägt. Im Bild gibt es sie nicht: Das Schema zeichnet Wechsel,
   * und hier wechselt nichts. Für den Reisenden ist es trotzdem eine Treppe.
   */
  stumm: string[];
  zweitbesteSek?: number;
  zweitbesteTyp?: string;
  fehler: string[];
}

/**
 * Bis zu vier Gleispaare, über den Bahnhof verteilt.
 *
 * Das erste und letzte Gleis allein prüfen immer denselben Weg: den längsten.
 * Die Wege dazwischen – zwei Nachbarbahnsteige, eine Hälfte des Hauses –
 * sind die, an denen Treppe gegen Rolltreppe und Unterführung gegen Kopf
 * konkurrieren.
 */
function waehlePaare(graph: StationGraph): [string, string][] {
  const g = graph.gleise;
  const n = g.length;
  const kandidaten: [string, string][] = [
    [g[0], g[n - 1]],
    [g[n - 1], g[0]],
    [g[Math.floor(n / 3)], g[Math.floor((2 * n) / 3)]],
    [g[Math.min(1, n - 1)], g[Math.max(n - 2, 0)]],
  ];
  const paare: [string, string][] = [];
  const gesehen = new Set<string>();
  for (const [an, ab] of kandidaten) {
    if (an === ab || gesehen.has(`${an}|${ab}`)) continue;
    gesehen.add(`${an}|${ab}`);
    // Derselbe Bahnsteig: „gegenüber" – kein Weg durchs Haus, nichts zu zeichnen.
    if (istGleicherBahnsteig(graph, an, ab)) continue;
    paare.push([an, ab]);
  }
  return paare;
}

function bahnhoefe(): { name: string; eva: string }[] {
  const namen = ladeNamen();
  if (process.env.LISTE === 'ablage') {
    // Namen aus der Suche, sonst aus den Bahnsteig- und Haltestellennamen der
    // Ablage selbst (`eva-namen.json`, grob, aber ohne Netz).
    const ausOsm = join(ABLAGE, 'eva-namen.json');
    const grob: Record<string, string> = existsSync(ausOsm)
      ? (JSON.parse(readFileSync(ausOsm, 'utf8')) as Record<string, string>)
      : {};
    const nachEva = new Map<string, string>([
      ...Object.entries(grob).filter(([, n]) => n !== '?'),
      ...Object.entries(BEKANNT).map(([n, e]) => [e, n] as [string, string]),
      ...Object.entries(namen).map(([name, e]) => [e.eva, name] as [string, string]),
    ]);
    return readdirSync(ABLAGE)
      .filter((d) => /^\d+\.json$/.test(d))
      .map((d) => d.replace('.json', ''))
      .map((eva) => ({ name: nachEva.get(eva) ?? `EVA ${eva}`, eva }));
  }
  return [...NACHLAUF, ...LAUF_3].map((name) => ({
    name,
    eva: namen[name]?.eva ?? BEKANNT[name] ?? '',
  }));
}

function main(): void {
  const ausgabe = process.argv[2];
  if (!ausgabe) {
    console.error('Aufruf: npx tsx scripts/simulation-lauf3.ts <ausgabe.jsonl>');
    process.exit(2);
  }
  writeFileSync(ausgabe, '', 'utf8');

  const laeufe: Lauf[] = [];
  const bahnsteigBefunde = new Map<string, string[]>();
  const uebersprungen: string[] = [];
  const liste = bahnhoefe();

  for (const [i, { name, eva }] of liste.entries()) {
    process.stdout.write(`[${i + 1}/${liste.length}] ${name} … `);
    const pfadOsm = join(ABLAGE, `${eva}.json`);
    if (!eva || !existsSync(pfadOsm)) {
      console.log('nicht in der Ablage');
      uebersprungen.push(`${name}: nicht in der Ablage`);
      continue;
    }
    const t0 = Date.now();
    const graph = baueGraph(JSON.parse(readFileSync(pfadOsm, 'utf8')) as OverpassAntwort);
    graph.stufe = klassifiziere(graph);
    if (graph.gleise.length < 2) {
      console.log(`Stufe ${graph.stufe}, ${graph.gleise.length} Gleis(e)`);
      uebersprungen.push(`${name}: ${graph.gleise.length} Gleise im OSM-Graphen`);
      continue;
    }
    const paare = waehlePaare(graph);
    if (paare.length === 0) {
      console.log('nur Gleise am selben Bahnsteig');
      uebersprungen.push(`${name}: alle Paare am selben Bahnsteig`);
      continue;
    }

    let routen = 0;
    let befunde = 0;
    const ohneRoute: string[] = [];
    const bsFehler = new Set<string>();
    for (const [gleisAn, gleisAb] of paare) {
      // Bahnsteigwege je Standort und am Ziel - einmal je Paar, nicht je Variante.
      for (const abschnitt of ABSCHNITTE) {
        const start = findeStartknoten(graph, gleisAn, abschnitt);
        for (const f of pruefeBahnsteigwege(graph, start.knoten)) bsFehler.add(f);
      }
      for (const f of pruefeBahnsteigwege(graph, findeStartknoten(graph, gleisAb).knoten)) bsFehler.add(f);

      for (const variante of VARIANTEN) {
        for (const abschnitt of ABSCHNITTE) {
          const start = findeStartknoten(graph, gleisAn, abschnitt);
          const ziel = findeStartknoten(graph, gleisAb);
          const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, variante, 'normal');
          if (!pfad) {
            ohneRoute.push(`${gleisAn}→${gleisAb} ${variante} ${abschnitt}`);
            continue;
          }
          routen++;
          const gehzeitSek = gehzeitSekunden(pfad, 'normal');
          const schema = baueBahnhofSchema(graph, pfad);
          const schritte = generiereSchritte(pfad, { ungefaehr: graph.stufe === 3, profil: 'normal' });
          const aufWechseln = pfad.kanten.filter((k) => k.deltaLevel !== 0).reduce((s, k) => s + k.laengeM, 0);
          const fehler = [
            ...pruefeSchema(schema, pfad.laengeM, aufWechseln),
            ...pruefeMarkierung(schema),
            ...pruefeSchritte(schritte, pfad, gehzeitSek),
          ];
          let zweit: { zweitbesteSek?: number; zweitbesteTyp?: string } = {};
          if (variante === 'schnellste') {
            const erster = pfad.kanten.find((k) => k.deltaLevel !== 0);
            const alt = pruefeAlternativen(graph, start.knoten.id, ziel.knoten.id, gehzeitSek, erster);
            fehler.push(...alt.fehler);
            zweit = { zweitbesteSek: alt.zweitbesteSek, zweitbesteTyp: alt.zweitbesteTyp };
          }
          befunde += fehler.length;
          const lauf: Lauf = {
            bahnhof: name,
            eva,
            stufe: graph.stufe,
            gleise: graph.gleise.length,
            schritte: schritte.length,
            kleinstschritte: schritte.filter((s) => /wenige Meter/i.test(s.text)).length,
            gleisAn,
            gleisAb,
            abschnitt,
            variante,
            echt: start.hinweis === undefined,
            gehzeitSek,
            laengeM: Math.round(pfad.laengeM),
            ebenenfolge: ebenenfolge(schema),
            wechsel: schema.wechsel.map((w) => w.typ),
            stumm: pfad.kanten.filter((k) => k.typ !== 'eben' && k.deltaLevel === 0).map((k) => k.typ),
            ...zweit,
            fehler,
          };
          laeufe.push(lauf);
          appendFileSync(
            ausgabe,
            JSON.stringify({ ...lauf, schema, schritte, metropole: METROPOLEN.has(name) }) + '\n',
            'utf8',
          );
        }
      }
    }
    if (bsFehler.size > 0) bahnsteigBefunde.set(name, [...bsFehler]);
    console.log(
      `Stufe ${graph.stufe} · ${paare.length} Paare · ${routen} Routen · ${Date.now() - t0} ms` +
        (ohneRoute.length ? ` · ${ohneRoute.length} ohne Route` : '') +
        (befunde ? ` · ${befunde} BEFUND` : '') +
        (bsFehler.size ? ` · ${bsFehler.size} UMWEG` : ''),
    );
  }

  auswerten(laeufe, bahnsteigBefunde, uebersprungen);
}

function auswerten(laeufe: Lauf[], bahnsteigBefunde: Map<string, string[]>, uebersprungen: string[]): void {
  const trenner = '='.repeat(78);
  const bahnhofZahl = new Set(laeufe.map((l) => l.bahnhof)).size;
  console.log(`\n${trenner}\nAUSWERTUNG: ${laeufe.length} Routen an ${bahnhofZahl} Bahnhöfen (${uebersprungen.length} übersprungen)\n${trenner}`);

  const schnell = laeufe.filter((l) => l.variante === 'schnellste');
  const barriere = laeufe.filter((l) => l.variante === 'barrierefrei');
  console.log(`Schnellste: ${schnell.length} · barrierefrei: ${barriere.length}`);

  // --- Größenklassen: vom Metropolknoten bis zum Kleinstadtbahnhof ---
  const klasse = (gleise: number): string => (gleise >= 12 ? 'groß' : gleise >= 6 ? 'mittel' : 'klein');
  console.log('\nGrößenklassen (Gleise im Graphen: groß ≥ 12 · mittel 6–11 · klein ≤ 5):');
  for (const k of ['groß', 'mittel', 'klein']) {
    const ls = laeufe.filter((l) => klasse(l.gleise) === k);
    if (ls.length === 0) continue;
    const mitBefund = ls.filter((l) => l.fehler.length > 0);
    console.log(
      `  ${k.padEnd(7)} ${String(new Set(ls.map((l) => l.bahnhof)).size).padStart(3)} Bahnhöfe · ` +
        `${String(ls.length).padStart(4)} Routen · ${mitBefund.length} mit Befund · ` +
        `Schritte median ${median(ls.map((l) => l.schritte))} (max ${Math.max(...ls.map((l) => l.schritte))}) · ` +
        `„wenige Meter" je Route median ${median(ls.map((l) => l.kleinstschritte))}`,
    );
  }

  // --- Standort: Wie oft ändert er den WEG, nicht nur die Länge? ---
  const jePaar = new Map<string, Lauf[]>();
  for (const l of schnell) {
    const k = `${l.bahnhof}|${l.gleisAn}|${l.gleisAb}`;
    jePaar.set(k, [...(jePaar.get(k) ?? []), l]);
  }
  let mitDreien = 0;
  let wegAnders = 0;
  let zeitAnders = 0;
  const spannen: { k: string; spanne: number; zeilen: string }[] = [];
  for (const [k, ls] of jePaar) {
    const echte = ls.filter((l) => l.echt);
    if (echte.length < 3) continue;
    mitDreien++;
    const zeiten = echte.map((l) => l.gehzeitSek);
    const spanne = Math.max(...zeiten) - Math.min(...zeiten);
    if (spanne > 0) zeitAnders++;
    if (new Set(echte.map((l) => l.ebenenfolge)).size > 1) wegAnders++;
    spannen.push({
      k,
      spanne,
      zeilen: echte.map((l) => `${l.abschnitt} ${l.gehzeitSek} s (${l.ebenenfolge})`).join(' · '),
    });
  }
  console.log(`\nGleispaare mit drei echten Standorten: ${mitDreien}`);
  console.log(`  Standort ändert die Gehzeit: ${zeitAnders} · den WEG (andere Ebenenfolge): ${wegAnders}`);
  console.log('  Größte Spannen:');
  for (const s of spannen.sort((a, b) => b.spanne - a.spanne).slice(0, 10)) {
    console.log(`    ${s.k.padEnd(40)} ${String(s.spanne).padStart(4)} s  ${s.zeilen}`);
  }

  // --- Konkurrenz: Wie knapp liegt der beste Weg über einen anderen Zugang? ---
  const knapp = schnell.filter((l) => l.zweitbesteSek !== undefined && l.zweitbesteSek - l.gehzeitSek <= 30);
  console.log(`\nKnappe Konkurrenz (anderer Zugang ≤ 30 s langsamer): ${knapp.length} von ${schnell.length} Routen`);
  const treppeStattRolltreppe = schnell.filter(
    (l) => l.wechsel[0] === 'treppe' && l.zweitbesteTyp === 'rolltreppe',
  );
  console.log(
    `Treppe gewählt, obwohl die nächstbeste über eine Rolltreppe ginge: ${treppeStattRolltreppe.length} ` +
      `(median ${median(treppeStattRolltreppe.map((l) => (l.zweitbesteSek ?? 0) - l.gehzeitSek))} s Vorsprung)`,
  );

  // --- Stumme Anlagen: Treppen ohne Ebenenwechsel ---
  const mitStummen = laeufe.filter((l) => l.stumm.length > 0);
  console.log(
    `\nTreppen/Rolltreppen/Aufzüge OHNE Ebenenwechsel auf dem Weg: ${mitStummen.length} Routen an ` +
      `${new Set(mitStummen.map((l) => l.bahnhof)).size} Bahnhöfen (im Bild nicht als Wechsel sichtbar)`,
  );
  const stummNachTyp = new Map<string, number>();
  for (const l of mitStummen) for (const t of l.stumm) stummNachTyp.set(t, (stummNachTyp.get(t) ?? 0) + 1);
  console.log('  ' + [...stummNachTyp.entries()].map(([t, n]) => `${t}: ${n}`).join(' · '));

  // --- Barrierefrei ---
  const paareBarriere = new Set(barriere.map((l) => `${l.bahnhof}|${l.gleisAn}|${l.gleisAb}`));
  const paareAlle = new Set(schnell.map((l) => `${l.bahnhof}|${l.gleisAn}|${l.gleisAb}`));
  console.log(`\nBarrierefreie Route vorhanden: ${paareBarriere.size} von ${paareAlle.size} Gleispaaren`);

  // --- Metropolen im Einzelnen ---
  console.log(`\n${trenner}\nMETROPOLEN\n${trenner}`);
  for (const m of METROPOLEN) {
    const ls = schnell.filter((l) => l.bahnhof === m);
    if (ls.length === 0) {
      console.log(`  ${m}: nicht gemessen`);
      continue;
    }
    console.log(`  ${m} (Stufe ${ls[0].stufe}):`);
    const paare = new Set(ls.map((l) => `${l.gleisAn} → ${l.gleisAb}`));
    for (const p of paare) {
      const zeilen = ls
        .filter((l) => `${l.gleisAn} → ${l.gleisAb}` === p)
        .map((l) => `${l.abschnitt} ${l.gehzeitSek} s [${l.ebenenfolge}]${l.echt ? '' : ' (Mitte-Rückfall)'}`);
      console.log(`     ${p.padEnd(9)} ${zeilen.join(' · ')}`);
    }
  }

  // --- Befunde ---
  const mitFehler = laeufe.filter((l) => l.fehler.length > 0);
  console.log(`\n${trenner}\nBEFUNDE: ${mitFehler.length} Routen an ${new Set(mitFehler.map((l) => l.bahnhof)).size} Bahnhöfen\n${trenner}`);
  const nachArt = new Map<string, number>();
  for (const l of mitFehler) {
    for (const f of l.fehler) {
      const art = f.replace(/n\d+@-?[\d.]+/g, 'K').replace(/-?\d+([.,]\d+)?/g, 'N').replace(/Bahnsteig [^:]+/g, 'Bahnsteig X');
      nachArt.set(art, (nachArt.get(art) ?? 0) + 1);
    }
  }
  for (const [art, n] of [...nachArt.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}× ${art}`);
  for (const l of mitFehler.slice(0, 15)) {
    console.log(`  ${l.bahnhof} ${l.gleisAn}→${l.gleisAb} ${l.abschnitt} ${l.variante}: ${l.fehler[0]}`);
  }

  console.log(`\nBAHNSTEIGWEGE (Umwege zu einem Zugang): ${bahnsteigBefunde.size} Bahnhöfe`);
  for (const [name, fs] of bahnsteigBefunde) {
    console.log(`  ${name}: ${fs.length}`);
    for (const f of fs.slice(0, 3)) console.log(`     ${f}`);
  }

  if (uebersprungen.length > 0) {
    console.log(`\n${trenner}\nÜBERSPRUNGEN\n${trenner}`);
    for (const u of uebersprungen) console.log('  ' + u);
  }
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

main();
