import { apiUrl } from './basis';
import { RouteFehler } from './client';
import type { Gehprofil, HaltestellenTafelEintrag, Ort, Steigpunkt, Weg } from './typen';

export type HaltestellenFehler = 'nicht-verfuegbar' | 'nicht-eingerichtet' | 'unbekannt' | 'netz';

export type HaltestellenTafelErgebnis =
  | { ok: true; eintraege: HaltestellenTafelEintrag[]; stand: string }
  | { ok: false; fehler: HaltestellenFehler };

/**
 * Tafel einer Haltestelle. Die Koordinate geht mit: Nach einem Datenwechsel
 * findet MOTIS die Haltestelle nur noch über sie (A5).
 */
export async function holeHaltestellenTafel(ort: Ort, typ: 'arr' | 'dep'): Promise<HaltestellenTafelErgebnis> {
  if (!ort.haltestelleId) return { ok: false, fehler: 'unbekannt' };
  const params = new URLSearchParams({
    id: ort.haltestelleId,
    lat: String(ort.lat),
    lon: String(ort.lon),
    typ,
  });
  // Ein Bahnhof: auch die Halte im Umkreis, die anders heissen („Göttingen
  // Bahnhof/ZOB“) - Spec 2026-10-21-bus-am-bahnhof.
  if (ort.eva) params.set('umkreis', 'bahnhof');
  try {
    const res = await fetch(apiUrl(`/api/haltestelle/tafel?${params.toString()}`));
    if (res.ok) {
      const body = (await res.json()) as { eintraege: HaltestellenTafelEintrag[]; stand: string };
      return { ok: true, eintraege: body.eintraege, stand: body.stand };
    }
    if (res.status === 404) return { ok: false, fehler: 'unbekannt' };
    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { fehler?: string };
      return {
        ok: false,
        fehler: body.fehler === 'haltestellen-nicht-eingerichtet' ? 'nicht-eingerichtet' : 'nicht-verfuegbar',
      };
    }
    return { ok: false, fehler: 'netz' };
  } catch {
    return { ok: false, fehler: 'netz' };
  }
}

export interface WegParameter {
  von: Steigpunkt;
  nach: Steigpunkt;
  profil: Gehprofil;
  variante: 'schnellste' | 'barrierefrei';
  /** Steht am Ende der Schrittliste: „zu <ziel>“. */
  ziel?: string;
}

/** Fußweg zwischen zwei Steigen. Wirft `RouteFehler` wie `holeRoute`. */
export async function holeWeg(p: WegParameter): Promise<Weg> {
  const params = new URLSearchParams({
    vonLat: String(p.von.lat),
    vonLon: String(p.von.lon),
    nachLat: String(p.nach.lat),
    nachLon: String(p.nach.lon),
    profil: p.profil,
    variante: p.variante,
  });
  if (p.von.level !== undefined) params.set('vonLevel', String(p.von.level));
  if (p.nach.level !== undefined) params.set('nachLevel', String(p.nach.level));
  if (p.ziel) params.set('ziel', p.ziel);

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/weg?${params.toString()}`));
  } catch {
    throw new RouteFehler('netz', 'Keine Verbindung zum Server.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { fehler?: string; detail?: string };
    throw new RouteFehler(body.fehler ?? `http-${res.status}`, body.detail);
  }
  return (await res.json()) as Weg;
}

/** Wo der Weg an diesem Steig beginnt oder endet. */
export function steigpunktAus(e: HaltestellenTafelEintrag): Steigpunkt {
  return {
    lat: e.steigLat,
    lon: e.steigLon,
    ...(e.steigLevel !== undefined ? { level: e.steigLevel } : {}),
  };
}
