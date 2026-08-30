// Zentrale Schwellenwerte der Standortlogik. Begruendungen in der Spec,
// Abschnitt 2 und 5.2 – keine dieser Zahlen gehoert in eine andere Datei.

/** Schlechtere Genauigkeit → Punkt ausblenden, Ankunftszaehler pausieren. */
export const GENAUIGKEIT_MAX_M = 100;

/** Umkreis um das Zielgleis, ab dem die Ankunft in Frage kommt. */
export const ANKUNFT_RADIUS_M = 40;

/** Verweildauer im Radius, bevor die Ankunft vorgeschlagen wird. */
export const ANKUNFT_VERWEIL_MS = 15_000;

/**
 * Schlechterer Fix → gar nicht erst nach Bahnhoefen suchen.
 *
 * Der Server sucht im Umkreis von 1000 m (Serverentscheidung, steht in
 * routes/api.ts). Ist die Unsicherheit der Position groesser als dieser
 * Radius, ist die Suchflaeche kleiner als der Fehler – das Ergebnis waere
 * geraten, und ein falsch benannter Bahnhof fuehrt den Nutzer aktiver in die
 * Irre als gar keiner. Bewusst VIEL groesser als GENAUIGKEIT_MAX_M: Ein
 * Kartenpunkt muss auf den Bahnsteig zeigen, ein Bahnhofsname nur auf den
 * richtigen Ort.
 */
export const ERKENNUNG_MAX_M = 1_000;

/** Nachkommastellen der gerundeten Koordinate (3 ≈ 110 m). */
export const KOORD_RUNDUNG = 3;

/** Kulanz nach der Abfahrtszeit, bevor "abgefahren" gilt. */
export const ABGEFAHREN_KULANZ_MS = 60_000;
