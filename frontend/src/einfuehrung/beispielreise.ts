import { schreibe as schreibeEntwurf } from '../sitzung/eingabespeicher'
import { BEISPIEL_ORT, beispielZuege } from './vorfuehrquelle'

/**
 * Legt die Beispielreise als Eingabe-Entwurf ab: Berlin Hbf, ICE 945 auf
 * Gleis 14, Anschluss ICE 1007 auf Gleis 6 - mit denselben Zeiten, die die
 * Vorführquelle auf ihre Tafeln stellt.
 *
 * Die Tour füllt die Felder nicht per simuliertem Tippen (so machte es nur
 * die Vorschau). Nach dem Neuaufbau liest die Eingabe diesen Entwurf wie
 * nach einem Neuladen; die ersten Schritte erklären dann fertige Felder.
 * Vorbild: `sitzung/vorbelegung.ts`.
 */
export function schreibeBeispielEntwurf(jetzt: Date): void {
  const { ankunft, abfahrt } = beispielZuege(jetzt)
  schreibeEntwurf({
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
  })
}
