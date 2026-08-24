// Datenrealitäts-Spike (Plan Task 6): Wie gut ist die OSM-Indoor-Abdeckung
// deutscher Bahnhöfe wirklich? Ergebnis steuert die Prioritäten (Entscheidungstor).
//
// Aufruf: npx tsx scripts/spike-datenrealitaet.ts
// Rohdaten werden unter test/fixtures/spike/ gecacht – Wiederholungsläufe
// fragen nur fehlende Bahnhöfe bei Overpass an (Fairness).
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { overpassQuery } from '../src/clients/overpass.js';
import { baueGraph } from '../src/core/graph.js';
import { erreichbareGleisPaare, klassifiziere } from '../src/core/klassifikation.js';
import type { OverpassAntwort, Stufe } from '../src/core/typen.js';
import { SPIKE_BAHNHOEFE, type SpikeBahnhof } from './spike-bahnhoefe.js';

const CACHE_ORDNER = fileURLToPath(new URL('../test/fixtures/spike/', import.meta.url));
const REPORT_PFAD = fileURLToPath(
  new URL('../../docs/spike-datenrealitaet-ergebnis.md', import.meta.url),
);
const PAUSE_MS = 2500;

interface SpikeErgebnis {
  bahnhof: SpikeBahnhof;
  elemente: number;
  gleise: number;
  stufe: Stufe;
  verbundenheit: number; // Anteil erreichbarer Gleispaare 0..1
  waysMitLevel: number;
  waysGesamt: number;
  abschnittsmarker: number; // Elemente mit platform_section-artigen Tags
}

async function holeAntwort(bahnhof: SpikeBahnhof): Promise<OverpassAntwort> {
  const cachePfad = `${CACHE_ORDNER}${bahnhof.slug}.json`;
  if (existsSync(cachePfad)) {
    return JSON.parse(await readFile(cachePfad, 'utf8')) as OverpassAntwort;
  }
  const antwort = await overpassQuery(bahnhof.lat, bahnhof.lon, 400);
  await writeFile(cachePfad, JSON.stringify(antwort));
  await new Promise((r) => setTimeout(r, PAUSE_MS));
  return antwort;
}

function analysiere(bahnhof: SpikeBahnhof, antwort: OverpassAntwort): SpikeErgebnis {
  const graph = baueGraph(antwort);
  const ways = antwort.elements.filter((e) => e.type === 'way' && e.tags);
  const abschnittsmarker = antwort.elements.filter((e) => {
    if (!e.tags) return false;
    return Object.keys(e.tags).some(
      (k) => k.includes('platform_section') || k.includes('platform:section'),
    ) || e.tags.railway === 'platform_section';
  }).length;
  return {
    bahnhof,
    elemente: antwort.elements.length,
    gleise: graph.gleise.length,
    stufe: klassifiziere(graph),
    verbundenheit: erreichbareGleisPaare(graph),
    waysMitLevel: ways.filter((w) => w.tags!.level !== undefined).length,
    waysGesamt: ways.length,
    abschnittsmarker,
  };
}

function prozent(anteil: number): string {
  return `${Math.round(anteil * 100)} %`;
}

function stufenVerteilung(ergebnisse: SpikeErgebnis[]): Record<Stufe, number> {
  const v: Record<Stufe, number> = { 1: 0, 2: 0, 3: 0 };
  for (const e of ergebnisse) v[e.stufe]++;
  return v;
}

function erzeugeReport(ergebnisse: SpikeErgebnis[]): string {
  const n = ergebnisse.length;
  const gesamt = stufenVerteilung(ergebnisse);
  const stufe1Anteil = gesamt[1] / n;

  const zeilen: string[] = [];
  zeilen.push('# Datenrealitäts-Spike – Ergebnis');
  zeilen.push('');
  zeilen.push(`Stand: ${new Date().toLocaleDateString('de-DE')} · Stichprobe: ${n} Bahnhöfe · Quelle: Overpass (OSM), Radius 400 m`);
  zeilen.push('');
  zeilen.push('## Stufenverteilung gesamt');
  zeilen.push('');
  zeilen.push('| Stufe | Bedeutung | Anzahl | Anteil |');
  zeilen.push('|---|---|---|---|');
  zeilen.push(`| 1 | vollständiges Indoor-Mapping | ${gesamt[1]} | ${prozent(gesamt[1] / n)} |`);
  zeilen.push(`| 2 | Teildaten | ${gesamt[2]} | ${prozent(gesamt[2] / n)} |`);
  zeilen.push(`| 3 | keine verwertbaren Indoor-Daten → Synthesemodell | ${gesamt[3]} | ${prozent(gesamt[3] / n)} |`);
  zeilen.push('');

  for (const kategorie of ['gross', 'mittel', 'klein'] as const) {
    const teil = ergebnisse.filter((e) => e.bahnhof.kategorie === kategorie);
    const v = stufenVerteilung(teil);
    zeilen.push(`## Kategorie ${kategorie} (${teil.length})`);
    zeilen.push('');
    zeilen.push(`Stufe 1: ${v[1]} · Stufe 2: ${v[2]} · Stufe 3: ${v[3]}`);
    zeilen.push('');
    zeilen.push('| Bahnhof | Elemente | Gleise | Stufe | Gleispaare verbunden | Ways mit level | Abschnittsmarker |');
    zeilen.push('|---|---|---|---|---|---|---|');
    for (const e of teil) {
      zeilen.push(
        `| ${e.bahnhof.name} | ${e.elemente} | ${e.gleise} | ${e.stufe} | ${prozent(e.verbundenheit)} | ${e.waysMitLevel}/${e.waysGesamt} | ${e.abschnittsmarker} |`,
      );
    }
    zeilen.push('');
  }

  const mitMarkern = ergebnisse.filter((e) => e.abschnittsmarker > 0).length;
  zeilen.push('## Wagenpositions-USP: Abschnittsmarker (A–F) in OSM');
  zeilen.push('');
  zeilen.push(
    `${mitMarkern} von ${n} Bahnhöfen (${prozent(mitMarkern / n)}) haben platform_section-artige Tags. ` +
      'Die Abbildung Wagenreihungs-Abschnitt → Bahnsteigkoordinate muss daher primär über ' +
      'DB-Stationsdaten (Bahnsteiglänge + Abschnittseinteilung) erfolgen, nicht über OSM.',
  );
  zeilen.push('');
  zeilen.push('## Entscheidungstor (Plan Task 6)');
  zeilen.push('');
  if (stufe1Anteil < 0.2) {
    zeilen.push(
      `**Stufe-1-Anteil ${prozent(stufe1Anteil)} < 20 % → Entscheidungstor ausgelöst.** ` +
        'Priorität verschiebt sich von Stufe-1-Kartenfeinheiten auf Synthesemodell (Task 10) ' +
        'und Textqualität in Stufe 2/3. Die Karte (Task 14) bleibt einklappbares Sekundärelement.',
    );
  } else {
    zeilen.push(
      `**Stufe-1-Anteil ${prozent(stufe1Anteil)} ≥ 20 % → keine Prioritätsverschiebung.** ` +
        'Indoor-Routing über OSM trägt einen relevanten Teil der Fälle; Stufe-1-Pfad wie geplant ausbauen.',
    );
  }
  zeilen.push('');
  zeilen.push('## Offen (blockiert auf DB-Registrierung)');
  zeilen.push('');
  zeilen.push(
    process.env.DB_CLIENT_ID
      ? 'DB-Zugangsdaten vorhanden – Abschnittsdaten-Check gegen RIS::Stations ergänzen (Task 11).'
      : 'Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET` kann der Check „liefern die DB-Stationsdaten Bahnsteiglänge + Abschnittseinteilung?" nicht laufen. Nach Registrierung erneut ausführen.',
  );
  zeilen.push('');
  zeilen.push('*Hinweis: Koordinaten der Stichprobe stammen aus Vorwissen; bei 0 gefundenen Gleisen an großen/mittleren Bahnhöfen Koordinate prüfen, bevor das Ergebnis als Datenlücke gewertet wird.*');
  zeilen.push('');
  return zeilen.join('\n');
}

// --- Hauptlauf ---
await mkdir(CACHE_ORDNER, { recursive: true });
const ergebnisse: SpikeErgebnis[] = [];
for (const bahnhof of SPIKE_BAHNHOEFE) {
  try {
    const antwort = await holeAntwort(bahnhof);
    const ergebnis = analysiere(bahnhof, antwort);
    ergebnisse.push(ergebnis);
    console.log(
      `${bahnhof.name}: Stufe ${ergebnis.stufe} · ${ergebnis.gleise} Gleise · ${ergebnis.elemente} Elemente`,
    );
  } catch (e) {
    console.error(`${bahnhof.name}: FEHLER – ${String(e)}`);
  }
}

await writeFile(REPORT_PFAD, erzeugeReport(ergebnisse), 'utf8');
console.log(`\nReport: ${REPORT_PFAD} (${ergebnisse.length}/${SPIKE_BAHNHOEFE.length} Bahnhöfe)`);
