import { Fusszeile } from '../components/Fusszeile'
import { BAHNHOF_PFAD, eingabeLink } from './adressen'
import {
  ABDECKUNG_SATZ,
  gehzeitText,
  gruppiereNachBuchstabe,
  laengsteUmstiege,
  minuten,
  standText,
  stufenfreiText,
  wegText,
} from './texte'
import type { Bahnhofsdaten, Gleispaar } from './typen'
import { fragen, kmText, ueberblickSaetze, type Nachbar } from './ueberblick'

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

/** Ein aufklappbarer Block: Tabelle der Wege von einem Gleis oder Steig zu den Zielgleisen. */
function Block({ titel, paare }: { titel: string; paare: Gleispaar[] }) {
  return (
    <details className="bs-gleis">
      <summary>{titel}</summary>
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
          {paare.map((p) => (
            <Zeile key={p.nach} p={p} />
          ))}
        </tbody>
      </table>
    </details>
  )
}

/**
 * Gehzeiten je Verkehrsart (Spec 6.2): Reiter Züge / S-Bahn / U-Bahn, jeweils
 * nur, wenn es die Art gibt; bei nur einer Art keine Leiste. Alle Felder stehen
 * im HTML, die inaktiven mit `hidden` - ohne JavaScript ist der erste Reiter
 * sichtbar, reiter.js schaltet um. Daten ohne `gleisArt`/`ubahn` (vor dem
 * 04.11.2026) ergeben nur „Züge“, die Seite sieht aus wie zuvor.
 */
function Gehzeiten({ d }: { d: Bahnhofsdaten }) {
  const sbahn = (g: string) => d.gleisArt?.[g] === 'sbahn'
  const ankunft = (gleise: string[]) =>
    gleise.map((von) => (
      <Block key={von} titel={`Ankunft Gleis ${von}`} paare={d.paare.filter((p) => p.von === von)} />
    ))
  const ubahn = d.ubahn ?? []
  const arten = [
    { id: 'zuege', name: 'Züge', da: d.gleise.some((g) => !sbahn(g)), inhalt: ankunft(d.gleise.filter((g) => !sbahn(g))) },
    { id: 'sbahn', name: 'S-Bahn', da: d.gleise.some(sbahn), inhalt: ankunft(d.gleise.filter(sbahn)) },
    {
      id: 'ubahn',
      name: 'U-Bahn',
      da: ubahn.length > 0,
      inhalt: ubahn.map((s) => <Block key={s.id} titel={`U-Bahn ${s.label}`} paare={s.paare} />),
    },
  ].filter((a) => a.da)

  if (arten.length < 2) return <>{arten[0]?.inhalt}</>
  return (
    <>
      <div className="bs-reiter" role="tablist" aria-label="Verkehrsart">
        {arten.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`bs-reiter-${a.id}`}
            aria-selected={i === 0}
            aria-controls={`bs-feld-${a.id}`}
            tabIndex={i === 0 ? 0 : -1}
          >
            {a.name}
          </button>
        ))}
      </div>
      {arten.map((a, i) => (
        <div
          key={a.id}
          role="tabpanel"
          id={`bs-feld-${a.id}`}
          aria-labelledby={`bs-reiter-${a.id}`}
          hidden={i !== 0}
        >
          {a.inhalt}
        </div>
      ))}
    </>
  )
}

/** Interne Verlinkung: jede Seite fuehrt zu ihren Nachbarn (26.10.2026). */
function InDerNaehe({ nachbarn }: { nachbarn: Nachbar[] }) {
  if (nachbarn.length === 0) return null
  return (
    <section className="bs-naehe">
      <h2>Bahnhöfe in der Nähe</h2>
      <ul className="bs-liste">
        {nachbarn.map((n) => (
          <li key={n.d.slug}>
            <a href={BAHNHOF_PFAD(n.d.slug)}>{n.d.name}</a>{' '}
            <span className="bs-gleiszahl">· {kmText(n.km)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Bahnhofsseite({ d, nachbarn }: { d: Bahnhofsdaten; nachbarn: Nachbar[] }) {
  return (
    <>
      <Seitenkopf />
      <main className="bahnhofsseite">
        <h1>Umsteigen in {d.name}</h1>
        <p className="bs-einleitung">
          Gehzeiten zwischen {d.gleise.length} Gleisen, berechnet aus dem Bahnhofsplan, bei
          normalem Gehtempo ab Bahnsteigmitte.
        </p>
        {/* Der Knopf bleibt oben - die meisten Besucher kommen ueber diese Seiten (Julian, 26.10.2026). */}
        <a className="bs-knopf" href={eingabeLink(d)}>
          Weg anzeigen
        </a>
        <p className="bs-abdeckung">{ABDECKUNG_SATZ}</p>

        <h2>Der Bahnhof im Überblick</h2>
        <p className="bs-ueberblick">{ueberblickSaetze(d).join(' ')}</p>

        <h2>Gehzeiten nach Ankunftsgleis</h2>
        <Gehzeiten d={d} />

        <LaengsteUmstiege d={d} />

        <h2>Häufige Fragen</h2>
        {fragen(d).map((f) => (
          <div key={f.frage} className="bs-frage">
            <h3>{f.frage}</h3>
            <p>{f.antwort}</p>
          </div>
        ))}

        <p className="bs-hinweis">
          Richtwerte. Mit Gepäck oder wenig Ortskenntnis mehr Zeit einplanen. Live-Lage und
          Gleiswechsel zeigt die App, Aufzugsstörungen nur, wo die Bahn sie meldet.
        </p>
        <InDerNaehe nachbarn={nachbarn} />
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
          Weg anzeigen
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
