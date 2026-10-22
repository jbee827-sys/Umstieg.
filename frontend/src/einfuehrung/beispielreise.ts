import type { EingabeEntwurf } from '../sitzung/eingabespeicher'
import { BEISPIEL_ORT, beispielZuege } from './vorfuehrquelle'

/**
 * Die Beispielreise als Eingabe-Entwurf: Berlin Hbf, ICE 945 auf Gleis 14,
 * Anschluss ICE 1007 auf Gleis 6 - mit denselben Zeiten, die die
 * Vorführquelle auf ihre Tafeln stellt.
 *
 * Die Tour füllt die Felder nicht per simuliertem Tippen (so machte es nur
 * die Vorschau). Sie gibt diesen Entwurf der neu aufgebauten Eingabe vor
 * (formularstand.ts) - im Speicher der Seite, nicht im Sitzungsspeicher;
 * die ersten Schritte erklären dann fertige Felder.
 */
export function beispielEntwurf(jetzt: Date): EingabeEntwurf {
  const { ankunft, abfahrt } = beispielZuege(jetzt)
  return {
    suchtext: BEISPIEL_ORT.name,
    gewaehlt: BEISPIEL_ORT,
    anschlussText: '',
    anschlussOrt: null,
    evaManuell: '',
    gleisAn: ankunft.gleisSoll,
    gleisAb: abfahrt.gleisSoll,
    wagenAn: '',
    wagenAb: '',
    // Die Aufzeichnung ist mit dem normalen Gehtempo gerechnet.
    profil: 'normal',
    zugAnkunft: ankunft,
    zugAbfahrt: abfahrt,
    fahrtAnkunft: null,
    fahrtAbfahrt: null,
  }
}
