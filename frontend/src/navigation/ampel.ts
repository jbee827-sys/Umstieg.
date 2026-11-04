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

const HALBER_TAG_MS = 12 * 3600 * 1000

/** 'HH:MM' → heutiger Zeitpunkt; kurz nach Mitternacht zählt eine frühe Abfahrt als morgen. */
export function abfahrtUm(hhmm: string, jetztMs: number): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const zeitpunkt = new Date(jetztMs)
  zeitpunkt.setHours(h, m, 0, 0)
  if (zeitpunkt.getTime() < jetztMs - 6 * 3600 * 1000) {
    zeitpunkt.setDate(zeitpunkt.getDate() + 1)
  }
  return zeitpunkt
}

/**
 * Die Ankunft wird an der ABFAHRT verankert, nicht an der Uhr: Der Tag der
 * Abfahrt bleibt, wie `abfahrtUm` ihn setzt (davon hängt „abgefahren“ ab). Die
 * Ankunft liegt am selben Tag; weicht sie um mehr als 12 h ab, gehört sie zum
 * Nachbartag. Ankunft 23:58, Abfahrt 00:10 → Ankunft am Vortag der Abfahrt.
 * An der Uhr verankert (nächster Tag zu „jetzt“) kippte eine Ankunft, die
 * mehr als 12 h voraus liegt, auf gestern – und der Anschluss um 18:20 nach
 * Ankunft 18:21 sah um 06:00 entspannt aus.
 */
export function ankunftUm(hhmm: string, abfahrt: Date): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const ankunft = new Date(abfahrt)
  ankunft.setHours(h, m, 0, 0)
  const abstand = ankunft.getTime() - abfahrt.getTime()
  if (abstand > HALBER_TAG_MS) ankunft.setDate(ankunft.getDate() - 1)
  else if (abstand < -HALBER_TAG_MS) ankunft.setDate(ankunft.getDate() + 1)
  return ankunft
}

/**
 * Die Zeit, die für den Weg bleibt, zählt ab der Ankunft: Vor der Ankunft ist
 * es Abfahrt − Ankunft (der Zug steht noch nicht da, die Uhr läuft nicht),
 * danach Abfahrt − jetzt. Ohne Ankunftszeit wie bisher Abfahrt − jetzt.
 */
export function umstiegRestSek(abfahrt: Date, ankunft: Date | undefined, jetztMs: number): number {
  const start = ankunft ? Math.max(jetztMs, ankunft.getTime()) : jetztMs
  return (abfahrt.getTime() - start) / 1000
}

/** Erfurt 16:21 an, 16:20 ab: Der Zug fährt, bevor der andere ankommt. */
export function anschlussUnerreichbar(abfahrt: Date, ankunft: Date | undefined): boolean {
  return !!ankunft && abfahrt.getTime() < ankunft.getTime()
}

/** Restzeit und Erreichbarkeit aus den HH:MM der Reise; für beide Pfade gleich. */
export function umstiegVon(
  zeiten: { abfahrtZeit?: string; ankunftZeit?: string },
  jetztMs: number,
  /** false = Ankunft ist bestätigt (Angekommen-Bildschirm): Abfahrt − jetzt. */
  mitAnkunft = true,
): { restSek: number; unerreichbar: boolean } | undefined {
  if (!zeiten.abfahrtZeit) return undefined
  const abfahrt = abfahrtUm(zeiten.abfahrtZeit, jetztMs)
  const ankunft =
    mitAnkunft && zeiten.ankunftZeit ? ankunftUm(zeiten.ankunftZeit, abfahrt) : undefined
  return {
    restSek: umstiegRestSek(abfahrt, ankunft, jetztMs),
    unerreichbar: anschlussUnerreichbar(abfahrt, ankunft),
  }
}
