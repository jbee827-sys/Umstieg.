// SIMULATION: In wie vielen Faellen findet die App einen Bahnhof ueber seine
// ANDEREN amtlichen Namen?
//
// Eine Verkehrsstellengruppe in RIS::Stations hat einen fuehrenden Bahnhof
// (z. B. „Bernau(b Berlin)" 8013470) und weitere Mitglieder mit eigener EVA und
// eigenem Namen (z. B. „Bernau (S)" 8089205). Ein geteilter Reisetext nennt
// oft den Namen eines Mitglieds. `loeseBahnhofsnamen` (core/namensaufloesung.ts)
// waehlt den fuehrenden Bahnhof - nur bei genauem Namen, nie bei Mehrdeutigkeit.
//
// Je Bahnhof der StaDa-Kategorien:
//   - Haupt-EVA aus StaDa (`evaNumbers` mit `isMain`, wie bestand-fuellen.ts).
//   - Soll-Bahnhof = der Suchtreffer, dessen Gruppe (mehr als ein Mitglied) diese
//     EVA enthaelt; sonst der Treffer mit genau dieser EVA; fehlt beides in der
//     Suche: `nicht-in-suche`.
//   - Namen: fuehrende (nameLong/nameShort des Soll-Bahnhofs) und andere
//     (Namen der uebrigen Mitglieder, die normalisiert keinem fuehrenden gleichen).
//   - Jeder Name durch Ansatz A (`loeseBahnhofsnamen`) und Ansatz B (Vergleich:
//     Klammerzusatz abschneiden, suchen, nur bei genau einem Treffer waehlen,
//     egal wie er heisst). Ergebnis je Name: richtig, falsch, keins.
//     richtig = gewaehlte EVA ist der Soll-Bahnhof ODER irgendeine EVA seiner
//     Gruppe (die App loest die ganze Gruppe von jeder EVA aus auf); falsch =
//     eine andere EVA; keins = nichts gewaehlt.
//   - Ein Fehler beim Abruf eines Mitgliedsnamens macht den Bahnhof zu `fehler`
//     (wird beim Neustart wiederholt) - nichts wird still verschluckt.
//   - Gruppen werden einmal gezaehlt (Eintraege mit gleicher Soll-EVA zaehlen
//     nur einmal in der Auswertung).
//   - Alt (vor der Aenderung): nie automatisch gewaehlt, also 0 %.
//
// Nur Stationsdaten (RIS::Stations, StaDa) - keine Timetables-Abrufe. RIS
// hoechstens 50 je Minute (Abstand 1 200 ms), nach 429 Pause 65 s. Zwischenstand
// je Bahnhof in `osm-ablage/bahnhofsnamen/rohdaten.json` (gitignored); beim
// Neustart werden erledigte Bahnhoefe uebersprungen (Fehler werden wiederholt).
// Die rohen Antworten (Suche je Anfrage, Namen je EVA) liegen in `apicache.json`
// und werden beim Start gelesen: eine neue Auswertung braucht keine neuen Abrufe.
//
// Aufruf (aus backend/): npx tsx scripts/simulation-bahnhofsnamen.ts [--kategorien 1-4] [--grenze N]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epStadaStationen } from '../src/clients/db-endpunkte.js';
import { dbAuthHeader, holeAmtlicheNamen, sucheBahnhoefeMitGruppen } from '../src/clients/stations.js';
import { haltnamenZurSuche } from '../src/core/haltname.js';
import {
  loeseBahnhofsnamen,
  normalisiereBahnhofsname,
  type NamensQuelle,
} from '../src/core/namensaufloesung.js';
import type { BahnhofMitGruppe } from '../src/core/typen.js';
import { ladeSecrets } from './secrets.js';

const AUSGABE = fileURLToPath(new URL('../osm-ablage/bahnhofsnamen/', import.meta.url));
const ROHDATEN = join(AUSGABE, 'rohdaten.json');
const APICACHE = join(AUSGABE, 'apicache.json');

const RIS_ABSTAND_MS = 1_200;
const PAUSE_429_MS = 65_000;

// --- Abrufe im Takt ---

let letzterAbruf = 0;
let abrufe = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch mit Mindestabstand und Wiederholung nach 429. */
async function taktFetch(eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let versuch = 0; ; versuch++) {
    const seit = Date.now() - letzterAbruf;
    if (seit < RIS_ABSTAND_MS) await warte(RIS_ABSTAND_MS - seit);
    letzterAbruf = Date.now();
    abrufe++;
    const antwort = await fetch(eingabe, init);
    if (antwort.status !== 429 || versuch >= 3) return antwort;
    console.log(`  RIS: 429 - Pause ${PAUSE_429_MS / 1000} s`);
    await warte(PAUSE_429_MS);
  }
}

// Zwischenspeicher im Lauf: gleiche Suche / gleiche EVA nur einmal abrufen.
const sucheCache = new Map<string, Promise<BahnhofMitGruppe[]>>();
const namenCache = new Map<string, Promise<string[]>>();
// Rohe Antworten, auf Platte gemerkt (nur erfolgreiche Abrufe).
const apiSuche: Record<string, BahnhofMitGruppe[]> = {};
const apiNamen: Record<string, string[]> = {};
function ladeApiCache(): void {
  if (!existsSync(APICACHE)) return;
  const c = JSON.parse(readFileSync(APICACHE, 'utf8')) as {
    suche?: Record<string, BahnhofMitGruppe[]>;
    namen?: Record<string, string[]>;
  };
  for (const [k, v] of Object.entries(c.suche ?? {})) {
    apiSuche[k] = v;
    sucheCache.set(k, Promise.resolve(v));
  }
  for (const [k, v] of Object.entries(c.namen ?? {})) {
    apiNamen[k] = v;
    namenCache.set(k, Promise.resolve(v));
  }
}
const speichereApiCache = () => writeFileSync(APICACHE, JSON.stringify({ suche: apiSuche, namen: apiNamen }));

function cacheGet<T>(cache: Map<string, Promise<T>>, schluessel: string, hole: () => Promise<T>): Promise<T> {
  let p = cache.get(schluessel);
  if (!p) {
    p = hole();
    cache.set(schluessel, p);
    // Fehler nicht dauerhaft merken.
    p.catch(() => cache.delete(schluessel));
  }
  return p;
}

const suche = (q: string) =>
  cacheGet(sucheCache, q, async () => (apiSuche[q] = await sucheBahnhoefeMitGruppen(q, taktFetch)));
const namenVon = (eva: string) =>
  cacheGet(namenCache, eva, async () => (apiNamen[eva] = await holeAmtlicheNamen(eva, taktFetch)));

const quelle: NamensQuelle = { sucheMitGruppen: suche, amtlicheNamen: namenVon };

// --- Typen ---

type Urteil = 'richtig' | 'falsch' | 'keins';
type Art = 'fuehrend' | 'anders';

interface NamensErgebnis {
  name: string;
  art: Art;
  eva: string; // Mitglied, das den Namen traegt
  a: Urteil;
  aEva?: string;
  b: Urteil;
  bEva?: string;
}

interface Eintrag {
  stadaName: string;
  eva: string; // Haupt-EVA aus StaDa
  kategorie: 'ok' | 'nicht-in-suche' | 'fehler';
  fehler?: string;
  sollEva?: string;
  sollName?: string;
  mitglieder?: string[];
  namen?: NamensErgebnis[];
}

type Rohdaten = Record<string, Eintrag>;

// --- StaDa ---

interface StadaStation {
  name: string;
  priceCategory?: number;
  evaNumbers?: { number: number; isMain?: boolean }[];
}

function hauptEva(s: StadaStation): string | null {
  const evas = s.evaNumbers ?? [];
  const haupt = evas.find((e) => e.isMain) ?? evas[0];
  return haupt ? String(haupt.number) : null;
}

async function holeStadaListe(kategorien: string): Promise<StadaStation[]> {
  const res = await fetch(epStadaStationen(kategorien), {
    headers: { ...dbAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`StaDa: HTTP ${res.status}`);
  const j = (await res.json()) as { result?: StadaStation[] };
  return j.result ?? [];
}

// --- Bewertung ---

/** Ansatz B (naiv): Klammerzusatz abschneiden, suchen, nur bei genau einem Bahnhof waehlen - egal wie er heisst. */
async function ansatzB(name: string): Promise<BahnhofMitGruppe | null> {
  const gesucht = haltnamenZurSuche(name).at(-1)!;
  if (!normalisiereBahnhofsname(gesucht)) return null;
  // Bewusst ohne Namensvergleich: genau EIN Bahnhof in der Trefferliste -> gewaehlt.
  const treffer = await suche(gesucht);
  return treffer.length === 1 ? treffer[0] : null;
}

function urteil(gewaehlt: { eva: string } | null, soll: BahnhofMitGruppe): { u: Urteil; eva?: string } {
  if (!gewaehlt) return { u: 'keins' };
  const richtig = gewaehlt.eva === soll.eva || soll.mitglieder.includes(gewaehlt.eva);
  return { u: richtig ? 'richtig' : 'falsch', eva: gewaehlt.eva };
}

async function bearbeite(s: StadaStation, eva: string): Promise<Eintrag> {
  const basis = { stadaName: s.name, eva };
  // Suche nach dem StaDa-Namen; den Soll-Bahnhof ueber die EVA finden.
  const treffer = await suche(s.name);
  // Die Gruppe geht vor: ein Treffer, der nur das Mitglied selbst ist (ohne
  // Gruppe), darf den fuehrenden Bahnhof nicht verdraengen.
  const soll =
    treffer.find((k) => k.mitglieder.length > 1 && k.mitglieder.includes(eva)) ??
    treffer.find((k) => k.eva === eva);
  if (!soll) return { ...basis, kategorie: 'nicht-in-suche' };

  const fuehrend = soll.namen;
  const fuehrendNorm = new Set(fuehrend.map(normalisiereBahnhofsname));
  const namen: { name: string; art: Art; eva: string }[] = fuehrend.map((name) => ({
    name,
    art: 'fuehrend',
    eva: soll.eva,
  }));
  const gesehen = new Set(fuehrendNorm);
  for (const mitglied of soll.mitglieder) {
    if (mitglied === soll.eva) continue;
    const fremde = await namenVon(mitglied); // Fehler -> Bahnhof wird `fehler`, Wiederholung
    for (const name of fremde) {
      const n = normalisiereBahnhofsname(name);
      if (gesehen.has(n)) continue;
      gesehen.add(n);
      namen.push({ name, art: 'anders', eva: mitglied });
    }
  }

  const ergebnisse: NamensErgebnis[] = [];
  for (const n of namen) {
    const a = urteil(await loeseBahnhofsnamen(n.name, quelle), soll);
    const b = urteil(await ansatzB(n.name), soll);
    ergebnisse.push({
      ...n,
      a: a.u,
      ...(a.eva ? { aEva: a.eva } : {}),
      b: b.u,
      ...(b.eva ? { bEva: b.eva } : {}),
    });
  }
  return {
    ...basis,
    kategorie: 'ok',
    sollEva: soll.eva,
    sollName: soll.name,
    mitglieder: soll.mitglieder,
    namen: ergebnisse,
  };
}

// --- Bericht ---

const prozent = (n: number, von: number) => (von === 0 ? '-' : `${Math.round((n / von) * 1000) / 10} %`);

function auswerten(eintraege: Eintrag[]): string {
  // Eine Gruppe nur einmal: mehrere StaDa-Eintraege mit gleichem Soll-Bahnhof zaehlen einmal.
  const gesehenSoll = new Set<string>();
  const ok = eintraege.filter((e) => {
    if (e.kategorie !== 'ok') return false;
    if (gesehenSoll.has(e.sollEva!)) return false;
    gesehenSoll.add(e.sollEva!);
    return true;
  });
  const nicht = eintraege.filter((e) => e.kategorie === 'nicht-in-suche');
  const fehler = eintraege.filter((e) => e.kategorie === 'fehler');
  const mehrere = ok.filter((e) => (e.mitglieder?.length ?? 0) > 1);
  const mitAnderen = ok.filter((e) => e.namen!.some((n) => n.art === 'anders'));
  const alle = ok.flatMap((e) => e.namen!.map((n) => ({ ...n, bahnhof: e.sollName ?? e.stadaName, sollEva: e.sollEva! })));

  const z: string[] = [];
  z.push('# Simulation: Bahnhof ueber andere offizielle Namen', '');
  z.push(`Erzeugt ${new Date().toISOString()}`, '');
  z.push('## Bestand', '');
  z.push(`- StaDa-Eintraege untersucht: ${eintraege.length}`);
  z.push(`  - aufgeloest (Soll-Bahnhof in der Suche gefunden): ${eintraege.filter((e) => e.kategorie === 'ok').length}, davon ${ok.length} verschiedene Gruppen (nur diese zaehlen unten)`);
  z.push(`  - nicht-in-suche: ${nicht.length}`);
  z.push(`  - Fehler (werden beim naechsten Lauf wiederholt): ${fehler.length}`);
  z.push(`- Bahnhoefe mit mehreren Verkehrsstellen: ${mehrere.length} von ${ok.length}`);
  z.push(`- Bahnhoefe mit anderen Namen: ${mitAnderen.length} von ${ok.length}`, '');
  z.push('Alt (vor der Aenderung): nie automatisch gewaehlt, also 0 % richtig.', '');

  z.push('## Quoten je Namensart', '');
  z.push('| Namensart | Namen | A richtig | A falsch | A keins | B richtig | B falsch | B keins |');
  z.push('|---|---|---|---|---|---|---|---|');
  for (const art of ['fuehrend', 'anders'] as const) {
    const n = alle.filter((x) => x.art === art);
    const c = (k: 'a' | 'b', u: Urteil) => {
      const m = n.filter((x) => x[k] === u).length;
      return `${m} (${prozent(m, n.length)})`;
    };
    z.push(
      `| ${art} | ${n.length} | ${c('a', 'richtig')} | ${c('a', 'falsch')} | ${c('a', 'keins')} | ${c('b', 'richtig')} | ${c('b', 'falsch')} | ${c('b', 'keins')} |`,
    );
  }
  z.push('', 'A = `loeseBahnhofsnamen` (neu), B = Klammerzusatz abschneiden, nur bei genau einem Treffer (naiv). richtig = Soll-Bahnhof oder eine EVA seiner Gruppe.', '');

  const zeile = (x: (typeof alle)[number]) =>
    `- ${x.bahnhof} (Soll ${x.sollEva}): „${x.name}" (${x.art}, EVA ${x.eva})`;
  const falschA = alle.filter((x) => x.a === 'falsch');
  z.push(`## Ansatz A: falsch (${falschA.length})`, '');
  for (const x of falschA) z.push(`${zeile(x)} -> gewaehlt ${x.aEva}`);
  if (falschA.length === 0) z.push('keine');
  const falschB = alle.filter((x) => x.b === 'falsch');
  z.push('', `## Ansatz B: falsch (${falschB.length})`, '');
  for (const x of falschB) z.push(`${zeile(x)} -> gewaehlt ${x.bEva}`);
  if (falschB.length === 0) z.push('keine');

  const keinsA = alle.filter((x) => x.a === 'keins');
  z.push('', `## Ansatz A: keins (erste 30 von ${keinsA.length})`, '');
  for (const x of keinsA.slice(0, 30)) z.push(`${zeile(x)} (B: ${x.b})`);
  if (keinsA.length === 0) z.push('keine');

  if (nicht.length > 0) {
    z.push('', `## nicht-in-suche (erste 30 von ${nicht.length})`, '');
    for (const e of nicht.slice(0, 30)) z.push(`- ${e.stadaName} (EVA ${e.eva})`);
  }
  if (fehler.length > 0) {
    z.push('', `## Fehler (erste 30 von ${fehler.length})`, '');
    for (const e of fehler.slice(0, 30)) z.push(`- ${e.stadaName} (EVA ${e.eva}): ${e.fehler}`);
  }
  return z.join('\n') + '\n';
}

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(AUSGABE, { recursive: true });
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const kategorien = arg('--kategorien') ?? '1-4';
  const grenze = arg('--grenze') ? Number(arg('--grenze')) : Infinity;

  ladeApiCache();
  const roh: Rohdaten = existsSync(ROHDATEN) ? (JSON.parse(readFileSync(ROHDATEN, 'utf8')) as Rohdaten) : {};
  const alleStationen = await holeStadaListe(kategorien);
  const stationen = alleStationen.slice(0, grenze);
  console.log(
    `${alleStationen.length} Bahnhoefe der Kategorien ${kategorien}, ${stationen.length} im Lauf, ${Object.keys(roh).length} schon in rohdaten.json, ${Object.keys(apiSuche).length} Suchen und ${Object.keys(apiNamen).length} Namensabrufe im apicache`,
  );

  const reihenfolge: string[] = [];
  let neu = 0;
  let uebersprungen = 0;
  for (const [i, s] of stationen.entries()) {
    const eva = hauptEva(s);
    if (!eva) continue;
    reihenfolge.push(eva);
    const alt = roh[eva];
    if (alt && alt.kategorie !== 'fehler') {
      uebersprungen++;
      continue;
    }
    const vorher = abrufe;
    try {
      roh[eva] = await bearbeite(s, eva);
    } catch (e) {
      roh[eva] = { stadaName: s.name, eva, kategorie: 'fehler', fehler: String(e).slice(0, 120) };
    }
    neu++;
    const r = roh[eva];
    console.log(
      `[${i + 1}/${stationen.length}] ${s.name} (${eva}): ${r.kategorie}` +
        (r.namen ? `, ${r.namen.length} Namen, ${r.namen.filter((n) => n.art === 'anders').length} andere` : '') +
        (r.fehler ? ` - ${r.fehler}` : '') +
        `, ${abrufe - vorher} Abrufe`,
    );
    writeFileSync(ROHDATEN, JSON.stringify(roh));
    speichereApiCache();
  }
  writeFileSync(ROHDATEN, JSON.stringify(roh));
  speichereApiCache();

  const eintraege = [...new Set(reihenfolge)].map((eva) => roh[eva]).filter((e): e is Eintrag => !!e);
  writeFileSync(join(AUSGABE, 'ergebnis.json'), JSON.stringify(eintraege, null, 1));
  writeFileSync(join(AUSGABE, 'ergebnis.md'), auswerten(eintraege));
  console.log(`\nFERTIG: ${neu} neu bearbeitet, ${uebersprungen} aus rohdaten.json uebersprungen, ${abrufe} RIS-Abrufe`);
  console.log(`Bericht: ${join(AUSGABE, 'ergebnis.md')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
