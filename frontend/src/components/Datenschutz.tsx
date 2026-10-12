import { BETREIBER } from '../rechtliches/betreiber'

// Beschreibt ausschliesslich, was der Code tatsaechlich tut. Bei Aenderungen
// an der Datenverarbeitung ist diese Seite mitzupflegen:
// - Standort: standort/useStandort.ts, standort/bahnhofErkennung.ts (Rundung)
// - Eingabe im sessionStorage: sitzung/eingabespeicher.ts, abgesichert in
//   sitzung/eingabespeicher.test.ts ("fasst localStorage nicht an") und
//   components/Datenschutz.test.tsx
// - Reise (Route, Meldungen) im sessionStorage, seit 11.10.2026:
//   sitzung/reisespeicher.ts, geloescht bei „Angekommen" (App.tsx,
//   bestaetigeAnkunft), abgesichert in sitzung/reisespeicher.test.ts und
//   App.test.tsx
// - Adressen je Bildschirm (/eingabe, /weg ...), seit 11.10.2026:
//   navigation/adressen.ts - sie tragen keine Reisedaten
// - Darstellung (Hell/Dunkel) im localStorage, seit 05.10.2026:
//   einstellungen/darstellung.ts, abgesichert in
//   einstellungen/darstellung.test.ts ("schreibt nichts, solange niemand
//   waehlt", "loescht den Eintrag, wenn wieder System gewaehlt wird")
// - Kartenkacheln: components/Karte.tsx
// - Schriften: index.css (lokale @font-face, KEIN Google Fonts)
// - Reichweitenmessung: main.tsx (<Analytics>), analytik/ereignis.ts
//   (schneidet die Abfragezeichenkette ab), abgesichert in
//   analytik/ereignis.test.ts und components/Datenschutz.test.tsx
// - Backend ohne Zugriffsprotokoll: backend/src/app.ts
//   (disableRequestLogging), abgesichert in backend/test/datenschutz.test.ts
// - Ratenbegrenzung und Sicherheitsprotokoll: backend/src/app.ts (GRENZEN,
//   trustProxy), backend/src/core/sicherheitsprotokoll.ts, abgesichert in
//   backend/test/ratelimit.test.ts und backend/test/datenschutz.test.ts
//
//   Seit dem 03.09.2026 begrenzt der Server die Anfragen je Aufrufer und
//   meldet, WENN eine Grenze gegriffen hat. Der Eintrag traegt Ereignisart,
//   Routen-Muster und Trefferzahl - keine Adresse, keine URL. Die Adresse
//   bleibt im Zaehlwerk im Arbeitsspeicher. Damit war der Satz „Die Anwendung
//   selbst schreibt keine Protokolle" nicht mehr zu halten; er ist durch die
//   genauere Aussage ersetzt, dass kein ZUGRIFFSPROTOKOLL gefuehrt wird.
//
//   Nicht mehr `logger: false`: Seit dem 02.09.2026 protokolliert das Backend
//   Ausfaelle (Overpass, FaSta, RIS::Stations, Timetables), damit sie nicht
//   lautlos geschehen. Diese Eintraege haengen an einem Bahnhof, nicht an
//   einem Menschen - kein Personenbezug. Was ausbleibt, ist Fastifys
//   Anfrageprotokoll: Es traegt `url` und `remoteAddress`, und die URL der
//   Bahnhofssuche IST die Koordinate. Genau dieser Satz auf dieser Seite
//   waere damit unwahr geworden.
export function Datenschutz({ onZurueck }: { onZurueck: () => void }) {
  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Datenschutz</h1>
      </header>
      <hr className="trennlinie" />

      <div className="rechtstext">
        <h2>Kurzfassung</h2>
        <p>
          Diese App setzt keine Cookies und bindet keine Werbedienste ein. Zur
          Reichweitenmessung zählen wir Seitenaufrufe – ohne Cookies, ohne
          Kennung und ohne Profil. Es gibt kein Nutzerkonto. Auf deinem Gerät bleibt
          allein deine eigene Eingabe – Bahnhof, Gleise, Zug – und nur so
          lange, wie dieser Browser-Tab offen ist. Dein Standort wird nur mit
          deiner Erlaubnis verwendet, bereits im Browser auf etwa 110 Meter
          gerundet und nirgends gespeichert.
        </p>

        <h2>Verantwortlicher</h2>
        <p>
          {BETREIBER.name}
          <br />
          {BETREIBER.strasse}
          <br />
          {BETREIBER.ort}
          <br />
          E-Mail: {BETREIBER.email}
        </p>

        <h2>Standortdaten</h2>
        <p>
          <strong>Zweck:</strong> den Umstiegsbahnhof vorzuschlagen, deine
          Position auf der Karte zu zeigen und zu erkennen, wann du am Zielgleis
          angekommen bist.
        </p>
        <p>
          <strong>Rechtsgrundlage:</strong> deine Einwilligung nach Art. 6 Abs. 1
          lit. a DSGVO. Du erteilst sie über die Abfrage deines Browsers und
          kannst sie dort jederzeit widerrufen. Ohne Einwilligung funktioniert
          die App weiter – du suchst den Bahnhof dann von Hand.
        </p>
        <p>
          <strong>Was das Gerät verlässt:</strong> Zur Bahnhofserkennung werden
          Breiten- und Längengrad <em>gerundet auf drei Nachkommastellen</em> an
          unseren Server gesendet – das entspricht einem Raster von rund 110
          Metern und reicht, um einen Bahnhof zuzuordnen, nicht aber, um einen
          Weg nachzuvollziehen. Die Rundung geschieht im Browser, bevor gesendet
          wird. Die genaue Position bleibt ausschließlich auf deinem Gerät und
          wird dort nur zur Anzeige des Punktes auf der Karte und zur
          Ankunftserkennung verwendet.
        </p>
        <p>
          <strong>Speicherung:</strong> keine. Der Server verarbeitet die
          gerundete Koordinate im Arbeitsspeicher, um die Bahnhofssuche
          auszuführen, und verwirft sie danach. Ein Zugriffsprotokoll mit
          Koordinaten wird nicht geführt.
        </p>

        <h2>Server-Protokolle</h2>
        <p>
          Die Anwendung führt <strong>kein Zugriffsprotokoll</strong>. Es wird
          nicht festgehalten, wer wann welche Seite oder welchen Bahnhof
          aufgerufen hat.
        </p>
        <p>
          Geschrieben werden ausschließlich Einträge{' '}
          <strong>ohne Personenbezug</strong>: Ausfälle der Datenquellen – damit
          sie nicht lautlos geschehen – und Sicherheitsereignisse, etwa dass
          eine Anfragegrenze gegriffen hat und auf welcher Route. Wer sie
          ausgelöst hat, steht nicht darin, und die aufgerufene Adresse
          ebenfalls nicht.
        </p>
        <p>
          <strong>Missbrauchsabwehr:</strong> Der Server begrenzt, wie viele
          Anfragen ein einzelner Aufrufer stellen darf – sonst könnte jeder die
          kostenpflichtigen Datenquellen dahinter leerlaufen lassen. Dafür wird
          deine IP-Adresse flüchtig im Arbeitsspeicher mitgezählt und nach
          kurzer Zeit verworfen. Sie wird <strong>nicht gespeichert</strong> und
          nicht protokolliert; ein Neustart des Servers löscht die Zähler
          vollständig. Rechtsgrundlage ist das berechtigte Interesse am sicheren
          Betrieb (Art. 6 Abs. 1 lit. f DSGVO, Erwägungsgrund 49). Du kannst
          dem nach Art. 21 DSGVO widersprechen – ohne diese Begrenzung ließe
          sich der Dienst allerdings nicht offen betreiben.
        </p>
        <p>
          Die eingesetzten Hosting-Anbieter erfassen technisch bedingt
          Verbindungsdaten einschließlich IP-Adresse, um den Betrieb
          sicherzustellen und Angriffe abzuwehren (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <ul>
          <li>
            <strong>Vercel Inc.</strong> liefert die Webseite aus und stellt die
            Reichweitenmessung bereit (siehe unten).
          </li>
          <li>
            <strong>Fly.io Inc.</strong> betreibt den Server, der die Wege
            berechnet.
          </li>
        </ul>
        <p>
          Beide Anbieter sitzen in den USA. Die Übermittlung stützt sich auf die
          Standardvertragsklauseln der EU-Kommission.
        </p>

        <h2>Kartendaten</h2>
        <p>
          Die Kartenkacheln werden erst geladen, wenn du die Karte aufklappst.
          Sie stammen direkt von den Servern der OpenStreetMap Foundation. Dabei
          erfährt diese deine IP-Adresse und den betrachteten Kartenausschnitt.
          Solange du die Karte nicht öffnest, findet keine Verbindung dorthin
          statt.
        </p>

        <h2>Schriftarten</h2>
        <p>
          Die Schrift „Archivo" wird von unserem eigenen Server ausgeliefert.
          Es besteht keine Verbindung zu Google Fonts oder einem anderen
          Schriftendienst – beim Laden der Schrift werden keinerlei Daten an
          Dritte übertragen.
        </p>

        <h2>Fahrplan- und Stationsdaten</h2>
        <p>
          Abfragen an die Schnittstellen der Deutschen Bahn stellt
          ausschließlich unser Server, nie dein Browser. Übermittelt werden dabei
          nur Bahnhofsnummer und Zugdaten – keine personenbezogenen Angaben und
          keine Kennung, die auf dich zurückführt.
        </p>

        <h2>Reichweitenmessung</h2>
        <p>
          Wir zählen, welche Seiten wie oft aufgerufen werden – mit{' '}
          <strong>Vercel Web Analytics</strong> (Vercel Inc.). Ohne diese Zahlen
          wüssten wir nicht, ob die App überhaupt jemand benutzt.
        </p>
        <p>
          <strong>Ohne Cookies und ohne Speicher auf deinem Gerät.</strong> Es
          wird nichts gesetzt und nichts ausgelesen; deshalb greift § 25 TTDSG
          nicht und es gibt kein Zustimmungsbanner. Es wird keine Kennung
          vergeben, die dich über mehrere Aufrufe oder über verschiedene
          Webseiten hinweg wiedererkennt.
        </p>
        <p>
          <strong>Was übermittelt wird:</strong> die aufgerufene Adresse – sie
          nennt nur den Bildschirm (etwa <code>/weg</code>), nie einen Bahnhof
          oder ein Gleis –, der
          Verweis, aus dem du kamst, sowie Land, Betriebssystem und Browser in
          grober Form. Die <strong>Abfragezeichenkette der Adresse wird vorher
          abgeschnitten</strong> – sie könnte künftig Angaben tragen, die die
          Messung nichts angehen. Deine IP-Adresse wird zur Bestimmung des
          Landes verarbeitet und nicht gespeichert.
        </p>
        <p>
          <strong>Rechtsgrundlage:</strong> unser berechtigtes Interesse an
          einer Nutzungsstatistik nach Art. 6 Abs. 1 lit. f DSGVO. Du kannst
          dieser Verarbeitung nach Art. 21 DSGVO widersprechen; ein Browser mit
          aktiviertem Tracking-Schutz oder ein Inhaltsblocker verhindert die
          Zählung bereits technisch.
        </p>
        <p>
          Es findet <strong>kein Profiling</strong> und keine automatisierte
          Entscheidungsfindung statt.
        </p>

        <h2>Deine Eingabe im Browser</h2>
        <p>
          Damit du Bahnhof, Gleise und Zugauswahl nicht erneut eingeben musst,
          wenn du zwischen den Ansichten wechselst oder die Seite neu lädt,
          bleibt deine Eingabe im <code>sessionStorage</code> deines Browsers.
          Ebenso die berechnete Route und die Meldungen dieser Reise – damit ein
          Neuladen, etwa im Bahnhof ohne Netz, den Weg nicht verliert.
          Das ist der Speicher eines einzelnen Tabs: Er wird geleert, sobald du
          den Tab schließt – und außerdem, sobald du „Angekommen“ bestätigst
          oder einen neuen Umstieg eingibst.
        </p>
        <p>
          Diese Daten verlassen dein Gerät nicht; sie werden zu keinem Zeitpunkt
          an uns übertragen. Es handelt sich um eine Speicherung, die für den
          von dir ausdrücklich gewünschten Dienst erforderlich ist
          (§ 25 Abs. 2 Nr. 2 TTDSG) – eine Einwilligung ist dafür nicht nötig,
          und ein Zustimmungsbanner gibt es deshalb bewusst nicht.
        </p>

        <h2>Deine Wahl der Darstellung</h2>
        <p>
          Wählst du unter „Einstellungen“ ausdrücklich <em>Hell</em> oder{' '}
          <em>Dunkel</em>, merkt sich dein Browser diese eine Angabe im{' '}
          <code>localStorage</code>, damit die App beim nächsten Öffnen gleich
          so aussieht. Gespeichert wird nur das Wort „hell“ oder „dunkel“ –
          nichts über dich und nichts über deine Reise. Stellst du wieder auf{' '}
          <em>System</em>, wird der Eintrag gelöscht. Solange du nichts wählst,
          legt die App dort nichts ab.
        </p>
        <p>
          Auch diese Angabe verlässt dein Gerät nicht und ist für die von dir
          gewünschte Einstellung erforderlich (§ 25 Abs. 2 Nr. 2 TTDSG).
        </p>

        <h2>Deine Rechte</h2>
        <p>
          Dir stehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16),
          Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21) zu. Da wir
          keine personenbezogenen Daten speichern, können wir dich in unseren
          Beständen allerdings nicht identifizieren – es gibt schlicht nichts,
          worüber Auskunft zu erteilen wäre. Unabhängig davon kannst du dich bei
          einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
        </p>
      </div>

      <button type="button" className="knopf-sekundaer" onClick={onZurueck}>
        Zurück
      </button>
    </main>
  )
}
