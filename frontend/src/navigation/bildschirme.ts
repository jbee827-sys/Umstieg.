export type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'stoerung' | 'angekommen'

export interface LeistenEintrag {
  id: Bildschirm
  label: string
  aktiv: boolean
}

// 'stoerung' fehlt bewusst: Der Bildschirm ist nur bei einem Gleiswechsel
// erreichbar und waere sonst ein Knopf, der meistens ins Leere fuehrt.
// Stattdessen traegt der Dashboard-Eintrag ein Kennzeichen.
export function leisteneintraege(hatRoute: boolean): LeistenEintrag[] {
  return [
    { id: 'eingabe', label: 'Eingabe', aktiv: true },
    { id: 'dashboard', label: 'Dashboard', aktiv: hatRoute },
    { id: 'navigation', label: 'Weg', aktiv: hatRoute },
    { id: 'angekommen', label: 'Angekommen', aktiv: hatRoute },
  ]
}
