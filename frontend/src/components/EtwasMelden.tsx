import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { sendeMeldung } from '../api/meldung'
import { RECHTSPFAD, oeffneRechtsseite } from '../navigation/rechtsseiten'
import { MAX_ZEICHEN, adresseStatus, nachrichtStatus } from '../rueckmeldung/regeln'

/**
 * „Etwas melden" (Spec docs/superpowers/specs/2026-11-10-etwas-melden-design.md).
 *
 * Freitext plus freiwillige Adresse, als Mail an Julians Postfach. Die App
 * schickt NICHTS aus ihrem Zustand mit - kein Bahnhof, kein Gleis (Julian).
 *
 * Aufbau wie „Reise importieren" (ReiseImport.tsx): Klick daneben und Escape
 * schliessen. Die Felder folgen dem Halo-Field von cult-ui - Beschriftung,
 * Huelle, Zeile darunter -, aber ohne Halo und in den Farben von Umstieg.
 */
interface EtwasMeldenProps {
  onSchliessen: () => void
}

type Zustand = 'bearbeiten' | 'sendet' | 'fehler' | 'danke'

export function EtwasMelden({ onSchliessen }: EtwasMeldenProps) {
  const [text, setText] = useState('')
  const [email, setEmail] = useState('')
  const [emailVerlassen, setEmailVerlassen] = useState(false)
  const [zustand, setZustand] = useState<Zustand>('bearbeiten')
  // Ein Doppeltipp darf keine zweite Mail ausloesen - der Zustand allein
  // reicht nicht, er ist beim zweiten Klick noch nicht neu gezeichnet.
  const sendetRef = useRef(false)

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSchliessen()
    }
    window.addEventListener('keydown', beiTaste)
    return () => window.removeEventListener('keydown', beiTaste)
  }, [onSchliessen])

  const nachricht = nachrichtStatus(text)
  const adresse = adresseStatus(email)
  const adresseFalsch = emailVerlassen && adresse === 'ungueltig'
  const sendet = zustand === 'sendet'
  const gesperrt = nachricht !== 'ok' || adresse === 'ungueltig' || sendet

  async function absenden() {
    if (gesperrt || sendetRef.current) return
    sendetRef.current = true
    setZustand('sendet')
    const ok = await sendeMeldung(text, email)
    sendetRef.current = false
    setZustand(ok ? 'danke' : 'fehler')
  }

  function zumDatenschutz(e: MouseEvent<HTMLAnchorElement>) {
    // Wie in der Fusszeile: Strg-, Cmd-, Umschalt- und Mittelklick bleiben dem Browser.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onSchliessen()
    oeffneRechtsseite('datenschutz')
  }

  return (
    <div className="dialog-grund" onClick={onSchliessen}>
      <div
        className="dialog etwas-melden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="etwas-melden-titel"
        onClick={(e) => e.stopPropagation()}
      >
        {zustand === 'danke' ? (
          <>
            <div className="etwas-melden-danke">
              <span className="etwas-melden-haken" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h2 id="etwas-melden-titel">Danke!</h2>
              <p>Deine Meldung ist angekommen.</p>
            </div>
            <button type="button" className="knopf-primaer" onClick={onSchliessen}>
              Schließen
            </button>
          </>
        ) : (
          <>
            <h2 id="etwas-melden-titel">Etwas melden</h2>

            <div className="feld">
              <label htmlFor="etwas-melden-text">Deine Nachricht</label>
              <textarea
                id="etwas-melden-text"
                className="feldhuelle etwas-melden-text"
                rows={5}
                maxLength={MAX_ZEICHEN}
                placeholder="z. B. In Fulda führt der Weg von Gleis 4 zu Gleis 6 über eine Treppe, die gesperrt ist."
                value={text}
                aria-invalid={nachricht === 'zu-kurz'}
                aria-describedby="etwas-melden-text-zeile"
                onChange={(e) => setText(e.target.value)}
              />
              <div className="feld-zeile">
                <span id="etwas-melden-text-zeile">
                  {nachricht === 'zu-kurz' && <span className="feld-fehler">Dein Text ist zu kurz.</span>}
                </span>
                <span className="feld-zaehler">
                  {text.length} / {MAX_ZEICHEN}
                </span>
              </div>
            </div>

            <div className="feld">
              <label htmlFor="etwas-melden-email">
                E-Mail-Adresse <span className="feld-optional">(optional)</span>
              </label>
              <p id="etwas-melden-email-hilfe" className="feld-hilfe">
                Gib deine E-Mail-Adresse an, um eine Antwort zu erhalten.
              </p>
              <input
                id="etwas-melden-email"
                type="email"
                autoComplete="email"
                className="feldhuelle"
                placeholder="name@beispiel.de"
                value={email}
                aria-invalid={adresseFalsch}
                aria-describedby={
                  adresseFalsch ? 'etwas-melden-email-hilfe etwas-melden-email-fehler' : 'etwas-melden-email-hilfe'
                }
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailVerlassen(true)}
              />
              {adresseFalsch && (
                <p id="etwas-melden-email-fehler" className="feld-fehler">
                  Diese E-Mail-Adresse sieht unvollständig aus.
                </p>
              )}
            </div>

            {zustand === 'fehler' && (
              <p className="fehler-box" role="alert">
                Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.
              </p>
            )}

            <div className="etwas-melden-knoepfe">
              <button type="button" className="knopf-sekundaer" onClick={onSchliessen}>
                Abbrechen
              </button>
              <button type="button" className="knopf-primaer" disabled={gesperrt} onClick={absenden}>
                {sendet ? 'Wird gesendet …' : 'Senden'}
              </button>
            </div>

            <p className="etwas-melden-klein">
              Deine Nachricht geht per E-Mail an Umstieg. Mehr dazu im{' '}
              <a href={RECHTSPFAD.datenschutz} onClick={zumDatenschutz}>
                Datenschutz
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}
