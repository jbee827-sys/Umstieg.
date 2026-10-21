import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

/**
 * DER KOPF DER STARTSEITE.
 *
 * Seit dem 18.09.2026 steht dort das Lockup statt des Kickers und der
 * Textueberschrift. Beim Umbau fiel eine Luecke auf: `App.test.tsx` rendert
 * den Startbildschirm zwar, klickt sich aber in Zeile 85 sofort weiter zum
 * Dashboard - der Kopf selbst stand ohne eine einzige Zusicherung da. Ein
 * fehlendes, falsch benanntes oder vertipptes Lockup waere durch die ganze
 * Suite gerutscht, ohne einen Test rot zu faerben.
 *
 * Geprueft wird deshalb genau das, was oben zu sehen ist. Die Ueberschrift
 * wird ueber ihre ZUGAENGLICHE Bezeichnung gesucht, nicht ueber eine
 * CSS-Klasse: Damit haengt der Test daran, dass das `alt` des Bildes die
 * Wortmarke traegt - ohne das waere die Seite fuer einen Screenreader
 * ueberschriftslos, und genau das soll auffallen.
 */
vi.mock('./api/client', async () => {
  const echt = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    RouteFehler: echt.RouteFehler,
    holeRoute: vi.fn(),
    holeTafel: vi.fn(async () => ({ ok: true, eintraege: [] })),
  }
})

vi.mock('./api/orte', () => ({
  sucheOrte: vi.fn(),
  orteNahebei: vi.fn(async () => ({ ok: true, antwort: { orte: [], quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } } })),
}))

vi.mock('./api/sse', () => ({
  verbindeLive: () => () => undefined,
}))

describe('Kopf der Startseite', () => {
  it('zeigt das Lockup als Ueberschrift, nicht den alten Text', () => {
    render(<App />)

    // Eine h1 mit der Wortmarke als zugaenglicher Name - die kommt aus dem alt.
    const ueberschrift = screen.getByRole('heading', { level: 1, name: 'Umstieg.' })

    // Und sie zeigt das Bild, nicht Text.
    const bild = ueberschrift.querySelector('img')
    expect(bild).not.toBeNull()
    expect(bild?.getAttribute('src')).toBe('/lockup-zwei-gleise.png')
    // Daneben die Nachtfassung im Nachtrot (21.10.2026) - welche zu sehen
    // ist, entscheidet das CSS.
    const bilder = [...ueberschrift.querySelectorAll('img')].map((b) => b.getAttribute('src'))
    expect(bilder).toEqual(['/lockup-zwei-gleise.png', '/lockup-zwei-gleise-dunkel.png'])

    // Die Massangaben halten den Platz frei, bevor das Bild geladen ist.
    // Stimmen sie nicht mit der Datei ueberein, springt das Layout.
    expect(bild?.getAttribute('width')).toBe('1003')
    expect(bild?.getAttribute('height')).toBe('181')

    // Der ersetzte Text ist weg - sonst stuende die Wortmarke doppelt da.
    expect(screen.queryByText('Dein Umstieg')).toBeNull()

    // Der Untertitel bleibt.
    expect(screen.getByText(/Vom Ankunftsgleis zum Anschlusszug/)).toBeDefined()
  })
})
