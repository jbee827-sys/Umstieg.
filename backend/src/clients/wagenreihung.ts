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
 * Gleisabschnitt (A–G) des gesuchten Wagens am Halt.
 *
 * `null` ist der NORMALE Fall „keine Daten" (Konzept 7): Die Auskunft steht,
 * sie kennt diesen Wagen oder diesen Zug nur nicht – der Aufrufer degradiert
 * auf die Bahnsteigmitte. Ein AUSFALL wirft dagegen.
 *
 * Beides ergab hier frueher `null`. Nach aussen ist das dasselbe, nach innen
 * nicht: Der Aufrufer protokolliert den Ausfall, und mit einem stillen `null`
 * waere dieser Eintrag nie geschrieben worden.
 */
export async function holeWagenposition(
  zugnummer: string,
  datum: string, // JJJJMMTT
  wagen: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ abschnitt: string } | null> {
  const antwort = await fetchFn(epWagenreihung(zugnummer, datum), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  // 404 ist eine Auskunft, kein Ausfall: Die Wagenreihung fuehrt nicht jeden
  // Zug und nicht jeden Tag. Als Ausfall gezaehlt wuerde sie das Protokoll
  // bei voelliger Betriebsruhe volllaufen lassen.
  if (antwort.status === 404) return null;
  if (!antwort.ok) throw new Error(`Wagenreihung: HTTP ${antwort.status}`);
  const body = (await antwort.json()) as IstFormationAntwort;
  for (const gruppe of body.data?.istformation?.allFahrzeuggruppe ?? []) {
    for (const fahrzeug of gruppe.allFahrzeug ?? []) {
      if (String(fahrzeug.wagenordnungsnummer) === wagen && fahrzeug.fahrzeugsektor) {
        return { abschnitt: String(fahrzeug.fahrzeugsektor) };
      }
    }
  }
  return null;
}
