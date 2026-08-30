// Schwellenwerte der Schrittnavigation. Begruendung in der Spec, Abschnitt 5.

/**
 * Untergrenze der Anzeigedauer je Schritt. Ein Schritt wie „wenige Meter
 * rechts" hat wenige Sekunden Gehzeit und waere vorbei, bevor der Nutzer
 * hinsieht. Wirkt NUR auf die Anzeige – die Gehzeit und damit die Ampel
 * bleiben unberuehrt. Startwert, in der Mobilabnahme nachzujustieren.
 */
export const MINDEST_SCHRITT_MS = 8_000;
