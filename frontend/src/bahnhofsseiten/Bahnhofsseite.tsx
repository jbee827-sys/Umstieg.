import { Fusszeile } from '../components/Fusszeile'
import { BAHNHOF_PFAD, eingabeLink } from './adressen'
import {
  gehzeitText,
  gruppiereNachBuchstabe,
  laengsteUmstiege,
  minuten,
  standText,
  stufenfreiText,
  wegText,
} from './texte'
import type { Bahnhofsdaten, Gleispaar } from './typen'

/**
 * Inhalt der vorgerenderten Seiten (Konzept Nutzergewinnung AP 5b). Nur
 * fuer renderToStaticMarkup - keine Zustaende, keine Rueckrufe; ohne
 * JavaScript vollstaendig lesbar. Klassen in der Machart der App
 * (DESIGN.md 8), Stil in bahnhofsseiten.css.
 */
function Seitenkopf() {
  return (
    <header className="bs-kopf">
      {/* Hell- und Nachtfassung wie in der App (App.tsx, 21.10.2026); der
          Name steht deshalb am Link, nicht an den Bildern. */}
      <a href="/" className="bs-marke" aria-label="Umstieg.">
        <img className="lockup-hell" src="/lockup-zwei-gleise.png" alt="" width={1003} height={181} />
        <img className="lockup-dunkel" src="/lockup-zwei-gleise-dunkel.png" alt="" width={1003} height={181} />
      </a>
    </header>
  )
}

function minutenWort(sek: number): string {
  const m = minuten(sek)
  return m === 1 ? 'etwa 1 Minute' : `etwa ${m} Minuten`
}

/** Eigenstaendiger, lesbarer Absatz fuer Suche und KI (Konzept 5b.4). */
function LaengsteUmstiege({ d }: { d: Bahnhofsdaten }) {
  const [erster, ...weitere] = laengsteUmstiege(d.paare, 3)
  if (!erster) return null
  const weg = wegText(erster)
  return (
    <>
      <h2>Die längsten Umstiege</h2>
      <p className="bs-laengste">
      Am längsten dauert der Umstieg in {d.name} von Gleis {erster.von} nach Gleis {erster.nach}:{' '}
      {minutenWort(erster.sek!)}
      {weg !== '–' ? ` (${weg})` : ''}.
      {weitere.length > 0
        ? ` Danach folgen ${weitere
            .map((p) => `Gleis ${p.von} nach Gleis ${p.nach} (${minutenWort(p.sek!)})`)
            .join(' und ')}.`
        : ''}
      </p>
    </>
  )
}

function Zeile({ p }: { p: Gleispaar }) {
  return (
    <tr>
      <th scope="row">Gleis {p.nach}</th>
      <td>{gehzeitText(p)}</td>
      <td>{wegText(p)}</td>
      <td>{stufenfreiText(p)}</td>
    </tr>
  )
}

export function Bahnhofsseite({ d }: { d: Bahnhofsdaten }) {
  return (
    <>
      <Seitenkopf />
      <main className="bahnhofsseite">
        <h1>Umsteigen in {d.name}</h1>
        <p className="bs-einleitung">
          Gehzeiten zwischen {d.gleise.length} Gleisen, berechnet aus dem Bahnhofsplan, bei
          normalem Gehtempo ab Bahnsteigmitte.
        </p>
        <a className="bs-knopf" href={eingabeLink(d)}>
          Weg für meinen Umstieg anzeigen
        </a>

        <h2>Gehzeiten nach Ankunftsgleis</h2>
        {d.gleise.map((von) => (
          <details key={von} className="bs-gleis">
            <summary>Ankunft Gleis {von}</summary>
            <table className="bs-tabelle">
              <thead>
                <tr>
                  <th scope="col">Abfahrt</th>
                  <th scope="col">Gehzeit</th>
                  <th scope="col">Weg</th>
                  <th scope="col">Stufenfrei</th>
                </tr>
              </thead>
              <tbody>
                {d.paare
                  .filter((p) => p.von === von)
                  .map((p) => (
                    <Zeile key={p.nach} p={p} />
                  ))}
              </tbody>
            </table>
          </details>
        ))}

        <LaengsteUmstiege d={d} />

        <p className="bs-hinweis">
          Richtwerte. Mit Gepäck oder wenig Ortskenntnis mehr Zeit einplanen. Live-Lage,
          Gleiswechsel und Aufzugsstörungen zeigt die App.
        </p>
        <p className="bs-stand">
          Bahnhofsplan vom {standText(d.geholtAm)}. Kartendaten ©{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>.
        </p>
        <p>
          <a href="/bahnhoefe">Alle Bahnhöfe</a>
        </p>
        <Fusszeile />
      </main>
    </>
  )
}

/** /bahnhoefe - die zentrale interne Verlinkung, ueber die Suchmaschinen alle Seiten finden. */
export function Uebersicht({ alle }: { alle: Bahnhofsdaten[] }) {
  return (
    <>
      <Seitenkopf />
      <main className="bahnhofsseite">
        <h1>Umsteigezeiten für {alle.length} Bahnhöfe</h1>
        <p className="bs-einleitung">
          Gehzeiten von Gleis zu Gleis für große und mittlere Bahnhöfe in Deutschland, mit Treppen,
          Aufzügen und stufenfreien Wegen – berechnet aus dem Bahnhofsplan.
        </p>
        <a className="bs-knopf" href="/eingabe">
          Weg für meinen Umstieg anzeigen
        </a>
        {gruppiereNachBuchstabe(alle, (d) => d.name).map(([buchstabe, gruppe]) => (
          <section key={buchstabe} className="bs-buchstabe">
            <h2>{buchstabe}</h2>
            <ul className="bs-liste">
              {gruppe.map((d) => (
                <li key={d.slug}>
                  <a href={BAHNHOF_PFAD(d.slug)}>{d.name}</a>{' '}
                  <span className="bs-gleiszahl">· {d.gleise.length} Gleise</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="bs-stand">
          Kartendaten ©{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>.
        </p>
        <Fusszeile />
      </main>
    </>
  )
}
