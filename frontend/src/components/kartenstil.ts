/**
 * Kartenstil von OpenFreeMap (Plan App Store, Paket 9; Julian, 24.10.2026).
 *
 * Bis zum 24.10.2026 kamen Rasterkacheln von tile.openstreetmap.org. Deren
 * Nutzungsregeln verlangen, dass sich eine Anwendung erkennbar ausweist - aus
 * der WebView der iOS-App ist das nicht moeglich. OpenFreeMap ist frei, ohne
 * Schluessel und erlaubt die Nutzung in Apps; die Namensnennung bringt die
 * Kachelquelle selbst mit (OpenFreeMap, © OpenMapTiles, Daten von
 * OpenStreetMap). Stil, Kacheln, Schriften und Symbole liegen alle unter
 * tiles.openfreemap.org - die CSP in vercel.json nennt genau diese Domain.
 *
 * „liberty" zeigt im Bahnhof am meisten (Gebaeude, Wege, Gleise). Er gilt auch
 * im Dunkelmodus: Die Karte behaelt ihre natuerlichen Farben (Julian,
 * 02.11.2026), die Nachtfassung „dark" zeigte sie schwarz.
 */
export const KARTENSTIL = 'https://tiles.openfreemap.org/styles/liberty'
