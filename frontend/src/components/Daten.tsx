/*
 * „Daten“ (Julian, 21.10.2026): Quellcode, Bahnhofsliste, Transitous und die
 * uebrigen Quellen auf einer Seite. Bis dahin standen Quellcode, Bahnhoefe
 * und die Quellenzeile verstreut in der Fusszeile.
 *
 * Der Link zum Quellcode erfuellt § 13 AGPL: Wer die App ueber das Netz
 * nutzt, muss den Quellcode der laufenden Fassung erreichen koennen - die
 * Fusszeile fuehrt von jeder Seite mit einem Schritt hierher.
 */
export const QUELLCODE_URL = 'https://github.com/jbee827-sys/Umstieg.'

const extern = { target: '_blank', rel: 'noopener noreferrer' } as const

export function Daten({ onZurueck }: { onZurueck?: () => void }) {
  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Daten und Quellen</h1>
      </header>
      <hr className="trennlinie" />

      <div className="rechtstext">
        <h2>Umsteigezeiten aller Bahnhöfe</h2>
        <p>
          Gehzeiten von Gleis zu Gleis für große und mittlere Bahnhöfe, berechnet aus dem
          Bahnhofsplan: <a href="/bahnhoefe">Umsteigezeiten aller Bahnhöfe</a>.
        </p>

        <h2>Quellcode</h2>
        <p>
          Umstieg. ist quelloffen, Lizenz AGPL-3.0-only:{' '}
          <a href={QUELLCODE_URL} {...extern}>
            Quellcode auf GitHub
          </a>
          .
        </p>

        <h2>Fahrplan- und Haltestellendaten</h2>
        <p>
          Haltestellen, ihre Abfahrten und Ankünfte und die Wege zwischen zwei Steigen kommen
          über die offene Schnittstelle von Transitous. Welche Quelle welche Daten liefert, nennt
          die{' '}
          <a href="https://transitous.org/sources" {...extern}>
            Quellenliste von Transitous
          </a>
          . Für Deutschland sind das vor allem die Daten der DELFI e. V. – Fahrpläne unter
          CC BY 4.0, Echtzeitdaten unter CC BY-SA 4.0.
        </p>
        <p>
          Bahnhöfe, Zugfahrpläne und der Zustand von Aufzügen stammen aus den Schnittstellen des
          DB API Marketplace der Deutschen Bahn.
        </p>

        <h2>Kartendaten</h2>
        <p>
          Bahnhofspläne, Wege und Karten: © OpenStreetMap-Mitwirkende, veröffentlicht unter der{' '}
          <a href="https://www.openstreetmap.org/copyright" {...extern}>
            Open Database License (ODbL)
          </a>
          .
        </p>
      </div>

      {/* Vorgerendert (ohne Rueckruf) ein Link - ohne JavaScript taete ein Knopf nichts. */}
      {onZurueck ? (
        <button type="button" className="knopf-sekundaer" onClick={onZurueck}>
          Zurück
        </button>
      ) : (
        <a className="knopf-sekundaer" href="/">
          Zur Startseite
        </a>
      )}
    </main>
  )
}
