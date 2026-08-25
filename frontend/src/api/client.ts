import type { BahnhofTreffer, RouteErgebnis, RouteParameter } from './typen';

export type SuchErgebnis =
  | { ok: true; treffer: BahnhofTreffer[] }
  | { ok: false; fehler: 'db-zugang-fehlt' | 'netz' };

export async function sucheStationen(q: string): Promise<SuchErgebnis> {
  try {
    const res = await fetch(`/api/stations?q=${encodeURIComponent(q)}`);
    if (res.status === 503) return { ok: false, fehler: 'db-zugang-fehlt' };
    if (!res.ok) return { ok: false, fehler: 'netz' };
    return { ok: true, treffer: (await res.json()) as BahnhofTreffer[] };
  } catch {
    return { ok: false, fehler: 'netz' };
  }
}

export class RouteFehler extends Error {
  code: string;

  constructor(code: string, detail?: string) {
    super(detail ?? code);
    this.name = 'RouteFehler';
    this.code = code;
  }
}

export async function holeRoute(p: RouteParameter): Promise<RouteErgebnis> {
  const params = new URLSearchParams({
    eva: p.eva,
    gleisAn: p.gleisAn,
    gleisAb: p.gleisAb,
    profil: p.profil,
    variante: p.variante,
  });
  if (p.abschnitt) params.set('abschnitt', p.abschnitt);

  let res: Response;
  try {
    res = await fetch(`/api/route?${params.toString()}`);
  } catch {
    throw new RouteFehler('netz', 'Keine Verbindung zum Server.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { fehler?: string; detail?: string };
    throw new RouteFehler(body.fehler ?? `http-${res.status}`, body.detail);
  }
  return (await res.json()) as RouteErgebnis;
}
