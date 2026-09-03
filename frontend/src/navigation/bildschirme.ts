export type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'stoerung' | 'angekommen'

export interface LeistenEintrag {
  id: Bildschirm
  label: string
  aktiv: boolean
}

// Zwei Bildschirme fehlen hier bewusst, aus zwei verschiedenen Gruenden.
//
// 'stoerung' ist nur bei einem Gleiswechsel erreichbar und waere sonst ein
// Knopf, der meistens ins Leere fuehrt. Stattdessen traegt der
// Dashboard-Eintrag ein Kennzeichen.
//
// 'angekommen' ist das Ende der Reise, kein Ort zum Nachschlagen. Als
// Dauereintrag lud die Leiste dazu ein, ihn mitten im Umstieg zu treffen und
// damit die laufende Navigation zu beenden. Erreichbar ist der Bildschirm
// ueber den Knopf auf der Weg-Seite - dort, wo man ihn braucht.
export function leisteneintraege(hatRoute: boolean): LeistenEintrag[] {
  return [
    { id: 'eingabe', label: 'Eingabe', aktiv: true },
    { id: 'dashboard', label: 'Dashboard', aktiv: hatRoute },
    { id: 'navigation', label: 'Weg', aktiv: hatRoute },
  ]
}
