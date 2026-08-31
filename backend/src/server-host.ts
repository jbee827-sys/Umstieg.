// Absichtlich eine eigene Datei: server.ts ruft listen() beim Import auf und
// laesst sich deshalb nicht testen. Die Adresse steht hier, damit der Test
// dieselbe benutzt, die die Produktion benutzt.

/**
 * Doppelstapel-Bindung. NICHT auf `0.0.0.0` aendern.
 *
 * Der Fly-Proxy verbindet sich mit der Maschine ueber deren private
 * IPv6-Adresse (`fdaa:...`). Auf `0.0.0.0` lauscht der Server nur auf IPv4:
 * Die App laeuft dann, ist gesund, und der Proxy kommt trotzdem nicht heran.
 * Nach aussen sah das am 31.08.2026 so aus, als schlage die Bahnhofssuche
 * nichts vor - tatsaechlich kam kein einziger Aufruf am Backend an. Fly
 * meldete `[PU03] unreachable worker host`, was nach einem Plattformfehler
 * aussieht, aber nur heisst: kein erreichbarer Kandidat.
 *
 * `::` nimmt zusaetzlich IPv4-Verbindungen an (IPv4-mapped), die
 * Gesundheitspruefung ueber 127.0.0.1 funktioniert also weiter.
 */
export const LISTEN_HOST = '::';
