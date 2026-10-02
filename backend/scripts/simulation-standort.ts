// SIMULATION: Traegt die Standortwahl am Ankunftsgleis ueber die Breite?
//
// Die Schwesterlaeufe in `simulation-schema.ts` fahren stets ab der
// Bahnsteigmitte. Das prueft das Schema, aber nicht die Frage, die einen
// Umstieg gelingen oder scheitern laesst: WO am Bahnsteig steht jemand?
//
// Leipzig Hbf, Gleis 6 nach 16, ist der Fall dahinter - vom Anfang gewinnt die
// Unterfuehrung, von der Mitte und vom Ende die U-Form ueber den Bahnhofskopf,
// 100 s Unterschied. Diese Simulation faehrt jeden Bahnhof DREIMAL, vom
// Anfang, von der Mitte und vom Ende des Ankunftsbahnsteigs, und prueft:
//
//   - Haelt jede der drei Antworten dem Ebenendesign stand? (dieselben
//     Zusicherungen wie im Schemalauf, nur eben dreimal)
//   - Wie oft entscheidet der Standort ueberhaupt den WEG, nicht nur die
//     Laenge? Gemessen an der Ebenenfolge, nicht an Metern.
//   - Ist jeder Ebenenwechsel der Route auf beiden Ebenen als Anlage
//     MARKIERT? Eine Treppe, die der Weg nimmt, aber das Bild nicht zeigt,
//     ist der Fehler, den ein Reisender im Bahnhof ausbadet.
//   - Ist die ausgewiesene Route auch die schnellste unter den dreien, die
//     ihr Standort erlaubt - oder schlaegt ein anderer Weg sie?
//
// Fairness gegenueber Overpass: dieselbe Ablage wie im Schemalauf, ein Abruf
// je Bahnhof, Pause dazwischen.
//
// Aufruf: npx tsx scripts/simulation-standort.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { overpassQuery } from '../src/clients/overpass.js';
import { sucheBahnhoefe } from '../src/clients/stations.js';
import { baueGraph } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import type {
  BahnhofSchema,
  OverpassAntwort,
  RoutenPfad,
  StationGraph,
} from '../src/core/typen.js';
import { ABLAGE } from './osm-ablage-fuellen.js';
import { ladeSecrets } from './secrets.js';

// Dieselbe Ablage wie der Schemalauf - was dort geholt wurde, wird hier nicht
// noch einmal geholt.
const CACHE = ABLAGE;

const ABSCHNITTE = ['anfang', 'mitte', 'ende'] as const;
type Abschnitt = (typeof ABSCHNITTE)[number];

/**
 * Dieselben Bahnhoefe wie im zweiten Schemalauf: die drei Metropolknoten als
 * Pflicht, sonst bewusst andere als im ersten Durchgang.
 */
const BAHNHOEFE = [
  'Berlin Hbf', 'Frankfurt(Main)Hbf', 'München Hbf',
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
  // Der Fall, der die Wahl ueberhaupt erzwungen hat.
  'Leipzig Hbf',
  // Dazu die Bahnhoefe des ERSTEN Schemalaufs. Fuer das Schema waeren sie
  // eine Wiederholung - fuer die Standortwahl nicht: Diese Achse ist an
  // keinem Bahnhof je gemessen worden, und sie liegen ohnehin in der Ablage,
  // kosten Overpass also nichts.
  'Hamburg Hbf', 'Köln Hbf', 'Stuttgart Hbf', 'Düsseldorf Hbf', 'Hannover Hbf',
  'Nürnberg Hbf', 'Dortmund Hbf', 'Essen Hbf', 'Bremen Hbf', 'Dresden Hbf',
  'Duisburg Hbf', 'Mannheim Hbf', 'Karlsruhe Hbf', 'Münster(Westf)Hbf',
  'Kassel-Wilhelmshöhe', 'Würzburg Hbf', 'Augsburg Hbf', 'Braunschweig Hbf',
  'Kiel Hbf', 'Erfurt Hbf', 'Rostock Hbf', 'Freiburg(Breisgau) Hbf', 'Mainz Hbf',
  'Osnabrück Hbf', 'Bielefeld Hbf', 'Aachen Hbf', 'Bonn Hbf', 'Wuppertal Hbf',
  'Ulm Hbf', 'Heidelberg Hbf', 'Koblenz Hbf', 'Saarbrücken Hbf', 'Magdeburg Hbf',
  'Regensburg Hbf', 'Göttingen', 'Gießen', 'Marburg(Lahn)', 'Lüneburg',
  'Cottbus Hbf', 'Schwerin Hbf', 'Heilbronn Hbf', 'Konstanz', 'Bamberg', 'Fulda',
  'Hamm(Westf)Hbf', 'Hagen Hbf', 'Uelzen', 'Treuchtlingen', 'Angermünde',
  'Büchen', 'Neuenmarkt-Wirsberg', 'Gütersloh Hbf', 'Riedstadt-Goddelau',
  'Bad Kleinen', 'Kirchhain(Bz Kassel)', 'Zernitz',
];

/**
 * Nur aus der Ablage lesen, nichts neu holen?
 *
 * Der Schemalauf vom 13.09.2026 verlor 18 von 60 Bahnhoefen an
 * Overpass-Zeitueberschreitungen - die oeffentliche Instanz war unter Last.
 * Fuer die Frage dieses Laufs ist das gleichgueltig: Was in der Ablage liegt,
 * genuegt. `ABLAGE_NUR=1` faehrt deshalb ohne einen einzigen Netzabruf.
 */
const ABLAGE_NUR = process.env.ABLAGE_NUR === '1';

interface Lauf {
  abschnitt: Abschnitt;
  /** Fiel der Startknoten auf die Mitte zurueck? Dann ist der Lauf kein eigener. */
  echt: boolean;
  gehzeitSek: number;
  laengeM: number;
  /** Ebenenfolge als Text - die Kennung des WEGS, nicht seiner Laenge. */
  ebenenfolge: string;
  fehler: string[];
}

interface Befund {
  name: string;
  stufe: number | string;
  gleisAn: string;
  gleisAb: string;
  laeufe: Lauf[];
  fehler: string[];
}

/** Alles, was das Schema behauptet, gegen das pruefen, was es behaupten darf. */
function pruefeSchema(schema: BahnhofSchema, pfadLaenge: number, aufWechseln: number): string[] {
  const fehler: string[] = [];

  for (const ebene of schema.ebenen) {
    const quer = ebene.bahnsteige.map((b) => b.querM).filter((q): q is number => q !== undefined);
    for (let i = 1; i < quer.length; i++) {
      if (quer[i] < quer[i - 1]) fehler.push(`Querlage auf Ebene ${ebene.level} nicht monoton`);
    }
    if (quer.length > 0 && quer[0] !== 0) {
      fehler.push(`Querlage auf Ebene ${ebene.level} beginnt nicht bei 0`);
    }

    for (const b of ebene.bahnsteige) {
      if (b.laengeM === undefined) continue;
      if (b.laengeM < 10 || b.laengeM > 900) {
        fehler.push(`Bahnsteig ${b.gleise.join('/')}: ${b.laengeM} m unplausibel`);
      }
      for (const z of b.zugaenge ?? []) {
        if (z.beiM < -10 || z.beiM > b.laengeM + 10) {
          fehler.push(`Zugang bei ${z.beiM} m liegt neben dem ${b.laengeM}-m-Bahnsteig`);
        }
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
  if (erwartet > 20 && summe > erwartet + 5) {
    fehler.push(`Wegzerlegung zu lang: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  if (erwartet > 20 && summe < erwartet * 0.85) {
    fehler.push(`Wegzerlegung zu kurz: ${Math.round(summe)} statt ${Math.round(erwartet)} m`);
  }
  return fehler;
}

/**
 * JEDE Treppe, die die Route nimmt, muss im Bild stehen - auf der Ebene, die
 * sie verlaesst, UND auf der, die sie erreicht.
 *
 * Das ist die Zusicherung hinter „Treppen unbedingt markieren". Ein
 * Ebenenwechsel, den der Weg nimmt, ohne dass das Bild eine Anlage an dieser
 * Stelle zeigt, ist fuer den Reisenden ein Sprung ins Nichts: Der Text sagt
 * „nach unten", das Bild zeigt nicht, wodurch.
 */
function pruefeMarkierung(schema: BahnhofSchema): string[] {
  const fehler: string[] = [];
  for (const wechsel of schema.wechsel) {
    for (const level of [wechsel.vonLevel, wechsel.nachLevel]) {
      // ALLE Besuche dieser Ebene, nicht der erste. `schema.ebenen` ist seit
      // dem 13.09.2026 eine Liste von BESUCHEN - Berlin Hbf betritt Ebene -1
      // zweimal, einmal ueber Rolltreppen und einmal ueber Treppen. Ein
      // `find` haette dort die Treppen vermisst, die auf dem zweiten Besuch
      // sehr wohl stehen.
      const besuche = schema.ebenen.filter((e) => e.level === level);
      if (besuche.length === 0) {
        fehler.push(`Ebenenwechsel nach ${level} fuehrt auf eine Ebene, die das Schema nicht hat`);
        continue;
      }
      const markiert = besuche.some((e) =>
        (e.elemente ?? []).some((el) => el.typ === wechsel.typ && el.aufRoute),
      );
      if (!markiert) {
        fehler.push(
          `${wechsel.typ} ${wechsel.vonLevel}→${wechsel.nachLevel} ist auf Ebene ${level} nicht markiert`,
        );
      }
    }
  }
  return fehler;
}

/** Die Ebenenfolge als Kennung des Wegs: "1 → 0 → 1" statt "265 m". */
function ebenenfolge(schema: BahnhofSchema): string {
  return schema.ebenen.map((e) => e.level).join(' → ');
}

/**
 * Was schon in der Ablage liegt, wird nicht neu geholt - sonst nach hinten
 * wachsende Pausen.
 *
 * Der erste Lauf am 13.09. verlor elf Bahnhoefe an Overpass-Zeitueberschreitungen,
 * und zwar ab dem Punkt, an dem die Ablage leer lief: Die 3-Sekunden-Pause lief
 * nur nach ERFOLGREICHEN Abrufen, ein Fehlschlag ging ohne Atempause in den
 * naechsten. Gegen eine Drosselung ist genau das die falsche Reaktion. Deshalb
 * hier: laengere Grundpause, und nach einem Fehlschlag eine wachsende.
 */
const PAUSE_MS = 6000;
const PAUSE_NACH_FEHLER_MS = 30_000;

async function holeOsm(
  eva: string,
  lat: number,
  lon: number,
  fehlerBisher: { anzahl: number },
): Promise<OverpassAntwort> {
  mkdirSync(CACHE, { recursive: true });
  const pfad = join(CACHE, `${eva}.json`);
  if (existsSync(pfad)) return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
  if (ABLAGE_NUR) throw new Error('nicht in der Ablage (ABLAGE_NUR)');
  try {
    const antwort = await overpassQuery(lat, lon, 400);
    writeFileSync(pfad, JSON.stringify(antwort), 'utf8');
    fehlerBisher.anzahl = 0;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    return antwort;
  } catch (e) {
    fehlerBisher.anzahl += 1;
    await new Promise((r) => setTimeout(r, PAUSE_NACH_FEHLER_MS * fehlerBisher.anzahl));
    throw e;
  }
}

/** Ein Lauf ab einem Bahnsteigabschnitt - oder `null`, wenn keine Route steht. */
function fahre(
  graph: StationGraph,
  gleisAn: string,
  gleisAb: string,
  abschnitt: Abschnitt,
): { lauf: Lauf; pfad: RoutenPfad } | null {
  const start = findeStartknoten(graph, gleisAn, abschnitt);
  const ziel = findeStartknoten(graph, gleisAb);
  const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, 'schnellste', 'normal');
  if (!pfad) return null;

  const schema = baueBahnhofSchema(graph, pfad);
  const aufWechseln = pfad.kanten
    .filter((k) => k.deltaLevel !== 0)
    .reduce((s, k) => s + k.laengeM, 0);

  return {
    pfad,
    lauf: {
      abschnitt,
      // `findeStartknoten` faellt still auf die Mitte zurueck, wenn der
      // Abschnitt im Graphen fehlt. Dann ist der Lauf eine Wiederholung, kein
      // eigener Fall - und darf die Auswertung nicht als „kein Unterschied"
      // beschoenigen.
      echt: start.hinweis === undefined,
      gehzeitSek: gehzeitSekunden(pfad, 'normal'),
      laengeM: Math.round(pfad.laengeM),
      ebenenfolge: ebenenfolge(schema),
      fehler: [
        ...pruefeSchema(schema, pfad.laengeM, aufWechseln),
        ...pruefeMarkierung(schema),
      ],
    },
  };
}

async function main(): Promise<void> {
  ladeSecrets();
  const befunde: Befund[] = [];
  const uebersprungen: string[] = [];
  const fehlerBisher = { anzahl: 0 };

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
      const osm = await holeOsm(eva, lat, lon, fehlerBisher);

      const graph = baueGraph(osm);
      graph.stufe = klassifiziere(graph);
      if (graph.gleise.length < 2) {
        console.log(`Stufe ${graph.stufe}, nur ${graph.gleise.length} Gleis(e) - keine Route`);
        uebersprungen.push(`${name}: ${graph.gleise.length} Gleise im OSM-Graphen`);
        continue;
      }

      // Wie im Schemalauf: die beiden aeussersten Gleise, der laengste Weg im Haus.
      const gleisAn = graph.gleise[0];
      const gleisAb = graph.gleise[graph.gleise.length - 1];

      const laeufe: Lauf[] = [];
      for (const abschnitt of ABSCHNITTE) {
        const ergebnis = fahre(graph, gleisAn, gleisAb, abschnitt);
        if (!ergebnis) continue;
        laeufe.push(ergebnis.lauf);
      }
      if (laeufe.length === 0) {
        console.log(`Stufe ${graph.stufe}, keine Route ${gleisAn} → ${gleisAb}`);
        uebersprungen.push(`${name}: keine Route ${gleisAn} → ${gleisAb}`);
        continue;
      }

      const befund: Befund = {
        name,
        stufe: graph.stufe,
        gleisAn,
        gleisAb,
        laeufe,
        fehler: laeufe.flatMap((l) => l.fehler.map((f) => `[${l.abschnitt}] ${f}`)),
      };
      befunde.push(befund);

      const echte = laeufe.filter((l) => l.echt);
      const zeiten = echte.map((l) => l.gehzeitSek);
      const spanne = zeiten.length > 1 ? Math.max(...zeiten) - Math.min(...zeiten) : 0;
      const wege = new Set(echte.map((l) => l.ebenenfolge));
      console.log(
        `Stufe ${befund.stufe} · ${gleisAn}→${gleisAb} · ${echte.length}/3 echt · ` +
          `${zeiten.join('/')} s · Spanne ${spanne} s · ${wege.size} Weg(e)` +
          (befund.fehler.length ? ` · ${befund.fehler.length} BEFUND` : ''),
      );
    } catch (e) {
      console.log('FEHLER:', String(e).slice(0, 80));
      uebersprungen.push(`${name}: ${String(e).slice(0, 80)}`);
    }
  }

  // --- Auswertung ---
  const trenner = '='.repeat(78);
  console.log(
    `\n${trenner}\nAUSWERTUNG über ${befunde.length} Bahnhöfe (${uebersprungen.length} übersprungen)\n${trenner}`,
  );

  const mitDreien = befunde.filter((b) => b.laeufe.filter((l) => l.echt).length === 3);
  console.log(
    `Bahnhöfe mit drei echten Startpunkten: ${mitDreien.length} von ${befunde.length}`,
  );
  const nurMitte = befunde.length - mitDreien.length;
  if (nurMitte > 0) {
    console.log(
      `  ${nurMitte} Bahnhof/Bahnhöfe kennen Anfang oder Ende nicht – dort fällt die Wahl auf die Mitte zurück.`,
    );
  }

  const spanne = (b: Befund): number => {
    const z = b.laeufe.filter((l) => l.echt).map((l) => l.gehzeitSek);
    return z.length > 1 ? Math.max(...z) - Math.min(...z) : 0;
  };
  const wegzahl = (b: Befund): number =>
    new Set(b.laeufe.filter((l) => l.echt).map((l) => l.ebenenfolge)).size;

  const mitUnterschied = mitDreien.filter((b) => spanne(b) > 0);
  console.log(
    `\nStandort ändert die Gehzeit: ${mitUnterschied.length} von ${mitDreien.length} Bahnhöfen`,
  );
  const sortiert = [...mitDreien].sort((x, y) => spanne(y) - spanne(x));
  console.log('Größte Spannen (Sekunden zwischen bestem und schlechtestem Standort):');
  for (const b of sortiert.slice(0, 12)) {
    if (spanne(b) === 0) break;
    const zeilen = b.laeufe
      .filter((l) => l.echt)
      .map((l) => `${l.abschnitt} ${l.gehzeitSek} s`)
      .join(' · ');
    console.log(`  ${b.name.padEnd(28)} ${String(spanne(b)).padStart(4)} s  ${zeilen}`);
  }

  const mitZweiWegen = mitDreien.filter((b) => wegzahl(b) > 1);
  console.log(
    `\nStandort ändert den WEG (andere Ebenenfolge): ${mitZweiWegen.length} von ${mitDreien.length}`,
  );
  for (const b of mitZweiWegen) {
    console.log(`  ${b.name}:`);
    for (const l of b.laeufe.filter((x) => x.echt)) {
      console.log(`     ${l.abschnitt.padEnd(7)} ${String(l.gehzeitSek).padStart(4)} s · Ebenen ${l.ebenenfolge}`);
    }
  }

  const alleZeiten = befunde.flatMap((b) => b.laeufe.filter((l) => l.echt).map((l) => l.gehzeitSek));
  alleZeiten.sort((a, b) => a - b);
  if (alleZeiten.length > 0) {
    console.log(
      `\nGehzeiten über alle Läufe: min ${alleZeiten[0]} s · median ${
        alleZeiten[Math.floor(alleZeiten.length / 2)]
      } s · max ${alleZeiten[alleZeiten.length - 1]} s (${alleZeiten.length} Läufe)`,
    );
  }

  const mitFehler = befunde.filter((b) => b.fehler.length > 0);
  console.log(`\n${trenner}\nBEFUNDE: ${mitFehler.length} von ${befunde.length} Bahnhöfen\n${trenner}`);
  const nachArt = new Map<string, number>();
  for (const b of mitFehler) {
    console.log(`  ${b.name}:`);
    for (const f of [...new Set(b.fehler)]) {
      console.log(`     ${f}`);
      const art = f
        .replace(/^\[\w+\] /, '')
        .replace(/-?\d+([.,]\d+)?/g, 'N')
        .replace(/Bahnsteig [^:]+/g, 'Bahnsteig X');
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
