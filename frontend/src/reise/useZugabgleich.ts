import { useEffect } from 'react'
import type { TafelEintrag } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'
import { gleicheZuegeAb, zugnummer } from './zugabgleich'

/**
 * Spaeter Abgleich der Zuege aus einem Reisetext (22.11.2026).
 *
 * Die Tafel reicht etwa zwei Stunden voraus. Wer die Reise in Frankfurt teilt
 * und in Berlin umsteigt, findet den Anschluss beim Import noch nicht. Bis er
 * gefunden ist, traegt die Reise den Namen aus dem Text - und die
 * Live-Ueberwachung erkennt ihn nicht. Solange die Reise laeuft, sucht dieser
 * Hook deshalb weiter; ein Treffer ersetzt die Namen, und der Live-Strom
 * verbindet sich mit den richtigen neu (er haengt an `werte`).
 *
 * Das Gleis bleibt, wie es ist: Weicht die Tafel schon ab, meldet das der
 * Live-Strom nicht mehr als Wechsel. Die Route neu zu rechnen waere ein
 * zweiter, unangekuendigter Bildwechsel - bewusst nicht.
 */

/** Abstand der Versuche. Die Tafel liegt ohnehin 30 s im Zwischenspeicher. */
export const ABGLEICH_ABSTAND_MS = 3 * 60_000

/** Die Werte mit den Zuegen der Tafel statt der aus dem Text. */
export function mitTreffer(werte: EingabeWerte, treffer: { an?: TafelEintrag; ab?: TafelEintrag }): EingabeWerte {
  const neu: EingabeWerte = { ...werte }
  const { an, ab } = treffer
  if (an) {
    neu.zugAnName = an.zug
    neu.zugAnAnzeige = an.anzeige
    neu.zugAn = zugnummer(an.zug)
    neu.vonHalt = an.vonHalt
    neu.nachHalt = an.nachHalt
    neu.ankunftZeit = an.zeitIst ?? an.zeitSoll
    delete neu.zugAnAusText
  }
  if (ab) {
    neu.zugAbName = ab.zug
    neu.zugAbAnzeige = ab.anzeige
    neu.abfahrtZeit = ab.zeitIst ?? ab.zeitSoll
    delete neu.zugAbAusText
  }
  return neu
}

export function useZugabgleich(
  werte: EingabeWerte | null,
  aktiv: boolean,
  uebernimm: (neu: EingabeWerte) => void,
): void {
  useEffect(() => {
    if (!aktiv || !werte || !werte.eva || werte.haltestellen) return
    const an = werte.zugAnAusText && werte.zugAnName && werte.ankunftZeit
      ? { name: werte.zugAnName, zeit: werte.ankunftZeit }
      : undefined
    const ab = werte.zugAbAusText && werte.zugAbName && werte.abfahrtZeit
      ? { name: werte.zugAbName, zeit: werte.abfahrtZeit }
      : undefined
    if (!an && !ab) return

    let vorbei = false
    const versuch = async () => {
      const treffer = await gleicheZuegeAb(werte.eva, an, ab)
      if (vorbei || (!treffer.an && !treffer.ab)) return
      uebernimm(mitTreffer(werte, treffer))
    }
    void versuch()
    const takt = setInterval(() => void versuch(), ABGLEICH_ABSTAND_MS)
    return () => {
      vorbei = true
      clearInterval(takt)
    }
  }, [aktiv, werte, uebernimm])
}
