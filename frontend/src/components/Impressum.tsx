import { ANGABEN_FEHLEN, BETREIBER } from '../rechtliches/betreiber'

export function Impressum({ onZurueck }: { onZurueck: () => void }) {
  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Impressum</h1>
      </header>
      <hr className="trennlinie" />

      {ANGABEN_FEHLEN && (
        <div className="fehler-box">
          Dieses Impressum ist noch nicht ausgefüllt. Die Angaben stehen in
          <code> frontend/src/rechtliches/betreiber.json</code>.
        </div>
      )}

      <div className="rechtstext">
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          {BETREIBER.name}
          <br />
          {BETREIBER.strasse}
          <br />
          {BETREIBER.ort}
          <br />
          {BETREIBER.land}
        </p>

        <h2>Kontakt</h2>
        <p>
          E-Mail: {BETREIBER.email}
          <br />
          Telefon: {BETREIBER.telefon}
        </p>

        <h2>Verantwortlich für den Inhalt</h2>
        <p>
          {BETREIBER.name}, Anschrift wie oben.
        </p>

        <h2>Art des Angebots</h2>
        <p>
          Umstieg. ist ein nicht-kommerzielles, privates Projekt. Es werden keine
          Waren oder Dienstleistungen angeboten, es gibt keine Werbung und keine
          Bezahlfunktion.
        </p>

        <h2>Haftung für Inhalte und Links</h2>
        <p>
          Die Wegbeschreibungen entstehen automatisch aus OpenStreetMap-Daten und
          Fahrplandaten der Deutschen Bahn. Sie können unvollständig oder veraltet
          sein und ersetzen weder die Beschilderung im Bahnhof noch die Auskunft
          des Personals. Für die Erreichbarkeit eines Anschlusses wird keine Gewähr
          übernommen. Für Inhalte externer Links ist der jeweilige Anbieter
          verantwortlich.
        </p>

        <h2>Datenquellen und Lizenzen</h2>
        <p>
          Kartendaten: © OpenStreetMap-Mitwirkende, veröffentlicht unter der{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
            Open Database License (ODbL)
          </a>
          .
        </p>
        <p>
          Stations-, Fahrplan- und Anlagendaten stammen aus den Schnittstellen des
          DB API Marketplace der Deutschen Bahn und werden gemäß deren
          Nutzungsbedingungen verwendet. „DB" und „Deutsche Bahn" sind Marken der
          Deutschen Bahn AG. Dieses Angebot steht in keiner Verbindung zur
          Deutschen Bahn AG und wird von ihr weder betrieben noch unterstützt.
        </p>

        <h2>Streitbeilegung</h2>
        <p>
          Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle sind wir nicht verpflichtet und nicht
          bereit.
        </p>
      </div>

      <button type="button" className="knopf-sekundaer" onClick={onZurueck}>
        Zurück
      </button>
    </main>
  )
}
