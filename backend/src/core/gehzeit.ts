import type { Gehprofil, KantenTyp, RoutenPfad } from './typen.js';

// Gehgeschwindigkeiten in m/s je Profil (Konzept 6.4).
const GESCHWINDIGKEIT: Record<Gehprofil, number> = {
  zuegig: 1.4,
  normal: 1.0,
  langsam: 0.6,
};

// Pauschale Zuschläge in Sekunden je Ebenenwechsel-Kante.
const ZUSCHLAG: Partial<Record<KantenTyp, number>> = {
  treppe: 20,
  rolltreppe: 10,
  aufzug: 60,
};

export function gehzeitSekunden(pfad: RoutenPfad, profil: Gehprofil): number {
  const laengeM = pfad.kanten.reduce((s, k) => s + k.laengeM, 0);
  const zuschlaege = pfad.kanten.reduce((s, k) => s + (ZUSCHLAG[k.typ] ?? 0), 0);
  return Math.round(laengeM / GESCHWINDIGKEIT[profil]) + zuschlaege;
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
