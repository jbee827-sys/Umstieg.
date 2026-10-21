import type { Gehprofil, KantenTyp, RoutenPfad } from './typen.js';

// Gehgeschwindigkeiten in m/s je Profil (Konzept 6.4).
export const GESCHWINDIGKEIT: Record<Gehprofil, number> = {
  zuegig: 1.4,
  normal: 1.0,
  langsam: 0.6,
};

// Pauschale Zuschläge in Sekunden je Ebenenwechsel-Kante.
export const ZUSCHLAG: Partial<Record<KantenTyp, number>> = {
  treppe: 20,
  rolltreppe: 10,
  aufzug: 60,
};

/**
 * Zeit fuer EINE Kante - dieselbe Rechnung, die auch die ausgewiesene
 * Gehzeit anstellt.
 *
 * Der Grund, dass es diese Funktion gibt: Das Routing hatte frueher ein
 * eigenes Kostenmodell. Eine Rolltreppe bekam dort -10 s gutgeschrieben,
 * waehrend die angezeigte Gehzeit +10 s berechnete; eine Treppe kostete beim
 * Routen 0, in der Anzeige 20. Der Router suchte also ein Optimum, das er
 * anschliessend nicht auswies - und "Schnellste Route 6 min" stand ueber
 * "Barrierefrei 5 min". Wer nach der schnellsten Route sucht, muss die Zeit
 * minimieren, die er nachher hinschreibt.
 */
export function kantenZeitSekunden(
  kante: { laengeM: number; typ: KantenTyp },
  profil: Gehprofil,
): number {
  return kante.laengeM / GESCHWINDIGKEIT[profil] + (ZUSCHLAG[kante.typ] ?? 0);
}

export function gehzeitSekunden(pfad: RoutenPfad, profil: Gehprofil): number {
  const laengeM = pfad.kanten.reduce((s, k) => s + k.laengeM, 0);
  const zuschlaege = pfad.kanten.reduce((s, k) => s + (ZUSCHLAG[k.typ] ?? 0), 0);
  return Math.round(laengeM / GESCHWINDIGKEIT[profil]) + zuschlaege;
}

/**
 * Gehzeit je Segment. Die Summe ist EXAKT gleich `gehzeitSekunden` ueber
 * dieselben Kanten - deshalb kumulative Rundung statt Rundung je Segment:
 * `gehzeitSekunden` rundet einmal am Ende, und Sum(round(x_i)) weicht davon
 * ab. Bei 30 Schritten summiert sich das auf mehrere Sekunden, und dann
 * widersprechen sich Ampel und Schrittanzeige.
 */
export function verteileGehzeit(
  /**
   * `zuschlagSek`: die Zuschlaege aller Kanten des Segments. Ein Schritt kann
   * zwei Treppen umfassen (`textgen.ts`, 21.10.2026) - der Zuschlag seines
   * Typs allein unterschlaege dann eine.
   */
  segmente: { laengeM: number; typ: KantenTyp; zuschlagSek?: number }[],
  profil: Gehprofil,
): number[] {
  const v = GESCHWINDIGKEIT[profil];
  let laengeBisher = 0;
  let gerundetBisher = 0;
  return segmente.map((segment) => {
    laengeBisher += segment.laengeM;
    const gerundet = Math.round(laengeBisher / v);
    const anteil = gerundet - gerundetBisher;
    gerundetBisher = gerundet;
    return anteil + (segment.zuschlagSek ?? ZUSCHLAG[segment.typ] ?? 0);
  });
}

/**
 * Ampel RELATIV zur Gehzeit (Konzeptkorrektur 4, aus dem UI-Design übernommen):
 * grün = Umstiegszeit ≥ 2× Gehzeit, gelb = 1–2× Gehzeit, rot = unter 1× Gehzeit.
 */
export function ampel(umstiegszeitSek: number, gehzeitSek: number): 'gruen' | 'gelb' | 'rot' {
  if (umstiegszeitSek < gehzeitSek || umstiegszeitSek < 0) return 'rot';
  if (umstiegszeitSek >= 2 * gehzeitSek) return 'gruen';
  return 'gelb';
}

/** Puffer in Sekunden: Umstiegszeit (Abfahrt − Ankunft) minus Gehzeit. */
export function berechnePuffer(abfahrt: Date, ankunft: Date, gehzeitSek: number): number {
  return (abfahrt.getTime() - ankunft.getTime()) / 1000 - gehzeitSek;
}
