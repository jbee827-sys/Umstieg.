import { LRUCache } from 'lru-cache';

// Einziger Zustand des Backends: RAM-LRU-Caches (kein persistenter Speicher).
// Graphen ~24 h (Schlüssel: EVA), Live-Antworten 30–60 s.
export const GRAPH_TTL_MS = 24 * 60 * 60 * 1000;
export const LIVE_TTL_MS = 30 * 1000;

export function erzeugeCache<V extends object>(max: number, ttlMs: number): LRUCache<string, V> {
  return new LRUCache<string, V>({ max, ttl: ttlMs });
}
