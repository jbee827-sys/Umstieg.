import { epWagenreihung } from './db-endpunkte.js';

interface IstFahrzeug {
  wagenordnungsnummer?: string | number;
  fahrzeugsektor?: string;
}

interface IstFormationAntwort {
  data?: {
    istformation?: {
      allFahrzeuggruppe?: { allFahrzeug?: IstFahrzeug[] }[];
    };
  };
}

/**
 * Gleisabschnitt (A–G) des gesuchten Wagens am Halt. null ist der NORMALE
 * Fall „keine Daten" (Konzept 7) – Aufrufer degradiert auf Bahnsteigmitte.
 */
export async function holeWagenposition(
  zugnummer: string,
  datum: string, // JJJJMMTT
  wagen: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ abschnitt: string } | null> {
  try {
    const antwort = await fetchFn(epWagenreihung(zugnummer, datum), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!antwort.ok) return null;
    const body = (await antwort.json()) as IstFormationAntwort;
    for (const gruppe of body.data?.istformation?.allFahrzeuggruppe ?? []) {
      for (const fahrzeug of gruppe.allFahrzeug ?? []) {
        if (String(fahrzeug.wagenordnungsnummer) === wagen && fahrzeug.fahrzeugsektor) {
          return { abschnitt: String(fahrzeug.fahrzeugsektor) };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
