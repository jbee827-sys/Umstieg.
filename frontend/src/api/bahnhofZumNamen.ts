import { holeApi } from './basis';
import type { Ort } from './typen';

/**
 * Löst einen Haltestellennamen aus dem Reisetext zu einem DB-Bahnhof auf.
 * Jede Abweichung (Netz, 4xx/5xx, kaputtes JSON) heißt `null` – der Aufrufer
 * behandelt „nicht gefunden" und „nicht erreichbar" gleich.
 */
export async function bahnhofZumNamen(name: string): Promise<Ort | null> {
  try {
    const res = await holeApi(`/api/bahnhof-zum-namen?name=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const antwort = (await res.json()) as { ort?: Ort | null };
    return antwort.ort ?? null;
  } catch {
    return null;
  }
}
