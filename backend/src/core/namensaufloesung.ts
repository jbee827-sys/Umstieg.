import { FehlendeZugangsdatenError } from '../clients/stations.js';
import { namensvarianten } from './bahnhofsname.js';
import type { BahnhofMitGruppe, BahnhofTreffer } from './typen.js';

/**
 * Loest einen Bahnhofsnamen aus einem geteilten Reisetext ("Bernau (S)") in
 * den fuehrenden Bahnhof seiner Verkehrsstellengruppe auf - nur per genauem
 * Abgleich mit amtlichen Namen. Bei Mehrdeutigkeit oder bloss aehnlichem
 * Namen wird nichts gewaehlt.
 */

/** Hoechstens so viele Suchtreffer werden betrachtet. */
export const MAX_KANDIDATEN = 5;

export interface NamensQuelle {
  sucheMitGruppen(q: string): Promise<BahnhofMitGruppe[]>;
  amtlicheNamen(eva: string): Promise<string[]>;
}

export function normalisiereBahnhofsname(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+\(/g, '(');
}

/**
 * Sucht die Namensvarianten der Reihe nach; die erste mit Treffern gewinnt.
 * Faellt eine Variante aus, wird die naechste versucht; fehlende
 * Zugangsdaten gehen sofort weiter. Kam keine durch, wirft sie den ersten
 * Fehler - ein Ausfall ist kein „nichts gefunden“.
 */
export async function sucheMitVarianten<T>(name: string, suche: (q: string) => Promise<T[]>): Promise<T[]> {
  let ersterFehler: unknown;
  for (const variante of namensvarianten(name)) {
    try {
      const treffer = await suche(variante);
      if (treffer.length > 0) return treffer;
    } catch (e) {
      if (e instanceof FehlendeZugangsdatenError) throw e;
      ersterFehler ??= e;
    }
  }
  if (ersterFehler) throw ersterFehler;
  return [];
}

async function sucheKandidaten(name: string, quelle: NamensQuelle): Promise<BahnhofMitGruppe[]> {
  return (await sucheMitVarianten(name, (q) => quelle.sucheMitGruppen(q))).slice(0, MAX_KANDIDATEN);
}

function alsTreffer(k: BahnhofMitGruppe): BahnhofTreffer {
  return { name: k.name, eva: k.eva, lat: k.lat, lon: k.lon };
}

export async function loeseBahnhofsnamen(
  name: string,
  quelle: NamensQuelle,
): Promise<BahnhofTreffer | null> {
  const gesucht = normalisiereBahnhofsname(name);
  if (!gesucht) return null;

  const kandidaten = await sucheKandidaten(name, quelle);

  // Stufe 1: der fuehrende Bahnhof traegt den Namen selbst.
  const direkt = kandidaten.filter((k) => k.namen.some((n) => normalisiereBahnhofsname(n) === gesucht));
  if (direkt.length > 0) return direkt.length === 1 ? alsTreffer(direkt[0]) : null;

  // Stufe 2: ein anderes Mitglied der Gruppe traegt den Namen. Ein
  // ausgefallenes Mitglied zaehlt als namenlos.
  const ueber: BahnhofMitGruppe[] = [];
  for (const k of kandidaten) {
    const mitglieder = k.mitglieder.filter((eva) => eva !== k.eva);
    const ergebnisse = await Promise.allSettled(mitglieder.map((eva) => quelle.amtlicheNamen(eva)));
    const namen = ergebnisse.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (namen.some((n) => normalisiereBahnhofsname(n) === gesucht)) ueber.push(k);
  }
  return ueber.length === 1 ? alsTreffer(ueber[0]) : null;
}
