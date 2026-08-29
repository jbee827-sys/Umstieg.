import { BETREIBER } from '../rechtliches/betreiber'

// Beschreibt ausschliesslich, was der Code tatsaechlich tut. Bei Aenderungen
// an der Datenverarbeitung ist diese Seite mitzupflegen:
// - Standort: standort/useStandort.ts, standort/bahnhofErkennung.ts (Rundung)
// - Kartenkacheln: components/Karte.tsx
// - Schriften: index.css (@import von fonts.googleapis.com)
// - Backend ohne Logging: backend/src/app.ts (logger: false)
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
          Diese App setzt keine Cookies, speichert nichts auf deinem Gerät und
          bindet keine Analyse- oder Werbedienste ein. Es gibt kein
          Nutzerkonto. Dein Standort wird nur mit deiner Erlaubnis verwendet,
          bereits im Browser auf etwa 110 Meter gerundet und nirgends
          gespeichert.
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
          Die Anwendung selbst schreibt keine Protokolle. Die eingesetzten
          Hosting-Anbieter erfassen technisch bedingt Verbindungsdaten
          einschließlich IP-Adresse, um den Betrieb sicherzustellen und Angriffe
          abzuwehren (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <ul>
          <li>
            <strong>Vercel Inc.</strong> liefert die Webseite aus.
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
          Die Schrift „Archivo" wird derzeit von Google Fonts geladen
          (Google Ireland Limited). Dabei wird deine IP-Adresse an Google
          übertragen. Diese Einbindung soll durch eine lokale Auslieferung der
          Schriftdateien ersetzt werden; bis dahin ist sie hier offengelegt.
        </p>

        <h2>Fahrplan- und Stationsdaten</h2>
        <p>
          Abfragen an die Schnittstellen der Deutschen Bahn stellt
          ausschließlich unser Server, nie dein Browser. Übermittelt werden dabei
          nur Bahnhofsnummer und Zugdaten – keine personenbezogenen Angaben und
          keine Kennung, die auf dich zurückführt.
        </p>

        <h2>Keine Cookies, kein Tracking</h2>
        <p>
          Es werden keine Cookies gesetzt und weder <code>localStorage</code> noch{' '}
          <code>sessionStorage</code> verwendet. Es gibt keine
          Reichweitenmessung, kein Profiling und keine automatisierte
          Entscheidungsfindung.
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
