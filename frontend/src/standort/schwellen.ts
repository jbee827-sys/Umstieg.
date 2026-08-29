// Zentrale Schwellenwerte der Standortlogik. Begruendungen in der Spec,
// Abschnitt 2 und 5.2 – keine dieser Zahlen gehoert in eine andere Datei.

/** Schlechtere Genauigkeit → Punkt ausblenden, Ankunftszaehler pausieren. */
export const GENAUIGKEIT_MAX_M = 100;

/** Umkreis um das Zielgleis, ab dem die Ankunft in Frage kommt. */
export const ANKUNFT_RADIUS_M = 40;

/** Verweildauer im Radius, bevor die Ankunft vorgeschlagen wird. */
export const ANKUNFT_VERWEIL_MS = 15_000;

/** Nachkommastellen der gerundeten Koordinate (3 ≈ 110 m). */
export const KOORD_RUNDUNG = 3;

/** Kulanz nach der Abfahrtszeit, bevor "abgefahren" gilt. */
export const ABGEFAHREN_KULANZ_MS = 60_000;
