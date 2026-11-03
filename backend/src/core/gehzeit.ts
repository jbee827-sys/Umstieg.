import type { GraphKante, Gehprofil, KantenTyp, RoutenPfad } from './typen.js';

// Gehgeschwindigkeiten in m/s je Profil (Konzept 6.4).
export const GESCHWINDIGKEIT: Record<Gehprofil, number> = {
  zuegig: 1.4,
  normal: 1.0,
  langsam: 0.6,
};

// Pauschale Zuschlaege in Sekunden je Ebenenwechsel-Kante. Der Aufzug steht
// hier nicht: seine Zeit haengt von Schacht und Fahrt ab (`zuschlagSekunden`).
export const ZUSCHLAG: Partial<Record<KantenTyp, number>> = {
  treppe: 20,
  rolltreppe: 10,
};

// Aufzug (Spec 4.1): je Ebene 10 s Fahrt, je Tuerphase 15 s (Oeffnen/Schliessen).
export const AUFZUG_SEK_JE_EBENE = 10;
export const AUFZUG_TUEREN_SEK = 15;

/**
 * Zuschlag einer Kante in Sekunden, ohne die Gehstrecke.
 *
 * Aufzug im schlechtesten Fall: die Kabine steht am anderen Ende des Schachts.
 *   Warten = Spanne x 10 + 15   (Kabine kommt vom fernen Ende, Tueren auf)
 *   Fahrt  = |deltaLevel| x 10 + 15
 * Beispiel: von -2 nach +1 in einem Schacht -2..+2 (Spanne 4): Warten 55 +
 * Fahrt 45 = 100 s. Die alte Pauschale von 60 s je Kante traf das nur zufaellig.
 * `schachtSpanne` ist max - min der Schachtebenen; fehlt sie, gilt
 * |deltaLevel| (Kabine steht schlimmstenfalls auf der Gegenseite der Fahrt).
 * Eine Kante ueber eine Ebene kostet so 50 s.
 */
export function zuschlagSekunden(
  kante: Pick<GraphKante, 'typ' | 'deltaLevel' | 'schachtSpanne'>,
): number {
  if (kante.typ === 'aufzug') {
    const fahrt = Math.abs(kante.deltaLevel);
    const spanne = kante.schachtSpanne ?? fahrt;
    return (
      spanne * AUFZUG_SEK_JE_EBENE + AUFZUG_TUEREN_SEK +
      fahrt * AUFZUG_SEK_JE_EBENE + AUFZUG_TUEREN_SEK
    );
  }
  return ZUSCHLAG[kante.typ] ?? 0;
}

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
  kante: Pick<GraphKante, 'laengeM' | 'typ' | 'deltaLevel' | 'schachtSpanne'>,
  profil: Gehprofil,
): number {
  return kante.laengeM / GESCHWINDIGKEIT[profil] + zuschlagSekunden(kante);
}

export function gehzeitSekunden(pfad: RoutenPfad, profil: Gehprofil): number {
  const laengeM = pfad.kanten.reduce((s, k) => s + k.laengeM, 0);
  const zuschlaege = pfad.kanten.reduce((s, k) => s + zuschlagSekunden(k), 0);
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
  segmente: (Pick<GraphKante, 'typ' | 'deltaLevel' | 'schachtSpanne'> & {
    laengeM: number;
    zuschlagSek?: number;
  })[],
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
    return anteil + (segment.zuschlagSek ?? zuschlagSekunden(segment));
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
