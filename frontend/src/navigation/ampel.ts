import type { Ampelfarbe } from '../api/typen'

/**
 * Ampel relativ zur Gehzeit (Konzeptkorrektur 4) – identische Formel wie
 * backend `core/gehzeit.ts`.
 */
export function ampelFarbe(restSek: number, gehzeitSek: number): Ampelfarbe {
  if (restSek < gehzeitSek || restSek < 0) return 'rot'
  if (restSek >= 2 * gehzeitSek) return 'gruen'
  return 'gelb'
}

/**
 * Breite der Zeitleiste in Prozent – der Anteil des Puffers, der noch übrig
 * ist. Bezugspunkt ist der Puffer beim Öffnen des Dashboards, nicht die
 * Gehzeit: Die Leiste soll ablaufen, nicht bewerten. Das Bewerten macht die
 * Farbe.
 *
 * Untergrenze 2 %, damit ein fast abgelaufener Balken sichtbar bleibt statt
 * zu verschwinden – so auch im Entwurf.
 */
export function balkenProzent(restSek: number, startPufferSek: number): number {
  if (!Number.isFinite(startPufferSek) || startPufferSek <= 0) return 2
  return Math.max(2, Math.min(100, (restSek / startPufferSek) * 100))
}

/**
 * Züge fahren zur vollen Minute ab. Die Restzeit läuft deshalb auf
 * HH:MM:00 zu, und ab Sekunde 1 der Abfahrtsminute ist der Zug weg.
 */
export function restZeitText(restSek: number): string {
  if (restSek <= 0) return 'Abfahrt jetzt'
  const min = Math.floor(restSek / 60)
  const sek = Math.floor(restSek % 60)
  return `${min}:${String(sek).padStart(2, '0')}`
}
