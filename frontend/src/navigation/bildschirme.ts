export type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'meldungen' | 'angekommen'

export interface LeistenEintrag {
  id: Bildschirm
  label: string
  aktiv: boolean
}

// 'angekommen' fehlt hier bewusst: Es ist das Ende der Reise, kein Ort zum
// Nachschlagen. Als Dauereintrag lud die Leiste dazu ein, ihn mitten im
// Umstieg zu treffen und damit die laufende Navigation zu beenden. Erreichbar
// ist der Bildschirm ueber den Knopf auf der Weg-Seite - dort, wo man ihn
// braucht.
//
// 'meldungen' fehlte bis zum 03.09.2026 aus einem anderen Grund: Der
// Vorgaenger 'stoerung' war nur bei einem Gleiswechsel erreichbar und waere
// als Dauereintrag ein Knopf gewesen, der meistens ins Leere fuehrt. Die
// Meldungsseite hat einen leeren Zustand - sie sagt dann, dass es nichts
// gibt, und nennt den Zeitpunkt des letzten Live-Kontakts. Damit fuehrt der
// Eintrag nie ins Leere.
export function leisteneintraege(hatRoute: boolean): LeistenEintrag[] {
  return [
    { id: 'eingabe', label: 'Eingabe', aktiv: true },
    { id: 'dashboard', label: 'Dashboard', aktiv: hatRoute },
    { id: 'navigation', label: 'Weg', aktiv: hatRoute },
    { id: 'meldungen', label: 'Meldungen', aktiv: hatRoute },
  ]
}
