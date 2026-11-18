import { useEffect, useRef, useState } from 'react'
import { istReisetag, parseReise, type Reise, type Umstieg } from '../reise/reisetext'

interface ReiseImportProps {
  onSchliessen: () => void
  onUebernehmen: (umstieg: Umstieg, datum: string) => void
  /** Injizierbar, damit Tests den Reisetag stellen koennen. */
  jetzt?: Date
  /**
   * Schon eingesetzter Text - in der App aus der Teilen-Erweiterung
   * („An Umstieg senden“, plattform/uebergabe.ts). Er wird gelesen wie ein
   * eingefuegter: angezeigt, ausgewertet, aber nichts von selbst uebernommen.
   */
  vorgabe?: string
}

/**
 * Reise aus dem DB Navigator übernehmen.
 *
 * Der Nutzer fügt den Text aus „Verbindung teilen" ein; daraus fallen alle
 * Umstiege der Reise heraus, mit Bahnhof und beiden Gleisen. Das ist die
 * Eingabe, die dieses Formular sonst von Hand verlangt.
 *
 * Ausgewertet wird ausschließlich hier im Browser: kein Upload, kein
 * Endpunkt, nichts gespeichert. Der Text wird beim Schließen verworfen.
 *
 * Bewusst ein Textfeld und kein Dateidialog. Der DB Navigator teilt über das
 * normale Teilen-Menü des Betriebssystems – einfügen ist auf dem Handy ein
 * Handgriff, eine Datei suchen sind vier.
 */
export function ReiseImport({ onSchliessen, onUebernehmen, jetzt, vorgabe }: ReiseImportProps) {
  const [reise, setReise] = useState<Reise | null>(null)
  const [unlesbar, setUnlesbar] = useState(false)
  /**
   * Index des gewählten Umstiegs in `reise.umstiege`; `null` = noch keiner.
   *
   * Es gibt nur EINEN Bestätigungsschritt: Die gewählte Karte zeigt schon
   * alles, was ins Formular wandert (Bahnhof, beide Züge mit Zeit und Gleis,
   * Umsteigezeit). Ein zweiter Zwischenschritt wiederholte nur dieselben
   * Zeilen. Übernommen wird trotzdem nie ohne Tipp auf „Bestätigen" - bei
   * einem einzigen Umstieg ist die Karte nur vorgewählt.
   */
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const feldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Mit geteiltem Text kein Fokus ins Feld: Die Tastatur verdeckte sonst
    // genau die Auswahl, um die es jetzt geht.
    if (vorgabe) verarbeite(vorgabe)
    else feldRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Oeffnen; ein neuer Text oeffnet den Dialog neu (key)
  }, [])

  // Escape schliesst. Ein Dialog, den man nur ueber einen Knopf wieder
  // loswird, ist auf dem Handy schnell eine Sackgasse.
  useEffect(() => {
    function beiTaste(e: KeyboardEvent) {
      if (e.key === 'Escape') onSchliessen()
    }
    document.addEventListener('keydown', beiTaste)
    return () => document.removeEventListener('keydown', beiTaste)
  }, [onSchliessen])

  function verarbeite(text: string) {
    setGewaehlt(null)
    if (!text.trim()) {
      setReise(null)
      setUnlesbar(false)
      return
    }
    const gelesen = parseReise(text)
    if (!gelesen) {
      setReise(null)
      setUnlesbar(true)
      return
    }
    setUnlesbar(false)
    /*
     * NICHTS wird von selbst übernommen - auch nicht bei genau einem
     * Umstieg.
     *
     * Anfangs schloss das Fenster in diesem Fall sofort und füllte die
     * Felder. Das war falsch: Der Parser liest FREMDE, undokumentierte
     * Formate, und was er herausholt, kann daneben liegen. Landet ein
     * falsches Gleis ungefragt im Formular, merkt es niemand - und am
     * Bahnhof steht man dann am falschen Ende.
     *
     * Ein Blick und ein Tipp kosten eine Sekunde. Ein falscher Bahnsteig
     * kostet den Anschluss. Bei genau einem Umstieg ist er deshalb nur
     * vorgewählt, übernommen wird erst mit „Bestätigen".
     */
    setReise(gelesen)
    if (gelesen.umstiege.length === 1) setGewaehlt(0)
  }

  const nichtHeute = reise?.datum && !istReisetag(reise.datum, jetzt ?? new Date())

  return (
    <div className="dialog-grund" onClick={onSchliessen}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reiseimport-titel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reiseimport-titel">Reise importieren</h2>

        <ol className="anleitung">
          <li>Gehe zu deiner Reiseverbindung</li>
          <li>
            <strong>Verbindung teilen</strong>
          </li>
          <li>
            <strong>Text kopieren</strong>
          </li>
          <li>
            <strong>Im Feld einfügen</strong>
          </li>
        </ol>

        <div className="feld">
          <label htmlFor="reisetext">Text der Verbindung</label>
          <textarea
            id="reisetext"
            ref={feldRef}
            className="eingabefeld reisetext"
            rows={4}
            placeholder="Hier einfügen …"
            defaultValue={vorgabe}
            onChange={(e) => verarbeite(e.target.value)}
          />
        </div>

        {unlesbar && (
          <p className="fehler-box">
            Der Text konnte nicht erkannt werden. Achte darauf, den ganzen Text aus „Verbindung
            teilen" einzufügen – oder trage die Gleise von Hand ein.
          </p>
        )}

        {/*
          Erkannt, aber nichts zu tun. Das ist KEIN Fehlschlag und darf nicht
          so aussehen: Wer eine Direktverbindung teilt, hat schlicht keinen
          Umstieg. Deshalb steht hier, was gelesen wurde – sonst hält man die
          Erkennung für kaputt und probiert es dreimal.
        */}
        {reise && reise.umstiege.length === 0 && (
          <p className="hinweis-box">
            Erkannt: {reise.abschnitte[0].zug || 'Fahrt'} von {reise.von} nach {reise.nach}.
            <br />
            Diese Verbindung hat keinen Umstieg – dafür rechnet die App nichts aus. Sie hilft am
            Umstiegsbahnhof zwischen zwei Zügen.
          </p>
        )}

        {reise && reise.umstiege.length > 0 && (
          <>
            {nichtHeute && (
              <p className="fehler-box">
                Live-Daten zu Gleisen und Verspätungen gibt es erst am Reisetag. Bis dahin siehst du
                die geplanten Gleise.
              </p>
            )}
            <ul className="umstieg-liste">
              {reise.umstiege.map((u, i) => (
                <li key={`${u.bahnhof}-${u.abZeit}-${i}`}>
                  {/* Eine Auswahlkarte: Der Radioknopf ist nur vorlesbar, die
                      Karte selbst ist die Trefferfläche. Gewählt zeigt sie
                      Rand und Haken. */}
                  <label className={`umstieg-wahl${gewaehlt === i ? ' gewaehlt' : ''}`}>
                    <input
                      type="radio"
                      name="umstieg"
                      className="nur-vorlesen"
                      checked={gewaehlt === i}
                      onChange={() => setGewaehlt(i)}
                    />
                    {gewaehlt === i && (
                      <span className="umstieg-haken" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    <strong>{u.bahnhof}</strong>
                    <span className="umstieg-zeile">
                      {u.anZug} an {u.anZeit} Gl. {u.anGleis ?? '?'} → {u.abZug} ab {u.abZeit} Gl.{' '}
                      {u.abGleis ?? '?'}
                    </span>
                    <span className="umstieg-zeile schwach">
                      {u.minuten} min Umsteigezeit
                      {!u.vollstaendig && ' · Gleis unbekannt'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="dialog-knoepfe">
          <button type="button" className="knopf-sekundaer" onClick={onSchliessen}>
            Abbrechen
          </button>
          {reise && reise.umstiege.length > 0 && (
            <button
              type="button"
              className="knopf-angekommen"
              disabled={gewaehlt === null}
              onClick={() => {
                if (gewaehlt === null) return
                onUebernehmen(reise.umstiege[gewaehlt], reise.datum)
                onSchliessen()
              }}
            >
              Bestätigen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
