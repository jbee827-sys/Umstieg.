/**
 * Basis-URL des Backends.
 *
 * Leer in der Entwicklung: alle Aufrufe bleiben relativ und laufen über den
 * Vite-Proxy (siehe `vite.config.ts`) ans lokale Fastify auf :3001. Nichts am
 * bisherigen Entwicklungsablauf ändert sich.
 *
 * In Produktion zeigt `VITE_API_BASE` auf die Backend-Domain, weil Frontend
 * (Vercel, statisch ausgeliefert) und Backend (Container mit SSE, Poller und
 * 24-h-Graph-Cache) auf verschiedenen Hosts laufen.
 *
 * Bewusst KEIN Rewrite in `vercel.json`: Der SSE-Strom aus `/api/live/:eva`
 * liefe sonst durch Vercels Proxy und würde dort gepuffert oder nach dessen
 * Zeitlimit getrennt – genau die Eigenschaft, die Task 16 herstellt.
 */
const roh = import.meta.env.VITE_API_BASE ?? '';

/** Ohne Schrägstrich am Ende, damit `${API_BASIS}/api/...` nie doppelt trennt. */
export const API_BASIS: string = roh.replace(/\/+$/, '');

export function apiUrl(pfad: string): string {
  return `${API_BASIS}${pfad}`;
}
