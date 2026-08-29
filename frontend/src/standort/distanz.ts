// Spiegel von backend/src/core/graph.ts:15-23 – identische Formel und
// identischer Erdradius, damit Frontend und Backend dieselbe Distanz
// berechnen. Bei Aenderungen dort hier nachziehen.

const ERDRADIUS_M = 6_371_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_M * Math.asin(Math.sqrt(a));
}

const RING_STUETZPUNKTE = 32;

/**
 * Geschlossener Ring aus [lon, lat]-Paaren um einen Mittelpunkt.
 *
 * Bewusst ein berechnetes Polygon statt MapLibres circle-radius: Nur so
 * entspricht der Radius echten Metern und bleibt beim Zoomen korrekt.
 */
export function genauigkeitsPolygon(lat: number, lon: number, radiusM: number): number[][] {
  const gradProMeterLat = 1 / 111_320;
  const gradProMeterLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= RING_STUETZPUNKTE; i++) {
    const winkel = (2 * Math.PI * i) / RING_STUETZPUNKTE;
    ring.push([
      lon + radiusM * gradProMeterLon * Math.sin(winkel),
      lat + radiusM * gradProMeterLat * Math.cos(winkel),
    ]);
  }
  return ring;
}
