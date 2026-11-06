import { istSenkrecht, KURZ_M, type Segment } from './segmente.js';
import type { KantenLage, KantenTyp, RoutenPfad } from './typen.js';

/**
 * Etappen: der Weg in Abschnitten, die ein Mensch benennen wuerde
 * (Konzept 09, 5.1).
 *
 * Grundlage bleiben die Segmente aus `segmente.ts` mit ihren bewaehrten
 * Regeln (Glaettung, Podeste, zerlegte Rampen). Eine Etappe liegt eine Ebene
 * darueber: Wer durch eine Unterfuehrung geht, geht EINEN Weg, auch wenn er
 * zweimal abknickt.
 */
export type EtappenArt = 'bahnsteig' | 'wechsel' | 'durchgang' | 'draussen';

export interface Etappe {
  art: EtappenArt;
  /** Indizes in die Segmentliste, aufsteigend und lueckenlos. */
  segmente: number[];
  /** Bei `wechsel` die Anlage, sonst `eben`. */
  typ: KantenTyp;
  knotenVon: number;
  knotenBis: number;
  /** Ebene am Anfang und am Ende. */
  vonLevel: number;
  level: number;
  laengeM: number;
  /** Ebene Etappen: die Lage, die den groessten Teil der Strecke traegt. */
  lage?: KantenLage;
  /** Ebene Etappen: der Gangname, der den groessten Teil der Strecke traegt. */
  name?: string;
  /** Alle Kanten der Etappe haben eine belegte Ebene. */
  ebeneBelegt: boolean;
}

/** Ein Wechsel ist eine Anlage, die die Ebene wirklich aendert - oder ein Aufzug. */
function istWechsel(s: Segment): boolean {
  return istSenkrecht(s) && (s.deltaLevel !== 0 || s.typ === 'aufzug');
}

/** Lage und Name einer Kantenfolge, gewichtet nach Laenge. */
function merkmaleVon(
  pfad: RoutenPfad,
  von: number,
  bis: number,
): { lage?: KantenLage; name?: string; ebeneBelegt: boolean; lagen: Map<KantenLage | 'offen', number> } {
  const lagen = new Map<KantenLage | 'offen', number>();
  const namen = new Map<string, number>();
  let belegt = true;
  for (let k = von; k < bis; k++) {
    const kante = pfad.kanten[k];
    if (!kante) continue;
    const m = Math.max(kante.laengeM, 0.1);
    const lage = kante.lage ?? 'offen';
    lagen.set(lage, (lagen.get(lage) ?? 0) + m);
    if (kante.name) namen.set(kante.name, (namen.get(kante.name) ?? 0) + m);
    if (kante.ebeneBelegt === false) belegt = false;
  }
  const gesamt = [...lagen.values()].reduce((a, b) => a + b, 0);
  // Die Lage gilt, wenn sie mehr als die Haelfte der Strecke traegt. Offene
  // Stuecke zaehlen nicht dagegen: Ein Fussweg ohne Angabe zwischen zwei
  // Tunnelstuecken ist kein Beleg, dass man auftaucht.
  const bekannt = [...lagen.entries()].filter(([l]) => l !== 'offen').sort((a, b) => b[1] - a[1]);
  const offen = lagen.get('offen') ?? 0;
  const [besteLage, besteM] = bekannt[0] ?? [undefined, 0];
  const lage = besteLage && besteM >= (gesamt - offen) / 2 && besteM >= gesamt * 0.3 ? (besteLage as KantenLage) : undefined;
  const [besterName, nameM] = [...namen.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
  const name = besterName && nameM >= gesamt * 0.4 ? besterName : undefined;
  return { ...(lage ? { lage } : {}), ...(name ? { name } : {}), ebeneBelegt: belegt, lagen };
}

function artFuerLage(lage: KantenLage | undefined): EtappenArt {
  if (lage === 'bahnsteig') return 'bahnsteig';
  if (lage === 'draussen') return 'draussen';
  return 'durchgang';
}

/**
 * Zerlegt die Segmente in Etappen.
 *
 * - Jeder Ebenenwechsel ist eine eigene Etappe.
 * - Ebene Segmente auf derselben Ebene werden EINE Etappe, auch wenn sie
 *   abknicken - es sei denn, die Lage wechselt (Bahnsteig, dann Halle) und
 *   beide Teile sind mindestens `KURZ_M` lang.
 * - `grenzen` sind Segmentindizes, ueber die keine Etappe hinweggeht (der
 *   Stopp: Davor und danach ist je ein eigener Weg).
 */
export function baueEtappen(pfad: RoutenPfad, segmente: Segment[], grenzen: number[] = []): Etappe[] {
  const etappen: Etappe[] = [];
  const grenze = new Set(grenzen);
  let i = 0;
  while (i < segmente.length) {
    const s = segmente[i];
    if (istWechsel(s)) {
      const m = merkmaleVon(pfad, s.knotenVon, s.knotenBis);
      etappen.push({
        art: 'wechsel',
        segmente: [i],
        typ: s.typ,
        knotenVon: s.knotenVon,
        knotenBis: s.knotenBis,
        vonLevel: s.zielLevel - s.deltaLevel,
        level: s.zielLevel,
        laengeM: s.laengeM,
        ebeneBelegt: m.ebeneBelegt,
      });
      i++;
      continue;
    }
    // Lauf ebener Segmente auf derselben Ebene.
    let j = i + 1;
    while (j < segmente.length && !istWechsel(segmente[j]) && segmente[j].zielLevel === s.zielLevel && !grenze.has(j)) j++;
    etappen.push(...teileNachLage(pfad, segmente, i, j));
    i = j;
  }
  return etappen;
}

/** Ein ebener Lauf `[von, bis)` - eine Etappe, oder mehrere, wo die Lage deutlich wechselt. */
function teileNachLage(pfad: RoutenPfad, segmente: Segment[], von: number, bis: number): Etappe[] {
  const stueck = (a: number, b: number): Etappe => {
    const erstes = segmente[a];
    const letztes = segmente[b - 1];
    const m = merkmaleVon(pfad, erstes.knotenVon, letztes.knotenBis);
    let laengeM = 0;
    for (let k = a; k < b; k++) laengeM += segmente[k].laengeM;
    return {
      art: artFuerLage(m.lage),
      segmente: Array.from({ length: b - a }, (_, k) => a + k),
      typ: 'eben',
      knotenVon: erstes.knotenVon,
      knotenBis: letztes.knotenBis,
      vonLevel: pfad.knoten[erstes.knotenVon]?.level ?? erstes.zielLevel,
      level: letztes.zielLevel,
      laengeM,
      ...(m.lage ? { lage: m.lage } : {}),
      ...(m.name ? { name: m.name } : {}),
      ebeneBelegt: m.ebeneBelegt,
    };
  };
  // Lage je Segment, um den Lauf dort zu teilen, wo sich der Bahnsteig in
  // einen Gang oeffnet. Segmente ohne bekannte Lage gehen im Nachbarn auf.
  const lagen = segmente.slice(von, bis).map((s) => merkmaleVon(pfad, s.knotenVon, s.knotenBis).lage);
  const teile: [number, number][] = [];
  let anfang = von;
  let aktuelle = lagen[0];
  for (let k = von + 1; k < bis; k++) {
    const lage = lagen[k - von];
    if (lage === undefined || aktuelle === undefined || lage === aktuelle) {
      aktuelle ??= lage;
      continue;
    }
    // Wechsel der Lage: nur teilen, wenn beide Seiten lang genug sind.
    let vorherM = 0;
    for (let x = anfang; x < k; x++) vorherM += segmente[x].laengeM;
    let nachherM = 0;
    for (let x = k; x < bis && (lagen[x - von] === lage || lagen[x - von] === undefined); x++) nachherM += segmente[x].laengeM;
    const bahnsteigWechsel = aktuelle === 'bahnsteig' || lage === 'bahnsteig';
    if (bahnsteigWechsel && vorherM >= KURZ_M && nachherM >= KURZ_M) {
      teile.push([anfang, k]);
      anfang = k;
      aktuelle = lage;
    }
  }
  teile.push([anfang, bis]);
  return teile.map(([a, b]) => stueck(a, b));
}
