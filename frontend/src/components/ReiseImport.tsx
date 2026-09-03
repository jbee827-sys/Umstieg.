import { useEffect, useRef, useState } from 'react'
import { istReisetag, parseReise, type Reise, type Umstieg } from '../reise/reisetext'

interface ReiseImportProps {
  onSchliessen: () => void
  onUebernehmen: (umstieg: Umstieg, datum: string) => void
  /** Injizierbar, damit Tests den Reisetag stellen koennen. */
  jetzt?: Date
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
export function ReiseImport({ onSchliessen, onUebernehmen, jetzt }: ReiseImportProps) {
  const [reise, setReise] = useState<Reise | null>(null)
  const [unlesbar, setUnlesbar] = useState(false)
  /**
   * Der ausgewählte Umstieg – noch NICHT übernommen.
   *
   * Auswahl und Übernahme sind bewusst zwei Schritte. Vorher war das Antippen
   * beides zugleich: Man wählte einen Umstieg und hatte die Werte schon im
   * Formular, ohne je gesehen zu haben, was genau in welches Feld wandert.
   * Bei einem Parser, der undokumentierte Fremdformate liest, ist das die
   * Stelle, an der ein falsch gelesenes Gleis unbemerkt durchrutscht.
   */
  const [gewaehlt, setGewaehlt] = useState<Umstieg | null>(null)
  const feldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    feldRef.current?.focus()
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
     * kostet den Anschluss.
     */
    setReise(gelesen)
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

        {/*
          Zweiter Schritt: Was genau in welches Feld wandert - und erst dann
          der Knopf, der es tut. Wer hier ein falsches Gleis sieht, bricht ab,
          statt es am Bahnsteig zu merken.
        */}
        {reise && gewaehlt && (
          <>
            <p className="hinweis-box">
              <strong>Das wird übernommen:</strong>
              <br />
              Umstiegsbahnhof: {gewaehlt.bahnhof}
              <br />
              Ankunft: Gleis {gewaehlt.anGleis ?? '– unbekannt –'}
              {gewaehlt.anZug ? ` (${gewaehlt.anZug}, ${gewaehlt.anZeit})` : ''}
              <br />
              Anschluss: Gleis {gewaehlt.abGleis ?? '– unbekannt –'}
              {gewaehlt.abZug ? ` (${gewaehlt.abZug}, ${gewaehlt.abZeit})` : ''}
            </p>
            <button
              type="button"
              className="knopf-primaer knopf-breit"
              onClick={() => {
                onUebernehmen(gewaehlt, reise.datum)
                onSchliessen()
              }}
            >
              Übernehmen
            </button>
            <button type="button" className="knopf-sekundaer" onClick={() => setGewaehlt(null)}>
              Zurück zur Auswahl
            </button>
          </>
        )}

        {reise && !gewaehlt && reise.umstiege.length > 0 && (
          <>
            <p className="hinweis-box">
              {reise.von && reise.nach ? `${reise.von} → ${reise.nach}` : 'Verbindung erkannt'}
              {reise.datum ? `, ${reise.datum}` : ''}.{' '}
              {reise.umstiege.length === 1 ? 'Stimmt das?' : 'Welcher Umstieg?'}
              <br />
              {/* Was gefunden wurde - nicht, welche App es geschrieben hat.
                  Daran laesst sich ablesen, ob ein Blick auf die Gleise
                  lohnt: Fehlt eines, steht es hier. */}
              <span className="umstieg-zeile schwach">
                {reise.erkannt.abschnitte} Abschnitte erkannt
                {reise.erkannt.gleiseVollstaendig
                  ? ', Gleise vollständig'
                  : ', nicht überall ein Gleis genannt'}
              </span>
            </p>
            {nichtHeute && (
              <p className="fehler-box">
                Live-Daten zu Gleisen und Verspätungen gibt es erst am Reisetag. Bis dahin siehst du
                die geplanten Gleise.
              </p>
            )}
            <ul className="umstieg-liste">
              {reise.umstiege.map((u, i) => (
                <li key={`${u.bahnhof}-${u.abZeit}-${i}`}>
                  <button
                    type="button"
                    className="umstieg-wahl"
                    onClick={() => setGewaehlt(u)}
                  >
                    <strong>{u.bahnhof}</strong>
                    <span className="umstieg-zeile">
                      {u.anZug} an {u.anZeit} Gl. {u.anGleis ?? '?'} → {u.abZug} ab {u.abZeit} Gl.{' '}
                      {u.abGleis ?? '?'}
                    </span>
                    <span className="umstieg-zeile schwach">
                      {u.minuten} min Umsteigezeit
                      {!u.vollstaendig && ' · Gleis unbekannt'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <button type="button" className="knopf-sekundaer" onClick={onSchliessen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
